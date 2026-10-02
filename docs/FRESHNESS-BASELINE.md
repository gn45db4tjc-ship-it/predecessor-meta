# Freshness baseline — 2 Oct 2026

Phase 0 of the freshness overhaul. This is a read-only measurement of how current the live site is, why, and how far it is from the targets. Every number comes from the live manifest and bundles (release 2.41.2, published 04:01:09 UTC on 2 Oct), the GitHub Actions run history, the `data-updates` branch and the source code at main `1177cf2`. The full per-rank record is in [freshness-baseline-2026-10-02.json](freshness-baseline-2026-10-02.json). The scripts that produced it are listed under "Method" at the end.

## Summary

| Event | Target | Measured today |
|---|---|---|
| Live patch or hotfix posted → collection starts | ≤ 1 h | Up to **3 h**. The official notes are checked every 3 hours. |
| Upstream statistics change → published for that rank | ≤ 3 h | Up to **~25 h** for Pred.gg, which changes continuously but is collected once a day. Up to ~25 h for Statz, which changes every few days. |
| Any rank's core statistics age, sources healthy | never over 24 h | Peaks at **24.7 h** (collection gaps 23.0–24.7 h this week). Grows without limit when the PC is off. |
| Review PR merged → visible on the site | ≤ 30 min | A code change: **3 min 38 s**. A reviewed grade or build: **at the next collection**, normally 12–24 h later. #95 merged 29 Sep 03:33 UTC and its grades appeared 30 Sep 18:20 UTC, 39 h later, stretched by the collector outage. |
| Grade withheld or plan inactive → recheck queued | same run | **Never**. Nothing queues a recheck. 13 Gold+ grades and 1 plan are waiting. |
| New publication → visible on a phone or desktop | ≤ 1 min | A freshly opened page: immediate. A returning app: up to **15 min**. An open tab: up to **30 min**. These come from the code, not a device measurement. |

## How data reaches the site today

- **The PC collector does all the collecting.** All six ranks on the live site were collected by the Windows collector (`collector.host: windows`, tool 2.41.2) between 17:00 and 17:17 CDT on 1 Oct. Since at least 26 Sep, every cloud publish run has taken under 8 minutes (median 3.4; 100 runs: 41 scheduled, 44 dispatched, 15 pushes). A six-rank collection takes 20–26 minutes, so the cloud is importing the PC's bundles, not collecting.
- **Full collections happen once a day.** The collector runs one full collection after the 17:23 UTC daily boundary: 13:18–14:20 CDT this week, plus an extra one at 16:56 on 1 Oct. Between collections it checks in every 3 hours and pushes a receipt. The cloud republishes on each push (`data-arrived.yml` → `publish.yml`) and every 3 hours on schedule, but the statistics don't change.
- **Pred.gg comes only from the PC.** GitHub can't read Pred.gg's public pages, and no `PRED_API_*` secrets are set (the repository has 0 Actions secrets). The manifest reports `optional_sources.pred.mode: public_pages_only`. If the PC is off, Pred.gg goes "retained" in the cloud's daily run.
- **Collection cost per rank.** About 200 s per rank: Pred.gg game data 165–177 s, the Pred.gg cohort 15–33 s, Statz hero pages 15–18 s. Ranks run one after another. The Pred.gg game data is mostly **rank-specific** (heroes, role data, perks and records differ per rank; only the item catalogues are identical), so it can't be fetched once for all ranks. The available speed-up is running ranks in parallel at polite limits.

## How often the sources actually change

Compared across the PC collector's full collections from 25 Sep to 1 Oct (Gold+, Silver+ and Paragon+ all behave the same):

| Source | Changed | Note |
|---|---|---|
| Statz tier list and hero pages | **Twice in 7 days**: the 1.17 reset (25 Sep) and 13,600 → 50,153 Gold+ games (28 Sep) | Statz updates every few days. Collecting it more than daily is waste. |
| Pred.gg exact-patch cohort | **At every collection**, including 13:56 vs 16:56 on 1 Oct | Pred.gg aggregates continuously. Its freshness equals our collection cadence. |
| Omeda heroes / items | Counts unchanged (54 heroes, 270 items) | Definitions change with patches. |
| Omeda community builds | `count: 0` on the first popular page | Shown as a source notice. |

