# Freshness status

The running record of the freshness overhaul (owner's brief of 2 Oct 2026; decisions in `STRATEGY-REVIEW-POLICY.md`). The baseline is [FRESHNESS-BASELINE.md](FRESHNESS-BASELINE.md). Each phase updates this file.

## Targets

| Event | Target | Baseline (2 Oct, 2.41.2) | Now |
|---|---|---|---|
| Live patch or hotfix posted → collection starts | ≤ 1 h | up to 3 h | **Met (2.44.0):** the official notes are checked every hour, and a changed live article starts a collection in that run. |
| Upstream statistics change → published for that rank | ≤ 3 h | up to ~25 h (Pred.gg, PC once a day) | unchanged (Phase 2) |
| Any rank's core statistics age, sources healthy | never over 24 h | peaks 24.7 h; unlimited when the PC is off | unchanged (Phase 2) |
| Review PR merged → visible on the site | ≤ 30 min | code 3.6 min; grades and builds 12–24 h | **Met (2.44.0):** the merge's own publish run re-applies a changed reviewed packet to every rank (about 4 min), without waiting for a collection. |
| Grade withheld or plan inactive → recheck queued | same run | never | **Met (2.47.0):** each publication run derives the recheck queue from the published bundle (`review/index.json` `rechecks`); the scheduled reviewer works from it every 3 hours. |
| New publication → visible on a phone or desktop | ≤ 1 min | 15 min returning, 30 min open tab | **Met (2.43.0):** a freshly opened app checks at once; a returning app checks when its last check is over 15 s old; an open, visible tab checks every 5 min. Probe FR1 (clocked browser): 1 check on return, 1 in the open tab (was 0 and 0). |

## Phase 1: what was stale on 2 Oct, and why

Every stale-type item from the baseline, classified. "Fixed" means fixed at the cause in 2.42.0.

| Item | Class | Cause and evidence | Status |
|---|---|---|---|
| "Omeda community builds: no usable builds labelled for the verified current patch" (every rank) | **Source handling defect** | Omeda labels all 20 popular builds `v1.17.1` (Hotfix 1.17.1, dated live in the official 1.17 article). `parse_community_builds` required exactly `1.17`. Checked against Omeda's live `builds.json` on 2 Oct. | **Fixed:** a build labelled with a verified live hotfix of the live patch counts. The real 2 Oct page now gives 19 builds on Gold+ (was 0). Announced or other versions still don't count. Visible after the next collection. |
| "The reviewed build is needs review." (Match, any inactive plan) | **Wording defect** | engine.js pasted the status word into a sentence. | **Fixed:** one sentence per status ("The reviewed build needs review for the current patch." and others). |
| 13 Gold+ grades withheld "Statistics moved since review" | Review backlog | The Gold+ Pred.gg sample moved ≥ 3 points (≥ 500 games) since the 24 Sep review or 27 Sep recheck. Nothing queues a recheck. | Queued below; automatic rechecks arrive in Phase 4 |
| Legion carry build inactive ("supporting mechanics changed; needs review") | Review backlog | A supporting mechanic changed after the build review. | Queued below |
| "Official correction review: Correction could not be verified for Risen" | Review backlog | The source field is missing or differs from the reviewed precondition. | Queued below (mechanics) |
| "Official definition review: Partly verified descriptions: Frost Snap, Harmonic Currents, Mending" | Review backlog | Conflicting definition fields remain unverified. | Queued below (mechanics) |
| "Official 1.17 mechanics reconciliation: unmatched fields" (Rallying Roar, Peal) | Review backlog | Two perk descriptions don't match the official notes. | Queued below (mechanics) |
| "Guidance · Gold+ only" (no tier) on five ranks | Missing feature | Grades exist only for the Gold+ cohort. | **Fixed (2.45.0):** every rank shows a calculated tier from its own sample, labeled Calculated ([CALCULATED-TIERS.md](CALCULATED-TIERS.md)). On the 2 Oct live data: Bronze+ 96, Silver+ 95, Gold+ 95, Platinum+ 89, Diamond+ 65, Paragon+ 6 hero roles with a tier. |
| Ages up to 24.7 h; Pred.gg "retained" when the PC is off | Collection cadence; PC dependency | One full collection a day, from the PC only. | Phase 2 |
| Open tab up to 30 min, returning app up to 15 min behind | Client cache | Publication-check intervals in static_client.js:601-604. | Phase 2 |
| A lost Actions cache shows the 8 Sep seed | Durable state | The cache-miss restore uses only the committed Gold+ seed and the Windows feed. | **Fixed (2.43.0):** a run with no state restores the live publication first, each bundle sha256-checked against the live manifest and stored with its dates unchanged; the schedule state is restored too. Tested against the real live site: all six ranks restored. |
| Seven experimental roles unresolved (Akeron support, Ikra support, The Fey carry, Wraith support, Maco midlane, Scarlett midlane, Wukong offlane) | By design | Experimental roles with thin or no samples are kept out of automatic suggestions. | No change; reviewed when evidence exists |
| pred_api.py said "NOT wired into collection yet" | Documentation | It is wired (`pred_source_fetch`) and inert without secrets. | Fixed |

### Real source limitations (shown plainly; no fix available on our side)

- **Valmont is not on Omeda's hero list yet.** Kit comes from Pred.gg ("join statz<->omeda"), and an Omeda community build for him is skipped. Seen in Omeda's heroes.json (54 heroes) and builds.json (hero 78).
- **Some heroes have no Statz page in a rank** (Gold+: GRIM.exe, Wukong), so their pairs have no baseline ("synergy").
- **Statz's hero-wide pool is about 1.6× the Gold+ tier-list games**, and Statz doesn't say what the extra games are ("statz.gg hero pages").
- **Statz lacks or mismatches descriptions for 13 loadout perks** ("Statz build definitions").
- **Statz updates every few days** (twice in 7 days), so collecting it more often adds nothing.
- **Pred.gg can't be read from GitHub.** Until API access is granted, Pred.gg comes only from the PC.
- **Thin samples:** Paragon+ has 938 Statz games and Diamond+ 7,341. Calculated tiers are sparse there: on the 2 Oct data, Paragon+ has 6 hero roles with a tier and Diamond+ 65.

## Recheck queue (as of 2 Oct; since 2.47.0 the live queue is `review/index.json` `rechecks`)

In order. Grades first, as the brief asks.

1. **Gold+ grades withheld for moved statistics (13):** Adele offlane C, Akeron offlane A, Aurora support B, Iggy & Scorch offlane A, Iggy & Scorch midlane B, Kallari jungle C, Maco support C, Sevarog jungle B, Shinbi jungle B, Terra offlane C, Wraith carry B, Wukong jungle A, Yurei jungle B.
2. **Build plan:** Legion carry (supporting mechanics changed).
3. **Mechanics:** the Risen correction; the Frost Snap, Harmonic Currents and Mending definitions; the Rallying Roar and Peal perk descriptions.
4. **Grades two steps from their calculated tier (2.45.0 comparison, 2 Oct data):** Drongo carry S (calculated B), Eden carry S (B), Kwang offlane B (D), Serath jungle A (C), Sparrow carry S (B), Steel support S (B), The Fey midlane S (B), Zarus jungle S (B). A recheck candidate only: reviewed grades also weigh kit and execution, and no grade moves on this basis alone.

## Phase 3 (2.45.0): calculated per-rank tiers

- **Engine:** `calculatedTier(slug, role)` compares each hero with its role's games-weighted win rate in the same rank, through the sample's 95% interval. S and D also need 500 games; under 100 games there is no tier. Labeled Calculated, never written into `meta_review`. Unit tests: `tests/calculated_tiers.test.cjs`.
- **Views:**
  - desktop "Calculated tier" column on every rank other than Gold+;
  - a detail with rank, games, interval, date, baseline and method;
  - phone Meta rows and the Tier order;
  - the hero header on desktop and phone;
  - Gold+ shows its calculated fallback, labeled "recheck queued", while a reviewed grade is withheld.
- **Probes:** CT1 (no rank showed a tier) and CT2 (a withheld Gold+ grade left its row blank), both fixed.
- **Sanity comparison:** 73 active Gold+ reviewed grades; 31 identical, 65 within one step, 8 two steps apart. No threshold or grade was changed on its basis ([CALCULATED-TIERS.md](CALCULATED-TIERS.md)).

## Phase 5 (2.46.0): stale is a defect

- **Hourly watchdog** (`.github/workflows/watchdog.yml` at :41, logic in `watchdog.py`). It reads the live manifest and review index and changes no data. It reports a problem when:
  - a rank's core statistics, or its Pred.gg cohort, are over 24 hours old;
  - a rank's last attempt failed, or a rank is missing;
  - the patch check failed;
  - the site has not been republished for 3 hours;
  - the Windows collector has been quiet for 6 hours (it checks in every 3; `local_collector.checked_at`);
  - the current review packet has been due for over 24 hours.
- **Issues:** a problem seen in two consecutive checks gets one issue (label `freshness-watchdog`) with the diagnosis and the next attempt. The issue is updated while the problem lasts and closed when it clears. Other issues are never touched.
- **Refreshes:** the watchdog asks publish.yml for a refresh (`refresh=true`) only for problems a cloud collection can fix, and only where the publisher's rules allow:
  - no pause, block or exhausted retry;
  - no pending retry;
  - no scheduled attempt within the hour;
  - not waiting for the Windows collector's daily run;
  - at most once per 6 hours and twice a day.
  A stale Pred.gg cohort or a quiet collector is reported, never "refreshed" from GitHub, which Pred.gg blocks.
- **Record:** each miss is written to automation-state `watchdog.json` when it starts and when it clears (with its duration), together with the refresh requests of the last 7 days.
- **On the site:** the 30-hour notice, the phone Stale/Aging/Saved status and the saved-statistics notice now say why the data is old and when the next attempt is, from the published manifest. The reason is one of:
  - collection paused;
  - this rank's failed attempt;
  - a blocked retry;
  - a quiet Windows collector;
  - otherwise, when the last collection finished.
  The phone Paused status says when the patch notes are next checked. The desktop patch strip keeps its short label, with the explanation as its tooltip; the notice below it says it in full.
- **Tests:** `tests/test_static_watchdog.py` (21: decisions, refresh rules, state, issue sync, workflow contract); audit probe FR2.

## Phase 4 (2.47.0): automatic rechecks with an auto-merge gate

- **Queue:** `engine.recheckQueue` derives the reviewer's queue from the Gold+ reference bundle, grades first:
  - grades withheld because statistics moved;
  - plans whose supporting mechanics changed;
  - official mechanics notices;
  - heroes with no reviewed grade or plan;
  - a live patch the guidance was not reviewed for.

  `review_queue.cjs` publishes it in `review/index.json` (`rechecks`) with each item's first-queued date, so a missed run stays due. It adds the weekly backstop after Sunday's collection, which clears only when `guidance.recheck_log` records a weekly pass. Experimental roles kept unresolved by design are not queued. On the 2 Oct data it would list 13 withheld grades, Legion carry and three mechanics notices.
- **Runner:** the Claude Code scheduled task `predecessor-meta-rechecks`, every 3 hours (`docs/RECHECK-RUNNER.md`). It exits at once when the queue is empty, handles one pass at a time, and opens a review PR labeled `automated-review`.
- **Gate:** `.github/workflows/review-gate.yml` and `review_gate.py`.
  1. It checks first, executing nothing from the PR, that only review files changed.
  2. It runs the tests, validates the packet against every live rank and runs the live-data browser suites.
  3. It requires green CI.
  4. It decides:
     - merge when every changed entry has a complete ledger record, no grade moves more than one step, nothing unresolved supports a newly endorsed choice and the pass is logged;
     - hold (`DECISION NEEDED`) for a first grade, a removal, a policy exception, a validator or policy change, or more than 10 grade changes;
     - wait unless `free_hosting.json` `review_auto_merge` is true on main and the last two nightly live checks passed;
     - otherwise fail.
  5. After a merge it publishes and verifies that every rank carries the merged packet (and the changed Gold+ grades) within 30 minutes, and reverts the merge if not.
- **Prerequisite:** the nightly live check passed on main twice in a row on 2 Oct (15:48Z and 21:04Z, both manual dispatches; the 18:47Z schedule was skipped by GitHub). `review_auto_merge` is on, and the gate re-checks the last two nightly runs at every decision.
- **Watchdog:** a recheck queued for over 24 hours is reported as `queue-overdue`.
- **Tests:**
  - `tests/recheck_queue.test.cjs` (5);
  - `tests/test_static_recheck_log.py` (3);
  - `tests/test_static_review_gate.py` (13, including the workflow contract);
  - the watchdog's overdue-rechecks case.
