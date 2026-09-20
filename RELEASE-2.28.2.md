# Predecessor Meta 2.28.2: evidence failures are announced to screen readers

2.28.2 is a small accessibility release. The website loads its display-only evidence (source builds, counters, original descriptions) after the page is drawn. When one of those files failed, or arrived after a wait, nothing was announced: a screen reader user had to re-read the section to discover the change. The loading placeholder carried `role="status"` and the failure note carried nothing at all, and because the page rebuilds those placeholders on every redraw, that role was either silent or, on the Builds page with one placeholder per hero, 24 live regions at once.

Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged, and `engine.js`, the publisher and the data are untouched.

## What changed
- **Placeholders are no longer live regions.** The text is unchanged and still read in place.
- **Two polite regions that are always present** (`ui.html`): `#evidence-status` on the page and `#detail-evidence-status` inside the detail dialog. A modal dialog makes the page behind it inert, so a region outside the dialog would not be announced while one is open. The dialog also takes its accessible name from its title (`aria-labelledby`), which it did not have before.
- **At most one announcement per view and wait** (`trackEvidence` in `ui.js`):
  - A failure says "Some evidence in this view could not be loaded. Reload latest data to try again."
  - "Detailed evidence loaded." is said only after a wait of at least a second, so a fast load stays quiet.
  - A wait starts when a placeholder shows a file loading, and again after a retry. It ends by the files' own state (`annexPhase`, which the static adapter reads from its own downloads and which never starts one), not by placeholders leaving the screen: a search or the phone layout also removes them.
  - A page failure that happens while a dialog is open is said when the dialog closes, unless the dialog already said it for the same files.
  - The regions are cleared when the view or the dialog changes, so an old message is never read at the end of a new one.
- **The Windows app and exported snapshots say nothing**, because there the missing evidence is known when the page opens and is already in the reading order.

## What this release does not change
Focus inside a rebuilt dialog was part of the first attempt at this change. 2.28.0 fixed it first (`rebuildDialog` in `static_client.js`), so that code was dropped at the rebase. Probe I15 stays as a guard and passes on 2.28.1 unchanged.

## Verification (actual results, 20 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge, Playwright WebKit)
- **Probes first.** I14 and I16 were run against the released 2.28.1 code and reproduced there: 24 live placeholders with zero announcements; nothing said after a dialog closes; an old announcement still readable in the next dialog; no second announcement when a retry fails again; and a false "loaded" when the layout switches while files are still downloading. Both pass here.
- **A screen-reader announcement is modelled, not heard.** The probes count text changes inside live regions that already existed, which is what a screen reader announces, and ignore regions inserted together with their text, which it does not. No real screen reader was used.
- **Review.** An independent review of the first attempt found six gaps. All are fixed here, and probe I16 covers the four behavioural ones.
- **Audit browser suite:** 96 of 96 verdicts match the ledger (I14, I15 and I16 are new); no defect is open.
- **Other browser suites:** static (57 + 50) and ranks in Edge and WebKit; companion; axe (WCAG 2.1 A/AA) on 30 phone states with no violations, plus axe on the failed-evidence dialog inside probe I14; release_222; offline 10 of 10.
- **Python:** 196 tests pass, 1 skipped where no local bundle store exists. **JavaScript:** 163 tests pass.
- **Engine:** `git diff 0294abc -- engine.js` is empty.

## Known gaps
- The gaps listed in RELEASE-2.28.1.md still stand, including the WebKit source selector on Changes and Library at 320 px.
- Not tested with a real screen reader (NVDA, JAWS or VoiceOver), on real devices, or with native installs. Playwright WebKit on Windows is not Safari.
- Announcements are English only, like the rest of the interface.

## Rollback
- **Windows app:** quit the app, then run **Roll Back 2.28.2.bat**. It verifies the backup's checksums before restoring 2.28.1, and does not touch `data\`, `snapshots\` or `settings.json`.
- **Website:** revert the 2.28.2 merge commit on `main`; Pages redeploys 2.28.1. No saved data changes format. Never force-push.
