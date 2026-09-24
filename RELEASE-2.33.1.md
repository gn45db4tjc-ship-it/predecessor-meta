# 2.33.1 — item catalogue without Pred.gg

This release fixes the empty Items & loadouts screen on the published 1.17 ranks and one misleading Compose message. The engine's recommendations, evidence rules, reviewed guidance, statistics and source dates are unchanged.

## What changes for you

- **Items & loadouts lists the items again.** On all six published 1.17 ranks the screen showed "Showing 0 of 0 entries" and "No entries match this search and category", even with an empty search box. The Pred.gg catalogue collection for patch 1.17 failed ("Pred.gg catalog hero join failed"), and the screen only read that catalogue.
  - When Pred.gg has no catalogue, the screen now lists the item and perk definitions the other sources supplied: 270 items and 206 augments, Eternals and blessings on Gold+.
  - Each entry names its source: Statz, Omeda.city or Official review. Nothing is labelled as Pred.gg, and a missing price or rarity stays blank.
  - A collapsed amber note says Pred.gg is unavailable, why, and which sources are listed instead, with their dataset and fetch dates.
  - Opening an entry shows the same dialog as before, with its source and any official patch changes.
  - When a publication has the Pred.gg catalogue (for example the committed Gold seed), the screen is unchanged.
  - If no source supplied any definitions, the empty state now says Pred.gg is unavailable instead of blaming the search.
- **Compose explains the one setting that helps.** With no eligible role-statistics source, the default search cannot fill any role. The empty result now says that turning on "Allow fills without role samples" is the way to fill open roles, instead of "Change a constraint to continue".

## Verification

- Browser probes LB1 and LB2 in `tests/browser_audit_regressions.cjs` reproduced both findings on 2.33.0, with the seed set to the published 1.17 state. They were recorded as open in `tests/known-defects.json` and are closed by the fix.
- `tests/library_catalogue.test.cjs` covers the catalogue choice, source tags, missing values and the empty case. Its fixture has the shape of the live bundles, and it also runs on the committed seed.
- A site staged from the six published 2.33.0 bundles (sha256 checked against the live manifest) lists 40 of 270 items and 40 of 206 perks on Gold+. The design suite check "item catalogue lists its first page in compact rows" passes there.

## Compatibility

App version and service-worker shell cache advance together to 2.33.1. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
