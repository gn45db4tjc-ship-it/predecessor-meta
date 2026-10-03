'use strict';
// Grade rechecks (27 Sep 2026 and every scheduled pass since): a rechecked tier carries its own date and, when the
// grade moved, the grade it replaced.
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

// Every recheck ledger: the 27 Sep 2026 grade recheck and each scheduled pass since (docs/rechecks/*-ledger.json,
// docs/RECHECK-RUNNER.md). A grade record's review date is its own reviewed_at, else its ledger's.
function gradeRecords() {
  const dir = path.join(root, 'docs/rechecks');
  const files = ['docs/grade-recheck-2026-09-27-ledger.json',
    ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /-ledger\.json$/.test(f)).sort().map(f => 'docs/rechecks/' + f) : [])];
  return files.flatMap(file => {
    const ledger = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    return (ledger.entries || []).filter(row => (row.kind || 'grade') === 'grade')
      .map(row => ({...row, file, reviewed_at: row.reviewed_at || ledger.reviewed_at}));
  }).sort((a, b) => Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at));
}
const zoned = value => /(Z|[+-]\d\d:\d\d)$/.test(String(value)) && Number.isFinite(Date.parse(value));

test('the reviewed packet and every recheck ledger agree', () => {
  const packet = JSON.parse(fs.readFileSync(path.join(root, 'reviewed_guidance.json'), 'utf8'));
  const review = packet.guidance.meta_review, key = x => x.slug + '/' + x.role;
  const records = gradeRecords(), applied = records.filter(row => row.verdict !== 'proposed');
  // A proposed grade is a record for the owner, never a tier the app shows.
  for (const row of records.filter(r => r.verdict === 'proposed'))
    assert.equal(review.entries.find(x => key(x) === key(row)), undefined, key(row) + ' is only proposed');
  // Each rechecked entry has a ledger record, and each applied record has an entry.
  assert.deepEqual(review.entries.filter(e => e.rechecked_at).map(key).sort(), [...new Set(applied.map(key))].sort());
  for (const row of applied) {
    const label = key(row) + ' (' + row.file + ')';
    assert.ok(row.reason && row.limitation, label + ' reason and limitation');
    assert.ok(zoned(row.reviewed_at), label + ' zoned review date');
    // A review cannot predate its samples: every dated source was collected by the record's own review date.
    for (const s of row.evidence ? [row.evidence] : row.sources || [])
      assert.ok(Date.parse(s.fetched_at) <= Date.parse(row.reviewed_at), label + ' source collected after its review');
  }
  // The latest record for each grade decides the entry; earlier records are history.
  for (const k of new Set(applied.map(key))) {
    const history = applied.filter(r => key(r) === k), row = history[history.length - 1], label = k + ' (' + row.file + ')';
    const e = review.entries.find(x => key(x) === k);
    assert.equal(e.rechecked_at, row.reviewed_at, label + ' recheck date');
    assert.equal(e.tier, row.tier, label + ' tier');
    // A move records the grade it replaced. A retained recheck may keep an earlier move that still stands, or none.
    const earlier = history.slice(0, -1).reverse().find(r => r.verdict === 'changed' && r.tier === e.tier);
    if (row.verdict === 'changed') assert.equal(e.previous_tier, row.old_tier, label + ' previous tier');
    else assert.ok(e.previous_tier === undefined || e.previous_tier === earlier?.old_tier, label + ' previous tier');
    // The entry cites the sample it was rechecked against: the record's evidence, or one of its dated sources.
    if (row.evidence) assert.deepEqual(e.evidence, row.evidence, label + ' evidence');
    else assert.ok((row.sources || []).some(s => s.url === e.evidence.url && s.fetched_at === e.evidence.fetched_at), label + ' evidence among its sources');
    assert.ok(Date.parse(e.evidence.fetched_at) <= Date.parse(e.rechecked_at), label + ' sample collected after its recheck');
  }
});
