# 2.29.0 design review candidate — September 21, 2026

Four destinations, hero sections, precise build evidence, a shared Plan roster, the full phone role list, and focused Reference/Sources views. Source data, engine calculations and saved-storage formats remain unchanged. This candidate is not installed or published. The final check receipt and release boundaries are in [RELEASE-2.29.0.md](RELEASE-2.29.0.md).

## Earlier changes

# Current release: 2.28.2

See RELEASE-2.28.2.md for the evidence announcements (accessibility), RELEASE-2.28.1.md for the phone role strip fix and the correction to the 2.28.0 notes, RELEASE-2.28.0.md for the fixes from the review of 2.27.0 (honest labels, readable counters, a compact status line), RELEASE-2.27.0.md for the faster first load (bundle size, audit item 11), RELEASE-2.26.2.md for the WebKit maintenance release, RELEASE-2.26.1.md for the fixes from the live check of 2.26.0, RELEASE-2.26.0.md for the phone navigation release, RELEASE-2.25.0.md for the audit completion release, RELEASE-2.24.0.md for the audit reliability release and RELEASE-2.23.0.md for the mobile Meta and cloud-refresh upgrade. Older sections below document their own releases.

The independent-source repair is described in `RELEASE-2.21.1.md`. The following is the historical Claude design report; its unchanged-runtime statements apply to Design Revision 2 alone.

# Change report — design revisions 1 and 2 on 2.21.0 + hosting revision 3

Baseline: commit `ad044213d04163ca19ebb4b4f1df59b93b8d2942` (application runtime 2.21.0, website adapter hosting revision 3, rank-display fix). This revision changes presentation only. `engine.js`, `predecessor_meta.py`, `reviewed_guidance.json`, `shared_server.py`, `static_publish.py` and the updater are byte-identical to the baseline. Route identifiers, element IDs, data hooks, the saved-state key and every existing test assertion are unchanged. The runtime version string stays 2.21.0 because the public fixtures carry that version and the correction suite compares the two.

## Diagnosis (from six independent critics and a synthesis, all in `design-review/critique/`)

1. Every page paid the same 270–1018px "chrome tax" before its first useful row: three-cell patch strip, red banner, assembly sentence, failure accordion, a repeated "Selected statistics" box, an eyebrow, a 32px title and a paragraph. On the Meta landing page the first hero row sat at y=970 on a 1080px screen.
2. Cards showed four to six numbers at the same size, so the figure that answers "why" never led.
3. Text contrast passed everywhere, but every control and chip border failed the 3:1 non-text floor, and gold and red each carried about six jobs.
4. One pill style was used for real buttons, inert tag chips, coverage chips and disclosure rows, so a non-programmer could not tell what was clickable; hero names had no link styling.
5. Hero search existed on two pages of nine; the shared-picks relationship between Compositions, Draft and Live game was never stated.

## What changed

