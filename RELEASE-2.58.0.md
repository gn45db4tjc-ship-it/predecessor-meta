# 2.58.0 — your own match log, item usage, a trend note for a new patch, and reviews in the cloud

On 14 Oct 2026 the owner asked for the four ideas proposed in the project thread ("Go. Do 1-4"). One is an operations fix and three are display changes. Nothing new is collected.

## What changes

- **Reviews run in the cloud.** Patch 1.17.2 was live by 13 Oct and its reviews queued, but nothing ran them: the reviewer was a scheduled task on the owner's PC, and it was disabled on 12 Oct. By 14 Oct, 74 rechecks had waited over 24 hours (watchdog issue #149). The reviewer is now a Claude Code cloud routine every 3 hours that runs whether or not the PC is on. `docs/RECHECK-RUNNER.md` gains an "In the cloud" section. It replaces the PC lock file with the open-PR and pushed-branch check, uses the GitHub connection instead of `gh`, pushes each commit so a cut-off run can be resumed, and stops when the live site cannot be reached. The cloud environment must allow `gn45db4tjc-ship-it.github.io`, which the owner added on 14 Oct. The gate, its rules and the review standard do not change.
- **Your match log (Match and hero pages).** When a match has your hero, a "Game over?" line in the hero panel offers Won and Lost. A result is logged once per match: the line then says it is logged and offers Undo until New match. Each hero page (desktop, phone and full details) shows a closed line with your record for that hero and role, for example "Your games as Carry: 7 won, 5 lost (58% won)", plus the current patch's record when it differs. Opening it lists your last 10 games with a Delete button for each. Games stay on the device (`companionPrefs.games`, newest 500) and are not exported or shared. The record is labelled as your games, never compared with the public win rate (engine `MetaEngine.gameRecord`, mobile.js `recordHTML`, companion_simple.js `matchLogHTML`).
- **Item usage (item details).** An item's details now list the starting builds on your rank that use it, as each hero page shows them. Reviewed builds come first, then calculated starting points, each with its place in the six, and each opens that hero (engine `itemUsage`, ui.js `itemUsageHTML`). The item's own patch notes were already listed there.
- **Daily trend on a new patch.** The collector starts a trend afresh for each cohort, so on 13 Oct every rank's 1.17.2 collection stored `scoped_changes.trend` as null and every hero page dropped its trend line without a word. The line now reads "Daily trend: starts after Pred.gg has two daily pulls on v1.17.2." until the second day (engine `trendPending`). This is the intended behaviour of 2.54.0, now visible; points from the old patch are still never mixed in.

## What does not change

- No new source or sample. The record counts only games you log; the item list reads the builds already shown.
- The review gate, its scope check and its auto-merge rules.

## Files

- `engine.js`: static `gameRecord`; `trendPending`, `itemUsage`.
- `companion_simple.js`: `matchLogHTML`, `matchLogResult`; New match clears the logged result; the record on the phone hero page.
- `mobile.js`: `recordHTML`, the `games` preference and its Delete; the record on the full phone hero page.
- `ui.js`: `itemUsageHTML` in item details, the trend placeholder, the record on the desktop hero page.
- `ui.html`: styles for the record, item usage and match log, existing tokens only.
- `docs/RECHECK-RUNNER.md`, `docs/FRESHNESS-STATUS.md`, `docs/AI-CONTEXT.md`, `README.md`, `SOURCE-MANIFEST.json`.
- `predecessor_meta.py`: `VERSION` 2.58.0. `sw.js`: cache `predecessor-meta-shell-v2-58-0`.
- Tests: `tests/match_log_and_items.test.cjs` (new, 4 tests). Each failed on main (the three functions did not exist).
