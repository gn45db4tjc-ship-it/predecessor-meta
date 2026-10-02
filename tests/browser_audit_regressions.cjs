'use strict';
/* Browser reproductions for the 2.23.0 audit (defects A, B, E, G, H) and its phone findings (item 09, M1-M9).

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
const open = new Set(ledger.open), retired = new Set(Object.keys(ledger.retired || {})), results = [];
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
/* Build-label and overlap probes exercise the committed historical mechanics.
   Restore that seed's authored plans explicitly: a later patch review must not
   activate future advice against the old fixture, or erase the sample under test.
   Current patch eligibility is checked separately by build_patch_review.test.cjs
   and browser_build_patch_review.cjs; no production eligibility rule is bypassed. */
let historicalBuilds;
async function historicalBuildSession(browser, options) {
  if (!historicalBuilds) historicalBuilds = JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(root, 'public-seed-gold.json.gz')))).guidance.builds;
  const opened = await session(browser, options);
  await opened.page.evaluate(builds => { B.guidance.builds = builds; delete B.guidance.build_patch_review; E = MetaEngine.create(B); render(); }, historicalBuilds);
  assert.equal(await opened.page.evaluate(() => E.buildReview('steel', 'jungle').active), true, 'Historical build probe needs its matching reviewed seed');
  return opened;
}
/* A controlled clock, started one hour after the publication was generated unless told otherwise. */
async function clockSession(browser, options, offsetMs = 3600000) {
  const context = await browser.newContext({serviceWorkers: 'block', acceptDownloads: true, ...options}), page = await context.newPage();
  const generated = await (await context.request.get(url + 'manifest.json')).json().then(m => Date.parse(m.cohorts.gold.generated_at));
  await page.clock.install({time: new Date(generated + offsetMs)});
  await page.goto(url);
  await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
  return {context, page};
}
/* Trigger an update check the way a phone does: the tab becomes visible again after more than 15 minutes.
   (The 'online' event is NOT used: the phone code redraws on it, which would hide a missing redraw.) */
async function checkLikeAReturningTab(page, forward = '00:16:00') {
  // The tab is hidden while the user is away, as a real one is: a headless page always reports 'visible', and since
  // 2.43.0 a visible tab checks every 5 minutes, which would not happen during a real absence. It then returns.
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}));
  const checked = page.waitForResponse(response => response.url().includes('manifest.json'), {timeout: 60000});
  await page.clock.fastForward(forward);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'visible'}); document.dispatchEvent(new Event('visibilitychange')); });
  await checked;
  await page.waitForFunction(() => !latestStatus.busy, null, {timeout: 120000});
}
/* A marker placed in #main at the moment the failing manifest is served: it disappears only if the view is
   redrawn AFTER the check started to fail, so an earlier, unrelated redraw cannot pass for a fix. */
const markMain = page => page.evaluate(() => { document.querySelector('#audit-marker')?.remove(); const m = document.createElement('i'); m.id = 'audit-marker'; document.querySelector('#main').appendChild(m); });
const failTheNextCheck = async (page, fill, beforeReply) => {
  const fake = fill.repeat(64);
  await page.route('**/manifest.json', async route => {
    const response = await route.fetch(), manifest = await response.json();
    manifest.patch_check = {...(manifest.patch_check || {}), status: 'failed'};
    Object.assign(manifest.cohorts.gold, {sha256: fake, url: 'bundles/gold-' + fake + '.json'});
    delete manifest.cohorts.gold.projection;   // a new publication known only by its full bundle, whose download fails
    if (beforeReply) await beforeReply();
    await route.fulfill({response, json: manifest});
  });
  await page.route('**/bundles/gold-' + fake + '.json', route => route.abort());
};
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

/* Runs in the page: mark one role failed the way a validated publication with a gap arrives. */
const GAP = `(slug, role) => {
  const pages = B.sources.statz_hero_pages, requested = pages.requested, heroes = {...B.heroes};
  heroes[slug] = {...heroes[slug], roles: {...heroes[slug].roles, [role]: {status: 'failed', error: 'FetchError: timed out (probe)'}}};
  B = {...B, heroes, failed_pages: [{slug, role, error: 'FetchError: timed out (probe)'}],
    sources: {...B.sources, statz_hero_pages: {...pages, status: 'partial (1 missing)', ok: requested - 1, failed: 1,
      coverage: {requested, ok: requested - 1, failed: 1, conflicting: 0, max_failed_share: 0.1, usable: true}}}};
  E = MetaEngine.create(B);
}`;

/* Runs in the page: records what a screen reader would announce. A text change counts when it happens inside a live
   region that already existed; a region inserted together with its text (a placeholder re-created by a redraw) is not
   announced by screen readers, so it is not counted. #progress (the publication status line) is left out. */
const recordAnnouncements = () => {
  const live = '[role=status],[role=alert],[role=log],[aria-live]:not([aria-live=off])';
  window.auditAnnounced = [];
  window.auditLivePlaceholders = () => [...document.querySelectorAll('[data-annex]')].filter(el => [el, ...el.querySelectorAll('*')].some(n => n.matches(live))).length;
  new MutationObserver(records => {
    const fresh = new Set(), changed = new Set();
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) { if (n.matches(live)) fresh.add(n); n.querySelectorAll(live).forEach(e => fresh.add(e)); }
    for (const r of records) { const el = r.target.nodeType === 1 ? r.target : r.target.parentElement, region = el?.closest(live); if (region?.isConnected && !fresh.has(region) && region.id !== 'progress') changed.add(region); }
    for (const region of changed) { const text = region.textContent.replace(/\s+/g, ' ').trim(); if (text) window.auditAnnounced.push({text, id: region.id, inDialog: !!region.closest('dialog[open]')}); }
  }).observe(document.documentElement, {subtree: true, childList: true, characterData: true});
};
/* The shared evidence files: since 2.39.0 an item dialog reads the catalog, Changes and Sources the history, and the rest of
   the source audit stays in shared. Probes that hold or fail "the shared evidence" hold or fail all three. */
const SHARED_FILES = /\/bundles\/gold-(?:shared|catalog|history)-[a-f0-9]{64}\.json$/;
/* Items whose original Pred.gg definition lives in the shared evidence (their dialog fills in when it arrives). */
async function evidenceItems(context) {
  const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
  const full = JSON.parse(await (await context.request.get(url + entry.url)).text());
  return Object.keys(full.items || {}).filter(k => full.items[k]?.pred_raw);
}

