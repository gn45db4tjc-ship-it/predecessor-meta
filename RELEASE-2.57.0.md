# 2.57.0 — since you last looked, build changes, hero compare, a live-release check and three revived test suites

On 13 Oct 2026 the owner asked for all five ideas proposed in the project thread ("do 1-5"). Three are display and engine changes, one is a watchdog check, and one revives three browser suites. Nothing new is collected.

## What changes

- **Since you last looked (phone Meta).** For each favorite hero, the phone keeps one snapshot per rank of what it showed: the tier, the win rate with its source and sample, and the active reviewed build. On the next visit, a closed line above the patch-changes line says what changed ("Since you last looked: 2 favorites changed"). Opening it lists each tier change, each win-rate move of a full point or more, and the items in and out of the reviewed build. A win rate counts only from the same source with 100+ games both times. The comparison uses the snapshots the phone had when the page loaded, so the line stays for the whole visit. A snapshot is rewritten only when a value changes, and it is kept on the device only (`companionPrefs.seen`; engine `MetaEngine.snapshotChanges`, mobile.js `favoriteSinceHTML`).
- **Build changes since the previous patch (hero page, desktop and phone).** Under an active reviewed build, one closed line says how it differs from the previous patch's reviewed build ("Changed since the v1.16.4 build · 2 in, 2 out, 1 moved"). Opening it lists the items in, out and moved, and any change to the crest, augment, Eternal, blessings or skill priority, with the patch review's own reason. A build the review kept reads "Same six items and loadout as the v1.16.4 reviewed build." (engine `buildChanges`, ui.js `buildChangesHTML`).
- **Compare two heroes (hero page, desktop and phone).** A closed "Compare with another carry hero" line under the trend opens a hero picker for the same role. The table puts both heroes side by side: tier (reviewed or calculated), win rate with sample and source, the daily trend, the starting build and the number of official changes this patch, followed by the current head-to-head sample when it has 100+ games. Each figure keeps its own source and label; the columns are not combined into a score. The choice lasts for the visit (ui.js `heroCompareHTML`).
- **Live-release check (watchdog).** The hourly watchdog now compares the live manifest's app release with `predecessor_meta.VERSION` on main. When they differ 90 minutes after main last changed, it reports `release-behind`, and after a second hourly sighting it opens an issue labelled `freshness-watchdog` naming both versions. It does not request a refresh: the next hourly publication publishes main again, and a mismatch that survives it means publishing itself needs a look. Before this, only review PRs had a check after merge (`review_gate.py verify-live`).
- **Three revived browser suites, now in CI.** `browser_navigation.cjs`, `browser_companion.cjs` and `browser_companion_accessibility.cjs` were hard-coded to Edge and tested the Live, Draft and Compose screens that 2.36.0 replaced with Match, so they failed and no workflow ran them. They now pick the browser like the other suites, start their own preview, wait for the guide, and test the current app. Checks for removed screens are dropped; old Plan, Draft and Live links are checked to open Match. `verify.yml` runs all three.
  - Navigation: both themes at 390, 320 and 1440 px on every screen. Each screen has one current page, one heading, no horizontal overflow, 44 px targets, and the Match picks kept. It also checks old links, hero deep links and Back.
  - Phone journey: Meta, then a hero, Favorite, Use in Match, picking enemies, New match and Undo, reload, and the offline notice.
  - Phone accessibility: axe on every phone screen and on the open states of Meta, Match (Your team, My lane, Change hero) and the source dialog, in both themes. Large text is checked at 320 px.

## What does not change

- No new source, sample or tier. Build changes compare two reviewed builds already in the packet (`previous_review`). The compare reads existing figures.
- The since-last-looked snapshots never leave the device and are not part of exports or shared links.

## Files

- `engine.js`: `buildChanges`; static `snapshotChanges`.
- `mobile.js`: `favoriteSnapshot`, `recordSeen`, `favoriteSinceHTML` on phone Meta; the compare block on the full phone hero page.
- `ui.js`: `buildChangesHTML` under the reviewed build path; `heroCompareHTML` and its `hero-compare` select on the desktop hero page.
- `companion_simple.js`: build changes on the phone build card; the compare block on the phone hero page.
- `ui.html`: styles for the compare and build-change blocks, existing tokens only.
- `watchdog.py`: `source_release`; `check(..., release=)` reports `release-behind`.
- `tests/browser_navigation.cjs`, `tests/browser_companion.cjs`, `tests/browser_companion_accessibility.cjs`, `.github/workflows/verify.yml`.
- `predecessor_meta.py`: `VERSION` 2.57.0. `sw.js`: cache `predecessor-meta-shell-v2-57-0`.
- `docs/AI-CONTEXT.md`, `docs/FRESHNESS-STATUS.md`, `README.md`, `SOURCE-MANIFEST.json`.
- Tests: `tests/since_and_changes.test.cjs` (new, 5 tests) and two new watchdog tests in `tests/test_static_watchdog.py`. Each failed before its change.
