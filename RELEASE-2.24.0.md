# Predecessor Meta 2.24.0 — Advice that always matches what is on screen

This is a reliability release from the 2.23.0 audit (baseline commit `9bac0c2`). It adds no features and removes none. Saved selections, all six brackets, reviewed guidance, source rates, samples and dates are unchanged. No number is estimated, no bracket is substituted, and no review date is advanced by this release.

## What changed

**Composition results can no longer disagree with your draft.** Generated alternatives now remember the exact picks, bans, enemies, team size, rank, data revision and guidance status they were built from. Adding or removing a ban, clearing enemies, changing rank, or using Undo on the phone clears alternatives that no longer match and says why. **Apply** and **Substitute** re-check the current bans and enemy picks first, so a banned or enemy-picked hero can never be placed on your team. **Plan this pair** and **Explore in planner** on a reviewed plan also refuse a banned or enemy-picked hero, and never delete your ban to make room. Whenever alternatives are cleared because something changed, including a data update or a failed patch check, the panel says what changed: your picks, bans or enemies, your search options, or the data. A saved draft that was already wedged (a locked hero who is also banned, a duplicate hero or role) repairs itself once on opening, keeps every usable selection, and tells you what it removed.

**Evidence age is described once and redrawn whenever it changes.** The engine now has a single definition of statistics age: Current through 30 hours, Aging through 48 hours, Stale after that, with five minutes of tolerance for clock differences. These are the same thresholds the publisher uses. When a background check fails, when the official patch check fails, or when unchanged statistics simply grow old while the page stays open, the page redraws. Every automatic redraw (new data, an evidence change, going offline or online) goes through one scheduler in every mode, including the Windows app: it keeps the focused control and your cursor, waits only while you are actively typing or holding a click, never waits indefinitely, and is never lost, including on iPhone Safari, which sends no signal when a field is replaced. The Windows app also redraws when its connection drops. Statistics that no eligible source supplies are reported as unavailable, never as current, and while recommendations are paused the phone status badge says Paused and why: a failed patch check, or new official content awaiting the next collection. Typing in the desktop hero or item search no longer reverses the text (an older bug found by the review). Old statistics stay available with their original values and fetch date, labelled "Saved statistics · not current" rather than presented as a current ranking. The phone Meta page no longer says reviewed tiers lead when every tier is inactive; it says tiers are paused, why, and that heroes are ordered by role performance. When tiers do lead over old statistics, it calls them saved samples, not current ones.

**Every publication path uses the same row validation.** A "complete" collection previously skipped the numeric checks that partial updates received. Complete collections, partial updates (including updates published because Pred.gg is current while Statz failed), Windows imports, stored bundles, and the Windows app's saved and restored data now share one validator: known bracket, usable fetch dates, unique hero-role rows, samples above zero, finite rates from 0 to 100, and wins consistent with the sample where wins are supplied. A tier row whose hero page was not collected is still checked as a tier-list observation, and its missing role record must carry no numbers. A rejected collection never replaces the last good publication. A stored file that fails validation, is truncated, is corrupted or is not a bundle at all is skipped with a logged reason instead of stopping the run. It is replaced from the run's own newer verified copy when there is one, and only otherwise by the older, dated public seed. In the Windows app, a collection whose rows fail is named as an error, the status line says so, and the last validated data stays on screen; a damaged saved file can no longer stop the app from starting or make every refresh fail. All 57 real bundles on this PC and on the live site (six brackets; cloud store, Windows collector, installed app, seed) keep exactly the verdict they had.

**Release gates.** The publishing workflow and the source packager now run the JavaScript engine suite as well as the Python suite; packaging fails if Node.js is missing instead of recording "not run". A new `verify` workflow runs the Python, JavaScript and browser checks on every pull request and release branch. It never collects, publishes or deploys.

**Reproducible audit checks.** Each confirmed audit defect has a test that asserts the correct behaviour. Defects still open are recorded in `tests/known-defects.json` (browser), as `expectedFailure` (Python) or `knownDefect` (JavaScript). A recorded defect must still reproduce: once its reproduction passes, the run fails until the marker is removed, so a fixed defect cannot keep its marker and a marker cannot hide a regression.

## Independent review