const probes = {
  async A7(browser) {
    const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('predecessor-planner-v2', JSON.stringify({evidencePolicy: 230, size: 3, bans: ['muriel'], enemies: [{slug: 'gideon', role: 'midlane'}],
      locks: [{slug: 'steel', role: 'jungle'}, {slug: 'muriel', role: 'support'}, {slug: 'kwang', role: 'offlane'}]})));
    await page.goto(url);
    await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const state = await page.evaluate(() => ({locks: S.locks.map(p => p.slug), bans: S.bans, enemies: S.enemies.map(p => p.slug), toast: document.querySelector('#toast').textContent}));
    let usable = true; try { await page.evaluate(() => E.validPicks(S.locks, {size: S.size, bans: S.bans, enemies: S.enemies})); } catch { usable = false; }
    const healed = usable && JSON.stringify(state.locks) === JSON.stringify(['steel', 'kwang']) && state.bans.includes('muriel') && state.enemies.includes('gideon') && /Muriel/.test(state.toast);
    verdict('A7', !healed, {...state, planner_usable: usable});
    await context.close();
  },
  async B1(browser) {
    const {context, page} = await session(browser, desktop);
    await page.evaluate(() => changeRoute('meta'));
    await failTheNextCheck(page, 'f', () => markMain(page));
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !latestStatus.busy && !!latestStatus.errors?.length, null, {timeout: 120000});
    const state = await page.evaluate(() => ({withheld: B?.recommendation_context?.status === 'withheld', policy: E.performancePolicy().label, marker: !!document.querySelector('#audit-marker'),
      shows_review_state: /Patch or guidance needs review/.test(document.querySelector('#main').innerText)}));
    assert.ok(state.withheld, 'probe setup: the failed check did not withhold recommendations');
    verdict('B1', state.marker || !state.shows_review_state, {...state, meaning: 'fixed only if #main was redrawn after the failing manifest arrived AND shows the review-needed state'});
    await context.close();
  },
  async B3(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    await failTheNextCheck(page, 'e', () => markMain(page));
    await checkLikeAReturningTab(page);
    const state = await page.evaluate(() => ({withheld: B?.recommendation_context?.status === 'withheld', marker: !!document.querySelector('#audit-marker'),
      shows_paused_tiers: /Editorial tiers are paused/.test(document.querySelector('#main').innerText) && /paused/i.test(document.querySelector('.mobile-health')?.innerText || '')}));
    assert.ok(state.withheld, 'probe setup: the failed check did not withhold recommendations');
    verdict('B3', state.marker || !state.shows_paused_tiers, {...state, meaning: 'fixed only if the phone view was redrawn after the failing manifest arrived AND says tiers are paused'});
    await context.close();
  },
  async B2(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    const label = () => page.evaluate(() => (document.querySelector('.mobile-health strong')?.textContent || '').trim().toLowerCase());
    const before = await label();
    assert.equal(before, 'current', 'probe setup: a one-hour-old publication should read Current');
    await checkLikeAReturningTab(page, '49:00:00');
    const after = await label();
    verdict('B2', after === 'current', {before, after_49_hours_and_a_successful_check: after});
    await context.close();
  },
  async C1(browser) {
    const d = await session(browser, desktop);
    const desk = await d.page.evaluate(() => ({saved: E.performancePolicy().saved, strip: document.querySelector('#patch-strip').innerText, fetched: E.performancePolicy().fetched_at}));
    await d.page.evaluate(() => changeRoute('match'));
    const banner = await d.page.locator('#main details.note summary').first().innerText();
    await d.context.close();
    const m = await session(browser, phone);
    const home = await m.page.locator('#main').innerText();
    await m.context.close();
    assert.ok(desk.saved, 'probe setup: the committed seed should be older than the 48-hour window');
    const labelled = /saved statistics/i.test(desk.strip) && /saved role statistics, not a current ranking/i.test(banner) && /saved statistics, fetched/i.test(home) && /\bstale\b/i.test(home) && !/current role samples/i.test(home);
    verdict('C1', !labelled, {strip: desk.strip.replace(/\s+/g, ' ').slice(0, 120), banner: banner.slice(0, 90), phone_mentions_saved: /saved statistics, fetched/i.test(home)});
  },
  async C2(browser) {
    const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage();
    const fetched = await (await context.request.get(url + 'manifest.json')).json().then(m => Date.parse(m.cohorts.gold.generated_at));
    await page.clock.install({time: new Date(fetched + 3600000)});
    await page.goto(url);
    await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const state = await page.evaluate(() => ({saved: E.performancePolicy().saved, currency: E.performancePolicy().currency, strip: document.querySelector('#patch-strip').innerText}));
    verdict('C2', state.saved || /saved statistics/i.test(state.strip), {currency: state.currency, strip: state.strip.replace(/\s+/g, ' ').slice(0, 100)});
    await context.close();
  },
  async C3(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    await page.locator('#mobile-hero-search').click();
    await page.keyboard.type('ste');
    await failTheNextCheck(page, 'd', () => markMain(page));
    await checkLikeAReturningTab(page);
    const during = await page.evaluate(() => ({focused: document.activeElement?.id, value: document.querySelector('#mobile-hero-search')?.value, withheld: B?.recommendation_context?.status === 'withheld'}));
    assert.ok(during.withheld, 'probe setup: the failed check did not withhold recommendations');
    await page.keyboard.type('e');
    const typed = await page.evaluate(() => document.querySelector('#mobile-hero-search')?.value);
    await page.evaluate(() => document.activeElement.blur());
    await page.clock.fastForward(5000);
    const redrawn = await page.evaluate(() => !document.querySelector('#audit-marker'));
    verdict('C3', !(during.focused === 'mobile-hero-search' && during.value === 'ste' && typed === 'stee' && redrawn), {...during, after_typing_on: typed, redrawn_for_the_new_evidence: redrawn});
    await context.close();
  },
  /* C#1 from the review: WebKit fires no blur or focusout when a render replaces the focused field. A pending
     redraw must survive that, so the NEXT evidence change while typing is still redrawn when focus leaves. */
  async C5(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    await page.locator('#mobile-hero-search').click();
    await page.keyboard.type('st');
    // First evidence change while typing: the unchanged statistics become 'aging' (31 h), so a redraw is deferred.
    await checkLikeAReturningTab(page, '30:00:00');
    // Re-render while focus is in the field, with focus events suppressed the way WebKit behaves.
    await page.evaluate(() => {
      const stop = event => event.stopImmediatePropagation();
      for (const type of ['blur', 'focusout']) window.addEventListener(type, stop, {capture: true});
      render();
      for (const type of ['blur', 'focusout']) window.removeEventListener(type, stop, {capture: true});
    });
    await page.locator('#mobile-hero-search').click();
    await markMain(page);
    // Second evidence change while the field still has focus: the same statistics become 'stale' (49 h).
    await checkLikeAReturningTab(page, '18:00:00');
    const during = await page.evaluate(() => ({focused: document.activeElement?.id, state: E.evidenceState().statistics.state}));
    assert.equal(during.state, 'stale', 'probe setup: the statistics did not become stale');
    await page.evaluate(() => document.activeElement.blur());
    await page.clock.fastForward(5000);
    const redrawn = await page.evaluate(() => !document.querySelector('#audit-marker'));
    verdict('C5', !(during.focused === 'mobile-hero-search' && redrawn), {...during, redrawn_after_leaving_the_field: redrawn});
    await context.close();
  },
  async C4(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { B = {...B, scoped_statistics: {...B.scoped_statistics, status: 'retained'}}; E = MetaEngine.create(B); S.bracket = 'gold'; changeRoute('builds'); changeRoute('meta'); });
    const text = await page.locator('#main').innerText();
    verdict('C4', !(/Editorial tiers are paused for this role/i.test(text) && /ordered by (calculated tier, then )?role performance/i.test(text)), {excerpt: (text.match(/Editorial tiers[^\n]*/) || [''])[0].slice(0, 170)});
    await context.close();
  },
  /* Second review round. */
  async C6(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    await failTheNextCheck(page, 'b');
    await checkLikeAReturningTab(page);
    const paused = await page.evaluate(() => document.querySelector('.mobile-health')?.innerText || '');
    await checkLikeAReturningTab(page, '49:00:00');   // still failing, and the statistics on screen are now 50 hours old
    const later = await page.evaluate(() => document.querySelector('.mobile-health')?.innerText || '');
    verdict('C6', !/paused/i.test(paused) || /1h ago/.test(later), {badge_after_failure: paused.replace(/\s+/g, ' '), badge_after_49_hours: later.replace(/\s+/g, ' ')});
    await context.close();
  },
  async C7(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    await page.locator('#mobile-hero-search').click();
    await page.keyboard.type('ste');
    // The patch check fails while the bundle itself is unchanged: only the displayed overlay changes.
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...(m.patch_check || {}), status: 'failed'}; await route.fulfill({response, json: m}); });
    await checkLikeAReturningTab(page);
    const during = await page.evaluate(() => ({focused: document.activeElement?.id, value: document.querySelector('#mobile-hero-search')?.value, withheld: B?.recommendation_context?.status === 'withheld'}));
    assert.ok(during.withheld, 'probe setup: the failed patch check did not withhold recommendations');
    await page.keyboard.type('e');
    const typed = await page.evaluate(() => document.querySelector('#mobile-hero-search')?.value);
    verdict('C7', !(during.focused === 'mobile-hero-search' && typed === 'stee'), {...during, after_typing_on: typed});
    await context.close();
  },
  async C8(browser) {
    const {context, page} = await clockSession(browser, desktop);
    await page.evaluate(() => changeRoute('meta'));
    const target = page.locator('#main [data-hero]').first(), slug = await target.getAttribute('data-hero'), box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // An evidence change arrives while the button is held down (a real press lasts about 100 ms).
    await page.evaluate(() => { connectionLost = !connectionLost; redrawForEvidence(); });
    await page.waitForTimeout(120); await page.mouse.up();
    await page.waitForTimeout(150);
    const seen = await page.evaluate(() => ({route: S.route, hero: S.hero}));
    verdict('C8', !(seen.route === 'hero' && seen.hero === slug), {clicked: slug, ...seen});
    await context.close();
  },
  async C9(browser) {
    const {context, page} = await session(browser, desktop);
    await page.evaluate(() => { changeRoute('meta'); document.querySelector('#hero-search')?.focus(); });
    await page.keyboard.type('steel');
    const value = await page.evaluate(() => document.querySelector('#hero-search')?.value);
    verdict('C9', value !== 'steel', {typed: 'steel', field: value});
    await context.close();
  },
  /* Third review round. */
  async C10(browser) {
    const {context, page} = await clockSession(browser, desktop);
    await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'builds'; render(); });
    const id = await page.evaluate(() => { const select = document.querySelector('#main select[id]'); select?.focus(); return select?.id || null; });
    assert.ok(id, 'probe setup: the hero build view has no select to focus');
    await failTheNextCheck(page, '9', () => markMain(page));
    await checkLikeAReturningTab(page);
    const seen = await page.evaluate(() => ({focused: document.activeElement?.id, redrawn: !document.querySelector('#audit-marker'), withheld: B?.recommendation_context?.status === 'withheld'}));
    assert.ok(seen.withheld, 'probe setup: the failed check did not withhold recommendations');
    verdict('C10', !(seen.redrawn && seen.focused === id), {select: id, ...seen});
    await context.close();
  },
  async C11(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    await page.locator('#mobile-hero-search').click();
    await page.keyboard.type('st');
    await context.setOffline(true);
    await page.waitForTimeout(200);
    await page.keyboard.type('e');
    const seen = await page.evaluate(() => ({focused: document.activeElement?.id, value: document.querySelector('#mobile-hero-search')?.value}));
    await context.setOffline(false);
    verdict('C11', !(seen.focused === 'mobile-hero-search' && seen.value === 'ste'), seen);
    await context.close();
  },
  async C12(browser) {
    const {context, page} = await session(browser, desktop);
    await page.evaluate(() => changeRoute('changes'));
    await page.locator('#patch-search').click();
    await page.keyboard.type('steel');
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => { connectionLost = !connectionLost; redrawForEvidence(); });   // an evidence redraw
    const value = await page.evaluate(() => document.querySelector('#patch-search')?.value);
    verdict('C12', value !== 'steel', {filter_after_redraw: value});
    await context.close();
  },
  async C13(browser) {
    const {context, page} = await clockSession(browser, phone);
    await page.evaluate(() => changeRoute('meta'));
    // The patch check succeeds but finds new official content: the badge must not say the check failed.
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...(m.patch_check || {}), status: 'verified', signature: 'new-official-content'}; await route.fulfill({response, json: m}); });
    await checkLikeAReturningTab(page);
    const seen = await page.evaluate(() => ({withheld: B?.recommendation_context?.status === 'withheld', badge: document.querySelector('.mobile-health')?.innerText || ''}));
    assert.ok(seen.withheld, 'probe setup: new official content did not pause recommendations');
    verdict('C13', /check failed/i.test(seen.badge) || !/new official content/i.test(seen.badge), {badge: seen.badge.replace(/\s+/g, ' ')});
    await context.close();
  },
  /* E guards: the worker must return exactly what the engine returns, and the page must still work without one. */
  /* E#1/F#1 from the review: with a slow offline save, a second update check used to leave the new bundle on screen
     with the previous engine. The page is given a slow Cache API and two checks overlap. */
  async E5(browser) {
    const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage();
    await page.addInitScript(() => { const open = caches.open.bind(caches); caches.open = name => new Promise(r => setTimeout(r, 1500)).then(() => open(name)); });
    await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const manifest = await (await context.request.get(url + 'manifest.json')).json(), entry = manifest.cohorts.gold;
    const bundle = await (await context.request.get(url + entry.url)).json();
    bundle.generated_at = new Date(Date.parse(bundle.generated_at) + 60000).toISOString();
    const bytes = Buffer.from(JSON.stringify(bundle)), sha = require('crypto').createHash('sha256').update(bytes).digest('hex');
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); Object.assign(m.cohorts.gold, {sha256: sha, url: 'bundles/gold-' + sha + '.json', generated_at: bundle.generated_at}); delete m.cohorts.gold.projection; await route.fulfill({response, json: m}); });
    await page.route('**/bundles/gold-' + sha + '.json', route => route.fulfill({status: 200, contentType: 'application/json', body: bytes}));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(generated => B?.generated_at === generated, bundle.generated_at, {timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new Event('online')));   // a second check overlaps the slow save
    await page.waitForTimeout(4000);
    await page.waitForFunction(() => !latestStatus.busy, null, {timeout: 60000});
    const seen = await page.evaluate(() => ({shown: B.generated_at, engine_matches_shown: E.heroes === B.heroes}));
    verdict('E5', !seen.engine_matches_shown, seen);
    await context.close();
  },
  /* Third review round (2.25.0). */
  async G1(browser) {
    // 2.37.0: the review packet is a desktop tool; the phone More menu no longer offers it.
    const {context, page} = await session(browser, desktop);
    await page.evaluate(() => changeRoute('more'));
    const waiting = page.waitForEvent('download');
    await page.locator('#download-review-packet').click();
    const file = path.join(root, 'qa', 'audit-review-packet.json');
    await (await waiting).saveAs(file);
    const packet = JSON.parse(fs.readFileSync(file, 'utf8')), inBundle = await page.evaluate(() => (B.official_changes || []).length);
    assert.ok(inBundle > 0, 'probe setup: the seed bundle carries no official changes');
    const complete = (packet.official_changes || []).length === inBundle && packet.schema === 2 && Array.isArray(packet.brackets) && packet.brackets.some(b => b.bracket === 'gold' && /^[a-f0-9]{64}$/.test(b.sha256 || '')) && /^[a-f0-9]{64}$/.test(packet.reference_bundle?.sha256 || '');
    verdict('G1', !complete, {bundle_official_changes: inBundle, packet_official_changes: (packet.official_changes || []).length, packet_schema: packet.schema, plans: (packet.plans || []).length, brackets: (packet.brackets || []).length, reference_sha: !!packet.reference_bundle?.sha256});
    await context.close();
  },
  /* D: one failed Statz hero page. The page marks a role failed exactly as the publisher would
     (failed role, declared failed page, reconciled coverage) and rebuilds the engine from it. */
  async D1(browser) {
    const {context, page} = await session(browser, desktop);
    const seen = await page.evaluate(gap => {
      const row = B.tier_list.find(r => r.role === 'jungle'), other = B.tier_list.find(r => r.role === 'jungle' && r.slug !== row.slug);
      const before = E.performance({slug: other.slug, role: 'jungle'}, {source: 'statz'});
      eval(gap)(row.slug, 'jungle');
      openHero(row.slug, 'jungle');
      return {failed: row.slug, other: other.slug, before, after: E.performance({slug: other.slug, role: 'jungle'}, {source: 'statz'}),
        failedRole: E.performance({slug: row.slug, role: 'jungle'}, {source: 'statz'}), policy: E.performancePolicy().source,
        gap: E.statzGap(), text: document.querySelector('#main').innerText};
    }, GAP);
    assert.deepEqual(seen.after, seen.before, 'a collected role must keep exactly the numbers it had');
    const stated = /Statz observations partial \u00b7 1 of \d+ hero pages failed/.test(seen.text);
    verdict('D1', !(seen.failedRole === null && seen.gap?.failed === 1 && stated), {failed_role: seen.failed, failed_role_numbers: seen.failedRole, gap: seen.gap, stated});
    await context.close();
  },
  async D2(browser) {
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(gap => {
      const row = B.tier_list.find(r => r.role === 'jungle');
      eval(gap)(row.slug, 'jungle'); S.role = 'jungle'; changeRoute('builds'); changeRoute('meta');
      return {slug: row.slug, health: document.querySelector('.mobile-health')?.innerText || '', text: document.querySelector('#main').innerText};
    }, GAP);
    verdict('D2', !/1 hero page failed/.test(seen.health), {health: seen.health.replace(/\s+/g, ' ')});
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
  },
  /* Phase H (audit item 09): phone navigation and evidence presentation. */
  async M1(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { S.role = 'jungle'; companionPrefs.homeQuery = ''; changeRoute('meta'); });
    const eligible = await page.evaluate(() => Object.keys(E.heroes).filter(s => E.roles(s).includes('jungle')).sort());
    const list = page.locator('#mobile-all-list');
    let seen = {listed: [], unsampled_with_numbers: []};
    if (await list.count()) {
      seen = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#mobile-all-list [data-hero]')];
        const unsampled = cards.filter(c => !E.displayPerformance({slug: c.dataset.hero, role: 'jungle'})).map(c => c.closest('article')?.innerText || '');
        return {listed: cards.map(c => c.dataset.hero).sort(), unsampled: unsampled.length, unsampled_with_numbers: unsampled.filter(t => /%/.test(t)), expanded: document.querySelector('#mobile-all-heroes')?.getAttribute('aria-expanded')};
      });
    }
    const missing = eligible.filter(s => !seen.listed.includes(s));
    // The staged data samples every jungle hero, so withhold one hero's role sample and look at its card.
    const unsampled = seen.listed.length ? await page.evaluate(slug => {
      const original = E.displayPerformance;
      E.displayPerformance = p => p.slug === slug && p.role === 'jungle' ? null : original(p);
      try { render(); const card = document.querySelector(`#mobile-all-list [data-hero="${slug}"]`)?.closest('article'); return {slug, listed: !!card, text: (card?.innerText || '').replace(/\s+/g, ' ')}; }
      finally { E.displayPerformance = original; render(); }
    }, eligible[eligible.length - 1]) : {listed: false, text: ''};
    const invented = !unsampled.listed || /%/.test(unsampled.text) || !/No .*jungle sample/i.test(unsampled.text);
    verdict('M1', missing.length > 0 || seen.listed.length !== eligible.length || seen.unsampled_with_numbers.length > 0 || invented,
      {eligible: eligible.length, listed: seen.listed.length, missing: missing.slice(0, 5), unsampled_with_numbers: seen.unsampled_with_numbers.length, expanded: seen.expanded, no_sample_card: unsampled});
    await context.close();
  },
  async M2(browser) {
    const {context, page} = await session(browser, {...phone, viewport: {width: 320, height: 700}});
    await page.evaluate(() => { companionPrefs.large = true; companionChrome(); changeRoute('meta'); });
    const seen = await page.evaluate(() => {
      const b = document.querySelector('.mobile-health'), strong = b?.querySelector('strong'), size = strong ? parseFloat(getComputedStyle(strong).fontSize) : 0;
      return {text: (b?.innerText || '').replace(/\s+/g, ' '), badge_height: strong ? Math.round(strong.getBoundingClientRect().height) : 0, one_line_max: Math.round(size * 1.7)};
    });
    const named = /Fetched /i.test(seen.text) && /Statz dataset \d/i.test(seen.text) && /Game patch \d/i.test(seen.text);
    verdict('M2', !named || seen.badge_height > seen.one_line_max, {...seen, named});
    await context.close();
  },
  async M3(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { B.errors = [...(B.errors || []), {source: 'Probe source', severity: 'error', detail: 'A source could not be refreshed for this probe.'}]; Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); });
    const routes = ['meta', 'builds', 'planner', 'draft', 'live'], seen = {};
    for (const route of routes) {
      await page.evaluate(r => changeRoute(r), route);
      seen[route] = await page.evaluate(() => {
        const n = document.querySelector('#mobile-limits');
        if (!n || n.hidden) return {shown: false};
        const r = n.getBoundingClientRect();
        return {shown: r.height > 0 && getComputedStyle(n).display !== 'none', height: Math.round(r.height), text: n.innerText.split('\n')[0]};
      });
    }
    const missing = routes.filter(r => !seen[r].shown), tall = routes.filter(r => seen[r].shown && seen[r].height > 96);
    verdict('M3', missing.length > 0 || tall.length > 0, {missing, tall, meta: seen.meta});
    await context.close();
  },
  async M8(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { S.role = 'jungle'; S.query = ''; changeRoute('builds'); });
    await page.locator('#main details.mobile-build-row summary').first().click();
    const before = await page.evaluate(() => document.querySelector('#main details.mobile-build-row')?.open);
    await page.evaluate(() => requestRedraw(true));
    const after = await page.evaluate(() => document.querySelector('#main details.mobile-build-row')?.open);
    verdict('M8', !(before && after), {before, after});
    await context.close();
  },
  async M10(browser) {
    // A section opened on one screen must not open the matching section on another screen or another hero.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => openHero('steel', 'jungle'));
    const draftOpened = await page.evaluate(() => { const d = document.querySelector('#main details[data-keep="skill-reason"]'); if (d) d.open = true; return !!d?.open; });
    await page.evaluate(() => { const other = Object.keys(E.heroes).sort().find(s => s !== 'steel' && E.roles(s).includes('jungle')); openHero(other, 'jungle'); });
    const planner = await page.evaluate(() => document.querySelector('#main details[data-keep="skill-reason"]')?.open ?? null);
    const desktopPage = await context.newPage();
    await desktopPage.setViewportSize({width: 1440, height: 900});
    await desktopPage.goto(url); await desktopPage.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const hero = await desktopPage.evaluate(() => {
      openHero('steel', 'jungle'); document.querySelectorAll('#main details').forEach(d => { d.open = true; });
      const other = Object.keys(E.heroes).sort().find(s => s !== 'steel' && E.roles(s).includes('jungle'));
      openHero(other, 'jungle');
      const all = [...document.querySelectorAll('#main details')];
      return {other, open: all.filter(d => d.open).length, total: all.length};
    });
    // Reference: the same hero opened fresh, with nothing opened before.
    const fresh = await desktopPage.evaluate(o => { changeRoute('meta'); openHero(o, 'jungle'); return [...document.querySelectorAll('#main details')].filter(d => d.open).length; }, hero.other);
    verdict('M10', !draftOpened || planner !== false || hero.open !== fresh, {first_hero_reason_opened: draftOpened, second_hero_reason_open: planner, other_hero_open_sections: hero.open, fresh_open_sections: fresh, total: hero.total});
    await context.close();
  },
  async M11(browser) {
    // "Open Sources & accuracy" from the limitations list lands the user on that page, not back on the limitations bar.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { B.errors = [...(B.errors || []), {source: 'Probe source', severity: 'warning', detail: 'A source note for this probe.'}]; changeRoute('meta'); });
    await page.locator('#mobile-limits').click();
    await page.locator('#detail [data-limits-sources]').click();
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => ({route: S.route, focused: document.activeElement?.id || document.activeElement?.tagName, in_main: !!document.querySelector('#main')?.contains(document.activeElement), dialog: !!document.querySelector('#detail')?.open}));
    verdict('M11', !(seen.route === 'data' && seen.in_main && !seen.dialog), seen);
    await context.close();
  },
  /* 2.26.1: findings from the live verification of 2.26.0. */
  async P1(browser) {
    // Two sources that fail with the same text are two limitations, not one.
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => {
      B.errors = [...(B.errors || []), {source: 'Probe source A', severity: 'error', detail: 'Same failure text.'}, {source: 'Probe source B', severity: 'error', detail: 'Same failure text.'}];
      changeRoute('builds'); changeRoute('meta');
      const items = limitationItems();
      return {a: items.some(i => i.source === 'Probe source A'), b: items.some(i => i.source === 'Probe source B'), line: document.querySelector('#mobile-limits strong')?.innerText || ''};
    });
    verdict('P1', !(seen.a && seen.b), seen);
    await context.close();
  },
  async P4(browser) {
    // A fetch time ahead of this device's clock is never described as "less than 1h ago".
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => {
      const s = B.sources.statz_hero_pages, saved = s.fetched_at, health = latestStatus.health;
      s.fetched_at = new Date(Date.now() + 2 * 3600000).toISOString(); latestStatus.health = null;
      try { changeRoute('builds'); changeRoute('meta'); return {text: (document.querySelector('.mobile-health')?.innerText || '').replace(/\s+/g, ' ')}; }
      finally { s.fetched_at = saved; latestStatus.health = health; }
    });
    verdict('P4', /less than 1h ago/i.test(seen.text) || !/Fetched/i.test(seen.text), seen);
    await context.close();
  },
  async P5(browser) {
    // The role-list status, lead and full list give the real reason for missing numbers: too few games, a statistics page
    // that failed to load or was never collected (Pred.gg or Statz), statistics paused or unavailable.
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => {
      const roleStatus = () => { const s = document.querySelector('#mobile-role-list'); return {tiles: s ? [...s.querySelectorAll('.mobile-hero-card')].filter(c=>/%/.test(c.innerText)&&!/small sample/.test(c.innerText)).length : null, text: (document.querySelector('#meta-order-status')?.innerText || '').replace(/\s+/g, ' ')}; };
      const lead = () => (document.querySelector('#main .page-head p')?.innerText || '').replace(/\s+/g, ' ');
      const list = () => { return (document.querySelector('#mobile-all-list')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160); };
      const view = role => { S.role = role; companionPrefs.homeQuery = ''; changeRoute('builds'); changeRoute('meta'); return {top: roleStatus(), lead: lead(), list: list(), reason: statsReason(Object.keys(E.heroes).find(s => E.roles(s).includes(role)), role)}; };
      const saved = B, original = E.performance, originalDisplay = E.displayPerformance, out = {};
      try {
        E.displayPerformance = p => E.performance(p); // sample-size fixture, both display and ranking
        E.performance = p => { const r = original(p); return p.role === 'jungle' && r ? {...r, played: Math.min(r.played, 60)} : r; };
        out.none = view('jungle').top;
        let first = null;
        E.performance = p => { const r = original(p); if (p.role !== 'jungle' || !r) return r; first = first || p.slug; return {...r, played: p.slug === first ? Math.max(r.played, 150) : Math.min(r.played, 60)}; };
        out.one = view('jungle').top;
        E.performance = original; E.displayPerformance = originalDisplay;
        // Pred.gg source: jungle failed, support never collected (the collector stops after a block).
        const roles = {...(B.scoped_statistics.roles || {}), jungle: {status: 'failed'}}; delete roles.support;
        B = {...saved, scoped_statistics: {...saved.scoped_statistics, status: 'partial', roles}}; E = MetaEngine.create(B);
        out.pred_source = E.performancePolicy().source;
        out.pred_failed = view('jungle'); out.pred_missing = view('support');
        // Statz source (Pred.gg failed): every jungle hero page failed.
        B = {...saved, scoped_statistics: {...saved.scoped_statistics, status: 'failed'}, heroes: Object.fromEntries(Object.entries(saved.heroes).map(([slug, h]) => [slug, h.roles?.jungle ? {...h, roles: {...h.roles, jungle: {...h.roles.jungle, status: 'failed'}}} : h]))};
        E = MetaEngine.create(B); out.statz_source = E.performancePolicy().source;
        out.statz_failed = view('jungle');
        B = {...saved, recommendation_context: {status: 'withheld', reason: 'Probe: the official patch check failed.'}}; E = MetaEngine.create(B);
        out.withheld = view('jungle');
        B = {...saved, scoped_statistics: {...saved.scoped_statistics, status: 'failed'}, patch: '1.15'}; E = MetaEngine.create(B);
        out.unavailable = view('jungle'); out.unavailable_verification = E.evidenceState().verification.state;
      } finally { E.performance = original; B = saved; E = MetaEngine.create(B); render(); }
      return out;
    });
    const failedOK = v => v.reason === 'failed' && v.top.tiles === 0 && /failed to load/i.test(v.top.text) && !/100 or more/i.test(v.top.text) && /failed to load/i.test(v.list) && !/No [^ ]+ [a-z]+ sample/i.test(v.list) && !/ordered by role performance/i.test(v.lead);
    const ok = seen.none.tiles === 0 && /100 or more/i.test(seen.none.text) && /Only 1 jungle hero has /.test(seen.one.text)
      && seen.pred_source === 'pred' && failedOK(seen.pred_failed) && failedOK(seen.pred_missing)
      && seen.statz_source === 'statz' && failedOK(seen.statz_failed)
      && /paused/i.test(seen.withheld.top.text) && !/100 or more/i.test(seen.withheld.top.text) && !/ordered by role performance/i.test(seen.withheld.lead) && !/Role performance in/i.test(seen.withheld.top.text) && /previous dataset/i.test(seen.withheld.list) && seen.withheld.reason === 'paused'
      && seen.unavailable_verification === 'verified' && /unavailable/i.test(seen.unavailable.top.text) && !/paused/i.test(seen.unavailable.top.text + ' ' + seen.unavailable.list);
    verdict('P5', !ok, seen);
    await context.close();
  },
  async P6(browser) {
    // The hero page names the source of the numbers next to a paused or retained review status.
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => { openHero('steel', 'jungle'); const p = E.performance({slug: 'steel', role: 'jungle'}); return {source: p?.source || null, line: (document.querySelector('.mobile-hero-head p')?.innerText || '').replace(/\s+/g, ' ')}; });
    verdict('P6', !(seen.source && seen.line.includes(seen.source + ' ')), seen);
    await context.close();
  },
  async P7(browser) {
    // GUARD: the website never calls the definition review current when the official patch content changed after
    // this collection (a hotfix edits the article; the version number stays the same). On a controlled clock the check is
    // recent, so the changed signature is the only difference from a confirmed review.
    const {context, page} = await clockSession(browser, desktop);
    const control = await page.evaluate(() => definitionReviewStatus());
    assert.equal(control, 'reviewed for current patch', 'probe setup: without changed content the review is confirmed');
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), manifest = await response.json(); manifest.patch_check = {...manifest.patch_check, signature: 'f'.repeat(64)}; await route.fulfill({response, json: manifest}); });
    await checkLikeAReturningTab(page);
    const seen = await page.evaluate(() => { changeRoute('data'); return {reviewed: B.definition_review?.status || null, guidance: B.guidance?.status || null, status: definitionReviewStatus(), shown_current: /reviewed for current patch\s*·\s*v/i.test(document.querySelector('#main').innerText)}; });
    assert.equal(seen.reviewed, 'reviewed for current patch', 'probe setup: the seed carries a current definition review');
    verdict('P7', seen.status === 'reviewed for current patch' || seen.shown_current, {control, ...seen});
    await context.close();
  },
  async P8(browser) {
    // Review dates are shown as dates, not raw timestamps: on the pages and in the two review dialogs.
    const {context, page} = await session(browser, desktop);
    const seen = await page.evaluate(() => {
      const iso = /.{0,30}\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.{0,10}/g, out = {}, find = el => ((el?.innerText || '').match(iso) || []).slice(0, 3);
      for (const r of ['data', 'guidance', 'meta']) { changeRoute(r); document.querySelectorAll('#main details').forEach(d => { d.open = true; }); out[r] = find(document.querySelector('#main')); }
      changeRoute('meta'); const decision = document.querySelector('[data-meta-decision]'); if (decision) { decision.click(); out.tier_dialog = find(document.querySelector('#detail-body')); document.querySelector('#detail').close(); } else out.tier_dialog = ['probe setup: no tier decision'];
      let opened = false;
      for (const key of Object.keys(B.perks || {})) { showCatalog('perks', key); if (/reviewed/i.test(document.querySelector('#detail-body')?.innerText || '')) { opened = true; out.definition_dialog = find(document.querySelector('#detail-body')); document.querySelector('#detail').close(); break; } document.querySelector('#detail').close(); }
      if (!opened) out.definition_dialog = ['probe setup: no reviewed definition'];
      openHero('steel', 'jungle'); document.querySelectorAll('#main details').forEach(d => { d.open = true; }); out.hero = find(document.querySelector('#main'));
      return out;
    });
    verdict('P8', Object.values(seen).some(list => list.length > 0), seen);
    await context.close();
  },
  async P9(browser) {
    // At 320 px with large text the rank select shows its whole label, Match's hero search is full width, and a
    // hero tile with a long reason text keeps a readable name column.
    const {context, page} = await session(browser, {...phone, viewport: {width: 320, height: 700}});
    await page.evaluate(() => { companionPrefs.large = true; companionChrome(); Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('match'); });
    const rank = await page.evaluate(() => { const s = document.querySelector('#bracket'); return {width: Math.round(s.getBoundingClientRect().width), text: s.options[s.selectedIndex]?.text || ''}; });
    const dialog = await page.evaluate(() => ({select: Math.round(document.querySelector('#match-search')?.getBoundingClientRect().width || 0), body: Math.round(document.querySelector('#main')?.getBoundingClientRect().width || 0)}));
    const tile = await page.evaluate(() => {
      const saved = B; B = {...B, scoped_statistics: {...B.scoped_statistics, status: 'failed'}, patch: '1.15'}; E = MetaEngine.create(B);
      try { S.role = 'jungle'; changeRoute('builds'); changeRoute('meta');
        const name = document.querySelector('#mobile-all-list .mobile-hero-card .hero-cell .name'); return {text: name?.closest('article')?.innerText.replace(/\s+/g, ' '), nameWidth: Math.round(name?.getBoundingClientRect().width || 0)}; }
      finally { B = saved; E = MetaEngine.create(B); render(); }
    });
    const rate = await page.evaluate(() => {
      companionPrefs.favorites = ['akeron|jungle']; S.role = 'jungle'; changeRoute('builds'); changeRoute('meta');
      return [...document.querySelectorAll('#main .mobile-hero-card .mobile-stat strong')].map(s => { const lh = parseFloat(getComputedStyle(s).lineHeight) || parseFloat(getComputedStyle(s).fontSize) * 1.3; return {text: s.innerText, lines: Math.round(s.getBoundingClientRect().height / lh)}; }).filter(r => r.lines > 1).slice(0, 3);
    });
    verdict('P9', rank.width < 140 || dialog.select < dialog.body * 0.7 || tile.nameWidth < 60 || rate.length > 0, {rank, dialog, tile, split_rates: rate});
    await context.close();
  },
  async P10(browser) {
    // Light theme: the pressed build-variant buttons on the hero page meet WCAG AA contrast.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => localStorage.setItem('predecessor-theme', 'light'));
    await page.reload(); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    // Open the first hero whose build tab offers at least two variants, with two pressed.
    await page.evaluate(() => { for (const slug of Object.keys(E.heroes).sort()) for (const role of E.roles(slug)) { S.variants = [0, 1]; save(); openHero(slug, role); if (document.querySelectorAll('[data-variant][aria-pressed="true"]').length >= 2) return; } });
    await page.addScriptTag({path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')});
    const seen = await page.evaluate(async () => { const r = await axe.run(document.querySelector('#main'), {runOnly: {type: 'rule', values: ['color-contrast']}}); return {theme: document.documentElement.dataset.theme, pressed: document.querySelectorAll('[data-variant][aria-pressed="true"]').length, violations: r.violations.flatMap(v => v.nodes.map(n => n.target.join(' '))).slice(0, 5)}; });
    verdict('P10', seen.violations.length > 0 || !seen.pressed, seen);
    await context.close();
  },
  async P11(browser) {
    // Offline, choosing a rank says truthfully whether it is saved on this device, and never promises offline use
    // (a reload that opens it, or saving it for later) when offline support is not active in this browser.
    const offlineChoice = async prepare => {
      const {context, page} = await session(browser, phone);
      await page.evaluate(prepare);
      await context.setOffline(true);
      await page.evaluate(() => { const s = document.querySelector('#bracket'); s.value = 'diamond'; s.dispatchEvent(new Event('change', {bubbles: true})); });
      await page.waitForTimeout(1500);
      await page.waitForFunction(() => !latestStatus.busy, null, {timeout: 30000}).catch(() => {});
      const seen = await page.evaluate(async () => ({loaded: !!B, worker: !!(await navigator.serviceWorker?.getRegistration?.()), text: document.querySelector('#main').innerText.replace(/\s+/g, ' ').slice(0, 260)}));
      await context.close();
      return seen;
    };
    const unsaved = await offlineChoice(() => {});
    const saved = await offlineChoice(async () => { const c = await caches.open('predecessor-meta-data-v1'); await c.put(new URL('bundles/diamond-' + 'a'.repeat(64) + '.json', location.href).href, new Response('{}')); });
    assert.equal(saved.worker, false, 'probe setup: no service worker in these contexts');
    const bad = !/not saved on this device/i.test(unsaved.text) || /keep it for offline use/i.test(unsaved.text) || !/offline support is not active/i.test(unsaved.text)
      || /not saved on this device/i.test(saved.text) || !/saved on this device/i.test(saved.text) || /reload/i.test(saved.text);
    verdict('P11', bad, {unsaved, saved});
  },
  async P13(browser) {
    // A redraw keeps keyboard focus on the control the user was on (Match's hero search), and never moves it to
    // another copy of the same hero elsewhere on the page.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('match'); });
    await page.locator('#match-search').focus();
    await page.evaluate(() => requestRedraw(true));
    const slot = await page.evaluate(() => ({id: document.activeElement?.id || null}));
    const hero = await page.evaluate(() => {
      S.role = 'jungle'; companionPrefs.homeQuery = ''; companionPrefs.favorites=['steel|jungle']; changeRoute('meta');
      const inTop = document.querySelector('#mobile-favorites [data-hero]');
      const copy = inTop && [...document.querySelectorAll('#mobile-all-list [data-hero]')].find(b => b.dataset.hero === inTop.dataset.hero);
      copy?.focus(); requestRedraw(true);
      const a = document.activeElement;
      return {hero: copy?.dataset.hero || null, inList: !!a?.closest('#mobile-all-list'), inTopFive: !!a?.closest('section') && !a.closest('#mobile-all-list') && !!a.dataset?.hero};
    });
    const moved = await page.evaluate(() => {
      const top = document.querySelector('#mobile-favorites [data-hero]');
      const hero = top?.dataset.hero, copy = [...document.querySelectorAll('#mobile-all-list [data-hero]')].find(b => b.dataset.hero === hero);
      copy?.focus();
      const original = E.performance; E.performance = p => { const r = original(p); return p.slug === hero && p.role === 'jungle' && r ? {...r, played: 50} : r; };
      try { requestRedraw(true); const a = document.activeElement; return {hero, focused: a?.dataset?.hero || a?.tagName, inList: !!a?.closest('#mobile-all-list')}; }
      finally { E.performance = original; }
    });
    verdict('P13', slot.id !== 'match-search' || !hero.hero || !hero.inList || hero.inTopFive || !(moved.focused === moved.hero && moved.inList), {slot, hero, moved});
    await context.close();
  },
  async P15(browser) {
    // When only the live check is pending (a saved copy in the Windows app), the phone status chip says Paused and why,
    // in agreement with the rest of the page.
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => {
      const saved = B, chipFor = status => { B = {...saved, guidance: {...saved.guidance, status}}; E = MetaEngine.create(B); changeRoute('builds'); changeRoute('meta'); return (document.querySelector('.mobile-health')?.innerText || '').replace(/\s+/g, ' '); };
      try { const chip = chipFor('reviewed for saved patch; live check pending'), policy = E.performancePolicy().label, verification = E.evidenceState().verification.state; const failedChip = chipFor('reviewed for saved patch; live verification failed'); return {policy, verification, chip, failedChip}; }
      finally { B = saved; E = MetaEngine.create(B); render(); }
    });
    assert.equal(seen.policy, 'Verification required', 'probe setup: a saved-patch guidance status pauses statistics');
    verdict('P15', !/paused/i.test(seen.chip) || !/live check pending/i.test(seen.chip) || !/paused/i.test(seen.failedChip) || !/failed/i.test(seen.failedChip) || /pending/i.test(seen.failedChip), seen);
    await context.close();
  },
  // ---- Audit item 11: the page starts from a compact core and fetches display-only evidence when a view needs it.
  async I1(browser) {
    // At startup the page downloads the compact core, never the full bundle, and the core is a fraction of it.
    const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage(), requested = [];
    page.on('request', r => { if (r.url().includes('/bundles/')) requested.push(r.url().split('/').pop()); });
    const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
    assert.ok(entry.projection?.core, 'probe setup: the staged publication has a compact core');
    await page.goto(url);
    await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const fullBytes = (await (await context.request.get(url + entry.url)).body()).length, name = u => u.split('/').pop();
    const seen = {requested: requested.map(r => r.replace(/-[a-f0-9]{64}\.json$/, '')), core_bytes: entry.projection.core.bytes, full_bytes: fullBytes};
    verdict('I1', !requested.includes(name(entry.projection.core.url)) || requested.includes(name(entry.url)) || requested.some(r => /-(?:hero-[a-z0-9-]+|shared|catalog|history)-[a-f0-9]{64}\.json$/.test(r)) || entry.projection.core.bytes > fullBytes * 0.45, seen);
    await context.close();
  },
  async I2(browser) {
    // A hero view says its evidence is loading, then shows exactly what the full bundle holds; engine results do not change.
    const {context, page} = await session(browser, desktop);
    const before = await page.evaluate(() => { const planned = JSON.stringify(E.plannedBuild('steel', 'jungle')); openHero('steel', 'jungle'); return {planned, loadingShown: !!document.querySelector('#main .annex-loading')}; });
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000});
    const after = await page.evaluate(async () => {
      const manifest = await (await fetch('manifest.json', {cache: 'no-store'})).json(), full = await (await fetch(manifest.cohorts.gold.url)).json();
      return {planned: JSON.stringify(E.plannedBuild('steel', 'jungle')), heroMatches: JSON.stringify(B.heroes.steel) === JSON.stringify(full.heroes.steel),
        roleDataMatches: JSON.stringify(B.pred_game_data?.role_data?.steel) === JSON.stringify(full.pred_game_data?.role_data?.steel),
        failedNote: /could not be loaded/.test(document.querySelector('#main').innerText)};
    });
    const {planned, ...shown} = after;
    verdict('I2', !before.loadingShown || !after.heroMatches || !after.roleDataMatches || after.failedNote || planned !== before.planned, {loadingShown: before.loadingShown, ...shown, engineUnchanged: planned === before.planned});
    await context.close();
  },
  async I3(browser) {
    // Evidence that does not match its published checksum is refused and named; Reload latest data retries it.
    const {context, page} = await session(browser, desktop);
    await page.route('**/bundles/gold-hero-grux-*.json', async route => {
      const response = await route.fetch(), value = await response.json();
      value.heroes = {...value.heroes, grux: {...value.heroes?.grux, tampered: true}};
      await route.fulfill({response, json: value});
    });
    await page.evaluate(() => openHero('grux', 'offlane'));
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
    const refused = await page.evaluate(() => ({merged: 'tampered' in B.heroes.grux, named: /could not be loaded[^.]*checksum/i.test(document.querySelector('#main').innerText), stillLoading: !!document.querySelector('#main .annex-loading')}));
    await page.unroute('**/bundles/gold-hero-grux-*.json');
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !latestStatus.busy && !document.querySelector('#main .annex-loading') && !/could not be loaded/.test(document.querySelector('#main').innerText), null, {timeout: 60000}).catch(() => {});
    const retried = await page.evaluate(() => ({failedNote: /could not be loaded/.test(document.querySelector('#main').innerText), merged: 'tampered' in B.heroes.grux}));
    verdict('I3', refused.merged || !refused.named || refused.stillLoading || retried.failedNote || retried.merged, {refused, retried});
    await context.close();
  },
  async I4(browser) {
    // Export saves the complete publication even when no evidence has been opened yet.
    const {context, page} = await session(browser, desktop);
    const waiting = page.waitForEvent('download');
    await page.locator('#export').click();
    const html = fs.readFileSync(await (await waiting).path(), 'utf8'), match = html.match(/const INITIAL_BUNDLE=(.*?); const APP_CONFIG=/s);
    const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
    const full = JSON.stringify(JSON.parse(await (await context.request.get(url + entry.url)).text()));
    const exported = match ? JSON.stringify(JSON.parse(match[1])) : null;
    verdict('I4', exported !== full, {exported_bytes: exported?.length || 0, full_bytes: full.length});
    await context.close();
  },
  async I5(browser) {
    // A redraw while a rank comparison downloads (evidence arriving on the Data page causes one) keeps the comparison.
    const {context, page} = await session(browser, desktop);
    await page.evaluate(() => changeRoute('data'));
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route('**/bundles/gold-*.json', async route => { await held; await route.continue(); });
    await page.locator('#compare-bracket').selectOption('gold');
    await page.waitForTimeout(300);
    await page.evaluate(() => render());
    release();
    await page.waitForSelector('#comparison-output table', {timeout: 30000}).catch(() => {});
    const seen = await page.evaluate(() => ({table: !!document.querySelector('#comparison-output table'), selected: document.querySelector('#compare-bracket')?.value}));
    verdict('I5', !seen.table || seen.selected !== 'gold', seen);
    await context.close();
  },
  async I6(browser) {
    // When the full publication cannot be downloaded, export assembles the core with every evidence file it can
    // verify, and a snapshot that lacks some says so when opened (instead of calling that evidence unavailable).
    const {context, page} = await session(browser, desktop);
    const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
    const full = JSON.stringify(JSON.parse(await (await context.request.get(url + entry.url)).text()));
    await page.route('**/bundles/gold-' + entry.sha256 + '.json', route => route.abort());
    let saved = 0;
    const exportOnce = async () => {
      const waiting = page.waitForEvent('download');
      await page.locator('#export').click();
      const file = path.join(root, 'qa', 'i6-export-' + (++saved) + '.html');   // an .html name, so the browser opens it as a page
      await (await waiting).saveAs(file);
      const html = fs.readFileSync(file, 'utf8');
      const match = html.match(/const INITIAL_BUNDLE=(.*?); const APP_CONFIG=(\{[^;]*\});/s);
      return {file, bundle: match && JSON.stringify(JSON.parse(match[1])), config: match ? JSON.parse(match[2]) : null};
    };
    const complete = await exportOnce();
    await page.route('**/bundles/gold-hero-grux-*.json', route => route.abort());
    const partial = await exportOnce();
    const opened = await context.newPage();
    await opened.goto('file:///' + partial.file.replaceAll('\\', '/'));
    await opened.waitForFunction(() => !!B, null, {timeout: 60000});
    const note = await opened.evaluate(() => /saved without 1 of its detailed evidence files/.test(document.body.innerText));
    const seen = {completeEqualsFull: complete.bundle === full, completeMissing: complete.config?.missing_evidence ?? 0, partialMissing: partial.config?.missing_evidence ?? 0, noteShown: note};
    verdict('I6', !seen.completeEqualsFull || seen.completeMissing !== 0 || seen.partialMissing !== 1 || !note, seen);
    await context.close();
  },
  async I7(browser) {
    // An update check while a hero's evidence downloads (the same publication) keeps that evidence: the view shows it.
    const {context, page} = await session(browser, desktop);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route('**/bundles/gold-hero-steel-*.json', async route => { await held; await route.continue(); });
    await page.evaluate(() => openHero('steel', 'jungle'));
    await page.waitForSelector('#main .annex-loading', {timeout: 10000});
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !latestStatus.busy, null, {timeout: 60000});
    release();
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 20000}).catch(() => {});
    const seen = await page.evaluate(async () => {
      const manifest = await (await fetch('manifest.json', {cache: 'no-store'})).json(), full = await (await fetch(manifest.cohorts.gold.url)).json();
      return {stillLoading: !!document.querySelector('#main .annex-loading'), heroMatches: JSON.stringify(B.heroes.steel) === JSON.stringify(full.heroes.steel)};
    });
    verdict('I7', seen.stillLoading || !seen.heroMatches, seen);
    await context.close();
  },
  async I8(browser) {
    // Shared evidence (Data and Sources views, catalog dialogs): a failure is named in the evidence part only, the rest of
    // the view still shows; Reload latest data retries; a dialog opened before the evidence arrives fills in when it does.
    const {context, page} = await session(browser, desktop);
    const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
    const full = JSON.parse(await (await context.request.get(url + entry.url)).text());
    const item = Object.keys(full.items || {}).find(k => full.items[k]?.pred_raw);
    assert.ok(item, 'probe setup: an item with an original Pred.gg definition');
    await page.route(SHARED_FILES, route => route.abort());
    await page.evaluate(() => changeRoute('data'));
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading') && /could not be loaded/.test(document.querySelector('#main').innerText), null, {timeout: 30000}).catch(() => {});
    const failed = await page.evaluate(() => ({named: /could not be loaded/.test(document.querySelector('#main').innerText), summaryShown: !B.definition_review || /Official description review/.test(document.querySelector('#main').innerText)}));
    await page.unroute(SHARED_FILES);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(SHARED_FILES, async route => { await held; await route.continue(); });
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !latestStatus.busy, null, {timeout: 60000});
    await page.evaluate(key => showCatalog('items', key), item);
    const dialogWaited = await page.evaluate(() => document.querySelector('#detail').open && !!document.querySelector('#detail-body .annex-loading'));
    release();
    await page.waitForFunction(() => !document.querySelector('#detail-body .annex-loading') && !document.querySelector('#main .annex-loading'), null, {timeout: 30000}).catch(() => {});
    const loaded = await page.evaluate(history => ({dialogFilled: /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText), stillOpen: document.querySelector('#detail').open,
      historyMatches: JSON.stringify(B.official?.definition_history) === history, failureCleared: !/could not be loaded/.test(document.querySelector('#main').innerText)}), JSON.stringify(full.official?.definition_history));
    const seen = {...failed, dialogWaited, ...loaded};
    verdict('I8', !failed.named || !failed.summaryShown || !dialogWaited || !loaded.dialogFilled || !loaded.stillOpen || !loaded.historyMatches || !loaded.failureCleared, seen);
    await context.close();
  },
  async I9(browser) {
    // Evidence the server no longer has (404 after a redeploy) is named, triggers at most one check for the new
    // publication, and never a request loop (no service worker here, as in private windows and in-app browsers) - even
    // when that check fails too and the last successful check is more than a minute old, as during a deploy.
    const {context, page} = await clockSession(browser, desktop);
    let evidence = 0, manifests = 0;
    await page.route('**/manifest.json', route => { manifests++; return route.abort(); });
    await page.route('**/bundles/gold-hero-steel-*.json', route => { evidence++; return route.fulfill({status: 404, body: 'Not found'}); });
    await page.clock.fastForward('01:01');
    await page.evaluate(() => openHero('steel', 'jungle'));
    await page.waitForTimeout(6000);
    const seen = await page.evaluate(() => ({named: /website was updated after this page loaded/.test(document.querySelector('#main').innerText), stillLoading: !!document.querySelector('#main .annex-loading')}));
    Object.assign(seen, {evidenceRequests: evidence, manifestRequests: manifests});
    verdict('I9', !seen.named || seen.stillLoading || evidence > 2 || manifests > 2, seen);
    await context.close();
  },
  async I10(browser) {
    // A dialog showing that its evidence failed fills in when the evidence arrives on a retry (the connection returning).
    const {context, page} = await session(browser, desktop);
    const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
    const full = JSON.parse(await (await context.request.get(url + entry.url)).text());
    const item = Object.keys(full.items || {}).find(k => full.items[k]?.pred_raw);
    await page.route(SHARED_FILES, route => route.abort());
    await page.evaluate(key => showCatalog('items', key), item);
    await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
    const failed = await page.evaluate(() => !!document.querySelector('#detail-body .annex-failed'));
    await page.unroute(SHARED_FILES);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText), null, {timeout: 30000}).catch(() => {});
    const seen = {failedShown: failed, filled: await page.evaluate(() => /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText) && document.querySelector('#detail').open)};
    verdict('I10', !seen.failedShown || !seen.filled, seen);
    await context.close();
  },
  async I11(browser) {
    // The kit tab shows its core parts (source, augments, main attributes) while the attribute evidence downloads.
    const {context, page} = await session(browser, desktop);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route('**/bundles/gold-hero-grux-*.json', async route => { await held; await route.continue(); });
    await page.evaluate(() => { S.heroTab = 'kit'; openHero('grux', 'offlane'); S.heroTab = 'kit'; render(); });
    await page.waitForSelector('#main .annex-loading', {timeout: 10000}).catch(() => {});
    const early = await page.evaluate(() => ({augments: /Hero augments/.test(document.querySelector('#main').innerText), loading: !!document.querySelector('#main .annex-loading')}));
    release();
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 30000}).catch(() => {});
    const later = await page.evaluate(() => ({loading: !!document.querySelector('#main .annex-loading'), attributes: !!B.heroes.grux?.pred_attributes}));
    const seen = {early, later};
    verdict('I11', !early.augments || !early.loading || later.loading || !later.attributes, seen);
    await context.close();
  },
  async I12(browser) {
    // A dialog showing that its evidence is gone (404 after a redeploy) is rebuilt when the new publication loads.
    const {context, page} = await session(browser, desktop);
    const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
    const full = JSON.parse(await (await context.request.get(url + entry.url)).text());
    const item = Object.keys(full.items || {}).find(k => full.items[k]?.pred_raw);
    // The "new publication": the same data published without evidence files, so the page loads the full bundle.
    // It arrives a moment after the failure is shown, as a real check does.
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); delete m.cohorts.gold.projection; await new Promise(r => setTimeout(r, 1000)); await route.fulfill({response, json: m}); });
    await page.route(SHARED_FILES, route => route.fulfill({status: 404, body: 'Not found'}));
    await page.evaluate(key => showCatalog('items', key), item);
    await page.waitForFunction(() => /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText), null, {timeout: 30000}).catch(() => {});
    const seen = await page.evaluate(() => ({filled: /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText), failedShown: !!document.querySelector('#detail-body .annex-failed'), open: document.querySelector('#detail').open}));
    verdict('I12', !seen.filled || seen.failedShown || !seen.open, seen);
    await context.close();
  },
  async I13(browser) {
    // Evidence that failed while the saved copy was being served is retried when the connection is back, even without
    // an 'online' event (for example Wi-Fi without internet, or a server outage, while the device reports a connection).
    const {context, page} = await clockSession(browser, desktop);
    await page.route('**/manifest.json', async route => { const response = await route.fetch(); await route.fulfill({response, headers: {...response.headers(), 'x-predecessor-cache': 'offline'}}); });
    await checkLikeAReturningTab(page);
    await page.route('**/bundles/gold-hero-grux-*.json', route => route.abort());
    await page.evaluate(() => openHero('grux', 'offlane'));
    await page.waitForFunction(() => /not saved on this device/.test(document.querySelector('#main').innerText), null, {timeout: 30000}).catch(() => {});
    const failed = await page.evaluate(() => /not saved on this device/.test(document.querySelector('#main').innerText));
    await page.unroute('**/manifest.json'); await page.unroute('**/bundles/gold-hero-grux-*.json');
    await checkLikeAReturningTab(page, '00:31:00');
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading') && !/could not be loaded/.test(document.querySelector('#main').innerText), null, {timeout: 30000}).catch(() => {});
    const seen = {failedWhileLost: failed, ...(await page.evaluate(() => ({stillFailed: /could not be loaded/.test(document.querySelector('#main').innerText), attributes: !!B.heroes.grux?.pred_attributes})))};
    verdict('I13', !seen.failedWhileLost || seen.stillFailed || !seen.attributes, seen);
    await context.close();
  },
  // ---- 2.28.0: fixes from the review of 2.27.0 (V series).
  async V1(browser) {
    // A role without its own Statz sample says so - never "No observed build" - on every hero tab; its source lines never
    // present another role's Statz page as this role's (the Build tab shows none; other tabs label the hero-wide page by
    // the role page it came from) and never a dead link. Every such hero role, desktop; Steel jungle also on phone.
    const seen = {problems: []};
    const scan = async (page, only) => page.evaluate(async only => {
      const problems = [], wait = () => new Promise(r => setTimeout(r, 0));
      const pairs = only ? [only] : Object.keys(B.heroes).flatMap(slug => E.roles(slug).filter(role => !B.heroes[slug].roles?.[role]?.url).map(role => [slug, role]));
      for (const [slug, role] of pairs) {
        openHero(slug, role);
        for (const tab of ['builds', 'pairings', 'counters', 'kit']) {
          S.heroTab = tab; render(); await wait();
          // Since 2.29 stage 3c every section is on one page: the per-tab rule reads the section
          // it is about, or the whole page where sections do not exist.
          const main = document.querySelector('#hero-sec-' + tab) || document.querySelector('#main'), id = slug + '|' + role + '|' + tab;
          if (/No observed build for this hero/i.test(main.textContent)) problems.push(id + ': says No observed build');
          if ([...main.querySelectorAll('a')].some(a => ['#', ''].includes(a.getAttribute('href') || ''))) problems.push(id + ': dead link');
          for (const a of main.querySelectorAll('.source-line a[href*="statz.gg"]')) {
            const other = (a.href.match(/\/build\/([a-z]+)\//) || [])[1];
            if (!other || other === role) continue;
            if (tab === 'builds') problems.push(id + ': links the ' + other + ' Statz page');
            else if (!/hero-wide data \((Jungle|Offlane|Midlane|Carry|Support) page|another role page\)/i.test(a.textContent)) problems.push(id + ': unlabelled ' + other + ' link');
          }
          if (![...main.querySelectorAll('.source-line')].some(l => /No Statz \w+ sample in|failed to load in this collection|different patch and was excluded/.test(l.textContent))) problems.push(id + ': no Statz gap line');
        }
      }
      openHero('steel', 'jungle'); S.heroTab = 'builds'; render(); await wait();
      return {checked: pairs.length, problems, names_statz_gap: /No Statz build sample for Jungle/.test(document.querySelector('#main').textContent), pred_builds: /Pred\.gg build evidence/.test(document.querySelector('#main').textContent)};
    }, only);
    for (const [label, options, only] of [['desktop', desktop, null], ['phone', phone, ['steel', 'jungle']]]) {
      const {context, page} = await session(browser, options);
      await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'builds'; render(); });
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
      seen[label] = await scan(page, only);
      await context.close();
    }
    assert.ok(seen.desktop.checked >= 2 && seen.desktop.pred_builds, 'probe setup: hero roles without a Statz page exist and Steel jungle shows Pred.gg builds');
    const bad = s => s.problems.length > 0 || !s.names_statz_gap;
    verdict('V1', bad(seen.desktop) || bad(seen.phone), {desktop: {checked: seen.desktop.checked, problems: seen.desktop.problems.slice(0, 8)}, phone: seen.phone});
  },
  async V3(browser) {
    // Saved evidence is labelled "Saved <day>" in its own section: retained Pred.gg (1 h after collection), and anything
    // older than 48 hours (Pred.gg and Statz); evidence 31 hours old (aging) and current evidence carry no label; the phone
    // chip names whose date it shows. Checked sections: Pred.gg source lines, Statz headings, the Statz standout and Live
    // variant header, the desktop and phone hero headers, and the Builds page's compact Pred.gg summaries.
    const seen = {};
    const SAVED = /Saved (January|February|March|April|May|June|July|August|September|October|November|December) \d/;
    const read = page => page.evaluate(source => {
      const saved = new RegExp(source), main = document.querySelector('#main'), all = (sel, test = () => true) => [...main.querySelectorAll(sel)].filter(test);
      const count = els => ({n: els.length, saved: els.filter(e => saved.test(e.textContent)).length});
      return {
        pred_lines: count(all('.source-line', l => l.querySelector('a[href*="pred.gg"]'))),
        statz_titles: count(all('.section-title, h3', s => /Compare build variants|Matchup evidence|Statz · per build variant/.test(s.textContent))),
        // The Statz standout and Live variant header ("Observed variant n of m"); comparison cards sit under the labelled
        // "Compare build variants" title.
        variant_heads: count(all('.build-head .eyebrow', e => /Observed variant/.test(e.textContent))),
        hero_head: count(all('.quick-stats, .mobile-hero-head')),
        compact: count(all('summary', s => /most-played observed core/.test(s.textContent))),
        any_saved: saved.test(main.textContent)};
    }, SAVED.source);
    const loaded = page => page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
    const retain = page => page.evaluate(() => {
      for (const k of ['pred_scoped', 'pred_game_data']) if (B.sources[k]) B.sources[k] = {...B.sources[k], status: 'retained'};
      if (B.scoped_statistics) B.scoped_statistics.status = 'retained';
      if (B.pred_game_data) B.pred_game_data.status = 'retained';
      E = MetaEngine.create(B); render();
    });
    // Current, then retained Pred.gg, one hour after collection.
    {
      const {context, page} = await clockSession(browser, desktop);
      await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'counters'; render(); });
      await loaded(page);
      seen.current = await read(page);
      await retain(page);
      seen.retained_counters = await read(page);
      await page.evaluate(() => { S.heroTab = 'builds'; render(); });
      seen.retained_builds = await read(page);
      await page.evaluate(() => { S.role = 'offlane'; changeRoute('builds'); });
      await loaded(page); await retain(page);
      seen.retained_builds_page = await read(page);
      await context.close();
    }
    // 31 hours (aging) and 49 hours (stale) after collection, nothing retained: Steel offlane has Statz and Pred.gg sections.
    for (const [label, hours] of [['aging', 31], ['stale', 49]]) {
      const {context, page} = await clockSession(browser, desktop, hours * 3600000);
      await page.evaluate(() => { openHero('steel', 'offlane'); S.heroTab = 'builds'; render(); });
      await loaded(page);
      seen[label] = await read(page);
      if (label === 'stale') {
        await page.evaluate(() => { S.heroTab = 'counters'; render(); }); await loaded(page);
        seen.stale_counters = await read(page);
        await page.evaluate(() => { S.role = 'offlane'; changeRoute('builds'); }); await loaded(page);
        seen.stale_builds_page = await read(page);
      }
      await context.close();
    }
    {
      const m = await clockSession(browser, phone);
      await m.page.evaluate(() => changeRoute('meta'));
      seen.chip = await m.page.evaluate(() => document.querySelector('.mobile-health span')?.textContent || '');
      await m.context.close();
      const s = await clockSession(browser, phone, 49 * 3600000);
      await s.page.evaluate(() => { openHero('steel', 'offlane'); S.heroTab = 'builds'; render(); });
      await loaded(s.page);
      seen.stale_phone = await read(s.page);
      await s.context.close();
    }
    const every = c => c.n > 0 && c.saved === c.n;
    assert.ok(seen.retained_counters.pred_lines.n && seen.retained_builds.pred_lines.n && seen.retained_builds_page.compact.n && seen.stale.statz_titles.n
      && seen.stale.variant_heads.n && seen.stale.hero_head.n && seen.stale_counters.statz_titles.n && seen.stale_builds_page.compact.n && seen.stale_phone.hero_head.n, 'probe setup: the sections exist');
    const bad = seen.current.any_saved || seen.aging.any_saved
      || !every(seen.retained_counters.pred_lines) || !every(seen.retained_builds.pred_lines) || !every(seen.retained_builds_page.compact)
      || !every(seen.stale.pred_lines) || !every(seen.stale.statz_titles) || !every(seen.stale.variant_heads) || !every(seen.stale.hero_head)
      || !every(seen.stale_counters.statz_titles) || !every(seen.stale_builds_page.compact) || !every(seen.stale_phone.hero_head)
      || !/Site refresh · Statz fetched/.test(seen.chip);
    verdict('V3', bad, seen);
  },
  async V4(browser) {
    // With a current verified cloud check whose content signature matches this publication, the website confirms the
    // official description review instead of calling it pending.
    const {context, page} = await clockSession(browser, desktop);
    const seen = await page.evaluate(async () => {
      const manifest = await (await fetch('manifest.json', {cache: 'no-store'})).json(), entry = manifest.cohorts.gold;
      changeRoute('data');
      return {check: manifest.patch_check?.status, same_signature: manifest.patch_check?.signature === entry.source_signature, review: B.definition_review?.status, patch: B.definition_review?.patch,
        guidance: B.guidance?.status, status: definitionReviewStatus(), text: (document.querySelector('#main').innerText.match(/reviewed for [^\n]*?v[\d.]+/i) || [''])[0],
        badge: [...document.querySelectorAll('#main section.panel')].find(s => /Official description review/.test(s.querySelector('h2')?.textContent || ''))?.querySelector('.tag')?.className || null};
    });
    assert.equal(seen.check, 'verified', 'probe setup: the staged publication has a verified patch check');
    assert.ok(seen.same_signature, 'probe setup: the check matches this publication');
    assert.equal(seen.review, 'reviewed for current patch', 'probe setup: the seed carries a current definition review');
    verdict('V4', seen.status !== 'reviewed for current patch' || !/\breviewed\b/.test(seen.badge || '') || !new RegExp('reviewed for current patch\\s*·\\s*v' + seen.patch.replace(/\./g, '\\.'), 'i').test(seen.text), seen);
    await context.close();
  },
  async V5(browser) {
    // GUARD: the description review stays "pending" whenever the confirmation is not current and complete.
    const cases = {
      saved_copy: async page => page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.cohorts.gold.saved_copy = true; await route.fulfill({response, json: m}); }),
      offline_copy: async page => page.route('**/manifest.json', async route => { const response = await route.fetch(); await route.fulfill({response, headers: {...response.headers(), 'x-predecessor-cache': 'offline'}}); }),
      version_mismatch: async page => page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...m.patch_check, version: '9.99.9'}; await route.fulfill({response, json: m}); }),
      entry_without_signature: async page => page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); delete m.cohorts.gold.source_signature; await route.fulfill({response, json: m}); }),
      check_without_signature: async page => page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...m.patch_check, signature: null}; await route.fulfill({response, json: m}); }),
    };
    const seen = {};
    for (const [name, arrange] of Object.entries(cases)) {
      const {context, page} = await clockSession(browser, desktop);
      await arrange(page);
      await checkLikeAReturningTab(page);
      seen[name] = await page.evaluate(() => definitionReviewStatus());
      await context.close();
    }
    {
      const {context, page} = await clockSession(browser, desktop);
      await page.route('**/manifest.json', route => route.abort());
      await page.locator('#refresh').click();
      await page.waitForFunction(() => !latestStatus.busy, null, {timeout: 60000});
      seen.failed_request = await page.evaluate(() => definitionReviewStatus());
      await context.close();
    }
    {
      const {context, page} = await clockSession(browser, desktop);
      await page.clock.fastForward('31:00:00');
      await page.waitForTimeout(500);
      seen.check_older_than_30h = await page.evaluate(() => definitionReviewStatus());
      await context.close();
    }
    verdict('V5', Object.values(seen).some(s => !/pending|failed|needs review/.test(s) || s === 'reviewed for current patch'), seen);
  },
  async V6(browser) {
    // A failed live or official check is named as failed, and a check that found changed official content says so - not
    // "pending". The Sources badge is a warning for each of them.
    const badge = page => page.evaluate(() => { changeRoute('data'); return [...document.querySelectorAll('#main section.panel')].find(s => /Official description review/.test(s.querySelector('h2')?.textContent || ''))?.querySelector('.tag')?.className || null; });
    const {context, page} = await clockSession(browser, desktop);
    const control = await badge(page);
    await failTheNextCheck(page, 'e');
    await checkLikeAReturningTab(page);
    const website = await page.evaluate(() => definitionReviewStatus()), website_badge = await badge(page);
    const windows = await page.evaluate(() => {
      const saved = {local, cache: B.cache, guidance: B.guidance};
      try { local = true; B.cache = {used: true}; B.guidance = {...B.guidance, status: 'reviewed for saved patch; live verification failed'}; return definitionReviewStatus(); }
      finally { local = saved.local; B.cache = saved.cache; B.guidance = saved.guidance; }
    });
    await context.close();
    const c = await clockSession(browser, desktop);
    await c.page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...m.patch_check, signature: 'f'.repeat(64)}; await route.fulfill({response, json: m}); });
    await checkLikeAReturningTab(c.page);
    const changed = await c.page.evaluate(() => definitionReviewStatus()), changed_badge = await badge(c.page);
    await c.context.close();
    const seen = {control, website, website_badge, windows, changed, changed_badge};
    assert.ok(/\breviewed\b/.test(control || ''), 'probe setup: a confirmed review has the reviewed badge');
    verdict('V6', !/official patch check failed/.test(website) || !/live check failed/.test(windows) || changed !== 'needs review · official content changed since collection'
      || ![website_badge, changed_badge].every(b => /\bwarning\b/.test(b || '')), seen);
  },
  async V13(browser) {
    // GUARD: an open blessing dialog shows the review status the page shows now. The status changes when the connection
    // drops, a check finds changed official content, or the last check ages past 30 hours; each time the dialog is rebuilt.
    const openDialog = async () => {
      const s = await clockSession(browser, desktop);
      await s.page.evaluate(() => showCatalog('perks', 'voracity'));
      await s.page.waitForFunction(() => document.querySelector('#detail')?.open && !document.querySelector('#detail [data-annex]'), null, {timeout: 60000});
      return s;
    };
    const read = page => page.evaluate(() => { const status = definitionReviewStatus(); return {status, open: document.querySelector('#detail').open, shown: (document.querySelector('#detail-body')?.innerText || '').includes(status)}; });
    const seen = {};
    {
      const {context, page} = await openDialog();
      seen.control = await read(page);
      // The reader has every section open, has scrolled, and has a section heading focused; the rebuild keeps all three.
      await page.evaluate(() => { const d = document.querySelector('#detail'); d.querySelectorAll('#detail-body details').forEach(x => { x.open = true; }); d.scrollTop = 200; [...d.querySelectorAll('#detail-body summary')].pop()?.focus(); });
      const before = await page.evaluate(() => { const d = document.querySelector('#detail'); return {open: [...d.querySelectorAll('#detail-body details')].map(x => x.open), top: d.scrollTop, focus: document.activeElement?.textContent?.trim().slice(0, 60)}; });
      await context.setOffline(true);
      await page.waitForFunction(() => definitionReviewStatus() !== 'reviewed for current patch', null, {timeout: 10000}).catch(() => {});
      await page.waitForTimeout(300);
      seen.offline = await read(page);
      seen.offline.kept = await page.evaluate(before => { const d = document.querySelector('#detail'), open = [...d.querySelectorAll('#detail-body details')].map(x => x.open);
        return {sections: open.length === before.open.length && open.every(Boolean), scroll: Math.abs(d.scrollTop - before.top) <= 2, focus: d.contains(document.activeElement) && document.activeElement?.textContent?.trim().slice(0, 60) === before.focus, before}; }, before);
      await context.close();
    }
    {
      // Several controls with the same label (two field corrections, each with a "Reviewed replacement" section): the
      // reader is on the second; after the rebuild focus and the open section are still the second, not the first.
      const s = await clockSession(browser, desktop);
      await s.page.evaluate(() => requestAnnex('shared'));
      await s.page.evaluate(() => {
        const src = (B.corrections || []).find(c => c.path?.[0] === 'items');
        B.corrections.push({...src, path: ['perks', 'voracity', 'description'], after: 'A', original: 'a'}, {...src, path: ['perks', 'voracity', 'slot'], after: 'B', original: 'b'});
        showCatalog('perks', 'voracity');
      });
      await s.page.waitForFunction(() => document.querySelector('#detail')?.open && !document.querySelector('#detail [data-annex]'), null, {timeout: 60000});
      const state = () => s.page.evaluate(() => { const sums = [...document.querySelectorAll('#detail-body summary')].filter(x => x.textContent === 'Reviewed replacement');
        return {count: sums.length, focused: sums.indexOf(document.activeElement), open: sums.map(x => x.parentElement.open)}; });
      await s.page.evaluate(() => { const body = document.querySelector('#detail-body');
        body.querySelectorAll('details').forEach(d => { if (/field corrections/.test(d.querySelector('summary').textContent)) d.open = true; });
        const sums = [...body.querySelectorAll('summary')].filter(x => x.textContent === 'Reviewed replacement'); sums[1].parentElement.open = true; sums[1].focus({preventScroll: true}); });
      const before = await state();
      await s.context.setOffline(true);
      await s.page.waitForFunction(() => definitionReviewStatus() !== 'reviewed for current patch', null, {timeout: 10000}).catch(() => {});
      await s.page.waitForTimeout(300);
      seen.same_label = {before, after: await state(), status: await s.page.evaluate(() => definitionReviewStatus())};
      await s.context.close();
    }
    {
      const {context, page} = await openDialog();
      await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...m.patch_check, signature: 'f'.repeat(64)}; await route.fulfill({response, json: m}); });
      await checkLikeAReturningTab(page);
      await page.waitForTimeout(300);
      seen.changed_content = await read(page);
      await context.close();
    }
    {
      const {context, page} = await openDialog();
      await page.clock.fastForward('31:00:00');
      await page.waitForTimeout(500);
      seen.after_31_hours = await read(page);
      await context.close();
    }
    assert.equal(seen.control.status, 'reviewed for current patch', 'probe setup: the review is confirmed while the check is current');
    assert.ok(seen.control.shown, 'probe setup: the dialog shows the review status');
    const changed = [seen.offline, seen.changed_content, seen.after_31_hours];
    assert.ok(changed.every(s => s.status !== 'reviewed for current patch'), 'probe setup: each case withdraws the confirmation');
    assert.ok(seen.offline.kept.before.open.length > 1 && seen.offline.kept.before.top > 0 && seen.offline.kept.before.focus, 'probe setup: sections open, scrolled and focused');
    assert.ok(seen.same_label.before.count === 2 && seen.same_label.before.focused === 1 && seen.same_label.status !== 'reviewed for current patch', 'probe setup: two same-label sections, the second focused, then the status changes');
    verdict('V13', changed.some(s => !s.open || !s.shown) || !seen.offline.kept.sections || !seen.offline.kept.scroll || !seen.offline.kept.focus
      || seen.same_label.after.focused !== 1 || JSON.stringify(seen.same_label.after.open) !== JSON.stringify(seen.same_label.before.open), seen);
  },
  async V7(browser) {
    // Counters lead with reviewed counterplay and matchups of at least 100 games; every thinner sample and the alternate
    // source tables stay available behind one closed exploratory disclosure (nothing removed, pooled or re-rated).
    // Rows are counted exactly against the source: the supported section holds every row of 100+ games, Exploratory every
    // other row (thin samples, an unconfirmed primary table, alternate tables that differ from the primary one). A role
    // with no matchup data does not point to smaller samples, and Exploratory has its own level-2 heading.
    const seen = {};
    const measure = ({slug, role}) => {
          // Since 2.29 stage 3c the Build section, with its own evidence tables, sits above Counters
          // on the same page; 'Counters lead with reviewed counterplay' is a claim about Counters.
          const main = document.querySelector('#hero-sec-counters') || document.querySelector('#main'), out = {}, N = 100;
          const gamesOf = tr => { const heads = [...tr.closest('table').querySelectorAll('thead th')].map(th => th.textContent.trim().toLowerCase()), i = heads.indexOf('games'), cell = tr.children[i];
            return i < 0 || !cell ? null : Number((cell.textContent.match(/[\d,]+/) || [''])[0].replace(/,/g, '')); };
          const rows = [...main.querySelectorAll('tbody tr')].map(tr => ({games: gamesOf(tr), hidden: !!tr.closest('details:not([open])')})).filter(r => Number.isFinite(r.games));
          out.thin_visible = rows.filter(r => r.games < N && !r.hidden).length;
          const ex = main.querySelector('details.exploratory-matchups');
          out.exploratory = ex ? (ex.open ? 'open' : 'closed') : 'missing';
          out.exploratory_rows = ex ? ex.querySelectorAll('tbody tr').length : 0;
          out.supported_rows = main.querySelectorAll('.supported-matchups tbody tr').length;
          const c = B.pred_game_data?.role_data?.[slug]?.[role]?.counters, tables = c?.tables || {}, primary = tables.counters, h = B.heroes[slug], r = h?.roles?.[role];
          const verified = !!primary?.cohort_verified, sig = x => JSON.stringify((x?.rows || []).map(v => [v.slug, v.played, v.wr]).sort());
          const statz = (r?.status === 'ok' ? (r.builds || []).flatMap(b => [...(b.lane_counters || []), ...(b.strong_against || [])]) : []);
          const wide = [...(h?.general_strong_against || []), ...(h?.general_counters || [])];
          const differing = Object.entries(tables).filter(([k, x]) => k !== 'counters' && (!primary || sig(x) !== sig(primary))).reduce((n, [, x]) => n + (x?.rows || []).length, 0);
          out.supported_in_source = (verified ? primary.rows.filter(x => x.played >= N).length : 0) + statz.filter(o => o.playedGames >= N).length + wide.filter(o => o.played >= N).length;
          out.exploratory_in_source = (primary ? (verified ? primary.rows.filter(x => !(x.played >= N)).length : primary.rows.length) : 0) + differing
            + statz.filter(o => !(o.playedGames >= N)).length + wide.filter(o => !(o.played >= N)).length;
          out.thin_in_source = out.exploratory_in_source - differing; out.differing = differing;
          out.no_data = !c && !statz.length && !wide.length;
          out.points_to_smaller = /Smaller samples are listed under Exploratory/.test(main.textContent);
          out.dangling_there = /listed there too/.test(main.textContent) && !/Smaller samples are listed under Exploratory below\. The Pred\.gg table is listed there too/.test(main.textContent);
          out.empty_text = main.querySelector('.supported-matchups .empty')?.textContent || '';
          // The closest level-2 heading before the first exploratory table.
          const firstExTable = ex?.querySelector('table'), h2s = [...main.querySelectorAll('h2')];
          out.exploratory_heading = firstExTable ? (h2s.filter(x => x.compareDocumentPosition(firstExTable) & Node.DOCUMENT_POSITION_FOLLOWING).pop()?.textContent || '') : null;
          const reviewed = main.querySelector('.strategic-profile, .reviewed-counter'), firstTable = main.querySelector('table');
          out.reviewed_first = !reviewed || !firstTable || !!(reviewed.compareDocumentPosition(firstTable) & Node.DOCUMENT_POSITION_FOLLOWING);
          out.reviewed_present = !!reviewed;
          return out;
    };
    for (const [label, options] of [['desktop', desktop], ['phone', phone]]) {
      const {context, page} = await session(browser, options);
      for (const [slug, role] of [['wukong', 'jungle'], ['steel', 'offlane'], ['wukong', 'offlane']]) {
        await page.evaluate(({slug, role}) => openHero(slug, role), {slug, role});
        if (await page.evaluate(role => S.heroRole !== role, role)) continue;
        await page.locator('[data-hero-tab="counters"]').first().click();
        await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
        await page.waitForTimeout(200);
        seen[label + ':' + slug + ':' + role] = await page.evaluate(measure, {slug, role});
      }
      await context.close();
    }
    {
      // Shapes the staged seeds never contain: an alternate Pred.gg table that differs from the primary one, a primary
      // table whose rank and patch filters are unconfirmed, and a hero-wide page that matches no role page.
      const {context, page} = await session(browser, desktop);
      const open = async (slug, role) => { await page.evaluate(({slug, role}) => { openHero(slug, role); S.heroTab = 'counters'; render(); }, {slug, role});
        await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {}); };
      await open('steel', 'offlane');
      await page.evaluate(() => { const t = B.pred_game_data.role_data.steel.offlane.counters.tables, k = Object.keys(t).find(x => x !== 'counters');
        t[k] = {...t[k], rows: t[k].rows.map((r, i) => i ? r : {...r, played: r.played + 1})}; E = MetaEngine.create(B); render(); });
      seen['synthetic:differing_alternate'] = await page.evaluate(measure, {slug: 'steel', role: 'offlane'});
      await page.evaluate(() => { const t = B.pred_game_data.role_data.steel.offlane.counters.tables; t.counters = {...t.counters, cohort_verified: false};
        B.heroes.steel = {...B.heroes.steel, hero_wide_url: 'https://statz.gg/probe-unknown-page'}; E = MetaEngine.create(B); render(); });
      seen['synthetic:unconfirmed_primary'] = await page.evaluate(measure, {slug: 'steel', role: 'offlane'});
      seen['synthetic:unconfirmed_primary'].hero_wide_label = await page.evaluate(() => [...document.querySelectorAll('#main summary, #main h3')].map(x => x.textContent).find(x => /Hero-wide matchups/.test(x)) || null);
      await open('wukong', 'jungle');
      await page.evaluate(() => { const t = B.pred_game_data.role_data.wukong.jungle.counters.tables; t.counters = {...t.counters, cohort_verified: false}; E = MetaEngine.create(B); render(); });
      seen['synthetic:unconfirmed_only'] = await page.evaluate(measure, {slug: 'wukong', role: 'jungle'});
      // The message users see most (every Paragon+ role): a verified table where nothing reaches 100 games; then no rows at
      // all; then a differing alternate table with a 100-game row (inspection only, so the claim is limited).
      await page.evaluate(() => { window.probeTables = JSON.parse(JSON.stringify(B.pred_game_data.role_data.wukong.jungle.counters.tables)); });
      const shape = async code => { await page.evaluate('(() => {' + code + '})()'); return page.evaluate(measure, {slug: 'wukong', role: 'jungle'}); };
      const EDIT = `const t = JSON.parse(JSON.stringify(window.probeTables)); for (const k in t) t[k] = {...t[k], cohort_verified: k === 'counters' ? true : t[k].cohort_verified, rows: (t[k].rows || []).map(r => ({...r, played: Math.min(r.played, 99)}))};`;
      seen['synthetic:all_thin'] = await shape(EDIT + ` B.pred_game_data.role_data.wukong.jungle.counters.tables = t; E = MetaEngine.create(B); render();`);
      seen['synthetic:no_rows'] = await shape(EDIT + ` for (const k in t) t[k].rows = []; B.pred_game_data.role_data.wukong.jungle.counters.tables = t; E = MetaEngine.create(B); render();`);
      seen['synthetic:differing_100'] = await shape(EDIT + ` const alt = Object.keys(t).find(k => k !== 'counters'); t[alt].rows = t[alt].rows.map((r, i) => i ? r : {...r, played: 105}); B.pred_game_data.role_data.wukong.jungle.counters.tables = t; E = MetaEngine.create(B); render();`);
      await context.close();
    }
    assert.ok(seen['synthetic:differing_alternate'].differing > 0 && seen['synthetic:unconfirmed_primary'].hero_wide_label, 'probe setup: the synthetic shapes render');
    assert.ok(seen['desktop:wukong:jungle'].thin_in_source > 0 && seen['desktop:steel:offlane'].supported_in_source > 0, 'probe setup: thin and supported matchups exist');
    const bad = s => s.thin_visible > 0 || s.exploratory !== 'closed' || s.exploratory_rows !== s.exploratory_in_source || s.supported_rows !== s.supported_in_source || !s.reviewed_first
      || (s.points_to_smaller && s.thin_in_source === 0) || s.dangling_there || (s.exploratory_heading !== null && /100 or more games/.test(s.exploratory_heading));
    {
      // Before the hero's evidence file arrives (here it fails), alternate tables are unknown: the claim stays limited.
      const {context, page} = await session(browser, desktop);
      await page.route('**/bundles/*-hero-wukong-*', route => route.abort());
      await page.evaluate(() => { openHero('wukong', 'jungle'); S.heroTab = 'counters'; render(); });
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
      await page.evaluate(() => { const t = B.pred_game_data.role_data.wukong.jungle.counters.tables; t.counters = {...t.counters, rows: t.counters.rows.map(r => ({...r, played: Math.min(r.played, 99)}))}; render(); });
      seen['synthetic:evidence_failed'] = {state: await page.evaluate(() => annexState('hero', 'wukong')), empty_text: await page.evaluate(() => document.querySelector('#main .supported-matchups .empty')?.textContent || '')};
      await context.close();
    }
    const u = seen['synthetic:unconfirmed_only'];
    assert.equal(seen['synthetic:evidence_failed'].state, 'failed', 'probe setup: the hero evidence file failed');
    verdict('V7', Object.entries(seen).filter(([k]) => k !== 'synthetic:evidence_failed').some(([, s]) => bad(s)) || !/read from another Statz role page/.test(seen['synthetic:unconfirmed_primary'].hero_wide_label)
      || !/The Pred\.gg table is listed under Exploratory below because its rank and patch filters could not be confirmed/.test(u.empty_text)
      || seen['synthetic:all_thin'].empty_text !== 'No collected jungle matchup for Wukong reaches 100 games in Gold+. Smaller samples are listed under Exploratory below.'
      || seen['synthetic:no_rows'].empty_text !== 'No collected jungle matchup for Wukong reaches 100 games in Gold+.' || seen['synthetic:no_rows'].points_to_smaller
      || !/^No jungle matchup for Wukong from a table with confirmed filters reaches 100 games in Gold\+\..*Alternate Pred\.gg source tables that differ from the primary one are listed there for inspection\.$/.test(seen['synthetic:differing_100'].empty_text)
      || !/^No jungle matchup for Wukong from a table with confirmed filters reaches 100 games in Gold\+\./.test(seen['synthetic:evidence_failed'].empty_text), seen);
  },
  async V8(browser) {
    // Desktop 1440x900: the site status takes one concise strip; the first Meta row starts high even with an announcement,
    // retained Pred.gg and a Pred.gg source error present. Material notices (here: the fixture's "more than 30 hours
    // old") are always visible and are excluded from the budget. Other routes' evidence line is one collapsed row.
    const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 900}}), page = await context.newPage();
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json(); m.patch_check = {...m.patch_check, announcements: [{version: '9.99', release_date: '2026-12-31', url: 'https://www.predecessorgame.com/'}]}; await route.fulfill({response, json: m}); });
    await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const seen = await page.evaluate(async () => {
      for (const k of ['pred_scoped', 'pred_game_data']) if (B.sources[k]) B.sources[k] = {...B.sources[k], status: 'retained'};
      B.errors = [...(B.errors || []), {source: 'Pred.gg current-patch statistics', severity: 'error', detail: 'Probe: public pages returned no structured data.'}];
      S.statSource = 'statz'; E = MetaEngine.create(B); changeRoute('meta'); chrome();
      await new Promise(r => setTimeout(r, 100));
      const top = el => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null, material = document.querySelector('#material-notices');
      const materialH = material ? Math.round(material.getBoundingClientRect().height) : 0;
      const row = document.querySelector('#main table tbody tr, #main .meta-table tbody tr');
      const out = {main_top: top(document.querySelector('#main')), first_row: top(row), material: materialH, evidence_lines: {}};
      for (const r of ['builds', 'draft', 'live', 'planner']) { changeRoute(r); const d = document.querySelector('#main details.note'); out.evidence_lines[r] = d ? Math.round(d.getBoundingClientRect().height) : 0; }
      openHero('steel', 'offlane'); const d = document.querySelector('#main details.note'); out.evidence_lines.hero = d ? Math.round(d.getBoundingClientRect().height) : 0;
      return out;
    });
    await context.close();
    verdict('V8', seen.main_top - seen.material > 132 || seen.first_row - seen.material > 400 || Object.values(seen.evidence_lines).some(h => h > 36), seen);
  },
  async V9(browser) {
    // GUARD: material conditions stay visible without opening anything: new official content, paused collection, a failed
    // required source, and an old bundle; the required-source failure also marks the status line as failed.
    const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 900}}), page = await context.newPage();
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), m = await response.json();
      m.patch_check = {...m.patch_check, signature: 'f'.repeat(64)}; m.collection_paused_reason = 'Probe: collection paused for maintenance.';
      m.cohorts.gold.last_attempt = {status: 'failed', errors: [{source: 'Pred.gg current-patch statistics', severity: 'error', detail: 'Probe: Pred.gg failed.'}, {source: 'Statz hero pages', severity: 'error', detail: 'Probe: every hero page failed.'}]};
      await route.fulfill({response, json: m}); });
    await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const seen = await page.evaluate(() => { changeRoute('meta'); chrome(); const material = document.querySelector('#material-notices').innerText;
      return {panel_closed: !document.querySelector('.workspace').classList.contains('status-open') && getComputedStyle(document.querySelector('#status-panel')).display === 'none',
        content_changed: /Official patch content changed/.test(material), paused: /collection paused for maintenance/.test(material), required: /Statz hero pages/.test(material) && /every hero page failed/.test(material),
        old: /more than 30 hours old/.test(material), progress_failed: document.querySelector('#progress').classList.contains('failed'), optional_not_material: !/Pred\.gg failed/.test(material)}; });
    await context.close();
    // The exported snapshot runs without the website client (mode 'export'): an optional Pred.gg failure alone is neither a
    // material notice nor a failed status; a required failure is both, and Pred.gg stays out of the notices.
    const x = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 900}, acceptDownloads: true}), site = await x.newPage();
    await site.goto(url); await site.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const [download] = await Promise.all([site.waitForEvent('download', {timeout: 120000}), site.click('#export')]);
    const file = path.join(root, 'qa', 'v9-export.html'); await download.saveAs(file);
    const snap = await x.newPage(); await snap.goto('file:///' + file.replace(/\\/g, '/')); await snap.waitForFunction(() => !!B, null, {timeout: 60000});
    const exported = await snap.evaluate(() => {
      const pred = {source: 'Pred.gg current-patch statistics', severity: 'error', detail: 'Probe: Pred.gg failed.'}, material = () => document.querySelector('#material-notices').innerText, failed = () => document.querySelector('#progress').classList.contains('failed');
      latestStatus.errors = [pred]; chrome();
      const alone = {material: /Pred\.gg failed/.test(material()), failed: failed()};
      latestStatus.errors = [pred, {source: 'Statz hero pages', severity: 'error', detail: 'Probe: every hero page failed.'}]; chrome();
      return {mode: APP_CONFIG.mode, pred_alone_material: alone.material, pred_alone_failed: alone.failed, required: /every hero page failed/.test(material()), required_failed: failed(), pred_with_required_material: /Pred\.gg failed/.test(material())};
    });
    await x.close();
    assert.equal(exported.mode, 'export', 'probe setup: the snapshot runs in export mode');
    verdict('V9', Object.values(seen).some(v => !v) || exported.pred_alone_material || exported.pred_alone_failed || !exported.required || !exported.required_failed || exported.pred_with_required_material, {...seen, exported});
  },
  async V10(browser) {
    // Desktop: the status details open and close from the keyboard, stay open across redraws with focus kept, contain the
    // schedule and the source notices, and pass axe (WCAG 2.1 A/AA) open and closed in both themes.
    const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 1440, height: 900}}), page = await context.newPage();
    await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const seen = {};
    const toggle = page.locator('#status-toggle');
    seen.visible = await toggle.isVisible();
    if (seen.visible) {
      await toggle.focus(); await page.keyboard.press('Enter');
      seen.opened = await page.evaluate(() => { const panel = document.querySelector('#status-panel'); return {expanded: document.querySelector('#status-toggle').getAttribute('aria-expanded'), panel_visible: !!panel && panel.getBoundingClientRect().height > 0,
        schedule: /update target|updater|updates paused/i.test(panel?.innerText || ''), notices: /Source (failure|limitations)|notice/i.test(panel?.innerText || '')}; });
      seen.after_redraw = await page.evaluate(() => { chrome(); render(); return {expanded: document.querySelector('#status-toggle').getAttribute('aria-expanded'), focus: document.activeElement?.id}; });
      await page.addScriptTag({path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')});
      seen.axe = {};
      for (const theme of ['dark', 'light']) for (const open of [true, false]) {
        seen.axe[theme + (open ? ' open' : ' closed')] = await page.evaluate(async ({theme, open}) => {
          document.documentElement.setAttribute('data-theme', theme);
          const t = document.querySelector('#status-toggle'); if ((t.getAttribute('aria-expanded') === 'true') !== open) t.click();
          const r = await axe.run({include: [['.status-line'], ['#source-notices']]}, {runOnly: ['wcag2a', 'wcag2aa']});
          return r.violations.map(v => v.id + ':' + v.nodes.length);
        }, {theme, open});
      }
      // Enter again toggles to the opposite state, whichever state the axe loop left.
      const before = await page.evaluate(() => document.querySelector('#status-toggle').getAttribute('aria-expanded'));
      await toggle.focus(); await page.keyboard.press('Enter');
      const after = await page.evaluate(() => document.querySelector('#status-toggle').getAttribute('aria-expanded'));
      seen.toggled_again = before !== after;
    }
    await context.close();
    const ok = seen.visible && seen.opened?.expanded === 'true' && seen.opened.panel_visible && seen.opened.schedule && seen.opened.notices
      && seen.after_redraw?.expanded === 'true' && seen.after_redraw.focus === 'status-toggle' && Object.values(seen.axe || {}).every(v => !v.length) && seen.toggled_again;
    verdict('V10', !ok, seen);
  },
  async V11(browser) {
    // Phone: tab strips never scroll (no vertical overflow; no horizontal overflow at 320 px even with large text); every
    // tab is on screen and at least 44 px tall; the page itself never scrolls sideways.
    const seen = {};
    for (const width of [320, 360, 390, 412]) for (const large of [false, true]) {
      const context = await browser.newContext({serviceWorkers: 'block', viewport: {width, height: 844}, isMobile: true, hasTouch: true}), page = await context.newPage();
      await context.addInitScript(large => { localStorage.setItem('predecessor-companion-v1', JSON.stringify({installSeen: true, large, fullDetails:true})); }, large);
      await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
      const problems = [];
      // 'meta' is the phone Meta page with its own role strip (.role-choices.compact), which 2.28.0 left scrolling
      // sideways (found on the live site after that release). The Live hero picker was removed in 2.36.0.
      for (const route of ['hero', 'builds', 'meta']) {
        const found = await page.evaluate(route => {
          if (route === 'hero') openHero('steel', 'jungle');
          else changeRoute(route);
          const out = [], scope = document.querySelector('#main');
          const lists = [...scope.querySelectorAll('[role=tablist]'), ...(scope.querySelector('[role=tablist]') ? [] : scope.querySelectorAll('.tabs, .role-choices.compact'))];
          if (!lists.length) out.push('no tab strip found');
          if (route === 'meta' && !scope.querySelector('.role-choices.compact')) out.push('role strip not found');
          for (const list of lists) {
            const name = list.getAttribute('aria-label') || list.className;
            if (list.scrollHeight > list.clientHeight) out.push(name + ': vertical ' + list.scrollHeight + '>' + list.clientHeight);
            if (list.scrollWidth > list.clientWidth) out.push(name + ': horizontal ' + list.scrollWidth + '>' + list.clientWidth);
            const tabs = list.querySelectorAll('[role=tab]').length ? list.querySelectorAll('[role=tab]') : list.querySelectorAll('button');
            for (const tab of tabs) { const r = tab.getBoundingClientRect(); if (r.height < 44 || r.right > innerWidth + 1 || r.left < -1) out.push(name + ': tab "' + tab.textContent.trim() + '" ' + Math.round(r.left) + '-' + Math.round(r.right) + ' h' + Math.round(r.height)); }
          }
          if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page overflows ' + document.documentElement.scrollWidth + '>' + innerWidth);
          return out;
        }, route);
        problems.push(...found.map(f => route + ' ' + f));
      }
      seen[width + (large ? ' large' : '')] = problems;
      await context.close();
    }
    verdict('V11', Object.values(seen).some(p => p.length), seen);
  },
  async V12(browser) {
    // Phone: the hero's review status has its own full-width row and never breaks inside a word, with large text too.
    const seen = {};
    for (const width of [320, 360, 390, 412]) for (const large of [false, true]) {
      const context = await browser.newContext({serviceWorkers: 'block', viewport: {width, height: 844}, isMobile: true, hasTouch: true}), page = await context.newPage();
      await context.addInitScript(large => { localStorage.setItem('predecessor-companion-v1', JSON.stringify({installSeen: true, large, fullDetails:true})); }, large);
      await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
      await page.evaluate(() => openHero('steel', 'jungle'));
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
      seen[width + (large ? ' large' : '')] = await page.evaluate(() => {
        const original = E.metaReview;
        E.metaReview = (s, r) => ({...(original(s, r) || {tier: 'A', reviewed_tier: 'A'}), active: false, status: 'Retained sample; refresh required to reassess this tier'});
        render();
        const head = document.querySelector('.mobile-hero-head'), button = head?.querySelector('[data-meta-decision],[data-calculated-tier]'), row = button?.parentElement;   // 2.45.0: a withheld grade shows its calculated fallback
        if (!head || !button) return {missing: true};
        const split = [];
        for (const node of [...button.querySelectorAll('*'), button].flatMap(el => [...el.childNodes].filter(n => n.nodeType === 3))) {
          const text = node.textContent; let i = 0;
          for (const word of text.split(/(\s+)/)) { if (word.trim()) { const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + word.length); const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))); if (lines.size > 1) split.push(word); } i += word.length; }
        }
        // 2.31 adds a padded profile surface. The status must span its full
        // CONTENT width, not extend through the padding and border.
        const cs=getComputedStyle(head),contentWidth=head.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
        return {row_width: Math.round(row.getBoundingClientRect().width), head_width: Math.round(contentWidth), split};
      });
      await context.close();
    }
    verdict('V12', Object.values(seen).some(s => s.missing || s.row_width < s.head_width - 2 || s.split.length), seen);
  },
  async I14(browser) {
    // Evidence that fails (or arrives after a noticeable wait) once a view is drawn is announced once per view, from a
    // live region that already exists (inside the dialog while one is open); the placeholders are not live regions.
    const {context, page} = await session(browser, desktop);
    const [item] = await evidenceItems(context);
    await page.evaluate(recordAnnouncements);
    const announced = async from => (await page.evaluate(() => window.auditAnnounced)).slice(from).filter(a => /evidence/i.test(a.text));
    const count = () => page.evaluate(() => window.auditAnnounced.length);
    // The Builds page waits for one evidence file per hero card; every one fails, in several batches.
    await page.route('**/bundles/gold-hero-*.json', route => route.abort());
    const early = await page.evaluate(() => { S.role = 'jungle'; changeRoute('builds'); return {waiting: document.querySelectorAll('#main .annex-loading').length, live: auditLivePlaceholders()}; });
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading') && document.querySelectorAll('#main .annex-failed').length > 1, null, {timeout: 30000}).catch(() => {});
    await page.evaluate(() => { requestRedraw(true); requestRedraw(true); });   // later redraws of the same view stay quiet
    await page.waitForTimeout(700);
    const onPage = {...early, failed: await page.evaluate(() => document.querySelectorAll('#main .annex-failed').length), announced: await announced(0)};
    // A catalog dialog waits for the shared evidence file, which fails.
    await page.unroute('**/bundles/gold-hero-*.json');
    await page.route(SHARED_FILES, route => route.abort());
    const opened = await count();
    const dialogEarly = await page.evaluate(key => { showCatalog('items', key); return {waiting: !!document.querySelector('#detail-body .annex-loading'), live: auditLivePlaceholders()}; }, item);
    await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
    await page.waitForTimeout(700);
    const dialogFailed = await announced(opened);
    await page.addScriptTag({path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')});
    const axeViolations = await page.evaluate(async () => (await axe.run(document.querySelector('#detail'), {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})).violations.flatMap(v => v.nodes.map(n => v.id + ' ' + n.target.join(' '))).slice(0, 5));
    // A retry (the connection returning) brings it after a noticeable wait.
    await page.unroute(SHARED_FILES);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(SHARED_FILES, async route => { await held; await route.continue(); });
    const retried = await count();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-loading'), null, {timeout: 30000}).catch(() => {});
    await page.waitForTimeout(1500);
    release();
    await page.waitForFunction(() => /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText), null, {timeout: 30000}).catch(() => {});
    await page.waitForTimeout(700);
    const dialogLoaded = await announced(retried);
    const seen = {onPage, dialog: {...dialogEarly, failed: dialogFailed, axe: axeViolations, loaded: dialogLoaded, open: await page.evaluate(() => document.querySelector('#detail').open)}};
    const once = (list, pattern) => list.length === 1 && pattern.test(list[0].text);
    verdict('I14', early.waiting < 2 || early.live > 0 || onPage.failed < 2 || !once(onPage.announced, /could not be loaded/i) || onPage.announced[0].inDialog
      || !dialogEarly.waiting || dialogEarly.live > 0 || !once(dialogFailed, /could not be loaded/i) || !dialogFailed[0].inDialog || axeViolations.length > 0
      || !once(dialogLoaded, /loaded/i) || /could not/i.test(dialogLoaded[0].text) || !dialogLoaded[0].inDialog || !seen.dialog.open, seen);
    await context.close();
  },
  async I15(browser) {
    // Rebuilding an open dialog when its evidence changes keeps keyboard focus on the same control, or on the dialog
    // when that control is gone; focus never falls out of the modal dialog to the page behind it.
    const focused = page => page.evaluate(() => { const a = document.activeElement; return {id: a?.id || '', inBody: !!document.querySelector('#detail-body')?.contains(a), tag: a?.tagName || '', text: (a?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80), href: a?.getAttribute?.('href') || ''}; });
    const same = (a, b) => a.inBody && b.inBody && a.tag === b.tag && a.text === b.text && a.href === b.href;
    const filled = page => page.waitForFunction(() => /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText), null, {timeout: 30000}).catch(() => {});
    // Show a catalog dialog whose shared evidence failed, with a control outside the evidence section, and Tab into it.
    const failedDialog = async (page, items) => {
      await page.route(SHARED_FILES, route => route.abort());
      await page.evaluate(key => showCatalog('items', key), items[0]);
      await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
      const key = await page.evaluate(items => items.find(key => { showCatalog('items', key); return [...document.querySelectorAll('#detail-body a[href], #detail-body summary, #detail-body button')].some(el => !el.closest('[data-annex]')); }) || null, items);
      assert.ok(key, 'probe setup: a catalog dialog with a control outside its evidence section');
      await page.locator('#close-detail').focus();
      await page.keyboard.press('Tab');
      await page.unroute(SHARED_FILES);
    };
    const {context, page} = await session(browser, desktop);
    const items = await evidenceItems(context);
    await failedDialog(page, items);
    const start = await focused(page);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(SHARED_FILES, async route => { await held; await route.continue(); });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));   // the retry rebuilds the dialog at once, waiting again
    await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-loading'), null, {timeout: 30000}).catch(() => {});
    const waiting = await focused(page);
    release();
    await filled(page);
    await page.waitForTimeout(300);
    const arrived = {...await focused(page), open: await page.evaluate(() => document.querySelector('#detail').open), filled: await page.evaluate(() => /Inspect original Pred\.gg definition/.test(document.querySelector('#detail-body').innerText))};
    await context.close();
    // The focused control is not part of the rebuilt dialog (simulated by dropping every control from the rebuild).
    const second = await session(browser, desktop);
    await failedDialog(second.page, items);
    const before = await focused(second.page);
    const rebuilt = await second.page.evaluate(() => {
      const refresh = detailRefresh; detailRefresh = () => { refresh(); document.querySelectorAll('#detail-body a[href], #detail-body summary, #detail-body button').forEach(el => el.remove()); };
      window.dispatchEvent(new Event('online'));
      return {id: document.activeElement?.id || '', tag: document.activeElement?.tagName || ''};
    });
    await filled(second.page);
    await second.page.waitForTimeout(300);
    const settled = await focused(second.page);
    await second.context.close();
    const seen = {start, waiting, arrived, gone: {before, rebuilt, settled}};
    verdict('I15', !start.inBody || !same(start, waiting) || !same(start, arrived) || !arrived.open || !arrived.filled
      || !before.inBody || rebuilt.id !== 'detail' || settled.id !== 'detail', seen);
  },
  async I16(browser) {
    // The announcement budget in harder cases: a fast load stays quiet; a page failure while a dialog is open is said
    // when the dialog closes; a new dialog starts silent; a retry while other files are still pending is a new wait;
    // a search or a layout change during a wait neither restarts it nor passes for its end.
    const said = async (page, from = 0) => (await page.evaluate(() => window.auditAnnounced)).slice(from).filter(a => /evidence/i.test(a.text));
    const settle = page => page.waitForTimeout(700), seen = {};
    {
      const {context, page} = await session(browser, desktop);
      const items = await evidenceItems(context);
      await page.evaluate(recordAnnouncements);
      // One hero's attribute evidence, served at once: nothing to announce.
      const t0 = Date.now();
      const shown = await page.evaluate(() => { S.heroTab = 'kit'; openHero('grux', 'offlane'); S.heroTab = 'kit'; render(); return !!document.querySelector('#main .annex-loading'); });
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 30000}).catch(() => {});
      seen.fast = {shown, took: Date.now() - t0};
      await settle(page);
      seen.fast.said = await said(page);
      // The Builds page's files fail while a catalog dialog is open.
      let fail; const held = new Promise(resolve => { fail = resolve; });
      await page.route('**/bundles/gold-hero-*.json', async route => { await held; await route.abort(); });
      const from = (await page.evaluate(() => window.auditAnnounced)).length;
      await page.evaluate(() => { S.role = 'jungle'; changeRoute('builds'); });
      await page.evaluate(key => showCatalog('items', key), items[0]);
      await page.waitForFunction(() => !document.querySelector('#detail-body .annex-loading'), null, {timeout: 30000}).catch(() => {});
      fail();
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 30000}).catch(() => {});
      await settle(page);
      const whileOpen = (await said(page, from)).filter(a => !a.inDialog);
      const marker = (await page.evaluate(() => window.auditAnnounced)).length;
      await page.evaluate(() => document.querySelector('#detail').close());
      await settle(page);
      seen.dialogOpen = {whileOpen: whileOpen.map(a => a.text), afterClose: (await said(page, marker)).filter(a => !a.inDialog).map(a => a.text)};
      // A support-ability dialog announces its failure; the next dialog opens without that text in its region.
      const pair = await page.evaluate(() => Object.keys(E.heroes).filter(s => !E.roles(s).includes('jungle') && s !== 'grux' && E.heroes[s].abilities?.length).slice(0, 2));
      await page.evaluate(slug => showSupportAbility(slug, 0), pair[0]);
      await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
      await settle(page);
      const first = await page.evaluate(() => [...document.querySelectorAll('#detail [role=status]')].map(e => e.textContent).join(''));
      const next = await page.evaluate(slug => { document.querySelector('#detail').close(); showSupportAbility(slug, 0); return [...document.querySelectorAll('#detail [role=status]')].map(e => e.textContent).join(''); }, pair[1]);
      seen.newDialog = {pair, first, next};
      await context.close();
    }
    {
      const {context, page} = await session(browser, desktop);
      await page.evaluate(recordAnnouncements);
      // Half of the Builds page's files fail at once; the others are still downloading.
      const cards = await page.evaluate(() => Object.keys(E.heroes).filter(s => E.roles(s).includes('jungle')));
      const failing = new Set(cards.filter((_, i) => i % 2 === 0));
      let release; const held = new Promise(resolve => { release = resolve; });
      await page.route('**/bundles/gold-hero-*.json', async route => { const slug = /gold-hero-(.+)-[0-9a-f]{16,}\.json/.exec(route.request().url())?.[1]; if (!failing.has(slug)) await held; await route.abort(); });
      await page.evaluate(() => { S.role = 'jungle'; changeRoute('builds'); });
      await page.waitForFunction(n => document.querySelectorAll('#main .annex-failed').length >= n, failing.size, {timeout: 30000}).catch(() => {});
      await settle(page);
      const firstWait = (await said(page)).length;
      // The connection returning retries the failed files while the others are pending: a new wait, announced again.
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction(() => window.auditAnnounced.filter(a => /evidence/i.test(a.text)).length >= 2, null, {timeout: 20000}).catch(() => {});
      await settle(page);
      const retried = (await said(page)).map(a => a.text);
      // A search redraws the same view: the cards it hides and shows again are still the same wait.
      await page.evaluate(() => { S.query = 'zz'; render(); S.query = ''; render(); });
      await settle(page);
      const afterSearch = (await said(page)).length;
      release();
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 30000}).catch(() => {});
      await settle(page);
      seen.retry = {cards: cards.length, failing: failing.size, firstWait, afterSearch, retried, end: (await said(page)).length};
      await context.close();
    }
    {
      const {context, page} = await session(browser, desktop);
      await page.evaluate(recordAnnouncements);
      // A wait that turns into the phone layout (whose Builds list shows no evidence) is not announced as loaded.
      let release; const held = new Promise(resolve => { release = resolve; });
      await page.route('**/bundles/gold-hero-*.json', async route => { await held; await route.continue(); });
      await page.evaluate(() => { S.role = 'jungle'; changeRoute('builds'); });
      await page.waitForTimeout(1300);
      await page.setViewportSize({width: 390, height: 844});
      await settle(page);
      const narrow = (await said(page)).map(a => a.text);
      release();
      await page.waitForTimeout(2000);
      seen.layout = {phone: await page.evaluate(() => companionMedia.matches), narrow, later: (await said(page)).map(a => a.text)};
      await context.close();
    }
    const onlyFailure = list => list.length === 1 && /could not be loaded/i.test(list[0]);
    verdict('I16', !seen.fast.shown || (seen.fast.took < 800 && seen.fast.said.length > 0)
      || seen.dialogOpen.whileOpen.length > 0 || !onlyFailure(seen.dialogOpen.afterClose)
      || !/could not be loaded/i.test(seen.newDialog.first) || seen.newDialog.next !== ''
      || seen.retry.failing < 2 || seen.retry.firstWait !== 1 || seen.retry.retried.length !== 2 || seen.retry.afterSearch !== 2 || !seen.retry.retried.every(t => /could not be loaded/i.test(t)) || seen.retry.end !== 2
      || !seen.layout.phone || seen.layout.narrow.length > 0 || seen.layout.later.length > 0, seen);
  },
  /* 2.33: design critique of 2.32.0 (phone first). Measured at 375x812 with default text in the quick companion
     (the harness defaults other probes to full details). */
  async U1(browser) {
    // The whole six-item starting build is readable on the hero page's first screen.
    const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
    await page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); openHero('steel', 'jungle'); }); await page.waitForFunction(() => !!document.querySelector('#main .simple-sections'), null, {timeout: 60000});
    const seen = await page.evaluate(() => {
      const plan = chosenPlan({slug: 'steel', role: 'jungle'}), nav = document.querySelector('#mobile-navigation')?.getBoundingClientRect().top ?? innerHeight;
      const keys = plan.items.map(n => catalogKey('items', n) || n);
      const firstOf = key => [...document.querySelectorAll('#main .item-button')].find(b => b.dataset.key === key && b.getBoundingClientRect().height > 0);
      const shown = keys.map(key => { const b = firstOf(key), r = b?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= nav; });
      return {items: plan.items.length, shown: shown.filter(Boolean).length, nav: Math.round(nav)};
    });
    verdict('U1', seen.items !== 6 || seen.shown < 6, seen);
    await context.close();
  },
  async U2(browser) {
    // 2.37.0: the hero header carries "Use in Match", on screen above the phone navigation when the page opens (no sticky dock).
    const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
    await page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); openHero('steel', 'jungle'); }); await page.waitForFunction(() => !!document.querySelector('#main .simple-sections'), null, {timeout: 60000});
    const at = async y => page.evaluate(async y => { scrollTo(0, y); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.querySelector('#main [data-start-live]'), r = b?.getBoundingClientRect(), nav = document.querySelector('#mobile-navigation')?.getBoundingClientRect().top ?? innerHeight;
      return {top: Math.round(r?.top ?? -1), bottom: Math.round(r?.bottom ?? -1), nav: Math.round(nav), visible: !!r && r.top >= 0 && r.bottom <= nav + 1}; }, y);
    const seen = {top: await at(0), middle: await at(Math.round(await page.evaluate(() => document.documentElement.scrollHeight / 2)))};
    verdict('U2', !seen.top.visible, seen);
    await context.close();
  },
  async U3(browser) {
    // 2.37.0: on every phone screen, Meta included, the status summary shares the rank row instead of adding a full-width banner.
    const {context, page} = await session(browser, {...phone, viewport: {width: 375, height: 812}});
    const seen = await page.evaluate(() => {
      B.errors = [...(B.errors || []), {source: 'Probe source', severity: 'error', detail: 'A required source could not be refreshed for this probe.'}];
      const measure = () => { const l = document.querySelector('#mobile-limits').getBoundingClientRect(), r = document.querySelector('#bracket').getBoundingClientRect();
        return {limitsTop: Math.round(l.top), limitsBottom: Math.round(l.bottom), rankTop: Math.round(r.top), sameRow: l.bottom > r.top && l.top < r.bottom, detail: !!document.querySelector('#mobile-limits span:not([aria-hidden])')?.getClientRects().length}; };
      companionPrefs.fullDetails = false; saveCompanionPrefs(); changeRoute('meta'); const meta = measure();
      openHero('steel', 'jungle'); const hero = measure();
      Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('match'); const live = measure();
      return {meta, hero, live};
    });
    verdict('U3', !seen.meta.sameRow || !seen.hero.sameRow || !seen.live.sameRow, seen);
    await context.close();
  },
  async U4(browser) {
    // A problem in the optional Pred.gg source alone is not presented as a source failure on the phone.
    const {context, page} = await session(browser, {...phone, viewport: {width: 375, height: 812}});
    const seen = await page.evaluate(() => {
      B.errors = [{source: 'Pred.gg all roles', severity: 'error', detail: 'Structured response unavailable.'}]; latestStatus.errors = [];
      companionPrefs.fullDetails = false; saveCompanionPrefs(); changeRoute('meta'); const n = document.querySelector('#mobile-limits');
      return {label: n.querySelector('strong')?.innerText || '', material: errors().some(e => isMaterialError(e))};
    });
    verdict('U4', !seen.material && /failure/i.test(seen.label), seen);
    await context.close();
  },
  async U5(browser) {
    // The hero sections are one row of tabs, not a two-row grid of large buttons.
    const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
    await page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); openHero('steel', 'jungle'); }); await page.waitForFunction(() => !!document.querySelector('#main .simple-sections'), null, {timeout: 60000});
    const seen = await page.evaluate(() => { const tops = [...document.querySelectorAll('#main .simple-sections button')].map(b => Math.round(b.getBoundingClientRect().top));
      return {buttons: tops.length, rows: new Set(tops).size, height: Math.round(document.querySelector('#main .simple-sections')?.getBoundingClientRect().height || 0)}; });
    verdict('U5', seen.buttons < 4 || seen.rows > 1 || seen.height > 60, seen);
    await context.close();
  },
  async U6(browser) {
    // The build states its provenance once per group: no "Core"/"Flexible" line under every item, no "Reviewed choice" under every loadout slot.
    const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
    await page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); openHero('steel', 'jungle'); }); await page.waitForFunction(() => !!document.querySelector('#main .simple-sections'), null, {timeout: 60000});
    const seen = await page.evaluate(() => {
      const perItem = [...document.querySelectorAll('#main .simple-purchases > li > small')].filter(s => /^(Core|Flexible)$/.test(s.innerText.trim())).length;
      const perSlot = [...document.querySelectorAll('#main .simple-setup > div > small')].filter(s => /Reviewed choice|Calculated selection/.test(s.innerText)).length;
      const groups = [...document.querySelectorAll('#main .purchase-group')].map(h => h.innerText.trim());
      return {perItem, perSlot, groups, items: document.querySelectorAll('#main .simple-purchases > li').length}; });
    verdict('U6', seen.perItem > 0 || seen.perSlot > 0 || seen.groups.length < 2 || seen.items !== 6, seen);
    await context.close();
  },
  async U7(browser) {
    // Meta rows are an even height with an in-app cue, not an external-link arrow. 2.37.0: an active reviewed build is the norm, so
    // "Build ready" is gone; only a hero without one is flagged.
    const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
    const seen = await page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); S.role = 'jungle'; changeRoute('builds'); changeRoute('meta');
      const rows = [...document.querySelectorAll('#mobile-all-list .mobile-hero-card')], heights = rows.map(r => Math.round(r.getBoundingClientRect().height));
      const steel = rows.find(r => r.querySelector('[data-hero="steel"]'));
      return {rows: rows.length, min: Math.min(...heights), max: Math.max(...heights), arrow: rows.filter(r => r.innerText.includes('↗')).length, steel: steel?.innerText.replace(/\s+/g, ' ') || ''}; });
    verdict('U7', seen.max - seen.min > 16 || seen.arrow > 0 || /Build ready/.test(seen.steel), seen);
    await context.close();
  }
};

