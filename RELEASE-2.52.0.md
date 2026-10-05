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

Measured on the six live bundles of 4 October with the CPU slowed four times, two runs per version (2.51.0 → 2.52.0):

| What you do | 2.51.0 | 2.52.0 |
|---|---|---|
| Open a hero on the desktop (main-thread work) | 1,083–1,205 ms | 892–945 ms |
| Open a hero on the desktop (response) | 296–328 ms | 240–312 ms |
| Reopen a hero on the phone | 136–160 ms | 72–88 ms |
| Return to the phone Build tab | 104–208 ms | 56–72 ms |
| Pick your hero in Match (phone / desktop) | 96–104 / 104–152 ms | 64 / 56–64 ms |
| Open Sources on the phone (second visit) | 144 ms | 80–88 ms |
| Layout shift while the phone loads | 0.032 every load | 0 |

- **Return visits draw sooner.** The offline worker hands the page over as soon as it arrives and saves its copy in the background. Before, it waited for the copy to be written. A test proves the page arrives while a save is stuck (`tests/sw_shell.test.cjs`); it was not timed on a real slow link.
- **The desktop hero opens faster.** Number formatting and item-name lookups are prepared once instead of for every figure.
- **Hero tabs and Match respond faster.** The "by enemy team type" alternates are calculated once per hero, role and playstyle. Before, every return to the Build tab and every Match pick recalculated them (35–71 ms each on a slowed phone).
- **No jump under the first screen.** The phone status line no longer takes space, so it no longer collapses and pulls the page up when the first check finishes.
- **Portraits first on a slow link.** When the browser reports a slow link (2G or 3G, or Data Saver on), phone Meta lets the visible portraits finish before it downloads the guide (at most 1.5 s). On a fast link, or a browser that doesn't report its link (Safari, Firefox), the guide starts at once as before; any screen that needs it sooner asks for it itself.
- **One screen is slower, deliberately.** Changes now opens on the Pred.gg history (see above), a larger table than the Statz view it used to open on. It takes 40–60 ms longer to draw on a slowed phone (3,708 elements instead of 2,877).

### Windows app

- **Visor colours follow sooner.** When the Visor's look changes while the app is already reading it, the app reads it again as soon as that read ends. Before, the change waited up to 30 seconds for the next check. 2.52's faster drawing made the Visor suite hit this race in 3 of 8 runs; it passes 8 of 8 now (`tests/visor_look.test.cjs` covers it).

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
- `ui.html`: phone type tokens in rem, `--prose` and `--prose-intro`, the display fallback stack, the startup note and the phone dialog width.
- `docs/DESIGN-SYSTEM.md`: `--prose`, `--prose-intro`, the display fallbacks, the phone rem steps and the font weight ranges.
- `broadcast.css`: font weight ranges, the two fallback faces, and the "QoL pass 2" section at its end (including scrolling tables that contain their screen-reader labels).
- `predecessor_meta.py`: the bold text face preload; `VERSION` 2.52.0.
- `sw.js`: the page is answered before its copy is saved; cache `predecessor-meta-shell-v2-52-0`.
- `visor_look.js` (Windows app only): a re-read asked for during a read runs when it ends.
- Tests:
  - probes QP1–QP11, QS1–QS7, QT1–QT7 and QF1–QF3 in `tests/browser_audit_regressions.cjs`, with their entries in `tests/known-defects.json`;
  - older probes kept as written, with two corrected: QL10 now makes the real Pred.gg history field (`scoped_changes`) unavailable (it removed a field that never existed), and N1 expects More on the phone's Starting builds (its back link says "← More");
  - `tests/browser_static.cjs`: an exported page's `<main>` may hold the static startup note, never the visitor's draft;
  - `tests/sw_shell.test.cjs` (new) and a re-read case in `tests/visor_look.test.cjs`;
  - `tests/test_static_broadcast.py` expects three font preloads.
- No new program files for the Windows install.

## Verification

- **Probe first.** Every new probe reproduced on 2.51.0 and passes now; the ledger's open list is empty. QF1–QF3 were also run against exports of 2.51.0 and of the commit before each fix: 3 recalculations before, 0 after (QF1); 29 px of status line in the flow before, none after (QF2); on 2.51.0 the guide started 700 ms before a slow link's portraits finished, and the first portraits-first version made a fast link wait 700 ms, while 2.52.0 does neither (QF3).
- **Suites.**
  - Python static tests: 410 pass (1 skipped).
  - Node tests: 400 pass.
  - The 11 CI browser suites against the committed seed: all pass. The audit suite's 216 probes all match the ledger.
  - `browser_visor_look`, which runs this source's Windows server with a test data folder: 8 of 8 runs pass.
- **Timings.** Taken with the scripts from the speed audit. They were run on staged copies of 2.51.0 and 2.52.0 built from the same six live bundles.
- **Checked by eye** on the six live bundles: desktop at 1440 px and phone at 390 px, dark and light.
