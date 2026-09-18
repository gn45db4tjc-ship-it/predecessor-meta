# Predecessor Meta 2.26.1 — Fixes from the live check of 2.26.0

After 2.26.0 was published, independent agents checked the live website in real browsers: data, the four phone tasks at 390 px and at 320 px with large text in both themes, offline use with the real service worker, and desktop. A second agent re-checked their results. Nothing high or medium severity was found, and everything the release promised held. This patch fixes the smaller issues they confirmed. The engine, collection, publication and offline storage are unchanged. Saved selections, all six brackets, reviewed guidance, source rates, samples and dates are unchanged. No number is estimated, and no review status or review date is changed.

## What changed

- **Limitations are counted per source.** Two sources that fail with the same message (for example Pred.gg statistics and Pred.gg game data) are now listed separately, so the count matches the source notices (7, not 6).
- **A cancelled search says so where you look.** If you start a new composition search while earlier alternatives are shown and then cancel it, the panel now says "Search cancelled. The alternatives below are from your previous search." The earlier alternatives stay. The note disappears as soon as a new search starts or an alternative is used, and a search cancelled with no earlier results says "Nothing was applied".
- **Keyboard focus is kept.** After cancelling a search, focus returns to Generate instead of dropping to the top of the page, and a redraw keeps focus on the control you were on, including lineup slots and the same hero in the same list (it no longer jumps to another copy of that hero elsewhere on the page). A result discarded because only the search options changed now says so, instead of blaming your picks.
- **The Live hero picker marks small samples** ("· small sample" under 100 games), as the Meta list already did.
- **A wrong device clock is named.** If this device's clock is behind the time the statistics were fetched, the status line says they were fetched "at a time ahead of this device's clock" instead of "less than 1h ago".
- **Every missing number gives its real reason.** When no hero of a role has 100 or more games in the selected rank (for example Paragon+ jungle), Top five says so and points to "Show all heroes"; a list shorter than five says how many heroes qualify. A hero whose statistics page failed to load, or was never collected because the source blocked the collector part-way, shows "Statistics failed to load" (and Top five says how many failed) instead of "no sample"; the page no longer says heroes are ordered by performance when none can be ranked. When statistics are paused because verification failed, the page says "Statistics paused" and no longer describes a ranking by performance; when no eligible statistics source exists, it says "Role statistics unavailable".
- **The hero page names the source of its numbers.** The line beside the review status now reads, for example, "Statz 47.7% · 501 games" (or "Pred.gg (retained) …" when the numbers come from a retained Pred.gg sample), so a paused or retained review is not read as describing those numbers.
- **Review dates are readable.** Seven places showed review dates as raw timestamps (for example 2026-09-14T19:12:40-05:00); they now use the same date format as every other date.
- **Narrow phones with large text.** At 380 px and below, the rank selector takes its own row, so "Gold+" is no longer clipped; the Situation dialog's item picker uses the full width and its placeholder reads "Choose an item"; hero tiles keep room for the name when the statistics column shows a longer reason.
- **The phone status chip agrees with the page.** When only the live check is pending (a saved copy in the Windows app at phone width), the chip now says "Paused · Live check pending" (or "Live check failed") like the rest of the page, instead of showing the saved game patch as current.
- **Contrast.** The pressed build-variant buttons on the hero page now meet WCAG AA contrast in the light theme (they were 4.49:1).
- **Offline, a rank says whether it is saved.** Choosing, while offline, a rank that was never opened on this device now says "This rank is not saved on this device. Open it once while online to keep it for offline use." If a copy is saved but the page could not open it, it says a reload opens it when offline support is active in this browser (a normal reload with the service worker was verified to open the saved copy), and otherwise that it cannot be opened offline here; an unsaved rank in such a browser is not offered offline use either. Before, all of these showed a generic failure.

## Corrections to the 2.26.0 notes