/* ---------------------------------------------------------------------------
   W-series: 2.29 redesign, stage 1 (tokens and typography).

   These probes read the published stylesheet and the computed styles of a live
   page. They guard the token layer itself: that themes redefine tokens rather
   than components, that no component hard-codes a colour, and that the four
   evidence classes stay visually distinct in both themes.
   --------------------------------------------------------------------------- */

/* Every rule in the stylesheet, flattened, with the media query it sits under.
   CSSRuleList is not iterable in Chromium, so both loops index deliberately: a for..of
   here throws, the throw is swallowed by the cross-origin guard, and the probe silently
   reads zero rules and passes. */
const readRules = () => {
  const out = [];
  const walk = (rules, media) => {
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      // Style rules come first: since CSS nesting, a CSSStyleRule ALSO carries a (usually
      // empty) cssRules list, so testing for that first recurses into every rule and
      // collects none of them.
      if (r.selectorText) {
        out.push({selector: r.selectorText, text: r.cssText, media: media || ''});
        if (r.cssRules && r.cssRules.length) walk(r.cssRules, media);
        continue;
      }
      if (r.cssRules) walk(r.cssRules, r.conditionText || media);
    }
  };
  // Read the product's own <style> elements directly. document.styleSheets is not used:
  // the cross-origin font sheet is unreadable, and whether it appears in that list at all
  // depends on whether the CDN responded, which silently changes what a probe sees.
  const styles = document.querySelectorAll('style');
  for (let i = 0; i < styles.length; i++) {
    const sheet = styles[i].sheet;
    if (sheet) walk(sheet.cssRules, '');
  }
  if (!out.length) throw Error('no CSS rules readable: ' + styles.length + ' style elements');
  return out;
};

