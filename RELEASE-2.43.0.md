# 2.43.0 — Freshness Phase 2a: the app sees new data at once, and a lost cache never shows older data

Part of Phase 2 of the freshness overhaul ([docs/FRESHNESS-STATUS.md](docs/FRESHNESS-STATUS.md)).

## What changes for you

- **New data appears when you open or come back to the app.**
  - Opening the app always checks for the latest publication.
  - Coming back to it (switching apps, unlocking the phone, returning to the tab) now checks when the last check is more than 15 seconds old; before, only after 15 minutes.
  - A tab left open and visible checks every 5 minutes; before, every 30.
  - The manifest is small and fetched without caching, and the page only redraws when the data actually changed.
- **A lost GitHub cache can no longer put older data on the site.**
  - If the publisher's saved state is ever evicted, the next run restores the live publication first: each rank's bundle, checked against the live manifest's sha256, stored with its dates unchanged, plus the schedule state.
  - Before, it restored only the PC's latest bundles and the committed 8 Sep seed, and started a full collection at once.
  - Tested against the real live site: all six ranks restored.
- **The Windows app tells you when the website is ahead.**
  - When the website runs a newer version, the app shows a notice under the status line: "A newer version is on the website: … (this app: …). Installing it on Windows is a manual step; nothing installs automatically."
  - The app reads the website's version at most every 6 hours, in the background. It downloads and installs nothing.
  - This appears in the Windows app after it is installed.

## Verification

- **Probes first** (commit 6df841e, failing on main dde0412):
  - FR1 (audit, clocked browser): a returning app made 0 checks and an open tab made 0 checks in 6 minutes, reproduced on the seed and on the live site. Now 1 and 1; FR1 is fixed in `tests/known-defects.json`.
  - `tests/test_static_restore_live.py`: no restore from the live site existed.
  - `tests/test_static_app_release.py`: no website version check existed.
- **On real data:**
  - `static_publish.py --restore-live` against the live site restored all six ranks with their published dates and the schedule state (last full collection, patch signature, collector check-in).
  - `website_release()` read the live website's version (2.42.0).
- **The local-mode suite** (`browser_revision2_modes.cjs`, scratch Windows-app instance plus a staged site) has two new checks: no notice while the website is not newer, and the notice once it is.
- **Tests:** Python static tests, Node tests, the 11 CI browser suites, and CI.
