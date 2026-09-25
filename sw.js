'use strict';
// Two caches with different lifetimes.
//   SHELL_CACHE is release-specific: the page and its icons. Old shells are deleted on activation.
//   DATA_CACHE is permanent: the manifest and the rank bundles saved for offline use. It survives every
//   release. This worker never writes network responses into it. The page stores a bundle there only
//   after verifying its checksum and structure (static_client.js, commitPublication), so an unverified
//   or malformed response can never replace a verified bracket.
// Both names keep the 'predecessor-meta-' prefix on purpose: if the website is rolled back to 2.24 or earlier,
// that release's worker deletes them on activation and starts saving afresh, instead of serving a frozen copy.
const SHELL_CACHE = 'predecessor-meta-shell-v2-35-0';
const DATA_CACHE = 'predecessor-meta-data-v1';
const LEGACY = /^predecessor-meta-v\d+-\d+$/;   // releases up to 2.24 kept shell and data together in one cache
const ROOT = new URL('./', self.location.href);
const SHELL = ['./', 'app.webmanifest', 'assets/app-icon-192.png', 'assets/app-icon-512.png'];
const BUNDLE = /\/bundles\/(bronze|silver|gold|platinum|diamond|paragon)-([a-f0-9]{64})\.json$/;
// A rank's compact core and its evidence annexes (2.27.0). Like bundles they are data: stored by the page only.
const PART = /\/bundles\/(bronze|silver|gold|platinum|diamond|paragon)-(core|shared|hero-[a-z0-9-]+)-([a-f0-9]{64})\.json$/;
const CORE = /\/bundles\/(bronze|silver|gold|platinum|diamond|paragon)-core-([a-f0-9]{64})\.json$/;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

