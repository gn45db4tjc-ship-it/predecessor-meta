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
  // Listen first: a long jump also fires the site's own 30-minute check, and either trigger is realistic.
  const checked = page.waitForResponse(response => response.url().includes('manifest.json'), {timeout: 60000});
  await page.clock.fastForward(forward);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
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
/* Items whose original Pred.gg definition lives in the shared evidence file (their dialog fills in when it arrives). */
async function evidenceItems(context) {
  const entry = (await (await context.request.get(url + 'manifest.json')).json()).cohorts.gold;
  const full = JSON.parse(await (await context.request.get(url + entry.url)).text());
  return Object.keys(full.items || {}).filter(k => full.items[k]?.pred_raw);
}

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
  async A5(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page); await generate(page);
    const expected = await page.evaluate(() => compositions.alternatives[1].picks.map(p => p.role + ':' + p.slug).sort());
    await page.locator('[data-use-comp="1"]').click();
    const locks = await page.evaluate(() => S.locks.map(p => p.role + ':' + p.slug).sort());
    const unique = await page.evaluate(() => new Set(S.locks.map(p => p.slug)).size === S.locks.length && new Set(S.locks.map(p => p.role)).size === S.locks.length);
    verdict('A5', JSON.stringify(locks) !== JSON.stringify(expected) || !unique, {applied: locks, expected, unique});
    await context.close();
  },
  async A6(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page); await generate(page);
    const target = await page.locator('[data-substitute]').first().getAttribute('data-substitute');
    await page.locator('[data-substitute="' + target + '"]').first().click();
    await page.waitForFunction(() => !!compositions?.substitution, null, {timeout: 180000});
    const state = await page.evaluate(() => ({current: compositionsCurrent(), alternatives: compositions.alternatives.length, role: compositions.substitution.role, locks: S.locks.length, size: S.size}));
    verdict('A6', !(state.current && state.locks === state.size - 1), state);
    await context.close();
  },
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
  async A8(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 3, {bans: ['khaimera']}); await generate(page);
    await page.evaluate(() => changeRoute('draft'));
    await page.locator('[data-unban="khaimera"]').first().click();
    await page.evaluate(() => changeRoute('planner'));
    const text = await page.locator('#compositions').innerText();
    verdict('A8', !/changed after these alternatives were generated/i.test(text), {panel: text.slice(0, 160)});
    await context.close();
  },
  async A10(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page); await generate(page);
    await failTheNextCheck(page, 'd');
    await page.locator('#refresh').click();
    await page.waitForFunction(() => !latestStatus.busy && !!latestStatus.errors?.length, null, {timeout: 120000});
    await page.evaluate(() => changeRoute('planner'));
    const seen = await page.evaluate(() => ({kept: !!compositions, text: document.querySelector('#compositions')?.innerText || ''}));
    verdict('A10', seen.kept || !/changed after these alternatives were generated/i.test(seen.text), {kept: seen.kept, panel: seen.text.slice(0, 140)});
    await context.close();
  },
  async A11(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 3, {locks: [], bans: ['sparrow']});
    await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'pairings'; render(); });
    const seen = await page.evaluate(() => {
      const button = [...document.querySelectorAll('[data-plan-pair]')].find(b => b.dataset.planPair.split('|')[1] === 'sparrow');
      const disabled = !button || button.disabled;
      if (button) { button.disabled = false; button.click(); }   // even a forced click must not lock a banned hero
      return {offered: !!button, disabled, locks: S.locks.map(p => p.slug), bans: [...S.bans]};
    });
    const enemy = await page.evaluate(() => {
      Object.assign(S, {locks: [], bans: [], enemies: [{slug: 'sparrow', role: 'carry'}]}); save(); openHero('steel', 'jungle'); S.heroTab = 'pairings'; render();
      const button = [...document.querySelectorAll('[data-plan-pair]')].find(b => b.dataset.planPair.split('|')[1] === 'sparrow');
      const disabled = !button || button.disabled;
      if (button) { button.disabled = false; button.click(); }
      return {offered: !!button, disabled, locks: S.locks.map(p => p.slug), enemies: S.enemies.map(p => p.slug)};
    });
    assert.ok(seen.offered && enemy.offered, 'probe setup: no Sparrow pair card was offered');
    verdict('A11', seen.locks.includes('sparrow') || !seen.bans.includes('sparrow') || !seen.disabled || enemy.locks.includes('sparrow') || !enemy.enemies.includes('sparrow') || !enemy.disabled, {banned: seen, enemy_picked: enemy});
    await context.close();
  },
  async A12(browser) {
    const {context, page} = await session(browser, desktop);
    const seen = await page.evaluate(() => {
      B = {...B, guidance: {...B.guidance, strategic_review: undefined}}; E = MetaEngine.create(B);
      const index = B.guidance.compositions.findIndex(c => c.picks.length >= 2), target = B.guidance.compositions[index].picks[1].slug;
      Object.assign(S, {locks: [], enemies: [], bans: [target]}); save(); changeRoute('guidance');
      const button = document.querySelector('[data-guided-comp="' + index + '"]'), disabled = !button || button.disabled;
      if (button) { button.disabled = false; button.click(); }
      return {target, disabled, locks: S.locks.map(p => p.slug), bans: [...S.bans]};
    });
    const enemy = await page.evaluate(target => {
      const index = B.guidance.compositions.findIndex(c => c.picks.some(p => p.slug === target)), pick = B.guidance.compositions[index].picks.find(p => p.slug === target);
      Object.assign(S, {locks: [], bans: [], enemies: [{slug: target, role: pick.role}]}); save(); changeRoute('guidance');
      const button = document.querySelector('[data-guided-comp="' + index + '"]'), disabled = !button || button.disabled;
      if (button) { button.disabled = false; button.click(); }
      return {disabled, locks: S.locks.map(p => p.slug), enemies: S.enemies.map(p => p.slug)};
    }, seen.target);
    verdict('A12', seen.locks.includes(seen.target) || !seen.bans.includes(seen.target) || !seen.disabled || enemy.locks.includes(seen.target) || !enemy.enemies.includes(seen.target) || !enemy.disabled, {banned: seen, enemy_picked: enemy});
    await context.close();
  },
  async A9(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page); await generate(page);
    await page.locator('[data-size="2"]').click();
    const afterSize = await offered(page);
    await reset(page); await generate(page);
    await page.evaluate(() => { S.enemies = [{slug: 'gideon', role: 'midlane'}]; save(); render(); });
    const afterEnemy = await offered(page);
    verdict('A9', afterSize > 0 || afterEnemy > 0, {offered_after_size_change: afterSize, offered_after_enemy_change: afterEnemy});
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
    await d.page.evaluate(() => changeRoute('draft'));
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
    verdict('C4', !(/Editorial tiers are paused for this role/i.test(text) && /ordered by role performance/i.test(text)), {excerpt: (text.match(/Editorial tiers[^\n]*/) || [''])[0].slice(0, 170)});
    await context.close();
  },
  /* Second review round. */
  async A13(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page); await generate(page);
    // Stage 4 keeps search controls in a disclosure; exercise the same real change through it.
    const searchOptions=page.locator('[data-keep="plan-search-options"]');
    if(await searchOptions.count()&&!await searchOptions.evaluate(d=>d.open))await searchOptions.locator('summary').click();
    await page.selectOption('#comp-sort', await page.evaluate(() => [...document.querySelectorAll('#comp-sort option')].map(o => o.value).find(v => v !== S.sortComp)));
    const text = await page.locator('#compositions').innerText();
    verdict('A13', !/^Your search options changed after these alternatives were generated/m.test(text) || /picks, bans, enemies or data/.test(text), {panel: text.slice(0, 120)});
    await context.close();
  },
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
  /* E guards: the worker must return exactly what the engine returns, and the page must still work without one. */
  async E2(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 5); await generate(page);
    const seen = await page.evaluate(() => {
      const direct = E.generate(S.locks, {size: S.size, bans: S.bans, enemies: S.enemies, metric: S.sortComp, preferredRole: 'jungle', requiredRole: effectiveRequiredRole(), includeUnsampled: S.includeUnsampled});
      const {inputs, ...fromWorker} = compositions;
      return {usedWorker: !!search.worker && !search.unavailable, same: JSON.stringify(fromWorker) === JSON.stringify(direct), alternatives: direct.alternatives.length};
    });
    assert.ok(seen.usedWorker, 'probe setup: the search did not run in a worker on the published site');
    verdict('E2', !seen.same, seen);
    await context.close();
  },
  async E3(browser) {
    const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage();
    await page.addInitScript(() => { window.Worker = class { constructor() { setTimeout(() => this.onerror?.({preventDefault() {}}), 0); } postMessage() {} terminate() {} }; });   // a blocked worker reports an error event
    await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    await reset(page, 3); await generate(page);
    const seen = await page.evaluate(() => ({alternatives: compositions?.alternatives?.length || 0, fellBack: search.unavailable === true, current: compositionsCurrent()}));
    verdict('E3', !(seen.alternatives > 0 && seen.fellBack && seen.current), seen);
    await context.close();
  },
  async E4(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 5);
    await page.evaluate(() => changeRoute('planner'));
    await page.locator('#generate').click();
    // While the worker is searching, the draft changes: the finished result no longer answers the question on screen.
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});   // the search has started with the old inputs
    const banned = await page.evaluate(() => { const slug = Object.keys(B.heroes).find(s => s !== 'steel'); S.bans = [slug]; save(); return slug; });
    await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    const seen = await page.evaluate(() => ({kept: !!compositions, notice: compositionsNotice, shown: /was discarded/.test(document.querySelector('#main').innerText)}));
    verdict('E4', !(seen.kept === false && seen.shown), {banned, ...seen, notice: seen.notice.slice(0, 80)});
    await context.close();
  },
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
  async E6(browser) {
    const {context, page} = await session(browser, desktop);
    await reset(page, 5);
    await page.evaluate(() => changeRoute('planner'));
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
    // While the worker searches, the user opens the patch changes and types a filter.
    await page.evaluate(() => changeRoute('changes'));
    await page.locator('#patch-search').click();
    await page.keyboard.type('stee');
    await page.waitForFunction(() => !search.pending, null, {timeout: 180000});
    await page.keyboard.type('l');
    const seen = await page.evaluate(() => ({focused: document.activeElement?.id, value: document.querySelector('#patch-search')?.value, generated: !!compositions}));
    verdict('E6', !(seen.focused === 'patch-search' && seen.value === 'steel' && seen.generated), seen);
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
    const toggle = page.locator('#mobile-all-heroes');
    let seen = {listed: [], unsampled_with_numbers: []};
    if (await toggle.count()) {
      await toggle.click();
      seen = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#mobile-all-list [data-hero]')];
        const unsampled = cards.filter(c => !E.performance({slug: c.dataset.hero, role: 'jungle'})).map(c => c.closest('article')?.innerText || '');
        return {listed: cards.map(c => c.dataset.hero).sort(), unsampled: unsampled.length, unsampled_with_numbers: unsampled.filter(t => /%/.test(t)), expanded: document.querySelector('#mobile-all-heroes')?.getAttribute('aria-expanded')};
      });
    }
    const missing = eligible.filter(s => !seen.listed.includes(s));
    // The staged data samples every jungle hero, so withhold one hero's role sample and look at its card.
    const unsampled = seen.listed.length ? await page.evaluate(slug => {
      const original = E.performance;
      E.performance = p => p.slug === slug && p.role === 'jungle' ? null : original(p);
      try { render(); const card = document.querySelector(`#mobile-all-list [data-hero="${slug}"]`)?.closest('article'); return {slug, listed: !!card, text: (card?.innerText || '').replace(/\s+/g, ' ')}; }
      finally { E.performance = original; render(); }
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
  async M4(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('live'); });
    const seen = await page.evaluate(() => {
      const main = document.querySelector('#main'), clone = main.cloneNode(true);
      clone.querySelectorAll('details:not([open])').forEach(d => [...d.children].forEach(c => { if (c.tagName !== 'SUMMARY') c.remove(); }));
      const text = clone.textContent.replace(/\s+/g, ' '), all = main.textContent.replace(/\s+/g, ' ');
      // Any per-source date wording counts: the old "Statistics: <date>" and the new "Statistics fetched <date>".
      const dated = /(Mechanics|Statistics)(: | fetched )/;
      return {visible_source_dates: dated.test(text), dates_behind_a_tap: dated.test(all) && !dated.test(text), sample: (text.match(/.{0,40}(Mechanics|Statistics)(: | fetched ).{0,40}/) || [''])[0]};
    });
    verdict('M4', seen.visible_source_dates || !seen.dates_behind_a_tap, seen);
    await context.close();
  },
  async M5(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('live'); });
    await page.locator('[data-live-lookup]').first().click();
    const opened = await page.evaluate(() => ({route: S.route, dialog: !!document.querySelector('#detail')?.open, choices: document.querySelectorAll('#detail [data-pick-live]:not([disabled])').length}));
    let after = null, undone = null;
    if (opened.route === 'live' && opened.dialog && opened.choices) {
      const target = await page.evaluate(() => [...document.querySelectorAll('#detail [data-pick-live]:not([disabled])')].map(b => b.dataset.pickLive).find(v => !v.startsWith('steel|')));
      await page.locator(`#detail [data-pick-live="${target}"]`).click();
      const confirm = page.locator('#detail [data-confirm-live]');
      if (await confirm.count()) {
        await confirm.click();
        after = await page.evaluate(() => ({route: S.route, me: S.me, locks: S.locks.map(p => p.slug + '|' + p.role), undo: !!document.querySelector('#undo-banner') && !document.querySelector('#undo-banner').hidden, dialog: !!document.querySelector('#detail')?.open}));
        after.target = target;
        if (after.undo) { await page.locator('#undo-action').click(); undone = await page.evaluate(() => ({me: S.me, locks: S.locks.map(p => p.slug + '|' + p.role)})); }
      }
    }
    const ok = !!(opened.route === 'live' && opened.dialog && after && after.route === 'live' && !after.dialog && after.me === after.target.split('|')[0] && after.locks.includes(after.target) && !after.locks.includes('steel|jungle') && undone?.me === 'steel' && undone.locks.includes('steel|jungle'));
    verdict('M5', !ok, {opened, after, undone});
    await context.close();
  },
  async M6(browser) {
    const {context, page} = await session(browser, phone);
    const occupant = await page.evaluate(() => { const o = Object.keys(E.heroes).sort().find(s => s !== 'steel' && E.roles(s).includes('jungle')); Object.assign(S, {locks: [{slug: o, role: 'jungle'}], enemies: [], bans: [], me: null}); save(); openHero('steel', 'jungle'); return o; });
    const button = page.locator('[data-start-live]').first();
    const enabled = await button.isEnabled();
    let after = null, undone = null;
    if (enabled) {
      await button.click();
      const confirm = page.locator('#detail [data-confirm-live]');
      if (await confirm.count()) {
        const warned = await page.evaluate(o => document.querySelector('#detail').innerText.includes(name(o)), occupant);
        await confirm.click();
        after = await page.evaluate(() => ({route: S.route, me: S.me, locks: S.locks.map(p => p.slug + '|' + p.role)}));
        after.warned = warned;
        if (await page.locator('#undo-banner:not([hidden]) #undo-action').count()) { await page.locator('#undo-action').click(); undone = await page.evaluate(() => ({me: S.me, locks: S.locks.map(p => p.slug + '|' + p.role)})); }
      }
    }
    const ok = !!(enabled && after?.warned && after.route === 'live' && after.me === 'steel' && after.locks.includes('steel|jungle') && !after.locks.includes(occupant + '|jungle') && undone?.locks.includes(occupant + '|jungle') && !undone.locks.includes('steel|jungle'));
    verdict('M6', !ok, {occupant, enabled, after, undone});
    await context.close();
  },
  async M7(browser) {
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: []}); save(); changeRoute('draft'); });
    const seen = await page.evaluate(() => {
      const main = document.querySelector('#main');
      const lineups = [...main.querySelectorAll('details[data-lineup]')].map(d => ({side: d.dataset.lineup, summary: d.querySelector('summary').innerText.trim(), nested: d.querySelectorAll('details').length, slots: d.querySelectorAll('select[data-slot]').length}));
      return {lineups, nested_lineup_disclosures: [...main.querySelectorAll('summary')].filter(s => /Edit lineup|other roles/i.test(s.innerText)).length};
    });
    const allies = seen.lineups.find(l => l.side === 'allies'), enemies = seen.lineups.find(l => l.side === 'enemies');
    const ok = !!(seen.lineups.length === 2 && /Allies · 1 of 5 selected/i.test(allies?.summary || '') && /Enemies · 0 of 5 selected/i.test(enemies?.summary || '') && !allies.nested && !enemies.nested && allies.slots === 5 && enemies.slots === 5 && !seen.nested_lineup_disclosures);
    verdict('M7', !ok, seen);
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
  async M9(browser) {
    const {context, page} = await session(browser, phone);
    await reset(page, 5);
    await page.evaluate(() => changeRoute('planner'));
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
    const cancel = page.locator('#cancel-generate');
    const available = !!(await cancel.count()) && await cancel.isVisible();
    let after = null;
    if (available) {
      await cancel.click();
      await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 10000}).catch(() => {});
      after = await page.evaluate(() => ({pending: !!search.pending, generate_enabled: !document.querySelector('#generate')?.disabled, label: document.querySelector('#generate')?.textContent, compositions: !!compositions, notice: (document.querySelector('#main').innerText.match(/[^.\n]*cancel[^.\n]*/i) || [null])[0]}));
    }
    const ok = !!(available && after && !after.pending && after.generate_enabled && !after.compositions && after.notice);
    verdict('M9', !ok, {available, after});
    await context.close();
  },
  async M10(browser) {
    // A section opened on one screen must not open the matching section on another screen or another hero.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], size: 3}); save(); changeRoute('draft'); });
    const draftOpened = await page.evaluate(() => { const d = document.querySelector('#main details[data-lineup="allies"]'); if (d) d.open = true; return !!d?.open; });
    await page.evaluate(() => changeRoute('planner'));
    const planner = await page.evaluate(() => document.querySelector('#main details[data-lineup="allies"]')?.open ?? null);
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
    verdict('M10', !draftOpened || planner !== false || hero.open !== fresh, {draft_opened: draftOpened, planner_allies_open: planner, other_hero_open_sections: hero.open, fresh_open_sections: fresh, total: hero.total});
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
  async M12(browser) {
    // On Compositions the allied lineup counts against the combination size, as the heading does.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], size: 2}); save(); changeRoute('planner'); });
    const summary = await page.evaluate(() => document.querySelector('#main details[data-lineup="allies"] > summary')?.innerText.trim() || '');
    verdict('M12', !/1 of 2 selected/.test(summary), {summary});
    await context.close();
  },
  async M13(browser) {
    // Cancel is offered only while a background search can actually be cancelled (never for the main-thread fallback).
    const {context, page} = await session(browser, phone);
    await reset(page, 3);
    await page.evaluate(() => { stopSearchWorker(true); changeRoute('planner');
      window.__cancelShown = false; const watch = () => { const c = document.querySelector('#cancel-generate'); if (c && !c.hidden) window.__cancelShown = true; };
      new MutationObserver(watch).observe(document.querySelector('#main'), {subtree: true, attributes: true, childList: true}); });
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!compositions && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    const seen = await page.evaluate(() => ({fallback: search.unavailable, cancel_shown: window.__cancelShown, alternatives: compositions?.alternatives?.length || 0}));
    verdict('M13', seen.cancel_shown, seen);
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
  async P2(browser) {
    // Cancelling a new search while earlier alternatives are shown says so in the panel and keeps them; the note
    // disappears while a new search runs and once the alternatives are used.
    const {context, page} = await session(browser, phone);
    await reset(page, 5);
    await generate(page);
    const cancelSearchNow = async () => {
      await page.locator('#generate').click();
      await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
      if (await page.locator('#cancel-generate').isVisible()) await page.locator('#cancel-generate').click();
      await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 20000}).catch(() => {});
    };
    const panel = () => page.evaluate(() => document.querySelector('#compositions')?.innerText || '');
    await cancelSearchNow();
    const kept = await page.evaluate(() => compositions?.alternatives?.length || 0), said = /Search cancelled/i.test(await panel());
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
    const duringNewSearch = /Search cancelled/i.test(await panel());
    await page.waitForFunction(() => !search.pending && !!compositions && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    await cancelSearchNow();
    await page.locator('[data-use-comp]').first().click();
    const afterUse = /previous search/i.test(await panel());
    const seen = {kept, said, duringNewSearch, afterUse};
    verdict('P2', !(kept > 0 && said && !duringNewSearch && !afterUse), seen);
    await context.close();
  },
  async P3(browser) {
    // The Live hero picker marks a sample under 100 games, as the Meta list does.
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => {
      Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('live');
      const slug = Object.keys(E.heroes).sort().find(s => s !== 'steel' && E.roles(s).includes('jungle'));
      const original = E.performance;
      E.performance = p => { const r = original(p); return p.slug === slug && p.role === 'jungle' && r ? {...r, played: 42} : r; };
      try { showLivePicker('jungle', true); const row = document.querySelector(`#detail [data-pick-live="${slug}|jungle"]`); return {slug, text: (row?.innerText || '').replace(/\s+/g, ' ')}; }
      finally { E.performance = original; document.querySelector('#detail').close(); }
    });
    verdict('P3', !/small sample/i.test(seen.text), seen);
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
    // Top five, the lead and the hero list give the real reason for missing numbers: too few games, a statistics page
    // that failed to load or was never collected (Pred.gg or Statz), statistics paused or unavailable.
    const {context, page} = await session(browser, phone);
    const seen = await page.evaluate(() => {
      const topFive = () => { const s = [...document.querySelectorAll('#main section')].find(x => /Top five/.test(x.querySelector('h2')?.innerText || '')); return {tiles: s ? s.querySelectorAll('.mobile-hero-card').length : null, text: (s?.innerText || '').replace(/\s+/g, ' ')}; };
      const lead = () => (document.querySelector('#main .page-head p')?.innerText || '').replace(/\s+/g, ' ');
      const list = () => { document.querySelector('#mobile-all-heroes[aria-expanded="false"]')?.click(); return (document.querySelector('#mobile-all-list')?.innerText || '').replace(/\s+/g, ' ').slice(0, 160); };
      const view = role => { S.role = role; companionPrefs.homeQuery = ''; changeRoute('builds'); changeRoute('meta'); return {top: topFive(), lead: lead(), list: list(), reason: statsReason(Object.keys(E.heroes).find(s => E.roles(s).includes(role)), role)}; };
      const saved = B, original = E.performance, out = {};
      try {
        E.performance = p => { const r = original(p); return p.role === 'jungle' && r ? {...r, played: Math.min(r.played, 60)} : r; };
        out.none = view('jungle').top;
        let first = null;
        E.performance = p => { const r = original(p); if (p.role !== 'jungle' || !r) return r; first = first || p.slug; return {...r, played: p.slug === first ? Math.max(r.played, 150) : Math.min(r.played, 60)}; };
        out.one = view('jungle').top;
        E.performance = original;
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
      && /paused/i.test(seen.withheld.top.text) && !/100 or more/i.test(seen.withheld.top.text) && !/ordered by role performance/i.test(seen.withheld.lead) && !/Role performance in/i.test(seen.withheld.top.text) && /paused/i.test(seen.withheld.list)
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
    // At 320 px with large text the rank select shows its whole label, the Situation item picker is full width, and a
    // hero tile with a long reason text keeps a readable name column.
    const {context, page} = await session(browser, {...phone, viewport: {width: 320, height: 700}});
    await page.evaluate(() => { companionPrefs.large = true; companionChrome(); Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: [], me: 'steel'}); save(); changeRoute('live'); });
    const rank = await page.evaluate(() => { const s = document.querySelector('#bracket'); return {width: Math.round(s.getBoundingClientRect().width), text: s.options[s.selectedIndex]?.text || ''}; });
    await page.locator('[data-edit-situation]').first().click();
    const dialog = await page.evaluate(() => ({select: Math.round(document.querySelector('#detail #live-owned-add')?.getBoundingClientRect().width || 0), body: Math.round(document.querySelector('#detail-body')?.getBoundingClientRect().width || 0)}));
    await page.keyboard.press('Escape');
    const tile = await page.evaluate(() => {
      const saved = B; B = {...B, scoped_statistics: {...B.scoped_statistics, status: 'failed'}, patch: '1.15'}; E = MetaEngine.create(B);
      try { S.role = 'jungle'; changeRoute('builds'); changeRoute('meta'); document.querySelector('#mobile-all-heroes[aria-expanded="false"]')?.click();
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
  async P12(browser) {
    // A second Enter on Generate never cancels the search it started; after Cancel focus returns to Generate and the
    // toast agrees with the panel; a search started by a click leaves focus alone when it finishes.
    const {context, page} = await session(browser, phone);
    await reset(page, 5);
    await page.evaluate(() => changeRoute('planner'));
    await page.locator('#generate').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const secondEnter = await page.evaluate(() => ({pending: !!search.pending, cancelled: /cancel/i.test(document.querySelector('#toast')?.textContent || '') || /cancel/i.test(document.querySelector('#compositions')?.innerText || '')}));
    await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!search.pending && !document.querySelector('#cancel-generate')?.hidden, null, {timeout: 30000});
    await page.locator('#cancel-generate').click();
    await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 20000}).catch(() => {});
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({focused: document.activeElement?.id || document.activeElement?.tagName, toast: document.querySelector('#toast')?.textContent || ''}));
    await page.evaluate(() => document.activeElement?.blur());
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
    await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    await page.waitForTimeout(150);
    const clicked = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    verdict('P12', secondEnter.cancelled || after.focused !== 'generate' || /unchanged/i.test(after.toast) || clicked === 'generate', {secondEnter, after, clicked});
    await context.close();
  },
  async P13(browser) {
    // A redraw keeps keyboard focus on the control the user was on (lineup selects have no id), and never moves it to
    // another copy of the same hero elsewhere on the page.
    const {context, page} = await session(browser, phone);
    await page.evaluate(() => { Object.assign(S, {locks: [{slug: 'steel', role: 'jungle'}], enemies: [], bans: []}); save(); changeRoute('planner'); document.querySelector('#main details[data-lineup]')?.setAttribute('open', ''); });
    await page.locator('select[data-slot="allies"][data-slot-role="midlane"]').focus();
    await page.evaluate(() => requestRedraw(true));
    const slot = await page.evaluate(() => ({slot: document.activeElement?.dataset?.slot || null, role: document.activeElement?.dataset?.slotRole || null}));
    const hero = await page.evaluate(() => {
      S.role = 'jungle'; companionPrefs.homeQuery = ''; changeRoute('meta'); document.querySelector('#mobile-all-heroes[aria-expanded="false"]')?.click();
      const inTop = [...document.querySelectorAll('#main section')].find(x => /Top five/.test(x.querySelector('h2')?.innerText || ''))?.querySelector('[data-hero]');
      const copy = inTop && [...document.querySelectorAll('#mobile-all-list [data-hero]')].find(b => b.dataset.hero === inTop.dataset.hero);
      copy?.focus(); requestRedraw(true);
      const a = document.activeElement;
      return {hero: copy?.dataset.hero || null, inList: !!a?.closest('#mobile-all-list'), inTopFive: !!a?.closest('section') && !a.closest('#mobile-all-list') && !!a.dataset?.hero};
    });
    const moved = await page.evaluate(() => {
      const top = [...document.querySelectorAll('#main section')].find(x => /Top five/.test(x.querySelector('h2')?.innerText || ''))?.querySelector('[data-hero]');
      const hero = top?.dataset.hero, copy = [...document.querySelectorAll('#mobile-all-list [data-hero]')].find(b => b.dataset.hero === hero);
      copy?.focus();
      const original = E.performance; E.performance = p => { const r = original(p); return p.slug === hero && p.role === 'jungle' && r ? {...r, played: 50} : r; };
      try { requestRedraw(true); const a = document.activeElement; return {hero, focused: a?.dataset?.hero || a?.tagName, inList: !!a?.closest('#mobile-all-list')}; }
      finally { E.performance = original; }
    });
    verdict('P13', !(slot.slot === 'allies' && slot.role === 'midlane') || !hero.hero || !hero.inList || hero.inTopFive || !(moved.focused === moved.hero && moved.inList), {slot, hero, moved});
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
  async P14(browser) {
    // When only the search options change while a search runs, the discarded result names the options, not the picks.
    const {context, page} = await session(browser, desktop);
    await reset(page, 5);
    await page.evaluate(() => changeRoute('planner'));
    await page.locator('#generate').click();
    await page.waitForFunction(() => !!search.pending, null, {timeout: 30000});
    await page.evaluate(() => { const s = document.querySelector('#comp-sort'); s.value = [...s.options].find(o => o.value !== s.value).value; s.dispatchEvent(new Event('change', {bubbles: true})); });
    await page.waitForFunction(() => !search.pending && !document.querySelector('#generate')?.disabled, null, {timeout: 180000});
    const notice = await page.evaluate(() => (document.querySelector('#compositions')?.innerText || '').split('\n')[0]);
    verdict('P14', !/search options/i.test(notice) || /picks/i.test(notice), {notice});
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
    verdict('I1', !requested.includes(name(entry.projection.core.url)) || requested.includes(name(entry.url)) || requested.some(r => /-(?:hero-[a-z0-9-]+|shared)-[a-f0-9]{64}\.json$/.test(r)) || entry.projection.core.bytes > fullBytes * 0.45, seen);
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
    await page.route('**/bundles/gold-shared-*.json', route => route.abort());
    await page.evaluate(() => changeRoute('data'));
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading') && /could not be loaded/.test(document.querySelector('#main').innerText), null, {timeout: 30000}).catch(() => {});
    const failed = await page.evaluate(() => ({named: /could not be loaded/.test(document.querySelector('#main').innerText), summaryShown: !B.definition_review || /Official description review/.test(document.querySelector('#main').innerText)}));
    await page.unroute('**/bundles/gold-shared-*.json');
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route('**/bundles/gold-shared-*.json', async route => { await held; await route.continue(); });
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
    await page.route('**/bundles/gold-shared-*.json', route => route.abort());
    await page.evaluate(key => showCatalog('items', key), item);
    await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
    const failed = await page.evaluate(() => !!document.querySelector('#detail-body .annex-failed'));
    await page.unroute('**/bundles/gold-shared-*.json');
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
    await page.route('**/bundles/gold-shared-*.json', route => route.fulfill({status: 404, body: 'Not found'}));
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
  async V2(browser) {
    // The build coach describes the evidence for THIS hero and role: Steel jungle has no role sample, so it must not read
    // "Statistics current" (site refresh health), while Steel offlane, which has a current sample, says so.
    const {context, page} = await clockSession(browser, desktop);
    await page.evaluate(() => { openHero('steel', 'jungle'); S.heroTab = 'builds'; render(); });
    await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
    const seen = await page.evaluate(() => {
      // Pred.gg retained (as on the live site since 19 September): rankings fall back to Statz, which has no Steel jungle sample.
      for (const k of ['pred_scoped', 'pred_game_data']) if (B.sources[k]) B.sources[k] = {...B.sources[k], status: 'retained'};
      if (B.scoped_statistics) B.scoped_statistics.status = 'retained';
      if (B.pred_game_data) B.pred_game_data.status = 'retained';
      E = MetaEngine.create(B); render();
      const coach = document.querySelector('#main .coach-date summary')?.textContent || '';
      const setup = {policy: E.performancePolicy().source, jungle_sample: !!E.performance({slug: 'steel', role: 'jungle'})};
      openHero('steel', 'offlane'); S.heroTab = 'builds'; render();
      return {setup, jungle: coach, offlane: document.querySelector('#main .coach-date summary')?.textContent || ''};
    });
    assert.equal(seen.setup.policy, 'statz', 'probe setup: retained Pred.gg leaves Statz as the ranking source');
    assert.equal(seen.setup.jungle_sample, false, 'probe setup: Steel jungle has no Statz sample');
    verdict('V2', /Statistics current/i.test(seen.jungle) || !/No Statz Gold\+ jungle sample/i.test(seen.jungle) || !/Statz offlane sample current/i.test(seen.offlane), seen);
    await context.close();
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
      await context.addInitScript(large => { localStorage.setItem('predecessor-companion-v1', JSON.stringify({installSeen: true, large})); }, large);
      await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
      const problems = [];
      // 'meta' is the phone Meta page (its own role strip) and 'live-picker' is the hero picker dialog; both use
      // .role-choices.compact, which 2.28.0 left scrolling sideways (found on the live site after that release).
      for (const route of ['hero', 'builds', 'planner', 'meta', 'live-picker']) {
        const found = await page.evaluate(route => {
          if (route === 'hero') openHero('steel', 'jungle');
          else if (route === 'live-picker') { changeRoute('live'); showLivePicker(E.roles(Object.keys(B.heroes)[0])[0], true); }
          else changeRoute(route);
          const out = [], scope = route === 'live-picker' ? document.querySelector('#detail') : document.querySelector('#main');
          const lists = [...scope.querySelectorAll('[role=tablist]'), ...(scope.querySelector('[role=tablist]') ? [] : scope.querySelectorAll('.tabs, .role-choices.compact'))];
          if (!lists.length) out.push('no tab strip found');
          if ((route === 'meta' || route === 'live-picker') && !scope.querySelector('.role-choices.compact')) out.push('role strip not found');
          for (const list of lists) {
            const name = list.getAttribute('aria-label') || list.className;
            if (list.scrollHeight > list.clientHeight) out.push(name + ': vertical ' + list.scrollHeight + '>' + list.clientHeight);
            if (list.scrollWidth > list.clientWidth) out.push(name + ': horizontal ' + list.scrollWidth + '>' + list.clientWidth);
            const tabs = list.querySelectorAll('[role=tab]').length ? list.querySelectorAll('[role=tab]') : list.querySelectorAll('button');
            for (const tab of tabs) { const r = tab.getBoundingClientRect(); if (r.height < 44 || r.right > innerWidth + 1 || r.left < -1) out.push(name + ': tab "' + tab.textContent.trim() + '" ' + Math.round(r.left) + '-' + Math.round(r.right) + ' h' + Math.round(r.height)); }
          }
          if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page overflows ' + document.documentElement.scrollWidth + '>' + innerWidth);
          if (route === 'live-picker') { document.querySelector('#detail')?.close(); changeRoute('meta'); }
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
      await context.addInitScript(large => { localStorage.setItem('predecessor-companion-v1', JSON.stringify({installSeen: true, large})); }, large);
      await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
      await page.evaluate(() => openHero('steel', 'jungle'));
      await page.waitForFunction(() => !document.querySelector('#main .annex-loading'), null, {timeout: 60000}).catch(() => {});
      seen[width + (large ? ' large' : '')] = await page.evaluate(() => {
        const original = E.metaReview;
        E.metaReview = (s, r) => ({...(original(s, r) || {tier: 'A', reviewed_tier: 'A'}), active: false, status: 'Retained sample; refresh required to reassess this tier'});
        render();
        const head = document.querySelector('.mobile-hero-head'), button = head?.querySelector('[data-meta-decision]'), row = button?.parentElement;
        if (!head || !button) return {missing: true};
        const split = [];
        for (const node of [...button.querySelectorAll('*'), button].flatMap(el => [...el.childNodes].filter(n => n.nodeType === 3))) {
          const text = node.textContent; let i = 0;
          for (const word of text.split(/(\s+)/)) { if (word.trim()) { const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + word.length); const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))); if (lines.size > 1) split.push(word); } i += word.length; }
        }
        return {row_width: Math.round(row.getBoundingClientRect().width), head_width: Math.round(head.getBoundingClientRect().width), split};
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
    await page.route('**/bundles/gold-shared-*.json', route => route.abort());
    const opened = await count();
    const dialogEarly = await page.evaluate(key => { showCatalog('items', key); return {waiting: !!document.querySelector('#detail-body .annex-loading'), live: auditLivePlaceholders()}; }, item);
    await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
    await page.waitForTimeout(700);
    const dialogFailed = await announced(opened);
    await page.addScriptTag({path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js')});
    const axeViolations = await page.evaluate(async () => (await axe.run(document.querySelector('#detail'), {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa']}})).violations.flatMap(v => v.nodes.map(n => v.id + ' ' + n.target.join(' '))).slice(0, 5));
    // A retry (the connection returning) brings it after a noticeable wait.
    await page.unroute('**/bundles/gold-shared-*.json');
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route('**/bundles/gold-shared-*.json', async route => { await held; await route.continue(); });
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
      await page.route('**/bundles/gold-shared-*.json', route => route.abort());
      await page.evaluate(key => showCatalog('items', key), items[0]);
      await page.waitForFunction(() => !!document.querySelector('#detail-body .annex-failed'), null, {timeout: 30000}).catch(() => {});
      const key = await page.evaluate(items => items.find(key => { showCatalog('items', key); return [...document.querySelectorAll('#detail-body a[href], #detail-body summary, #detail-body button')].some(el => !el.closest('[data-annex]')); }) || null, items);
      assert.ok(key, 'probe setup: a catalog dialog with a control outside its evidence section');
      await page.locator('#close-detail').focus();
      await page.keyboard.press('Tab');
      await page.unroute('**/bundles/gold-shared-*.json');
    };
    const {context, page} = await session(browser, desktop);
    const items = await evidenceItems(context);
    await failedDialog(page, items);
    const start = await focused(page);
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route('**/bundles/gold-shared-*.json', async route => { await held; await route.continue(); });
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

const CATEGORY_WORDS = {
  reviewed: /reviewed/i,
  calculated: /calculated/i,
  observed: /observed choice|source playstyle/i,
  substitution: /substitut|replaces|answers/i,
  owned: /owned|you entered/i
};

/* Open a hero with a reviewed plan, every disclosure expanded, and read back the advice
   the PAGE built - not a fresh call with different inputs, which would compare a rendered
   slot against a category computed from an enemy the page never saw. */
async function heroBuild(page, slug = 'steel', role = 'jungle') {
  return page.evaluate(([s, r]) => {
    S.role = r; openHero(s, r);
    document.querySelectorAll('#main details').forEach(d => { d.open = true; });
    const engine = adviceFor({slug: s, role: r});
    return {
      engine: {
        planKind: engine.plan.kind, manual: !!engine.plan.manual, caution: engine.plan.caution || '',
        slots: engine.slots.map(x => ({name: x.name, kind: x.kind, label: x.label,
          measured: x.measured ? {played: x.measured.played, wr: x.measured.wr, supports: !!x.measured.supports_current_fit,
                                  at: x.measured.fetched_at, source: x.measured.source || x.measured.label} : null})),
        swaps: engine.swaps, unmet: engine.unmet
      },
      rendered: [...document.querySelectorAll('#main .build-path li')].map(li => ({
        text: li.innerText.replace(/\s+/g, ' ').trim(),
        tags: [...li.querySelectorAll('.tag')].map(t => ({cls: t.className, text: t.textContent.trim()}))
      }))
    };
  }, [slug, role]);
}

probes.X1 = async browser => {
  /* Every part of a build must name the category the engine gave it. Printing the
     engine's label as plain prose leaves the build outside the four-class system that
     the rest of the product is held to. */
  const {context, page} = await session(browser, desktop);
  const seen = await heroBuild(page);
  const slots = seen.rendered.slice(0, seen.engine.slots.length);
  const missing = slots.filter(s => !s.tags.length).length;
  const mismatched = [];
  seen.engine.slots.forEach((e, i) => {
    const row = slots[i];
    if (!row || !row.tags.length) return;
    const text = row.tags.map(t => t.text).join(' ');
    const want = e.kind === 'owned' ? 'owned' : e.kind === 'need' ? 'substitution'
      : seen.engine.manual ? 'observed' : seen.engine.planKind === 'reviewed' ? 'reviewed' : 'calculated';
    if (!CATEGORY_WORDS[want].test(text)) mismatched.push({slot: e.name, kind: e.kind, want, got: text});
  });
  await context.close();
  verdict('X1', missing > 0 || mismatched.length > 0,
    {slots: slots.length, without_category: missing, mismatched, engine_kinds: seen.engine.slots.map(s => s.kind)});
};

probes.X2 = async browser => {
  /* A rate attached to a slot is supporting evidence, and evidence carries its sample,
     its date and its source. Where the engine has already decided the sample does not
     support the current fit, the screen says so rather than printing a bare percentage. */
  const {context, page} = await session(browser, desktop);
  const seen = await heroBuild(page);
  const withStat = seen.engine.slots.map((e, i) => ({e, row: seen.rendered[i]})).filter(x => x.e.measured);
  const problems = [];
  for (const {e, row} of withStat) {
    const text = row ? row.text : '';
    if (!/\d/.test(text) || !/games|played/i.test(text)) { problems.push({slot: e.name, why: 'no sample shown', played: e.measured.played}); continue; }
    // the product's own dayDate() writes "September 14"; accept either order, and a year
    if (!/\b(19|20)\d\d\b|\b\d{1,2} \w{3,}\b|\b\w{3,} \d{1,2}\b/.test(text)) problems.push({slot: e.name, why: 'no collection date', text: text.slice(0, 90)});
    // Stage 3a replaced the blanket phrase with the engine's own reason. Every one of
    // them says "inspection only"; the fallback also says it does not support automatic
    // selection. The probe follows the product's vocabulary, deliberately changed.
    if (!e.measured.supports && !/inspection only|does not support|not eligible/i.test(text))
      problems.push({slot: e.name, why: 'engine says it does not support the fit, screen does not', played: e.measured.played, text: text.slice(0, 90)});
  }
  await context.close();
  verdict('X2', withStat.length === 0 || problems.length > 0,
    {slots_with_a_statistic: withStat.length, problems: problems.slice(0, 6),
     engine_support_flags: withStat.map(x => x.e.name + ':' + x.e.measured.played + (x.e.measured.supports ? ' supports' : ' does not support'))});
};

probes.X3 = async browser => {
  /* The rule that matters most: a supporting statistic never changes a category. The
     same plan, rendered with and without its samples, must carry the same categories. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    const read = () => [...document.querySelectorAll('#main .build-path li')]
      .map(li => [...li.querySelectorAll('.tag')].map(t => t.textContent.trim()).join('|'));
    S.role = 'jungle'; openHero('steel', 'jungle');
    document.querySelectorAll('#main details').forEach(d => { d.open = true; });
    const withStats = read();
    // strip every purchase-position sample from the bundle and draw the same hero again
    const saved = B;
    let withoutStats = [];
    try {
      const stripped = JSON.parse(JSON.stringify(B));
      for (const h of Object.values(stripped.heroes || {}))
        for (const r of Object.values(h.roles || {})) { delete r.item_evidence; delete r.items; }
      stripped.item_evidence = {};
      B = stripped; E = MetaEngine.create(B);
      openHero('steel', 'jungle');
      document.querySelectorAll('#main details').forEach(d => { d.open = true; });
      withoutStats = read();
    } finally { B = saved; E = MetaEngine.create(B); render(); }
    return {withStats, withoutStats};
  });
  await context.close();
  const n = Math.min(seen.withStats.length, seen.withoutStats.length);
  const changed = [];
  for (let i = 0; i < n; i++) if (seen.withStats[i] !== seen.withoutStats[i]) changed.push({slot: i + 1, with: seen.withStats[i], without: seen.withoutStats[i]});
  verdict('X3', n === 0 || changed.length > 0, {compared: n, changed, ...seen});
};

probes.X4 = async browser => {
  /* GUARD: a substitution says what it replaced and why, a need the engine could not
     answer is named, and the whole six is never offered as one observed loadout. */
  const {context, page} = await session(browser, desktop);
  const seen = await page.evaluate(() => {
    // An enemy is what makes the engine substitute at all, so the guard needs one.
    S.me = 'steel'; S.locks = [{slug: 'steel', role: 'jungle'}]; S.role = 'jungle';
    S.enemies = [{slug: 'countess', role: 'midlane'}];
    changeRoute('live');
    document.querySelectorAll('#main details').forEach(d => { d.open = true; });
    const text = document.querySelector('#main').innerText.replace(/\s+/g, ' ');
    const engine = adviceFor({slug: 'steel', role: 'jungle'});
    return {
      swaps: engine.swaps.map(s => ({...s, shown: text.includes(s.from) && text.includes(s.to)})),
      unmet: engine.unmet.map(id => ({id, shown: text.toLowerCase().includes(String(id).replace(/_/g, ' ').toLowerCase())})),
      caution_shown: !!engine.plan.caution && text.includes(engine.plan.caution.slice(0, 40)),
      caution: (engine.plan.caution || '').slice(0, 80)
    };
  });
  await context.close();
  verdict('X4', seen.swaps.some(s => !s.shown) || seen.unmet.some(u => !u.shown) || !seen.caution_shown, seen);
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
  const {context, page} = await session(browser, desktop);
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

probes.Y4 = async browser => {
  /* The sticky "Next purchase" summary must not sit on top of the build path it summarises.
     Content that scrolls under permanent chrome is content the reader cannot have. */
  const seen = {};
  for (const [w, h, mob] of [[390, 844, true], [1440, 900, false]]) {
    const {context, page} = await session(browser, {viewport: {width: w, height: h}, isMobile: mob, hasTouch: mob});
    await page.evaluate(() => {
      S.me = 'steel'; S.locks = [{slug: 'steel', role: 'jungle'}];
      S.enemies = [{slug: 'countess', role: 'midlane'}]; S.role = 'jungle';
      changeRoute('live');
    });
    await page.waitForTimeout(300);
    seen[w + 'x' + h] = await page.evaluate(async () => {
      const next = document.querySelector('.coach-next'), path = document.querySelector('.coach-path');
      if (!next || !path) return {missing: true};
      const sticky = ['sticky', 'fixed'].includes(getComputedStyle(next).position);
      const hidden = [];
      for (const li of path.children) {
        // 'start' is what the browser does for an anchor, a fragment link and a focused
        // control. Centring an element hides the defect, because the summary sits at the top.
        li.scrollIntoView({block: 'start'});
        await new Promise(r => setTimeout(r, 40));
        if (!['sticky', 'fixed'].includes(getComputedStyle(next).position)) continue;
        const n = next.getBoundingClientRect(), r = li.getBoundingClientRect();
        const overlap = Math.min(n.bottom, r.bottom) - Math.max(n.top, r.top);
        const across = Math.min(n.right, r.right) - Math.max(n.left, r.left) > 2;
        if (overlap > 4 && across) hidden.push({item: li.innerText.replace(/\s+/g, ' ').slice(0, 26), overlap: Math.round(overlap)});
      }
      return {sticky, hidden: hidden.length, examples: hidden.slice(0, 3)};
    });
    await context.close();
  }
  verdict('Y4', Object.values(seen).some(v => v.missing || v.hidden > 0), seen);
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
    || h.outside > 3                                                   // the tail is not tucked away
    || (h.ordered > 3 && (!h.tail || h.tail.open || !h.tail.summary.includes(String(h.tail.inside)) || h.tail.inside < h.ordered - 3))));
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
    for(const [route,destination] of [['meta','meta'],['builds','reference'],['planner','plan'],['draft','plan'],['live','plan'],['library','reference'],['guidance','reference'],['changes','reference'],['data','sources'],['more','sources'],['hero','meta']]){
      await page.evaluate(route=>{if(route==='hero')openHero('steel','jungle');else changeRoute(route);},route);
      seen.push(await page.evaluate(({route,destination})=>{
        const nav=document.querySelector(innerWidth<=700?'#mobile-navigation':'#navigation');
        return {route,destination,labels:[...nav.querySelectorAll('[data-destination]')].map(b=>b.textContent.trim()),current:[...document.querySelectorAll('[aria-current="page"]')].map(b=>b.dataset.destination),headings:document.querySelectorAll('#main h1').length,overflow:document.documentElement.scrollWidth>innerWidth+1};
      },{route,destination}));
    }
    await context.close();
  }
  verdict('N1',seen.some(s=>s.labels.join('|')!=='Meta|Plan|Reference|Sources'||s.current.length!==1||s.current[0]!==s.destination||s.headings!==1||s.overflow),seen);
};
probes.N2 = async browser => {
  const {context,page}=await session(browser,phone),seen=[];
  for(const [hash,route] of [['view=meta','meta'],['view=builds','builds'],['view=planner','planner'],['view=draft','draft'],['view=live','live'],['view=library','library'],['view=guidance','guidance'],['view=changes','changes'],['view=data','data'],['view=plan&stage=draft&bracket=gold','draft'],['view=reference&section=items&bracket=gold','library'],['view=sources&bracket=gold','data']]){
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
  const {context,page}=await session(browser,phone);
  await reset(page);await page.evaluate(()=>{S.enemies=[{slug:'gideon',role:'midlane'}];S.bans=['muriel'];save();changeRoute('planner');});
  const picks=await page.evaluate(()=>JSON.stringify([S.locks,S.enemies,S.bans]));
  const controls=await page.locator('[data-plan-stage]').count();
  if(controls!==3){await context.close();verdict('N4',true,{controls});return;}
  await page.locator('[data-plan-stage="draft"]').click();await page.locator('[data-plan-stage="live"]').click();
  await page.goBack();await page.waitForTimeout(250);const back=await page.evaluate(()=>S.route);
  await page.goForward();await page.waitForTimeout(250);const forward=await page.evaluate(()=>S.route);
  await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);
  const after=await page.evaluate(()=>({route:S.route,picks:JSON.stringify([S.locks,S.enemies,S.bans])}));
  await context.close();verdict('N4',back!=='draft'||forward!=='live'||after.route!=='live'||after.picks!==picks,{back,forward,after});
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
  await context.close();verdict('N6',seen.loaded!=='gold'||seen.selected!=='gold'||seen.route!=='draft'||seen.requested!==null,seen);
};
probes.N5 = async browser => {
  const seen=[];
  for(const [hash,route,role] of [['view=meta&role=support&bracket=gold','meta','support'],['view=plan&stage=live&bracket=gold','live'],['view=reference&section=playbook&bracket=gold','builds'],['view=reference&section=guidance&bracket=gold','guidance'],['view=reference&section=changes&bracket=gold','changes'],['view=sources&bracket=gold','data']]){
    const context=await browser.newContext({serviceWorkers:'block',...phone}),page=await context.newPage();
    await page.goto(url+'#'+hash);await page.waitForFunction(()=>!!B&&!latestStatus.busy);
    seen.push({hash,route,role,actual:await page.evaluate(()=>({route:S.route,role:S.role,band:B.bracket.segment}))});await context.close();
  }
  verdict('N5',seen.some(s=>s.actual.route!==s.route||(s.role&&s.actual.role!==s.role)||s.actual.band!=='gold'),seen);
};

probes.PL1 = async browser => {
 const {context,page}=await session(browser,phone),seen=[];
 await reset(page,3,{me:'steel',enemies:[{slug:'gideon',role:'midlane'}],bans:['muriel']});
 for(const route of ['planner','draft','live']){
  await page.evaluate(route=>changeRoute(route),route);
  seen.push(await page.evaluate(()=>{const e=document.querySelector('.plan-roster');return {route:S.route,count:document.querySelectorAll('.plan-roster').length,text:e?.textContent,edit:!!e?.querySelector('[data-edit-roster]'),width:e?.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth+1};}));
 }
 await context.close();verdict('PL1',seen.some(s=>s.count!==1||!s.edit||!/Steel/.test(s.text)||!/Gideon/.test(s.text)||!/Muriel/.test(s.text)||s.overflow),seen);
};
probes.PL2 = async browser => {
 const {context,page}=await session(browser,phone);
 await reset(page,3,{me:'steel'});await page.evaluate(()=>changeRoute('planner'));
 if(!await page.locator('[data-edit-roster]').count()){await context.close();verdict('PL2',true,{missingEditor:true});return;}
 await page.locator('[data-edit-roster]').click();
 await page.locator('#detail [data-plan-side="allies"][data-plan-role="midlane"]').selectOption('gideon');
 const focus=await page.evaluate(()=>document.activeElement?.dataset.planRole);
 await page.locator('#detail [data-plan-ban]').selectOption('muriel');
 await page.keyboard.press('Escape');
 const returned=await page.evaluate(()=>document.activeElement?.hasAttribute('data-edit-roster'));
 await page.locator('[data-plan-stage="draft"]').click();await page.locator('[data-plan-stage="live"]').click();
 await page.reload();await page.waitForFunction(()=>!!B&&!latestStatus.busy);
 const after=await page.evaluate(()=>({route:S.route,locks:S.locks,bans:S.bans,me:S.me}));
 await context.close();verdict('PL2',focus!=='midlane'||!returned||after.route!=='live'||after.me!=='steel'||!after.bans.includes('muriel')||!after.locks.some(p=>p.slug==='gideon'&&p.role==='midlane'),{focus,returned,after});
};
probes.PL3 = async browser => {
 const {context,page}=await session(browser,phone);
 const seen=await page.evaluate(()=>{
  Object.assign(S,{locks:[{slug:'steel',role:'jungle'}],enemies:[],bans:[],me:'steel'});save();changeRoute('planner');
  const before=JSON.stringify(S.locks),replacement=Object.keys(E.heroes).find(s=>s!=='steel'&&E.roles(s).includes('jungle'));
  setPick('allies','jungle',replacement);const protectedMe=JSON.stringify(S.locks)===before;
  S.locks=[{slug:'steel',role:'jungle'}];const bad=Object.keys(E.heroes).find(s=>!E.roles(s).includes('carry'));
  setPick('allies','carry',bad);const unsupported=JSON.stringify(S.locks)===before;
  S.locks=[{slug:'steel',role:'jungle'}];setPick('enemies','midlane','steel');
  return {protectedMe,unsupported,duplicate:S.enemies.length===0};
 });
 await context.close();verdict('PL3',!seen.protectedMe||!seen.unsupported||!seen.duplicate,seen);
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
