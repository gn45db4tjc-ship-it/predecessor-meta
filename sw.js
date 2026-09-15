'use strict';
const CACHE = 'predecessor-meta-v1';
const ROOT = new URL('./', self.location.href);
const SHELL = ['./', 'app.webmanifest', 'assets/app-icon-192.png', 'assets/app-icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('predecessor-meta-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

function localRequest(request) {
  const url = new URL(request.url);
  return url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname);
}

async function remember(request, response) {
  if (!response.ok) return response;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
  const match = new URL(request.url).pathname.match(/\/bundles\/(bronze|silver|gold|platinum|diamond|paragon)-[a-f0-9]{64}\.json$/);
  if (match) {
    const keys = await cache.keys();
    await Promise.all(keys.filter(key => {
      const old = new URL(key.url).pathname.match(/\/bundles\/(bronze|silver|gold|platinum|diamond|paragon)-[a-f0-9]{64}\.json$/);
      return old && old[1] === match[1] && key.url !== request.url;
    }).map(key => cache.delete(key)));
  }
  return response;
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(new Request(request, {cache: 'no-store'}));
    if (!response.ok) throw new Error('Publication unavailable');
    return remember(request, response);
  } catch (error) {
    const cached = await caches.match(request) || (fallback && await caches.match(fallback));
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Predecessor-Cache', 'offline');
      return new Response(cached.body, {status: cached.status, statusText: cached.statusText, headers});
    }
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !localRequest(request)) return;
  const url = new URL(request.url);
  const data = url.pathname.endsWith('/manifest.json') || /\/bundles\/[a-z]+-[a-f0-9]{64}\.json$/.test(url.pathname);
  if (request.mode === 'navigate') event.respondWith(networkFirst(request, new URL('./', ROOT)));
  else if (data) event.respondWith(networkFirst(request));
  else event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => remember(request, response))));
});
