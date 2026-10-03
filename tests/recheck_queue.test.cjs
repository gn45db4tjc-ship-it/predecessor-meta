'use strict';
/* Freshness Phase 4 (2.47.0): the recheck queue the scheduled reviewer works from (engine recheckQueue, published by
   review_queue.cjs in review/index.json). Grades first. An item stays queued while its condition holds, so a missed
   run stays due; preparing the queue changes no review status, date, recommendation or observation.
   Probe first: on main 55d11e4 nothing queues a withheld grade, a plan whose mechanics changed, a mechanics notice or
   the weekly backstop. Synthetic fixtures only. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const Meta = require('../engine.js');
const {build} = require('../review_queue.cjs');

const recent = new Date(Date.now() - 3 * 3600000).toISOString();
function bundle({moved = true, mechanics = true, notice = true, newHero = true, patch = '1.17'} = {}) {
  const row = (slug, winRate, matches) => ({slug, role: 'jungle', winRate, matches, wonGames: Math.round(matches * winRate / 100), fetched_at: recent, source: 'Pred.gg'});
  const heroes = {
    alpha: {slug: 'alpha', display_name: 'Alpha', roles_order: ['jungle'], roles: {}, abilities: [{key: 'Q', text: mechanics ? 'Deals 60 damage.' : 'Deals 50 damage.'}]},
    beta: {slug: 'beta', display_name: 'Beta', roles_order: ['jungle'], roles: {}, abilities: []}};
  if (newHero) heroes.gamma = {slug: 'gamma', display_name: 'Gamma', roles_order: ['jungle'], roles: {}, abilities: []};
  return {schema: 3, generated_at: recent, patch: '1.17', bracket: {segment: 'gold', label: 'Gold+'}, heroes, pairs: {},
    official: {status: 'verified', live: {version: '1.17', fingerprint: 'f'.repeat(64)}},
    sources: {pred_scoped: {status: 'ok', fetched_at: recent}, statz_tierlist: {status: 'ok', fetched_at: recent}, statz_hero_pages: {status: 'ok', fetched_at: recent}},
    scoped_statistics: {status: 'ok', patch: '1.17', bracket_label: 'Gold+', gameModes: ['RANKED'],
      roles: {jungle: {rows: [row('alpha', moved ? 56 : 52.5, 2000), row('beta', 50, 1500)]}}},
    errors: notice ? [{severity: 'warning', source: 'Official definition review', detail: 'Partly verified descriptions: Frost Snap.'},
                      {severity: 'warning', source: 'statz.gg hero pages', detail: 'Hero-wide pool is broader.'}] : [],
    guidance: {patch, status: 'reviewed for current patch', reviewed_at: '2026-09-24T01:56:00-05:00',
      meta_review: {bracket: 'gold', bracket_label: 'Gold+', patch: '1.17', mode: 'RANKED', reviewed_at: '2026-09-24T01:56:00-05:00',
        entries: [{slug: 'alpha', role: 'jungle', tier: 'A', evidence: {winRate: 52, matches: 1200, fetched_at: '2026-09-23T21:00:00-05:00'}},
                  {slug: 'beta', role: 'jungle', tier: 'B', evidence: {winRate: 50.2, matches: 900, fetched_at: '2026-09-23T21:00:00-05:00'}}]},
      builds: [{slug: 'alpha', role: 'jungle', patch: '1.17', core: [], finish: [], blessings: [], source_preconditions: {abilities: {Q: 'Deals 50 damage.'}}},
               {slug: 'beta', role: 'jungle', patch: '1.17', core: [], finish: [], blessings: [],
                patch_review: {result: 'unresolved', limitation: 'Experimental role; kept out of automatic suggestions.'}}]}};
}

test('the engine queues each trigger, grades first, and leaves the bundle untouched', () => {
  const b = bundle(), before = JSON.stringify(b), items = Meta.create(b).recheckQueue();
  assert.deepEqual(items.map(i => i.id), ['grade-moved:alpha/jungle', 'plan-mechanics:alpha/jungle', 'mechanics-conflict:official-definition-review', 'new-hero:gamma']);
  const grade = items[0];
  assert.equal(grade.kind, 'grade-moved'); assert.equal(grade.tier, 'A'); assert.match(grade.reason, /56(\.0)?% over 2,?000 games/);
  assert.match(items[1].reason, /Ability Q/);
  assert.match(items[2].reason, /Frost Snap/);
  assert.equal(JSON.stringify(b), before);
});

test('nothing is queued when every condition has cleared; experimental unresolved plans are never queued', () => {
  assert.deepEqual(Meta.create(bundle({moved: false, mechanics: false, notice: false, newHero: false})).recheckQueue(), []);
});

test('a live patch the guidance was not reviewed for is queued', () => {
  const items = Meta.create(bundle({moved: false, mechanics: false, notice: false, newHero: false, patch: '1.16.4'})).recheckQueue();
  assert.deepEqual(items.map(i => i.kind), ['patch-change']);
  assert.match(items[0].reason, /1\.16\.4/);
});

// ---- review_queue.cjs publishes the queue with first-queued dates kept in state ----
function site(root, b) {
  const raw = Buffer.from(JSON.stringify(b)), digest = crypto.createHash('sha256').update(raw).digest('hex'), folder = path.join(root, 'site');
  fs.rmSync(folder, {recursive: true, force: true});
  fs.mkdirSync(path.join(folder, 'bundles'), {recursive: true});
  fs.writeFileSync(path.join(folder, 'bundles', 'gold-' + digest + '.json'), raw);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({schema: 2, cohorts: {gold: {label: 'Gold+', status: 'available',
    url: 'bundles/gold-' + digest + '.json', sha256: digest, generated_at: b.generated_at}}}));
  return folder;
}
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recheck-queue-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, stateDir: path.join(root, 'state')};
}
const index = folder => JSON.parse(fs.readFileSync(path.join(folder, 'review', 'index.json'), 'utf8'));
const WEDNESDAY = Date.parse('2026-10-07T12:00:00Z'), SUNDAY = Date.parse('2026-10-11T18:00:00Z'), hour = 3600000;

test('the published queue keeps each item first-queued date until it clears', t => {
  const {root, stateDir} = workspace(t);
  build({site: site(root, bundle()), stateDir, now: WEDNESDAY});
  const first = index(path.join(root, 'site')).rechecks;
  assert.deepEqual(first.map(i => i.id), ['grade-moved:alpha/jungle', 'plan-mechanics:alpha/jungle', 'mechanics-conflict:official-definition-review', 'new-hero:gamma']);
  assert.ok(first.every(i => i.first_queued_at === new Date(WEDNESDAY).toISOString()));
  build({site: site(root, bundle({mechanics: false})), stateDir, now: WEDNESDAY + 3 * hour});
  const later = index(path.join(root, 'site')).rechecks;
  assert.deepEqual(later.map(i => i.id), ['grade-moved:alpha/jungle', 'mechanics-conflict:official-definition-review', 'new-hero:gamma']);
  assert.equal(later[0].first_queued_at, new Date(WEDNESDAY).toISOString(), 'a missed run stays due from its first date');
});

test('the weekly backstop is queued after Sunday collection and clears only with a logged weekly pass', t => {
  const {root, stateDir} = workspace(t), quiet = () => bundle({moved: false, mechanics: false, notice: false, newHero: false});
  build({site: site(root, quiet()), stateDir, now: WEDNESDAY});
  assert.deepEqual(index(path.join(root, 'site')).rechecks, []);
  build({site: site(root, quiet()), stateDir, now: SUNDAY});
  assert.deepEqual(index(path.join(root, 'site')).rechecks.map(i => i.id), ['weekly:2026-W41']);
  build({site: site(root, quiet()), stateDir, now: SUNDAY + 30 * hour});
  assert.deepEqual(index(path.join(root, 'site')).rechecks.map(i => i.id), ['weekly:2026-W41'], 'still due on Monday');
  const done = quiet();
  done.guidance.recheck_log = [{kind: 'weekly', week: '2026-W41', reviewed_at: '2026-10-12T20:00:00Z', items: ['weekly:2026-W41'],
    scope: 'Weekly backstop: every withheld grade and inactive plan checked.', ledger: 'docs/rechecks/2026-10-12-ledger.json'}];
  build({site: site(root, done), stateDir, now: SUNDAY + 31 * hour});
  assert.deepEqual(index(path.join(root, 'site')).rechecks, []);
});
