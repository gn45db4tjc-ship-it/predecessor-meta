'use strict';
/* PRED-M11 (Codex audit #239 F16): an older tab must not replace a newer saved publication.
   One tab fetched the old manifest just before a deploy and reached the shared offline store after another tab had
   saved the new one. Even with serialized writes, the old tab overwrote the saved manifest and deleted the newer
   bundle, so the next offline launch served the older publication. commitNow now refuses an older publication unless
   the site itself serves it again (a verified rollback). The saving code runs here in a sandbox with an in-memory store. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'static_client.js'), 'utf8').replace(/\r\n/g, '\n');
const SITE = 'https://example.test/predecessor-meta/';
const start = SOURCE.indexOf("  const DATA_CACHE = 'predecessor-meta-data-v1';"), end = SOURCE.indexOf('  // ---- Evidence annexes');
assert.ok(start > 0 && end > start, 'the offline saving code was found');
const siteStart = SOURCE.indexOf('  function siteURL(path) {'), SITE_URL = SOURCE.slice(siteStart, SOURCE.indexOf('\n  }\n', siteStart) + 4);
assert.ok(siteStart > 0 && /Invalid publication path/.test(SITE_URL), 'the page siteURL was found');

function store() {
  // Like the Cache API, the store keeps each response's headers with its body; `entries` maps an address to the body.
  const entries = new Map(), headers = new Map();
  const cache = {
    match: async url => entries.has(String(url)) ? new Response(entries.get(String(url)), {headers: headers.get(String(url))}) : undefined,
    put: async (url, response) => { headers.set(String(url), [...response.headers]); entries.set(String(url), await response.text()); },
    delete: async url => entries.delete(String(url)),
    keys: async () => [...entries.keys()].map(url => ({url}))};
  return {entries, caches: {open: async () => cache}};
}

function client(shared, liveManifest, beforePut = null) {
  // beforePut lets a test hold one tab at a chosen write while another tab runs (an interleaving without Web Locks).
  const caches = !beforePut ? shared.caches : {open: async name => {
    const cache = await shared.caches.open(name);
    return {...cache, put: async (url, response) => { await beforePut(String(url)); return cache.put(url, response); }};
  }};
  const sandbox = {caches, Response, URL, JSON, Date, Set, Object, console, navigator: {},
    fetch: async () => liveManifest ? new Response(JSON.stringify(liveManifest), {status: 200}) : (() => { throw new Error('offline'); })(),
    S: {bracket: 'gold'}, site: {}, connectionLost: false, APP_CONFIG: {manifest: 'manifest.json'},
    baseURL: SITE, publicationBytes: (entry, url) => url === entry.url};
  // The page's own siteURL, which accepts only published paths (Codex review of #241 at bbed6ae: a stand-in that
  // accepted any path hid that the manifest copies could not be saved at all).
  vm.runInNewContext(SITE_URL + '\n' + SOURCE.slice(start, end) + '\nthis.commitNow = commitNow; this.olderPublication = olderPublication; this.serialCommit = typeof serialCommit === "function" ? serialCommit : undefined;', sandbox);
  return sandbox;
}

const sha = c => c.repeat(64);
function publication(stamp, c) {
  const entry = {status: 'available', sha256: sha(c), url: 'bundles/gold-' + sha(c) + '.json', generated_at: stamp};
  return {manifest: {published_at: stamp, cohorts: {gold: entry}}, entry, loaded: {url: entry.url, bytes: '{"bundle":"' + c + '"}'}};
}

test('F16: an older publication never overwrites a newer one another tab saved', async () => {
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), older = publication('2026-11-27T08:23:00Z', 'a');
  const tabB = client(shared, newer.manifest), tabA = client(shared, newer.manifest);
  assert.equal(await tabB.commitNow(newer.manifest, 'gold', newer.entry, newer.loaded), true);
  assert.equal(await tabA.commitNow(older.manifest, 'gold', older.entry, older.loaded), 'superseded');
  const saved = JSON.parse(shared.entries.get(SITE + 'manifest.json'));
  assert.equal(saved.published_at, newer.manifest.published_at);
  assert.ok(shared.entries.has(SITE + newer.entry.url), 'the newer bundle is still saved');
  assert.ok(!shared.entries.has(SITE + older.entry.url), 'the older bundle was not written beside it');
});

test('F16: a verified online rollback is saved', async () => {
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), rolledBack = publication('2026-11-27T08:23:00Z', 'a');
  await client(shared, newer.manifest).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
  const tab = client(shared, rolledBack.manifest);   // the site now serves the older publication again
  assert.equal(await tab.commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded), true);
  assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, rolledBack.manifest.published_at);
  const copies = [...shared.entries.keys()].filter(url => url.includes('/saved-manifests/'));
  assert.deepEqual(copies.map(url => JSON.parse(shared.entries.get(url)).published_at), [rolledBack.manifest.published_at],
    'the newer copy is removed, so no later read brings the newer publication back');
});

test('F16: offline, an older publication is refused', async () => {
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), older = publication('2026-11-27T08:23:00Z', 'a');
  await client(shared, newer.manifest).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
  assert.equal(await client(shared, null).commitNow(older.manifest, 'gold', older.entry, older.loaded), 'superseded');
});

test('F16: equal or undated publications are not "older"', () => {
  const {olderPublication} = client(store(), null);
  assert.equal(olderPublication({published_at: '2026-11-27T09:00:00Z'}, {published_at: '2026-11-27T09:00:00Z'}), false);
  assert.equal(olderPublication({}, {published_at: '2026-11-27T09:00:00Z'}), false);
  assert.equal(olderPublication({published_at: '2026-11-27T08:00:00Z'}, null), false);
});

test('F16: without Web Locks, overlapping commits never leave the older publication saved', async () => {
  // Two tabs, no navigator.locks: both read the empty saved manifest before either writes. The older one must not
  // replace the newer save or delete the newer bundle, whichever order their writes land in.
  for (const first of ['newer', 'older']) {
    const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), older = publication('2026-11-27T08:23:00Z', 'a');
    const tabNew = client(shared, newer.manifest), tabOld = client(shared, newer.manifest);
    const runNew = () => tabNew.commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
    const runOld = () => tabOld.commitNow(older.manifest, 'gold', older.entry, older.loaded);
    await Promise.all(first === 'newer' ? [runNew(), runOld()] : [runOld(), runNew()]);
    const saved = JSON.parse(shared.entries.get(SITE + 'manifest.json'));
    assert.equal(saved.published_at, newer.manifest.published_at, first + ' first: the newer manifest is saved');
    assert.ok(shared.entries.has(SITE + newer.entry.url), first + ' first: the newer bundle is still saved');
  }
});

test('F16: without Web Locks, one tab runs its own commits one at a time', async () => {
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), older = publication('2026-11-27T08:23:00Z', 'a');
  const tab = client(shared, newer.manifest);
  let running = 0, most = 0;
  const original = tab.commitNow;
  tab.commitNow = async (...args) => { running++; most = Math.max(most, running); try { return await original(...args); } finally { running--; } };
  await Promise.all([tab.serialCommit(() => tab.commitNow(newer.manifest, 'gold', newer.entry, newer.loaded)),
    tab.serialCommit(() => tab.commitNow(older.manifest, 'gold', older.entry, older.loaded))]);
  assert.equal(most, 1, 'the second commit waited for the first');
  assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, newer.manifest.published_at);
});

test('F16: a rank unchanged in a newer saved publication is still saved for offline use', async () => {
  // Codex review of #241 at 2519bdc: tab A loaded Gold from P1 while tab B saved Silver from the newer P2, and P2
  // lists exactly the same Gold bundle. The newer manifest stands, and Gold's verified bytes are saved under it.
  const shared = store(), gold = publication('2026-11-27T08:23:00Z', 'a');
  const silverEntry = {status: 'available', sha256: sha('c'), url: 'bundles/silver-' + sha('c') + '.json', generated_at: '2026-11-27T09:23:00Z'};
  const newer = {published_at: '2026-11-27T09:23:00Z', cohorts: {gold: gold.entry, silver: silverEntry}};
  const older = {published_at: gold.manifest.published_at, cohorts: {gold: gold.entry, silver: silverEntry}};
  const tabB = client(shared, newer), tabA = client(shared, newer);
  tabB.S.bracket = 'silver';
  assert.equal(await tabB.commitNow(newer, 'silver', silverEntry, {url: silverEntry.url, bytes: '{"bundle":"c"}'}), true);
  assert.equal(await tabA.commitNow(older, 'gold', gold.entry, gold.loaded), true, 'the unchanged rank counts as saved');
  assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, newer.published_at, 'the newer manifest stands');
  assert.ok(shared.entries.has(SITE + gold.entry.url), 'the Gold bundle the newer manifest describes is saved');
  assert.ok(shared.entries.has(SITE + silverEntry.url), 'the Silver bundle is still saved');
});

test('F16: a changed rank from an older publication is still refused and not saved', async () => {
  const shared = store(), oldGold = publication('2026-11-27T08:23:00Z', 'a'), newGold = publication('2026-11-27T09:23:00Z', 'b');
  await client(shared, newGold.manifest).commitNow(newGold.manifest, 'gold', newGold.entry, newGold.loaded);
  assert.equal(await client(shared, newGold.manifest).commitNow(oldGold.manifest, 'gold', oldGold.entry, oldGold.loaded), 'superseded');
  assert.ok(!shared.entries.has(SITE + oldGold.entry.url));
});

test('F16: without Web Locks, an older tab that writes after the newer tab finished never stands', async () => {
  // Muse review of #241 at ce4997e: the older tab checked the saved manifest, the newer tab then saved, checked and
  // pruned, and only after that did the older tab write. Its manifest used to stand, with its bundle kept.
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), older = publication('2026-11-27T08:23:00Z', 'a');
  let reached, release;
  const atWrite = new Promise(resolve => { reached = resolve; }), go = new Promise(resolve => { release = resolve; });
  const hold = async url => { if (url.includes('/saved-manifests/') || url === SITE + 'manifest.json') { reached(); await go; } };
  const tabOld = client(shared, newer.manifest, hold), tabNew = client(shared, newer.manifest);
  const oldRun = tabOld.commitNow(older.manifest, 'gold', older.entry, older.loaded);
  await atWrite;                                   // the older tab has passed every check and is about to write
  assert.equal(await tabNew.commitNow(newer.manifest, 'gold', newer.entry, newer.loaded), true);
  release();
  assert.equal(await oldRun, 'superseded');
  assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, newer.manifest.published_at, 'the main copy is the newer one');
  assert.ok(shared.entries.has(SITE + newer.entry.url), 'the newer bundle is still saved');
  assert.ok(!shared.entries.has(SITE + older.entry.url), 'the older tab took its own bundle back');
  const copies = [...shared.entries.keys()].filter(url => url.includes('/saved-manifests/'));
  assert.deepEqual(copies.map(url => JSON.parse(shared.entries.get(url)).published_at), [newer.manifest.published_at]);
});

test('F16: a manifest copy is named by its publication and never overwritten by another', async () => {
  const shared = store(), first = publication('2026-11-27T08:23:00Z', 'a'), second = publication('2026-11-27T09:23:00Z', 'b');
  const tab = client(shared, null);
  await tab.commitNow(first.manifest, 'gold', first.entry, first.loaded);
  await tab.commitNow(second.manifest, 'gold', second.entry, second.loaded);
  const copies = [...shared.entries.keys()].filter(url => url.includes('/saved-manifests/'));
  assert.deepEqual(copies, [SITE + 'saved-manifests/2026-11-27T09-23-00Z.json'], 'the older copy is pruned by the newer save');
});

test('F16: a stale tab holding the withdrawn newer publication cannot undo a saved rollback', async () => {
  // Muse review of #241 at a3498fc: the live check ran only for an older incoming publication, so after a verified
  // rollback a tab still holding the newer, no longer served, publication overwrote it unchecked.
  const newer = publication('2026-11-27T09:23:00Z', 'b'), rolledBack = publication('2026-11-27T08:23:00Z', 'a');
  for (const live of [rolledBack.manifest, null]) {   // the site serves the rollback, or the stale tab is offline
    const shared = store();
    await client(shared, newer.manifest).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
    assert.equal(await client(shared, rolledBack.manifest).commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded), true);
    const marked = JSON.parse(shared.entries.get(SITE + 'manifest.json'));
    assert.deepEqual(marked.saved_rollback, {withdrawn: newer.manifest.published_at}, 'the rollback names what it withdrew');
    assert.equal(await client(shared, live).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded), 'superseded', live ? 'online' : 'offline');
    assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, rolledBack.manifest.published_at);
    assert.ok(shared.entries.has(SITE + rolledBack.entry.url), 'the rolled-back bundle is still saved');
    assert.ok(!shared.entries.has(SITE + newer.entry.url), 'the withdrawn bundle was not saved again');
  }
});

test('F16: after a rollback, a re-save keeps its mark and a new release replaces it', async () => {
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), rolledBack = publication('2026-11-27T08:23:00Z', 'a');
  const next = publication('2026-11-27T10:23:00Z', 'c');
  await client(shared, newer.manifest).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
  await client(shared, rolledBack.manifest).commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded);
  assert.equal(await client(shared, null).commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded), true);
  assert.deepEqual(JSON.parse(shared.entries.get(SITE + 'manifest.json')).saved_rollback, {withdrawn: newer.manifest.published_at});
  // The site was withdrawn back while it was being served again by a stale tab that is now served: it saves.
  assert.equal(await client(shared, newer.manifest).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded), true, 'a served re-release saves');
  assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).saved_rollback, undefined);
  await client(shared, rolledBack.manifest).commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded);
  assert.equal(await client(shared, null).commitNow(next.manifest, 'gold', next.entry, next.loaded), true, 'a release newer than the withdrawn one saves offline');
  const saved = JSON.parse(shared.entries.get(SITE + 'manifest.json'));
  assert.equal(saved.published_at, next.manifest.published_at);
  assert.equal(saved.saved_rollback, undefined);
});

test('F16: a rollback that lands between a tab\'s copy and main writes still stands', async () => {
  // Muse review of #241 at 0634819: write() puts this publication's copy, then the main manifest. A verified
  // rollback that completed between the two had its main copy overwritten by the withdrawn publication.
  const shared = store(), newer = publication('2026-11-27T09:23:00Z', 'b'), rolledBack = publication('2026-11-27T08:23:00Z', 'a');
  let reached, release;
  const atMain = new Promise(resolve => { reached = resolve; }), go = new Promise(resolve => { release = resolve; });
  const hold = async url => { if (url === SITE + 'manifest.json') { reached(); await go; } };
  const stale = client(shared, rolledBack.manifest, hold);   // the site already serves the rollback again
  const staleRun = stale.commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
  await atMain;                                    // its copy is written; its main write waits
  assert.equal(await client(shared, rolledBack.manifest).commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded), true);
  release();
  assert.equal(await staleRun, 'superseded');
  assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, rolledBack.manifest.published_at, 'the rollback stands');
  assert.ok(shared.entries.has(SITE + rolledBack.entry.url), 'the rolled-back bundle is still saved');
  assert.ok(!shared.entries.has(SITE + newer.entry.url), 'the withdrawn bundle was taken back');
  const copies = [...shared.entries.keys()].filter(url => url.includes('/saved-manifests/'));
  assert.deepEqual(copies.map(url => JSON.parse(shared.entries.get(url)).published_at), [rolledBack.manifest.published_at]);
});

test('F16: a stale tab that runs while the rollback tab is paused before its main write cannot undo it', async () => {
  // Muse review of #241 at 54c017c: the rollback tab had written its copy (marked saved_rollback.withdrawn) but not
  // main; the stale tab saw only the date-newest manifest, the withdrawn one, and wrote over the rollback.
  const newer = publication('2026-11-27T09:23:00Z', 'b'), rolledBack = publication('2026-11-27T08:23:00Z', 'a');
  for (const live of [rolledBack.manifest, null]) {
    const shared = store();
    await client(shared, newer.manifest).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded);
    let reached, release;
    const atMain = new Promise(resolve => { reached = resolve; }), go = new Promise(resolve => { release = resolve; });
    const hold = async url => { if (url === SITE + 'manifest.json') { reached(); await go; } };
    const rollbackRun = client(shared, rolledBack.manifest, hold).commitNow(rolledBack.manifest, 'gold', rolledBack.entry, rolledBack.loaded);
    await atMain;                                  // the rollback's copy is written; its main write waits
    assert.equal(await client(shared, live).commitNow(newer.manifest, 'gold', newer.entry, newer.loaded), 'superseded', live ? 'online' : 'offline');
    release();
    assert.equal(await rollbackRun, true);
    assert.equal(JSON.parse(shared.entries.get(SITE + 'manifest.json')).published_at, rolledBack.manifest.published_at, 'the rollback stands');
    assert.ok(shared.entries.has(SITE + rolledBack.entry.url), 'the rolled-back bundle is still saved');
    assert.ok(!shared.entries.has(SITE + newer.entry.url), 'the withdrawn bundle is gone');
  }
});
