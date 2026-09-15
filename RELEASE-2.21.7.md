# 2.21.7 — September 14 strategy review

Based on 2.21.6. Builds, Live game, six brackets, saved selections, phone layouts and both themes remain available.

## Recommendations

- Reviewed all 93 hero/role setups: 12 changed, 74 checked and retained, 7 unresolved for broad role strength. The seven experimental setups remain manually selectable and excluded from automatic fills. They have explicit limitations; reviewed does not mean optimal.
- Spirit Of Amir now opens Countess, Kwang and Shinbi jungle. Shinbi retains Magnify as purchase three. The changes follow explicit monster damage, location-dependent sustain and cast/attack mechanics, not conditional core win rates.
- Added situational Magnify, Megacosm, World Breaker, Rapture and Spectra alternatives with their tradeoffs. Rampage's Overlord alternative replaces Fire Blossom rather than Dynamo. Muriel's Crystal Tear guidance correctly distinguishes magical power and shared haste from physical-power amplification.
- Reviewed the 85 existing Gold+ editorial tiers; six changes: Yin jungle B→A, Zinx offlane B→A, Riktor jungle B→C, Scarlett jungle B→C, Dekker support A→B, Steel offlane A→B. Separate dated references for all six brackets are available on each build; overlapping plus-brackets are not pooled or treated as independent experiments.
- Rechecked all 54 hero counterplay entries, 16 counter suggestions and 12 authored compositions. Gideon advice now identifies the first 2.75 seconds as the interruptible phase. A short allied catch never guarantees the whole Black Hole channel.
- Fixed catch-conversion explanations that treated explicitly excluded non-ultimate abilities as burst follow-up. Steel's Force Shield needs an enemy crossing for damage; its projectile protection remains separately supported.
- Added exact ability/item/loadout dependencies to all 93 plans. Two explicitly reviewed, equivalent Sanguine Slash wordings are accepted; a changed amount or condition still withholds the plan.
- Fixed history ordering when Windows timezone offsets and cloud UTC timestamps coexist.

Every plan's actual review date, result and rationale are available in Builds and hero build details. `STRATEGY-REVIEW-2026-09-14.json` contains the complete audit ledger. Observed rates, counts, source status and fetch dates were preserved across the review replay.

## Real cloud receipt

[GitHub Actions run 34911213594](https://github.com/gn45db4tjc-ship-it/predecessor-meta/actions/runs/34911213594) ran the baseline source `df558b7c69b3bf01063ceb9d531d3b236affb9cb` on GitHub's Ubuntu runner and completed successfully. Collection and rendering took 133.69 seconds. The collector ran on GitHub; the PC collector was not used to obtain the new Statz/Omeda results.

The workflow did import its existing Windows seed first. Runner logs and newer per-source timestamps, not the deployment time, establish the subsequent cloud collection. Output artifact filenames and SHA-256 hashes matched all six published bundles.

| Bracket | Statz tier fetch (UTC) | Statz hero-page fetch (UTC) | Omeda hero fetch (UTC) |
|---|---|---|---|
| Gold+ | Sep 14 23:59:10 | Sep 14 23:59:24 | Sep 14 23:59:09 |
| Bronze+ | Sep 14 23:59:29 | Sep 14 23:59:44 | Sep 14 23:59:29 |
| Silver+ | Sep 14 23:59:49 | Sep 15 00:00:04 | Sep 14 23:59:49 |
| Platinum+ | Sep 15 00:00:09 | Sep 15 00:00:23 | Sep 15 00:00:08 |
| Diamond+ | Sep 15 00:00:27 | Sep 15 00:00:41 | Sep 15 00:00:26 |
| Paragon+ | Sep 15 00:00:45 | Sep 15 00:01:02 | Sep 15 00:00:45 |

**Optional Pred.gg did not return structured data on the runner.** Its previous September 14 records remain dated and labelled retained. This verifies independent cloud collection of the required sources, not fresh cloud collection of Pred.gg. No API, paid service, access bypass or deliberately triggered rate limit was used. The 2.21.7 publication replays the reviewed guidance against these collected records without advancing their dates.

## Verification

- Python: 89 tests. JavaScript: 42 tests, including focused timezone, incomplete-observation, explicit-follow-up and equivalent-wording regressions.
- Actual six-bracket bundles: all 93 builds have valid six-item sequences, exact mechanics dependencies, compatible blessing slots and active reviewed setups; all 12 authored compositions remain valid. Locks, bans, unique heroes/roles, 2/3/5 suggestions, pair thresholds, baseline arithmetic and Live game were checked. Observation/source-date projections were unchanged.
- Optional Pred.gg failure fixtures preserve original dates, keep limitations visible and permit validated required sources to continue. Existing daily and patch-check policy tests pass.
- Browser: all nine navigation pages, hero pairings/builds/counters/kit, finished loading of all six ranks, duo/trio/five controls, live owned items and saved selection restoration. Dark/light and 390×844 phone layouts inspected; desktop overflow checks at 1920×1080, 2560×1440 and 1536×864. The last size approximates the CSS workspace at Windows 125%; native OS scaling was not changed.
- The installed app's data, snapshots and settings are protected by the installer checksum record. Source changes receive a hashed rollback set.

## Limits and schedule

Statz still labels the dataset 1.16 and does not verify its exact date window or queue composition. It is not relabelled 1.16.4. Pred.gg's retained samples cannot silently reaffirm current editorial tiers or order automatic current recommendations. Listed source mechanics disputes remain excluded; no damage simulation or full-loadout win probability is claimed.

This is an initial review. September 20 at 1:15 PM America/Chicago remains the next weekly review. Daily cloud collection and three-hour official patch/hotfix checks are unchanged. The weekly strategic review still requires the existing Codex automation host to be available; GitHub collection is independently verified.

## Rollback

Quit the local app, then double-click `Roll Back 2.21.7.bat` in its installed folder. It verifies the backup before restoring 2.21.6 source, preserving data and settings. For the public site, revert the 2.21.7 release commit and run the existing publication workflow; do not roll back or overwrite collected-data history. The source ZIP contains code, tests and review records, not user settings or saved data.