/* The product marks a class of evidence with a tag. These are the four; `warning` is a
   status, not a class of evidence, and is deliberately not one of them. */
const EVIDENCE = ['observed', 'calculated', 'reviewed', 'official'];

probes.W1 = async browser => {
  /* A theme block redefines tokens. The moment it styles a component, the component's
     appearance lives in two places and the token layer is no longer the single source. */
  const {context, page} = await session(browser, desktop);
  const rules = await page.evaluate(readRules);
  const themed = rules.filter(r => /:root\s*\[data-theme/.test(r.selector) || /\[data-theme=[^\]]*\]\s+\S/.test(r.selector));
  const offenders = themed
    .filter(r => /\[data-theme[^\]]*\]\s+[.#\w\[]/.test(r.selector))          // a descendant, not :root itself
    .map(r => ({selector: r.selector, declares: (r.text.match(/--[a-z0-9-]+\s*:/gi) || []).length,
                hardCoded: (r.text.match(/(?::|\s)(#[0-9a-f]{3,8}\b|rgba?\([^)]*\))/gi) || []).length}))
    .filter(r => r.hardCoded > 0 || r.declares === 0);
  await context.close();
  verdict('W1', offenders.length > 0, {themed_rules: themed.length, offenders: offenders.slice(0, 6), count: offenders.length});
};

probes.W2 = async browser => {
  /* Colour belongs to the token layer. A component rule that names a colour directly
     cannot follow a theme, and is invisible to any future palette change. */
  const {context, page} = await session(browser, desktop);
  const rules = await page.evaluate(readRules);
  const literal = /(?:^|[:,\s(])(#[0-9a-f]{3,8}\b|rgba?\(\s*\d)/i;
  const offenders = [];
  for (const r of rules) {
    if (/^:root/.test(r.selector.trim()) && !/\[data-theme[^\]]*\]\s+[.#\w]/.test(r.selector)) continue;  // token blocks
    const body = r.text.slice(r.text.indexOf('{') + 1, -1);
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || !rest.length) continue;
      if (prop.trim().startsWith('--')) continue;                 // declaring a token is the point
      const value = rest.join(':');
      if (literal.test(value)) offenders.push({selector: r.selector.slice(0, 70), decl: decl.trim().slice(0, 70)});
    }
  }
  await context.close();
  verdict('W2', offenders.length > 0, {offenders: offenders.slice(0, 8), count: offenders.length});
};

probes.W3 = async browser => {
  /* The four classes of evidence must stay tellable apart at a glance, in BOTH themes.
     Two classes sharing an appearance is the failure this whole product exists to avoid.

     The tags are rendered into the page rather than hunted for: whether a given route
     happens to show all four is a content question, and this is a question about the
     stylesheet. A class with no rule of its own falls back to the bare .tag treatment,
     which is exactly what this must catch. */
  const seen = {};
  for (const theme of ['dark', 'light']) {
    const {context, page} = await session(browser, desktop);
    if (theme === 'light') {
      await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
      await page.waitForTimeout(120);
    }
    seen[theme] = await page.evaluate(classes => {
      const host = document.createElement('div');
      host.style.position = 'absolute'; host.style.left = '-9999px';
      document.body.appendChild(host);
      const out = {};
      for (const k of classes) {
        const el = document.createElement('span');
        el.className = 'tag ' + k; el.textContent = k;
        host.appendChild(el);
        const cs = getComputedStyle(el), before = getComputedStyle(el, '::before');
        out[k] = {color: cs.color, background: cs.backgroundColor, family: cs.fontFamily.split(',')[0],
                  marker: (before.content || '').replace(/["']/g, '').trim()};
      }
      const bare = document.createElement('span');
      bare.className = 'tag'; host.appendChild(bare);
      out._bare = {color: getComputedStyle(bare).color, background: getComputedStyle(bare).backgroundColor};
      host.remove();
      return out;
    }, EVIDENCE);
    await context.close();
  }
  const signature = v => [v.color, v.background, v.family, v.marker].join('~');
  const unstyled = [], clash = [];
  for (const theme of ['dark', 'light']) {
    const t = seen[theme];
    for (const k of EVIDENCE) {
      if (!t[k].marker || (t[k].color === t._bare.color && t[k].background === t._bare.background)) unstyled.push({theme, k});
    }
    for (let i = 0; i < EVIDENCE.length; i++) for (let j = i + 1; j < EVIDENCE.length; j++) {
      if (signature(t[EVIDENCE[i]]) === signature(t[EVIDENCE[j]])) clash.push({theme, a: EVIDENCE[i], b: EVIDENCE[j]});
    }
  }
  verdict('W3', unstyled.length > 0 || clash.length > 0, {unstyled, clashes: clash, seen});
};

probes.W4 = async browser => {
  /* Type and space come from a scale. Ad-hoc pixel values are how a scale rots. */
  const {context, page} = await session(browser, desktop);
  const rules = await page.evaluate(readRules);
  const scale = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const steps = ['3xs', '2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
    return {spaces: Array.from({length: 8}, (_, i) => cs.getPropertyValue('--s' + (i + 1)).trim()).filter(Boolean),
            sizes: steps.map(n => cs.getPropertyValue('--t-' + n).trim()).filter(Boolean), root: cs.fontSize};
  });
  const offenders = [];
  for (const r of rules) {
    if (/^:root/.test(r.selector.trim())) continue;
    const body = r.text.slice(r.text.indexOf('{') + 1, -1);
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || !rest.length) continue;
      const name = prop.trim(), value = rest.join(':').trim();
      if (name !== 'font-size') continue;
      // 0 is a layout device (hiding a label), not a point on a type scale.
      if (/var\(/.test(value) || /^(inherit|initial|unset|larger|smaller|0|0px)$/.test(value)) continue;
      offenders.push({selector: r.selector.slice(0, 60), decl: decl.trim().slice(0, 50), media: r.media.slice(0, 40)});
    }
  }
  await context.close();
  verdict('W4', scale.sizes.length === 0 || offenders.length > 0,
    {type_scale: scale.sizes, space_scale: scale.spaces, font_size_literals: offenders.length, offenders: offenders.slice(0, 8)});
};

/* ---------------------------------------------------------------------------
   DS-series: 2.33 design-system audit. Spacing and radius come from tokens, one tab-strip
   and one chip pattern, one focus ring, indicators that pass 3:1, and a trimmed token set. */
const SPACING = /^(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?$/;

probes.DS1 = async browser => {
  /* Spacing resolves through the --s* scale. Hairlines (0, ±1px) and layout reservations of
     40px or more (room for the fixed phone navigation, for example) are not spacing steps. */
  const {context, page} = await session(browser, desktop);
  const rules = await page.evaluate(readRules);
  const offenders = [];
  for (const r of rules) {
    if (/^:root/.test(r.selector.trim())) continue;
    const body = r.text.slice(r.text.indexOf('{') + 1, -1);
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || !rest.length || !SPACING.test(prop.trim())) continue;
      for (const m of rest.join(':').matchAll(/(-?\d*\.?\d+)px/g)) {
        const n = Math.abs(parseFloat(m[1]));
        if (n <= 1 || n >= 40) continue;
        offenders.push({selector: r.selector.slice(0, 60), decl: decl.trim().slice(0, 60), media: r.media.slice(0, 30)});
        break;
      }
    }
  }
  await context.close();
  verdict('DS1', offenders.length > 0, {count: offenders.length, offenders: offenders.slice(0, 8)});
};

probes.DS2 = async browser => {
  /* Corner radius comes from four tokens: sm, md, lg and pill. Circles (50%) and square corners (0) are shapes, not steps. */
  const {context, page} = await session(browser, desktop);
  const rules = await page.evaluate(readRules);
  const tokens = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement), out = {};
    for (const r of document.querySelectorAll('style')) for (const m of (r.textContent.match(/--radius[\w-]*(?=:)/g) || [])) out[m] = cs.getPropertyValue(m).trim();
    return out; });
  const offenders = [];
  for (const r of rules) {
    if (/^:root/.test(r.selector.trim())) continue;
    const body = r.text.slice(r.text.indexOf('{') + 1, -1);
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || !rest.length || !/radius$/.test(prop.trim()) || prop.trim().startsWith('--')) continue;
      const parts = rest.join(':').trim().split(/\s+(?![^(]*\))/);
      if (parts.some(v => !/^(0|0px|50%|inherit|var\(--radius-(sm|md|lg|pill)\))$/.test(v))) offenders.push({selector: r.selector.slice(0, 60), decl: decl.trim().slice(0, 60)});
    }
  }
  const names = Object.keys(tokens).sort().join(',');
  await context.close();
  verdict('DS2', offenders.length > 0 || names !== '--radius-lg,--radius-md,--radius-pill,--radius-sm', {tokens, count: offenders.length, offenders: offenders.slice(0, 8)});
};

probes.DS3 = async browser => {
  /* One tab-strip pattern: content-switching strips are tablists with one selected tab, they share
     the selected treatment, and on the phone they wrap rather than scroll sideways (2.29 stage 1). */
  const seen = {};
  for (const width of [320, 375, 412]) {
    const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width, height: 812}});
    await page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); openHero('steel', 'jungle'); });
    await page.waitForFunction(() => !!document.querySelector('#main .simple-sections'), null, {timeout: 60000});
    seen[width] = await page.evaluate(() => {
      const strip = document.querySelector('#main .simple-sections'), tabs = [...strip.querySelectorAll('button')];
      const hero = {role: strip.getAttribute('role'), tabs: tabs.map(t => t.getAttribute('role')), selected: tabs.filter(t => t.getAttribute('aria-selected') === 'true').length,
        scrolls: strip.scrollWidth > strip.clientWidth + 1, short: tabs.filter(t => t.getBoundingClientRect().height < 44).length};
      const sel = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs.find(t => t.getAttribute('aria-current') === 'true');
      const look = el => el ? (s => [s.backgroundColor, s.color, s.borderTopColor].join('|'))(getComputedStyle(el)) : null;
      const heroLook = look(sel);
      changeRoute('meta');
      const roleSel = document.querySelector('#main [data-mobile-role][aria-selected="true"]');
      const roleStrip = roleSel?.closest('[role=tablist]');
      return {hero, heroLook, roleLook: look(roleSel), roleScrolls: roleStrip ? roleStrip.scrollWidth > roleStrip.clientWidth + 1 : null};
    });
    await context.close();
  }
  const bad = Object.values(seen).some(s => s.hero.role !== 'tablist' || s.hero.tabs.some(r => r !== 'tab') || s.hero.selected !== 1 || s.hero.scrolls || s.hero.short || s.roleScrolls || s.heroLook !== s.roleLook);
  verdict('DS3', bad, seen);
};

