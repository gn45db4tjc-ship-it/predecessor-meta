'use strict';
// 27 Sep 2026 grade recheck: a rechecked tier carries its own date and, when the grade moved, the grade it replaced.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const Meta = require('../engine.js');
const root = path.join(__dirname, '..');

function bundle(entry) {
  const row = {slug: 'hero', role: 'carry', winRate: 52, matches: 800, wonGames: 416, url: 'https://pred.gg/heroes?versions=167%2C168', fetched_at: '2026-09-26T13:47:21-05:00'};
  return {official: {status: 'verified', live: {version: '1.17'}}, bracket: {segment: 'gold'},
    scoped_statistics: {status: 'ok', patch: '1.17', bracket_label: 'Gold+', gameModes: ['RANKED'], roles: {carry: {rows: [row]}}},
    heroes: {hero: {slug: 'hero', display_name: 'Hero', roles: ['carry'], abilities: []}},
    guidance: {patch: '1.17', status: 'reviewed for current patch', builds: [],
      meta_review: {patch: '1.17', bracket: 'gold', bracket_label: 'Gold+', mode: 'RANKED', reviewed_at: '2026-09-24T01:56:00-05:00',
        tier_definitions: {S: 's', A: 'a', B: 'b', C: 'c'}, entries: [entry]}}};
}
const base = {slug: 'hero', role: 'carry', tier: 'A', why: 'w', watch: 'x', ability_keys: ['Q'], evidence: {winRate: 52, wonGames: 416, matches: 800, url: 'https://pred.gg/heroes', fetched_at: '2026-09-26T13:47:21-05:00'}};

test('a rechecked tier reports the recheck date and keeps the original review date', () => {
  const r = Meta.create(bundle({...base, rechecked_at: '2026-09-27T12:00:00-05:00', previous_tier: 'B'})).metaReview('hero', 'carry');
  assert.equal(r.active, true);
  assert.equal(r.reviewed_at, '2026-09-27T12:00:00-05:00');
  assert.equal(r.review_reviewed_at, '2026-09-24T01:56:00-05:00');
  assert.equal(r.previous_tier, 'B');
});

test('an entry that was not rechecked keeps the review date', () => {
  const r = Meta.create(bundle(base)).metaReview('hero', 'carry');
  assert.equal(r.reviewed_at, '2026-09-24T01:56:00-05:00');
  assert.equal(r.review_reviewed_at, '2026-09-24T01:56:00-05:00');
  assert.equal(r.previous_tier, undefined);
});

test('the reviewed packet and the recheck ledger agree', () => {
  const packet = JSON.parse(fs.readFileSync(path.join(root, 'reviewed_guidance.json'), 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/grade-recheck-2026-09-27-ledger.json'), 'utf8'));
  const review = packet.guidance.meta_review, rechecked = review.entries.filter(e => e.rechecked_at);
  const applied = ledger.entries.filter(row => row.verdict !== 'proposed');
  assert.equal(rechecked.length, applied.length);
  // A proposed grade is a record for the owner, never a tier the app shows.
  for (const row of ledger.entries.filter(r => r.verdict === 'proposed'))
    assert.equal(review.entries.find(x => x.slug === row.slug && x.role === row.role), undefined);
  for (const row of applied) {
    const e = review.entries.find(x => x.slug === row.slug && x.role === row.role);
    assert.ok(e, row.slug + '/' + row.role);
    assert.equal(e.rechecked_at, ledger.reviewed_at);
    assert.equal(e.tier, row.tier);
    assert.equal(e.previous_tier, row.verdict === 'changed' ? row.old_tier : undefined, row.slug + '/' + row.role + ' previous tier');
    assert.deepEqual(e.evidence, row.evidence);
    assert.ok(Date.parse(e.evidence.fetched_at) <= Date.parse(e.rechecked_at));
    assert.ok(row.reason && row.limitation);
  }
});
