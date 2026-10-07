'use strict';
/* Audit item 11 and 2.38.0: the core must give the phone's first screen exactly what the full bundle gives it, and the
   core plus the guide must give every engine method exactly that. Other screens wait for the guide (guideGate).
   The parts are produced by projection.py (the publisher) from the committed seed, then decoded and merged by
   projection_client.js (the page). */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const {spawnSync} = require('node:child_process');
const Meta = require('../engine.js'), Projection = require('../projection_client.js');
const root = path.resolve(__dirname, '..'), seedFile = path.join(root, 'public-seed-gold.json.gz');
const python = process.env.PYTHON_EXE || 'python';

function parts(status) {
  const code = [
    'import gzip, json, sys', 'sys.path.insert(0, ".")', 'import projection as P', 'import predecessor_meta as M',
    // 2.53.0: publication adds the Pred.gg movement digest before projecting, as static_publish.py does.
    'b = M.with_scoped_movement(json.loads(gzip.open("public-seed-gold.json.gz").read()))',
    `b["scoped_statistics"]["status"] = ${JSON.stringify(status.split('+')[0])}`,
    ...(status.includes('+unverified') ? ['for n, (slug, roles) in enumerate(sorted(b["pred_game_data"]["role_data"].items())):',
      '    for role, d in roles.items():',
      '        t = ((d.get("counters") or {}).get("tables") or {}).get("counters")',
      '        if isinstance(t, dict) and n % 2: t["cohort_verified"] = False'] : []),
    ...(status.includes('+oldguidance') ? ['b["guidance"]["patch"] = "0.0"'] : []),
    'p = P.build(b)',
    'sys.stdout.buffer.write(json.dumps({"full": P.dumps(b).decode(), "core": p["core"].decode(), "named": {n: p[n].decode() for n in P.PARTS}, "heroes": {k: v.decode() for k, v in p["heroes"].items()}, "fields": {"hero": P.HERO_FIELDS, "ability": P.ABILITY_FIELDS, "role": P.ROLE_FIELDS}}).encode())',
  ].join('\n');
  const run = spawnSync(python, ['-B', '-c', code], {cwd: root, maxBuffer: 1 << 30});
  if (run.error) throw Error('Python could not be started (' + python + '; set PYTHON_EXE): ' + run.error.message);
  if (run.status) throw Error('projection.py failed: ' + run.stderr);
  const out = JSON.parse(run.stdout.toString('utf8'));
  displayFields = out.fields;
  const named = Object.fromEntries(Object.entries(out.named).map(([k, v]) => [k, Projection.decode(JSON.parse(v))]));
  return {full: JSON.parse(out.full), core: Projection.decode(JSON.parse(out.core)), guide: named.guide, named,
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
  // 2.53.0: the screens whose fields moved to the guide (library, loadout definitions, re-check queue, adaptation review,
  // team alternates, calculated tiers).
  for (const kind of ['items', 'perks']) call('libraryCatalog ' + kind, () => E.libraryCatalog(kind));
  for (const name of Object.keys(bundle.guidance?.build_patch_review?.loadout_definitions || {})) call('buildLoadoutDefinition ' + name, () => E.buildLoadoutDefinition(name));
  call('recheckQueue', () => E.recheckQueue({now}));
  call('adaptationReview', () => E.adaptationReview());
  for (const slug of slugs) for (const role of E.roles(slug)) { call('teamAlternates ' + slug + '|' + role, () => E.teamAlternates({slug, role})); call('calculatedTier ' + slug + '|' + role, () => E.calculatedTier(slug, role)); }
  call('reviewPacket', () => { const r = E.reviewPacket({revision: 'fixed', cohorts: null, toolVersion: 'test', now}); delete r.prepared_at; delete r.generated_at; return r; });
  return out;
}

// What the phone's first screen asks the engine: the Meta list for every role, the rank bar and the limitations chip.
function firstScreen(bundle) {
  const E = Meta.create(bundle), out = {}, now = Date.parse('2026-09-19T12:00:00Z');
  const call = (name, fn) => { try { out[name] = JSON.stringify(fn()); } catch (e) { out[name] = 'error: ' + e.message; } };
  call('evidenceState', () => E.evidenceState({now}));
  call('performancePolicy', () => E.performancePolicy({now}));
  call('displayPerformancePolicy', () => E.displayPerformancePolicy({now}));
  call('strategyReviewDue', () => E.strategyReviewDue({now}));
  call('statzGap', () => E.statzGap());
  for (const source of Object.keys(bundle.sources || {})) call('sourceCurrency ' + source, () => E.sourceCurrency(bundle.sources[source], now));
  for (const slug of Object.keys(E.heroes).sort()) for (const role of E.roles(slug)) {
    const p = {slug, role}, k = slug + '|' + role;
    call('performance ' + k, () => E.performance(p));
    call('displayPerformance ' + k, () => E.displayPerformance(p, {now}));
    call('metaReview ' + k, () => E.metaReview(slug, role));
    call('buildReview ' + k, () => { const r = E.buildReview(slug, role); return r && {active: r.active, status: r.status, missing: r.missing, changed: r.changed, invalid: r.invalid}; });
  }
  for (const role of Meta.ROLES) call('metaReviewSummary ' + role, () => E.metaReviewSummary(role));
  for (const role of Meta.ROLES) call('roleMovement ' + role, () => E.roleMovement(role));   // 2.53.0 (QP14)
  for (const slug of Object.keys(E.heroes).sort()) for (const role of E.roles(slug)) call('calculatedTier ' + slug + '|' + role, () => E.calculatedTier(slug, role));
  return out;
}

for (const status of ['ok', 'retained', 'partial', 'ok+unverified', 'ok+oldguidance']) {
  test(`projection (Pred.gg cohort ${status}): core, guide and annexes reproduce the full bundle exactly in the page, in any order`, {skip}, () => {
    const {full, core, named, heroes} = get(status), parts = Object.values(named);
    for (const overlays of [[...parts, ...Object.values(heroes)], [...Object.values(heroes), ...parts.reverse()]]) {
      const merged = structuredClone(core);
      for (const overlay of overlays) Projection.merge(merged, structuredClone(overlay));
      assert.equal(JSON.stringify(merged), JSON.stringify(full));
    }
  });
  test(`projection (Pred.gg cohort ${status}): the phone's first screen gets the same engine answers from the core alone`, {skip}, () => {
    const {full, core} = get(status);
    const expected = firstScreen(full), actual = firstScreen(core);
    const differ = Object.keys(expected).filter(k => expected[k] !== actual[k]);
    assert.deepEqual(differ.slice(0, 10), [], differ.length + ' first-screen answers differ between the core and the full bundle');
    assert.ok(Object.keys(expected).length > 100, 'probe setup: the seed has heroes and roles');
  });
  test(`projection (Pred.gg cohort ${status}): every engine result from the core plus the guide equals the full bundle's`, {skip}, () => {
    const {full, core, guide} = get(status);
    const expected = outputs(full), actual = outputs(Projection.merge(structuredClone(core), structuredClone(guide)));
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

test('projection: the page derives the same Pred.gg movement as the published digest when a full bundle lacks it', {skip}, () => {
  // 2.53.0 (QP14): a local full bundle (no publication step) carries the history rows but not the digest.
  const code = [
    'import gzip, json, sys', 'sys.path.insert(0, ".")', 'import predecessor_meta as M',
    'b = json.loads(gzip.open("public-seed-gold.json.gz").read())',
    'rows = b["scoped_changes"]["vs_previous_run"]["changes"]',
    'for i, c in enumerate(rows): c["wr_delta"] = round(((i * 37) % 23 - 11) / 7.0, 6)',
    'sys.stdout.buffer.write(json.dumps({"plain": b, "published": M.with_scoped_movement(b)}).encode())',
  ].join('\n');
  const run = spawnSync(python, ['-B', '-c', code], {cwd: root, maxBuffer: 1 << 30});
  if (run.status) throw Error('predecessor_meta.py failed: ' + run.stderr);
  const {plain, published} = JSON.parse(run.stdout.toString('utf8'));
  assert.ok(published.scoped_changes.movement && !plain.scoped_changes.movement);
  const round = v => JSON.parse(JSON.stringify(v, (k, x) => k === 'wr_delta' ? Math.round(x * 1e4) / 1e4 : x));
  let moved = 0;
  for (const role of Meta.ROLES) {
    const derived = Meta.create(plain).roleMovement(role), digest = Meta.create(published).roleMovement(role);
    assert.deepEqual(round(derived), round(digest), role);
    moved += digest.rises.length + digest.falls.length;
  }
  assert.ok(moved > 10, 'probe setup: the altered seed moves heroes in every role');
});
