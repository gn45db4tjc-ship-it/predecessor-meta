# 2.34.6 — Pred.gg 1.17 sample across Hotfix 1.17.1

After Hotfix 1.17.1, Pred.gg's newest version became "1.17.1" (version 168), and the collector refused every Pred.gg sample. On the live site, the reviewed Gold+ tiers then showed "Review covers a different cohort", and all 85 were withheld. This release counts the whole 1.17 line, the games before and after the hotfix, as one sample, and labels it that way. Builds, strategy notes, statistics methods and source dates are otherwise unchanged.

## What was wrong

- The collector required Pred.gg's newest version to be the official live patch: 1.17, which is Pred.gg version 167. When Pred.gg added version 168 for Hotfix 1.17.1, every Pred.gg collection stopped with "newest version differs from the verified official live patch".
- 2.34.5 let collections verify the hotfix again. The first cloud collection then replaced the Gold+ bundle that still held the 24 Sep morning Pred.gg sample. The cloud cannot collect Pred.gg itself, so the new bundle had no Pred.gg sample, and the tiers disappeared that evening instead of on 25 Sep.

## What changes

- **One sample for the 1.17 line.** Will chose to include games from before and after the hotfix. The Pred.gg sample now covers versions 167 and 168 and is labelled "Pred.gg 1.17 + Hotfix 1.17.1 (versions 167, 168)". The label appears in the performance policy and on Pred.gg source lines.
- **Only verified hotfixes count.** A Pred.gg version is added only when the verified official 1.17 article lists that hotfix as live. That is the check 2.34.5 introduced. Any other newest version still withholds the current-patch label.
- **Definitions from the newest version.** Item, Eternal and kit definitions come from version 168, the hotfix. Win rates and samples use both versions.
- **Samples straddle the hotfix.** As recorded in the 2.34.5 review, pre-hotfix games are included, when Sanguine Banquet's mana regeneration and Black Hole's interrupted cast behaved incorrectly. Rates are shown as observed.
- **History.** Pred.gg history accepts the two-version sample. It is never compared with the earlier 1.17-only sample, because the two cover different games.

## Verification

- `tests/test_static_pred_hotfix_cohort.py`: 7 tests, all failing on 2.34.5. They cover the verified hotfix, the unverified and off-line refusals, a hotfix Pred.gg has not listed yet, observation and definition versions, and history.
- `tests/pred_hotfix_cohort.test.cjs`: 4 engine tests, all failing on 2.34.5. They cover the two-version item scope, a row for one version only, a mismatched URL filter, and the label.
- Against live Pred.gg, with the collector's Python runtime:
  - The official check verifies 1.17 with Hotfix 1.17.1.
  - The Pred.gg cohort is versions 167 and 168. All five Gold+ roles return 55 heroes each, and Pred.gg echoes both versions.
  - Items for version 168 return 270 definitions tagged 168.
- On the live 2.34.5 Gold+ bundle, with that fresh sample, reviewed tiers go from 0 to 78 of 85 active, and role statistics are current. Builds stay 90 of 97. Six tiers have fewer than 100 current games, and one is flagged because its rate moved at least 3 points since the review.
- Python and JavaScript suites pass.

## Getting the tiers back on the live site

The cloud cannot collect Pred.gg, so the Pred.gg sample comes from the Windows collector. The tiers return after all three steps:

1. 2.34.6 is published.
2. 2.34.6 is installed in the Windows app and collector.
3. A Windows collection has run and published.

The collector still runs 2.34.4, which also fails the official hotfix check.

## Compatibility

App version and service-worker shell cache advance together to 2.34.6. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
