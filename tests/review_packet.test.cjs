'use strict';
/* Strategy review packet, version 2 (audit defect G and backlog item 08). The packet is prepared for a
   human reviewer: it carries the official and hotfix changes, links them to the reviewed plans they
   touch, and references the publication it was built from. Building it is read-only. Synthetic fixtures. */
const test = require('node:test'), assert = require('node:assert/strict');
const Meta = require('../engine.js');

const NOW = Date.parse('2026-09-18T12:00:00Z');
const change = (patch, kind, key, name, extra = {}) => ({patch, kind, key, name, field: 'Stat', change: 'Synthetic change', source: 'https://example.test/notes', fetched_at: '2026-09-14T10:00:00Z', ...extra});
function bundle() {
  const plan = (slug, core, result, extra = {}) => ({slug, role: 'jungle', title: 'Synthetic plan', patch: '1.16.4', core, finish: [], crest: 'Test Crest', augment: null, eternal: null, blessings: ['Test Blessing'],
    maintenance_review: {result, reviewed_at: '2026-09-14T19:00:00Z', reason: 'Synthetic reason', limitation: ''}, ...extra});
  return {tool_version: 'test', patch: '1.16', generated_at: '2026-09-18T09:00:00Z', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {},
    heroes: {alpha: {slug: 'alpha', display_name: 'Alpha Fixture', roles_order: ['jungle'], roles: {jungle: {status: 'ok', winRate: 51, pickRate: 4, playedGames: 300}}},
      beta: {slug: 'beta', display_name: 'Beta Fixture', roles_order: ['jungle'], roles: {jungle: {status: 'ok', winRate: 49, pickRate: 4, playedGames: 300}}}},
    official: {status: 'verified', checked_at: '2026-09-18T08:00:00Z', live: {version: '1.16.4', title: 'Synthetic notes', fingerprint: 'f'.repeat(64), url: 'https://example.test/notes', release_date: '2026-09-01'}},
    official_changes: [change('1.16.4', 'item', 'test-blade', 'Test Blade'), change('1.16.4', 'hero', 'beta', 'Beta Fixture'), change('1.16.4', 'unmapped', null, 'Unrelated Thing')],
    official_hotfix_changes: [change('1.16.3', 'unmapped', null, 'Test Crest', {historical: true}), change('1.16.5', 'perk', 'test-blessing', 'Test Blessing')],
    definition_issues: [{kind: 'perk', key: 'test-blessing', status: 'incompatible slot'}],
    sources: {statz_tierlist: {status: 'ok', fetched_at: '2026-09-18T08:30:00Z'}, statz_hero_pages: {status: 'ok', fetched_at: '2026-09-18T08:30:00Z', url_pattern: 'not needed in a packet'}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', reviewed_at: '2026-09-14T19:12:40-05:00', review_revision: 3,
      maintenance_review: {next_weekly_review: '2026-09-20T13:15:00-05:00', summary: {changed: 0, 'checked and retained': 1, unresolved: 1}},
      builds: [plan('alpha', ['Test Blade'], 'checked and retained'), plan('beta', ['Other Item'], 'unresolved', {blessings: []})]}};
}
const cohorts = {gold: {label: 'Gold+', status: 'available', collection_status: 'complete', sha256: 'a'.repeat(64), generated_at: '2026-09-18T09:00:00Z', patch: '1.16.4',
  source_dates: {statz_tierlist: {status: 'ok', fetched_at: '2026-09-18T08:30:00Z'}}, last_attempt: {status: 'ok'}}, silver: {label: 'Silver+', status: 'unavailable'}};

test('G: the packet carries the official and hotfix changes the bundle carries', () => {
  const p = Meta.create(bundle()).reviewPacket({now: NOW});
  assert.equal(p.schema, 2);
  assert.equal(p.official_changes.length, 3);
  assert.equal(p.hotfix_changes.length, 2);
  assert.equal(p.unmapped_changes, 2);
  assert.ok(p.hotfix_changes.every(c => c.hotfix) && p.official_changes.every(c => !c.hotfix));
  assert.deepEqual(p.definition_conflicts, bundle().definition_issues);
});

test('changes are linked to the reviewed plans they touch, by hero, item, crest and blessing', () => {
  const [alpha, beta] = Meta.create(bundle()).reviewPacket({now: NOW}).plans;
  assert.deepEqual(alpha.affected_by.map(c => c.name), ['Test Blade', 'Test Crest', 'Test Blessing']);
  assert.deepEqual(beta.affected_by.map(c => c.name), ['Beta Fixture', 'Test Crest']);
});