probes.DS4 = async browser => {
  /* One chip pattern: evidence tags, status pills and the phone build flag share the chip base and its geometry.
     2.37.0 replaced "Build ready" on almost every row with a flag on the few heroes without an active reviewed build. */
  const read = el => el ? (s => ({chip: el.classList.contains('chip'), radius: s.borderTopLeftRadius, pad: s.paddingTop + ' ' + s.paddingLeft, size: s.fontSize, weight: s.fontWeight}))(getComputedStyle(el)) : null;
  const {context, page} = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
  const phoneSeen = await page.evaluate(read => { read = new Function('return ' + read)();
    companionPrefs.fullDetails = false; saveCompanionPrefs(); S.role = 'jungle'; changeRoute('builds'); changeRoute('meta');
    const host = document.createElement('div'); host.innerHTML = badge('Reviewed', 'reviewed'); document.querySelector('#main').append(host);
    const unreviewed = Object.keys(E.heroes).flatMap(slug => E.roles(slug).map(role => ({slug, role}))).find(p => !E.buildReview(p.slug, p.role)?.active);
    if (unreviewed) host.insertAdjacentHTML('beforeend', heroTile(unreviewed));
    const out = {tag: read(host.firstElementChild), flag: read(host.querySelector('.no-build-chip'))}; host.remove(); return out; }, read.toString());
  await context.close();
  const d = await session(browser, desktop);
  const pill = await d.page.evaluate(read => { read = new Function('return ' + read)(); return read(document.querySelector('#patch-strip .status-pill')); }, read.toString());
  await d.context.close();
  const all = {...phoneSeen, pill}, list = Object.values(all);
  const same = k => new Set(list.map(v => v && v[k])).size === 1;
  verdict('DS4', list.some(v => !v || !v.chip) || !same('radius') || !same('pad') || !same('size') || !same('weight'), all);
};

probes.DS5 = async browser => {
  /* One focus ring (the --focus token, 3px) on phone and desktop, and selection indicators that reach 3:1
     against every surface in both themes. Gold stays a fill colour; indicators use --indicator. */
  const contrast = await (async () => {
    const out = {};
    for (const theme of ['dark', 'light']) {
      const {context, page} = await session(browser, desktop);
      out[theme] = await page.evaluate(theme => {
        document.documentElement.setAttribute('data-theme', theme);
        const probe = document.createElement('span'); document.body.append(probe);
        const rgb = v => { probe.style.color = ''; probe.style.color = `var(${v})`; const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : null; };
        const lum = c => { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const res = {};
        for (const fg of ['--focus', '--indicator']) { const c = rgb(fg); if (!getComputedStyle(document.documentElement).getPropertyValue(fg).trim()) { res[fg] = 'missing'; continue; }
          res[fg] = Math.min(...['--bg', '--surface', '--surface-2', '--inset'].map(bg => ratio(c, rgb(bg)))).toFixed(2); }
        probe.remove(); return res; }, theme);
      await context.close();
    }
    return out;
  })();
  const {context, page} = await session(browser, desktop);
  const rules = await page.evaluate(readRules);
  const goldLines = rules.filter(r => /(?:border[\w-]*|outline[\w-]*|box-shadow)\s*:[^;]*var\(--gold\)/.test(r.text)).map(r => r.selector.slice(0, 50));
  const focusDesk = await (async () => { await page.keyboard.press('Tab'); for (let i = 0; i < 30; i++) { const ok = await page.evaluate(() => document.activeElement?.tagName === 'BUTTON'); if (ok) break; await page.keyboard.press('Tab'); }
    return page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor; }); })();
  const focusColor = await page.evaluate(() => { const p = document.createElement('span'); p.style.color = 'var(--focus)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; });
  await context.close();
  const ph = await historicalBuildSession(browser, {...phone, viewport: {width: 375, height: 812}});
  await ph.page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); openHero('steel', 'jungle'); });
  await ph.page.waitForFunction(() => !!document.querySelector('#main .simple-sections'), null, {timeout: 60000});
  const focusPhone = await (async () => { await ph.page.evaluate(() => document.querySelector('#main .back, #main [data-route="meta"]')?.focus()); await ph.page.keyboard.press('Tab');
    for (let i = 0; i < 40; i++) { const ok = await ph.page.evaluate(() => !!document.activeElement?.closest('.simple-sections')); if (ok) break; await ph.page.keyboard.press('Tab'); }
    return ph.page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor; }); })();
  await ph.context.close();
  const want = '3px solid ' + focusColor;
  const weak = Object.entries(contrast).flatMap(([t, r]) => Object.entries(r).filter(([, v]) => v === 'missing' || Number(v) < 3).map(([k, v]) => t + ' ' + k + ' ' + v));
  verdict('DS5', weak.length > 0 || goldLines.length > 0 || focusDesk !== want || focusPhone !== want, {contrast, weak, gold_indicators: goldLines.slice(0, 8), focusDesk, focusPhone, want});
};

probes.DS6 = async browser => {
  /* A trimmed token set: no parallel phone palette, no aliases or duplicate tokens, and a rem type scale of at most six steps. */
  const {context, page} = await session(browser, desktop);
  const names = await page.evaluate(() => { const set = new Set(); for (const s of document.querySelectorAll('style')) for (const m of (s.textContent.match(/--[\w-]+(?=\s*:)/g) || [])) set.add(m); return [...set]; });
  await context.close();
  const phoneTokens = names.filter(n => n.startsWith('--phone-')), aliases = names.filter(n => ['--serif', '--gold-soft'].includes(n)), rem = names.filter(n => /^--tr-/.test(n));
  verdict('DS6', phoneTokens.length > 0 || aliases.length > 0 || rem.length > 6, {phoneTokens, aliases, rem});
};


/* ---------------------------------------------------------------------------
   W-series continued: 2.29 redesign, stage 2 (shell and navigation).
   --------------------------------------------------------------------------- */

/* Every element that is stuck to the viewport right now, with its box. */
const stuckZones = () => {
  const out = [];
  for (const sel of ['.topbar', '.sidebar', '#patch-strip', '#status-panel', '#mobile-navigation', '.mobile-tabbar', '#material-notices']) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const pos = getComputedStyle(el).position;
    if (pos !== 'sticky' && pos !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.height) out.push({sel, top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height});
  }
  return out;
};

probes.W5 = async browser => {
  /* Tabbing to a control must not park it underneath the chrome. The browser scrolls a
     focused element to the edge of the viewport unless scroll-padding says otherwise,
     and a fixed bottom navigation sits exactly on that edge. */
  const seen = {};
  for (const [w, h, mobile] of [[320, 700, true], [390, 844, true], [1440, 900, false]]) {
    const {context, page} = await session(browser, {viewport: {width: w, height: h}, isMobile: mobile, hasTouch: mobile});
    seen[w + 'x' + h] = await page.evaluate(zonesSrc => {
      const zones = (new Function('return (' + zonesSrc + ')'))()();
      const covered = [];
      let checked = 0;
      for (const el of document.querySelectorAll('main button, main summary, main input, main select, main a[href]')) {
        if (!el.getBoundingClientRect().height) continue;
        if (el.closest('details:not([open])')) continue;
        if (zones.some(z => document.querySelector(z.sel).contains(el))) continue;
        el.focus();
        const r = el.getBoundingClientRect();
        checked++;
        const label = (el.textContent || el.id || '').trim().slice(0, 24);
        if (r.bottom < 0 || r.top > innerHeight) { covered.push({why: 'off screen after focus', label}); continue; }
        if (zones.some(z => z.top < r.bottom - 2 && z.bottom > r.top + 2 && z.left < r.right - 2 && z.right > r.left + 2))
          covered.push({why: 'under sticky chrome', label, top: Math.round(r.top)});
      }
      const cs = getComputedStyle(document.documentElement);
      return {checked, covered: covered.length, examples: covered.slice(0, 4),
              scroll_padding: [cs.scrollPaddingTop, cs.scrollPaddingBottom].join(' / '),
              zones: zones.map(z => z.sel + ':' + Math.round(z.height))};
    }, stuckZones.toString());
    await context.close();
  }
  verdict('W5', Object.values(seen).some(v => v.covered > 0), seen);
};

