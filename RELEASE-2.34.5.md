# 2.34.5 — Hotfix 1.17.1 verified and reviewed

The publisher released Hotfix 1.17.1 on 24 September 2026. From 12:08 UTC that day, every scheduled publication kept the earlier data and reported a failed official source. This release lets the collector verify the hotfix and records its review. Statistics, source dates and the reviewed advice are unchanged.

## What was wrong

- **The hotfix was published inside the 1.17 article.** The official site added a "Hotfix v1.17.1" heading, a separate "24th September 2026" line and nine fixes. The collector only understood the older one-line label, such as "1.16.3 - 24th August". It found the hotfix without a version or date, so it could not match the publisher's Steam announcement "Hotfix 1.17.1 - Patch Notes".
- **The collector therefore failed safe.** It refused to call the live patch verified and kept the last good data with its original dates, about 07:40 UTC on 24 Sep. It failed each run so the problem was visible.
- **A parser fix alone was not enough.** The hotfix changed the 1.17 article, and every 1.17 review is pinned to that article. On the real data, verifying the new article without a review would have set all reviewed builds (0 of 97) and tiers (0 of 85) to "needs review".

## What changes

- **Verification.** A hotfix is accepted when the live official article lists it on its own patch line with a release date that has passed. For example, 1.17.1 inside the 1.17 article. A hotfix missing from the article, undated, dated in the future, or from another patch line still fails loudly. The nine fixes are kept as official hotfix changes and are not tied to any hero or item.
- **Review of Hotfix 1.17.1.** The re-fetched 1.17 article differs from the reviewed copy only by the hotfix section. Each fix was checked against the reviewed text:
  - **Sanguine Banquet (Valmont):** incorrect mana regeneration was fixed. The hotfix does not say what was wrong or in which direction. The plans quote the official launch text (omnivamp, +2 maximum mana per nearby minion death, +30 per hero death), which the hotfix does not change, and no advice depends on mana regeneration from this augment.
  - **Black Hole (Gideon):** an interrupted cast no longer pulls enemies. The advice already says to interrupt Black Hole before its 2.75-second channel completes and to protect Gideon during it.
  - **The other seven fixes** are a description fix, cosmetic fixes, quest tracking and localisation.
  - **No advice, number or mechanic changes.** The 1.17 review pins move to the re-fetched article, and "no later hotfix published" now reads "Hotfix 1.17.1 checked 24 Sep". A dated `hotfix_reviews` record in `reviewed_guidance.json` keeps both article fingerprints and a verdict for each fix. The patch coverage list gains the nine hotfix lines. The underlying reviews keep their original dates.
  - **Samples straddle the hotfix.** Observed 1.17 rates include games played before 24 Sep, when both defects were present. Rates are shown as observed, and Valmont's and Gideon's grades are rechecked in the planned follow-up review.

## Verification

- `tests/test_static_official_hotfix.py` uses a trimmed copy of the real article. Four of its nine tests failed on 2.34.4, one with the same error the publication runs reported. All nine pass now.
- End to end with the real official site and Steam feed: the official source verifies as 1.17, with Hotfix 1.17.1 live on 24 Sep. On the live Gold+ bundle, 90 of 97 builds and 73 of 85 tiers stay active, match adaptation stays reviewed, and patch support stays active. These are the same counts as the site before the hotfix.
- Python and JavaScript suites pass.

## Known limitation: Pred.gg

Pred.gg now lists Hotfix 1.17.1 as its newest version (168), while the verified official live patch is 1.17 (Pred.gg version 167). The collector requires those to match, so its optional Pred.gg step still fails after this release. Statz, official and other required sources collect normally. Pred.gg observations are kept with their original dates. Features that need a current Pred.gg Gold+ sample, including the reviewed tiers, use that retained sample for at most 30 hours before they are withheld. A follow-up release will let the Pred.gg cohort cover the whole 1.17 line (versions 167 and 168) and label it that way.

## Compatibility

App version and service-worker shell cache advance together to 2.34.5. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals. The Windows collector needs this release too, because it runs the same official check.
