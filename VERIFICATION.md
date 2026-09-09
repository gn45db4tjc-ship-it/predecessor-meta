# Free-hosting verification — September 8, 2026

Status: **public website, Windows collector, unattended upload and automatic deployment verified**. All six rank brackets are live. No paid resources or subscriptions were activated. The installed Documents app and its saved data remain unchanged.

## Current release receipts

- Website: https://gn45db4tjc-ship-it.github.io/predecessor-meta/
- Application deployment: run `34248490290`, commit `965472d366bb2dc2216bc4103c54b523a2414ae3`, passed.
- Automatic Windows-data deployment: run `34248498240`, attempt 2, data commit `7931dd7551a378493bdfaa2bdf12327de50a9974`, passed. Both build and deployment succeeded; source-failure and collection-paused steps were skipped because the imported collector had no errors.
- The first automatic deployment was held by the Pages environment's main-only branch rule. The environment now allows exactly `main` and `data-updates`. Retrying the failed deployment passed; no wildcard branch access or manual approval requirement was added.
- Public-site Edge acceptance verified every bracket selector and all nine routes with no JavaScript errors. The updater timestamp is visible and the obsolete cloud-pause banner is absent. Local receipts: `qa/public-updater-browser.json` and `qa/public-updater-desktop.png`.

## Fresh Windows collection

All six cohorts passed with no source errors in **1,436.01 seconds (23 minutes 56 seconds)**. Each includes 54 complete hero kits, 270 items and 274 perks. Role coverage is source-dependent and is not filled with invented samples.

| Bracket | Source bundle timestamp, Central | Collection seconds | Role coverage |
|---|---|---:|---:|
| Gold | September 8, 10:38:41 | 270.41 | 85 |
| Bronze | September 8, 10:42:38 | 235.64 | 85 |
| Silver | September 8, 10:46:17 | 218.23 | 85 |
| Platinum | September 8, 10:50:18 | 239.93 | 85 |
| Diamond | September 8, 10:53:59 | 220.86 | 86 |
| Paragon | September 8, 10:57:51 | 230.96 | 93 |

Official checking identified live v1.16.4. Statistical source labels and their original fetch times remain separate. No samples are pooled across ranks or relabelled as a narrower patch window.

## Windows installation and publishing

- Sign-in and Desktop manual-update shortcuts are installed under the normal Windows account, using Python 3.12. The background updater was started and verified running. A duplicate launch exited while the original process stayed active.
- Three-hour checks run while the user is signed in and the PC is awake and connected. Full collection follows the daily cycle or a detected live patch/hotfix change. Missed updates are collected when the PC becomes available. Codex does not need to be open.
- Repository-specific SSH authentication and real source/data pushes passed. GitHub's Ed25519 host fingerprint was checked against official documentation; strict host checking is required. The private key is restricted to the Windows account and excluded from packaging.
- The collector stages only allowed public bundles, a status receipt and the fixed reviewed deployment dispatcher. It never force-pushes or sends collected data to `main`. Failed uploads retain prepared data for retry.
- The dispatcher invokes the reusable workflow from `main`. That workflow checks out application code from `main` and imports only seven known JSON filenames from the data branch; it does not execute downloaded data as application code.
- Cloud import validates hashes, rank identity, dates, size and path restrictions. An invalid or older cohort cannot silently replace newer successful data.

## Tests and preservation

