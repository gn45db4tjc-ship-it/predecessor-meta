'use strict';
/* 2.52.0 (speed audit H1): the service worker answers a page request as soon as the network copy arrives and saves
   that copy in the background. Before, it awaited cache.put first, so a return visit on a slow connection waited for
   the whole page to be written before it could start drawing. sw.js runs in a sandbox, as in audit_regressions. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const SITE = 'https://example.test/predecessor-meta/';
const APP_PAGE = '<!doctype html><title>page</title><meta name="predecessor-app-version" content="2.59.0"></head>';

function worker({putNever = false, page = APP_PAGE} = {}) {
  const saved = new Map(), kept = [];
  const store = {
    put: (request, response) => putNever ? new Promise(() => {}) : response.text().then(body => { saved.set(String(request.url || request), body); }),
    match: async () => undefined, addAll: async () => {}, keys: async () => [], delete: async () => false};
  const caches = {open: async () => store, match: async () => undefined, keys: async () => [], delete: async () => true};
  const listeners = {}, self = {location: {href: SITE + 'sw.js'}, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting() {}, clients: {claim: async () => {}}};
  // The published page carries the app's version marker (static_publish.render_site); since PRED-M11 only a page with
  // it replaces the offline shell.
  const network = async () => new Response(page, {status: 200, headers: {'Content-Type': 'text/html'}});
  vm.runInNewContext(SW, {self, caches, fetch: network, crypto: require('node:crypto').webcrypto, TextDecoder, URL, Request, Response, Headers, console: {warn() {}, log() {}}});
  return {saved, kept, install() {
    let done; listeners.install({waitUntil: p => { done = p; }});
    return done;
  }, fetch(url, mode = 'navigate') {
    let reply; const request = new Request(url);
    Object.defineProperty(request, 'mode', {value: mode});
    listeners.fetch({request, respondWith: p => { reply = p; }, waitUntil: p => { kept.push(p); }});
    return reply;
  }};
}
const within = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('no answer within ' + ms + ' ms')), ms))]);

test('H1: a page request is answered without waiting for the cache write', async () => {
  const sw = worker({putNever: true});
  const response = await within(sw.fetch(SITE), 300);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>page<\/title>/, 'the page body reaches the browser intact');
});

test('H1: the page copy is still saved, kept alive by the fetch event', async () => {
  const sw = worker();
  const response = await sw.fetch(SITE);
  await response.text();
  await Promise.all(sw.kept);
  assert.ok([...sw.saved.values()].some(body => /<title>page<\/title>/.test(body)), 'the shell copy was saved for offline use');
});

test('F15: an HTTP 200 maintenance page is shown but never replaces the offline app document', async () => {
  const sw = worker({page: '<!doctype html><title>Down for maintenance</title>'});
  const response = await sw.fetch(SITE);
  assert.match(await response.text(), /maintenance/, 'the visitor still sees what the server sent');
  await Promise.all(sw.kept);
  assert.equal(sw.saved.size, 0, 'the last good shell is kept');
});

test('F15: install saves the app document', async () => {
  const sw = worker();
  await sw.install();
  assert.match(sw.saved.get(SITE) || '', /predecessor-app-version/, 'the root is saved as the app');
});

test('F15: an HTTP 200 maintenance page at install fails the install and saves nothing', async () => {
  const sw = worker({page: '<!doctype html><title>Down for maintenance</title>'});
  await assert.rejects(sw.install(), /not the app document/);
  assert.equal(sw.saved.size, 0, 'the previous worker keeps its good shell');
});
