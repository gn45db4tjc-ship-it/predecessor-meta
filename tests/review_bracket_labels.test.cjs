'use strict';
// PRED-M6 (#221): the review-reference table under a plan's strategy review names each bracket with
// the same label as the rank picker and comparison (Bronze+ … Master+ Paragon+), never the raw id.
// Synthetic plan; this fixture never enters a published bundle.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SEED = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'public-seed-gold.json.gz'))));

function stubEl() {
  return {innerHTML: '', textContent: '', value: '', open: false, dataset: {},
    classList: {add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false},
    setAttribute: () => {}, removeAttribute: () => {}, getAttribute: () => null, hasAttribute: () => false,
    addEventListener: () => {}, close: () => {}, showModal: () => {}, focus: () => {},
    querySelector: () => stubEl(), querySelectorAll: () => []};
}
function loadUI(mode) {
  const els = new Map(), getEl = sel => { if (!els.has(sel)) els.set(sel, stubEl()); return els.get(sel); };
  const ctx = {INITIAL_BUNDLE: structuredClone(SEED), APP_CONFIG: {mode, revision: 1}, CSS: {escape: s => String(s)},
    Date, structuredClone, Intl, Math, Number, String, Array, Object, Set, Map, JSON, RegExp, Error, parseFloat, parseInt, isFinite, encodeURIComponent,
    innerWidth: 1440, innerHeight: 900, localStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}}, location: {hash: ''},
    addEventListener: () => {}, requestAnimationFrame: () => 0, matchMedia: () => ({matches: false, addEventListener: () => {}}),
    window: {addEventListener: () => {}, scrollTo: () => {}, matchMedia: () => ({matches: false, addEventListener: () => {}})},
    document: {visibilityState: 'hidden', documentElement: stubEl(), body: stubEl(), querySelector: getEl, querySelectorAll: () => [], addEventListener: () => {}},
    fetch: async () => ({ok: false}), setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}};
  vm.createContext(ctx);
  for (const f of ['engine.js', 'recommendation_view.js', 'companion_state.js', 'skill_guide.js']) vm.runInContext(read(f), ctx);
  const ui = read('ui.js');
  assert.ok(ui.includes('// START CLIENT'));
  vm.runInContext(ui.replace('// START CLIENT', 'globalThis.__planReviewHTML=p=>planReviewHTML(p);/*') + '*/', ctx);
  // The phone and rank views load after ui.js; they must not bring back the raw id.
  vm.runInContext(read('mobile.js'), ctx);
  vm.runInContext(read('companion_simple.js'), ctx);
  if (mode === 'static') vm.runInContext(read('rank_view.js'), ctx);
  return ctx.__planReviewHTML;
}

const SEVEN = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'paragon'];
const LABELS = ['Bronze+', 'Silver+', 'Gold+', 'Platinum+', 'Diamond+', 'Master+', 'Paragon+'];
function plan(brackets) {
  return {maintenance_review: {result: 'checked and retained', reviewed_at: '2026-11-08T12:00:00Z', reason: 'Synthetic reason.', scope: 'Synthetic scope.',
    rank_note: 'Synthetic note.', rank_samples: brackets.map((bracket, i) => i === 6
      ? {bracket, status: 'unavailable'}
      : {bracket, status: 'ok', winRate: 50, matches: 200, wonGames: 100, url: 'https://pred.gg/heroes/fixture', fetched_at: '2026-11-08T11:00:00Z'})}};
}
const bracketCells = html => [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map(m => m[1]);

for (const mode of ['local', 'static']) {
  test(`${mode}: a seven-reference review table reads Bronze+ … Master+ Paragon+`, () => {
    const html = loadUI(mode)(plan(SEVEN));
    assert.match(html, /Seven bracket references at review/);
    assert.deepEqual(bracketCells(html), LABELS);
    assert.doesNotMatch(html, /<td>(bronze|silver|gold|platinum|diamond|master|paragon)\+<\/td>/);
  });

  test(`${mode}: a six-reference table (no Master) keeps the same labels`, () => {
    const six = SEVEN.filter(b => b !== 'master');
    const html = loadUI(mode)(plan(six));
    assert.match(html, /Six bracket references at review/);
    assert.deepEqual(bracketCells(html), LABELS.filter(l => l !== 'Master+'));
  });
}