- **43 standard-library Python tests pass**, both in the development runtime and under the user's Python 3.12. Coverage includes daily timing, patch/hotfix changes, future announcements, retry limits, source blocks, retained official verification, request deduplication, partial failures, zero-row rejection, checksums, rank identity, public-only export, corrupted/older feeds, path restrictions and restricted data pushes.
- Edge and Windows Playwright WebKit passed at **1440×900** and **390×844**, with the `/project/` prefix used by Pages. Each viewport passed 51 hosting checks and seven existing feature suites containing 671 assertions. Ready times for the rank-display upgrade were 177–320 ms on this machine.
- All nine pages render without overflow or JavaScript errors in those checks. Builds and Live game remain present. Share-plan preview/import, draft restoration, bracket switching, standalone export and retained data after an update failure passed.
- Update checks use static GET requests, without Python API calls or source scraping from the browser. An unavailable cohort or checksum failure is explicit. Exported HTML keeps the exact observations and timestamps; it excludes visitor draft markup. Remote-art failures leave readable names.
- A changed official patch status marks written guidance for review while retained statistics keep their source patch labels. The adapter never changes observed rates or counts.
- The six original runtime files are checked byte-for-byte against the installed app during packaging. Source ZIP hashes and its allowlist are verified, and the clean extracted package passes all 43 Python tests. Owner settings, drafts, local caches, private keys, backups and research conversations are excluded.

## Source boundaries and remaining limitations

### Rank display correction

The six published statistical cohorts were already present and switchable. The previous UI nevertheless put the Gold+ working pool first for every rank and filled other ranks' tier cells with “Review unavailable.” The selected rank now leads with its own observed table; the Gold+ authored tier review remains a collapsed reference, with its scope explicit in the status strip and recommendations. Observations and engine decisions are unchanged.

`tests/browser_ranks.cjs` passed in Edge and Windows WebKit at 1440×900 and 390×844: 30 role/rank tables per viewport, exact displayed rates and game counts, six distinct source rank filters, sorting, hero search, build/counter drill-down, planner labels, rank restoration and a Diamond+ standalone export. The regression specifically checks that other rank tables contain their own observations rather than repeated unavailable-review cells. This correction does not invent authored tiers for unreviewed rank cohorts.

GitHub-hosted collection returned a Pred.gg JavaScript shell without the required embedded data; its isolated anonymous statistics query returned Forbidden. Those routes were stopped. Normal Pred.gg pages work on this Windows PC, and the completed collection above uses that ingestion path. GitHub continues independent official-patch checks and publishes the Windows feed; it does not repeat blocked statistical requests.

The website remains online while the PC is off, using the last successful dated data. Actual collection requires the PC to be available. Source errors and data older than 30 hours remain visible. GitHub schedules can be delayed, and cloud caches can be evicted; the latest data branch and a dated public-only Gold seed provide recovery without manufacturing freshness. The iMac has not been changed.

Windows WebKit provides compatibility evidence, not native Mac/iPhone Safari certification. Automatic statistics refreshes do not author new reviewed strategic advice or resolve undocumented mechanics. These limitations remain labelled in the app.

The initial public deployment and its cloud-source failure receipts remain available in GitHub Actions. Local detailed checks are in the `qa` folder; the packaged `BROWSER-VERIFICATION.json` contains the Edge and WebKit acceptance receipts.

## Design revision 1

Edge (Playwright 1.63, Microsoft Edge 152) against the isolated preview of the six dated fixtures: `browser_static.cjs` 51 checks at 1440×900 and 390×844 plus the seven legacy suites; `browser_ranks.cjs` 30 role/rank tables per viewport; `browser_design.cjs` 69 checks at 1920×1080, 2560×1440 and 1536×864 at device scale 1.25 (125% scaling emulation, not native). Python static tests: 43. Receipts: `qa/edge-static-acceptance.json`, `qa/edge-rank-acceptance.json`, `qa/edge-design-acceptance.json`, summarised in `BROWSER-VERIFICATION.json`. WebKit results, when present, are compatibility evidence from Playwright WebKit on Windows, not native Safari.

## Design revision 2

Same engines and fixtures. `browser_design.cjs` now runs 71 checks at each desktop viewport, 33 checks at 390×844 (narrow-screen pass) and 35 light-theme checks at 1920×1080 (toggle, persistence, measured contrast floors), all passing; `browser_static.cjs` 51 checks per viewport with the seven legacy suites and `browser_ranks.cjs` 60 role tables passed in Edge and Playwright WebKit; Python static tests 43. Receipts in `qa/` and `BROWSER-VERIFICATION.json`.
