'use strict';
/* Reproductions for the 2.23.0 audit that need no browser: stale evidence (I) and the
   offline cache lifecycle (F). Each reproduction asserts the CORRECT behaviour. While its
   defect is open it is marked {todo}, which node:test reports without failing the run; the
   change that fixes the defect removes the marker. Tests without it are guards that pass
   today and must keep passing. Every number is a synthetic fixture. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Meta = require('../engine.js');

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
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const SITE = 'https://example.test/predecessor-meta/';
const bundleURL = (bracket, fill) => SITE + 'bundles/' + bracket + '-' + fill.repeat(64) + '.json';
const urlOf = key => typeof key === 'string' ? new URL(key, SITE).href : key.url;

function cacheStorage() {
  const stores = new Map();
  const view = name => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name); return {
    async put(request, response) { m.set(urlOf(request), response); },
    async addAll(list) { for (const item of list) m.set(urlOf(String(item)), new Response('shell')); },
    async keys() { return [...m.keys()].map(url => ({url})); },
    async delete(key) { return m.delete(urlOf(key)); },
    async match(request) { return m.get(urlOf(request)); }}; };
  return {stores, open: async name => view(name), keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
    async match(request) { for (const m of stores.values()) { const hit = m.get(urlOf(request)); if (hit) return hit; } }};
}
function worker(source, storage, network) {
  const listeners = {}, self = {location: {href: SITE + 'sw.js'}, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting() {}, clients: {claim: async () => {}}};
  vm.runInNewContext(source, {self, caches: storage, fetch: request => network(request), URL, Request, Response, Headers, console});
  const lifecycle = async type => { let pending = Promise.resolve(); listeners[type]?.({waitUntil: p => { pending = p; }}); await pending; };
  return {install: () => lifecycle('install'), activate: () => lifecycle('activate'),
    async fetch(url) { let reply; listeners.fetch({request: new Request(url), respondWith: p => { reply = p; }}); return reply; }};
}
/* The next release: only the release-specific cache name changes. A persistent data cache
   (declared as DATA_CACHE once the cache is split) keeps its name across releases. */
const nextRelease = source => source.replace(/(const (?:CACHE|SHELL_CACHE) = ')([^']+)(')/, '$1$2-next$3');
const dataCacheName = source => (source.match(/const DATA_CACHE = '([^']+)'/) || [])[1];
const stored = async (storage, url) => !!(await storage.match(new Request(url)));
async function releaseWithSavedBracket(storage) {
  const valid = JSON.stringify({schema: 3, bracket: {segment: 'gold'}}), url = bundleURL('gold', 'a');
  const sw = worker(SW, storage, async () => new Response(valid, {status: 200}));
  await sw.install(); await sw.activate();
  await (await sw.fetch(url))?.text();
  // Once bundles are committed by the page after it verifies them, simulate that commit.
  if (!await stored(storage, url) && dataCacheName(SW)) await (await storage.open(dataCacheName(SW))).put(new Request(url), new Response(valid));
  assert.ok(await stored(storage, url), 'harness: the saved gold bundle should be in cache storage');
  return url;
}

test('F: activating the next release keeps the brackets saved for offline use', {todo: 'defect F - fixed by the offline-cache phase'}, async () => {
  const storage = cacheStorage(), saved = await releaseWithSavedBracket(storage);
  const next = worker(nextRelease(SW), storage, async () => { throw new Error('offline'); });
  await next.install(); await next.activate();
  assert.ok(await stored(storage, saved), 'the saved bracket was deleted when the new release activated');
});

test('F: a malformed HTTP 200 bundle never evicts the last verified bracket', {todo: 'defect F - fixed by the offline-cache phase'}, async () => {
  const storage = cacheStorage(), saved = await releaseWithSavedBracket(storage);
  const sw = worker(SW, storage, async () => new Response('<html>captive portal</html>', {status: 200}));
  await (await sw.fetch(bundleURL('gold', 'b')))?.text();
  assert.ok(await stored(storage, saved), 'an unverified response replaced the verified gold bundle');
});

test('F guard: a saved bracket is served offline and labelled as such', async () => {
  const storage = cacheStorage(), saved = await releaseWithSavedBracket(storage);
  const sw = worker(SW, storage, async () => { throw new Error('offline'); });
  const reply = await sw.fetch(saved);
  assert.equal(reply.headers.get('X-Predecessor-Cache'), 'offline');
  assert.equal(JSON.parse(await reply.text()).bracket.segment, 'gold');
});

test('F guard: other brackets are untouched when one bracket updates', async () => {
  const storage = cacheStorage(), body = JSON.stringify({schema: 3});
  const sw = worker(SW, storage, async () => new Response(body, {status: 200}));
  await sw.install(); await sw.activate();
  const silver = bundleURL('silver', 'c');
  for (const url of [silver, bundleURL('gold', 'a'), bundleURL('gold', 'b')]) {
    await (await sw.fetch(url))?.text();
    if (!await stored(storage, url) && dataCacheName(SW)) await (await storage.open(dataCacheName(SW))).put(new Request(url), new Response(body));
  }
  assert.ok(await stored(storage, silver));
});
