'use strict';
/* Strategy review queue: prepares review packets for a human reviewer and publishes them under review/.

   It reads the rendered site (manifest + the reference bracket's bundle, checksum-verified) and asks the
   engine for a packet. It is read-only with respect to the publication: it never changes a bundle, the
   manifest, a review status, a review date or a recommendation, and it never rewrites an existing packet.

   A packet is added when its identity (signature of every live official article + guidance review date + ISO week)
   is new AND
     - nothing has been queued yet for this signature and review date (patch, hotfix on any live article, or a
       new human review), or
     - it is Sunday (UTC) at or after the daily collection time, so it describes that day's bundles, or
     - the engine reports the review as due.
   Otherwise the existing queue is republished unchanged. The newest KEEP packets are retained.

   Since 2.47.0 (freshness Phase 4) the index also lists the recheck queue the scheduled reviewer works from
   (engine recheckQueue: withheld grades, plans whose mechanics changed, mechanics notices, new heroes, patch changes),
   each with the date it was first queued, kept in state so a missed run stays due. The weekly backstop is queued
   after Sunday's daily collection and clears only when the reviewed guidance logs a weekly pass for that ISO week
   (guidance.recheck_log).

     node review_queue.cjs --state-dir .cloud-state --site _site */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Meta = require('./engine.js');

const KEEP = 8, REFERENCE = 'gold';
// The daily collection time (UTC). The weekly Sunday packet waits for it, so it describes that day's collection.
const DAILY_UTC = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'free_hosting.json'), 'utf8')).daily_utc || '17:23'; } catch { return '17:23'; } })();
const afterDailyCollection = now => { const [h, m] = DAILY_UTC.split(':').map(Number), d = new Date(now); return d.getUTCHours() * 60 + d.getUTCMinutes() >= h * 60 + m; };
const sha256 = raw => crypto.createHash('sha256').update(raw).digest('hex');
const SAFE_ID = /^[0-9A-Za-z._-]{8,120}$/;

function queued(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json') && name !== 'index.json' && SAFE_ID.test(name.slice(0, -5))).map(name => {
    const raw = fs.readFileSync(path.join(folder, name)), packet = JSON.parse(raw);
    return {id: name.slice(0, -5), file: name, raw, packet};
  }).filter(entry => entry.packet?.schema === 2 && entry.packet.identity?.id === entry.id)
    .sort((a, b) => Date.parse(b.packet.generated_at) - Date.parse(a.packet.generated_at));
}

function isoWeek(ms) {
  const d = new Date(ms), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, '0');
}

// The recheck queue with first-queued dates. Without a verified reference bundle the queue is unknown, not empty.
function rechecks({bundle, stateDir, now}) {
  if (!bundle) return null;
  const file = path.join(stateDir, 'rechecks.json'), stamp = new Date(now).toISOString();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { state = {}; }
  const items = Meta.create(bundle).recheckQueue();
  const logged = week => (bundle.guidance?.recheck_log || []).some(r => r?.kind === 'weekly' && r.week === week);
  let weekly = state.weekly_due && !logged(state.weekly_due.week) ? state.weekly_due : null;
  if (new Date(now).getUTCDay() === 0 && afterDailyCollection(now) && !logged(isoWeek(now)) && weekly?.week !== isoWeek(now))
    weekly = {week: isoWeek(now), since: weekly?.since || stamp};   // a missed weekly pass keeps its original date
  if (weekly) items.push({id: 'weekly:' + weekly.week, kind: 'weekly', priority: 6,
    reason: "Weekly backstop after Sunday's collection: check every withheld grade and inactive plan, and log the pass."});
  const before = state.first_queued || {}, first = {};
  for (const item of items) first[item.id] = item.kind === 'weekly' ? weekly.since : before[item.id] || stamp;
  fs.mkdirSync(stateDir, {recursive: true});
  fs.writeFileSync(file, JSON.stringify({first_queued: first, weekly_due: weekly}, null, 1));
  return items.map(item => ({...item, first_queued_at: first[item.id]}));
}

