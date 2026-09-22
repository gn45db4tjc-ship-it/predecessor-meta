# 2.31.1 — September 22 build review for live patch 1.17

This update replaces the September 14 automatic starting recommendations with a separately dated build review. All 93 existing hero/role plans have a verdict: **25 changed, 61 checked and retained, 7 unresolved**. The supported 86 starting builds work in all six rank selections. Gold+ remains the editorial reference; the recommendations do not claim rank-specific performance.

Examples of changes:

- Yin Jungle no longer claims Onixian Quiver's ranged extra projectiles. Her plan explains the melee critical-chance and low-health mitigation effects.
- Greystone Offlane brings Giant's Ring ahead of Aegis Of Agawar after the durability changes.
- Serath Jungle uses Thraex with Savage Strikes and Ferocity; Weald remains a discussed alternative.
- Affected plans account for Ground restrictions, Steel's Heavy Metal spell-shield fix, Gideon and Legion changes, and changed Eternal, blessing and item values.

The review ledger is [strategy-reviews/2026-09-22-build-review.json](strategy-reviews/2026-09-22-build-review.json). It records the actual review date, decisions, alternatives, limitations, source dates, packet checksum and independent publisher confirmation that 1.17 was live. The official notes and Omeda kits/items were checked again on September 22. Pred.gg remains subject to its existing access pause; no paid API or access bypass was used.

## Evidence boundaries

This is a **build-only patch transition**, not a completed full weekly strategy review. Tiers, pairings, counters, compositions, description corrections and authored level-by-level skill orders retain their separate status and dates. The existing review schedule is unchanged. Automatic match adaptations remain withheld where the broader current-patch kit/item review is still missing; the starting plan and its reviewed alternatives are available.

Observed statistics, sample counts, source timestamps and statistical patch labels are unchanged. The retained Statz dataset is still labelled 1.16; this release does not claim new 1.17 outcome samples. Neither rendering nor republishing a bundle refreshes its collection date.

Missing rank-local loadout descriptions can use a separately sourced mechanics definition from another checksum-verified public bundle. Its original rank, patch label, date and exact source remain visible. **No rates or samples cross between brackets.** A conflicting local definition prevents endorsement; it cannot be hidden by the fallback.

Seven experimental combinations remain unresolved: Akeron Support, Ikra Support, Maco Midlane, Scarlett Midlane, The Fey Carry, Wraith Support and Wukong Offlane. Each states a reason and retains its September 14 plan for inspection. Valmont has no complete source kit/loadout record in the collected roster and is explicitly recorded as a coverage gap.

## Runtime and interface

Build reviews have their own official article fingerprints and exact kit/item/loadout preconditions. A changed hotfix, new live patch, conflicting mechanics, incompatible blessings, missing item or unavailable patch verification withholds the recommendation. No missing statistic becomes a zero.

The phone build screen shows the actual September 22 review date, patch and current-sample limitation. Meta also removes the duplicate "Hero name" sort when current rankings are unavailable: the menu offers alphabetical order and previous-dataset win rate, while retaining the saved tier preference for when it becomes usable again. Sources distinguishes the latest build review from the previous full strategy review. Unresolved plans show the September 14 fallback; if a future patch invalidates a completed September 22 plan, that newer plan becomes the historical fallback instead of reverting two reviews back. Manual variant selection and saved picks remain intact.

Saved-source publication can apply this editorial update even while optional Pred.gg is unavailable. It preserves existing observations and all other guidance dates. The current compact-core projection grows by about 40 KB compressed per rank (roughly 5.5%).

## Validation and reproduction

See [RELEASE-2.31.1-VERIFICATION.json](RELEASE-2.31.1-VERIFICATION.json). Python and JavaScript regressions cover the independent review gate, same-version hotfix invalidation, missing-versus-conflicting definitions, incompatible loadouts, explicit unresolved verdicts and source-preserving replay.

The existing build-label/overlap browser probes now explicitly restore the authored plans belonging to their committed historical seed. They test the same historical mechanics as before; the production gate is not relaxed to make a future review work against an older patch. X1 also requires nonempty slots, preventing a vacuous pass.

The new real-bundle check runs with `PREVIEW_URL` pointing to a locally staged six-bracket review site:

```
node tests/browser_build_patch_review.cjs
```

The site is created with `tests/stage_preview.py`, supplying each original checksum-verified bracket bundle via `--seed`, plus output/state folders inside `qa/`. It exercises 320px, 390px and desktop, both themes, all six rank selections, saved picks, mechanics dialogs, Sources, historical fallback and hotfix invalidation. This is separate from CI's intentionally older committed seed. Physical phone and screen-reader acceptance are not claimed.

## Release and recovery

This document describes the staged candidate. Exact-head CI, installation, publication and live acceptance are recorded separately; this file alone is not evidence of deployment. Strategy publication retains the approval boundary in [STRATEGY-REVIEW-POLICY.md](STRATEGY-REVIEW-POLICY.md).

After approval and publication, the home-screen app can use **More → Check app update → Update app**, then **Reload latest data**. Do not uninstall or clear website data. The 2.31.0-to-new-shell migration was tested with the real prior worker and retained picks.

Installation must first create a hashed backup of replaced program files, including reviewed guidance, and preserve user data, snapshots and settings. Rollback restores that backup. Public rollback reverts the release merge through the existing verification and publication workflow; it does not rewrite historical source bundles.