- The phone Compositions screen shows one lineup (allies, counted against the combination size); Draft shows two. The 2.26.0 notes said Compositions showed two.
- In 2.26.0 a search cancelled while earlier alternatives were shown was reported only by a short message at the bottom of the screen; 2.26.1 makes the panel say so, as the 2.26.0 notes described.

## Independent review

Before publication the patch went through four independent review rounds. In each, reviewers with different focuses (data honesty, interface and focus, test validity) examined the code and the staged site in a real browser, and every finding was then challenged by a second agent that tried to disprove it. Across the rounds they confirmed one high, three medium and a number of low-severity findings in the patch itself. Each was fixed with a check that fails on the code before the fix, unless it is listed under known gaps below. The rounds stopped when a round found nothing above low severity; a final skeptical check of the last change then found one more low-severity wording issue (a failed live check shown as pending on the phone chip), fixed with a check.

- **High, withdrawn:** an earlier draft made the website call the official description review "reviewed for current patch" after a verified patch check. After a hotfix that changes the official article (the version number stays the same), or after a later failed check, that overstated verification. The change was withdrawn; a guard check now fails if it ever returns.
- **Medium:** Top five and the hero list gave a false reason for missing numbers in three situations: statistics paused (it blamed too few games), a statistics page that failed to load (it said "no sample"), and a Pred.gg role the collector never reached after being blocked. All three now name the real reason.
- **Low, among others:** cancel notes that outlived what they described; keyboard focus moving to another copy of the same hero, or to Cancel so that a second Enter cancelled the search just started; an offline message that promised a reload would work where offline support was not active; a discarded result that blamed the picks when only the search options changed; hero tiles squeezing the name or splitting a win rate from its % sign at 320 px with large text; and, in the Windows app at phone width, a status chip that did not say Paused while the rest of the page did.

## Verification (actual results, 18 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153)

- Every finding has a browser check (P1-P15 in `tests/browser_audit_regressions.cjs`) that fails on the code before its fix; each was run against that code first.
- Audit browser suite on the staged build: 67 of 67 verdicts match the ledger, and the ledger of open defects is empty. Longest main-thread stall while generating five-hero alternatives: 32 to 41 ms across runs (budget 500 ms).
- Accessibility (axe, WCAG 2.1 A/AA) on 15 phone states in each theme: no violations; the light-theme build-variant contrast is covered by P10.
- Python: 178 tests, all pass, 1 skipped where no local bundle store exists. JavaScript: 149 tests, all pass.
- Offline cache suite, real service worker in a real browser, 7 of 7, including a next release that keeps all six saved ranks and an upgrade from a cache written by the actual 2.23.0 worker. A normal reload while offline was also shown to open a saved rank through the service worker.
- `browser_release_222`, `browser_companion` (six brackets), `browser_ranks` and `browser_static` pass.
- Clean-room source package (unpacked into an empty folder and tested there): 178 Python tests run with 6 skipped, and 146 JavaScript tests pass with 3 skipped.

## Known gaps

- Real-device acceptance of the phone changes on the owner's phone is still open.
- On the website, Sources & accuracy still describes the official description review as "reviewed for saved patch · live check pending", even right after a verified patch check. This is deliberately cautious: the website does not re-check those reviewed descriptions itself, and a hotfix can change the official article without changing the version number. (An earlier draft of this patch reported them as current; the review found that this could overstate verification after a hotfix, so it was withdrawn.)
- Not changed: the reviewed guide's own wording (it is reviewed strategy content and changes only through the review process); third-party hero and item images are not available offline (as the install help says); the "Browser last checked" time on desktop is the time the page last checked, also when it only read a saved copy; the Undo banner can cover the Live buttons for up to 8 seconds on a 320 px screen with large text.
- The suites were last certified on Edge 152; these runs used Edge 153.

## Rollback

Windows app: quit the app, then run **Roll Back 2.26.1.bat**. It verifies the backup's checksums before restoring 2.26.0 and does not touch `data\`, `snapshots\` or `settings.json`. Website: revert the 2.26.1 merge commit on `main`; Pages redeploys 2.26.0. Ranks saved for offline use are kept. Never force-push.