**What this means:** the meta can only get faster through Pred.gg, and today Pred.gg comes only from the PC. Collecting Statz more often would not make anything fresher.

## Per rank

All six ranks: patch 1.17 (live 1.17), every source `ok`, none retained, assembled about 6 h before the last publication, 7–8 source notices (all warnings).

| Rank | Statz games | Grades shown | Builds active | What a user sees instead of a tier |
|---|---|---|---|---|
| Bronze+ | 34,937 | 0 of 86 ("Review covers a different cohort") | 89 of 97 | "Guidance · Gold+ only" |
| Silver+ | 75,117 | 0 of 86 | 89 of 97 | "Guidance · Gold+ only" |
| Gold+ | 50,153 | **73 of 86**; 13 withheld "Statistics moved since review" | 89 of 97 | "Tier review pending" on withheld rows |
| Platinum+ | 22,509 | 0 of 86 | 89 of 97 | "Guidance · Gold+ only" |
| Diamond+ | 7,341 | 0 of 86 | 89 of 97 | "Guidance · Gold+ only" |
| Paragon+ | 938 | 0 of 86 | 89 of 97 | "Guidance · Gold+ only" |

Statz games are the sum of the Statz tier-list rows for that rank. Paragon+ (938) and Diamond+ (7,341) are far smaller than the others, which matters for per-rank tiers.

**The 13 withheld Gold+ grades** (first in the recheck queue): Adele offlane C, Akeron offlane A, Aurora support B, Iggy & Scorch offlane A, Iggy & Scorch midlane B, Kallari jungle C, Maco support C, Sevarog jungle B, Shinbi jungle B, Terra offlane C, Wraith carry B, Wukong jungle A, Yurei jungle B. There were 7 on 28 Sep and 11 on 30 Sep, and the number grows as samples grow.

**Inactive build plans (8 of 97, the same in every rank):**
- Legion carry: "supporting mechanics changed; needs review". This is the one real recheck item.
- 7 experimental roles, unresolved by design and kept out of automatic suggestions: Akeron support, Ikra support, The Fey carry, Wraith support, Maco midlane, Scarlett midlane, Wukong offlane.

## Stale-type labels and their causes

| Label a user sees | Where | Cause | Class |
|---|---|---|---|
| "Tier review pending" / "Statistics moved since review" | Gold+ meta rows (5 on the default jungle view) | The Gold+ sample moved ≥ 3 points since the 24 Sep review; no recheck runs automatically | Review backlog |
| "Guidance · Gold+ only" (no tier) | Every other rank | Grades exist only for the Gold+ cohort; no per-rank tier exists | Missing feature (Phase 3) |
| "Builds · v1.17 89/97 ready" | All ranks | 1 plan inactive after a mechanics change; 7 experimental roles unresolved | Review backlog / by design |
| "Source limitations · 8 notices" | All ranks | Join and definition warnings from Statz, Omeda and official reconciliation | Real source limitations (listed in the ledger) |
| Ages up to 24.7 h; "Retained" when the PC is off | All ranks | One collection per day, from the PC only | Collection cadence; PC dependency |

No rank showed "Stale", "Aging", "Paused" or "Strategy review due" at measurement time.

## Code facts that set these limits (main 1177cf2)

- **Cadence.** `publish.yml` runs at :23 every 3 hours (two cron lines; the daily boundary is the 17:23 UTC run). Every run checks the official notes. `static_publish.collection_reason` (static_publish.py:88-113) starts a collection for:
  - a manual run;
  - the daily boundary, unless the PC is expected;
  - a required-source retry (every 3 h, at most 2);
  - a changed live patch or hotfix signature;
  - the patch catch-up (every 6 h for 48 h).

  `COLLECTION_RELEASE` is pinned to 2.31.1 (publish.yml:87), so it never fires again. The 3-hour patch check is hard-coded in the cron. `patch_check_hours` in free_hosting.json is only echoed into the manifest.
