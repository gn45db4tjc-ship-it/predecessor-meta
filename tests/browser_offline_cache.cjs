'use strict';
/* Offline cache lifecycle in a real browser with the real service worker (audit defect F).

   The script serves a staged preview itself so it can change what the network does mid-test: publish the
   next release of sw.js, answer a bundle request with a captive-portal page, or go down entirely. Going
   down at the server (not browser "offline" emulation) also cuts the service worker off, like a real outage.

     python -B tests/stage_preview.py            (or a six-bracket preview; set OFFLINE_SITE to its folder)
     node tests/browser_offline_cache.cjs

   START_PREVIEW=1 stages the committed gold seed first. PLAYWRIGHT_PATH and BROWSER_CHANNEL are honoured. */
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..'), siteDir = path.resolve(process.env.OFFLINE_SITE || path.join(root, 'qa', 'audit-site'));
const port = Number(process.env.OFFLINE_PORT || 12948), origin = 'http://127.0.0.1:' + port + '/';
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css'};
const FAKE = 'c'.repeat(64), LEGACY = 'predecessor-meta-v2-23', LEGACY_NAME = /^predecessor-meta-v\d+-\d+$/, DATA_CACHE = 'predecessor-meta-data-v1';
const legacySite = process.env.LEGACY_SITE ? path.resolve(process.env.LEGACY_SITE) : null;   // optional: a staged 2.23/2.24 build, so the real old worker writes the cache that gets moved
const net = {root: siteDir, down: false, dataDown: false, nextRelease: false, portalFor: null};
const results = [];