**Shell.** A 56px top bar holds the rank selector, a global hero finder (type a name, the hero's Partners open, picks intact), and the plan/export actions. The status stack is one 40px strip of patch/statistics/guidance cells, one status line (amber for retained data, red only for a hard failure), a one-line freshness note and the collapsed source-notice disclosure. Chrome above the content is at most 240px at 1920 (was about 330). Revision 10 (2.28.0): the freshness note and every non-material notice moved into a collapsed Status details panel opened from the status line; material notices stay visible below it, and the chrome is 127 px at 1440×900 excluding them. The rail is grouped Plan / Draft & live / Reference with the 01–09 prefixes removed; the connection mode moved to the rail footer. Every route, ID and data hook is unchanged.

**Design system.** One organised stylesheet with tokens: seven type steps (12 caption, 13 support, 14 secondary, 16 body, 18/20 headings, 28 page title, 24–26 headline figures); a 4/8/12/16/24/32 spacing scale; input, select and button borders `#6b7fa3` (≥3:1 against fill and page); chips flat with a glyph per evidence class (● Observed, ◇ Calculated, ✦ Reviewed, ! warning) so the distinction survives greyscale; disclosures with a blue chevron and hover state; hero names underlined; item names underlined; gold limited to the primary action per view and the Reviewed marker; eyebrows demoted to muted text. Content width 1720px, 2000px on 2200px+ screens; prose capped at 76ch.

**Meta.** Role tabs and list filter directly under a short header; the table starts at y≈482 at 1920 (was 970). Revision 10 (2.28.0): the statistics selector moved into the page head and the role-statistics note is one collapsed line; the first row is at y≈385 at 1440×900 (was about 707 on the live 2.27.0 site). The reviewed working pool, tier method and the statistics-source switch sit in a right-hand column at 1560px+ (below the table on narrower screens). The reviewed tier is a compact button with an underlined label; each row keeps a "Partners & builds" link. The same table helper serves the non-Gold rank view, which keeps its own observed win-rate ordering, its `Rank meta` title and the separate authored reference.

**Hero.** Compact header (portrait, name, planning role, reviewed tier, role win rate and games) with the four tabs immediately beneath it. Partners is the first tab: the three leading cards (y≈521, was 739) now lead with the kit reason, one headline figure (pair win rate, or kit points when no pair sample exists), the calculated gap, and the kit points as a caption; sample, baseline and source stay beside the number. Ranking rules moved into a disclosure.

**Builds.** The recommended plan shows six numbered positions and a loadout strip (augment, Eternal, both blessings, crest) without opening details; "Why these six items", "Full setup", adaptations, the Statz standout and community guides stay as disclosures. The Builds page is a two-column card grid (three at 2200px+) with a one-sentence reason and a "Full reasoning" disclosure per hero, plus direct Partners links.

**Compositions, Draft, Live game.** Controls collapsed into one toolbar; explanatory footers became "How the search works" and "How candidates are ordered" disclosures; allied picks are labelled as shared across the three pages. Composition cards lead with the metric you sorted by (26px), followed by the others at 20px; "Use these picks" is a secondary button, "Clear" is quiet, and "Lock pick" is no longer gold. Live game frames the "You are playing" control in gold; the current-game panel (priority, owned items) precedes the plan; timing notes and limits sit in one disclosure; the baseline plan and the calculated six remain both visible for comparison.

**Reference pages.** Items & loadouts is a compact row grid (six across at 1920) with the search first. Sources & accuracy leads with a computed four-part verdict (sources ok, current failures with the retained date, official patch status, guidance status) and the source status table, then the audits. Reviewed guide and Changes keep their content with shorter headers.

**Narrow screens.** (Revised again in revision 2, below.) The existing sub-700px and sub-800px behaviour is preserved (menu toggle, status toggle, stacked slots, native 44px targets); the new finder and verdict collapse into single columns.

## Files changed

| File | Change |
|---|---|
| `ui.html` | New stylesheet and tokens; top-bar finder and datalist; connection moved to rail footer; all IDs retained |
| `ui.js` | Grouped rail; shorter status labels; `metaToolbarHTML`/`metaTableHTML` helpers; rewritten `metaView`, `heroView`, `pairCard`, `plannedBuildHTML`, `buildsPageView`, `plannerView`, `compCard`, `draftView`, `liveView`, `libraryView`, `dataView`, `predAuditHTML`, `guidanceView`, `changesView`; hero-finder handler; Sources owns its audit order |
| `rank_view.js` | Non-Gold meta view uses the shared table helper and the same layout; compact rank note; sentence-case guidance label |
| `static_client.js` | Sentence-case patch label only |
| `tests/browser_design.cjs` | New: 71 design acceptance checks at 1920×1080, 2560×1440 and 1536×864 @1.25 (125% emulation) |
| `package_source.py` | Records the design revision; WebKit receipt optional; bundles this report and the install notes |
| `CHANGE-REPORT.md`, `INSTALL-AND-ROLLBACK.md` | New |

The patch is reproducible: `design-review/apply_ui_patch.py` rebuilds `ui.js`, `rank_view.js` and `static_client.js` from `design-review/baseline-source/` plus `design-review/ui_patch_functions.js`.

## Measured before → after (first data row, y in CSS px at 1920×1080, same Gold+ fixtures and states)

| Screen | Before | After |
|---|---|---|
| Meta (Gold+) | 970 | 482 |
| Meta (Diamond+) | 722 | 461 |
| Hero partners (Steel Jungle) | 739 | 521 |
| Builds page | 1018 | 672 |
| Compositions (results container) | 1754 | 1247 |
| Live game (build) | 1596 | 1281 |

Contrast: every text/background pair remains ≥4.5:1; control borders now ≥3:1 (`design-review/critique/02-color-contrast.md` has the measured table; the design suite re-measures the select border and muted text live).

## Tests run

- Python: `python -B -m unittest discover -s tests -p "test_static*.py"` — 43 passed.
- Edge (Playwright 1.63, Microsoft Edge 152): `tests/browser_static.cjs` — 51 checks at 1440×900 and 390×844 plus the seven legacy suites (meta, strategy, live, augment, correction, sequences, synthesis; 671 assertions per viewport), all passing; `tests/browser_ranks.cjs` — 30 role/rank tables per viewport, both viewports passed, Diamond+ export preserved; `tests/browser_design.cjs` — 71 checks at each of three viewports, passed (re-run after the Tide palette).
- WebKit (Playwright WebKit on Windows, not native Safari): `browser_static.cjs` 51 checks at 1440×900 and 390×844 with the seven legacy suites, passed; `browser_ranks.cjs` 30 role/rank tables per viewport, passed. A WebKit-only overflow of the "You are playing" select at 390px was found by this run and fixed before packaging.
- Before/after captures: `design-review/before/` and `design-review/after/` (1920×1080, 2560×1440, 390×844; `INDEX.json` records each state and first-row position; `errors.json` is empty for every viewport). Example picks are illustrative; no user draft was used.

## Known limitations

- 125% Windows scaling was emulated in the browser (1536×864 CSS px at device scale 1.25); native OS scaling and a physical second monitor were not tested.
- The sticky picker row suggested by the layout critic was not implemented; results on Compositions and Live game now start around y=1250 rather than inside the first 1080px.
- Share/Open/Export remain individual top-bar buttons; collapsing them into one menu would change tested IDs.
- The freshness sentence is appended as plain text by `static_client.js`, so it stays one long line rather than label/value chips. (Revision 10: it now sits in the collapsed Status details panel.)
- The live-game view still shows the reviewed plan and the calculated six as two grids; the brief asks for both to remain comparable.
- No analytical bug was found; no engine, threshold or authored content was changed.

## Visual direction (chosen after a canvas review): "Tide" on a Ledger + Signal hybrid

Three structural directions and three palettes were mocked on the same Steel · Jungle screen with real Gold+ figures; the user chose the Ledger + Signal hybrid in the Tide palette. Applied as tokens in `ui.html` only:

| Token | Value | Use |
|---|---|---|
| background / rail | `#0c151a` / `#091014` | page, navigation |
| surface / raised / inset | `#132128` / `#1a2c35` / `#0e191f` | panels, buttons, inputs |
| line / control border | `#23363f` / `#6f95a0` | hairlines; inputs and buttons (≥5:1 on every surface) |
| text / secondary / muted | `#e6eef0` / `#bfcdd2` / `#8aa0a7` | 15.7:1, 11.3:1 and 6.7:1 on the page |
| action (brass) | `#d8b25c` on `#14110a` ink | the one primary action per view, rank control, Reviewed marker |
| Observed / Calculated | `#74e0c1` / `#9fb3ff` | evidence tiles tinted at 10% with 34% borders |
| warning / negative | `#f0c27a` / `#ff8a9a` | retained-data status; hard failures and negative deltas |

Type: Newsreader (serif, weight 500) for page titles, hero and partner names and build titles; IBM Plex Mono for figures, table headers, eyebrows and status labels; IBM Plex Sans for body. Loaded from Google Fonts with Georgia, Consolas and Segoe UI fallbacks, so the offline local app renders with system faces (its content-security policy does not admit the font host; that policy was not changed). Surfaces use 14px / 10px radii, chips are pills, and metric tiles are tinted by evidence class via `:has()`. Every text/background pair was re-measured (all ≥4.5:1) and the design suite now reads panel and page colours live instead of assuming navy.

## Revision 2 (8 September 2026): narrow-screen pass and light theme

**Authorisation.** After revision 1 was delivered, the user asked for these two additions in the Claude session on 8 September 2026 and authorised applying them: "do these first and then perform the changes, i give you permission, and you can tell chatgpt that." Revision 2 supersedes revision 1. Same baseline, same runtime version 2.21.0, presentation only; no observed figure, patch label, source date, route, element ID, data hook or saved-state key changed.

**Files changed since revision 1.** `ui.html` (every remaining literal colour became a token; a light-theme token block; a `≤700px` block appended after the existing narrow rules; a `#theme-toggle` button after the navigation; two small inline scripts — one in `<head>` that applies a stored light preference before first paint, one that binds the toggle). `static_client.js` (one line: the export snapshot now locates the bundle script by its `const INITIAL_BUNDLE=` prefix instead of assuming it is the document's first script; without this the Export button reported "Export template changed" once the theme scripts existed). `tests/browser_design.cjs` (two new blocks, 33 phone checks and 35 light-theme checks). `tools/capture_states.cjs` (optional `THEME=light`). New: `tools/phone_walk.cjs` (viewport-sized phone shots at chosen scroll offsets). Reproduce from the pristine baseline with `design-review/apply_ui_patch.py`, then `apply_tide.py`, then `apply_phone_light.py`, then `extend_design_suite.py`.

### Narrow screens (≤700px)

What the phone captures showed after revision 1: about 420px of shell before any page content (brand, Menu, two label rows, four buttons, a boxed status button, a three-line retained-data notice, the failure accordion); every route hidden behind a Menu tap; the hero page's reviewed-tier tile right-aligned and wrapping over four lines; "6.2 points" breaking across two lines in composition tiles; source-table headers splitting mid-word ("STAT US", "SECO NDS"); section headings colliding with their action buttons.

Changes, all in the appended `≤700px` block:
- Navigation is a horizontally scrolling row of pill buttons under the brand; the five planning routes (Meta, Builds, Compositions, Draft, Live game) fit the first screen and the four reference routes are one swipe away. The Menu button is retired at this width but remains in the DOM with its handler, so nothing that referenced `#menu-toggle` breaks. The current route is the filled pill with brass text.
- Rank and hero finder share one row; their visible "Rank" / "Hero" label text is hidden (the controls already carry `aria-label`s, which screen readers use instead). Action buttons form one compact 40px row.
- The status stack is tighter: 40px status button, 13px retained-data line with a top-aligned dot, compact notice summary and rank note. Nothing was removed; the named source failure stays visible and the design test asserts it.
- Hero header: the two evidence tiles sit side by side as a two-column grid, left-aligned, stretched to equal height; name at 32px.
- Tables: 8px row padding and 28×34 portraits on Meta; `table-small` headers are `nowrap` at 10.5px and the source table scrolls inside its panel instead of splitting words.
- Headline figures are `nowrap` at 20px (19px in composition cards) so they never break across lines; section titles wrap while their button stays on one line; planner slots, library rows and the toast are tightened.

Measured at 390×844 (Gold+ fixtures, y in CSS px, Edge):

| State | Revision 1 | Revision 2 |
|---|---|---|
| Main content starts (Meta) | 420 | 383 |
| Meta first data row | 815 | 755 |
| Hero tabs (Steel) | 818 | 765 |
| First partner card | 963 | 909 |
| Live game title | 520 | 471 |
| Routes reachable without a tap | 0 of 9 | 5 of 9 (the rest by scrolling the row) |

The chrome saving is smaller than the visual tidy-up suggests because the always-visible navigation row costs 48px; that trade was made deliberately, since a tap-to-open menu was the larger usability cost on a phone.

### Light theme (opt-in)

Every colour in the stylesheet is now a token (the only literals left are the light-theme values and the four fixed tier-badge fills, which keep their own dark ink in both themes). `:root[data-theme=light]` redefines the palette:

| Token | Dark (default) | Light | Contrast in light |
|---|---|---|---|
| page / rail / panel | `#0c151a` / `#091014` / `#132128` | `#edf1f0` / `#e3e9e8` / `#ffffff` | — |
| text / secondary / muted | `#e6eef0` / `#bfcdd2` / `#8aa0a7` | `#14232a` / `#33464e` / `#5a6f77` | 15.4:1, 9.6:1, 5.3:1 on white |
| brass fill / brass text | `#d8b25c` / `#e6c777` | `#cfa84f` / `#7a5a10` | 8.3:1 ink on fill; 6.4:1 text on white |
| Observed / Calculated | `#74e0c1` / `#9fb3ff` | `#17735a` / `#3550b8` | 5.8:1 and 6.9:1 on white |
| warning / negative | `#f0c27a` / `#ff8a9a` | `#8a5a0a` / `#b0273a` | 5.9:1 and 6.6:1 on white |
| control border | `#6f95a0` | `#6b8891` | 3.8:1 on white, 3.3:1 on the page |
| rank-control border | `#b8975a` | `#9a7a2c` | 3.65:1 on its fill, 3.5:1 on the page |
| evidence tints | 10% / 34% of the dark accents | 7–12% / 35–42% of the light accents | tile text re-measured ≥4.5:1 |
| icon plate | panel raised | `#2b3f48` | white line-art augment and blessing icons stay visible |

The theme is an explicit choice: a "Light theme" / "Dark theme" button sits at the bottom of the rail on desktop and beside the brand on phones. The choice is stored under `predecessor-theme` (separate from the `predecessor-planner-v2` plan) and applied before first paint on later visits. The operating-system preference is deliberately not followed automatically, so the public site keeps its dark default for every visitor and every existing test and capture stays valid; enabling that later is one `prefers-color-scheme` media query around the same token block. `color-scheme` switches with the theme so native selects, checkboxes and scrollbars match. Exports carry the toggle and work in both themes.

### Tests (revision 2, all passing)

- `tests/browser_design.cjs` (Edge): the original 71 checks at 1920×1080, 2560×1440 and 1536×864@1.25, plus 33 phone checks at 390×844 (chrome ≤430px, five routes visible without a tap, remaining routes scrollable, every visible shell control ≥36px, rank and finder on one row inside the viewport, accessible names present, source failure visible, no overflow and no sub-12px support text on all nine routes, evidence tiles side by side, hero tabs within one screen, single-line headline figures, section actions on one line, source headers unsplit, no JavaScript errors) and 35 light-theme checks (dark default, toggle state and persistence across reload, storage separate from the plan, light page luminance, muted/link/brass/control/select/refresh contrast floors, Observed/Calculated/Reviewed chip contrast on their surfaces, one primary action and no overflow on all nine routes in light, enemy-slot label contrast, return to dark).
- `tests/browser_static.cjs`: 51 checks at 1440×900 and 390×844 plus the seven legacy suites, Edge and WebKit. `tests/browser_ranks.cjs`: 60 role tables, Edge and WebKit. Python: 43.
- Captures: `design-review/after2/` (dark, three viewports), `design-review/after2-light/` (1920 and 390), `design-review/phone-walk-before|after|light/` (26 phone screens each, screen by screen). The gallery has revision 1 → revision 2 and dark → light sections.

### Limitations added by revision 2

- On a very slow parse of the inline bundle a light-theme user could see a brief dark flash; the `<head>` script runs before the stylesheet paints in every measured case.
- Hiding the "Rank" / "Hero" label text on phones relies on the controls' `aria-label`s; both are asserted by the design suite.
- The local Windows app and shared-server modes use the same `ui.html`, so they receive the toggle, but only the static and export modes have browser suites; the toggle script is mode-independent and touches nothing else.
- Native OS light/dark preference is not followed automatically (deliberate, see above).

## Installable shared app (14 September 2026)

The public GitHub Pages site now includes a Web App Manifest, 192px and 512px maskable icons, a native **Install app** control, and a network-first service worker. Installation creates an operating-system app icon and standalone window while keeping the existing public URL as the sharing method. The website remains useful in a normal tab on browsers that do not support installation.

Publication status and bundle requests remain network-first. A successful response is cached using its original content and dates; one latest bundle per bracket is retained on each device. When offline, the installed app can reopen data that device previously loaded. It cannot claim a new collection or update while disconnected.

No executable, app store account, code-signing certificate, paid hosting, database, or new cloud service was added. The Windows batch launcher remains available for the private local app. Browser security requires each recipient to accept the native installation prompt themselves.


## Codex integration review (8 September 2026)

The supplied Revision 2 ZIP was hash-verified against its manifest before extraction. The four protected runtime/data files, publishing workflow, ingestion, and updater match the existing baseline. One presentation correction was added: after a failed official patch check, the website labels the retained version **Last verified patch**. The original source ZIP remains intact.

Additional browser checks cover local mode, static mode, saved-file exports, light/dark keyboard toggling, draft restoration, source-failure visibility, and withholding unverified reviewed plans. See RELEASE-VERIFICATION.md for test conditions and release limitations. The package script now includes these receipts and uses a distinct Verified Source archive name.
# Revision 3 — 2.23.0 mobile Meta and refresh reliability

- Replaced the phone opponent wizard with a Meta-first dashboard: role chips, search, favorites, recent heroes, five leading picks, and valid same-rank movement.
- Made Build the first hero tab and focused phone Builds, Compositions, Draft, and Live around the first decision.
- Added layered hero/item image fallbacks and local-only favorites.
- Added manifest schema 2 health for core statistics, mechanics, patch verification, guidance, optional Pred.gg, run receipt, and next expected attempt.
- Added two bounded three-hour retries for transient required-source failures. Blocks wait for the next daily run; optional Pred.gg never drives retry or core freshness.
- Moved the workflow keepalive commit from `main` to `automation-state` to prevent release races.
- Added strategy-review due status and a downloadable 93-plan review packet. Statistics refresh remains separate from authored strategy review.
- Verified 95 Python tests, 78 JavaScript tests, mobile browser checks, axe in both themes, and desktop release acceptance.

# Revision 4 — 2.24.0 audit reliability release

- Added reproducible checks for every confirmed audit defect, recorded as expected failures until fixed, and a `verify` workflow for pull requests and release branches.
- Composition alternatives carry an input fingerprint; stale alternatives are cleared with an explanation, and Apply/Substitute re-validate bans and enemy picks. A wedged saved draft repairs itself once and keeps every usable selection.
- One engine definition of evidence age (Current 30 h, Aging 48 h, Stale after) drives every label. Failed checks and ageing statistics redraw the page without disturbing a focused field. Saved statistics are labelled as saved, never as a current ranking; inactive editorial tiers are described as paused.
- Complete collections, partial updates, imports, stored bundles and cache restores share one row validator. A rejected collection never replaces the last good publication.
- Publication and packaging now require the JavaScript suite as well as the Python suite.
- `sw.js` and its cache name were deliberately left unchanged so saved offline brackets survive this release.
- An independent two-stage review of every phase confirmed 15 findings in this release's code; all are fixed with tests that fail on the unfixed code (Pred.gg-only publication rows, the Windows app's saved successes, damaged stored files, two planner paths that could lock a banned hero, unexplained clearing, a lost redraw on iPhone Safari, ineligible or saved statistics described as current, and three test-harness weaknesses).
- A second review of those fixes confirmed 16 more findings (one medium: the Windows app could restore a saved Pred.gg-only update with damaged rows); all are fixed with failing-first tests. Evidence redraws now follow one rule in every mode (never while typing or mid-click, never lost), including the Windows app.
- A third review confirmed 10 more findings in this release's code (two medium, both in on-screen redraws while the user types or goes offline); every automatic redraw now goes through one scheduler that keeps focus and the cursor and never waits indefinitely.
- Verified 143 Python tests (1 recorded expected failure, defect D; 1 skipped without a local store), 101 JavaScript tests (2 assert that defect F still reproduces), 32 of 32 audit browser verdicts, release acceptance, axe in both themes, and six-bracket companion checks on a build staged without network access. 57 real bundles keep their verdicts.
- Open and scheduled for 2.25.0: defects D, E, F and G. Not verified: physical phones, screen readers, native installs.

# Revision 5 — 2.25.0 audit completion release

- A fresh collection now publishes when at most 10% of Statz hero pages fail. Failed roles stay failed, carry no numbers and are named in the manifest, the evidence state, the desktop source note and the phone status line. A page from another patch is still an absolute reject.
- The offline cache is split into a release shell and a permanent data cache. Only the page stores data, and only after checksum and structure checks. Brackets saved by 2.23/2.24 are moved once, verified by their own checksum, and the saved manifest always describes what is actually saved.
- Composition search runs in a Web Worker built from the engine source already in the page, with a main-thread fallback where blob workers are forbidden. Output parity is enforced. Measured main-thread stall for five heroes: 31 to 40 ms across runs (was 1,398 ms).
- The strategy review packet is built by one pure engine function (schema 2) and now carries the official and hotfix changes, the plans they touch, definition conflicts and checksums of all published brackets. The cloud publishes a deduplicated review queue under review/. Preparing a packet changes no review status, date or recommendation.
- Each bundle records its actual collector; the manifest reports it per bracket. A Windows feed can never move published source dates backwards or claim cloud collection. The Windows updater installer is manual-only.
- Every audit defect A to I now has an enforcing test; the ledger of open defects is empty.
- An independent two-stage review of every phase confirmed 20 findings in this release's code (and 3 more whose challenge could not complete); all are fixed with tests that fail on the unfixed code: overlapping update checks during a slow save, offline copies after a website rollback, two tabs saving at once, late worker results, worker tests without bans or enemies, silently accepted page gaps, unreconciled page counts, review-packet flagging and identity, the weekly packet timing, a status revision written as a checksum, Pred.gg dates through uploads, refused uploads moving the cloud schedule, retained-source provenance, and three tests that could not fail. The Windows app now allows the page's own search worker (`worker-src blob:`), with the owner's approval.
- A third review confirmed 5 more findings (a finished search redrawing mid-typing, a saved copy borrowing the newest statistics date, a failed offline save not retried, a failed published source blocking recovery, retained provenance copied from the wrong record); all fixed with tests that fail on the previous code.
- Verified 178 Python tests (1 skipped without a local store), 149 JavaScript tests, 39 of 39 audit browser verdicts, 7 of 7 real-browser offline checks including an upgrade from the actual 2.23.0 worker, the release, accessibility and six-bracket suites, and the two legacy suites whose outdated expectations were updated.

# Revision 6 — 2.26.0 phone navigation release

- Audit item 09, built from the approved phone prototype. Meta lists every hero of a role behind one button (no number for a hero without a sample); the status line names fetch time, Statz dataset and game patch separately and its badge fits on one line; material source limitations are one compact line on every phone route with details one tap away; Live shows a one-line evidence summary; the Live hero can be replaced in place with a preview that names any displaced ally, and Undo; "Use in Live" on a hero page uses the same preview; Draft shows allies and enemies as separate lineups with counts; redraws keep opened sections open; a running composition search can be cancelled.
- Nine browser checks (M1-M9) reproduced each finding on 2.25.0 before the change and enforce it after.
- An independent review confirmed five defects in the change (sections leaking open across screens and heroes, focus after the Sources link, the Compositions count, Cancel without a background search, and a check that could not fail); all are fixed with checks that fail on the unfixed code (M10-M13, stronger M4).
- Verified 178 Python tests (1 skipped without a local store), 149 JavaScript tests, 52 of 52 audit browser verdicts, axe WCAG 2.1 A/AA on 30 phone states in both themes, 7 of 7 real-browser offline checks, and the release, companion, ranks and static suites; no horizontal overflow at 320 px with large text; clean-room package 178 Python / 146 JavaScript.
- Not verified: a physical phone, screen readers, native installs. Real-device acceptance by the owner is the remaining checkpoint for item 09.

# Revision 7 — 2.26.1 fixes from the live check of 2.26.0

- After 2.26.0 was published, independent agents checked the live site in real browsers (data, the four phone tasks at 390 px and at 320 px with large text in both themes, offline with the real service worker, desktop). Nothing high or medium was found; this release fixes the confirmed low-severity items: limitations counted per source, cancel notes that say what happened and expire, the Live picker marking small samples, a wrong device clock named, every missing number given its real reason, the hero page naming its source, readable review dates, narrow-phone layout, light-theme contrast of pressed build variants, keyboard focus kept on the same control, the phone status chip agreeing with the page, and truthful offline messages about saved ranks.
- Four independent review rounds of the patch (each finding challenged by a second agent) confirmed one high finding, withdrawn (an earlier draft could overstate the official description review after a hotfix), three medium findings (false reasons for missing numbers) and several low ones; all are fixed with checks that fail on the unfixed code (P1-P15).
- Verified 178 Python tests (1 skipped without a local store), 149 JavaScript tests, 67 of 67 audit browser verdicts, axe WCAG 2.1 A/AA on 30 phone states, 7 of 7 real-browser offline checks, and the release, companion, ranks and static suites; clean-room package 178 Python / 146 JavaScript.
- Not verified: a physical phone, screen readers, native installs.

# Revision 12 — 2.28.2 evidence announcements

- Evidence that fails, or arrives after a wait of at least a second, is announced once per view and wait from a polite live region that is always present: one on the page and one inside the detail dialog, which the modal state would otherwise hide. The placeholders themselves are no longer live regions, so the Builds page no longer carries 24 of them, and the dialog now takes its accessible name from its title.
- A wait ends by the evidence files' own state, not by placeholders leaving the screen, so a search or the phone layout cannot pass for "loaded"; a failure behind an open dialog is announced when the dialog closes.
- Probes I14 and I16 reproduce the defects on 2.28.1 and pass here; I15 guards the dialog focus that 2.28.0 fixed. A screen-reader announcement is modelled by the probes (text changes inside regions that already existed), not heard: no real screen reader was used.
- Verified: 196 Python tests (1 skipped), 163 JavaScript tests, 96 of 96 audit browser verdicts, axe on 30 phone states and on the failed-evidence dialog, 10 of 10 offline checks, static (57 + 50) and ranks in Edge and WebKit, companion and release suites. `engine.js` unchanged.

# Revision 11 — 2.28.1 phone role strip

- The Meta page's role strip and the Live hero picker (.role-choices.compact) wrap at 700 px and below instead of scrolling sideways, so every role is on screen at 320–412 px with default and large text. Revision 10 changed only .tabs, so these two strips were missed; the live verification of 2.28.0 found them.
- Probe V11 now also visits the phone Meta page and the Live picker. It reproduces the defect on 2.28.0 and passes here.
- The revision 10 claim that "Phone tab strips wrap without scrollbars" covered only the .tabs strips; RELEASE-2.28.0.md, README and this report are corrected.
- Verified: 196 Python tests (1 skipped), 163 JavaScript tests, 93 of 93 audit browser verdicts, axe on 30 phone states, 10 of 10 offline checks, static (57 + 50) and ranks in Edge and WebKit, companion and release suites.

# Revision 10 — 2.28.0 fixes from the review of 2.27.0

- Labels describe their own hero, role and section: a role without a Statz sample says "No Statz build sample for Jungle" and never links another role's page as its own; the coach, the phone chip and every evidence section carry their own freshness ("Saved <day>" for retained or over-48-hour evidence).
- The website confirms the official description review only after a verified, current check whose content signature matches the loaded publication; otherwise the status names the reason (pending, failed, content changed). Open dialogs follow status changes and keep their sections, scroll and focus.
- Counters: reviewed counterplay, then matchups of 100 or more games per source and variant, then one closed Exploratory disclosure with every thinner row and differing alternate table; identical alternate tables are named once. No row is removed, pooled or re-rated.
- Desktop: patch strip, one status line with Status details, and always-visible material notices; Meta header compacted (first row 649 → 385 px at 1440×900 with Pred.gg retained). Rank sites keep one strip row ("Guidance · Gold+ only") and state the reference scope on every page. The phone hero, Builds and Compositions tab strips wrap without scrollbars; the review status has its own row. (Revision 11 corrects this: the Meta and Live picker role strips still scrolled and were fixed in 2.28.1.)
- Verified: 196 Python tests (1 skipped without a local store), 163 JavaScript tests, 93 of 93 audit browser verdicts (V1–V13 new; each defect probe reproduced on the code before its fix, and 23 reapplied regressions each fail a probe), axe WCAG 2.1 A/AA on 30 phone states, 10 of 10 offline checks, an upgrade from and rollback to a staged 2.27.0 build with real service workers, the static suite (57 + 50 checks) and ranks suite in Edge and WebKit, and the release and companion suites. `engine.js` unchanged.
- Not verified: an iPhone or iPad, screen readers, native installs; `browser_revision2_modes.cjs` was not run (three prepared previews). `browser_design.cjs` is stale since the 2.21 fixture and not a gate.

# Revision 9 — 2.27.0 faster first load (audit item 11)

- The publisher writes, beside each unchanged full bundle, a compact core, a shared evidence file and one evidence file per hero, each named by its SHA-256 and listed in the manifest, and refuses unless they reproduce the bundle byte for byte. If they cannot be built, the rank is published with its full bundle only.
- The page loads the core first and fetches evidence when a view needs it, verifies it and merges it in place; views say it is loading or name why it failed, and views that mix core data and evidence show the core data at once. Engine results never change when evidence arrives (every engine method, hero and role compared in four Pred.gg states).
- Offline, the page saves the core and each evidence file it opened; export assembles the complete publication and says in the snapshot when evidence is missing. A rank comparison now survives a redraw of the Data page.
- Verified: 195 Python tests (1 skipped without a local store), 163 JavaScript tests (engine parity for every method, hero and role in four Pred.gg states), 80 of 80 audit browser verdicts (I1–I13 new, each shown to fail before its fix), axe WCAG 2.1 A/AA on 30 phone states, 10 of 10 real-browser offline checks, an upgrade from and a rollback to a staged 2.26.2 build with real service workers, the static suite (56 + 49 checks) and ranks suite in Edge and WebKit, the release and companion suites, and a clean-room package (195 Python run, 17 skipped without the seed; 152 JavaScript pass, 11 skipped). Phone profile: ready in 8.0 s instead of 16.4 s.
- Not verified: an iPhone or iPad (WebKit runs use Playwright's WebKit on Windows), screen readers, native installs. With Pred.gg current the core is above the 5 MB target (5.1–6.8 MB).

# Revision 8 — 2.26.2 WebKit maintenance release

- WebKit (Safari) limits how often a page may update its address and then throws; opening many heroes, tabs or sections quickly raised an uncaught error on a hero tab and showed the raw message as an error notice elsewhere. The address update now skips only that one change, catching only that browser error, and leaves the last applied address alone so the next redraw cannot jump back.
- The static browser suite now passes in WebKit: its offline check stops a real server instead of using a network setting that Playwright's WebKit applies before the service worker, and requires a newly opened page. A new check simulates the address limit in every browser and fails in Edge too without the fix.
- Verified 178 Python tests (1 skipped without a local store), 149 JavaScript tests, 67 of 67 audit browser verdicts, axe WCAG 2.1 A/AA on 30 phone states, 7 of 7 real-browser offline checks on the six-bracket preview (including an upgrade from the real 2.23.0 worker), the static suite (55 + 48 checks) and ranks suite in Edge and WebKit, and the release and companion suites; clean-room package 178 Python / 146 JavaScript.
- Not verified: an iPhone or iPad (the WebKit runs use Playwright's WebKit on Windows), screen readers, native installs.
