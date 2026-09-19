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
    // this collection (a hotfix edits the article; the version number stays the same).
    const context = await browser.newContext({serviceWorkers: 'block', ...desktop}), page = await context.newPage();
    await page.route('**/manifest.json', async route => { const response = await route.fetch(), manifest = await response.json(); manifest.patch_check = {...manifest.patch_check, signature: 'f'.repeat(64)}; await route.fulfill({response, json: manifest}); });
    await page.goto(url); await page.waitForFunction(() => !!B && !latestStatus.busy, null, {timeout: 120000});
    const seen = await page.evaluate(() => { changeRoute('data'); return {reviewed: B.definition_review?.status || null, guidance: B.guidance?.status || null, status: definitionReviewStatus(), shown_current: /reviewed for current patch · v/i.test(document.querySelector('#main').innerText)}; });
    assert.equal(seen.reviewed, 'reviewed for current patch', 'probe setup: the seed carries a current definition review');
    verdict('P7', !/pending/.test(seen.status) || seen.shown_current, seen);
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