probes.W6 = async browser => {
  /* Data kept from an earlier collection is a DATE, not a fault. It must not wear the
     warning treatment, and it must differ from a currency warning by more than colour
     alone, because the two states print the same words. */
  const seen = {};
  for (const theme of ['dark', 'light']) {
    const {context, page} = await session(browser, desktop);
    if (theme === 'light') { await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await page.waitForTimeout(120); }
    seen[theme] = await page.evaluate(() => {
      const emitted = [];
      for (const route of ['meta', 'builds', 'planner', 'live', 'library', 'guidance', 'data']) {
        try { changeRoute(route); } catch (e) { continue; }
        document.querySelectorAll('#main details').forEach(d => { d.open = true; });
        for (const t of document.querySelectorAll('.tag')) {
          const text = t.textContent.trim();
          if (/^(Saved|Retained)\b/.test(text)) emitted.push({route, text: text.slice(0, 28), cls: t.className});
        }
      }
      try {
        openHero('steel', 'jungle');
        document.querySelectorAll('#main details').forEach(d => { d.open = true; });
        for (const t of document.querySelectorAll('.tag')) {
          const text = t.textContent.trim();
          if (/^(Saved|Retained)\b/.test(text)) emitted.push({route: 'hero', text: text.slice(0, 28), cls: t.className});
        }
      } catch (e) {}
      // the treatments themselves, rendered rather than hunted for
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(host);
      const read = cls => {
        const el = document.createElement('span');
        el.className = 'tag ' + cls; host.appendChild(el);
        const cs = getComputedStyle(el), before = getComputedStyle(el, '::before');
        return {color: cs.color, background: cs.backgroundColor, marker: (before.content || '').replace(/["']/g, '').trim()};
      };
      const styles = {saved: read('saved'), warning: read('warning')};
      host.remove();
      const unique = {};
      for (const e of emitted) unique[e.cls + '|' + e.text.split(' ').slice(0, 2).join(' ')] = e;
      /* Ask the function that decides, so the verdict does not depend on whether this
         fixture happens to contain a failed source. An old date with status 'retained'
         is data kept deliberately; the same date without it is a currency warning. */
      const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
      const decided = {retained: savedTag(old, true), stale: savedTag(old, false)};
      return {emitted: Object.values(unique).slice(0, 6), count: emitted.length, styles, decided};
    });
    await context.close();
  }
  const retainedWearsWarning = Object.values(seen).some(t => /\bwarning\b/.test(t.decided.retained));
  const retainedUnmarked = Object.values(seen).some(t => !/\bsaved\b/.test(t.decided.retained));
  const colourOnly = Object.values(seen).some(t => !t.styles.saved.marker || t.styles.saved.marker === t.styles.warning.marker);
  verdict('W6', retainedWearsWarning || retainedUnmarked || colourOnly, seen);
};

probes.W7 = async browser => {
  /* GUARD: 1280x1024 at 400% browser zoom is a 320x256 viewport. Reflow without a
     horizontal scrollbar is necessary but not sufficient - chrome that is reasonable on
     a tall phone can leave nothing to read in. */
  const {context, page} = await session(browser, {viewport: {width: 320, height: 256}, isMobile: true, hasTouch: true});
  const seen = await page.evaluate(zonesSrc => {
    const zones = (new Function('return (' + zonesSrc + ')'))()();
    const out = {routes: {}};
    for (const route of ['meta', 'builds', 'planner', 'live', 'data']) {
      try { changeRoute(route); } catch (e) { continue; }
      out.routes[route] = document.documentElement.scrollWidth - innerWidth;
    }
    out.chrome_px = Math.round(zones.reduce((n, z) => n + z.height, 0));
    out.readable_px = Math.round(innerHeight - out.chrome_px);
    out.zones = zones.map(z => z.sel + ':' + Math.round(z.height));
    return out;
  }, stuckZones.toString());
  await context.close();
  verdict('W7', Object.values(seen.routes).some(v => v > 0) || seen.readable_px < 120, seen);
};

probes.W8 = async browser => {
  /* GUARD: the freshness line wraps rather than scrolling, and the control that opens
     the detail is fully on screen at every desktop width. Nothing about how fresh the
     data is may sit off the edge of a hidden scroller. */
  const seen = {};
  for (const width of [1280, 1440, 1920]) {
    const {context, page} = await session(browser, {viewport: {width, height: 900}});
    seen[width] = await page.evaluate(() => {
      const strip = document.querySelector('#patch-strip'), toggle = document.querySelector('#status-toggle');
      const box = el => { const r = el.getBoundingClientRect(); return {left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height)}; };
      return {
        strip: strip ? {...box(strip), scrolls: strip.scrollWidth > strip.clientWidth + 1, wrap: getComputedStyle(strip).flexWrap} : null,
        toggle: toggle ? {...box(toggle), onScreen: toggle.getBoundingClientRect().right <= innerWidth + 0.5 && toggle.getBoundingClientRect().left >= -0.5} : null,
        notices_visible: !!document.querySelector('#material-notices')?.offsetHeight
      };
    });
    await context.close();
  }
  verdict('W8', Object.values(seen).some(v => !v.strip || v.strip.scrolls || v.strip.wrap !== 'wrap' || !v.toggle || !v.toggle.onScreen), seen);
};

/* ---------------------------------------------------------------------------
   X-series: 2.29 redesign, stage 3 (the hero build).

   These guard the categories the ENGINE produces, not a two-way observed/substituted
   split. engine.js emits, per build: plannedBuild kind 'reviewed' or 'provisional'
   (with manual set when the reader selected a source playstyle), and per slot a kind of
   'core', 'baseline', 'need' or 'owned' with its own label. Every slot may also carry
   `measured`, a purchase-position sample whose `supports_current_fit` the engine has
   already decided. A supporting sample must never promote a choice to an observed one.
   --------------------------------------------------------------------------- */

/* X1-X3 checked the desktop Build Coach's per-slot categories and samples; they retired with the coach in 2.41.0
   (tests/known-defects.json). Match's adapted build is guarded by X4 and DQ8. */
probes.X4 = async browser => {
  /* GUARD (Match, 2.36.0): a substitution says what it replaced and why, a need the engine could not
     answer is named, and the adapted six is labelled calculated with its no-win-rate note. */
  const {context, page} = await historicalBuildSession(browser, desktop);
  const seen = await page.evaluate(() => {
    // An enemy is what makes the engine substitute at all, so the guard needs one.
    S.me = 'steel'; S.locks = [{slug: 'steel', role: 'jungle'}]; S.role = 'jungle';
    S.enemies = [{slug: 'countess', role: 'midlane'}];
    changeRoute('match');
    const text = document.querySelector('#main').innerText.replace(/\s+/g, ' ');
    const choice = buildSelection({slug: 'steel', role: 'jungle'});
    const engine = E.adaptBuild({slug: 'steel', role: 'jungle'}, [], S.enemies, {state: 'even', primaryThreat: null, variant: choice.index});
    return {
      route: S.route,
      swaps: engine.swaps.map(s => ({...s, shown: text.includes('Replaces ' + s.from) && text.includes(s.to)})),
      unmet: engine.unmet.map(id => { const label = engine.needs.find(n => n.id === id)?.label || id; return {id, shown: text.includes(label)}; }),
      calculated: /Calculated changes|Starting build kept/.test(text),
      note_shown: !!engine.note && text.includes(engine.note.slice(0, 40))
    };
  });
  await context.close();
  verdict('X4', seen.route !== 'match' || !seen.swaps.length || seen.swaps.some(s => !s.shown) || seen.unmet.some(u => !u.shown) || !seen.calculated || !seen.note_shown, seen);
};

/* ---------------------------------------------------------------------------
   Stage 3a regressions. Each drives the rendering helpers with one engine-shaped
   input, because each concerns a case the staged fixture does not happen to contain.
   --------------------------------------------------------------------------- */

probes.X5 = async browser => {
  /* An item the engine moved EARLIER is the same item in a different place. Calling that
     a substitution claims a replacement that never happened. engine.js sets slot.timing
     for the move and slot.kind='need' for a replacement; they are not the same event. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const plan = {kind: 'reviewed', manual: false};
    const cases = {
      reordered_reviewed: buildCategory(plan, {name: 'Fire Blossom', kind: 'baseline', label: 'Reviewed flexible slot', timing: true}),
      reordered_core: buildCategory(plan, {name: 'Dynamo', kind: 'core', label: 'Reviewed core', timing: true}),
      substituted: buildCategory(plan, {name: 'Tainted Charm', kind: 'need', label: 'Anti-heal'}),
      untouched: buildCategory(plan, {name: 'Flux Matrix', kind: 'core', label: 'Reviewed core'}),
      owned: buildCategory(plan, {name: 'Stonewall', kind: 'owned', label: 'Owned · kept'})
    };
    // and the two must stay distinguishable on screen, not only in the returned object
    return {cases, timingText: cases.reordered_reviewed.text, substitutionText: cases.substituted.text};
  });
  await context.close();
  const timing = seen.cases.reordered_reviewed, core = seen.cases.reordered_core;
  const bad = /substitut/i.test(timing.text) || /substitut/i.test(core.text)          // a move called a replacement
    || !/earlier|timing|moved/i.test(timing.text)                                      // or not identified as a move
    || timing.text === seen.cases.untouched.text                                       // or indistinguishable from an untouched part
    || !/substitut/i.test(seen.cases.substituted.text);                                // or a real replacement no longer named
  verdict('X5', bad, seen);
};

probes.X6 = async browser => {
  /* currentItemPool keeps the LARGEST observation across purchase positions and merges it
     onto the item, so the sample shown beside slot 4 may have been recorded at position 3.
     The screen must carry the observation's own position, cohort and date, and must say
     when that position is not the slot it sits beside. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    const third = {name: 'Giant’s Ring', wr: 63.4, played: 412, slot: 'thirdTier3', source: 'Pred.gg',
      label: 'Pred.gg 1.16.4 Gold+ Ranked jungle thirdTier3', fetched_at: '2026-09-15T09:00:00Z', supports_current_fit: true};
    const same = {...third, slot: 'fourthTier3', label: 'Pred.gg 1.16.4 Gold+ Ranked jungle fourthTier3'};
    const statz = {...third, slot: 'core', source: 'Statz', label: 'Exact core sequence in variant 1', supports_current_fit: false};
    return {
      mismatched: supportingSample(third, 4, now),
      matched: supportingSample(same, 4, now),
      sequence: supportingSample(statz, 4, now),
      none: supportingSample(null, 4, now)
    };
  });
  await context.close();
  const strip = h => h.replace(/<[^>]*>/g, '');
  const mismatched = strip(seen.mismatched), matched = strip(seen.matched), sequence = strip(seen.sequence);
  const bad = !/win rate/i.test(mismatched)                                   // the number is not named as a win rate
    || !/position 3/.test(mismatched) || !/not position 4/.test(mismatched)   // the real position is not stated
    || !/Gold\+/.test(mismatched) || !/jungle/.test(mismatched)               // the cohort is dropped
    || !/collected/i.test(mismatched)                                          // the collection date is dropped
    || /not position/.test(matched)                                            // a matching position is wrongly flagged
    || !/variant sequence/i.test(sequence);                                    // a sequence sample implies a position
  verdict('X6', bad, {mismatched, matched, sequence, none: strip(seen.none)});
};

probes.X7 = async browser => {
  /* A Statz observation is inspection-only by construction: currentItemPool takes that
     path when Pred.gg item-position collection is unavailable, and marks every row
     supports_current_fit false whatever its size or age. Explaining a fresh, large one as
     "too small or too old" states a reason the engine never gave. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    const base = {name: 'Dynamo', wr: 55.2, source: 'Pred.gg', slot: 'firstTier3',
      label: 'Pred.gg 1.16.4 Gold+ Ranked jungle firstTier3', supports_current_fit: false};
    const freshLargeStatz = {...base, source: 'Statz', slot: 'core', label: 'Exact core sequence in variant 1',
      played: 4821, fetched_at: '2026-09-15T11:30:00Z'};
    return {
      fresh_large_statz: supportingSample(freshLargeStatz, 1, now),
      too_few_games: supportingSample({...base, played: 42, fetched_at: '2026-09-15T11:30:00Z'}, 1, now),
      too_old: supportingSample({...base, played: 4000, fetched_at: '2026-09-10T11:30:00Z'}, 1, now),
      future_dated: supportingSample({...base, played: 4000, fetched_at: '2026-09-20T11:30:00Z'}, 1, now),
      supported: supportingSample({...base, played: 4000, fetched_at: '2026-09-15T11:30:00Z', supports_current_fit: true}, 1, now)
    };
  });
  await context.close();
  const strip = h => h.replace(/<[^>]*>/g, '');
  const statz = strip(seen.fresh_large_statz), few = strip(seen.too_few_games);
  const old = strip(seen.too_old), future = strip(seen.future_dated), ok = strip(seen.supported);
  const bad = /too small|too old/i.test(statz + few + old + future)              // the blanket phrase survives anywhere
    || !/inspection only/i.test(statz) || /minimum|hours ago/i.test(statz)        // a fresh large Statz row blamed on size or age
    || !/Statz/.test(statz)
    || !/100-game minimum/.test(few)                                              // the real reason for a small sample
    || !/more than 30 hours/.test(old)                                            // the real reason for an old one
    || !/in the future/.test(future)                                              // the real reason for a future-dated one
    || /inspection only/i.test(ok);                                               // a supported sample wrongly withheld
  verdict('X7', bad, {statz, few, old, future, ok});
};


/* ---------------------------------------------------------------------------
   Y-series: 2.29 redesign, stage 3b (the hero experience).
   --------------------------------------------------------------------------- */

const openSteel = (page, tab) => page.evaluate(t => {
  S.role = 'jungle'; openHero('steel', 'jungle'); S.heroTab = t; render();
  document.querySelectorAll('#main details').forEach(d => { d.open = true; });
}, tab);

probes.Y1 = async browser => {
  /* The loadout is the rest of the build: augment, Eternal, both blessings, the crest and
     its evolutions. Every part carries the same category and evidence treatment the six
     items got in stage 3a - a part with no label is a part with no provenance. */
  const {context, page} = await historicalBuildSession(browser, desktop);
  await openSteel(page, 'builds');
  const seen = await page.evaluate(() => {
    const a = adviceFor({slug: 'steel', role: 'jungle'});
    const strip = document.querySelector('.loadout-strip');
    const parts = strip ? [...strip.children].map(d => ({
      label: d.querySelector('small')?.textContent.trim(),
      text: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
      tags: [...d.querySelectorAll('.tag')].map(t => t.textContent.trim()),
      // an absence statement and the stated crest path are context, not parts
      absent: d.classList.contains('loadout-absent') || d.classList.contains('loadout-context')
    })) : [];
    return {
      parts, labels: parts.map(p => p.label),
      // a div that states an ABSENCE is not a part, and carries no category by design
      without_category: parts.filter(p => !p.tags.length && !p.absent).length,
      engine: {augment: a.plan.augment, eternal: a.plan.eternal, blessings: a.plan.blessings,
               crest: a.plan.crest, upgrades: a.summary && a.summary.crest ? (a.summary.crest.upgrades || []).map(u => u.name) : null},
      evolution_text: /evolution|evolve|upgrade/i.test(strip ? strip.innerText : '')
    };
  });
  await context.close();
  const want = ['Augment', 'Eternal', 'Blessing 1', 'Blessing 2', 'Crest'];
  const missing = want.filter(w => !seen.labels.includes(w));
  // the crest's evolutions are named when the source has them, and their absence is stated
  // when it does not; silently omitting them is the failure either way
  const evolutionHandled = seen.engine.upgrades && seen.engine.upgrades.length
    ? seen.parts.some(p => /evolv|final upgrade|crest path/i.test(p.label || ''))
    : seen.parts.some(p => p.absent && /evolution|crest path/i.test(p.label || ''));
  verdict('Y1', missing.length > 0 || seen.without_category > 0 || !evolutionHandled,
    {...seen, missing, evolutionHandled});
};

probes.Y2 = async browser => {
  /* A pairing is the engine's own record. Two of its fields have never reached the screen:
     beats_both, and the Wilson interval. The interval belongs to the OBSERVED pair win rate
     and is not an interval for the calculated lift, and beats_both is a comparison of point
     estimates, not proven synergy. Both must say so where they are shown. */
  const {context, page} = await session(browser, desktop);
  await openSteel(page, 'pairings');
  const seen = await page.evaluate(() => {
    const got = E.partners('steel', {heroRole: 'jungle', min: 1});
    const rows = (got && got.observed) || [];
    const withPair = rows.filter(r => r.pair).slice(0, 3)
      .map(r => ({slug: r.slug, wr: r.pair.wr, played: r.pair.played, lift: r.pair.lift,
                  beats_both: r.pair.beats_both, interval95: r.pair.interval95}));
    const text = document.querySelector('#main').innerText.replace(/\s+/g, ' ');
    const first = withPair[0];
    return {
      pairs: withPair.length, first,
      shows_interval: !!first && text.includes(first.interval95[0].toFixed(2)),
      shows_beats_both: /beats both|beat both/i.test(text),
      interval_tied_to_win_rate: /interval[^.]{0,90}(win rate|pair rate|pair win)|(win rate|pair)[^.]{0,90}interval/i.test(text),
      interval_not_called_the_lift: !/interval (for|on|of) (the )?(lift|gap)/i.test(text),
      says_point_estimate: /point estimate|not proven synergy|does not establish/i.test(text),
      excerpt: text.slice(0, 200)
    };
  });
  await context.close();
  verdict('Y2', !seen.pairs || !seen.shows_interval || !seen.shows_beats_both
    || !seen.interval_tied_to_win_rate || !seen.interval_not_called_the_lift || !seen.says_point_estimate, seen);
};

probes.Y5 = async browser => {
  /* GUARD: the hero deep link keeps working for every section name, and an unknown one
     degrades to a valid screen. Stage 3c will turn these tabs into sections; the LINKS
     must survive that change, so they are pinned now. */
  const seen = {};
  for (const tab of ['builds', 'pairings', 'counters', 'kit', 'nonsense']) {
    const {context, page} = await session(browser, desktop);
    await page.evaluate(t => {
      S.role = 'jungle'; openHero('steel', 'jungle');
      S.heroTab = ['builds', 'pairings', 'counters', 'kit'].includes(t) ? t : S.heroTab;
      render();
    }, tab);
    await page.waitForTimeout(150);
    seen[tab] = await page.evaluate(() => ({
      hero: S.hero, role: S.heroRole, tab: S.heroTab,
      h1: document.querySelector('#main h1') ? document.querySelector('#main h1').textContent.trim().slice(0, 30) : null,
      // a jump row marks the section being read with aria-current; aria-selected belonged to the tablist
      selected: [...document.querySelectorAll('[data-hero-tab]')].filter(b => (b.getAttribute('aria-current') || b.getAttribute('aria-selected')) === 'true').map(b => b.dataset.heroTab)
    }));
    await context.close();
  }
  const ok = ['builds', 'pairings', 'counters', 'kit'].every(t => seen[t].tab === t && seen[t].hero === 'steel' && seen[t].selected.length === 1);
  verdict('Y5', !ok || !seen.nonsense.h1, seen);
};


/* ---------------------------------------------------------------------------
   Z-series: stage 3b corrections. Four defects found in review, each reproduced
   with the helper code rather than with whatever the fixture happens to contain.
   --------------------------------------------------------------------------- */

probes.Z1 = async browser => {
  /* The interval explanation tested only the lower bound, so an interval entirely BELOW the
     baseline still read "It includes A's 55%". Below, overlapping, above and unavailable are
     four different readings, and none of them is an interval for the calculated gap. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const base = {a: 'steel', b: 'mourn', base_a: 55, base_b: 48, played: 400, beats_both: false};
    const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      below: strip(pairCertaintyHTML({...base, wr: 42, interval95: [40, 45]})),
      overlapping: strip(pairCertaintyHTML({...base, wr: 54, interval95: [50, 60]})),
      above: strip(pairCertaintyHTML({...base, wr: 62, interval95: [58, 66]})),
      unavailable: strip(pairCertaintyHTML({...base, wr: 54, interval95: null})),
      touching_low: strip(pairCertaintyHTML({...base, wr: 50, interval95: [45, 55]})),
      touching_high: strip(pairCertaintyHTML({...base, wr: 60, interval95: [55, 65]}))
    };
  });
  await context.close();
  const bad = !/entirely below/i.test(seen.below) || /includes/i.test(seen.below)
    || !/includes/i.test(seen.overlapping) || /entirely/i.test(seen.overlapping)
    || !/entirely above/i.test(seen.above) || /includes/i.test(seen.above)
    || !/no interval is available/i.test(seen.unavailable)
    // a bound that touches the baseline is an overlap, not a clean separation
    || !/includes/i.test(seen.touching_low) || !/includes/i.test(seen.touching_high)
    // and every reading keeps the two kinds of uncertainty apart
    || !['below', 'overlapping', 'above', 'unavailable'].every(k => /describes the observed pair win rate/i.test(seen[k]) && /not an interval for the calculated gap/i.test(seen[k]));
  verdict('Z1', bad, seen);
};

probes.Z2 = async browser => {
  /* plannedBuildHTML is drawn by Builds and by Live, and read S.hero. Two cards for two
     different heroes, rendered while S.hero points at a third, must each show their own
     evidence - or none, but never each other's. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => { try {
    const pick = (slug, role) => {
      const plan = E.plannedBuild(slug, role, {});
      const stats = B?.heroes?.[slug]?.roles?.[role];
      return {slug, role, plan, stats, ev: loadoutEvidence(plan, stats, stats?.fetched_at)};
    };
    S.hero = 'steel'; S.heroRole = 'jungle';            // deliberately a third hero
    const a = pick('countess', 'midlane'), b = pick('murdock', 'carry');
    const varIndex = x => x.ev.variant ? x.ev.variant.index : null;
    const evidenceOf = x => x.ev.variant ? {perk: x.ev.variant.build.perk, eternal: x.ev.variant.build.eternal} : null;
    return {
      pointed_at: {hero: S.hero, role: S.heroRole},
      a: {slug: a.slug, augment: a.plan.augment, eternal: a.plan.eternal, variant: varIndex(a), evidence: evidenceOf(a)},
      b: {slug: b.slug, augment: b.plan.augment, eternal: b.plan.eternal, variant: varIndex(b), evidence: evidenceOf(b)},
      // the helper must never be able to reach S
      reads_state: /\bS\s*\.\s*(hero|heroRole)\b/.test(String(loadoutEvidence)) || /\bS\s*\.\s*(hero|heroRole)\b/.test(String(matchingVariant))
    };
  } catch (error) { return {unsupported: String(error.message || error).slice(0, 90)}; }
  });
  await context.close();
  const wrong = x => x.evidence && (nkCmp(x.evidence.perk, x.augment) === false || nkCmp(x.evidence.eternal, x.eternal) === false);
  function nkCmp(l, r) { const n = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); return n(l) === n(r); }
  verdict('Z2', !!seen.unsupported || seen.reads_state || wrong(seen.a) || wrong(seen.b), seen);
};

probes.Z3 = async browser => {
  /* The cache was keyed on hero, role and bracket, so a refreshed publication for the same
     hero was served the old evidence without the engine being called again. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => { try {
    const role = 'midlane', slug = 'countess';
    const readOnce = () => {
      const plan = E.plannedBuild(slug, role, {});
      const stats = B?.heroes?.[slug]?.roles?.[role];
      const ev = loadoutEvidence(plan, stats, stats?.fetched_at);
      return {variant: ev.variant ? ev.variant.index : null,
              augmentWr: ev.parts.Augment ? ev.parts.Augment.wr : null,
              fetched: ev.fetched_at};
    };
    const before = readOnce();
    // a refreshed publication for the SAME hero, role and bracket
    const saved = B;
    let after;
    try {
      const next = JSON.parse(JSON.stringify(B));
      const st = next.heroes[slug].roles[role];
      (st.builds || []).forEach(v => { v.winRate = (v.winRate || 0) + 7; });
      st.fetched_at = new Date(Date.parse(st.fetched_at || Date.now()) + 3600000).toISOString();
      B = next; E = MetaEngine.create(B);
      after = readOnce();
    } finally { B = saved; E = MetaEngine.create(B); }
    return {before, after, holds_module_state: /loadoutCache|var\s+\w*[Cc]ache/.test(String(loadoutEvidence))};
  } catch (error) { return {unsupported: String(error.message || error).slice(0, 90)}; }
  });
  await context.close();
  const changed = !seen.unsupported && seen.before.augmentWr != null && seen.after.augmentWr != null
    && Math.abs(seen.after.augmentWr - seen.before.augmentWr - 7) < 0.001;
  verdict('Z3', !!seen.unsupported || seen.holds_module_state || !changed || seen.before.fetched === seen.after.fetched, seen);
};

probes.Z4 = async browser => {
  /* currentItemPool holds ITEM observations, so an augment, an Eternal and a blessing looked
     up there report "no observation" even where the source variant holds one. And
     buildSummary picks its own variant, whose crest need not be the recommended crest:
     Countess's plan blessings are Tithe of Death and Mind Rot while the summary reports Lich
     and Millennia, and Murdock's recommended Liberator is an UPGRADE of Marksman Crest. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => { try {
    const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const look = (slug, role) => {
      const plan = E.plannedBuild(slug, role, {});
      const stats = B?.heroes?.[slug]?.roles?.[role];
      const ev = loadoutEvidence(plan, stats, stats?.fetched_at);
      const summary = (() => { try { return E.buildSummary(slug, role); } catch (e) { return null; } })();
      return {
        slug, plan: {augment: plan.augment, eternal: plan.eternal, blessings: plan.blessings, crest: plan.crest},
        variant: ev.variant ? {index: ev.variant.index, perk: ev.variant.build.perk, eternal: ev.variant.build.eternal} : null,
        parts: Object.keys(ev.parts),
        blessing1: strip(loadoutSampleHTML(ev, 'Blessing 1')),
        crestHTML: strip(crestEvolutionHTML(ev, plan.crest)),
        summaryBlessings: summary && summary.blessings ? summary.blessings.map(x => x && x.name) : null,
        summaryCrest: summary && summary.crest ? summary.crest.name : null,
        matchedCrest: ev.crest ? (ev.crest.family ? (ev.crest.family.display_name || ev.crest.family.name) : (ev.crest.display_name || ev.crest.name)) : null
      };
    };
    return {countess: look('countess', 'midlane'), murdock: look('murdock', 'carry'), steel: look('steel', 'jungle')};
  } catch (error) { return {unsupported: String(error.message || error).slice(0, 90)}; }
  });
  await context.close();
  const c = seen.countess || {}, m = seen.murdock || {}, s = seen.steel || {};
  const bad =
    // a blessing the source variant holds must not be reported as missing
    (c.variant && c.plan.blessings && c.plan.blessings[0] && !/win rate/i.test(c.blessing1))
    // and must never be answered with a different blessing's sample
    || (c.summaryBlessings && c.plan.blessings && c.summaryBlessings[0]
        && c.summaryBlessings[0] !== c.plan.blessings[0] && !/this blessing/i.test(c.blessing1) && /win rate/i.test(c.blessing1) === false)
    // the recommended crest may be an UPGRADE of the source base crest; that still matches
    || (m.variant && !m.matchedCrest)
    // a hero with no source variant says so rather than showing another variant's rows
    || (!s.variant && !/no source variant matches/i.test(s.crestHTML))
    // an unmatched crest is named as a different crest, not silently shown
    || (c.variant && !c.matchedCrest && !/different crest/i.test(c.crestHTML));
  verdict('Z4', !!seen.unsupported || bad, seen);
};


probes.Z5 = async browser => {
  /* Finding a crest's FAMILY is not finding its SAMPLE. With a recommended Liberator, the
     parent's 50% over 1,000 games was shown as "this crest", and the evolution list repeated
     Liberator and its sibling under "Crest evolves" as if the final upgrade evolved again.
     The parent and upgrade rates below are deliberately different so borrowing is visible. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => { try {
    const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const family = {display_name: 'Marksman Crest', winRate: 50, playedGames: 1000, midCrest: 'Sharpshooter Crest',
      upgrades: [{display_name: 'Liberator', winRate: 60, playedGames: 100},
                 {display_name: 'Pacifier', winRate: 55, playedGames: 200},
                 {display_name: 'Bare Upgrade', winRate: null, playedGames: null}]};
    const build = {perk: 'Fixture Perk', eternal: 'Fixture Eternal', winRate: 48, playedGames: 5000,
      common_perks_1: [], common_perks_2: [], best_base_crests: [family]};
    const stats = {builds: [build], fetched_at: '2026-09-15T09:00:00Z'};
    const run = crest => {
      const plan = {augment: 'Fixture Perk', eternal: 'Fixture Eternal', blessings: [], crest};
      const ev = loadoutEvidence(plan, stats, stats.fetched_at);
      return {sample: strip(loadoutSampleHTML(ev, 'Crest')), path: strip(crestEvolutionHTML(ev, crest)),
              evolvesLabels: (crestEvolutionHTML(ev, crest).match(/<small>(Evolves into|Crest evolves)<\/small>[\s\S]*?(?=<\/div>)/g) || []).map(strip)};
    };
    return {upgrade: run('Liberator'), mid: run('Sharpshooter Crest'), base: run('Marksman Crest'), bare: run('Bare Upgrade')};
  } catch (error) { return {unsupported: String(error.message || error).slice(0, 90)}; } });
  await context.close();
  if (seen.unsupported) { verdict('Z5', true, seen); return; }
  const u = seen.upgrade, m = seen.mid, b = seen.base, x = seen.bare;
  const problems = [];
  // a recommended upgrade shows ITS OWN sample, never the parent's
  if (!/60\.0%/.test(u.sample) || !/100 games/.test(u.sample)) problems.push('upgrade does not show its own 60% over 100');
  if (/50\.0%/.test(u.sample) || /1,000/.test(u.sample)) problems.push("upgrade shows the parent's 50% over 1,000");
  // a mid form with no row says so and borrows nothing
  if (/50\.0%|1,000/.test(m.sample)) problems.push("mid form borrows the parent's sample");
  if (!/no separate sample/i.test(m.sample)) problems.push('mid form does not say it has no sample');
  // a base recommendation is its own figure
  if (!/50\.0%/.test(b.sample) || !/1,000/.test(b.sample)) problems.push('base crest does not show its own sample');
  // an upgrade whose row has no figures says so rather than borrowing
  if (/50\.0%|1,000/.test(x.sample) || !/no sample of its own/i.test(x.sample)) problems.push('an upgrade with no figures borrows or says nothing');
  // the path is explicit, and a FINAL upgrade does not evolve again
  if (!/Marksman Crest/.test(u.path) || !/Sharpshooter Crest/.test(u.path) || !/Liberator \(recommended, final\)/.test(u.path)) problems.push('path not stated for an upgrade');
  if (u.evolvesLabels.length) problems.push('a final upgrade is shown as evolving again');
  if (!/Pacifier/.test(u.path) || !/alternative to Liberator, not a further step/i.test(u.path)) problems.push('sibling not presented as an alternative');
  // a base recommendation does evolve, into the final upgrades, each with its own figure
  if (!b.evolvesLabels.some(t => /Liberator/.test(t) && /60\.0%/.test(t))) problems.push('base does not list Liberator with its own rate as a next step');
  verdict('Z5', problems.length > 0, {problems, ...seen});
};


/* ---------------------------------------------------------------------------
   S-series: 2.29 redesign, stage 3c (the hero screen as sections).

   The four tabs that hid each other become four sections on one page, reached by a
   jump row. Nothing is removed: the long tail of partners moves into a disclosure,
   and the evidence tables become searchable.
   --------------------------------------------------------------------------- */

const HERO_SECTIONS = ['builds', 'pairings', 'counters', 'kit'];
const sectionState = () => {
  const boundary = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const bottomed = Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2;
  const btns = [...document.querySelectorAll('#main [data-hero-tab]')];
  return {boundary: Math.round(boundary), bottomed,
    current: btns.filter(b => b.getAttribute('aria-current') === 'true').map(b => b.dataset.heroTab),
    tops: Object.fromEntries([...document.querySelectorAll('#main section.hero-section')].map(s => [s.dataset.heroSection, Math.round(s.getBoundingClientRect().top)]))};
};
const frames = n => new Promise(r => { const f = k => k ? requestAnimationFrame(() => f(k - 1)) : r(); f(n); });

probes.S1 = async browser => {
  /* All four sections are on the page at once, in order, none hidden, and each carries
     its OWN source line - section-scoped freshness must survive the merge. */
  const seen = {};
  for (const [label, opts] of [['desktop', desktop], ['phone', phone]]) {
    const {context, page} = await session(browser, opts);
    seen[label] = await page.evaluate(() => {
      S.role = 'jungle'; openHero('steel', 'jungle'); render();
      return {
        sections: [...document.querySelectorAll('#main section.hero-section')].map(s => ({
          id: s.id, t: s.dataset.heroSection,
          hidden: s.hidden || getComputedStyle(s).display === 'none',
          source: !!s.querySelector('.source-line')
        })),
        h1: document.querySelectorAll('#main h1').length
      };
    });
    await context.close();
  }
  const bad = Object.values(seen).some(v => v.h1 !== 1
    || JSON.stringify(v.sections.map(s => s.t)) !== JSON.stringify(HERO_SECTIONS)
    || v.sections.some(s => s.hidden || !s.source || s.id !== 'hero-sec-' + s.t));
  verdict('S1', bad, seen);
};

probes.S2 = async browser => {
  /* The jump row is navigation, not a tablist - tabs claim panels that hide, and nothing
     hides now. Exactly one control is current. A click brings its section to the top,
     clear of the sticky chrome, and focus stays on the control that was pressed. */
  const seen = {};
  for (const [label, opts] of [['desktop', desktop], ['phone', phone]]) {
    const {context, page} = await session(browser, opts);
    await page.evaluate(() => { S.role = 'midlane'; openHero('countess', 'midlane'); render(); });
    const row = await page.evaluate(() => ({
      tablist: !!document.querySelector('#main [role="tablist"] [data-hero-tab], #main [data-hero-tab][role="tab"]'),
      nav: !!document.querySelector('#main nav [data-hero-tab]'),
      small: [...document.querySelectorAll('#main [data-hero-tab]')].filter(b => b.getBoundingClientRect().height < 43.5).length
    }));
    const clicks = {};
    for (const t of HERO_SECTIONS) {
      await page.locator('#main [data-hero-tab="' + t + '"]').click();
      await page.waitForTimeout(450);
      clicks[t] = await page.evaluate(([tab, src]) => ({
        ...(new Function('return (' + src + ')'))()(),
        focused: document.activeElement?.dataset?.heroTab || null, tab: S.heroTab
      }), [t, sectionState.toString()]);
    }
    seen[label] = {row, clicks};
    await context.close();
  }
  const landed = c => (x => x.bottomed || (x.tops[x.tab] >= x.boundary - 6 && x.tops[x.tab] <= x.boundary + 48))(c);
  const bad = Object.values(seen).some(v => v.row.tablist || !v.row.nav || v.row.small > 0
    || HERO_SECTIONS.some(t => { const c = v.clicks[t]; return c.tab !== t || c.focused !== t || c.current.length !== 1 || c.current[0] !== t || !landed(c); }));
  verdict('S2', bad, seen);
};

probes.S3 = async browser => {
  /* A shared link names a section. It must open with that section at the top, marked
     current, for every name the live app has ever issued. */
  const seen = {};
  for (const t of HERO_SECTIONS) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(tab => {
      location.hash = '#hero=countess&role=midlane&bracket=' + S.bracket + '&tab=' + tab;
      linkApplied = ''; applyCompanionLink(); render();
    }, t);
    await page.waitForTimeout(500);
    seen[t] = await page.evaluate(([tab, src]) => ({
      ...(new Function('return (' + src + ')'))()(), tab: S.heroTab, hero: S.hero
    }), [t, sectionState.toString()]);
    await context.close();
  }
  const bad = HERO_SECTIONS.some(t => { const c = seen[t];
    return c.hero !== 'countess' || c.tab !== t || c.current.length !== 1 || c.current[0] !== t
      || !(c.bottomed || (c.tops[t] >= c.boundary - 6 && c.tops[t] <= c.boundary + 48)); });
  verdict('S3', bad, seen);
};

probes.S4 = async browser => {
  /* Joining four tabs must not make the page longer than the worst tab was: Partners alone
     ran to 23,000px on a phone. The leading partners stay in view; the rest move into a
     closed disclosure that says how many it holds, and not one card is lost. */
  const seen = {};
  for (const [label, opts] of [['desktop', desktop], ['phone', phone]]) {
    const {context, page} = await session(browser, opts);
    seen[label] = await page.evaluate(async () => {
      const out = {};
      for (const [slug, role] of [['steel', 'jungle'], ['countess', 'midlane'], ['murdock', 'carry']]) {
        S.role = role; S.explore = false; S.pairMetric = 'kit'; openHero(slug, role); render();
        await new Promise(r => requestAnimationFrame(() => r()));
        const sec = document.querySelector('#hero-sec-pairings');
        const partners = E.partners(slug, {min: 100, role: '', heroRole: role, metric: 'kit'});
        const ordered = partners.combined || [];
        const all = sec ? sec.querySelectorAll('article.partner').length : 0;
        const outside = sec ? [...sec.querySelectorAll('article.partner')].filter(a => !a.closest('details')).length : 0;
        const tail = sec ? sec.querySelector('details.partner-tail') : null;
        out[slug] = {height: Math.round(document.documentElement.scrollHeight), ordered: ordered.length, all, outside,
          tail: tail ? {open: tail.open, summary: tail.querySelector('summary').textContent.trim(), inside: tail.querySelectorAll('article.partner').length} : null};
      }
      return out;
    });
    await context.close();
  }
  const budget = {desktop: 16000, phone: 23000};
  const bad = Object.entries(seen).some(([label, heroes]) => Object.values(heroes).some(h =>
    h.height > budget[label]
    || h.all < h.ordered                                               // a card went missing
    || h.outside > 5                                                   // the tail is not tucked away
    || (h.ordered > 5 && (!h.tail || h.tail.open || !h.tail.summary.includes(String(h.tail.inside)) || h.tail.inside < h.ordered - 5))));
  verdict('S4', bad, {budget, ...seen});
};

probes.S5 = async browser => {
  /* The evidence tables are complete AND searchable: a search narrows the rows, says how
     many of how many are shown, opens the disclosure a match sits in, and clearing it
     restores every row. Nothing is summarised away. A table the search leaves empty is set
     aside rather than left as a bare header row, and comes back when the search is cleared. */
  const {context, page} = await session(browser, desktop);
  await page.evaluate(() => { S.role = 'midlane'; openHero('countess', 'midlane'); render(); });
  // late evidence redraws the section; count rows only once it has settled
  await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 30000}).catch(() => {});
  await page.waitForTimeout(300);
  const seen = await page.evaluate(async () => {
    const out = {};
    const rowSel = 'table.table-small tbody tr, .choice';     // every evidence row the product counts
    for (const section of ['counters', 'builds']) {
      const root = document.getElementById('hero-sec-' + section);
      const box = root && root.querySelector('[data-evidence-search="' + section + '"]');
      const rows = root ? [...root.querySelectorAll(rowSel)] : [];
      if (!box || !rows.length) { out[section] = {box: !!box, rows: rows.length}; continue; }
      const probe = rows[rows.length - 1].textContent.trim().split(/\s+/)[0].slice(0, 5);
      box.focus(); box.value = probe; box.dispatchEvent(new Event('input', {bubbles: true}));
      await new Promise(r => setTimeout(r, 60));
      const r2 = document.getElementById('hero-sec-' + section);
      const all = [...r2.querySelectorAll(rowSel)];
      const visible = all.filter(r => r.getClientRects().length > 0);
      const count = (r2.querySelector('[data-evidence-count="' + section + '"]') || {}).textContent || '';
      const matchesOnly = visible.every(r => r.textContent.toLowerCase().includes(probe.toLowerCase()));
      const tables = () => [...document.getElementById('hero-sec-' + section).querySelectorAll('table.table-small')]
        .filter(t => t.querySelector('tbody tr'));
      const bare = tables().filter(t => t.offsetParent !== null && [...t.querySelectorAll('tbody tr')].every(r => r.hidden)).length;
      const box2 = r2.querySelector('[data-evidence-search="' + section + '"]');
      box2.value = ''; box2.dispatchEvent(new Event('input', {bubbles: true}));
      await new Promise(r => setTimeout(r, 60));
      const restored = [...document.getElementById('hero-sec-' + section).querySelectorAll(rowSel)].filter(r => !r.hidden).length;
      const tablesBack = tables().every(t => !t.hidden && t.offsetParent !== null);
      out[section] = {box: true, rows: all.length, probe, visible: visible.length, count, matchesOnly, restored, bare, tablesBack,
                      focusKept: document.activeElement === box2 || document.activeElement?.dataset?.evidenceSearch === section};
    }
    return out;
  });
  await context.close();
  const bad = ['counters', 'builds'].some(k => { const s = seen[k];
    return !s || !s.box || !s.rows || !s.matchesOnly || s.visible < 1 || !s.focusKept || s.bare > 0 || !s.tablesBack
      || !new RegExp('Showing ' + s.visible + ' of ' + s.rows).test(s.count) || s.restored !== s.rows; });
  verdict('S5', bad, seen);
};

probes.S6 = async browser => {
  /* GUARD: drawing four sections at once stays cheap. Every hero redraw now builds all of
     them, so a regression here is felt on every keystroke of every search. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const out = {};
    for (const [slug, role] of [['steel', 'jungle'], ['countess', 'midlane'], ['murdock', 'carry']]) {
      S.role = role; openHero(slug, role); render();
      const t0 = performance.now(); for (let i = 0; i < 5; i++) render();
      out[slug] = Math.round((performance.now() - t0) / 5 * 10) / 10;
    }
    return out;
  });
  await context.close();
  verdict('S6', Object.values(seen).some(ms => ms > 80), {budget_ms: 80, ...seen});
};

probes.S7 = async browser => {
  /* Retained or stale Pred.gg evidence is labelled wherever it appears. The Kit section read
     "Pred.gg - cached <date>" with no Saved label while Pred.gg was retained, because its
     source line was drawn without {statistics:true}. Pre-existing: V3 never opened Kit. */
  const SAVED = /Saved (January|February|March|April|May|June|July|August|September|October|November|December) \d/;
  const kitLines = page => page.evaluate(src => {
    const saved = new RegExp(src), root = document.querySelector('#hero-sec-kit') || document.querySelector('#main');
    const lines = [...root.querySelectorAll('.source-line')].filter(l => l.querySelector('a[href*="pred.gg"]'));
    return {n: lines.length, saved: lines.filter(l => saved.test(l.textContent)).length,
            retainedText: lines.filter(l => /retained from an earlier collection/.test(l.textContent)).length,
            sample: lines[0] ? lines[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : null};
  }, SAVED.source);
  const seen = {};
  {
    const {context, page} = await clockSession(browser, desktop);
    await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'kit'; render(); });
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
    seen.current = await kitLines(page);
    await page.evaluate(() => {
      for (const k of ['pred_scoped', 'pred_game_data']) if (B.sources[k]) B.sources[k] = {...B.sources[k], status: 'retained'};
      if (B.pred_game_data) B.pred_game_data.status = 'retained';
      E = MetaEngine.create(B); S.heroTab = 'kit'; render();
    });
    seen.retained = await kitLines(page);
    await context.close();
  }
  {
    const {context, page} = await clockSession(browser, desktop, 49 * 3600000);
    await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'kit'; render(); });
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
    seen.stale = await kitLines(page);
    await context.close();
  }
  const every = c => c.n > 0 && c.saved === c.n;
  verdict('S7', seen.current.saved > 0 || !every(seen.retained) || seen.retained.retainedText !== seen.retained.n || !every(seen.stale), seen);
};

