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
    `b["scoped_statistics"]["status"] = ${JSON.stringify(status.split('+')[0])}`,
    ...(status.includes('+unverified') ? ['for n, (slug, roles) in enumerate(sorted(b["pred_game_data"]["role_data"].items())):',
      '    for role, d in roles.items():',
      '        t = ((d.get("counters") or {}).get("tables") or {}).get("counters")',
      '        if isinstance(t, dict) and n % 2: t["cohort_verified"] = False'] : []),
    'p = P.build(b)',
    'sys.stdout.buffer.write(json.dumps({"full": P.dumps(b).decode(), "core": p["core"].decode(), "shared": p["shared"].decode(), "heroes": {k: v.decode() for k, v in p["heroes"].items()}, "fields": {"hero": P.HERO_FIELDS, "ability": P.ABILITY_FIELDS, "role": P.ROLE_FIELDS}}).encode())',
  ].join('\n');
  const run = spawnSync(python, ['-B', '-c', code], {cwd: root, maxBuffer: 1 << 30});
  if (run.error) throw Error('Python could not be started (' + python + '; set PYTHON_EXE): ' + run.error.message);
  if (run.status) throw Error('projection.py failed: ' + run.stderr);
  const out = JSON.parse(run.stdout.toString('utf8'));
  displayFields = out.fields;
  return {full: JSON.parse(out.full), core: Projection.decode(JSON.parse(out.core)), shared: Projection.decode(JSON.parse(out.shared)),
          heroes: Object.fromEntries(Object.entries(out.heroes).map(([k, v]) => [k, Projection.decode(JSON.parse(v))]))};
}

const skip = !fs.existsSync(seedFile) && 'the public seed is not part of this package';
// plannedKit returns the hero record itself, so its display-only fields (moved to the annexes) are part of its
// value; they are compared without those fields. Every decision it makes is compared in full.
let displayFields = {hero: [], ability: [], role: []};
const withoutDisplay = h => h && {...Object.fromEntries(Object.entries(h).filter(([k]) => !displayFields.hero.includes(k))),
  ...(Array.isArray(h.abilities) ? {abilities: h.abilities.map(a => a && typeof a === 'object' ? Object.fromEntries(Object.entries(a).filter(([k]) => !displayFields.ability.includes(k))) : a)} : {}),
  ...(h.roles && typeof h.roles === 'object' ? {roles: Object.fromEntries(Object.entries(h.roles).map(([r, d]) => [r, d && typeof d === 'object' ? Object.fromEntries(Object.entries(d).filter(([k]) => !displayFields.role.includes(k))) : d]))} : {})};
const cache = {};
const get = status => (cache[status] ??= parts(status));

// Five different heroes, one per role, none of them in `exclude`.
function lineup(E, slugs, exclude) {
  const used = new Set(exclude), out = [];
  for (const role of ['carry', 'jungle', 'midlane', 'offlane', 'support']) {
    const slug = slugs.find(s => !used.has(s) && E.roles(s).includes(role));
    if (slug) { used.add(slug); out.push({slug, role}); }
  }
  return out;
}
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
    call('damageAssessment ' + slug, () => E.damageAssessment(slug));
    for (const ability of (E.heroes[slug]?.abilities || [])) call('sequenceReview ' + slug + ' ' + ability.key, () => E.sequenceReview(slug, ability.key));
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
      const foes = lineup(E, slugs, [slug]);
      call('adaptBuild vs enemies ' + k, () => E.adaptBuild(p, [p], foes, {owned: [], state: 'even', priority: ''}));
      call('liveBuild vs enemies ' + k, () => E.liveBuild(p, [p], foes, {variant: null, owned: [], state: 'behind', priority: ''}));
      call('counterIdeas vs enemies ' + k, () => E.counterIdeas(slug, role, {bans: [], allies: [p], enemies: foes}));
      call('bestMatchup ' + k, () => E.bestMatchup(p, foes[0]));
      call('variantChoice ' + k, () => E.variantChoice(slug, role, {min: 100, opponent: foes[0]}));
      call('plannedKit ' + k, () => withoutDisplay(E.plannedKit(slug, role)));
      call('heroProfile ' + k, () => E.heroProfile(slug, role));
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
    const team = lineup(E, slugs, [list[1] || list[0]]), rivals = lineup(E, slugs, team.map(p => p.slug));
    call('assess ' + role, () => E.assess(team, 100, [{slug: list[1] || list[0], role}]));
    call('substitute ' + role, () => E.substitute(team, role, {bans: [], enemies: []}));
    call('validPicks ' + role, () => E.validPicks(team, {size: 5, bans: [], enemies: []}));
    call('enemyProfile ' + role, () => E.enemyProfile(list.slice(0, 3)));
    call('pair ' + role, () => E.pair(list[0], list[1] || list[0]));
    call('fit ' + role, () => E.fit(list[0], list[1] || list[0], role, role));
    call('compare ' + role, () => ['lift', 'matchup', 'kit', 'meta'].map(metric => E.compare(E.assess(team), E.assess(rivals), metric)));
    call('fightPlan ' + role, () => E.fightPlan([lock]));
    call('liveBuild ' + role, () => E.liveBuild(lock, [lock], [], {variant: null, owned: [], state: 'even', priority: ''}));
  }
  const jungle = (byRole.jungle || [])[0];
  if (jungle) for (const size of [2, 3]) call('generate ' + size, () => E.generate([{slug: jungle, role: 'jungle'}], {size, bans: [], enemies: [], metric: 'meta', preferredRole: 'jungle', requiredRole: null, includeUnsampled: false}));
  call('guidedCompositions', () => E.guidedCompositions([], {size: 5, bans: [], enemies: []}));
  call('statzGap', () => E.statzGap());
  for (const source of Object.keys(bundle.sources || {})) call('sourceCurrency ' + source, () => E.sourceCurrency(source, now));
  for (let i = 0; i < 6; i++) call('reviewedComposition ' + i, () => E.reviewedComposition(i));
  call('reviewPacket', () => { const r = E.reviewPacket({revision: 'fixed', cohorts: null, toolVersion: 'test', now}); delete r.prepared_at; delete r.generated_at; return r; });
  return out;
}

for (const status of ['ok', 'retained', 'partial', 'ok+unverified']) {
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
    const byMethod = differ.reduce((out, k) => { const m = k.split(' ')[0]; out[m] = (out[m] || 0) + 1; return out; }, {});
    assert.deepEqual(differ.slice(0, 10), [], differ.length + ' engine results differ between the core and the full bundle ' + JSON.stringify(byMethod));
    const failing = Object.entries(expected).filter(([, v]) => v.startsWith('error:')), errors = failing.length;
    const sample = Object.entries(failing.reduce((out, [k, v]) => { const m = k.split(' ')[0]; out[m] ??= v.slice(0, 90); return out; }, {}));
    assert.ok(errors < Object.keys(expected).length / 20, 'probe setup: most calls must succeed (' + errors + ' errors: ' + JSON.stringify(sample) + ')');
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
