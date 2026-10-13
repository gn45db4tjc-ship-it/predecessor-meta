'use strict';
/* 2.57.0: how an active reviewed build differs from the previous patch's reviewed build (buildChanges), and what changed
   for a favorite between two visits (snapshotChanges). Synthetic fixtures; they never enter a published bundle.
   Probe first: on main 372048c neither exists, so a build that swapped two items for 1.17 showed no difference and
   the phone kept no record of what a favorite looked like on the last visit. */
const test = require('node:test'), assert = require('node:assert/strict');
const Meta = require('../engine.js');

const stamp = '2026-09-22T00:00:00Z', names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
function fixture(previous) {
  const row = {slug: 'hero', role: 'jungle', patch: '1.17', reviewed_at: stamp, core: names.slice(0, 3), finish: names.slice(3), crest: 'Crest', augment: 'Augment',
    eternal: 'Eternal', blessings: ['First', 'Second'], skill_priority: ['Primary', 'Alternate', 'Secondary'], why: 'Reviewed delivery and economy', caution: 'Conditional',
    patch_review: {reviewed_at: stamp, result: 'changed', reason: 'Seven replaces Two for 1.17.', limitation: 'No current outcome sample.'},
    source_preconditions: {abilities: {Q: 'Exact source kit'}, items: {One: {completed_item: true}}, perks: {Augment: 'Exact definition'}}, previous_review: previous};
  const items = Object.fromEntries([...names, 'Seven', 'Eight'].map(n => [n, {name: n, completed_item: true, stats: {}, effects: []}]));
  return {heroes: {hero: {display_name: 'Hero', roles: {jungle: {status: 'unavailable'}}, roles_order: ['jungle'], abilities: [{key: 'Q', text: 'Exact source kit'}]}},
    items, perks: {}, patch_support: {active: true},
    official: {status: 'verified', live: {version: '1.17'}, articles: [{version: '1.17', status: 'live', fingerprint: 'new'}, {version: '1.16.4', status: 'live', fingerprint: 'previous'}]},
    guidance: {patch: '1.17', status: 'reviewed for current patch', reviewed_at: stamp, builds: [row],
      build_patch_review: {patch: '1.17', reviewed_at: stamp, article_fingerprints: {'1.17': 'new', '1.16.4': 'previous'},
        loadout_catalog: {eternals: {Eternal: {BLESSING_MINOR_1: ['First'], BLESSING_MINOR_2: ['Second', 'Third']}}},
        loadout_definitions: {Augment: {description: 'Exact definition', sources: [{bracket: 'silver', fetched_at: stamp}]}}}}};
}
const previous = (over = {}) => ({patch: '1.16.4', reviewed_at: '2026-09-14T00:00:00Z', core: names.slice(0, 3), finish: names.slice(3), crest: 'Crest', augment: 'Augment',
  eternal: 'Eternal', blessings: ['First', 'Second'], skill_priority: ['Primary', 'Alternate', 'Secondary'], ...over});
const at = (iso, fn) => { const real = Date.now; Date.now = () => Date.parse(iso); try { return fn(); } finally { Date.now = real; } };
const changesFor = prev => at('2026-09-24T12:00:00Z', () => Meta.create(fixture(prev)).buildChanges('hero', 'jungle'));

test('a changed build names the items in, out and moved, and the loadout that changed', () => {
  const r = changesFor(previous({core: ['Five', 'Seven', 'Three'], finish: ['Four', 'One', 'Eight'], crest: 'Old crest', blessings: ['First', 'Third']}));
  assert.deepEqual(r.from, {patch: '1.16.4', reviewed_at: '2026-09-14T00:00:00Z'});
  assert.equal(r.to.patch, '1.17');
  assert.deepEqual(r.added, ['Two', 'Six']);
  assert.deepEqual(r.removed, ['Seven', 'Eight']);
  assert.deepEqual(r.moved, [{item: 'One', from: 4, to: 0}, {item: 'Five', from: 0, to: 4}]);
  assert.deepEqual(r.fields.map(f => [f.label, f.from, f.to]), [['Crest', 'Old crest', 'Crest'], ['Blessings', ['First', 'Third'], ['First', 'Second']]]);
  assert.equal(r.result, 'changed');
  assert.equal(r.reason, 'Seven replaces Two for 1.17.');
  assert.equal(r.unchanged, false);
});

test('a retained build says it is unchanged', () => {
  const r = changesFor(previous());
  assert.equal(r.unchanged, true);
  assert.deepEqual([r.added, r.removed, r.moved, r.fields], [[], [], [], []]);
});

test('no comparison without an active build, a previous review, or a different patch', () => {
  assert.equal(changesFor(undefined), null);
  assert.equal(changesFor(previous({patch: '1.17'})), null);
  assert.equal(changesFor({patch: '1.16.4', core: 'not a list', finish: []}), null);
  // A build whose review is unresolved is not active, so it has no current build to compare.
  const b = fixture(previous());b.guidance.builds[0].patch_review.result = 'unresolved';
  assert.equal(at('2026-09-24T12:00:00Z', () => Meta.create(b).buildChanges('hero', 'jungle')), null);
});

const snap = (over = {}) => ({tier: 'A', tier_kind: 'calculated', wr: 51, played: 400, source: 'Pred.gg', patch: '1.17', items: names.slice(), ...over});

test('since the last visit: a tier change, a full-point win-rate move and a build change', () => {
  const r = Meta.snapshotChanges(snap(), snap({tier: 'S', wr: 53.5, played: 900, items: ['One', 'Two', 'Three', 'Four', 'Five', 'Seven']}));
  assert.deepEqual(r.map(c => c.kind), ['tier', 'wr', 'build']);
  assert.deepEqual([r[0].from, r[0].to], ['A', 'S']);
  assert.equal(r[1].delta, 2.5);
  assert.deepEqual([r[1].from_played, r[1].to_played], [400, 900]);
  assert.deepEqual([r[2].added, r[2].removed], [['Seven'], ['Six']]);
});

test('since the last visit: small moves, small samples, a different source and missing builds are not changes', () => {
  assert.deepEqual(Meta.snapshotChanges(snap(), snap({wr: 51.9})), []);
  assert.deepEqual(Meta.snapshotChanges(snap({played: 80}), snap({wr: 55})), []);
  assert.deepEqual(Meta.snapshotChanges(snap(), snap({wr: 55, source: 'Statz'})), []);
  assert.deepEqual(Meta.snapshotChanges(snap(), snap({items: null})), []);
  assert.deepEqual(Meta.snapshotChanges(snap({tier: null}), snap()), []);
  assert.deepEqual(Meta.snapshotChanges(null, snap()), []);
  assert.deepEqual(Meta.snapshotChanges(snap(), snap()), []);
});