/* Search must affect what the browser actually paints, not just an attribute the test
   also reads. These cases exercise real source rows and keep the engine untouched. */
probes.S8 = async browser => {
  const seen = [];
  for (const viewport of [desktop, phone]) {
    const {context, page} = await session(browser, viewport);
    await page.evaluate(() => { openHero('countess', 'midlane'); render(); });
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'));
    const detail = await page.evaluate(() => {
      const root = document.getElementById('hero-sec-builds');
      root.querySelectorAll('details').forEach(d => { d.open = true; });
      const box = root.querySelector('[data-evidence-search]');
      box.value = '__no_source_choice_matches__';
      box.dispatchEvent(new Event('input', {bubbles:true}));
      const choices = [...root.querySelectorAll('.choice')];
      return {choices:choices.length, painted:choices.filter(r => r.getClientRects().length > 0).length,
        focusable:choices.filter(r => getComputedStyle(r).display !== 'none').length};
    });
    seen.push(detail); await context.close();
  }
  verdict('S8', seen.some(x => !x.choices || x.painted || x.focusable), seen);
};
probes.S9 = async browser => {
  const {context, page} = await session(browser, phone);
  await page.evaluate(() => { openHero('countess','midlane'); render(); });
  await page.waitForFunction(() => !document.querySelector('#main .annex-loading'));
  const seen = await page.evaluate(() => {
    const root = document.getElementById('hero-sec-counters');
    const details = [...root.querySelectorAll('details')];
    details.forEach(d => { d.open = false; });
    const row = [...root.querySelectorAll('tbody tr')].find(r => r.closest('details'));
    if (!row) return {fixture:false};
    const box = root.querySelector('[data-evidence-search]');
    const type = value => { box.value = value; box.dispatchEvent(new Event('input',{bubbles:true})); };
    type(row.querySelector('td').textContent.trim());
    const opened = details.some(d => d.open);
    render(); // An evidence redraw during the search must not replace the saved state.
    const again = document.querySelector('#hero-sec-counters [data-evidence-search]');
    again.value = ''; again.dispatchEvent(new Event('input',{bubbles:true}));
    return {fixture:true, opened, leftOpen:[...document.querySelectorAll('#hero-sec-counters details')].filter(d => d.open).length,
      hiddenRows:document.querySelectorAll('#hero-sec-counters tr[hidden]').length};
  });
  await context.close();
  verdict('S9', !seen.fixture || !seen.opened || seen.leftOpen > 0 || seen.hiddenRows > 0, seen);
};
probes.S10 = async browser => {
  const {context, page} = await session(browser, desktop);
  await page.evaluate(() => { openHero('countess','midlane'); render(); });
  await page.waitForFunction(() => !document.querySelector('#main .annex-loading'));
  const seen = await page.evaluate(() => {
    const box = () => document.querySelector('#hero-sec-builds [data-evidence-search]');
    const type = () => { box().value = 'test query'; box().dispatchEvent(new Event('input',{bubbles:true})); };
    type(); render(); const survivesRedraw = box().value === 'test query';
    openHero('steel','offlane'); render(); const newHero = box().value;
    type(); S.heroRole = 'jungle'; render(); const newRole = box().value;
    return {survivesRedraw,newHero,newRole};
  });
  await context.close();
  verdict('S10', !seen.survivesRedraw || !!seen.newHero || !!seen.newRole, seen);
};

// Stage 2b: destinations are presentation; legacy screen identities and saved picks survive.
probes.N1 = async browser => {
  const seen=[];
  for(const viewport of [desktop,phone]){
    const {context,page}=await session(browser,viewport);
    for(const [route,destination] of [['meta','meta'],['builds','reference'],['match','match'],['library','reference'],['guidance','reference'],['changes','reference'],['data','sources'],['more','sources'],['hero','meta']]){
      await page.evaluate(route=>{if(route==='hero')openHero('steel','jungle');else changeRoute(route);},route);
      seen.push(await page.evaluate(({route,destination})=>{
        const nav=document.querySelector(innerWidth<=700?'#mobile-navigation':'#navigation');
        return {route,phone:innerWidth<=700,destination:innerWidth<=700?(route==='match'?'match':['meta','hero','builds'].includes(route)?'meta':'more'):destination,labels:[...nav.querySelectorAll('[data-destination]')].map(b=>b.textContent.trim()),current:[...document.querySelectorAll('[aria-current="page"]')].map(b=>b.dataset.destination),headings:document.querySelectorAll('#main h1').length,overflow:document.documentElement.scrollWidth>innerWidth+1};
      },{route,destination}));
    }
    await context.close();
  }
  verdict('N1',seen.some(s=>s.labels.join('|')!==(s.phone?'Meta|Match|More':'Meta|Match|Reference|Sources')||s.current.length!==1||s.current[0]!==s.destination||s.headings!==1||s.overflow),seen);
};
probes.N2 = async browser => {
  // Links saved before 2.36.0 (Compose, Draft, Live and their Plan stages) open Match.
  const {context,page}=await session(browser,phone),seen=[];
  for(const [hash,route] of [['view=meta','meta'],['view=builds','builds'],['view=match','match'],['view=planner','match'],['view=draft','match'],['view=live','match'],['view=library','library'],['view=guidance','guidance'],['view=changes','changes'],['view=data','data'],['view=plan&stage=draft&bracket=gold','match'],['view=reference&section=items&bracket=gold','library'],['view=sources&bracket=gold','data']]){
    await page.goto(url+'#'+hash);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
    seen.push({hash,wanted:route,actual:await page.evaluate(()=>S.route)});
  }
  await context.close();verdict('N2',seen.some(s=>s.actual!==s.wanted),seen);
};
probes.N3 = async browser => {
  const {context,page}=await session(browser,phone);
  await page.evaluate(()=>{S.role='midlane';save();changeRoute('meta');});
  await page.evaluate(()=>scrollTo(0,350));await page.waitForTimeout(120);
  const before=await page.evaluate(()=>({y:scrollY,role:S.role,picks:JSON.stringify([S.locks,S.enemies,S.bans])}));
  await page.evaluate(()=>openHero('countess','midlane'));await page.waitForTimeout(200);
  await page.goBack();await page.waitForTimeout(350);
  const back=await page.evaluate(()=>({route:S.route,y:scrollY,role:S.role,picks:JSON.stringify([S.locks,S.enemies,S.bans])}));
  await page.goForward();await page.waitForTimeout(350);
  const forward=await page.evaluate(()=>({route:S.route,hero:S.hero,role:S.heroRole}));
  await context.close();verdict('N3',back.route!=='meta'||back.role!==before.role||Math.abs(back.y-before.y)>3||back.picks!==before.picks||forward.route!=='hero'||forward.hero!=='countess',{before,back,forward});
};
probes.N4 = async browser => {
  // Match keeps your hero and the enemy team across Back, Forward and reload.
  const {context,page}=await session(browser,phone);
  await reset(page);await page.evaluate(()=>{S.me='steel';S.locks=[{slug:'steel',role:'jungle'}];S.enemies=[{slug:'gideon',role:'midlane'}];S.bans=[];save();changeRoute('match');});
  const picks=await page.evaluate(()=>JSON.stringify([S.me,S.locks,S.enemies]));
  await page.locator('#mobile-navigation [data-destination="meta"]').click();
  await page.goBack();await page.waitForTimeout(250);const back=await page.evaluate(()=>S.route);
  await page.goForward();await page.waitForTimeout(250);const forward=await page.evaluate(()=>S.route);
  await page.goBack();await page.waitForTimeout(250);
  await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);
  const after=await page.evaluate(()=>({route:S.route,picks:JSON.stringify([S.me,S.locks,S.enemies]),enemies:document.querySelectorAll('.match-chip').length}));
  await context.close();verdict('N4',back!=='match'||forward!=='meta'||after.route!=='match'||after.picks!==picks||after.enemies!==1,{back,forward,after});
};
probes.N6 = async browser => {
  const {context,page}=await session(browser,desktop);
  const seen=await page.evaluate(()=>{
    const priorLocal=local,priorRequest=requestLinkedBracket,priorBand=S.bracket;
    let requested=null;
    try{
      local=true;S.bracket='bronze';linkApplied='';
      history.replaceState(null,'','#view=plan&stage=draft&bracket=gold');
      requestLinkedBracket=band=>{requested=band;};
      applyCompanionLink();
      return {loaded:B.bracket.segment,selected:S.bracket,route:S.route,requested};
    }finally{local=priorLocal;requestLinkedBracket=priorRequest;S.bracket=priorBand;}
  });
  await context.close();verdict('N6',seen.loaded!=='gold'||seen.selected!=='gold'||seen.route!=='match'||seen.requested!==null,seen);
};
probes.N5 = async browser => {
  const seen=[];
  for(const [hash,route,role] of [['view=meta&role=support&bracket=gold','meta','support'],['view=plan&stage=live&bracket=gold','match'],['view=reference&section=playbook&bracket=gold','builds'],['view=reference&section=guidance&bracket=gold','guidance'],['view=reference&section=changes&bracket=gold','changes'],['view=sources&bracket=gold','data']]){
    const context=await browser.newContext({serviceWorkers:'block',...phone}),page=await context.newPage();
    await page.goto(url+'#'+hash);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
    seen.push({hash,route,role,actual:await page.evaluate(()=>({route:S.route,role:S.role,band:B.bracket.segment}))});await context.close();
  }
  verdict('N5',seen.some(s=>s.actual.route!==s.route||(s.role&&s.actual.role!==s.role)||s.actual.band!=='gold'),seen);
};

probes.RS1 = async browser => {
 const {context,page}=await session(browser,phone);
 const seen=await page.evaluate(()=>{
  B={...B,sources:{...B.sources,test_unknown:{status:'retained',fetched_at:'2026-09-01T00:00:00Z'}}};changeRoute('data');
  const rows=[...document.querySelectorAll('.source-table tbody tr')];return {rows:rows.length,scoped:rows.filter(r=>r.querySelector('.source-scope')?.textContent.trim()).length,unknown:rows.find(r=>r.textContent.includes('test unknown'))?.textContent,unknownLink:!!rows.find(r=>r.textContent.includes('test unknown'))?.querySelector('a'),text:document.querySelector('.source-table').textContent};
 });
 await context.close();verdict('RS1',seen.rows!==seen.scoped||seen.unknownLink||!/Scope unavailable/.test(seen.unknown)||!/Broader dataset/.test(seen.text)||!/hero-wide/.test(seen.text),seen);
};
probes.RS2 = async browser => {
 const {context,page}=await session(browser,phone);await page.evaluate(()=>changeRoute('data'));
 const before=await page.evaluate(()=>({jump:document.querySelectorAll('[data-reference-jump]').length,fold:!!document.querySelector('#source-audits:not([open])'),comparison:!!document.querySelector('#compare-bracket'),auditText:document.querySelector('#source-audits')?.textContent}));
 let opened=false;if(before.jump){await page.locator('[data-reference-jump="source-audits"]').click();opened=await page.locator('#source-audits').evaluate(d=>d.open);}
 await context.close();verdict('RS2',before.jump<3||!before.fold||!before.comparison||!before.auditText||!opened,{...before,auditText:before.auditText?.slice(0,100),opened});
};
probes.RS3 = async browser => {
 const {context,page}=await session(browser,phone);await page.evaluate(()=>{S.libraryKind='items';S.libraryQuery='';changeRoute('library');});
 const before=await page.evaluate(()=>({rows:document.querySelectorAll('.library-grid>article').length,total:Object.keys(B.pred_game_data.items).length,last:Object.values(B.pred_game_data.items).sort((a,b)=>a.name.localeCompare(b.name)).at(-1).name}));
 let more=0;if(await page.locator('#library-more').count()){await page.locator('#library-more').click();more=await page.locator('.library-grid>article').count();}
 await page.locator('#library-query').fill(before.last);
 const found=await page.locator('.library-grid').innerText();
 await page.locator('#library-query').fill('no-such-reference-xyz');const empty=await page.locator('#main').innerText();
 await context.close();verdict('RS3',before.rows>40||more<=before.rows||!found.includes(before.last)||!/No entries match/.test(empty),{before,more,found,empty:empty.slice(-120)});
};
probes.RS4 = async browser => {
 const {context,page}=await session(browser,phone);await page.evaluate(()=>changeRoute('data'));
 const seen=await page.evaluate(()=>({headingTop:document.querySelector('#main h1').getBoundingClientRect().top,height:innerHeight,method:!!document.querySelector('#source-update-method'),scope:!!document.querySelector('.rank-evidence'),failures:document.querySelector('#material-notices').textContent}));
 await context.close();verdict('RS4',seen.headingTop>seen.height/2||!seen.method||!seen.scope,seen);
};

probes.ML1 = async browser => {
 const {context,page}=await session(browser,phone),seen=[];
 for(const role of ['jungle','offlane','midlane','carry','support']){
  await page.evaluate(role=>{S.role=role;companionPrefs.homeQuery='';changeRoute('meta');},role);
  seen.push(await page.evaluate(()=>({role:S.role,wanted:Object.keys(E.heroes).filter(s=>E.roles(s).includes(S.role)).sort(),shown:[...document.querySelectorAll('#mobile-all-list [data-hero]')].map(b=>b.dataset.hero).sort(),order:!!document.querySelector('#mobile-meta-order')})));
 }
 await context.close();verdict('ML1',seen.some(s=>!s.order||JSON.stringify(s.shown)!==JSON.stringify(s.wanted)),seen);
};
/* LB1/LB2 reproduce the published 1.17 state on the seed: Pred.gg's catalogue collection failed with empty maps
   (the bundle keeps its item and perk definitions), and no role-statistics source is eligible. */
probes.LB1 = async browser => {
 const {context,page}=await session(browser,desktop);
 const seen=await page.evaluate(()=>{
  Object.assign(B.pred_game_data,{status:'failed',items:{},perks:{},errors:[{source:'Pred.gg game data',severity:'error',detail:'Pred.gg catalog hero join failed'}]});E=MetaEngine.create(B);
  const read=kind=>{S.libraryKind=kind;S.libraryQuery='';S.libraryLimit=40;changeRoute('library');const main=document.querySelector('#main').textContent;
   return {rows:document.querySelectorAll('.library-grid>article').length,count:document.querySelector('#library-count')?.textContent,total:Object.keys(B[kind]).length,noMatch:/No entries match/.test(main),named:/Pred\.gg catalogue unavailable/.test(main)&&/catalog hero join failed/.test(main),kicker:document.querySelector('#main .eyebrow')?.textContent};};
  return {items:read('items'),perks:read('perks')};
 });
 await page.locator('#library-query').fill('no-such-reference-xyz');const empty=await page.locator('#main').innerText();
 await context.close();
 const bad=x=>x.rows<1||x.rows>40||x.count!=='Showing '+Math.min(40,x.total)+' of '+x.total+' entries'||x.noMatch||!x.named||/^Reference · Pred\.gg \+/.test(x.kicker||'');
 verdict('LB1',bad(seen.items)||bad(seen.perks)||!/No entries match/.test(empty),{...seen,search:empty.slice(-80)});
};
probes.LB3 = async browser => {
 // 2.37.0: Export snapshot is a desktop tool (the sidebar); the phone More no longer offers it.
 const {context,page}=await session(browser,desktop);await page.evaluate(()=>changeRoute('more'));
 const ids=await page.evaluate(()=>document.querySelectorAll('[id="export"]').length);
 let downloaded=false;try{const [d]=await Promise.all([page.waitForEvent('download',{timeout:120000}),page.locator('#export').click()]);downloaded=!!d.suggestedFilename();}catch{}
 await context.close();verdict('LB3',ids>1||!downloaded,{ids,downloaded});
};
probes.LB4 = async browser => {
 // An iPhone 13 screen in Safari (390x664): Items & loadouts must show its whole first entry on the first screen with the live
 // 1.17 state (Pred.gg catalogue empty, fallback note shown), without sideways scrolling.
 const {context,page}=await session(browser,{viewport:{width:390,height:664},isMobile:true,hasTouch:true});
 const seen=await page.evaluate(()=>{
  // As published for 1.17: Pred.gg's catalogue and its rank-scoped statistics both failed, which also adds the
  // "authored tier review covers ..." sentence to the rank note above the page.
  Object.assign(B.pred_game_data,{status:'failed',items:{},perks:{},errors:[{source:'Pred.gg game data',severity:'error',detail:'Pred.gg catalog hero join failed'}]});
  Object.assign(B.scoped_statistics,{status:'failed',bracket:null,bracket_label:null,patch:null});B.sources.pred_scoped.status='failed';E=MetaEngine.create(B);
  S.libraryKind='items';S.libraryQuery='';S.libraryLimit=40;changeRoute('library');window.scrollTo(0,0);
  const r=s=>document.querySelector(s)?.getBoundingClientRect(),nav=document.querySelector('#mobile-navigation')?.getBoundingClientRect();
  return {kindTop:Math.round(r('#library-kind').top),queryTop:Math.round(r('#library-query').top),firstRowTop:Math.round(r('.library-grid>article').top),firstRowBottom:Math.round(r('.library-grid>article').bottom),screenBottom:Math.round(nav?.top??innerHeight),overflow:document.documentElement.scrollWidth>391,referenceSentence:/authored tier review covers/.test(document.querySelector('#main .rank-evidence')?.textContent||'')};
 });
 await context.close();
 // The narrowest supported phone with large text: the Show select must not push the page sideways. Widths are fixed
 // numbers because mobile emulation widens innerWidth to fit overflowing content.
 const narrow=await session(browser,{viewport:{width:320,height:640},isMobile:true,hasTouch:true});
 seen.narrowOverflow=await narrow.page.evaluate(()=>{companionPrefs.large=true;document.documentElement.classList.add('large-text');S.libraryKind='perks';changeRoute('library');return document.documentElement.scrollWidth>321;});
 await narrow.context.close();verdict('LB4',Math.abs(seen.kindTop-seen.queryTop)>8||seen.firstRowBottom>seen.screenBottom||seen.overflow||seen.narrowOverflow,seen);
};
/* 2.37.0 phone declutter: the default (quick) phone view, not "Full details". Each probe
   switches the page to the quick view first; the runner opens every context in Full details. */