- **Waiting for the PC.** `waits_for_local_collector` (static_publish.py:68-85) holds the daily collection while the PC checked in within 4 h and it is under 5 h past the boundary. In practice the 17:23 and 20:23 runs wait, and the cloud collects at 23:23 UTC if the PC hasn't delivered. `local_collector.checked_at` is the PC's last *patch check*, not its last full collection. `status` is always written as "connected" (import_local_feed.py:79).
- **Collection.** Ranks run one after another (static_publish.py:648). A per-run fetch cache shares URLs across ranks and blocks a host for the rest of the run after a 403/429 (static_publish.py:139-167). Within a rank:
  - Statz pages: 5 at a time, 0.2 s apart.
  - Pred.gg pages: starts spaced 0.55 s apart, with a disk cache (observations 30 min, definitions 24 h).
- **Pred.gg retained data.** `retain_pred_partition` (predecessor_meta.py:3123-3177) has no age cap. The 30-hour rule is in the engine (`basePerformancePolicy`, engine.js:247-257): past 30 h the engine falls back to Statz. A Pred.gg 403/429/401 writes a persistent stop file (`public-access.json`) that pauses Pred.gg on every later run until removed. That is intended: access stops are never bypassed.
- **Guidance at publication.** `review_saved_sources` (predecessor_meta.py:3302-3339) replays builds when the packet's build review differs. It re-runs the full `enrich_bundle`, tiers included, **only when the bundle's tool version differs from the publisher's**. Phase 2 builds on this. docs/AI-CONTEXT.md and RELEASE-2.41.2.md say "publication replays builds alone", which understates it.
- **Recheck queue.** `review_queue.cjs` writes a review packet for the Gold+ reference when:
  - the patch, hotfix or review date changes;
  - it is a Sunday after 17:23 UTC;
  - `strategyReviewDue` fires.

  It has no trigger for withheld grades or inactive plans. It notifies no one. `next_weekly_review` is null, so the date-based due reason never fires.
- **Durable state.** `.cloud-state` lives in the Actions cache (publish.yml:51-55, 105-110). On a real cache miss the run restores only the committed Gold+ seed: 8 Sep, patch 1.16.4. The verified collector copy is used only when a stored bundle fails validation. A full collection then starts, and the other five ranks are unavailable until it finishes. **This can put older data on the site after a cache eviction.** It is a defect under the brief and is fixed in Phase 2.
- **Client.**
  - Data publications are checked on load; every 30 min while visible; and on return or focus only when the last check was over 15 min ago (static_client.js:601-604).
  - The 5-minute timer only re-evaluates evidence age (:606). Code releases are checked at most every 5 min (:81).
  - The service worker keeps the manifest and page network-first and serves checksum-named bundles from cache (sw.js:132-155).
- **Monitoring.** No watchdog exists. `live-check.yml` (daily 18:47 UTC) runs the static and design browser suites on live bundles, makes no data-age assertion and opens no issue.

## Classification for Phase 1

- **Collection cadence:** one daily collection; a 3-hour patch check (target ≤ 1 h); no change-driven collection.
- **Source failure or block:** none active. Pred.gg blocks GitHub; that is a real limit, worked around only by the PC.
- **Windows collector version skew:** none today (collector 2.41.2 = site 2.41.2). The skew risk remains on every release that changes the packet.
- **Review backlog:** 13 withheld grades, 1 inactive plan, no recheck trigger.
- **Client cache:** a 15-minute return threshold and a 30-minute open-tab interval, against a 1-minute target.
- **Durable state:** a real Actions cache miss falls back to the 8 Sep Gold+ seed (patch 1.16.4) until a full collection finishes; the other ranks are unavailable meanwhile.
- **Monitoring:** nothing detects a missed target or a quiet PC collector; the nightly check does not test data age.
- **Real source limitations:** Statz updates every few days; Pred.gg is unreadable from GitHub until API access is approved; Omeda community builds return 0; Paragon+ has a small sample.

## Method

All read-only, reproducible from `qa/baseline/` scripts, which are not committed (qa/ is ignored):
- `tests/fetch_live_bundles.py` downloaded the six live bundles (sha-checked against the manifest).
- `inventory.cjs` runs the real `engine.js` on each bundle: `metaReview` for every `meta_review` entry and `buildReview` for every plan.
- `labels.cjs` opened the live site in Edge for each rank at 1440 px and 390 px and counted the stale-type labels shown.
- `change_rate.py` compared statistics fingerprints across the PC collector's full collections in `data-updates`.
- `gh api` listed 100 `publish.yml` runs since 26 Sep with their durations; `gh run view` timed the 2.41.2 merge-to-deploy run.
