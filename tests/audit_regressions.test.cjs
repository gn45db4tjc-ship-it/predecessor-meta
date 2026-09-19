'use strict';
/* Reproductions for the 2.23.0 audit that need no browser: stale evidence (I) and the
   offline cache lifecycle (F). Each reproduction asserts the CORRECT behaviour. While its
   defect is open it is wrapped in knownDefect(), which passes only while the reproduction still
   fails an assertion and FAILS the run once it passes (like Python's expectedFailure), so a fixed
   defect cannot keep its marker and a marker cannot hide a regression. Tests without it are guards
   that pass today and must keep passing. Every number is a synthetic fixture. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Meta = require('../engine.js');

/* A recorded open defect. Only an assertion failure counts as reproducing it; any other error means the
   harness broke and fails the run. */
function knownDefect(name, reason, fn) {
  test(name + ' [recorded open: ' + reason + ']', async () => {
    let reproduced = false;
    try { await fn(); } catch (error) { if (!(error instanceof assert.AssertionError)) throw error; reproduced = true; }
    assert.ok(reproduced, 'This recorded defect no longer reproduces. Remove its knownDefect() marker in the change that fixed it.');
  });
}

/* ---------------- I: a source date that only has to parse ---------------- */
const NOW = Date.parse('2026-09-18T12:00:00Z');
function statzBundle(fetched) {
  return {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {},
    heroes: {example: {slug: 'example', display_name: 'Synthetic fixture', roles_order: ['jungle'],
      roles: {jungle: {status: 'ok', tier: 'A', winRate: 52, pickRate: 5, playedGames: 400}}}},
    official: {status: 'verified', live: {version: '1.16.4'}},
    sources: {statz_tierlist: {status: 'ok', fetched_at: fetched}, statz_hero_pages: {status: 'ok', fetched_at: fetched}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', builds: []}};
}
const withoutDate = policy => ({...policy, fetched_at: undefined});

test('I: eight-month-old statistics are not presented like statistics fetched an hour ago', () => {
  const fresh = Meta.create(statzBundle(new Date(NOW - 3600000).toISOString())).performancePolicy({now: NOW});
  const old = Meta.create(statzBundle('2026-01-10T12:00:00Z')).performancePolicy({now: NOW});
  assert.notDeepEqual(withoutDate(old), withoutDate(fresh), 'apart from the date itself, the two policies are indistinguishable');
  assert.equal(fresh.currency, 'current');
  assert.equal(old.currency, 'stale');
});

test('I guard: saved observations stay available with their original values and date', () => {
  const b = statzBundle('2026-01-10T12:00:00Z'), before = JSON.stringify(b);
  const seen = Meta.create(b).performance({slug: 'example', role: 'jungle'}, {source: 'statz'});
  assert.equal(seen.wr, 52); assert.equal(seen.played, 400); assert.equal(seen.fetched_at, '2026-01-10T12:00:00Z');
  assert.equal(JSON.stringify(b), before, 'the engine must never rewrite observations or dates');
});

/* ---------------- F: offline cache lifecycle (sw.js in a sandbox) ---------------- */
const crypto = require('node:crypto');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const SITE = 'https://example.test/predecessor-meta/';
const BRACKETS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'paragon'];
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const bundleBody = (bracket, note = '') => JSON.stringify({schema: 3, bracket: {segment: bracket}, generated_at: '2026-09-14T17:20:20-05:00', sources: {statz_tierlist: {status: 'ok', fetched_at: '2026-09-14T17:19:00-05:00'}}, note});
const bundleURL = (bracket, body) => SITE + 'bundles/' + bracket + '-' + digest(body) + '.json';
const urlOf = key => typeof key === 'string' ? new URL(key, SITE).href : key.url;

/* Like the real Cache API: every match returns a fresh, readable Response. */
function cacheStorage() {
  const stores = new Map();
  const fresh = hit => hit && new Response(hit.body, {status: hit.status, headers: hit.headers});
  const view = name => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name); return {
    async put(request, response) { m.set(urlOf(request), {body: Buffer.from(await response.arrayBuffer()), status: response.status, headers: [...response.headers]}); },
    async addAll(list) { for (const item of list) m.set(urlOf(String(item)), {body: Buffer.from('shell'), status: 200, headers: []}); },
    async keys() { return [...m.keys()].map(url => ({url})); },
    async delete(key) { return m.delete(urlOf(key)); },
    async match(request) { return fresh(m.get(urlOf(request))); }}; };
  return {stores, open: async name => view(name), keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
    async match(request) { for (const m of stores.values()) { const hit = m.get(urlOf(request)); if (hit) return fresh(hit); } }};
}
function worker(source, storage, network) {
  const listeners = {}, self = {location: {href: SITE + 'sw.js'}, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting() {}, clients: {claim: async () => {}}};
  vm.runInNewContext(source, {self, caches: storage, fetch: request => network(request), crypto: crypto.webcrypto, TextDecoder, URL, Request, Response, Headers, console: {warn() {}, log() {}}});
  const lifecycle = async type => { let pending = Promise.resolve(); listeners[type]?.({waitUntil: p => { pending = p; }}); await pending; };
  return {install: () => lifecycle('install'), activate: () => lifecycle('activate'),
    async fetch(url) { let reply; listeners.fetch({request: new Request(url), respondWith: p => { reply = p; }}); return reply; }};
}
/* The next release: only the release-specific cache name changes. The data cache keeps its name. */
const nextRelease = source => source.replace(/(const SHELL_CACHE = ')([^']+)(')/, '$1$2-next$3');
const DATA = (SW.match(/const DATA_CACHE = '([^']+)'/) || [])[1], SHELL_NAME = (SW.match(/const SHELL_CACHE = '([^']+)'/) || [])[1];
const stored = async (storage, url) => !!(await storage.match(new Request(url)));
const offline = async () => { throw new Error('offline'); };
/* What the page does after it has verified a bundle (static_client.js, commitPublication). */
async function pageCommits(storage, bracket, body) {
  const url = bundleURL(bracket, body);
  await (await storage.open(DATA)).put(new Request(url), new Response(body));
  return url;
}

test('F: the worker declares a permanent data cache separate from the release shell', () => {
  assert.ok(DATA && SHELL_NAME && DATA !== SHELL_NAME);
  assert.doesNotMatch(DATA, /\d+[-.]\d+/, 'the data cache name must not carry a release number');
});

test('F: activating the next release keeps the brackets saved for offline use', async () => {
  const storage = cacheStorage(), first = worker(SW, storage, offline);
  await first.install(); await first.activate();
  const saved = await pageCommits(storage, 'gold', bundleBody('gold'));
  const next = worker(nextRelease(SW), storage, offline);
  await next.install(); await next.activate();
  assert.ok(await stored(storage, saved), 'the saved bracket was deleted when the new release activated');
  assert.ok(!(await storage.keys()).includes(SHELL_NAME), 'the previous release shell should be removed');
});

test('F: all six saved brackets survive a release and are served offline afterwards', async () => {
  const storage = cacheStorage(), first = worker(SW, storage, offline);
  await first.install(); await first.activate();
  const saved = []; for (const bracket of BRACKETS) saved.push(await pageCommits(storage, bracket, bundleBody(bracket)));
  const next = worker(nextRelease(SW), storage, offline);
  await next.install(); await next.activate();
  for (const [index, url] of saved.entries()) {
    const reply = await next.fetch(url);
    assert.equal(reply.headers.get('X-Predecessor-Cache'), 'offline');
    assert.equal(JSON.parse(await reply.text()).bracket.segment, BRACKETS[index]);
  }
});

test('F: a malformed HTTP 200 bundle never evicts the last verified bracket, and is never stored', async () => {
  const storage = cacheStorage(), sw = worker(SW, storage, async () => new Response('<html>captive portal</html>', {status: 200}));
  await sw.install(); await sw.activate();
  const saved = await pageCommits(storage, 'gold', bundleBody('gold')), portal = bundleURL('gold', 'newer bundle the portal intercepted');
  await (await sw.fetch(portal))?.text();
  assert.ok(await stored(storage, saved), 'an unverified response replaced the verified gold bundle');
  assert.ok(!await stored(storage, portal), 'the worker stored a data response it cannot verify');
  await (await sw.fetch(SITE + 'manifest.json'))?.text();
  assert.ok(!await stored(storage, SITE + 'manifest.json'), 'the worker stored a manifest; only the page may, after validation');
});

test('F: brackets saved by an older release are moved once, verified by their own checksum', async () => {
  const storage = cacheStorage(), legacy = await storage.open('predecessor-meta-v2-23');
  const gold = bundleBody('gold'), silverOld = bundleBody('silver', 'older'), damaged = bundleURL('diamond', bundleBody('diamond'));
  await legacy.put(new Request(bundleURL('gold', gold)), new Response(gold));
  await legacy.put(new Request(bundleURL('silver', silverOld)), new Response(silverOld));
  await legacy.put(new Request(damaged), new Response('<html>captive portal</html>'));
  await legacy.put(new Request(SITE), new Response('old shell'));
  // The legacy manifest had moved on for silver (a newer bundle that was never downloaded) and lists the damaged diamond.
  const manifest = {schema: 2, published_at: '2026-09-15T10:00:00Z', cohorts: {
    gold: {label: 'Gold+', status: 'available', sha256: digest(gold), url: 'bundles/gold-' + digest(gold) + '.json', generated_at: '2026-09-14T17:20:20-05:00'},
    silver: {label: 'Silver+', status: 'available', sha256: 'b'.repeat(64), url: 'bundles/silver-' + 'b'.repeat(64) + '.json', generated_at: '2026-09-15T09:00:00Z'},
    diamond: {label: 'Diamond+', status: 'available', sha256: digest(bundleBody('diamond')), url: 'bundles/diamond-' + digest(bundleBody('diamond')) + '.json', generated_at: '2026-09-14T17:15:24-05:00'},
    paragon: {label: 'Paragon+', status: 'unavailable'}}};
  await legacy.put(new Request(SITE + 'manifest.json'), new Response(JSON.stringify(manifest)));
  const sw = worker(SW, storage, offline);
  await sw.install(); await sw.activate();
  assert.ok(!(await storage.keys()).includes('predecessor-meta-v2-23'), 'the legacy cache is removed after the move');
  const data = await storage.open(DATA);
  assert.ok(await data.match(new Request(bundleURL('gold', gold))));
  assert.ok(await data.match(new Request(bundleURL('silver', silverOld))));
  assert.equal(await data.match(new Request(damaged)), undefined, 'a bundle that fails its own checksum is not moved');
  const moved = await (await data.match(new Request(SITE + 'manifest.json'))).json();
  assert.equal(moved.cohorts.gold.sha256, digest(gold));
  assert.deepEqual([moved.cohorts.silver.sha256, moved.cohorts.silver.generated_at, moved.cohorts.silver.saved_copy], [digest(silverOld), '2026-09-14T17:20:20-05:00', true], 'the saved manifest describes the silver bundle that is actually saved, with its own date');
  assert.equal(moved.cohorts.silver.source_signature, 'unverified-saved-copy', 'an older saved bundle is never presented as matching the current patch');
  assert.deepEqual(moved.cohorts.diamond, manifest.cohorts.diamond, 'nothing usable was saved for diamond, so its entry stays as published');
  assert.equal(JSON.parse(await (await sw.fetch(bundleURL('silver', silverOld))).text()).note, 'older');
});

test('F: when the page saved its manifest before the move, the move still reconciles it with what is saved', async () => {
  const storage = cacheStorage(), gold = bundleBody('gold'), silverOld = bundleBody('silver', 'older'), data = await storage.open(DATA);
  // The page (new release) has already saved gold and today's manifest, which points at a silver bundle that was never downloaded.
  await pageCommits(storage, 'gold', gold);
  const today = {schema: 2, published_at: '2026-09-18T10:00:00Z', cohorts: {
    gold: {label: 'Gold+', status: 'available', sha256: digest(gold), url: 'bundles/gold-' + digest(gold) + '.json', generated_at: '2026-09-14T17:20:20-05:00', source_signature: 'sig-today'},
    silver: {label: 'Silver+', status: 'available', sha256: 'b'.repeat(64), url: 'bundles/silver-' + 'b'.repeat(64) + '.json', generated_at: '2026-09-18T09:00:00Z', source_signature: 'sig-today'}}};
  await data.put(new Request(SITE + 'manifest.json'), new Response(JSON.stringify(today)));
  const legacy = await storage.open('predecessor-meta-v2-23'), then = JSON.parse(JSON.stringify(today));
  then.cohorts.silver = {label: 'Silver+', status: 'available', sha256: digest(silverOld), url: 'bundles/silver-' + digest(silverOld) + '.json', generated_at: '2026-09-14T17:20:20-05:00', source_signature: 'sig-then'};
  await legacy.put(new Request(bundleURL('silver', silverOld)), new Response(silverOld));
  await legacy.put(new Request(SITE + 'manifest.json'), new Response(JSON.stringify(then)));
  const sw = worker(SW, storage, offline);
  await sw.install(); await sw.activate();
  const moved = await (await data.match(new Request(SITE + 'manifest.json'))).json();
  assert.deepEqual(moved.cohorts.gold, today.cohorts.gold, 'an entry whose bundle is saved is left exactly as the page wrote it');
  assert.deepEqual(moved.cohorts.silver, {...then.cohorts.silver, saved_copy: true}, 'the entry that matches the saved silver bundle is used verbatim, signature included');
  const reply = await sw.fetch(SITE + moved.cohorts.silver.url);
  assert.equal(JSON.parse(await reply.text()).note, 'older');
});

test('F: the move never overwrites newer data the page already saved, and a second activation changes nothing', async () => {
  const storage = cacheStorage(), newer = bundleBody('gold', 'newer'), older = bundleBody('gold', 'older');
  const kept = await pageCommits(storage, 'gold', newer);
  await (await storage.open('predecessor-meta-v2-23')).put(new Request(bundleURL('gold', older)), new Response(older));
  const sw = worker(SW, storage, offline);
  await sw.install(); await sw.activate(); await sw.activate();
  const urls = (await (await storage.open(DATA)).keys()).map(k => k.url);
  assert.deepEqual(urls, [kept]);
});

test('F: rolling the website back to the 2.23/2.24 worker removes this release\'s caches instead of freezing them', async () => {
  const OLD = fs.readFileSync(path.join(__dirname, 'fixtures', 'sw-2.23.js'), 'utf8');
  const storage = cacheStorage(), current = worker(SW, storage, offline);
  await current.install(); await current.activate();
  await pageCommits(storage, 'gold', bundleBody('gold', 'saved by 2.25'));
  await (await storage.open(DATA)).put(new Request(SITE + 'manifest.json'), new Response('{"schema":2,"cohorts":{}}'));
  const rolledBack = worker(OLD, storage, async () => new Response(bundleBody('gold', 'published after the rollback'), {status: 200}));
  await rolledBack.install(); await rolledBack.activate();
  assert.deepEqual(await storage.keys(), ['predecessor-meta-v2-23'], 'only the rolled-back release\'s own cache remains');
  const later = bundleURL('gold', bundleBody('gold', 'published after the rollback'));
  await (await rolledBack.fetch(later)).text();
  const offlineOld = worker(OLD, storage, offline);
  assert.equal(JSON.parse(await (await offlineOld.fetch(later)).text()).note, 'published after the rollback', 'offline, the rolled-back site serves what it saved itself');
});

test('F: the saved manifest is re-described from what is actually saved before it is served offline', async () => {
  const storage = cacheStorage(), sw = worker(SW, storage, offline), kept = bundleBody('gold', 'the copy that is saved');
  await sw.install(); await sw.activate();
  await pageCommits(storage, 'gold', kept);
  // Two tabs committed at once without Web Locks: the manifest points at a gold bundle that was deleted.
  const gone = 'd'.repeat(64);
  await (await storage.open(DATA)).put(new Request(SITE + 'manifest.json'), new Response(JSON.stringify({schema: 2, published_at: '2026-09-18T10:00:00Z', cohorts: {
    gold: {label: 'Gold+', status: 'available', sha256: gone, url: 'bundles/gold-' + gone + '.json', generated_at: '2026-09-18T09:00:00Z', source_signature: 'sig'}}})));
  const served = await (await sw.fetch(SITE + 'manifest.json')).json();
  assert.equal(served.cohorts.gold.sha256, digest(kept));
  assert.equal(served.cohorts.gold.source_signature, 'unverified-saved-copy', 'a re-described copy is never presented as matching the current patch');
  assert.equal(JSON.parse(await (await sw.fetch(SITE + served.cohorts.gold.url)).text()).note, 'the copy that is saved');
});

test('F: a failed offline save is retried with the verified bytes of the loaded publication', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'static_client.js'), 'utf8');
  assert.match(client, /site\.loadedBytes = site\.verifiedBytes/, 'the verified bytes of the loaded publication are kept');
  assert.match(client, /if \(saved\) \{ site\.offlineProblem = null; if \(loaded && site\.loadedBytes === loaded\) site\.loadedBytes = null; \}/, 'they are released only once saved');
  // 2.27.0 review: the bytes and the address they were loaded from travel together into the (possibly queued) save.
  assert.match(client, /const target = loaded\?\.bytes && publicationBytes\(entry, loaded\.url\) \? siteURL\(loaded\.url\) : null;/);
  const commitStart = client.indexOf('async function commitNow'), commitBody = client.slice(commitStart, commitStart + client.slice(commitStart).search(/\r?\n  \}\r?\n/));
  assert.ok(commitBody.length > 500, 'commitNow found');
  assert.doesNotMatch(commitBody, /^[^\n]*site\.loadedBytes[^\n]*$/m, 'the save never reads the page-wide loaded bytes');
  // 2.27.0: the loaded bytes are the compact core or the full bundle; both count as this publication's bytes.
  assert.match(client, /const publicationBytes = \(entry, url\) => !!url && \(url === entry\?\.url \|\| url === entry\?\.projection\?\.core\?\.url\);/);
  assert.match(client, /else site\.offlineProblem = /, 'an unsaved copy is reported, never silently cleared');
  assert.match(client, /health: entry\.health \|\| \(entry\.saved_copy \? null : manifest\.health\)/, 'a re-described saved copy never borrows the newest publication health');
});

