# 2.21.6 — Optional public Pred.gg

Pred.gg no longer requires API access to participate in updates. The collector accepts only the existing public hero, item and Eternal page routes and their game filters. API, authentication, external and unknown routes are rejected before a request. Public embedded data must still pass the original numeric, identity, patch, mode and rank validation.

If a page lacks structured data, its failure is visible and the next daily collection can check it again. Public HTTP 401/403/429 and embedded access denials persist a stop in the collector cache; a forced refresh cannot bypass it. Other sources continue. A successful required-source update with only optional Pred.gg gaps no longer fails the publication job or triggers repeated patch catch-up pulls. Source rows remain partial/unavailable or retained, with original timestamps. Other source errors and interrupted or invalid collections remain failures.

The website explains this policy in Sources & accuracy. Existing Builds, Live game, all six brackets, 93 authored role plans, experimental-role safeguards, phone layouts and both themes are unchanged. Weekly strategy review with priority for newly live patches/hotfixes remains separately scheduled in Codex; missing optional Pred.gg evidence alone no longer blocks it. No support message, API request, credentials, new paid service or statistical estimate was introduced.

A live refresh also exposed a pre-existing partial-publication edge case: a single Statz page failure could be recorded only as a warning. The publisher now adds the explicit structural validation reason before saving independently valid Pred.gg data. The missing Statz page stays unavailable and still raises a required-source failure.

## Verification

- 82 Python publication/ingestion tests pass, including 13 new optional-source tests.
- 37 JavaScript recommendation tests pass.
- Browser: staged 2.21.6 opens; Sources & accuracy displays the optional public-page policy and dated source status.
- Re-rendering the prior Gold+ bundle preserves observed source projections, original dates and all 93 plans.
- Live public checks on September 14: the public index exposes its catalog; the Gold+ jungle page validates all 54 heroes for 1.16.4 / RANKED / the selected ranks. This is observed source availability, not a guarantee of future availability or complete game-server coverage.
- A full six-bracket refresh is performed separately; its source-by-source receipt and timing are retained with this release's local evidence. A refresh never advances the authored strategy review date.

## Installation and rollback

Source is staged and tested before replacing the installed Python program and publisher source. The install writes a hashed source backup and preserves existing data/settings. Use Roll Back 2.21.6.bat with the app closed to restore 2.21.5 code. Refreshed game data, when installed separately, has its own prior-file backup. The source-only ZIP includes the manifest and tests; no caches, publishing credentials or saved drafts are included.
