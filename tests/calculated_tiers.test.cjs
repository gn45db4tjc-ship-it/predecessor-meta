'use strict';
// Freshness Phase 3 (2.45.0): a calculated tier for every hero and role in every rank, from that rank's own current
// sample (docs/CALCULATED-TIERS.md). Labeled "Calculated", never reviewed; never written into meta_review.
// Synthetic observations; this fixture never enters a published bundle.
const test = require('node:test'), assert = require('node:assert/strict'), M = require('../engine.js');
const NOW = Date.now(), recent = new Date(NOW - 2 * 3600000).toISOString();
function bundle(rows, {bracket = 'silver', label = 'Silver+', source = 'pred', fetched = recent} = {}) {
  const heroes = Object.fromEntries(rows.map(r => [r.slug, {display_name: r.slug, roles_order: ['jungle'], roles: source === 'statz'
    ? {jungle: {status: 'ok', winRate: r.winRate, playedGames: r.matches, tier: 'B', url: 'https://statz.gg/x'}} : {}}]));
  const b = {schema: 3, generated_at: recent, patch: '1.17', bracket: {segment: bracket, label}, heroes,
    official: {status: 'verified', live: {version: '1.17'}},
    sources: {pred_scoped: {status: 'ok', fetched_at: fetched}, statz_tierlist: {status: 'ok', fetched_at: fetched}, statz_hero_pages: {status: 'ok', fetched_at: fetched}},
    guidance: {meta_review: {bracket: 'gold', bracket_label: 'Gold+', patch: '1.17', entries: [{slug: 'strong', role: 'jungle', tier: 'C'}]}}};
  if (source === 'pred') b.scoped_statistics = {status: 'ok', patch: '1.17', bracket_label: label, gameModes: ['RANKED'],
    roles: {jungle: {rows: rows.map(r => ({...r, role: 'jungle', fetched_at: fetched, source: 'Pred.gg'}))}}};
  return b;
}
const rows = [
  {slug: 'strong', winRate: 58, matches: 4000},     // far above the role
  {slug: 'good', winRate: 52.5, matches: 6000},     // clearly but modestly above
  {slug: 'even', winRate: 50, matches: 3000},       // indistinguishable from the role
  {slug: 'weak', winRate: 47.5, matches: 6000},     // clearly below
  {slug: 'bad', winRate: 42, matches: 4000},        // far below
  {slug: 'lucky', winRate: 70, matches: 120},       // a thin sample: high rate, wide interval
  {slug: 'tiny', winRate: 80, matches: 40}          // under 100 games
];

test('tiers follow each hero against its role baseline, through the sample interval', () => {
  const E = M.create(bundle(rows)), t = s => E.calculatedTier(s, 'jungle');
  assert.deepEqual(['strong', 'good', 'even', 'weak', 'bad'].map(s => t(s).tier), ['S', 'A', 'B', 'C', 'D']);
  for (const s of ['strong', 'good', 'even', 'weak', 'bad']) {
    const r = t(s);
    assert.equal(r.kind, 'calculated'); assert.equal(r.label, 'Calculated tier'); assert.equal(r.rank, 'Silver+');
    assert.equal(r.source, 'Pred.gg'); assert.ok(Number.isInteger(r.played) && r.played >= 100); assert.equal(r.fetched_at, recent);
    assert.equal(r.qualifier, null);
  }
});

test('a thin sample cannot produce an extreme tier, and under 100 games there is no tier', () => {
  const E = M.create(bundle(rows));
  assert.equal(E.calculatedTier('lucky', 'jungle').tier, 'A');   // 70% on 120 games is clearly above, but never S
  const tiny = E.calculatedTier('tiny', 'jungle');
  assert.equal(tiny.tier, null); assert.equal(tiny.status, 'Below 100 games'); assert.equal(tiny.played, 40);
  assert.equal(E.calculatedTier('nobody', 'jungle').tier, null);
});

test('each rank uses only its own sample (no pooling) and states its rank', () => {
  const silver = M.create(bundle(rows)), paragon = M.create(bundle(rows.map(r => ({...r, matches: Math.round(r.matches / 40)})), {bracket: 'paragon', label: 'Paragon+'}));
  assert.equal(silver.calculatedTier('strong', 'jungle').played, 4000);
  const p = paragon.calculatedTier('strong', 'jungle');
  assert.equal(p.rank, 'Paragon+'); assert.equal(p.played, 100); assert.notEqual(p.tier, 'S');   // a small rank stays cautious
});

test('a Statz fallback is labeled broader, and saved data is labeled not current', () => {
  const statz = M.create(bundle(rows, {source: 'statz'})).calculatedTier('strong', 'jungle');
  assert.equal(statz.source, 'Statz'); assert.equal(statz.qualifier, 'broader dataset, not current-patch');
  const old = new Date(NOW - 60 * 3600000).toISOString();
  const saved = M.create(bundle(rows, {fetched: old})).calculatedTier('strong', 'jungle');
  assert.equal(saved.qualifier, 'saved, not a current ranking');
});

test('unverified patch or missing statistics give no tier', () => {
  const b = bundle(rows); b.official.status = 'failed';
  assert.equal(M.create(b).calculatedTier('strong', 'jungle').tier, null);
  const none = bundle(rows); delete none.scoped_statistics; none.sources = {};
  assert.equal(M.create(none).calculatedTier('strong', 'jungle').tier, null);
});

test('calculated tiers never touch the reviewed grades', () => {
  const b = bundle(rows), before = JSON.stringify(b.guidance.meta_review);
  const E = M.create(b);
  E.calculatedTier('strong', 'jungle');
  assert.equal(JSON.stringify(b.guidance.meta_review), before);
  assert.equal(E.calculatedTier('strong', 'jungle').tier, 'S');     // the reviewed C for Gold+ is a different claim
  assert.notEqual(E.calculatedTier('strong', 'jungle').label, 'Reviewed');
});

test('a retained Pred.gg sample is never ranked as current', () => {
  // Retained Pred.gg with current Statz: the tier comes from Statz and says it is the broader dataset.
  const withStatz = bundle(rows, {source: 'statz'});
  withStatz.scoped_statistics = {...bundle(rows).scoped_statistics, status: 'retained'};
  withStatz.sources.pred_scoped.status = 'retained';
  const t = M.create(withStatz).calculatedTier('strong', 'jungle');
  assert.equal(t.source, 'Statz'); assert.equal(t.qualifier, 'broader dataset, not current-patch');
  // Retained Pred.gg and no other source: no tier at all.
  const alone = bundle(rows);
  alone.scoped_statistics.status = 'retained'; alone.sources.pred_scoped.status = 'retained';
  alone.sources.statz_tierlist.status = alone.sources.statz_hero_pages.status = 'failed';
  assert.equal(M.create(alone).calculatedTier('strong', 'jungle').tier, null);
});

test('all six ranks calculate from their own sample and name their own rank', () => {
  for (const [bracket, label] of [['bronze', 'Bronze+'], ['silver', 'Silver+'], ['gold', 'Gold+'], ['platinum', 'Platinum+'], ['diamond', 'Diamond+'], ['paragon', 'Paragon+']]) {
    const t = M.create(bundle(rows, {bracket, label})).calculatedTier('strong', 'jungle');
    assert.equal(t.rank, label); assert.equal(t.tier, 'S'); assert.equal(t.played, 4000);
  }
});