Before publication, every phase was reviewed by an independent reviewer, and each finding was then challenged by a second reviewer who tried to disprove it against the code. 35 findings held up across 2.24.0 and 2.25.0, and 3 more could not be challenged because the review run was cut short (those concern 2.25.0 and are fixed there as well); none was a security issue or a risk to saved data. The 15 that concern this release's code are fixed in this release, each with a test that fails on the unfixed code: the Pred.gg-only publication path and the Windows app's saved successes now validate rows; damaged stored files and a rejected stored bundle no longer stop a scheduled run; two planner paths (Plan this pair, reviewed plans without a strategic review) could still lock a banned hero; alternatives cleared by a data update gave no reason; a postponed redraw could be lost on iPhone Safari; the phone headline and the evidence state could describe ineligible or saved statistics as current; and three test weaknesses (unenforced JavaScript markers, a browser probe that could pass without a real redraw, and a staging helper that could write outside its folder).

A second independent review then checked these fixes the same way. It confirmed 16 further findings, one of medium severity (the Windows app could still restore a saved Pred.gg-only update with damaged rows), and all are fixed here with tests that fail on the earlier fixes: the Windows app's saved Pred.gg-only updates, tier rows of failed pages, a damaged stored file being replaced by the older seed, a damaged latest file stopping the app, a failed validation still shown as current, the wrong reason given when a search option clears alternatives, the phone badge after a failed patch check, a focus steal and a swallowed click during a postponed redraw, the Windows app's connection-loss redraw, reversed text in the desktop search, and three tests that could not fail. Two further claims were examined and rejected.

A third review of the fixes confirmed 10 further findings in this release's code (two medium: a focused dropdown could hold a paused recommendation on screen, and going offline or online took the phone keyboard away; new data could also redraw mid-typing or mid-click). They led to the single redraw scheduler described above, the patch-change search keeping its filter, the badge naming the real reason, and three Windows app fixes (row failures in partial collections, the status message, and saved-file readers that could make every refresh fail). Each has a test that fails on the previous code.

## Deliberately unchanged in this release

- `sw.js` and its cache name. Changing the cache name today would delete visitors' saved offline brackets (audit defect F). The page itself is fetched network-first, so installed phones still receive 2.24.0 when online. The cache is reworked, with a migration, in 2.25.0.
- Recommendation ordering and every observed value. Only labels, redraw timing and validity checks changed.

## Still open after this release (recorded, reproduced, scheduled for 2.25.0)

- **D** One failed hero page still discards an otherwise fresh collection.
- **E** Generating five-hero compositions blocks the page (measured 1.4 s on this PC against a 0.5 s budget).
- **F** A new release deletes saved offline brackets; a malformed HTTP 200 response can evict a verified bracket.
- **G** The downloadable strategy-review packet omits official changes (0 of 241 in the staged build).

## Verification (actual results, 18 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153)

- Python: 143 tests run, 141 pass, 1 recorded expected failure (defect D), 1 skipped where no local bundle store exists. 2.23.0 had 97.
- JavaScript: 101 tests, all pass; 2 of them assert that defect F still reproduces. 2.23.0 had 78.
- Audit browser suite against the staged build: 32 of 32 verdicts match the ledger. Fixed and enforced: A1–A13, B1–B3, C1–C13, H1. Reproduced and recorded open: E1, G1. The review guards A10–A13, C1, C5–C7 and C9–C13 each fail on the code before their fix.
- The Windows app, started from an isolated data folder, redrew its main view exactly once when its connection was cut, and not at all while idle.
- `browser_release_222`, `browser_companion_accessibility` (axe WCAG 2.1 A/AA, both themes, no violations) and `browser_companion` (six brackets, no page errors) pass on the staged build.
- The staged build was rendered from saved bundles with no network access and keeps each bundle's original date.
- Clean-room source package (80 files, unpacked into an empty folder and tested there): 143 Python tests run, of which 6 are skipped because they need the public seed or the local bundle store, which are not part of the package, and 1 is the recorded expected failure; 101 JavaScript tests pass.

## Known gaps

- Not tested on a physical phone, with VoiceOver or TalkBack, or as a natively installed app. Browser emulation is not a substitute.
- Two older suites, `browser_ranks.cjs` and `browser_static.cjs`, fail on one outdated expectation each. They fail identically on untouched 2.23.0, so this release did not cause or fix them.
- The suites were last certified on Edge 152; this run used Edge 153.
- The Windows manual recovery path was repaired after the 18 September folder move (shortcut and key location) and its sign-in was verified, but a full manual collection was not run; that is scheduled with the cloud-primary work in 2.25.0.
- Cloud collection for this release is only verified once the first post-publication cloud run produces its receipt.

## Rollback

Windows app: quit the app, then run **Roll Back 2.24.0.bat**. It verifies the backup's checksums before restoring 2.23.0 and does not touch `data\`, `snapshots\` or `settings.json`. Website: revert the 2.24.0 merge commit on `main`; Pages redeploys 2.23.0. Published bundles and their dates are separate from the app and are not affected. Never force-push and never reset the `data-updates` branch.
