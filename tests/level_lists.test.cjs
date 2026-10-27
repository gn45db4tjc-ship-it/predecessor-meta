'use strict';
/* 27 Oct 2026: a malformed per-level list in kit text is shown as its range (MetaEngine.levelLists), never raw.
   Probe first: on main 5b388f0 with the live bundles of 18 and 26 Oct 2026 (patch 1.17.2, Pred.gg 169), Muriel's
   Sentinel card shows "25/25/25/25/25/25/35/.../45/45/35/45%", and while the packet is current the nightly live check
   fails "Malformed raw progression stays collapsed" (tests/legacy/browser_correction_acceptance.js). The 1.17
   correction that rewrote it applies only on 1.17. */
const test = require('node:test'), assert = require('node:assert/strict');
const Meta = require('../engine.js');

const sentinel = "Muriel's damaging abilities reduce Enemy Healing by 25/25/25/25/25/25/35/35/35/35/35/35/45/45/45/45/45/45/35/45% for 4s.\nAllies affected by Muriel's abilities gain 10% (+0.4% per Level) increased Healing and Shielding Received for 4s.";

test('a per-level list with repeats that goes back down is shown as its range and kept as published', () => {
  const r = Meta.levelLists(sentinel);
  assert.doesNotMatch(r.text, /25\/25\/25/);
  assert.match(r.text, /Enemy Healing by 25–45% for 4s\./);
  assert.match(r.text, /10% \(\+0\.4% per Level\)/);
  assert.deepEqual(r.lists, [{raw: '25/25/25/25/25/25/35/35/35/35/35/35/45/45/45/45/45/45/35/45%', low: 25, high: 45, unit: '%'}]);
});

test('more values than the 18 hero levels is malformed even when the list only rises', () => {
  const list = Array.from({length: 19}, (_, i) => 10 + i).join('/');
  const r = Meta.levelLists('Gains ' + list + ' armor.');
  assert.equal(r.text, 'Gains 10–28 armor.');
  assert.equal(r.lists[0].raw, list);
});

test('clean rank and per-level progressions are left as written', () => {
  for (const text of [
    'Deals 70/105/140/175/210 (+50% magical power) magical damage and Slows for 1/1.05/1.1/1.15/1.2s.',
    'Bonus 25/25/25/25/25/25/35/35/35/35/35/35/45/45/45/45/45/45% at each level.',
    'Heals 10/12/14/16/18/20/22/24/26/28/30/32/34/36/38/40/42/44 per second.',
    'Cooldown 20/18/16/14/12/10s.']) {
    const r = Meta.levelLists(text);
    assert.equal(r.text, text);
    assert.deepEqual(r.lists, []);
  }
});

test('missing text stays empty', () => {
  assert.deepEqual(Meta.levelLists(undefined), {text: '', lists: []});
  assert.deepEqual(Meta.levelLists(null), {text: '', lists: []});
});
