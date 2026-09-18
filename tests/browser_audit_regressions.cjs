'use strict';
/* Browser reproductions for the 2.23.0 audit (defects A, B, E, G, H).

   tests/known-defects.json is the ledger. A defect listed as open MUST reproduce and a defect
   not listed MUST NOT; either mismatch fails the run. So this script passes both before a fix
   (the defect is recorded and still real) and after it (the ledger entry was removed and the
   defect is gone), and it fails if a fix is claimed without working or a defect returns.

   Run against a preview staged from the committed seed (no network, no date changes):
     python -B tests/stage_preview.py
     python -B -m http.server 12940 --bind 127.0.0.1 --directory qa/audit-site
     node tests/browser_audit_regressions.cjs
   or let the script do both with START_PREVIEW=1. PLAYWRIGHT_PATH and BROWSER_CHANNEL are honoured. */
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), {spawn, spawnSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PREVIEW_PORT || 12940);
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:' + port + '/';
const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, 'known-defects.json'), 'utf8'));
const open = new Set(ledger.open), results = [];
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

function verdict(id, reproduced, detail) {
  const expectedOpen = open.has(id);
  results.push({id, title: ledger.defects[id], reproduced, recorded_open: expectedOpen, ok: reproduced === expectedOpen, detail});
}
async function session(browser, options) {
  const context = await browser.newContext({serviceWorkers: 'block', acceptDownloads: true, ...options});
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
  return {context, page};
}
const desktop = {viewport: {width: 1920, height: 1080}};
const phone = {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true};
async function reset(page, size = 3, extra = {}) {
  await page.evaluate(({size, extra}) => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], size, compRole: 'auto'}, extra); compositions = null; save(); }, {size, extra});
}
async function generate(page) {
  await page.evaluate(() => changeRoute('planner'));
  await page.locator('#generate').click();
  await page.waitForFunction(() => !!compositions && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
}
const offered = page => page.evaluate(() => document.querySelectorAll('[data-use-comp]').length);
const bannedLocks = page => page.evaluate(() => S.locks.filter(l => S.bans.includes(l.slug) || S.enemies.some(e => e.slug === l.slug)).map(l => l.slug));

const probes = {
  async A1(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page); await generate(page);
    const target = await page.evaluate(() => compositions.alternatives[0].picks.find(p => p.slug !== 'steel').slug);
    await page.evaluate(() => changeRoute('draft'));
    await page.selectOption('#ban-hero', target);
    assert.ok(await page.evaluate(slug => S.bans.includes(slug), target), 'probe setup: the ban control did not record the ban');
    await page.evaluate(() => changeRoute('planner'));
    if (await page.locator('[data-use-comp="0"]').count()) await page.locator('[data-use-comp="0"]').click();
    const bad = await bannedLocks(page);
    verdict('A1', bad.length > 0, {banned: target, locked_while_banned: bad});
    await context.close();
  },
  async A2(browser) {
    const {context, page} = await session(browser, phone);
    await reset(page, 2); await generate(page);
    const target = await page.evaluate(() => compositions.alternatives[0].picks.find(p => p.slug !== 'steel').slug);
    await reset(page, 2, {bans: [target]});
    await page.evaluate(() => changeRoute('draft'));
    await page.locator('[data-unban="' + target + '"]').first().click();
    assert.deepEqual(await page.evaluate(() => S.bans), [], 'probe setup: unban did not clear the ban');
    await generate(page);
    const index = await page.evaluate(slug => compositions.alternatives.findIndex(c => c.picks.some(p => p.slug === slug)), target);
    assert.ok(index >= 0, 'probe setup: the unbanned hero did not return to the alternatives');
    assert.ok(await page.locator('#undo-action').count(), 'probe setup: the Undo control expired before it could be used');
    await page.locator('#undo-action').click();
    assert.ok(await page.evaluate(slug => S.bans.includes(slug), target), 'probe setup: Undo did not restore the ban');
    await page.evaluate(() => changeRoute('planner'));
    const button = page.locator('[data-use-comp="' + index + '"]');
    if (await button.count()) await button.click();
    const bad = await bannedLocks(page);
    verdict('A2', bad.length > 0, {restored_ban: target, locked_while_banned: bad});
    await context.close();
  },
  async A3(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 3, {enemies: [{slug: 'gideon', role: 'midlane'}]}); await generate(page);
    await page.evaluate(() => changeRoute('draft'));
    await page.locator('#clear-enemies').click();
    await page.evaluate(() => changeRoute('planner'));
    const stale = await offered(page);
    verdict('A3', stale > 0, {alternatives_still_offered: stale});
    await context.close();
  },
  async A4(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 3, {bans: ['khaimera']}); await generate(page);
    await page.evaluate(() => changeRoute('draft'));
    await page.locator('[data-unban="khaimera"]').first().click();
    await page.evaluate(() => changeRoute('planner'));
    const stale = await offered(page);
    verdict('A4', stale > 0, {alternatives_still_offered: stale});
    await context.close();
  },
  async B1(browser) {
    const {context, page} = await session(browser, desktop);
    await page.evaluate(() => { const m = document.createElement('i'); m.id = 'audit-marker'; document.querySelector('#main').appendChild(m); });
    const fake = 'f'.repeat(64);
    await page.route('**/manifest.json', async route => {
      const response = await route.fetch(), manifest = await response.json();
      manifest.patch_check = {...(manifest.patch_check || {}), status: 'failed'};
      Object.assign(manifest.cohorts.gold, {sha256: fake, url: 'bundles/gold-' + fake + '.json'});
      await route.fulfill({response, json: manifest});
    });
    await page.route('**/bundles/gold-' + fake + '.json', route => route.abort());
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !latestStatus.busy && !!latestStatus.errors?.length, null, {timeout: 120000});
    const state = await page.evaluate(() => ({withheld: B?.recommendation_context?.status === 'withheld', policy: E.performancePolicy().label, marker: !!document.querySelector('#audit-marker')}));
    assert.ok(state.withheld, 'probe setup: the failed check did not withhold recommendations');
    verdict('B1', state.marker, {...state, meaning: 'marker survives only when #main was not redrawn'});
    await context.close();
  },
  async B3(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { changeRoute('meta'); const m = document.createElement('i'); m.id = 'audit-marker'; document.querySelector('#main').appendChild(m); });
    const fake = 'e'.repeat(64);
    await page.route('**/manifest.json', async route => {
      const response = await route.fetch(), manifest = await response.json();
      manifest.patch_check = {...(manifest.patch_check || {}), status: 'failed'};
      Object.assign(manifest.cohorts.gold, {sha256: fake, url: 'bundles/gold-' + fake + '.json'});
      await route.fulfill({response, json: manifest});
    });
    await page.route('**/bundles/gold-' + fake + '.json', route => route.abort());
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !latestStatus.busy && !!latestStatus.errors?.length, null, {timeout: 120000});
    const state = await page.evaluate(() => ({withheld: B?.recommendation_context?.status === 'withheld', marker: !!document.querySelector('#audit-marker')}));
    assert.ok(state.withheld, 'probe setup: the failed check did not withhold recommendations');
    verdict('B3', state.marker, {...state, meaning: 'marker survives only when the phone main view was not redrawn'});
    await context.close();
  },
  async B2(browser) {
    const context = await browser.newContext({serviceWorkers: 'block', ...phone}), page = await context.newPage();
    const fetched = await (await context.request.get(url + 'manifest.json')).json().then(m => Date.parse(m.cohorts.gold.generated_at));
    await page.clock.install({time: new Date(fetched + 3600000)});
    await page.goto(url);
    await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    await page.evaluate(() => changeRoute('meta'));
    const label = () => page.evaluate(() => (document.querySelector('#main').innerText.match(/\b(current|aging|stale|unavailable)\b/i) || [''])[0].toLowerCase());
    const before = await label();
    assert.equal(before, 'current', 'probe setup: a one-hour-old publication should read Current');
    await page.clock.fastForward('49:00:00');
    // The site re-checks the publication whenever the browser reports it is back online.
    const checked = page.waitForResponse(response => response.url().includes('manifest.json'), {timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await checked;
    await page.waitForFunction(() => !latestStatus.busy);
    const after = await label();
    verdict('B2', after === 'current', {before, after_49_hours_and_a_successful_check: after});
    await context.close();
  },
  async E1(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 5);
    await page.evaluate(() => { changeRoute('planner'); window.__gap = 0; let last = performance.now(); const tick = () => { const now = performance.now(); window.__gap = Math.max(window.__gap, now - last); last = now; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!compositions && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    const gap = await page.evaluate(() => Math.round(window.__gap));
    verdict('E1', gap > 500, {longest_main_thread_stall_ms: gap, threshold_ms: 500});
    await context.close();
  },
  async G1(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => changeRoute('more'));
    const waiting = page.waitForEvent('download');
    await page.locator('#download-review-packet').click();
    const file = path.join(root, 'qa', 'audit-review-packet.json');
    await (await waiting).saveAs(file);
    const packet = JSON.parse(fs.readFileSync(file, 'utf8')), inBundle = await page.evaluate(() => (B.official_changes || []).length);
    assert.ok(inBundle > 0, 'probe setup: the seed bundle carries no official changes');
    verdict('G1', (packet.official_changes || []).length === 0, {bundle_official_changes: inBundle, packet_official_changes: (packet.official_changes || []).length, packet_schema: packet.schema});
    await context.close();
  },
  async H1(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { B = {...B, scoped_statistics: {...B.scoped_statistics, status: 'retained'}}; E = MetaEngine.create(B); S.bracket = 'gold'; changeRoute('builds'); changeRoute('meta'); });
    const state = await page.evaluate(() => ({active: Object.keys(B.heroes).filter(slug => (B.heroes[slug].roles_order || []).some(role => E.metaReview(slug, role)?.active)).length, text: document.querySelector('#main').innerText}));
    assert.equal(state.active, 0, 'probe setup: retained evidence should leave no editorial tier active');
    const claims = ['Reviewed tier guidance leads', 'Reviewed tier, then role performance'].filter(c => state.text.includes(c));
    verdict('H1', claims.length > 0, {active_tiers: state.active, claims_shown: claims});
    await context.close();
  }
};

(async () => {
  let server = null;
  if (process.env.START_PREVIEW === '1') {
    const python = process.env.PYTHON_EXE || 'python';
    const staged = spawnSync(python, ['-B', path.join('tests', 'stage_preview.py')], {cwd: root, encoding: 'utf8'});
    if (staged.status) throw Error('Preview staging failed: ' + staged.stderr);
    server = spawn(python, ['-B', '-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', path.join('qa', 'audit-site')], {cwd: root, stdio: 'ignore'});
    await new Promise(r => setTimeout(r, 1500));
  }
  fs.mkdirSync(path.join(root, 'qa'), {recursive: true});
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true});
  try {
    for (const [id, probe] of Object.entries(probes)) {
      if (only && !only.has(id)) continue;
      try { await probe(browser); }
      catch (error) { results.push({id, title: ledger.defects[id], ok: false, error: String(error.message || error).split('\n')[0]}); }
    }
  } finally { await browser.close(); if (server) server.kill(); }
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(root, 'qa', 'audit-regressions-browser.json'), JSON.stringify({baseline: ledger.baseline, url, checked_at: new Date().toISOString(), results}, null, 2));
  for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.id + ' ' + (r.error ? 'probe error: ' + r.error : (r.reproduced ? 'reproduced' : 'not reproduced') + (r.recorded_open ? ' (recorded open)' : ' (recorded fixed)')) + ' ' + JSON.stringify(r.detail || {}));
  if (failed.length) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