test('F guard (2.27.0): a saved compact core and evidence file are served offline; unsaved evidence is not invented', async () => {
  const storage = cacheStorage(), sw = worker(SW, storage, offline), core = bundleBody('gold', 'core'), hero = JSON.stringify({heroes: {steel: {previous_abilities: []}}});
  await sw.install(); await sw.activate();
  const data = await storage.open(DATA), coreURL = SITE + 'bundles/gold-core-' + digest(core) + '.json', heroURL = SITE + 'bundles/gold-hero-steel-' + digest(hero) + '.json';
  await data.put(new Request(coreURL), new Response(core)); await data.put(new Request(heroURL), new Response(hero));
  for (const [url, body] of [[coreURL, core], [heroURL, hero]]) {
    const reply = await sw.fetch(url);
    assert.equal(reply.headers.get('X-Predecessor-Cache'), 'offline');
    assert.equal(await reply.text(), body);
  }
  await assert.rejects(sw.fetch(SITE + 'bundles/gold-hero-grux-' + 'e'.repeat(64) + '.json'), 'evidence that was never saved fails instead of being made up');
});

test('F guard (2.27.0): the one-time move never copies an old bundle next to a compact core the page already saved', async () => {
  const storage = cacheStorage(), core = bundleBody('gold', 'core saved by 2.27'), old = bundleBody('gold', 'saved by 2.23');
  const legacy = await storage.open('predecessor-meta-v2-23'), oldURL = SITE + 'bundles/gold-' + digest(old) + '.json';
  await legacy.put(new Request(oldURL), new Response(old));
  const data = await storage.open(DATA), coreURL = SITE + 'bundles/gold-core-' + digest(core) + '.json';
  await data.put(new Request(coreURL), new Response(core));
  const sw = worker(SW, storage, offline);
  await sw.install(); await sw.activate();
  assert.ok(await stored(storage, coreURL), 'the saved core was kept');
  assert.ok(!(await (await storage.open(DATA)).match(new Request(oldURL))), 'the older bundle was moved next to the newer core');
});