async function quickPhone(browser, viewport = {width: 390, height: 844}) {
  const s = await session(browser, {...phone, viewport});
  await s.page.evaluate(() => { companionPrefs.fullDetails = false; saveCompanionPrefs(); S.role = 'jungle'; changeRoute('meta'); });
  return s;
}
const pageTop = sel => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
probes.PD1 = async browser => {
  const {context, page} = await quickPhone(browser);
  const first = await page.evaluate(pageTop, '#main .mobile-hero-card');
  await context.close(); verdict('PD1', first === null || first > 280, {first_hero_row_y: first});
};
probes.PD2 = async browser => {
  const {context, page} = await quickPhone(browser), seen = {};
  for (const r of ['meta', 'hero', 'match', 'more']) {
    await page.evaluate(r => r === 'hero' ? openHero('gideon', 'midlane') : changeRoute(r), r);
    seen[r] = await page.evaluate(() => ({main: Math.round(document.querySelector('#main').getBoundingClientRect().top + scrollY), topMore: !!document.querySelector('#menu-toggle')?.offsetParent}));
  }
  await context.close(); verdict('PD2', Object.values(seen).some(s => s.main > 72 || s.topMore), seen);
};
probes.PD3 = async browser => {
  const {context, page} = await quickPhone(browser);
  const seen = await page.evaluate(() => {
    openHero('gideon', 'midlane');
    const plan = chosenPlan({slug: 'gideon', role: 'midlane'}), main = document.querySelector('#main');
    const counts = plan.items.map(n => [...main.querySelectorAll('.item-button')].filter(b => (b.querySelector('.item-name')?.textContent || b.getAttribute('aria-label') || b.textContent).trim().startsWith(n)).length);
    return {height: document.documentElement.scrollHeight, items: plan.items, counts};
  });
  await context.close(); verdict('PD3', seen.height > 2000 || seen.counts.some(c => c !== 1), seen);
};
probes.PD4 = async browser => {
  const {context, page} = await quickPhone(browser);
  const y = await page.evaluate(() => { S.me = 'gideon'; S.locks = [{slug: 'gideon', role: 'midlane'}]; S.enemies = []; S.bans = []; S.matchPicking = 'enemy'; save(); changeRoute('match');
    const e = document.querySelector('.match-pick .match-hero'); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; });
  await context.close(); verdict('PD4', y === null || y > 700, {first_enemy_button_y: y});
};
probes.PD5 = async browser => {
  const {context, page} = await quickPhone(browser);
  const seen = await page.evaluate(() => { changeRoute('more');
    const labels = [...document.querySelectorAll('#main button, #main a')].filter(b => b.offsetParent).map(b => b.textContent.replace(/\s+/g, ' ').trim());
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    const removed = ['Quick draft', 'New match', 'Share draft plan', 'Open draft plan', 'Export snapshot', 'Download strategy review packet'].filter(t => labels.some(l => l.startsWith(t)));
    return {labels, removed, dupes};
  });
  await context.close(); verdict('PD5', seen.removed.length > 0 || seen.dupes.length > 0, seen);
};
probes.PD6 = async browser => {
  const {context, page} = await quickPhone(browser);
  const seen = await page.evaluate(() => {
    const slug = Object.keys(E.heroes).find(s => patchNotes('hero', s)), role = slug && E.roles(slug)[0];
    if (!slug) return {slug: null, open: []};
    openHero(slug, role); S.heroTab = 'kit'; render();
    return {slug, open: [...document.querySelectorAll('#main details')].filter(d => d.open).map(d => d.querySelector('summary')?.textContent.trim().slice(0, 60))}; });
  assert.ok(seen.slug, 'probe setup: no hero has official change notes in this publication');
  await context.close(); verdict('PD6', seen.open.length > 0, seen);
};
probes.PD7 = async browser => {
  const {context, page} = await quickPhone(browser);
  const seen = await page.evaluate(() => { openHero('gideon', 'midlane'); scrollTo(0, 600);
    const fixed = [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').filter(e => ['fixed', 'sticky'].includes(getComputedStyle(e).position) && e.getBoundingClientRect().top > innerHeight / 2 && !e.closest('#mobile-navigation') && !e.closest('.skill-chart-scroll'));
    return {bottom_overlays: fixed.map(e => (e.id || e.className || e.tagName).toString().slice(0, 40))};
  });
  await context.close(); verdict('PD7', seen.bottom_overlays.length > 0, seen);
};
probes.PD8 = async browser => {
  const {context, page} = await quickPhone(browser);
  const seen = await page.evaluate(() => {
    const review = E.metaReview, build = E.buildReview;
    E.metaReview = (s, r) => { const x = review(s, r); return x && {...x, active: false, tier: null}; };
    E.buildReview = (s, r) => { const x = build(s, r); return x && {...x, active: true}; };
    try { render(); } finally { E.metaReview = review; E.buildReview = build; }
    const cards = [...document.querySelectorAll('#main .mobile-hero-card')];
    return {cards: cards.length, placeholder_tiers: cards.filter(c => /(^|\s)—(\s|$)/.test(c.querySelector('.tier, [class*="tier"]')?.textContent || '')).length,
      build_ready_chips: cards.filter(c => /Build ready/.test(c.textContent)).length}; });
  await context.close(); verdict('PD8', seen.placeholder_tiers > 0 || seen.build_ready_chips > 0, seen);
};
/* 2.38.0 speed: the phone's first screen (the Meta list) shows before the rest of the hero and build data downloads.
   Counts the rank data that had finished downloading when the first Meta row appeared, against the full rank bundle. */
probes.PS1 = async browser => {
  const context = await browser.newContext({serviceWorkers: 'block', ...phone, viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.addInitScript(() => {
    const key = 'predecessor-companion-v1', prefs = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({...prefs, installSeen: true, fullDetails: false}));
    new MutationObserver((_, observer) => { if (document.querySelector('#mobile-all-list .mobile-hero-card')) { window.__firstRowAt = performance.now(); observer.disconnect(); } })
      .observe(document, {childList: true, subtree: true});
  });
  await page.goto(url);
  await page.waitForFunction(() => !!B && !latestStatus.busy && !!window.__firstRowAt, null, {timeout: 120000});
  const seen = await page.evaluate(async () => {
    const entry = publishedCohorts.gold, data = performance.getEntriesByType('resource').filter(e => /\/bundles\/gold-/.test(e.name));
    const before = data.filter(e => e.responseEnd <= window.__firstRowAt).reduce((n, e) => n + e.decodedBodySize, 0);
    const full = (await (await fetch(entry.url, {cache: 'no-store'})).arrayBuffer()).byteLength;
    return {before_first_row: before, full_bundle: full, share: Math.round(before / full * 1000) / 1000, files_before: data.filter(e => e.responseEnd <= window.__firstRowAt).map(e => e.name.split('/').pop().replace(/-[a-f0-9]{64}/, ''))};
  });
  await context.close(); verdict('PS1', !(seen.share > 0) || seen.share > 0.2, seen);
};
/* 2.38.0: the phone's first screen is the same whether or not the guide has arrived, for every role; screens that need
   the guide say so instead of computing without it. The guide is blocked here, as when it is not saved offline. */
async function quickPhoneContext(browser, block) {
  const context = await browser.newContext({serviceWorkers: 'block', ...phone, viewport: {width: 390, height: 844}});
  if (block) await context.route('**/bundles/*-guide-*.json', block);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { const key = 'predecessor-companion-v1', prefs = JSON.parse(localStorage.getItem(key) || '{}'); localStorage.setItem(key, JSON.stringify({...prefs, installSeen: true, fullDetails: false})); });
  await page.goto(url);
  await page.waitForFunction(() => !!B && !latestStatus.busy && !!document.querySelector('#mobile-all-list .mobile-hero-card'), null, {timeout: 120000});
  return {context, page, errors};
}
const metaScreens = page => page.evaluate(() => Object.fromEntries(['jungle', 'offlane', 'midlane', 'carry', 'support'].map(role => {
  S.role = role; changeRoute('meta');
  return [role, document.querySelector('#main').innerHTML.replace(/data-annex="[^"]*"/g, '')];
})));
probes.PS2 = async browser => {
  const full = await quickPhoneContext(browser, null), expected = await metaScreens(full.page); await full.context.close();
  const lean = await quickPhoneContext(browser, route => route.abort()), actual = await metaScreens(lean.page);
  const differ = Object.keys(expected).filter(role => expected[role] !== actual[role]);
  const hero = await lean.page.evaluate(() => { openHero('gideon', 'midlane'); const main = document.querySelector('#main'); return {waits: !!main.querySelector('[data-annex="guide"]'), text: main.innerText.slice(0, 160)}; });
  await lean.context.close();
  verdict('PS2', differ.length > 0 || !hero.waits || lean.errors.length > 0 || full.errors.length > 0, {differ, hero, errors: [...full.errors, ...lean.errors].slice(0, 3)});
};
probes.PS3 = async browser => {
  // The guide arrives three seconds late: a hero opened meanwhile shows the loading state, then the hero page.
  let release; const held = new Promise(r => { release = r; });
  const context = await browser.newContext({serviceWorkers: 'block', ...phone, viewport: {width: 390, height: 844}});
  await context.route('**/bundles/*-guide-*.json', async route => { await held; await route.continue(); });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { const key = 'predecessor-companion-v1', prefs = JSON.parse(localStorage.getItem(key) || '{}'); localStorage.setItem(key, JSON.stringify({...prefs, installSeen: true, fullDetails: false})); });
  await page.goto(url);
  await page.waitForFunction(() => !!B && !!document.querySelector('#mobile-all-list .mobile-hero-card'), null, {timeout: 120000});
  const waiting = await page.evaluate(() => { openHero('gideon', 'midlane'); return {loading: !!document.querySelector('#main .annex-loading[data-annex="guide"]'), route: S.route}; });
  release();
  await page.waitForFunction(() => !!document.querySelector('#main .simple-build, #main .hero-header'), null, {timeout: 60000}).catch(() => {});
  const after = await page.evaluate(() => ({route: S.route, hero: S.hero, rendered: !!document.querySelector('#main .simple-build, #main .hero-header'), gate: !!document.querySelector('#main [data-annex="guide"]')}));
  await context.close();
  verdict('PS3', !waiting.loading || !after.rendered || after.gate || after.hero !== 'gideon' || errors.length > 0, {waiting, after, errors: errors.slice(0, 3)});
};
/* 2.39.0 speed: tapping an item downloads only the item catalogue, not the whole shared source audit. */
probes.PS4 = async browser => {
  const {context, page} = await quickPhoneContext(browser, null), files = [];
  await page.evaluate(() => { openHero('gideon', 'midlane'); });
  await page.waitForSelector('#main .simple-purchases .item-button', {timeout: 60000});
  page.on('request', r => { const m = r.url().match(/\/bundles\/[a-z]+-([a-z]+(?:-[a-z0-9-]+)?)-[a-f0-9]{64}\.json$/); if (m) files.push(m[1]); });
  await page.locator('#main .simple-purchases .item-button').first().click();
  await page.waitForFunction(() => document.querySelector('#detail')?.open && !document.querySelector('#detail-body .annex-loading'), null, {timeout: 60000});
  const seen = await page.evaluate(() => ({dialog: document.querySelector('#detail-title')?.textContent || '', audit: !!document.querySelector('#detail-body details')}));
  await context.close();
  verdict('PS4', files.includes('shared') || !seen.dialog, {files, ...seen});
};
/* 2.40.0: the Plan screen (Compose, Draft, Live) was replaced by Match in 2.36.0. What still pointed at it. */
probes.PT1 = async browser => {
  // Desktop buttons that wrote a lineup into the old Plan and opened Match, which ignores it.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const found = {};
    openHero('gideon', 'midlane'); S.heroTab = 'pairings'; render();
    found.planPair = document.querySelectorAll('#main [data-plan-pair]').length;
    found.lockResponse = [...document.querySelectorAll('#main button')].filter(b => /Lock this response/.test(b.textContent)).length;
    changeRoute('guidance');
    found.exploreInPlanner = document.querySelectorAll('#main [data-guided-comp]').length;
    return found;
  });
  await context.close(); verdict('PT1', seen.planPair + seen.lockResponse + seen.exploreInPlanner > 0, seen);
};
probes.PT2 = async browser => {
  // A shared #plan= link, once accepted, opens Match with its hero and enemies.
  const {context, page} = await session(browser, desktop);
  const hash = await page.evaluate(() => MetaEngine.encodePlan({locks: [{slug: 'gideon', role: 'midlane'}], enemies: [{slug: 'steel', role: 'jungle'}], bans: [], size: 5}, B.official?.live?.version || null));
  await page.goto(url + hash); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
  await page.waitForSelector('#use-shared-plan', {timeout: 30000});
  await page.locator('#use-shared-plan').click(); await page.waitForTimeout(300);
  const seen = await page.evaluate(() => ({route: S.route, me: S.me, enemies: S.enemies.map(e => e.slug), chips: document.querySelectorAll('.match-chip').length}));
  await context.close(); verdict('PT2', seen.me !== 'gideon' || seen.route !== 'match' || !seen.enemies.includes('steel'), seen);
};
probes.PT3 = async browser => {
  // The home-screen app's shortcuts name distinct screens.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(async () => { const m = await (await fetch('app.webmanifest')).json(); return (m.shortcuts || []).map(s => ({name: s.name, url: s.url})); });
  const routes = seen.map(s => (s.url.match(/view=([a-z]+)/) || [])[1]).map(v => ['planner', 'draft', 'live', 'match', 'plan'].includes(v) ? 'match' : v);
  await context.close(); verdict('PT3', new Set(routes).size !== routes.length, {shortcuts: seen});
};
probes.PT4 = async browser => {
  // The phone's Full details hero page does not compute the Build Coach it never shows.
  const {context, page} = await session(browser, phone);
  const seen = await page.evaluate(() => {
    companionPrefs.fullDetails = true; saveCompanionPrefs();
    let calls = 0; const original = E.adaptBuild; E.adaptBuild = function (...args) { calls++; return original.apply(this, args); };
    try { openHero('gideon', 'midlane'); } finally { E.adaptBuild = original; }
    return {adaptBuildCalls: calls, coachShown: !!document.querySelector('#main .coach')};
  });
  await context.close(); verdict('PT4', seen.adaptBuildCalls > 0 || seen.coachShown, seen);
};
probes.PT5 = async browser => {
  // The page no longer carries the removed Plan screens' code.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => ['rosterEditorHTML', 'planRosterHTML', 'livePickerHTML', 'situationHTML', 'liveMobileDetails', 'generateCompositions', 'slotRows', 'banHero', 'liveContext'].filter(n => typeof window[n] === 'function'));
  await context.close(); verdict('PT5', seen.length > 0, {still_defined: seen});
};
/* 2.41.0 desktop pass (review of live 2.40.0 at 1440 and 1920). */
probes.DQ1 = async browser => {
  // The desktop hero page leads with the old Live Build Coach (fed by Match's enemies) and has no Use in Match.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => { openHero('gideon', 'midlane'); return {coach: document.querySelectorAll('#main .coach').length, useInMatch: document.querySelectorAll('#main [data-start-live]').length}; });
  await context.close(); verdict('DQ1', seen.coach > 0 || seen.useInMatch === 0, seen);
};
probes.DQ2 = async browser => {
  // Wording of the removed Plan screens on the desktop page and in the share dialog.
  const {context, page} = await session(browser, desktop);
  const stale = /Share plan|Open plan|Meta & Planning|META & PLANNING|draft stays|saved draft|Planning role|Live game|live-game inventory|picks and bans|No enemy locks|No allied locks/i;
  const texts = await page.evaluate(() => { const out = {}; changeRoute('meta'); out.meta = document.body.innerText; openHero('gideon', 'midlane'); out.hero = document.body.innerText; document.querySelector('#share-plan')?.click(); out.share = document.querySelector('#detail')?.innerText || ''; document.querySelector('#detail')?.close(); out.title = document.title; return out; });
  const found = Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, (v.match(new RegExp(stale.source, 'gi')) || []).slice(0, 4)]).filter(([, v]) => v.length));
  await context.close(); verdict('DQ2', Object.keys(found).length > 0, found);
};
probes.DQ3 = async browser => {
  // Desktop layout bugs: loadout labels in capitals spilling out of their cells, a fold chevron over its text, a clipped side rail at 1920.
  const {context, page} = await session(browser, {viewport: {width: 1920, height: 1080}});
  const seen = await page.evaluate(() => {
    changeRoute('builds');
    const smalls = [...document.querySelectorAll('#main .loadout-strip small.muted')];
    const caps = smalls.filter(el => getComputedStyle(el).textTransform === 'uppercase').length;
    const spill = [...document.querySelectorAll('#main .loadout-strip > div')].filter(el => el.scrollWidth > el.clientWidth + 1).length;
    changeRoute('guidance');
    const fold = document.querySelector('#main .reference-fold > summary'), pad = fold ? parseFloat(getComputedStyle(fold).paddingLeft) : null;
    changeRoute('meta');
    const select = document.querySelector('#performance-source'); const box = select?.closest('details'); if (box) box.open = true;
    const right = select ? Math.round(Math.max(select.getBoundingClientRect().right, box?.getBoundingClientRect().right || 0)) : null;
    return {caps, spill, foldPaddingLeft: pad, railRight: right, width: innerWidth};
  });
  await context.close(); verdict('DQ3', seen.caps > 0 || seen.spill > 0 || (seen.foldPaddingLeft !== null && seen.foldPaddingLeft < 20) || (seen.railRight !== null && seen.railRight > seen.width), seen);
};
probes.DQ4 = async browser => {
  // The desktop status names sources by internal keys and lists one twice.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    document.querySelector('#status-toggle')?.click();
    const text = [...document.querySelectorAll('.topbar, #status, #status-panel, .status-panel, #patch-strip')].map(el => el.innerText).join('\n');
    const raw = (text.match(/[a-z]+<->[a-z]+|\b[a-z0-9]+(?:-[a-z0-9.]+){3,}\b/g) || []).slice(0, 5);
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean), dupes = lines.filter((l, i) => l.length > 20 && lines.indexOf(l) !== i);
    return {raw, dupes: dupes.slice(0, 3)};
  });
  await context.close(); verdict('DQ4', seen.raw.length > 0 || seen.dupes.length > 0, seen);
};
probes.DQ5 = async browser => {
  // A hero link that cannot be opened says why on the desktop instead of silently showing Meta.
  const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage();
  await page.goto(url + '#hero=nobody&role=jungle&bracket=gold&tab=builds');
  await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000}); await page.waitForTimeout(500);
  const seen = await page.evaluate(() => ({route: S.route, message: [...document.querySelectorAll('.toast, #toast, [role="status"], [role="alert"], #main .note')].map(el => el.innerText).filter(t => /unavailable|choose a hero/i.test(t)).slice(0, 2)}));
  await context.close(); verdict('DQ5', seen.message.length === 0, seen);
};
probes.DQ6 = async browser => {
  // Closing an item dialog on the desktop hero page returns focus to the item; Back closes an open dialog.
  const {context, page} = await session(browser, desktop);
  await page.evaluate(() => openHero('gideon', 'midlane'));
  const key = await page.evaluate(() => document.querySelector('#main .item-button')?.dataset.key || null);
  await page.locator('#main .item-button').first().click(); await page.waitForTimeout(300);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const focus = await page.evaluate(() => ({tag: document.activeElement?.tagName, id: document.activeElement?.id || '', key: document.activeElement?.dataset?.key || null}));
  await page.locator('#main .item-button').first().click(); await page.waitForTimeout(300);
  await page.goBack(); await page.waitForTimeout(500);
  const afterBack = await page.evaluate(() => ({open: !!document.querySelector('#detail')?.open, route: S.route}));
  await context.close(); verdict('DQ6', focus.key !== key || afterBack.open, {key, focus, afterBack});
};
probes.DQ7 = async browser => {
  // Desktop Match shows the adapted build beside the picker, not 1,500 px below it; the picker closes at 5/5.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    S.me = 'gideon'; S.locks = [{slug: 'gideon', role: 'midlane'}]; S.enemies = [{slug: 'steel', role: 'jungle'}, {slug: 'narbash', role: 'support'}, {slug: 'sparrow', role: 'carry'}, {slug: 'grux', role: 'offlane'}, {slug: 'gadget', role: 'midlane'}].filter(e => E.heroes[e.slug]);
    S.matchPicking = 'enemy'; save(); changeRoute('match');
    const result = document.querySelector('#main .match-result'), grid = document.querySelector('#main details.match-pick');
    return {enemies: S.enemies.length, resultTop: result ? Math.round(result.getBoundingClientRect().top + scrollY) : null, gridOpen: !!grid?.open};
  });
  await context.close(); verdict('DQ7', seen.resultTop === null || seen.resultTop > 700 || (seen.enemies === 5 && seen.gridOpen), seen);
};
probes.DQ8 = async browser => {
  // Match labels the build it adapted by that build's own category. With the desktop Build Coach gone (DQ1), Match is
  // the only screen that shows the adapted build: a kept source playstyle is an observed choice, not a reviewed build.
  const {context, page} = await session(browser, desktop);
  await page.evaluate(() => changeRoute('builds'));
  await page.waitForFunction(() => Object.values(B.heroes).some(h => Object.values(h.roles || {}).some(r => (r.builds || []).length)), null, {timeout: 60000}).catch(() => {});
  const seen = await page.evaluate(() => {
    const enemies = Object.keys(E.heroes);
    for (const [slug, h] of Object.entries(B.heroes)) for (const [role, r] of Object.entries(h.roles || {})) {
      if (!E.buildReview(slug, role)?.active) continue;
      const me = {slug, role}, key = slug + '|' + role;
      S.me = slug; S.locks = [{slug, role}]; S.matchPicking = 'enemy';
      for (let index = 0; index < (r.builds || []).length; index++) {
        try { companionPrefs.selectedBuilds[key] = CompanionState.reference(B, E, slug, role, index); } catch { continue; }
        for (const enemy of enemies) {
          if (enemy === slug) continue;
          S.enemies = [{slug: enemy, role: E.roles(enemy)[0]}];
          const a = matchAdapted(me, S.enemies);
          if (a.error || !a.available) break;
          if (a.swaps.length || !a.plan?.manual) continue;
          changeRoute('match');
          const tag = document.querySelector('#main .match-result .skill-guide-head .tag');
          const out = {found: true, hero: key, index, enemy, badge: tag?.textContent.trim() || null, cls: tag?.className || null};
          delete companionPrefs.selectedBuilds[key];
          return out;
        }
      }
      delete companionPrefs.selectedBuilds[key];
    }
    return {found: false};
  });
  await context.close(); verdict('DQ8', seen.found && !/\bobserved\b/.test(seen.cls || ''), seen);
};
/* Freshness overhaul (2.43.0): a new publication reaches an open or returning app within a minute. */
probes.FR1 = async browser => {
  // Before: a returning app checked only when its last check was over 15 minutes old, and an open tab every 30 minutes.
  const {context, page} = await clockSession(browser, phone);
  let manifests = 0;
  page.on('request', r => { if (/\/manifest\.json(\?|$)/.test(r.url())) manifests++; });
  await page.waitForTimeout(1500);
  await page.clock.fastForward(120000);   // the user comes back two minutes later
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);
  const onReturn = manifests;
  await page.clock.fastForward(6 * 60000);   // the tab then stays open and visible for six minutes
  await page.waitForTimeout(1500);
  const openTab = manifests - onReturn;
  await context.close();
  verdict('FR1', onReturn === 0 || openTab === 0, {onReturn, openTab});
};
/* Freshness Phase 3 (2.45.0): every rank shows an engine-calculated tier, labeled Calculated (docs/CALCULATED-TIERS.md).
   The seed preview holds Gold+ only; CT1 relabels it as Silver+ in the page, the way a Silver+ publication arrives. */
const asSilver = () => { B = {...B, bracket: {...B.bracket, segment: 'silver', label: 'Silver+'}, scoped_statistics: {...B.scoped_statistics, bracket_label: 'Silver+'}}; E = MetaEngine.create(B); S.role = 'jungle'; };   // S.bracket stays: the seed publishes no Silver+ file to switch to
probes.CT1 = async browser => {
  // Before: a rank without a reviewed tier review showed no tier at all ("No reviewed tier for Silver+").
  const seen = {};
  {
    const {context, page} = await session(browser, desktop);
    Object.assign(seen, await page.evaluate(`(${asSilver})(); S.sort = 'tier'; changeRoute('builds'); changeRoute('meta');
      document.querySelector('.meta-table [data-calculated-tier]')?.click();   // in the same task: a later guide merge redraws the real bundle
      ({desktopHeader: [...document.querySelectorAll('.meta-table th')].map(t => t.innerText.trim()), desktopCells: document.querySelectorAll('.meta-table [data-calculated-tier]').length,
        dialog: document.querySelector('#detail').open ? document.querySelector('#detail-body').innerText.slice(0, 400) : ''})`));
    await context.close();
  }
  {
    const {context, page} = await session(browser, phone);
    Object.assign(seen, await page.evaluate(`(${asSilver})(); companionPrefs.homeQuery = ''; changeRoute('builds'); changeRoute('meta');
      ({phoneRows: [...document.querySelectorAll('#mobile-all-list .mobile-hero-card')].filter(c => c.querySelector('.tier') && /Calculated/.test(c.innerText)).length})`));
    await context.close();
  }
  const shown = seen.desktopHeader?.some(h => /Calculated tier/i.test(h)) && seen.desktopCells > 0 && /Calculated tier [SABCD] · Silver\+/.test(seen.dialog || '') && /games/.test(seen.dialog || '') && seen.phoneRows > 0;
  verdict('CT1', !shown, seen);
};
probes.CT2 = async browser => {
  // Before: on Gold+ a withheld reviewed grade left its row with "Tier review pending" and no tier.
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const entry = B.guidance.meta_review.entries.find(r => r.role === 'jungle' && E.metaReview(r.slug, r.role)?.active && E.performance({slug: r.slug, role: r.role}, {source: 'pred'})?.played >= 500);
    if (!entry) return {setup: false};
    // The observed role rate moves 4 points from the reviewed sample: the grade is withheld until it is rechecked.
    const move = list => list.map(r => r.slug === entry.slug && r.role === entry.role ? {...r, winRate: entry.evidence.winRate + 4, wonGames: Math.round(r.matches * (entry.evidence.winRate + 4) / 100)} : r);
    const c = B.scoped_statistics, roles = {...c.roles, jungle: {...c.roles.jungle, rows: move(c.roles.jungle.rows)}};
    B = {...B, scoped_statistics: {...c, rows: move(c.rows), roles}}; E = MetaEngine.create(B);
    S.role = 'jungle'; S.sort = 'tier'; changeRoute('builds'); changeRoute('meta');
    const cell = document.querySelector('.meta-table [data-hero="' + entry.slug + '"]')?.closest('tr')?.children[1];
    return {setup: !E.metaReview(entry.slug, 'jungle').active && !!E.calculatedTier(entry.slug, 'jungle').tier, slug: entry.slug,
      cell: (cell?.innerText || '').replace(/\s+/g, ' '), calculated: !!cell?.querySelector('[data-calculated-tier] .tier')};
  });
  await context.close();
  assert.ok(seen.setup, 'probe setup: a withheld Gold+ grade with a calculated tier');
  verdict('CT2', !(seen.calculated && /Calculated/.test(seen.cell) && /recheck queued/.test(seen.cell)), seen);
};
probes.ML2 = async browser => {
 const {context,page}=await session(browser,phone);await page.evaluate(()=>changeRoute('meta'));
 if(!await page.locator('#mobile-meta-order').count()){await context.close();verdict('ML2',true,{missingOrder:true});return;}
 await page.selectOption('#mobile-meta-order','name');
 const names=await page.locator('#mobile-all-list [data-hero] .name').allTextContents();
 await page.selectOption('#mobile-meta-order','wr');
 const rates=await page.evaluate(()=>[...document.querySelectorAll('#mobile-all-list [data-hero]')].map(b=>E.performance({slug:b.dataset.hero,role:S.role})).filter(p=>p?.played>=100).map(p=>p.wr));
 await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);
 const restored=await page.locator('#mobile-meta-order').inputValue();
 await context.close();verdict('ML2',JSON.stringify(names)!==JSON.stringify([...names].sort((a,b)=>a.localeCompare(b)))||rates.some((r,i)=>i&&r>rates[i-1])||restored!=='wr',{names,rates,restored});
};

(async () => {
  let server = null;
  if (process.env.START_PREVIEW === '1') {
    const python = process.env.PYTHON_EXE || 'python';
    // Each run owns its preview. Parallel focused checks must not replace the full suite's files.
    const site=path.join('qa',port===12940?'audit-site':'audit-'+port+'-site'),state=path.join('qa',port===12940?'audit-state':'audit-'+port+'-state');
    const staged = spawnSync(python, ['-B', path.join('tests', 'stage_preview.py'),'--output',site,'--state-dir',state], {cwd: root, encoding: 'utf8'});
    if (staged.status) throw Error('Preview staging failed: ' + staged.stderr);
    server = spawn(python, ['-B', '-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', site], {cwd: root, stdio: 'ignore'});
    await new Promise(r => setTimeout(r, 1500));
  }
  fs.mkdirSync(path.join(root, 'qa'), {recursive: true});
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true});
  // Existing probes audit full evidence and legacy section behavior. The quick companion has its own browser suite.
  const newContext=browser.newContext.bind(browser);browser.newContext=async (...args)=>{const c=await newContext(...args);await c.addInitScript(()=>{const key='predecessor-companion-v1';const prefs=JSON.parse(localStorage.getItem(key)||'{}');localStorage.setItem(key,JSON.stringify({...prefs,fullDetails:true}));});return c;};
  try {
    for (const [id, probe] of Object.entries(probes)) {
      if (only && !only.has(id)) continue;
      if (retired.has(id)) continue;
      try { await probe(browser); }
      catch (error) { results.push({id, title: ledger.defects[id], ok: false, error: String(error.message || error).split('\n')[0]}); }
    }
  } finally { await browser.close(); if (server) server.kill(); }
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(root, 'qa', 'audit-regressions-browser.json'), JSON.stringify({baseline: ledger.baseline, url, checked_at: new Date().toISOString(), results}, null, 2));
  for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.id + ' ' + (r.error ? 'probe error: ' + r.error : (r.reproduced ? 'reproduced' : 'not reproduced') + (r.recorded_open ? ' (recorded open)' : ' (recorded fixed)')) + ' ' + JSON.stringify(r.detail || {}));
  if (failed.length) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
