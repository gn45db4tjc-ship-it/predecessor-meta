# 2.42.0 — Freshness Phase 1: fix what was stale

Phase 1 of the freshness overhaul ([docs/FRESHNESS-STATUS.md](docs/FRESHNESS-STATUS.md)). Every stale-type item from the 2 Oct baseline is classified there, with its cause and evidence. This release fixes the two that were defects in our code; the rest are queued, planned for a later phase, or real source limitations.

## What changes for you

- **Community builds come back.** Every rank said "community alternatives are unavailable" because Omeda now labels its builds with the hotfix version (`v1.17.1`) and we only accepted `1.17`.
  - A build labelled with a hotfix that the official 1.17 article dates as live now counts. On Omeda's 2 Oct page that is 19 builds on Gold+, up from 0.
  - Builds for other or merely announced versions still don't count.
  - Each build keeps Omeda's own label ("labelled v1.17.1").
  - **This appears after the next collection by a collector running 2.42.0.** Today that is the PC collector, so it needs the Windows install.
- **Match explains an inactive reviewed build in plain English.** It said "The reviewed build is needs review." Now it says, for example:
  - "The reviewed build needs review for the current patch."
  - "The reviewed build needs review: its supporting mechanics changed."

  This is live as soon as the site updates.
- **A clearer notice for a skipped community build.** The one build Omeda files under a hero missing from its own hero list (Valmont) says so. It used to read "Unjoined hero or role for build …".

## Recorded, not changed

- **Queued for recheck** (Phase 4 starts here):
  - 13 Gold+ grades withheld for moved statistics;
  - Legion carry's build (supporting mechanics changed);
  - three mechanics items: Risen; Frost Snap, Harmonic Currents and Mending; Rallying Roar and Peal.
- **Real source limitations, shown plainly:**
  - Valmont isn't on Omeda's hero list yet.
  - Some heroes have no Statz page in a rank.
  - Statz's hero-wide pool is about 1.6× its tier list.
  - Statz is missing 13 perk descriptions.
  - Statz updates every few days.
  - GitHub can't read Pred.gg.
  - Paragon+ and Diamond+ samples are thin.
- **Documentation:** `pred_api.py` no longer claims the API isn't wired. It is wired, and stays inert until credentials exist.

## Verification

- **Probes first** (committed alone, failing on main f0f034f):
  - `tests/test_static_community_builds.py`: a hotfix-labelled build was dropped.
  - `tests/review_reason_wording.test.cjs`: three broken sentences.

  Both pass now. `tests/legacy/browser_synthesis_acceptance.js` asserted the broken sentence and was updated with the fix.
- **On real data:** the 2 Oct Omeda page parsed against the live Gold+ bundle gives 19 builds and 1 clearly worded skip.
- **Tests:**
  - Python static tests, and Node tests (383 pass).
  - The 11 CI browser suites on the seed.
  - The static and design suites on a preview built from all six live bundles, as the nightly check runs them.
  - Match on the live-data preview reads "The reviewed build needs review: its supporting mechanics changed." for Legion carry, on desktop and phone.