test('F guard (2.27.0): the worker never stores a core or evidence file it fetched; only the page saves verified data', async () => {
  const storage = cacheStorage(), body = JSON.stringify({heroes: {}}), sw = worker(SW, storage, async () => new Response(body, {status: 200}));
  await sw.install(); await sw.activate();
  for (const kind of ['core', 'shared', 'hero-steel']) {
    const url = SITE + 'bundles/gold-' + kind + '-' + 'f'.repeat(64) + '.json';
    assert.equal(await (await sw.fetch(url)).text(), body);
    assert.ok(!(await stored(storage, url)), kind + ' was stored by the worker');
  }
});

test('F guard: a saved bracket is served offline and labelled as such', async () => {
  const storage = cacheStorage(), sw = worker(SW, storage, offline);
  await sw.install(); await sw.activate();
  const reply = await sw.fetch(await pageCommits(storage, 'gold', bundleBody('gold')));
  assert.equal(reply.headers.get('X-Predecessor-Cache'), 'offline');
  assert.equal(JSON.parse(await reply.text()).bracket.segment, 'gold');
});

test('F guard: online, data comes from the network untouched and the page is kept for offline starts', async () => {
  const storage = cacheStorage(), body = bundleBody('gold'), sw = worker(SW, storage, async () => new Response(body, {status: 200}));
  await sw.install(); await sw.activate();
  const reply = await sw.fetch(bundleURL('gold', body));
  assert.equal(reply.headers.get('X-Predecessor-Cache'), null);
  assert.equal(await reply.text(), body);
  assert.ok(await stored(storage, SITE), 'the shell should be saved at install');
});
