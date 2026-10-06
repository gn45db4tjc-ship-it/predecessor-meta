# 2.52.2: the collector checks on time after a restart

On 5 October 2026 the Windows collector skipped its 17:38 CDT check.
- The collector checks every three hours. Its last check had been at 14:38.
- At 16:51 the collector update (2.52.1) restarted it, 2 h 13 min after that check.
- The restarted collector checked at once. That check was not due yet, so it did nothing, and the next attempt was set three hours after the restart.
- So the next check ran at 19:51, 5 h 13 min after the last one.

The owner asked for the timing to be fixed. No data, statistic, grade, build or rule changes.

## What changes

- **A check that is not due yet now says when it will be:** three hours after the last check. The collector tries again at that time. After the 5 Oct restart it would have checked at 17:38, as scheduled, not at 19:51.
- **After a real check, or an error, nothing changes:** the next attempt is three hours later, as before.
- **A restart can no longer stretch the gap.** Checks stay at most three hours apart (plus the loop's 30-second tick). Before, a restart could push the gap towards six hours. The collector restarts on every update, at boot or sign-in, and whenever the hourly task revives a stopped one.

## Not changed

- What is collected and when the daily full collection runs (the first check after the daily boundary).
- Pred.gg access rules, the pushed data files and the `data-updates` branch.
- The website: only the version and the offline cache name change, as in every release.

## Files

- `local_updater.py`:
  - new `next_attempt_at`;
  - `run_once` returns `next_check_at` with "not due";
  - `daemon` sets its next attempt from the result.
- `tests/test_static_local_updater.py`: three new tests.
  - A restart 2 h 13 min after the last check names the due time.
  - After a check or an error, the next attempt stays three hours away.
  - A simulated-clock run of the daemon loop checks at the due time after a restart.
- `predecessor_meta.py`: `VERSION` 2.52.2.
- `sw.js`: cache `predecessor-meta-shell-v2-52-2`.
- `README.md` and `SOURCE-MANIFEST.json`.
- No new program files for the Windows install. `local_updater.py` is an existing one.

## Verification

- **Test first.** The three new tests failed on 2.52.1. In the simulated restart, the second check came 180 min after the restart; now it comes at the due time, 47 min after.
- **Evidence for the cause** (read-only, without opening the collector's private folder):
  - `data-updates` pushes ran every three hours from 3 to 5 Oct, then 14:38, nothing at 17:38, and 19:52.
  - The 19:52 push's `collector.json` was checked at 19:51:39, so no check started around 17:38.
  - The Startup shortcut was rewritten at 16:51:04, and the new collector process started at 16:51:29. Windows had not slept or restarted.
  - The next push came at 22:52 (checked 22:51:40), exactly three hours after 19:51, as this explanation predicts.
- **Suites.**
  - Python static tests: 418 pass (1 skipped).
  - Node tests: 400 pass.
  - The browser suites run in CI on the pull request. No page code changed.

## Taking effect

- **Website:** nothing to take effect. Publishing this release changes no data.
- **Windows collector:** keeps the old timing until it is rebuilt from this release and installed with the owner's approval, as for 2.52.1. The install itself restarts the collector; the new one's first check then runs when due.
