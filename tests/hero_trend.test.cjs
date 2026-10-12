'use strict';
/* 2.54.0: a hero's Pred.gg win rate at the last pull of each day this week (scoped_changes.trend). Days under 100 games
   are left out, two days are needed, and a malformed series shows nothing. Synthetic fixtures. */
const test = require('node:test'), assert = require('node:assert/strict');
const Meta = require('../engine.js');

const points = ['2026-10-06T23:03:00Z', '2026-10-08T23:03:00Z', '2026-10-10T23:03:00Z', '2026-10-11T20:03:00Z'];
function bundle(series) {
  return {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {},
    heroes: {kira: {slug: 'kira', display_name: 'Kira', roles_order: ['carry'], roles: {}}},
    official: {status: 'verified', live: {version: '1.17'}}, sources: {},
    scoped_changes: {status: 'ok', trend: {window_days: 7, basis: 'patch_to_date', patch: '1.17', bracket_label: 'Gold+', points,
      series: {carry: {kira: series}}}}};
}

test('the trend runs from the first to the last day with 100+ games', () => {
  const t = Meta.create(bundle([[48.5, 80], [49.2, 400], [50.1, 900], [51.0, 1200]])).heroTrend('kira', 'carry');
  assert.equal(t.points.length, 3, 'the day under 100 games is left out');
  assert.deepEqual(t.first, {fetched_at: points[1], wr: 49.2, played: 400});
  assert.deepEqual(t.last, {fetched_at: points[3], wr: 51.0, played: 1200});
  assert.ok(Math.abs(t.delta - 1.8) < 1e-9);
  assert.equal(t.patch, '1.17');
});

test('one usable day, a missing hero or a malformed series shows nothing', () => {
  assert.equal(Meta.create(bundle([null, null, [50, 80], [51, 400]])).heroTrend('kira', 'carry'), null);
  assert.equal(Meta.create(bundle([[50, 400], [51, 500]])).heroTrend('kira', 'carry'), null, 'length differs from the points');
  assert.equal(Meta.create(bundle([[50, 400], ['x', 500], [51, 500.5], [52, 600]])).heroTrend('kira', 'carry').points.length, 2);
  assert.equal(Meta.create(bundle([[50, 400], [51, 500], [52, 600], [53, 700]])).heroTrend('kira', 'jungle'), null);
  const b = bundle([]); delete b.scoped_changes.trend;
  assert.equal(Meta.create(b).heroTrend('kira', 'carry'), null, 'a bundle collected before 2.54.0');
});
