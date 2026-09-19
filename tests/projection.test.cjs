'use strict';
/* Audit item 11: the website's compact core must give the engine exactly what the full bundle gives it.
   The parts are produced by projection.py (the publisher) from the committed seed, then decoded and merged by
   projection_client.js (the page). */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const {spawnSync} = require('node:child_process');
const Meta = require('../engine.js'), Projection = require('../projection_client.js');
const root = path.resolve(__dirname, '..'), seedFile = path.join(root, 'public-seed-gold.json.gz');
const python = process.env.PYTHON_EXE || 'python';

function parts(status) {
  const code = [
    'import gzip, json, sys', 'sys.path.insert(0, ".")', 'import projection as P',
    'b = json.loads(gzip.open("public-seed-gold.json.gz").read())',
    `b["scoped_statistics"]["status"] = ${JSON.stringify(status)}`,
    'p = P.build(b)',
    'sys.stdout.buffer.write(json.dumps({"full": P.dumps(b).decode(), "core": p["core"].decode(), "shared": p["shared"].decode(), "heroes": {k: v.decode() for k, v in p["heroes"].items()}}).encode())',
  ].join('\n');
  const run = spawnSync(python, ['-B', '-c', code], {cwd: root, maxBuffer: 1 << 30});
  if (run.status) throw Error('projection.py failed: ' + run.stderr);
  const out = JSON.parse(run.stdout.toString('utf8'));
  return {full: JSON.parse(out.full), core: Projection.decode(JSON.parse(out.core)), shared: Projection.decode(JSON.parse(out.shared)),
          heroes: Object.fromEntries(Object.entries(out.heroes).map(([k, v]) => [k, Projection.decode(JSON.parse(v))]))};
}

const skip = !fs.existsSync(seedFile) && 'the public seed is not part of this package';
const cache = {};
const get = status => (cache[status] ??= parts(status));

// Every engine method with realistic arguments; each result (or error message) is compared as JSON.
function outputs(bundle) {
  const E = Meta.create(bundle), out = {}, now = Date.parse('2026-09-19T12:00:00Z');
  const call = (name, fn) => { try { out[name] = JSON.stringify(fn()); } catch (e) { out[name] = 'error: ' + e.message; } };
  const slugs = Object.keys(E.heroes).sort();
  call('evidenceState', () => E.evidenceState({now}));
  call('performancePolicy', () => E.performancePolicy({now}));
  call('strategyReviewDue', () => E.strategyReviewDue({now}));
  for (const slug of slugs) {
    call('roles ' + slug, () => E.roles(slug));
    call('heroStrategy ' + slug, () => E.heroStrategy(slug));
    for (const role of E.roles(slug)) {
      const p = {slug, role}, k = slug + '|' + role;
      call('performance ' + k, () => E.performance(p));
      call('metaReview ' + k, () => E.metaReview(slug, role));
      call('plannedBuild ' + k, () => E.plannedBuild(slug, role));
      call('buildReview ' + k, () => E.buildReview(slug, role));
      call('buildSummary ' + k, () => E.buildSummary(slug, role));
      call('buildAdaptations ' + k, () => E.buildAdaptations(slug, role));
      call('counterIdeas ' + k, () => E.counterIdeas(slug, role, {}));
      call('partners ' + k, () => E.partners(slug, {min: 100, role: null, heroRole: role, metric: 'lift'}));
      call('currentItemPool ' + k, () => E.currentItemPool(slug, role, E.performance(p)));
      for (const state of ['ahead', 'even', 'behind']) call('adaptBuild ' + k + ' ' + state, () => E.adaptBuild(p, [p], [], {owned: [], state, priority: state === 'behind' ? 'anti_heal' : ''}));
    }
  }
  const byRole = {};
  for (const slug of slugs) for (const role of E.roles(slug)) (byRole[role] ??= []).push(slug);
  for (const [role, list] of Object.entries(byRole)) {
    for (const a of list.slice(0, 4)) for (const [enemyRole, enemies] of Object.entries(byRole)) for (const e of enemies.slice(0, 2)) {
      if (a === e) continue;
      call(`matchup ${a}|${role} v ${e}|${enemyRole}`, () => E.matchup({slug: a, role}, {slug: e, role: enemyRole}));
      call(`currentMatchup ${a}|${role} v ${e}|${enemyRole}`, () => E.currentMatchup({slug: a, role}, {slug: e, role: enemyRole}));
    }
    call('metaReviewSummary ' + role, () => E.metaReviewSummary(role));
    const lock = {slug: list[0], role};
    for (const metric of ['matchup', 'lift', 'meta', 'kit']) call(`recommend ${role} ${metric}`, () => E.recommend([lock], {role: Object.keys(byRole).find(r => r !== role), bans: [], enemies: [{slug: list[1] || list[0], role}], min: 100, metric}));
    call('coverage ' + role, () => E.coverage([lock]));
    call('fightPlan ' + role, () => E.fightPlan([lock]));
    call('liveBuild ' + role, () => E.liveBuild(lock, [lock], [], {variant: null, owned: [], state: 'even', priority: ''}));
  }
  const jungle = (byRole.jungle || [])[0];
  if (jungle) for (const size of [2, 3]) call('generate ' + size, () => E.generate([{slug: jungle, role: 'jungle'}], {size, bans: [], enemies: [], metric: 'meta', preferredRole: 'jungle', requiredRole: null, includeUnsampled: false}));
  call('guidedCompositions', () => E.guidedCompositions([], {size: 5, bans: [], enemies: []}));
  call('reviewPacket', () => { const r = E.reviewPacket({revision: 'fixed', cohorts: null, toolVersion: 'test', now}); delete r.prepared_at; delete r.generated_at; return r; });
  return out;
}