test('only a change from a later patch than the review, or an unresolved result, needs attention', () => {
  const p = Meta.create(bundle()).reviewPacket({now: NOW}), [alpha, beta] = p.plans;
  assert.deepEqual(alpha.affected_by.map(c => c.published_after_review_patch), [false, false, true]);
  assert.equal(alpha.needs_attention, true, 'a 1.16.5 hotfix touches a plan reviewed for 1.16.4');
  assert.equal(beta.needs_attention, true, 'an unresolved plan always needs attention');
  assert.deepEqual(p.plans_needing_attention, ['alpha/jungle', 'beta/jungle']);
  const calm = bundle(); calm.official_hotfix_changes.pop(); calm.guidance.builds[1].maintenance_review.result = 'checked and retained';
  assert.deepEqual(Meta.create(calm).reviewPacket({now: NOW}).plans_needing_attention, [], 'changes already covered by the review patch are listed but not flagged');
});

test('the packet says whether a review is due, and why, with one definition', () => {
  const E = Meta.create(bundle());
  assert.deepEqual(E.strategyReviewDue({now: NOW}), {due: false, reasons: []});
  const late = E.strategyReviewDue({now: Date.parse('2026-09-21T00:00:00Z')});
  assert.equal(late.due, true); assert.match(late.reasons[0], /scheduled review date/);
  const patched = bundle(); patched.official.live.version = '1.17';
  const p = Meta.create(patched).reviewPacket({now: NOW});
  assert.equal(p.guidance.due, true); assert.match(p.guidance.reasons[0], /reviewed for patch 1\.16\.4; the live patch is 1\.17/);
});

test('identity is the live patch fingerprint, the guidance review date and the ISO week', () => {
  const E = Meta.create(bundle()), a = E.reviewPacket({now: NOW}), sameWeek = E.reviewPacket({now: NOW + 86400000}), nextWeek = E.reviewPacket({now: NOW + 5 * 86400000});
  assert.deepEqual(a.identity, {live_version: '1.16.4', live_fingerprint: 'f'.repeat(64), guidance_reviewed_at: '2026-09-14T19:12:40-05:00', iso_week: '2026-W38', id: '1.16.4_ffffffffffff_2026-09-14_2026-W38'});
  assert.equal(sameWeek.identity.id, a.identity.id);
  assert.notEqual(nextWeek.identity.id, a.identity.id);
  const hotfixed = bundle(); hotfixed.official.live.fingerprint = 'e'.repeat(64);
  assert.notEqual(Meta.create(hotfixed).reviewPacket({now: NOW}).identity.id, a.identity.id, 'a same-version hotfix changes the identity');
  assert.match(a.identity.id, /^[0-9A-Za-z._-]+$/, 'safe to use as a file name');
});

test('ISO weeks follow the calendar standard at year boundaries', () => {
  const week = iso => Meta.create(bundle()).reviewPacket({now: Date.parse(iso)}).identity.iso_week;
  assert.equal(week('2026-01-01T12:00:00Z'), '2026-W01');
  assert.equal(week('2027-01-01T12:00:00Z'), '2026-W53');
  assert.equal(week('2024-12-30T12:00:00Z'), '2025-W01');
});

test('the publication it was built from is referenced, all brackets included, with no private fields', () => {
  const p = Meta.create(bundle()).reviewPacket({now: NOW, revision: 'a'.repeat(64), cohorts});
  assert.deepEqual(p.reference_bundle, {bracket: 'gold', label: 'Gold+', generated_at: '2026-09-18T09:00:00Z', sha256: 'a'.repeat(64), refresh_result: null,
    source_dates: {statz_tierlist: {status: 'ok', fetched_at: '2026-09-18T08:30:00Z'}, statz_hero_pages: {status: 'ok', fetched_at: '2026-09-18T08:30:00Z'}}});
  assert.deepEqual(p.brackets.map(b => [b.bracket, b.status, b.sha256]), [['gold', 'available', 'a'.repeat(64)], ['silver', 'unavailable', null]]);
  assert.equal('last_attempt' in p.brackets[0], false);
  assert.equal(Meta.create(bundle()).reviewPacket({now: NOW}).brackets, null, 'without a manifest the packet says so instead of inventing brackets');
});

test('building a packet never changes a review status, a review date or an observation', () => {
  const b = bundle(), before = JSON.stringify(b), E = Meta.create(b);
  const p = E.reviewPacket({now: NOW, cohorts});
  assert.equal(JSON.stringify(b), before);
  assert.match(p.purpose, /changes no review status, review date, recommendation or observation/);
  assert.equal(p.guidance.status, 'reviewed for current patch');
  assert.equal(p.guidance.next_review_at, '2026-09-20T13:15:00-05:00');
  assert.equal(JSON.stringify(E.reviewPacket({now: NOW, cohorts})), JSON.stringify(p), 'the same inputs give the same packet');
});
