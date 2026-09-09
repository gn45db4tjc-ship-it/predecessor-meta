# Change report — design revisions 1 and 2 on 2.21.0 + hosting revision 3

Baseline: commit `ad044213d04163ca19ebb4b4f1df59b93b8d2942` (application runtime 2.21.0, website adapter hosting revision 3, rank-display fix). This revision changes presentation only. `engine.js`, `predecessor_meta.py`, `reviewed_guidance.json`, `shared_server.py`, `static_publish.py` and the updater are byte-identical to the baseline. Route identifiers, element IDs, data hooks, the saved-state key and every existing test assertion are unchanged. The runtime version string stays 2.21.0 because the public fixtures carry that version and the correction suite compares the two.

## Diagnosis (from six independent critics and a synthesis, all in `design-review/critique/`)

1. Every page paid the same 270–1018px "chrome tax" before its first useful row: three-cell patch strip, red banner, assembly sentence, failure accordion, a repeated "Selected statistics" box, an eyebrow, a 32px title and a paragraph. On the Meta landing page the first hero row sat at y=970 on a 1080px screen.
2. Cards showed four to six numbers at the same size, so the figure that answers "why" never led.
3. Text contrast passed everywhere, but every control and chip border failed the 3:1 non-text floor, and gold and red each carried about six jobs.
4. One pill style was used for real buttons, inert tag chips, coverage chips and disclosure rows, so a non-programmer could not tell what was clickable; hero names had no link styling.
5. Hero search existed on two pages of nine; the shared-picks relationship between Compositions, Draft and Live game was never stated.

## What changed

**Shell.** A 56px top bar holds the rank selector, a global hero finder (type a name, the hero's Partners open, picks intact), and the plan/export actions. The status stack is one 40px strip of patch/statistics/guidance cells, one status line (amber for retained data, red only for a hard failure), a one-line freshness note and the collapsed source-notice disclosure. Chrome above the content is at most 240px at 1920 (was about 330). The rail is grouped Plan / Draft & live / Reference with the 01–09 prefixes removed; the connection mode moved to the rail footer. Every route, ID and data hook is unchanged.

**Design system.** One organised stylesheet with tokens: seven type steps (12 caption, 13 support, 14 secondary, 16 body, 18/20 headings, 28 page title, 24–26 headline figures); a 4/8/12/16/24/32 spacing scale; input, select and button borders `#6b7fa3` (≥3:1 against fill and page); chips flat with a glyph per evidence class (● Observed, ◇ Calculated, ✦ Reviewed, ! warning) so the distinction survives greyscale; disclosures with a blue chevron and hover state; hero names underlined; item names underlined; gold limited to the primary action per view and the Reviewed marker; eyebrows demoted to muted text. Content width 1720px, 2000px on 2200px+ screens; prose capped at 76ch.

**Meta.** Role tabs and list filter directly under a short header; the table starts at y≈482 at 1920 (was 970). The reviewed working pool, tier method and the statistics-source switch sit in a right-hand column at 1560px+ (below the table on narrower screens). The reviewed tier is a compact button with an underlined label; each row keeps a "Partners & builds" link. The same table helper serves the non-Gold rank view, which keeps its own observed win-rate ordering, its `Rank meta` title and the separate authored reference.

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
- The freshness sentence is appended as plain text by `static_client.js`, so it stays one long line rather than label/value chips.
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


## Codex integration review (8 September 2026)

The supplied Revision 2 ZIP was hash-verified against its manifest before extraction. The four protected runtime/data files, publishing workflow, ingestion, and updater match the existing baseline. One presentation correction was added: after a failed official patch check, the website labels the retained version **Last verified patch**. The original source ZIP remains intact.

Additional browser checks cover local mode, static mode, saved-file exports, light/dark keyboard toggling, draft restoration, source-failure visibility, and withholding unverified reviewed plans. See RELEASE-VERIFICATION.md for test conditions and release limitations. The package script now includes these receipts and uses a distinct Verified Source archive name.
