'use strict';
/* The cloud review queue: when packets are prepared, how they are deduplicated, and that preparing one
   never touches the publication. Every site below is a synthetic fixture in a temporary folder. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const {build} = require('../review_queue.cjs');
const Meta = require('../engine.js');
const idOf = (b, now) => Meta.create(b).reviewPacket({now}).identity.id;

const WEDNESDAY = Date.parse('2026-09-16T12:00:00Z'), SUNDAY = Date.parse('2026-09-20T18:00:00Z'), day = 86400000;
function bundle({fingerprint = 'f'.repeat(64), reviewed = '2026-09-14T19:12:40-05:00', next = '2026-09-27T13:15:00-05:00'} = {}) {
  return {tool_version: 'test', patch: '1.16', generated_at: '2026-09-16T09:00:00Z', bracket: {segment: 'gold', label: 'Gold+'}, pairs: {},
    heroes: {alpha: {slug: 'alpha', display_name: 'Alpha Fixture', roles_order: ['jungle'], roles: {jungle: {status: 'ok', winRate: 51, pickRate: 4, playedGames: 300}}}},
    official: {status: 'verified', live: {version: '1.16.4', fingerprint}},
    official_changes: [{patch: '1.16.4', kind: 'hero', key: 'alpha', name: 'Alpha Fixture', field: 'Q', change: 'Synthetic change'}], official_hotfix_changes: [],
    sources: {statz_tierlist: {status: 'ok', fetched_at: '2026-09-16T08:30:00Z'}, statz_hero_pages: {status: 'ok', fetched_at: '2026-09-16T08:30:00Z'}},
    guidance: {patch: '1.16.4', status: 'reviewed for current patch', reviewed_at: reviewed, maintenance_review: {next_weekly_review: next},
      builds: [{slug: 'alpha', role: 'jungle', patch: '1.16.4', core: [], finish: [], blessings: [], maintenance_review: {result: 'checked and retained'}}]}};
}
function site(root, b) {
  const raw = Buffer.from(JSON.stringify(b)), digest = crypto.createHash('sha256').update(raw).digest('hex'), folder = path.join(root, 'site');
  fs.rmSync(folder, {recursive: true, force: true});
  fs.mkdirSync(path.join(folder, 'bundles'), {recursive: true});
  fs.writeFileSync(path.join(folder, 'bundles', 'gold-' + digest + '.json'), raw);
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify({schema: 2, cohorts: {gold: {label: 'Gold+', status: 'available', url: 'bundles/gold-' + digest + '.json', sha256: digest, generated_at: b.generated_at}, silver: {label: 'Silver+', status: 'unavailable'}}}));
  return folder;
}
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-queue-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return {root, stateDir: path.join(root, 'state')};
}
const index = folder => JSON.parse(fs.readFileSync(path.join(folder, 'review', 'index.json'), 'utf8'));

test('the first run for a patch prepares one packet and publishes it with a checksum', t => {
  const {root, stateDir} = workspace(t), folder = site(root, bundle());
  const result = build({site: folder, stateDir, now: WEDNESDAY});
  assert.equal(result.created, idOf(bundle(), WEDNESDAY));
  assert.match(result.created, /^1\.16\.4_[0-9a-f]{12}_2026-09-14_2026-W38$/);
  const listed = index(folder);
  assert.equal(listed.packets.length, 1);
  const raw = fs.readFileSync(path.join(folder, listed.packets[0].url));
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), listed.packets[0].sha256);
  assert.equal(JSON.parse(raw).official_changes.length, 1);
  assert.match(listed.note, /changes no review status/);
});

test('daily runs in the same week never duplicate or rewrite a packet', t => {
  const {root, stateDir} = workspace(t);
  const first = build({site: site(root, bundle()), stateDir, now: WEDNESDAY}).created, file = path.join(stateDir, 'review', first + '.json'), before = fs.readFileSync(file, 'utf8');
  for (const now of [WEDNESDAY + day, WEDNESDAY + 2 * day, SUNDAY]) assert.equal(build({site: site(root, bundle()), stateDir, now}).created, null);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'an existing packet keeps its original content and date');
  assert.equal(index(path.join(root, 'site')).packets.length, 1);
});

test('a quiet new week waits for Sunday; a due review does not wait', t => {
  const {root, stateDir} = workspace(t);
  build({site: site(root, bundle()), stateDir, now: WEDNESDAY});
  assert.equal(build({site: site(root, bundle()), stateDir, now: WEDNESDAY + 7 * day}).created, null, 'mid-week, nothing changed, review not due');
  assert.equal(build({site: site(root, bundle()), stateDir, now: SUNDAY + 7 * day}).created, idOf(bundle(), SUNDAY + 7 * day));
  const overdue = bundle({next: '2026-09-20T13:15:00-05:00'}), s = workspace(t);
  build({site: site(s.root, overdue), stateDir: s.stateDir, now: WEDNESDAY});
  assert.equal(build({site: site(s.root, overdue), stateDir: s.stateDir, now: WEDNESDAY + 7 * day}).created, idOf(overdue, WEDNESDAY + 7 * day));
});

test('a hotfix or a new human review is queued immediately, whatever the day', t => {
  const {root, stateDir} = workspace(t);
  build({site: site(root, bundle()), stateDir, now: WEDNESDAY});
  assert.equal(build({site: site(root, bundle({fingerprint: 'e'.repeat(64)})), stateDir, now: WEDNESDAY + day}).created, idOf(bundle({fingerprint: 'e'.repeat(64)}), WEDNESDAY + day));
  assert.equal(build({site: site(root, bundle({fingerprint: 'e'.repeat(64), reviewed: '2026-09-18T10:00:00-05:00'})), stateDir, now: WEDNESDAY + 2 * day}).created, idOf(bundle({fingerprint: 'e'.repeat(64), reviewed: '2026-09-18T10:00:00-05:00'}), WEDNESDAY + 2 * day));
  assert.equal(index(path.join(root, 'site')).packets.length, 3);
});

test('preparing a packet never changes the publication', t => {
  const {root, stateDir} = workspace(t), folder = site(root, bundle());
  const snapshot = () => Object.fromEntries(['manifest.json', ...fs.readdirSync(path.join(folder, 'bundles')).map(n => 'bundles/' + n)].map(n => [n, fs.readFileSync(path.join(folder, n), 'utf8')]));
  const before = snapshot();
  build({site: folder, stateDir, now: WEDNESDAY});
  assert.deepEqual(snapshot(), before);
});

test('a bundle that does not match its published checksum is refused', t => {
  const {root, stateDir} = workspace(t), folder = site(root, bundle()), name = fs.readdirSync(path.join(folder, 'bundles'))[0];
  fs.appendFileSync(path.join(folder, 'bundles', name), ' ');
  assert.throws(() => build({site: folder, stateDir, now: WEDNESDAY}), /does not match its published checksum/);
  assert.equal(fs.existsSync(path.join(stateDir, 'review')), false);
});

test('an unavailable reference bracket prepares nothing and keeps the existing queue published', t => {
  const {root, stateDir} = workspace(t);
  build({site: site(root, bundle()), stateDir, now: WEDNESDAY});
  const folder = site(root, bundle()), manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  manifest.cohorts.gold = {label: 'Gold+', status: 'unavailable'};
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  const result = build({site: folder, stateDir, now: SUNDAY});
  assert.equal(result.created, null); assert.match(result.reason, /unavailable/);
  assert.equal(index(folder).packets.length, 1);
});

test('the weekly Sunday packet waits for that day\'s collection, so it references the bundles then published', t => {
  const {root, stateDir} = workspace(t);
  build({site: site(root, bundle()), stateDir, now: WEDNESDAY});
  const early = Date.parse('2026-09-27T02:23:00Z'), after = Date.parse('2026-09-27T17:30:00Z');
  assert.equal(build({site: site(root, bundle()), stateDir, now: early}).created, null, 'the 02:23 patch check only runs 15 hours before the collection');
  assert.equal(build({site: site(root, bundle()), stateDir, now: after}).created, idOf(bundle(), after));
});

test('a hotfix on the preceding launch article is queued immediately, even though the live article is unchanged', t => {
  const {root, stateDir} = workspace(t);
  const withLaunch = note => { const b = bundle(); b.official.articles = [{version: '1.16', status: 'live', fingerprint: note}]; return b; };
  build({site: site(root, withLaunch('launch')), stateDir, now: WEDNESDAY});
  assert.equal(build({site: site(root, withLaunch('launch plus hotfix 1.16.5')), stateDir, now: WEDNESDAY + day}).created, idOf(withLaunch('launch plus hotfix 1.16.5'), WEDNESDAY + day));
});

test('only the newest packets are kept', t => {
  const {root, stateDir} = workspace(t);
  for (let week = 0; week < 5; week++) build({site: site(root, bundle()), stateDir, now: SUNDAY + week * 7 * day, keep: 3});
  const listed = index(path.join(root, 'site')).packets;
  assert.deepEqual(listed.map(p => p.iso_week), ['2026-W42', '2026-W41', '2026-W40']);
  assert.equal(fs.readdirSync(path.join(stateDir, 'review')).length, 3);
});
