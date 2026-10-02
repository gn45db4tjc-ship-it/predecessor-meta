# Freshness status

The running record of the freshness overhaul (owner's brief of 2 Oct 2026; decisions in `STRATEGY-REVIEW-POLICY.md`). The baseline is [FRESHNESS-BASELINE.md](FRESHNESS-BASELINE.md). Each phase updates this file.

## Targets

| Event | Target | Baseline (2 Oct, 2.41.2) | Now |
|---|---|---|---|
| Live patch or hotfix posted → collection starts | ≤ 1 h | up to 3 h | unchanged (Phase 2) |
| Upstream statistics change → published for that rank | ≤ 3 h | up to ~25 h (Pred.gg, PC once a day) | unchanged (Phase 2) |
| Any rank's core statistics age, sources healthy | never over 24 h | peaks 24.7 h; unlimited when the PC is off | unchanged (Phase 2) |
| Review PR merged → visible on the site | ≤ 30 min | code 3.6 min; grades and builds 12–24 h | unchanged (Phase 2) |
| Grade withheld or plan inactive → recheck queued | same run | never | queue listed below; automatic in Phase 4 |
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
| "Guidance · Gold+ only" (no tier) on five ranks | Missing feature | Grades exist only for the Gold+ cohort. | Phase 3 (calculated per-rank tiers) |
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
- **Thin samples:** Paragon+ has 938 Statz games and Diamond+ 7,341. Per-rank tiers will be sparse there.

## Recheck queue (Phase 4 starts here)

In order. Grades first, as the brief asks.

1. **Gold+ grades withheld for moved statistics (13):** Adele offlane C, Akeron offlane A, Aurora support B, Iggy & Scorch offlane A, Iggy & Scorch midlane B, Kallari jungle C, Maco support C, Sevarog jungle B, Shinbi jungle B, Terra offlane C, Wraith carry B, Wukong jungle A, Yurei jungle B.
2. **Build plan:** Legion carry (supporting mechanics changed).
3. **Mechanics:** the Risen correction; the Frost Snap, Harmonic Currents and Mending definitions; the Rallying Roar and Peal perk descriptions.
