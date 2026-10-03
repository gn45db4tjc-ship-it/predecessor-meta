# 2.48.1 — Mechanics notices after a published review

Found on 3 Oct 2026, right after the first scheduled recheck merged (PR #112): the live recheck queue kept two mechanics notices that were wrong, not open questions (issue #109).

## What changes for you

- **The 1.17 corrections see every loadout row again.**
  - A merged review is re-applied at publication by `full_review_replay`. That replay applied the `patch-1.17.json` corrections inside `enrich_bundle`, before the Pred.gg pass added the loadout rows only Pred.gg supplies, and never again.
  - Peal, Hellfire Strikes, Shred Spree and Terminal Treatment then read "conflict: source field missing" although each row was present; the set varied by rank.
  - A fresh collection already applies the supplement a second time after the Pred.gg pass. The replay now does the same.
- **The official correction notice names only unresolved reviewed corrections.**
  - "Official correction review" kept naming Psychosis on every rank after its receipt had been verified against the live Pred.gg text ("source already updated").
  - The Pred.gg reconciliation kept the notice while any receipt conflicted, counting the supplement's receipts, which patch_support reports in its own notice. It never rewrote the names.
  - The notice is now rebuilt from the packet's own correction receipts (`refresh_correction_notice`), both at enrichment and after the Pred.gg reconciliation.
- **Nothing else changes.**
  - No observation, sample, source date, grade or plan changes.
  - Because the version changes, the next publication re-applies the review to every rank once (as in 2.44.0). This replay changes notices and receipts only.

## Real conflicts stay visible

Replaying today's six live bundles (published 3 Oct 07:00 UTC) with this code:

| Rank | Supplement conflicts before → after | Correction notice after |
|---|---|---|
| Bronze+ | Shred Spree, Peal → none | none |
| Silver+ | Peal, Hellfire Strikes → none | none |
| Gold+ | Peal, Hellfire Strikes → none | none |
| Platinum+ | Vital Essence, Hellfire Strikes → Vital Essence | Vital Essence |
| Diamond+ | Vital Essence → Vital Essence | Vital Essence |
| Paragon+ | Vital Essence, Hellfire Strikes, Terminal Treatment → Vital Essence | Vital Essence |

Vital Essence is a genuine source difference. Pred.gg's Platinum+, Diamond+ and Paragon+ pages say "+4g", while Gold+ says "+5g" and the reviewed 1.16.4 text is "+5g". So the conflict stays, and no replacement is guessed. The "Official definition review" notice (Frost Snap, Harmonic Currents, Mending) is unchanged; it stays until official text settles those fields.

In every rank, observations, sample and source dates, and every grade were identical before and after the replay.

## Verification

- **Probes first:** `tests/test_static_correction_order.py`. All five failed on main 67f8532:
  - the replay never applied the supplement after the Pred.gg pass;
  - a Pred.gg-only perk stayed uncorrected;
  - a verified packet correction kept the notice because of a supplement conflict;
  - the notice named a supplement perk;
  - `refresh_correction_notice` did not exist.

  All pass now.
- **Python static tests:** 403, OK (1 skipped). **Node tests:** 396 of 396 pass.
- **Live-bundle replay** across all six ranks: the table above.
