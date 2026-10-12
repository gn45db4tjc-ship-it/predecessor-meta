'use strict';
/* 2.56.0: patch changes for favorite heroes, one watch line per enemy, the lane opponent as the primary threat in
   Match, and allies passed to the adapted build. Synthetic fixtures; they never enter a published bundle. */
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../engine.js');

const NOTES = 'https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_1.17';
function changes() {
  return {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {}, sources: {},
    heroes: {kira: {display_name: 'Kira', roles_order: ['carry'], roles: {}}, adele: {display_name: 'Adele', roles_order: ['offlane'], roles: {}}},
    official: {status: 'verified', live: {version: '1.17', url: NOTES, hotfixes: ['1.17.1']}},
    official_changes: [
      {patch: '1.17', kind: 'hero', key: 'kira', name: 'Kira', field: 'General', change: 'Health increased from 600 to 620.', source: NOTES},
      {patch: '1.17', kind: 'hero', key: 'kira', name: 'Kira', field: 'Lucent Arrow [Primary]', change: 'Damage decreased from 80 to 75.', source: NOTES},
      {patch: '1.16.4', kind: 'hero', key: 'kira', name: 'Kira', field: 'General', change: 'An older patch.', source: NOTES},
      {patch: '1.17', kind: 'hero', key: 'adele', name: 'Adele', field: 'General', change: 'Another hero.', source: NOTES},
      {patch: '1.17', kind: 'item', key: 'kira', name: 'Kira', field: 'General', change: 'Not a hero row.', source: NOTES}],
    official_hotfix_changes: [
      {patch: '1.17.1', kind: 'hero', key: 'kira', name: 'Kira', field: 'Lucent Arrow [Primary]', change: 'Cooldown decreased from 8 to 7.', source: NOTES + '#hotfix'},
      {patch: '1.16.3', kind: 'hero', key: 'kira', name: 'Kira', field: 'General', change: 'An earlier hotfix.', source: NOTES, historical: true}]};
}

test('a favorite hero lists its current-patch and current-hotfix changes, and nothing older', () => {
  const r = M.create(changes()).heroPatchChanges('kira');
  assert.equal(r.patch, '1.17');
  assert.equal(r.url, NOTES);
  assert.deepEqual(r.changes.map(c => c.change), ['Health increased from 600 to 620.', 'Damage decreased from 80 to 75.', 'Cooldown decreased from 8 to 7.']);
  assert.deepEqual(r.changes.map(c => c.hotfix), [false, false, true]);
  assert.equal(r.changes[2].patch, '1.17.1');
});

test('a collected bundle marks every hotfix row historical: the live hotfix still counts, an older one does not', () => {
  const b = changes();
  b.official.live.hotfixes = [{version: '1.17.1', status: 'live'}];
  b.official_hotfix_changes = b.official_hotfix_changes.map(c => ({...c, historical: true}));
  b.official_hotfix_changes.push({patch: '1.17.2', kind: 'hero', key: 'kira', name: 'Kira', field: 'General', change: 'Not verified live yet.', source: NOTES, historical: true});
  assert.deepEqual(M.create(b).heroPatchChanges('kira').changes.filter(c => c.hotfix).map(c => c.change), ['Cooldown decreased from 8 to 7.']);
});

test('a hero with no change, an unknown hero or a bundle without official changes shows nothing', () => {
  const b = changes();
  assert.equal(M.create(b).heroPatchChanges('nobody'), null);
  b.official_changes = b.official_changes.filter(c => c.key !== 'kira'); b.official_hotfix_changes = [];
  assert.equal(M.create(b).heroPatchChanges('kira'), null);
  const none = changes(); delete none.official_changes; delete none.official_hotfix_changes;
  assert.equal(M.create(none).heroPatchChanges('kira'), null, 'the core alone (before the guide) has no change rows');
  const unlabelled = changes(); delete unlabelled.official.live.version;
  assert.equal(M.create(unlabelled).heroPatchChanges('kira'), null, 'without a live patch there is no current patch to name');
});

