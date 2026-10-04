# 2.52.0 — QoL pass 2

On 4 October 2026 the owner asked for "yet another QoL check for fonts, spacing, UI/UX in general, speed, etc". Four audits of live 2.51.0 (type, spacing, interaction and speed) found the issues below. Each fix has a probe that reproduced the issue on 2.51.0 and passes now (QP1–QP11, QS1–QS7, QT1–QT7, QF1–QF2). No evidence, figure, label or rule changes.

## What changes for you

### Getting around

- **Focus stays where you were.**
  - Changing the desktop hero's Role, "Show wins & uncertainty" or the Items "Show" select keeps focus on that control. It no longer jumps to the top of the page.
  - The phone favourite star keeps focus too.
- **Partners from the Statz table takes you into Partners.** On the desktop, focus moves to the Partners heading, so the next Tab continues there instead of going back to Build. The hero jump row keeps focus on the button you pressed, as the 2.29 design requires (S2).
- **Changes opens on the history that exists.** It now starts on Pred.gg history when that rank has it, and falls back to Statz only when it doesn't. Before, it checked a field that never exists, so it opened on Statz.
- **Try again.** A hero evidence file that failed to load has a "Try again" button in place, so you don't need to reload the page.
- **First load says what it is doing.** A slow first load shows "Loading hero data…" instead of an empty page, and the Windows-only Quit button stays hidden on the website.
- **Searches no longer dead-end.**
  - A desktop Meta search for a hero outside the current role lists the heroes that match in other roles.
  - Every empty search result (desktop and phone) has a Clear search button.
- **One name per page.**
  - The navigation label and the page title now agree: "Changes", "Settings", "Reviewed guide", "Starting builds".
  - On the phone, Starting builds lights More (where it lives, and where its back link goes), not Meta.
  - Only the main navigation marks the current page; the section strips inside Reference and Sources mark their item as current within it.
- **Meta rows.**
  - The desktop Meta row button says "Open" (it opens the hero in the app; the ↗ arrow implied an external link).
  - Screen readers hear which hero each button opens.
- **Items & loadouts** drops the "Selected rank" note, because nothing on that page depends on the rank.
- **Quieter screen readers.**
  - The status line is rewritten only when its text changes.
  - Evidence counters no longer announce themselves on every hero open.
  - The update banner speaks once, when an update is found.

### Type

- **Large text grows all text on the phone.** Changes and Items stayed at their old size before.
- **Readable line length.** On wide screens, notes, lists and source text stop at about 75 characters a line (before, up to 100). Page intros stay at two lines, under 90 characters each (`--prose-intro`).
- **Figures line up.**
  - Win rates and other figures use Barlow's tabular digits, so decimal points line up down the Meta list. Before, they wandered by about 4 px.
  - Table headers, metric chips and figures move off the system monospace font onto the display face.
- **Real weights only.**
  - Every weight the page asks for has a shipped face.
  - The browser no longer fakes Barlow 500/650/900 or Saira 500/600.
- **Steadier first paint.**
  - The condensed heading face has a size-matched stand-in while it loads: Arial Bold, or Roboto Bold on Android.
  - The bold text face is preloaded with the regular one.
  - Headings barely move when the fonts arrive.
- **Phone page titles** in capitals lose their negative letter-spacing.

### Spacing

- **Large text on the phone hero.** The hero plate keeps one column, and the name keeps its normal size. Before, the name was squeezed into a 40 px column, broke letter by letter and shrank to 30 px, and "Use in Match" stood on end.
- **Paragraphs** use the spacing scale instead of the browser's 1em gap.
- **The phone back link** ("← More") has room under it.
- **The desktop Changes table** separates the hero name from its role.
- **Card section heads** on the phone sit clear of their content.
- **The phone toast** sits just above the bottom bar with the page's side margins. Before, it floated 71 px above the bar with 8 px sides.
- **Phone dialogs** use the page's side margins, and the title lines up with the text below it.
- **Phone loadout names** fit their tiles at 390 px; the row shows three tiles up to 430 px wide.

### Speed

- **Return visits draw sooner.** The offline worker hands the page over as soon as it arrives and saves its copy in the background. Before, a slow connection waited for the copy to be written first.
- **The desktop hero opens faster.** Number formatting and item-name lookups are prepared once instead of on every figure. MEASURE_DESK
- **Hero tabs switch faster.** The "by enemy team type" alternates are calculated once per hero, role and playstyle. Before, they were recalculated on every return to the Build tab (35–71 ms each on a slowed phone). MEASURE_TAB
- **No jump under the first screen.** The phone status line no longer takes space, so it no longer collapses and pulls the page up when the first check finishes (a layout shift of 0.03). MEASURE_CLS
- **Portraits before evidence on the phone.** Phone Meta lets the visible portraits finish before it downloads the guide (at most 1.5 s), so the first screen fills first. MEASURE_PORTRAITS

## Not in this release

These were found but left for a later release. Each needs its own review or carries more risk than a QoL pass should:

- **Trim the first-screen file.** It still carries about 88 KB of fields the first screen never reads.
- **Draw closed desktop folds only when opened**, and stop rebuilding the engine for display-only evidence.
- **Spacing and layout.**
  - One inner padding for every panel.
  - The density options.
  - The Sources table layout.
  - The desktop Match column offset.
- **Font subsetting** for the few glyphs the shipped fonts lack.
- **Wording.**
  - Shorter source jargon.
  - A phone Meta "What changed" line from Pred.gg (it needs a first-screen field).
- **The theme toggle's state.** Its pressed state still describes the theme, and an existing design suite asserts that.

## Files

- `ui.js`, `mobile.js`, `companion_simple.js`, `static_client.js`, `rank_view.js`: focus return, section focus, the Changes default, Try again, other-role search results, Clear search, page names, the Open button, quiet live regions, and the formatter, catalogue and alternates caches.
- `ui.html`: phone type tokens in rem, `--prose`, the display fallback stack, the startup note and the phone dialog width.
- `broadcast.css`: font weight ranges, the two fallback faces, and the "QoL pass 2" section at its end.
- `predecessor_meta.py`: the bold text face preload; `VERSION` 2.52.0.
- `sw.js`: the page is answered before its copy is saved; cache `predecessor-meta-shell-v2-52-0`.
- Tests:
  - probes QP1–QP11, QS1–QS7, QT1–QT7 and QF1–QF2 in `tests/browser_audit_regressions.cjs`, with their entries in `tests/known-defects.json`;
  - `tests/sw_shell.test.cjs` (new);
  - `tests/test_static_broadcast.py` expects three font preloads.
- No new program files for the Windows install.

## Verification

- **Probe first.** Every new probe reproduced on 2.51.0 and passes now; the ledger's open list is empty. QF1 and QF2 were checked against an export of the pre-speed commit: 3 recalculations before, 0 after; 29 px of status line in the flow before, none after.
- **Suites.** SUITE_RESULTS
- **Checked by eye** on the six live bundles: desktop at 1440 px and phone at 390 px, dark and light.
