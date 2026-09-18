'use strict';
/* Defect D, app side: a fresh collection in which a few Statz hero pages failed stays usable for the
   roles that were collected. The failed role stays unavailable and is never filled in; a collection
   the publisher did not confirm as usable keeps today's all-or-nothing behaviour. Synthetic fixtures. */
const test = require('node:test'), assert = require('node:assert/strict');
const Meta = require('../engine.js');

const NOW = Date.parse('2026-09-18T12:00:00Z'), fetched = new Date(NOW - 3600000).toISOString();
const ok = (wr, games) => ({status: 'ok', tier: 'A', winRate: wr, pickRate: 5, playedGames: games});
function bundle(pages) {
  return {patch: '1.16', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {},
    heroes: {collected: {slug: 'collected', display_name: 'Collected fixture', roles_order: ['jungle'], roles: {jungle: ok(52, 400)}},
      missing: {slug: 'missing', display_name: 'Missing fixture', roles_order: ['jungle'], roles: {jungle: {status: 'failed', error: 'FetchError: timed out'}}}},
    failed_pages: [{slug: 'missing', role: 'jungle', error: 'FetchError: timed out'}],
    official: {status: 'verified', live: {version: '1.16.4'}},
    sources: {statz_tierlist: {status: 'ok', fetched_at: fetched}, statz_hero_pages: {fetched_at: fetched, ...pages}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', builds: []}};
}
const coverage = (extra = {}) => ({requested: 12, ok: 11, failed: 1, conflicting: 0, max_failed_share: 0.1, usable: true, ...extra});
const gap = extra => bundle({status: 'partial (1 missing)', ok: 11, failed: 1, conflicting: 0, requested: 12, coverage: coverage(extra)});

test('collected roles stay usable when the publisher confirms a small gap', () => {
  const E = Meta.create(gap()), policy = E.performancePolicy({now: NOW});
  assert.equal(policy.source, 'statz');
  assert.equal(policy.currency, 'current');
  const seen = E.performance({slug: 'collected', role: 'jungle'});
  assert.equal(seen.wr, 52); assert.equal(seen.played, 400);
});

test('the failed role is unavailable and nothing is filled in', () => {
  const b = gap(), before = JSON.stringify(b), E = Meta.create(b);
  assert.equal(E.performance({slug: 'missing', role: 'jungle'}), null);
  assert.equal(E.performance({slug: 'missing', role: 'jungle'}, {source: 'statz'}), null);
  assert.equal(JSON.stringify(b), before, 'the engine never writes to the bundle');
});

test('the gap is stated wherever the evidence is described', () => {
  const E = Meta.create(gap()), state = E.evidenceState({now: NOW});
  assert.match(E.performancePolicy({now: NOW}).note, /1 of 12 Statz hero pages failed/);
  assert.deepEqual(state.statistics.coverage, {requested: 12, ok: 11, failed: 1});
  assert.ok(state.limitations.some(text => /1 of 12 Statz hero pages failed.*nothing was filled in/.test(text)));
  assert.equal(state.ranking_current, true);
});

for (const [name, pages] of [
  ['no coverage record', {status: 'partial (1 missing)', ok: 11, failed: 1, requested: 12}],
  ['publisher says not usable', {status: 'partial (6 missing)', coverage: coverage({ok: 6, failed: 6, usable: false})}],
  // Counts that reconcile exactly, so only the conflict rule itself can reject this one.
  ['a patch conflict', {status: 'partial (2 missing)', coverage: coverage({ok: 10, failed: 1, conflicting: 1})}],
  ['counts that do not reconcile', {status: 'partial (1 missing)', coverage: coverage({ok: 9})}],
  ['a usable flag that is not literally true', {status: 'partial (1 missing)', coverage: coverage({usable: 'yes'})}],
  ['an unrecognised status', {status: 'failed', coverage: coverage()}],
]) test('all-or-nothing is kept for ' + name, () => {
  const E = Meta.create(bundle(pages));
  assert.equal(E.performancePolicy({now: NOW}).source, null);
  assert.equal(E.performance({slug: 'collected', role: 'jungle'}), null);
  assert.equal(E.evidenceState({now: NOW}).statistics.state, 'unavailable');
});

test('a gap-free collection behaves exactly as before, with or without a coverage record', () => {
  const plain = bundle({status: 'ok'}), stamped = bundle({status: 'ok', coverage: coverage({ok: 12, failed: 0})});
  for (const b of [plain, stamped]) { b.heroes.missing.roles.jungle = ok(49, 300); b.failed_pages = []; }
  const a = Meta.create(plain), c = Meta.create(stamped);
  assert.deepEqual(c.performancePolicy({now: NOW}), a.performancePolicy({now: NOW}));
  assert.doesNotMatch(a.performancePolicy({now: NOW}).note, /hero pages failed/);
  assert.deepEqual(c.evidenceState({now: NOW}), a.evidenceState({now: NOW}));
  for (const slug of ['collected', 'missing']) assert.deepEqual(c.performance({slug, role: 'jungle'}), a.performance({slug, role: 'jungle'}));
});