function build({site, stateDir, now = Date.now(), keep = KEEP, reference = REFERENCE}) {
  const queue = path.join(stateDir, 'review'), out = path.join(site, 'review');
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'manifest.json'), 'utf8'));
  const entry = manifest.cohorts?.[reference];
  let created = null, reason, bundle = null;
  if (entry?.status !== 'available' || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || entry.url !== 'bundles/' + reference + '-' + entry.sha256 + '.json') {
    reason = 'The ' + reference + ' reference publication is unavailable; no packet was prepared.';
  } else {
    const raw = fs.readFileSync(path.join(site, entry.url));
    if (sha256(raw) !== entry.sha256) throw new Error('The reference bundle does not match its published checksum; no packet was prepared.');
    bundle = JSON.parse(raw);
    const packet = Meta.create(bundle).reviewPacket({now, revision: entry.sha256, cohorts: manifest.cohorts});
    const id = packet.identity.id, existing = queued(queue);
    if (!SAFE_ID.test(id)) throw new Error('The packet identity is not a safe file name: ' + id);
    const need = id.slice(0, id.lastIndexOf('_') + 1);   // patch fingerprint + review date, without the week
    if (existing.some(e => e.id === id)) reason = 'A packet for this patch, review date and week is already queued.';
    else if (!existing.some(e => e.id.startsWith(need)) || (new Date(now).getUTCDay() === 0 && afterDailyCollection(now)) || packet.guidance.due) {
      fs.mkdirSync(queue, {recursive: true});
      const temp = path.join(queue, id + '.tmp');
      fs.writeFileSync(temp, JSON.stringify(packet));
      fs.renameSync(temp, path.join(queue, id + '.json'));
      created = id; reason = 'Prepared for human review.';
    } else reason = 'Nothing new to review: same patch and review date, not Sunday, review not due.';
  }
  const queuedRechecks = rechecks({bundle, stateDir, now});
  const all = queued(queue);
  for (const old of all.slice(keep)) fs.rmSync(path.join(queue, old.file));
  const kept = all.slice(0, keep);
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out, {recursive: true});
  for (const item of kept) fs.writeFileSync(path.join(out, item.file), item.raw);
  const index = {schema: 1, updated_at: new Date(now).toISOString(), reference_bracket: reference,
    note: 'Packets are prepared for human review. Preparing one changes no review status, review date, recommendation or observation.',
    packets: kept.map(({id, file, raw, packet}) => ({id, url: 'review/' + file, sha256: sha256(raw), bytes: raw.length, generated_at: packet.generated_at,
      live_version: packet.identity.live_version, iso_week: packet.identity.iso_week, guidance_reviewed_at: packet.identity.guidance_reviewed_at,
      review_due: !!packet.guidance?.due, official_changes: packet.official_changes.length, hotfix_changes: packet.hotfix_changes.length,
      plans: packet.plans.length, plans_needing_attention: packet.plans_needing_attention.length})),
    rechecks: queuedRechecks,
    rechecks_note: queuedRechecks ? 'Rechecks for the scheduled reviewer, grades first. Each stays queued until its condition clears; listing one changes no review status or date.'
      : 'The ' + reference + ' reference publication is unavailable, so the recheck queue is unknown.'};
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
  return {created, reason, queued: kept.map(item => item.id), rechecks: queuedRechecks ? queuedRechecks.map(item => item.id) : null};
}

module.exports = {build};

if (require.main === module) {
  const args = process.argv.slice(2), value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
  const result = build({site: path.resolve(value('--site', '_site')), stateDir: path.resolve(value('--state-dir', '.cloud-state')),
    now: value('--now') ? Date.parse(value('--now')) : Date.now()});
  console.log(JSON.stringify(result));
}
