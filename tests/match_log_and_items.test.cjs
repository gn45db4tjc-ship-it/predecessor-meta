'use strict';
/* 2.58.0: your own logged games (gameRecord), the builds that use an item (itemUsage) and the trend placeholder for a
   new patch (trendPending). Synthetic fixtures; they never enter a published bundle.
   Probe first: on main efb3cd9 none of the three exists. The 1.17.2 collections of 13 Oct 2026 carry
   scoped_changes.trend = null on every rank, so every hero page dropped its trend line without saying why. */
const test = require('node:test'), assert = require('node:assert/strict');
const Meta = require('../engine.js');

const games = [
  {id: 'a', slug: 'kira', role: 'carry', result: 'win', at: '2026-10-10T20:00:00Z', patch: '1.17'},
  {id: 'b', slug: 'kira', role: 'carry', result: 'loss', at: '2026-10-13T20:00:00Z', patch: '1.17.2'},
  {id: 'c', slug: 'kira', role: 'carry', result: 'win', at: '2026-10-14T20:00:00Z', patch: '1.17.2'},
  {id: 'd', slug: 'kira', role: 'midlane', result: 'win', at: '2026-10-14T21:00:00Z', patch: '1.17.2'},
  {id: 'e', slug: 'kira', role: 'carry', result: 'draw', at: '2026-10-14T22:00:00Z', patch: '1.17.2'},
  null];

test('your record counts this hero and role only, overall and on the current patch, newest first', () => {
  const r = Meta.gameRecord(games, 'kira', 'carry', '1.17.2');
  assert.deepEqual([r.won, r.lost, r.total], [2, 1, 3]);
  assert.equal(Math.round(r.won_share), 67);
  assert.deepEqual([r.current.won, r.current.lost, r.current.total], [1, 1, 2]);
  assert.deepEqual(r.recent.map(g => g.id), ['c', 'b', 'a']);
});

test('no record without logged games for that hero and role', () => {
  assert.equal(Meta.gameRecord(games, 'kira', 'jungle', '1.17.2'), null);
  assert.equal(Meta.gameRecord(undefined, 'kira', 'carry', '1.17.2'), null);
  assert.equal(Meta.gameRecord(games, 'kira', 'carry', null).current, null);
});

const stamp = '2026-09-22T00:00:00Z', names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
function fixture() {
  const items = Object.fromEntries([...names, 'Seven'].map(n => [n, {name: n, completed_item: true, stats: {}, effects: []}]));
  const variant = {playedGames: 900, core_items: {coreItems: ['Seven', 'One', 'Three']}, items4: [{name: 'Four', playedGames: 1}], items5: [{name: 'Five', playedGames: 1}], items6: [{name: 'Six', playedGames: 1}]};
  return {heroes: {hero: {display_name: 'Hero', roles: {jungle: {status: 'unavailable'}}, roles_order: ['jungle'], abilities: [{key: 'Q', text: 'Exact source kit'}]},
      other: {display_name: 'Other', roles: {carry: {status: 'ok', builds: [variant]}}, roles_order: ['carry'], abilities: []}},
    items, perks: {}, patch_support: {active: true}, patch: '1.17', sources: {statz_hero_pages: {status: 'ok', fetched_at: stamp}},
    official: {status: 'verified', live: {version: '1.17'}, articles: [{version: '1.17', status: 'live', fingerprint: 'new'}]},
    guidance: {patch: '1.17', status: 'reviewed for current patch', reviewed_at: stamp,
      builds: [{slug: 'hero', role: 'jungle', patch: '1.17', reviewed_at: stamp, core: names.slice(0, 3), finish: names.slice(3), crest: 'Crest', augment: 'Augment',
        eternal: 'Eternal', blessings: ['First', 'Second'], skill_priority: ['Primary', 'Alternate', 'Secondary'], why: 'Reviewed delivery', caution: 'Conditional',
        patch_review: {reviewed_at: stamp, result: 'checked and retained', reason: 'Kept.', limitation: 'None.'},
        source_preconditions: {abilities: {Q: 'Exact source kit'}, items: {One: {completed_item: true}}, perks: {Augment: 'Exact definition'}}}],
      build_patch_review: {patch: '1.17', reviewed_at: stamp, article_fingerprints: {'1.17': 'new'},
        loadout_catalog: {eternals: {Eternal: {BLESSING_MINOR_1: ['First'], BLESSING_MINOR_2: ['Second']}}},
        loadout_definitions: {Augment: {description: 'Exact definition', sources: [{bracket: 'silver', fetched_at: stamp}]}}}}};
}
const at = (iso, fn) => { const real = Date.now; Date.now = () => Date.parse(iso); try { return fn(); } finally { Date.now = real; } };

test('an item lists the starting builds that use it, named reviewed or calculated, with its place in the six', () => {
  at('2026-09-24T12:00:00Z', () => {
    const e = Meta.create(fixture());
    assert.equal(e.plannedBuild('hero', 'jungle').kind, 'reviewed', 'fixture: the reviewed build is active');
    assert.deepEqual(e.itemUsage('one'), [{slug: 'hero', role: 'jungle', kind: 'reviewed', slot: 1}, {slug: 'other', role: 'carry', kind: 'provisional', slot: 2}]);
    assert.deepEqual(e.itemUsage('Two'), [{slug: 'hero', role: 'jungle', kind: 'reviewed', slot: 2}]);
    assert.deepEqual(e.itemUsage('Seven'), [{slug: 'other', role: 'carry', kind: 'provisional', slot: 1}]);
    assert.deepEqual(e.itemUsage('Nothing'), []);
  });
});

test('a new patch with no trend yet says which patch it waits on; otherwise nothing', () => {
  const b = (sc, extra = {}) => Meta.create({heroes: {}, official: {live: {version: '1.17.2'}}, scoped_changes: sc, ...extra});
  assert.deepEqual(b({status: 'partial', trend: null}).trendPending(), {patch: '1.17.2'});
  assert.equal(b({status: 'partial', trend: {points: [], series: {}}}).trendPending(), null, 'a trend exists');
  assert.equal(b({status: 'partial'}).trendPending(), null, 'collected before 2.54.0: no trend field at all');
  assert.equal(b({status: 'unavailable', trend: null}).trendPending(), null, 'no Pred.gg history');
  assert.equal(b(undefined).trendPending(), null);
});
