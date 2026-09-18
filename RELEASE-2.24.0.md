# Predecessor Meta 2.24.0 — Advice that always matches what is on screen

This is a reliability release from the 2.23.0 audit (baseline commit `9bac0c2`). It adds no features and removes none. Saved selections, all six brackets, reviewed guidance, source rates, samples and dates are unchanged. No number is estimated, no bracket is substituted, and no review date is advanced by this release.

## What changed

**Composition results can no longer disagree with your draft.** Generated alternatives now remember the exact picks, bans, enemies, team size, rank, data revision and guidance status they were built from. Adding or removing a ban, clearing enemies, changing rank, or using Undo on the phone clears alternatives that no longer match and says why. **Apply** and **Substitute** re-check the current bans and enemy picks first, so a banned or enemy-picked hero can never be placed on your team. A saved draft that was already wedged (a locked hero who is also banned, a duplicate hero or role) repairs itself once on opening, keeps every usable selection, and tells you what it removed.

**Evidence age is described once and redrawn whenever it changes.** The engine now has a single definition of statistics age: Current through 30 hours, Aging through 48 hours, Stale after that, with five minutes of tolerance for clock differences. These are the same thresholds the publisher uses. When a background check fails, when the official patch check fails, or when unchanged statistics simply grow old while the page stays open, the page redraws without disturbing a field you are typing in. Old statistics stay available with their original values and fetch date, labelled "Saved statistics · not current" rather than presented as a current ranking. The phone Meta page no longer says reviewed tiers lead when every tier is inactive; it says tiers are paused, why, and that heroes are ordered by role performance.

**Every publication path uses the same row validation.** A "complete" collection previously skipped the numeric checks that partial updates received. Complete collections, partial updates, Windows imports, stored bundles and cache restores now share one validator: known bracket, usable fetch dates, unique hero-role rows, samples above zero, finite rates from 0 to 100, and wins consistent with the sample where wins are supplied. A rejected collection never replaces the last good publication, and a damaged stored bundle is skipped with a logged reason instead of stopping the run. All 32 stored real bundles across the six brackets pass the new validator unchanged.

**Release gates.** The publishing workflow and the source packager now run the JavaScript engine suite as well as the Python suite; packaging fails if Node.js is missing instead of recording "not run". A new `verify` workflow runs the Python, JavaScript and browser checks on every pull request and release branch. It never collects, publishes or deploys.

**Reproducible audit checks.** Each confirmed audit defect has a test that asserts the correct behaviour. Defects still open are recorded in `tests/known-defects.json` (browser), as `expectedFailure` (Python) or `todo` (JavaScript); each fix removes its marker in the same change, and a leftover marker fails the run.

## Deliberately unchanged in this release

- `sw.js` and its cache name. Changing the cache name today would delete visitors' saved offline brackets (audit defect F). The page itself is fetched network-first, so installed phones still receive 2.24.0 when online. The cache is reworked, with a migration, in 2.25.0.
- Recommendation ordering and every observed value. Only labels, redraw timing and validity checks changed.

## Still open after this release (recorded, reproduced, scheduled for 2.25.0)

- **D** One failed hero page still discards an otherwise fresh collection.
- **E** Generating five-hero compositions blocks the page (measured 1.4 s on this PC against a 0.5 s budget).
- **F** A new release deletes saved offline brackets; a malformed HTTP 200 response can evict a verified bracket.
- **G** The downloadable strategy-review packet omits official changes (0 of 241 in the staged build).

## Verification (actual results, 18 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153)

- Python: 120 tests run, 119 pass, 1 recorded expected failure (defect D). 2.23.0 had 97.
- JavaScript: 99 tests, 97 pass, 2 recorded todo (defect F). 2.23.0 had 78.
- Audit browser suite against the staged build: 19 of 19 verdicts match the ledger. Fixed and enforced: A1–A9, B1–B3, C1–C4, H1. Reproduced and recorded open: E1, G1.
- `browser_release_222`, `browser_companion_accessibility` (axe WCAG 2.1 A/AA, both themes, no violations) and `browser_companion` (six brackets, no page errors) pass on the staged build.
- The staged build was rendered from saved bundles with no network access and keeps each bundle's original date.
- Clean-room source package (80 files, unpacked into an empty folder and tested there): 120 Python tests run, of which 2 are skipped because the public seed and the local bundle store are not part of the package, and 1 is the recorded expected failure; 97 JavaScript tests pass with 2 recorded todo.

## Known gaps

- Not tested on a physical phone, with VoiceOver or TalkBack, or as a natively installed app. Browser emulation is not a substitute.
- Two older suites, `browser_ranks.cjs` and `browser_static.cjs`, fail on one outdated expectation each. They fail identically on untouched 2.23.0, so this release did not cause or fix them.
- The suites were last certified on Edge 152; this run used Edge 153.
- The Windows manual recovery path was repaired after the 18 September folder move (shortcut and key location) and its sign-in was verified, but a full manual collection was not run; that is scheduled with the cloud-primary work in 2.25.0.
- Cloud collection for this release is only verified once the first post-publication cloud run produces its receipt.

## Rollback

Windows app: quit the app, then run **Roll Back 2.24.0.bat**. It verifies the backup's checksums before restoring 2.23.0 and does not touch `data\`, `snapshots\` or `settings.json`. Website: revert the 2.24.0 merge commit on `main`; Pages redeploys 2.23.0. Published bundles and their dates are separate from the app and are not affected. Never force-push and never reset the `data-updates` branch.
