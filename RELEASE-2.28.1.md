# Predecessor Meta 2.28.1: the phone role strip, and a correction to the 2.28.0 notes

2.28.1 is a small fix release. On phone widths, the role strip on the Meta page and in the Live hero picker (Jungle · Offlane · Midlane · Carry · Support) scrolled sideways, so "Support" sat off screen at every width, and "Carry" as well at 320 px. It now wraps like the hero tabs. It also corrects a false claim in the 2.28.0 release notes.

Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged, and `engine.js`, the publisher and the data are untouched.

## What changed
- **`mobile.css`, at 700 px and below.** `.role-choices.compact` wraps (`flex-wrap: wrap`, `overflow: visible`) instead of scrolling sideways. Its chips size to their content, keep a 44 px minimum height and may break a long word. At 390 px the strip is 366 px of content in a 366 px box, on two rows, with every role on screen. 2.28.0 changed only `.tabs`, which is a different strip.
- **Probe V11** now also visits the phone Meta page and the Live hero picker dialog. It reproduces the defect on 2.28.0 (`meta Role: horizontal 409>366`, `tab "Support" 336-419`) and passes here.

## Correction to the 2.28.0 notes
RELEASE-2.28.0.md said, under "Phone: tabs without scrollbars": "Hero and Meta tab strips wrap instead of scrolling. There is no vertical scrollbar at any width, and every tab is at least 44 px tall and fully on screen." That was true of the hero, Builds and Compositions strips, which use `.tabs`, and false of the Meta page's own role strip and the Live picker, which use `.role-choices.compact`. The claim was not caught before release because probe V11 visited only the hero, builds and planner routes. It was found by the live verification of 2.28.0 after publication, and is recorded in `qa/2280-cloud-receipt.json`.

RELEASE-2.28.0.md now carries a correction note pointing here. README.md and CHANGE-REPORT.md are corrected in place.

## Verification (actual results, 19 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153, Playwright WebKit 26.6)
- **Probe first.** The extended V11 was run against the released 2.28.0 code and reproduced the defect at 320, 360, 390 and 412 px, with default and large text, on both the Meta page and the Live picker. It passes on this build, with no problem at any width.
- **Audit browser suite:** 93 of 93 verdicts match the ledger; no defect is open.
- **Other browser suites:** static (57 + 50) and ranks in Edge and WebKit; companion; axe on 30 phone states; release_222; offline 10 of 10.
- **Python:** 196 tests pass, 1 skipped where no local bundle store exists. **JavaScript:** 163 tests pass.
- **Engine:** `git diff a1076c6 -- engine.js` is empty.
- **Clean-room source package:** 100 files, unpacked into an empty folder and tested there: 196 Python tests run (18 skipped without the public seed and local store); 152 JavaScript tests pass (11 skipped).

## Known gaps
- The gaps listed in RELEASE-2.28.0.md still stand, except the phone role strip fixed here.
- Not tested on real devices: Playwright WebKit on Windows is not Safari.

## Rollback
- **Windows app:** quit the app, then run **Roll Back 2.28.1.bat**. It verifies the backup's checksums before restoring 2.28.0, and does not touch `data\`, `snapshots\` or `settings.json`.
- **Website:** revert the 2.28.1 merge commit on `main`; Pages redeploys 2.28.0. No saved data changes format. Never force-push.