async function sha256(buffer) {
  const subtle = typeof crypto !== 'undefined' && crypto.subtle;
  if (!subtle) return null;
  return Array.from(new Uint8Array(await subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
}

// One-time move of the brackets an older release saved. A bundle is kept only if its bytes still match
// the checksum in its own name; a bracket the page has already saved again is never overwritten.
async function migrateLegacy(name) {
  const old = await caches.open(name), data = await caches.open(DATA_CACHE);
  // A rank the page already saved, as a full bundle or as a compact core (2.27.0), is never overwritten.
  const have = new Set((await data.keys()).map(key => { const p = new URL(key.url).pathname; return (p.match(BUNDLE) || p.match(CORE) || [])[1]; }).filter(Boolean));
  for (const key of await old.keys()) {
    const match = new URL(key.url).pathname.match(BUNDLE);
    if (!match || have.has(match[1])) continue;
    const response = await old.match(key);
    if (!response) continue;
    const bytes = await response.arrayBuffer();
    if (await sha256(bytes) !== match[2]) continue;
    let bundle; try { bundle = JSON.parse(new TextDecoder().decode(bytes)); } catch { continue; }
    if (bundle?.bracket?.segment !== match[1]) continue;
    await data.put(key.url, new Response(bytes, {headers: {'Content-Type': 'application/json'}}));
    have.add(match[1]);
  }
  const manifestURL = new URL('manifest.json', ROOT).href, legacy = await old.match(manifestURL);
  let reference = null; try { reference = legacy ? await legacy.json() : null; } catch { reference = null; }
  if (reference && !await data.match(manifestURL)) await data.put(manifestURL, new Response(JSON.stringify(reference), {headers: {'Content-Type': 'application/json'}}));
  await reconcileManifest(data, reference);
}

// The saved manifest must describe the bundles that are actually saved, each with its own checksum and
// dates. An entry is rewritten only when its bundle is not saved but another bundle for that bracket is.
async function reconcileManifest(data, reference) {
  const manifestURL = new URL('manifest.json', ROOT).href, saved = await data.match(manifestURL);
  if (!saved) return;
  let manifest; try { manifest = await saved.json(); } catch { return; }
  const urls = (await data.keys()).map(key => key.url);
  let changed = false;
  for (const [bracket, entry] of Object.entries(manifest.cohorts || {})) {
    if (entry?.status === 'available' && typeof entry.url === 'string' && (urls.includes(new URL(entry.url, ROOT).href) || (entry.projection?.core?.url && urls.includes(new URL(entry.projection.core.url, ROOT).href)))) continue;
    const url = urls.find(candidate => (new URL(candidate).pathname.match(BUNDLE) || [])[1] === bracket);
    if (!url) continue;   // nothing saved for this bracket: leave the entry as published
    const digest = new URL(url).pathname.match(BUNDLE)[2], known = reference?.cohorts?.[bracket];
    if (known?.status === 'available' && known.sha256 === digest) manifest.cohorts[bracket] = {...known, saved_copy: true};
    else {
      let bundle; try { bundle = await (await data.match(url)).json(); } catch { continue; }
      // Its patch signature is unknown, so the page treats it as possibly out of date, never as current.
      manifest.cohorts[bracket] = {label: entry?.label, status: 'available', sha256: digest, url: 'bundles/' + bracket + '-' + digest + '.json', generated_at: bundle.generated_at,
        source_signature: 'unverified-saved-copy', saved_copy: true,
        source_dates: Object.fromEntries(Object.entries(bundle.sources || {}).map(([k, v]) => [k, {status: v?.status, fetched_at: v?.fetched_at}]))};
    }
    changed = true;
  }
  if (changed) await data.put(manifestURL, new Response(JSON.stringify(manifest), {headers: {'Content-Type': 'application/json'}}));
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    for (const key of keys.filter(key => LEGACY.test(key))) {
      // Delete a legacy cache only after its saved brackets have been moved. If the move fails, keep it.
      try { await migrateLegacy(key); await caches.delete(key); } catch (error) { console.warn('Saved brackets were left in place:', error); }
    }
    await Promise.all(keys.filter(key => key.startsWith('predecessor-meta-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function localRequest(request) {
  const url = new URL(request.url);
  return url.origin === ROOT.origin && url.pathname.startsWith(ROOT.pathname);
}

async function rememberShell(request, response) {
  if (response.ok) await (await caches.open(SHELL_CACHE)).put(request, response.clone());
  return response;
}

function offlineCopy(cached) {
  const headers = new Headers(cached.headers);
  headers.set('X-Predecessor-Cache', 'offline');
  return new Response(cached.body, {status: cached.status, statusText: cached.statusText, headers});
}

async function networkFirst(request, {data = false, fallback = null} = {}) {
  let refused = null;   // the server answered, but not with the file (for example 404 after a redeploy)
  try {
    const response = await fetch(new Request(request, {cache: 'no-store'}));
    if (!response.ok) { refused = response; throw new Error('Publication unavailable'); }
    return data ? response : rememberShell(request, response);   // data is stored by the page, after verification
  } catch (error) {
    // Before serving the saved manifest, make sure it describes bundles that are actually saved (a backstop for
    // browsers without Web Locks, where two tabs could commit at the same moment).
    if (data && new URL(request.url).pathname.endsWith('/manifest.json')) {
      try { await reconcileManifest(await caches.open(DATA_CACHE), null); } catch (problem) { console.warn('Saved manifest left as is:', problem); }
    }
    const cached = await caches.match(request) || (fallback && await caches.match(fallback));
    if (cached) return offlineCopy(cached);
    if (data && refused) return refused;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !localRequest(request)) return;
  const url = new URL(request.url);
  const data = url.pathname.endsWith('/manifest.json') || BUNDLE.test(url.pathname) || PART.test(url.pathname);
  // The explicit app updater checks a fresh root document before navigation. Treat that fetch like
  // navigation too: never serve a cached online response as proof that the release is reachable.
  const shellDocument = url.pathname === ROOT.pathname || url.pathname === new URL('index.html', ROOT).pathname;
  if (request.mode === 'navigate' || shellDocument) event.respondWith(networkFirst(request, {fallback: new URL('./', ROOT)}));
  else if (data) event.respondWith(networkFirst(request, {data: true}));
  else event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => rememberShell(request, response))));
});