for (const status of ['ok', 'retained']) {
  test(`projection (Pred.gg cohort ${status}): core plus annexes reproduce the full bundle exactly in the page`, {skip}, () => {
    const {full, core, shared, heroes} = get(status);
    const merged = structuredClone(core);
    Projection.merge(merged, shared);
    for (const overlay of Object.values(heroes)) Projection.merge(merged, overlay);
    assert.equal(JSON.stringify(merged), JSON.stringify(full));
  });
  test(`projection (Pred.gg cohort ${status}): every engine result from the core equals the full bundle's`, {skip}, () => {
    const {full, core} = get(status);
    const expected = outputs(full), actual = outputs(core);
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    const differ = Object.keys(expected).filter(k => expected[k] !== actual[k]);
    assert.deepEqual(differ.slice(0, 10), [], differ.length + ' engine results differ between the core and the full bundle');
    const errors = Object.values(expected).filter(v => v.startsWith('error:')).length;
    assert.ok(errors < Object.keys(expected).length / 20, 'probe setup: most calls must succeed (' + errors + ' errors)');
  });
}

test('projection: merging an annex keeps the identity of objects the engine already holds', () => {
  const core = {heroes: {a: {name: 'A', roles: {}}}}, held = core.heroes.a;
  Projection.merge(core, {heroes: {a: {$order: ['previous', 'name', 'roles'], previous: [1]}}});
  assert.equal(core.heroes.a, held);
  assert.deepEqual(Object.keys(held), ['previous', 'name', 'roles']);
});

test('projection: rows written as columns decode to identical objects', () => {
  const decoded = Projection.decode({rows: {$c: ['b', 'a'], $r: [[1, {$c: ['x'], $r: [[1], [2], [3]]}], [2, null], [3, []]]}});
  assert.equal(JSON.stringify(decoded), JSON.stringify({rows: [{b: 1, a: [{x: 1}, {x: 2}, {x: 3}]}, {b: 2, a: null}, {b: 3, a: []}]}));
});
