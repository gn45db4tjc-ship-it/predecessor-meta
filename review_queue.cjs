'use strict';
/* Strategy review queue: prepares review packets for a human reviewer and publishes them under review/.

   It reads the rendered site (manifest + the reference bracket's bundle, checksum-verified) and asks the
   engine for a packet. It is read-only with respect to the publication: it never changes a bundle, the
   manifest, a review status, a review date or a recommendation, and it never rewrites an existing packet.

   A packet is added when its identity (live patch fingerprint + guidance review date + ISO week) is new AND
     - nothing has been queued yet for this patch fingerprint and review date (patch, hotfix or new review), or
     - it is Sunday (UTC), the weekly review day, or
     - the engine reports the review as due.
   Otherwise the existing queue is republished unchanged. The newest KEEP packets are retained.

     node review_queue.cjs --state-dir .cloud-state --site _site */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const Meta = require('./engine.js');

const KEEP = 8, REFERENCE = 'gold';
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

function build({site, stateDir, now = Date.now(), keep = KEEP, reference = REFERENCE}) {
  const queue = path.join(stateDir, 'review'), out = path.join(site, 'review');
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'manifest.json'), 'utf8'));
  const entry = manifest.cohorts?.[reference];
  let created = null, reason;
  if (entry?.status !== 'available' || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || entry.url !== 'bundles/' + reference + '-' + entry.sha256 + '.json') {
    reason = 'The ' + reference + ' reference publication is unavailable; no packet was prepared.';
  } else {
    const raw = fs.readFileSync(path.join(site, entry.url));
    if (sha256(raw) !== entry.sha256) throw new Error('The reference bundle does not match its published checksum; no packet was prepared.');
    const bundle = JSON.parse(raw), packet = Meta.create(bundle).reviewPacket({now, revision: entry.sha256, cohorts: manifest.cohorts});
    const id = packet.identity.id, existing = queued(queue);
    if (!SAFE_ID.test(id)) throw new Error('The packet identity is not a safe file name: ' + id);
    const need = id.slice(0, id.lastIndexOf('_') + 1);   // patch fingerprint + review date, without the week
    if (existing.some(e => e.id === id)) reason = 'A packet for this patch, review date and week is already queued.';
    else if (!existing.some(e => e.id.startsWith(need)) || new Date(now).getUTCDay() === 0 || packet.guidance.due) {
      fs.mkdirSync(queue, {recursive: true});
      const temp = path.join(queue, id + '.tmp');
      fs.writeFileSync(temp, JSON.stringify(packet));
      fs.renameSync(temp, path.join(queue, id + '.json'));
      created = id; reason = 'Prepared for human review.';
    } else reason = 'Nothing new to review: same patch and review date, not Sunday, review not due.';
  }
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
      plans: packet.plans.length, plans_needing_attention: packet.plans_needing_attention.length}))};
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
  return {created, reason, queued: kept.map(item => item.id)};
}

module.exports = {build};

if (require.main === module) {
  const args = process.argv.slice(2), value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
  const result = build({site: path.resolve(value('--site', '_site')), stateDir: path.resolve(value('--state-dir', '.cloud-state')),
    now: value('--now') ? Date.parse(value('--now')) : Date.now()});
  console.log(JSON.stringify(result));
}