const server = http.createServer((request, response) => {
  const url = new URL(request.url, origin), name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const isData = name === 'manifest.json' || name.startsWith('bundles/');
  if (net.down || (net.dataDown && isData)) { request.socket.destroy(); return; }
  const send = (body, type, status = 200) => { response.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'}); response.end(body); };
  if (net.portalFor && name === 'bundles/' + net.portalFor + '-' + FAKE + '.json') return send('<html>captive portal</html>', 'text/html');
  const file = path.join(net.root, name);
  if (!file.startsWith(net.root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send('Not found', 'text/plain', 404);
  let body = fs.readFileSync(file);
  if (name === 'sw.js' && net.nextRelease) body = Buffer.from(body.toString('utf8').replace(/(const SHELL_CACHE = ')([^']+)(')/, '$1$2-next$3'));
  if (name === 'manifest.json' && net.portalFor) {   // the publication moved on to a bundle the portal will intercept
    const manifest = JSON.parse(body); Object.assign(manifest.cohorts[net.portalFor], {sha256: FAKE, url: 'bundles/' + net.portalFor + '-' + FAKE + '.json'}); body = Buffer.from(JSON.stringify(manifest));
  }
  send(body, TYPES[path.extname(name)] || 'application/octet-stream');
});

const ready = page => page.waitForFunction(() => typeof B !== 'undefined' && !!B && !latestStatus.busy, null, {timeout: 120000});
const controlled = page => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {timeout: 60000});
/* Poll an async check from Node. (An async predicate given to waitForFunction is a Promise, which is always truthy.) */
async function until(page, check, arg, timeout = 60000) {
  for (const end = Date.now() + timeout; Date.now() < end; await new Promise(r => setTimeout(r, 200))) if (await page.evaluate(check, arg)) return;
  throw Error('Timed out waiting for: ' + String(check).slice(0, 100));
}
const storage = page => page.evaluate(async () => {
  const out = {};
  for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map(k => new URL(k.url).pathname.split('/').slice(-2).join('/'));
  return out;
});
const savedManifest = page => page.evaluate(async name => (await (await caches.open(name)).match(new URL('manifest.json', location.href)))?.json(), DATA_CACHE);
async function choose(page, bracket) {
  await page.selectOption('#bracket', bracket);
  await page.waitForFunction(b => !!B && B.bracket?.segment === b && !latestStatus.busy, bracket, {timeout: 120000});
}
async function check(name, run) {
  try { const detail = await run(); results.push({name, ok: true, detail}); console.log('ok   ' + name + ' ' + JSON.stringify(detail || {})); }
  catch (error) { results.push({name, ok: false, error: String(error.message || error).split('\n')[0]}); console.log('FAIL ' + name + ' ' + String(error.message || error).split('\n')[0]); }
  finally { Object.assign(net, {down: false, dataDown: false, portalFor: null}); }   // one failed check must not starve the next
}

(async () => {
  if (process.env.START_PREVIEW === '1') {
    const staged = spawnSync(process.env.PYTHON_EXE || 'python', ['-B', path.join('tests', 'stage_preview.py')], {cwd: root, encoding: 'utf8'});
    if (staged.status) throw Error('Preview staging failed: ' + staged.stderr);
  }
  const published = JSON.parse(fs.readFileSync(path.join(siteDir, 'manifest.json'), 'utf8'));
  const brackets = Object.keys(published.cohorts).filter(key => published.cohorts[key].status === 'available');
  assert.ok(brackets.includes('gold'), 'the staged preview must include gold');
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'allow'}), page = await context.newPage();
    await page.goto(origin); await ready(page); await controlled(page);

    await check('only verified data is saved, and only by the page', async () => {
      // No waiting: once the page reports the check complete, the offline copy must already be saved.
      assert.ok(await page.evaluate(async name => (await caches.keys()).includes(name) && (await (await caches.open(name)).keys()).length >= 2, DATA_CACHE), 'the check completed before the offline copy was saved');
      const caches = await storage(page), data = caches[DATA_CACHE], shell = Object.keys(caches).find(n => n.startsWith('predecessor-meta-shell-'));
      assert.ok(shell, 'no release shell cache');
      assert.deepEqual(data.filter(n => n.startsWith('bundles/')), ['bundles/gold-' + published.cohorts.gold.sha256 + '.json']);
      assert.ok(data.some(n => n.endsWith('manifest.json')));
      assert.ok(!caches[shell].some(n => n.startsWith('bundles/') || n.endsWith('manifest.json')), 'the worker stored data in the shell cache');
      return {shell, saved: data.length};
    });

    for (const bracket of brackets) await choose(page, bracket);
    await choose(page, 'gold');
    await until(page, async ({name, count}) => (await (await caches.open(name)).keys()).filter(k => k.url.includes('/bundles/')).length >= count, {name: DATA_CACHE, count: brackets.length});

    await check('every visited bracket is saved, one bundle each', async () => {
      const data = (await storage(page))[DATA_CACHE].filter(n => n.startsWith('bundles/')).sort();
      assert.deepEqual(data, brackets.map(b => 'bundles/' + b + '-' + published.cohorts[b].sha256 + '.json').sort());
      return {brackets: brackets.length};
    });

    await check('a captive-portal page served as a newer bundle never replaces the saved bracket', async () => {
      net.portalFor = 'gold';
      await page.locator('#refresh').click();
      await page.waitForFunction(() => !latestStatus.busy && /Update check failed/.test(latestStatus.message || ''), null, {timeout: 60000});
      net.portalFor = null;
      const data = (await storage(page))[DATA_CACHE], manifest = await savedManifest(page);
      assert.ok(data.includes('bundles/gold-' + published.cohorts.gold.sha256 + '.json'), 'the verified gold bundle was evicted');
      assert.ok(!data.some(n => n.includes(FAKE)), 'the unverified response was stored');
      assert.equal(manifest.cohorts.gold.sha256, published.cohorts.gold.sha256, 'the saved manifest now points at a bundle that was never verified');
      assert.ok(await page.evaluate(() => !!B), 'the loaded data was dropped');
      return {message: await page.evaluate(() => latestStatus.errors?.[0]?.detail || latestStatus.message)};
    });

    await check('the next release keeps every saved bracket', async () => {
      net.nextRelease = true;
      await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
      await until(page, async () => (await caches.keys()).some(n => n.endsWith('-next')) && !(await caches.keys()).some(n => n.startsWith('predecessor-meta-shell-') && !n.endsWith('-next')));
      const data = (await storage(page))[DATA_CACHE].filter(n => n.startsWith('bundles/'));
      assert.equal(data.length, brackets.length);
      return {saved_after_release: data.length};
    });

    await check('after the release, the app restarts with the network down and opens every saved bracket', async () => {
      net.down = true;
      await page.reload(); await ready(page);
      const opened = [];
      for (const bracket of [...brackets.filter(b => b !== 'gold'), 'gold']) { await choose(page, bracket); opened.push(await page.evaluate(() => B.bracket.segment + ':' + B.generated_at)); }
      const message = await page.evaluate(() => latestStatus.message);
      assert.match(message, /saved publication/i);
      for (const bracket of brackets) assert.ok(opened.includes(bracket + ':' + published.cohorts[bracket].generated_at), bracket + ' did not open with its original date');
      net.down = false;
      return {opened: opened.length, message: message.slice(0, 60)};
    });
    await context.close();

    await check('brackets saved by release 2.23/2.24 are moved on upgrade and open with the network down', async () => {
      net.nextRelease = false;
      const legacy = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'allow'}), p = await legacy.newPage();
      await p.goto(origin + 'app.webmanifest');   // same origin, but no page script: nothing registers a worker yet
      await p.evaluate(async ({name, gold}) => {
        const cache = await caches.open(name);
        for (const url of ['manifest.json', gold]) await cache.put(new URL(url, location.origin + '/').href, await fetch('/' + url));
        await cache.put(new URL('bundles/diamond-' + 'd'.repeat(64) + '.json', location.origin + '/').href, new Response('<html>captive portal</html>'));
      }, {name: LEGACY, gold: published.cohorts.gold.url});
      net.dataDown = true;            // from here on, data can only come from what was saved
      await p.goto(origin); await controlled(p);
      await until(p, async name => !(await caches.keys()).includes(name), LEGACY);
      await p.reload(); await ready(p);
      const seen = await p.evaluate(() => ({bracket: B.bracket.segment, generated_at: B.generated_at, message: latestStatus.message})), data = (await storage(p))[DATA_CACHE];
      assert.equal(seen.generated_at, published.cohorts.gold.generated_at);
      assert.ok(!data.some(n => n.includes('d'.repeat(64))), 'a bundle that fails its own checksum was moved');
      net.dataDown = false;
      await legacy.close();
      return {opened: seen.bracket, legacy_cache_removed: true};
    });

    if (legacySite) await check('a cache written by the real 2.23 worker is moved on upgrade, every visited bracket included', async () => {
      const old = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'allow'}), p = await old.newPage();
      const before = JSON.parse(fs.readFileSync(path.join(legacySite, 'manifest.json'), 'utf8')), visited = Object.keys(before.cohorts).filter(k => before.cohorts[k].status === 'available');
      Object.assign(net, {root: legacySite, nextRelease: false});
      await p.goto(origin); await ready(p); await controlled(p);
      await p.reload(); await ready(p);                       // the old worker only saves what it sees once it controls the page
      for (const bracket of visited) await choose(p, bracket);
      const legacyCaches = Object.keys(await storage(p));
      assert.ok(legacyCaches.some(n => LEGACY_NAME.test(n)), 'probe setup: the old worker wrote no legacy cache');
      net.root = siteDir;                                     // the new release is published
      await p.reload(); await ready(p);
      await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
      await until(p, async name => !(await caches.keys()).some(n => /^predecessor-meta-v\d+-\d+$/.test(n)) && (await caches.keys()).includes(name), DATA_CACHE);
      net.down = true;
      await p.reload(); await ready(p);
      const opened = [];
      for (const bracket of [...visited.filter(b => b !== 'gold'), 'gold']) { await choose(p, bracket); opened.push(await p.evaluate(() => B.bracket.segment)); }
      assert.deepEqual(opened.sort(), [...visited].sort());
      await old.close();
      return {legacy_caches: legacyCaches, opened_offline_after_upgrade: opened.length};
    });
  } finally { net.root = siteDir; await browser.close(); server.close(); }
  fs.mkdirSync(path.join(root, 'qa'), {recursive: true});
  fs.writeFileSync(path.join(root, 'qa', 'offline-cache-browser.json'), JSON.stringify({site: siteDir, checked_at: new Date().toISOString(), results}, null, 2));
  if (results.some(r => !r.ok)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
