'use strict';
/* The evidence-state contract (version 1). One definition of evidence age serves every route:
   saved advice stays usable with its original date, and statistics outside the aging window are
   labelled as saved, never as current rankings. Every number is a synthetic fixture. */
const test = require('node:test'), assert = require('node:assert/strict'), Meta = require('../engine.js');

const NOW = Date.parse('2026-09-18T12:00:00Z'), HOUR = 3600000;
const ago = hours => new Date(NOW - hours * HOUR).toISOString();
function bundle(fetched, changes = {}) {
  return {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {},
    heroes: {example: {slug: 'example', display_name: 'Synthetic fixture', roles_order: ['jungle'],
      roles: {jungle: {status: 'ok', tier: 'A', winRate: 52, pickRate: 5, playedGames: 400}}}},
    official: {status: 'verified', checked_at: ago(1), live: {version: '1.16.4'}},
    sources: {statz_tierlist: {status: 'ok', fetched_at: fetched}, statz_hero_pages: {status: 'ok', fetched_at: fetched},
      omeda_heroes: {status: 'ok', fetched_at: fetched}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', reviewed_at: ago(48), builds: []}, ...changes};
}
const state = (fetched, changes) => Meta.create(bundle(fetched, changes)).evidenceState({now: NOW});

for (const [hours, expected, current] of [[1, 'current', true], [30, 'current', true], [30.5, 'aging', true], [48, 'aging', true], [48.5, 'stale', false], [24 * 240, 'stale', false]])
  test('statistics fetched ' + hours + ' h ago are ' + expected, () => {
    const e = state(ago(hours));
    assert.equal(e.version, 1);
    assert.equal(e.statistics.state, expected);
    assert.equal(e.ranking_current, current);
    assert.equal(e.advice_mode, current ? 'current' : 'saved');
    assert.equal(e.statistics.fetched_at, ago(hours), 'the original fetch date is reported unchanged');
  });

test('a timestamp from the future is unavailable, within a five-minute clock tolerance', () => {
  assert.equal(state(new Date(NOW + 4 * 60000).toISOString()).statistics.state, 'current');
  const e = state(new Date(NOW + 2 * HOUR).toISOString());
  assert.equal(e.statistics.state, 'unavailable'); assert.equal(e.ranking_current, false);
});

test('an unreadable or missing date is unavailable, never current', () => {
  for (const value of ['not a date', null, undefined]) assert.equal(state(value).statistics.state, 'unavailable');
});

test('retained statistics are saved advice even when they are recent', () => {
  const b = bundle(ago(2)); b.sources.statz_hero_pages.status = 'retained';
  const engine = Meta.create(b);
  assert.equal(engine.sourceCurrency(b.sources.statz_hero_pages, NOW).state, 'retained');
  assert.equal(engine.evidenceState({now: NOW}).ranking_current, false);
});

test('withheld verification makes every recommendation saved advice and says why', () => {
  const e = state(ago(1), {recommendation_context: {status: 'withheld', reason: 'The latest official patch check failed.'}});
  assert.equal(e.verification.state, 'withheld'); assert.equal(e.advice_mode, 'saved'); assert.equal(e.ranking_current, false);
  assert.ok(e.limitations.includes('The latest official patch check failed.'));
});

test('guidance for a saved patch is dated advice, not a current review', () => {
  const e = state(ago(1), {guidance: {patch: '1.16.3', status: 'reviewed for saved patch; live check pending', builds: []}});
  assert.equal(e.guidance.state, 'saved'); assert.equal(e.advice_mode, 'saved');
  assert.ok(e.limitations.some(text => /dated advice for patch 1\.16\.3/.test(text)));
});

test('the policy reports currency without changing its source, label, note or date', () => {
  const engine = Meta.create(bundle(ago(240))), policy = engine.performancePolicy({now: NOW});
  assert.equal(policy.source, 'statz'); assert.equal(policy.currency, 'stale'); assert.equal(policy.saved, true);
  assert.equal(policy.fetched_at, ago(240)); assert.match(policy.label, /^Statz 1\.16/);
  const fresh = Meta.create(bundle(ago(1))).performancePolicy({now: NOW});
  assert.equal(fresh.currency, 'current'); assert.equal(fresh.saved, false); assert.equal(fresh.label, policy.label);
});

test('stale evidence never changes observations or their order', () => {
  const make = fetched => { const b = bundle(fetched); b.heroes.second = {slug: 'second', display_name: 'Second fixture', roles_order: ['jungle'], roles: {jungle: {status: 'ok', tier: 'B', winRate: 49, pickRate: 3, playedGames: 900}}}; return b; };
  const old = make(ago(240)), before = JSON.stringify(old), oldEngine = Meta.create(old), freshEngine = Meta.create(make(ago(1)));
  for (const slug of ['example', 'second']) {
    const a = oldEngine.performance({slug, role: 'jungle'}), b = freshEngine.performance({slug, role: 'jungle'});
    assert.equal(a.wr, b.wr); assert.equal(a.played, b.played); assert.equal(a.tier, b.tier);
  }
  oldEngine.evidenceState({now: NOW});
  assert.equal(JSON.stringify(old), before, 'the engine must never rewrite the bundle');
});

test('the tier summary explains why no editorial tier is active', () => {
  const retained = {status: 'retained', patch: '1.16.4', bracket_label: 'Gold+', gameModes: ['RANKED'], versions: ['x'],
    roles: {jungle: {rows: [{slug: 'example', winRate: 50, matches: 200, fetched_at: ago(240)}]}}};
  const review = {patch: '1.16.4', bracket: 'gold', bracket_label: 'Gold+', mode: 'RANKED', entries: [{slug: 'example', role: 'jungle', tier: 'A', evidence: {winRate: 50}}]};
  const engine = Meta.create(bundle(ago(1), {scoped_statistics: retained, guidance: {patch: '1.16.4', status: 'reviewed for current patch', meta_review: review, builds: []}}));
  const summary = engine.metaReviewSummary('jungle');
  assert.equal(summary.entries, 1); assert.equal(summary.active, 0);
  assert.match(summary.reason, /Retained sample/);
  assert.deepEqual(engine.metaReviewSummary('support'), {entries: 0, active: 0, reason: null});
});

test('no bundle at all is unavailable, not an error', () => {
  const e = Meta.create(null).evidenceState({now: NOW});
  assert.equal(e.statistics.state, 'unavailable'); assert.equal(e.verification.state, 'unavailable'); assert.equal(e.ranking_current, false);
});
