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

function store() {
  const entries = new Map();
  const cache = {
    match: async url => entries.has(String(url)) ? new Response(entries.get(String(url))) : undefined,
    put: async (url, response) => { entries.set(String(url), await response.text()); },
    delete: async url => entries.delete(String(url)),
    keys: async () => [...entries.keys()].map(url => ({url}))};
  return {entries, caches: {open: async () => cache}};
}

function client({entries, caches}, liveManifest) {
  const sandbox = {caches, Response, URL, JSON, Date, Set, Object, console, navigator: {},
    fetch: async () => liveManifest ? new Response(JSON.stringify(liveManifest), {status: 200}) : (() => { throw new Error('offline'); })(),
    S: {bracket: 'gold'}, site: {}, connectionLost: false, APP_CONFIG: {manifest: 'manifest.json'},
    siteURL: value => new URL(value, SITE).toString(), publicationBytes: (entry, url) => url === entry.url};
  vm.runInNewContext(SOURCE.slice(start, end) + '\nthis.commitNow = commitNow; this.olderPublication = olderPublication;', sandbox);
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
