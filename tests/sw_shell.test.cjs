'use strict';
/* 2.52.0 (speed audit H1): the service worker answers a page request as soon as the network copy arrives and saves
   that copy in the background. Before, it awaited cache.put first, so a return visit on a slow connection waited for
   the whole page to be written before it could start drawing. sw.js runs in a sandbox, as in audit_regressions. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const SITE = 'https://example.test/predecessor-meta/';

function worker({putNever = false} = {}) {
  const saved = new Map(), kept = [];
  const store = {
    put: (request, response) => putNever ? new Promise(() => {}) : response.text().then(body => { saved.set(String(request.url || request), body); }),
    match: async () => undefined, addAll: async () => {}, keys: async () => [], delete: async () => false};
  const caches = {open: async () => store, match: async () => undefined, keys: async () => [], delete: async () => true};
  const listeners = {}, self = {location: {href: SITE + 'sw.js'}, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting() {}, clients: {claim: async () => {}}};
  const network = async () => new Response('<!doctype html><title>page</title>', {status: 200, headers: {'Content-Type': 'text/html'}});
  vm.runInNewContext(SW, {self, caches, fetch: network, crypto: require('node:crypto').webcrypto, TextDecoder, URL, Request, Response, Headers, console: {warn() {}, log() {}}});
  return {saved, kept, fetch(url, mode = 'navigate') {
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
