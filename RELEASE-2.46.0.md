# 2.46.0 — Freshness Phase 5: stale is a defect

Part of the freshness overhaul ([docs/FRESHNESS-STATUS.md](docs/FRESHNESS-STATUS.md)).

## What changes for you

- **An hourly watchdog checks the live site against the freshness targets.** It reads the published manifest and review index and changes no data. It reports:
  - a rank whose statistics or Pred.gg cohort are over 24 hours old;
  - a failed or missing rank;
  - a failed patch check;
  - a site not republished for 3 hours;
  - **the Windows collector quiet for more than 6 hours** (it checks in every 3);
  - the current review packet due for over 24 hours.
- **One GitHub issue per problem.** A problem seen in two consecutive hourly checks (so the daily collection window doesn't flap) gets one issue, labeled `freshness-watchdog`. The issue carries the diagnosis and the next attempt, is kept up to date, and closes itself when the problem clears.
- **Refreshes only where the rules allow.** For problems a cloud collection can fix, the watchdog asks the publication workflow for a refresh. It never does when:
  - collection or a source is paused, or a source blocked the last collection;
  - the retry limit is reached, or a retry is already due;
  - a scheduled attempt is within the hour;
  - the cloud is waiting for the Windows collector's daily run.
  It asks at most once every 6 hours and twice a day. Pred.gg blocks GitHub, so a stale Pred.gg cohort or a quiet collector is reported, never "refreshed" from the cloud.
- **Every miss is recorded** in the automation-state branch (`watchdog.json`), when it starts and when it clears.
- **Stale labels say why and when.** On the website:
  - **The 30-hour notice** now names the cause instead of "the scheduled update may have failed or been delayed", and gives the next attempt. The cause is one of:
    - collection paused;
    - this rank's failed attempt;
    - a blocked retry;
    - a quiet Windows collector;
    - otherwise, when the last collection finished.
  - **Phone Stale, Aging and Saved status:** says the same.
  - **Phone Paused status:** says when the patch notes are next checked.
  - **The saved-statistics notice:** explains itself when opened.
  - **The desktop patch strip:** keeps its short label, with the explanation as its tooltip.

## Verification

- **Probes first:**
  - `tests/test_static_watchdog.py` (commit d104572) failed on main 0880cbe: no watchdog existed.
  - Audit probe FR2 (commit 7ce9e14) reproduced: the 30-hour notice and the phone Stale status gave no cause and no next attempt.
  - Both now pass.
- **Watchdog tests (21):**
  - every problem type and its limits, e.g. exactly 24 h is not a miss;
  - every refresh rule (pauses, blocks, retry limit, pending retry, scheduled attempt, collector wait, cooldown, daily limit, first sighting);
  - state and miss records;
  - issue create, update, close, while other issues are left alone;
  - the workflow contract: hourly, read-only by default, scoped permissions, pinned actions, only `watchdog.json` recorded, data-updates never touched.
- **Against the live site** (dry run, 2 Oct 20:53 UTC): all targets met.
  - Two old "due" review packets were superseded by the 24 Sep review. The watchdog now reads only the current packet.
- **Suites:** Python static tests, Node tests, the 11 CI browser suites, and the static and design suites on a preview built from the live bundles.
