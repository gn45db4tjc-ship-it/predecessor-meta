'use strict';
/* Composition search off the main thread (audit defect E): output parity. Moving the search into a worker, and
   reporting progress from it, must not change a single byte of what the engine recommends. The worker harness is
   read out of ui.js and run here against the same engine source, with messages copied the way postMessage copies them. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), zlib = require('node:zlib');
const Meta = require('../engine.js');
const engineSource = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8'), ui = fs.readFileSync(path.join(__dirname, '..', 'ui.js'), 'utf8');

function synthetic() {
  const roles = ['jungle', 'midlane', 'support', 'offlane', 'carry'], heroes = {}, pairs = {};
  for (let i = 0; i < 20; i++) {
    const role = roles[i % 5], slug = 'hero' + String(i).padStart(2, '0');
    heroes[slug] = {slug, display_name: 'Fixture ' + i, roles_order: [role], abilities: [], capabilities: [], roles: {[role]: {status: 'ok', tier: 'A', winRate: 45 + (i * 7) % 11, pickRate: 3, playedGames: 300 + i}}};
  }
  return {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, pairs, heroes, items: {}, perks: {},
    official: {status: 'verified', live: {version: '1.16.4'}},
    sources: {statz_tierlist: {status: 'ok', fetched_at: '2026-09-18T08:00:00Z'}, statz_hero_pages: {status: 'ok', fetched_at: '2026-09-18T08:00:00Z'}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', builds: []}};
}
function seed() {
  const file = path.join(__dirname, '..', 'public-seed-gold.json.gz');
  return fs.existsSync(file) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')) : null;
}
const jungler = b => Object.keys(b.heroes).find(slug => b.heroes[slug].roles?.jungle?.status === 'ok');
const cases = b => [2, 3, 5].flatMap(size => ['lift', 'meta'].map(metric => ({locks: [{slug: jungler(b), role: 'jungle'}], options: {size, bans: [], enemies: [], metric, preferredRole: 'jungle', requiredRole: '', includeUnsampled: false}})));

/* The harness string from ui.js, run as a worker would run it: engine source first, then the harness. */
function workerFromPage() {
  const harness = (ui.match(/const harness='((?:[^'\\]|\\.)*)';/) || [])[1];
  assert.ok(harness, 'the worker harness was not found in ui.js');
  const posted = [], self = {postMessage: message => posted.push(structuredClone(message))};
  const context = vm.createContext({self, globalThis: null, console, structuredClone});
  context.globalThis = context;
  vm.runInContext(engineSource + '\n' + harness.replace(/\\"/g, '"'), context);
  return {send: message => self.onmessage({data: structuredClone(message)}), posted};
}

for (const [name, make] of [['synthetic roster', synthetic], ['committed public seed', seed]]) {
  test('progress reporting never changes the search result (' + name + ')', t => {
    const b = make(); if (!b) return t.skip('the public seed is not part of the source package');
    const E = Meta.create(b);
    for (const {locks, options} of cases(b)) {
      const seen = [], plain = E.generate(locks, options), reported = E.generate(locks, {...options, onProgress: p => seen.push(p)});
      assert.deepEqual(reported, plain);
      assert.ok(seen.length > 0 && seen.every((p, i) => p.done === i + 1 && p.total === seen.length), 'progress counts every step once, in order');
      assert.equal(plain.alternatives.length > 0, true, 'fixture should produce alternatives');
    }
  });

  test('the worker returns exactly what the engine returns, through copied messages (' + name + ')', t => {
    const b = make(); if (!b) return t.skip('the public seed is not part of the source package');
    const E = Meta.create(b), worker = workerFromPage();
    worker.send({type: 'bundle', bundle: b, generation: 1});
    cases(b).forEach(({locks, options}, index) => {
      worker.send({type: 'generate', id: index + 1, generation: 1, locks, options});
      const reply = worker.posted.filter(m => m.id === index + 1 && m.type !== 'progress');
      assert.deepEqual(reply.map(m => m.type), ['result']);
      assert.equal(JSON.stringify(reply[0].result), JSON.stringify(E.generate(locks, options)));
    });
  });
}

test('a result is a plain, copyable value', () => {
  const b = synthetic(), result = Meta.create(b).generate([{slug: jungler(b), role: 'jungle'}], {size: 3});
  assert.deepEqual(structuredClone(result), result);
});

test('the worker refuses a request made for a different bundle, and reports engine errors as messages', () => {
  const b = synthetic(), worker = workerFromPage();
  worker.send({type: 'generate', id: 1, generation: 1, locks: [], options: {size: 3}});
  assert.deepEqual(worker.posted.pop(), {type: 'stale', id: 1}, 'no bundle yet');
  worker.send({type: 'bundle', bundle: b, generation: 2});
  worker.send({type: 'generate', id: 2, generation: 1, locks: [], options: {size: 3}});
  assert.deepEqual(worker.posted.pop(), {type: 'stale', id: 2}, 'a request for the previous bundle');
  worker.send({type: 'generate', id: 3, generation: 2, locks: [], options: {size: 4}});
  assert.deepEqual(worker.posted.pop(), {type: 'error', id: 3, message: 'Choose 2, 3, or 5 heroes.'});
});