// Shared with team_alternates.test.cjs: a reviewed physical bruiser with three flexible slots.
function fixture({reviewed = false} = {}) {
  const b = {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, official: {status: 'verified', live: {version: '1.16.4'}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', builds: []}, heroes: {}, items: {}};
  for (const n of ['A', 'B', 'C', 'D', 'E', 'F']) b.items[n] = {name: n, completed_item: true, stats: {'Physical power': '30'}, effects: [], total_price: 3000};
  for (const [n, stats] of [['Armor', {'Physical armor': '60'}], ['Ward', {'Magical armor': '60'}]]) b.items[n] = {name: n, completed_item: true, stats, effects: [{name: n, condition: '', text: n}], total_price: 3000};
  b.heroes.hero = {display_name: 'hero', roles_order: ['jungle'], roles: {}, abilities: [{key: 'Q', display_name: 'hero ability', text: 'Fixture hero'}], capabilities: ['frontline', 'sustained'], capability_evidence: {physical: [{key: 'Q', ability: 'hero attack', reason: 'Physical damage'}], magical: []}};
  b.heroes.brute = {display_name: 'Brute', roles_order: ['jungle', 'offlane'], roles: {}, abilities: [{key: 'R', display_name: 'Slam', text: 'Brute slams.'}], capabilities: ['hard_cc', 'burst'],
    capability_evidence: {physical: [{key: 'R', ability: 'Slam', reason: 'Physical damage'}], hard_cc: [{key: 'R', ability: 'Slam', reason: 'Can interrupt or immobilize an enemy.'}]}};
  b.heroes.medic = {display_name: 'Medic', roles_order: ['support'], roles: {}, abilities: [{key: 'E', display_name: 'Mend', text: 'Medic mends.'}], capabilities: ['ally_healing', 'ally_shield'],
    capability_evidence: {magical: [{key: 'E', ability: 'Mend', reason: 'Magical damage'}], ally_healing: [{key: 'E', ability: 'Mend', reason: 'Heals an ally.'}]}};
  b.guidance.builds.push({slug: 'hero', role: 'jungle', patch: '1.16.4', core: ['A', 'B', 'C'], finish: ['D', 'E', 'F'], style: 'bruiser', damage: 'physical', blessings: [], source_preconditions: {abilities: {Q: 'Fixture hero'}}});
  if (reviewed) b.guidance.strategic_review = {patch: '1.16.4', reviewed_at: '2026-10-01T00:00:00Z', heroes: {brute: {pick_when: 'x', counterplay: 'Wait out Slam before you trade. Then punish the long cooldown.', source_abilities: {R: 'Brute slams.'}}}, counter_picks: [], build_adaptations: []};
  return b;
}
const me = {slug: 'hero', role: 'jungle'};

test('the lane opponent is the primary threat: its damage type becomes an item need with a flexible answer', () => {
  const E = M.create(fixture()), lane = [{slug: 'brute', role: 'jungle'}];
  const plain = E.adaptBuild(me, [], lane, {state: 'even', primaryThreat: null});
  assert.equal(plain.swaps.length, 0, 'one physical enemy alone is not a physical-armor need');
  const r = E.adaptBuild(me, [], lane, {state: 'even', primaryThreat: 'brute'});
  const need = r.needs.find(n => n.id === 'physical_armor');
  assert.equal(need?.threat, true, 'the need is flagged as answering the lane opponent');
  assert.deepEqual(r.swaps.map(s => s.to), ['Armor']);
  assert.ok(r.needs.filter(n => n.id !== 'physical_armor').every(n => !n.threat));
});

test('each enemy gets one watch line: the reviewed counterplay when active, otherwise a kit line', () => {
  const reviewed = M.create(fixture({reviewed: true})).enemyWatch('brute');
  assert.deepEqual([reviewed.kind, reviewed.text], ['reviewed', 'Wait out Slam before you trade.']);
  assert.equal(reviewed.reviewed_at, '2026-10-01T00:00:00Z');
  const stale = fixture({reviewed: true}); stale.official.live.version = '1.17';
  const previous = M.create(stale).enemyWatch('brute');
  assert.equal(previous.kind, 'previous', 'a review for another patch is labelled as the previous review');
  const kit = M.create(fixture()).enemyWatch('brute');
  assert.equal(kit.kind, 'kit');
  assert.equal(kit.text, 'Hard crowd control: Slam. Burst damage.');
  assert.equal(M.create(fixture()).enemyWatch('medic').text, 'Heals allies: Mend. Shields allies.');
  assert.equal(M.create(fixture()).enemyWatch('nobody'), null);
});

test('allies reach the adapted build as team advice; the item rules stay the same', () => {
  const E = M.create(fixture()), enemies = [{slug: 'brute', role: 'jungle'}];
  const alone = E.adaptBuild(me, [], enemies, {state: 'even', primaryThreat: null});
  const team = E.adaptBuild(me, [{slug: 'medic', role: 'support'}], enemies, {state: 'even', primaryThreat: null});
  assert.deepEqual(team.slots.map(s => s.name), alone.slots.map(s => s.name));
  assert.ok(team.teamAdvice.some(t => /Medic/.test(t)), 'a frontliner with a magic-damage ally is told about the aura option');
});
