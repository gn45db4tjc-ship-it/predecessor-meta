# 2.53.0 — QoL pass 3

On 6 October 2026 the owner asked for the items that 2.52.0 had left for later ("Do the optional"). Four read-only scoping passes on 2.52.2 measured each one first. Every fix has a probe that reproduced the issue on 2.52.2 and passes now: QF4, QP12–QP16, QT8, QS8–QS11 and LF1. No evidence, figure, grade, build or rule changes.

## What changes for you

### Speed

Measured on the committed seed, staged the way the site publishes it, desktop at 1440 px with the CPU slowed four times, two runs each (2.52.2 → 2.53.0):

| What you do | 2.52.2 | 2.53.0 |
|---|---|---|
| Open a hero on the desktop (Gideon, Countess, Steel) | 442–579 ms | 52–136 ms |
| Redraw an open hero page | 253–314 ms | 32–60 ms |
| Elements on a desktop hero page | 7,135–9,366 | 410–702 |
| The phone's first-screen file (gzipped) | 343 KB | 262 KB |

- **Closed desktop folds draw on demand.** Partners, Counters, Kit, the team alternatives and the build sources draw their contents when you first open them. Before, every closed fold drew its tables on each hero open and each redraw.
  - Anything that opens a fold draws it first: a click, a section jump, a shared link, a fold you left open, and an evidence search.
  - Source lines, the two evidence search boxes and the counterplay notes stay visible without opening anything.
  - **Trade-off:** the browser's own Find (Ctrl+F) can't see inside a fold you haven't opened yet. The evidence search boxes can, and they open the fold they match in.
- **A smaller first screen.** The phone's first file leaves out fields only later screens read: Pred.gg rows and records, item, perk and ability display fields, reviewed definitions, community builds, hotfix changes and guidance notes. Those arrive with the guide, which every other screen already waits for. A field a reviewed build's checks compare always stays. The first screen is drawn identically from both versions (104 of 104 snapshots, phone and desktop, four data states).
- **Evidence files no longer reset the engine.** A hero's evidence file, the history, the catalogue and the source audit hold display-only fields, so the engine keeps its saved answers when they arrive (team alternates cost 35–71 ms each on a slowed phone). Only the guide rebuilds it.

### Phone

- **Meta leads with what moved.** A compact line above the hero list names the selected role's largest Pred.gg win-rate rise and fall since the previous pull, for example "Last pull: Shinbi +0.41 pp · Riktor −0.41 pp".
  - Its second line shows the source, patch, rank and both pull times. Tapping it opens Changes on Pred.gg for that role.
  - It uses the same rows and rule as the Changes table: only heroes with 100+ games in both pulls count. When nothing moved, it says so.
  - When Pred.gg history is unavailable, Statz stands in and is labelled as Statz.
  - The old "What changed" section below the list is gone. It read Statz with no source or date.
  - **Trade-off:** the line is about 45 px tall, so the first hero row starts about 53 px lower (316 px on the committed seed at 390 px wide). The 2.37.0 budget of 280 px (probe PD1) now allows this one line, up to 56 px, and nothing else.
- **Large text keeps the role picker on two rows.** Before, it took three.
- **The Sources table fits the phone.** It no longer scrolls sideways.

### Desktop

- **The theme switch says what it does.** It reads "Switch to light theme" or "Switch to dark theme" and no longer announces itself as a pressed toggle.
- **The review packet waits for its data.** "Download strategy review packet" now waits for the guide (official changes and maintenance reviews) before it builds the packet. If the guide can't load, it says so. Before, an early click saved an incomplete packet.
- **Match columns line up.** Both columns start level and space their panels the same way.

### Spacing

- **One inner padding for panels:** 16 px on the desktop and 12 px on the phone (`--panel-inset`). Before, panels used several values, and some folds were padded twice.
- **Sources table.** Figures are right-aligned under their header, rows share a baseline, and the Scope disclosure sits quietly in its cell.

### Symbols and wording

- **No more fallback glyphs.** The shipped fonts lack ● ◇ ✦ ▢ ⟳ → ★ ☆ ✓ ⓘ ⚠ ↻. These used to fall back to several system fonts at different sizes, and screen readers read the evidence markers aloud.
  - The evidence markers are now drawn shapes: a filled dot (observed), an outlined diamond (calculated), a four-point star (reviewed), an outlined square (official) and an open ring (saved). Each class stays distinct in both themes.
  - Arrows between steps are drawn, and screen readers hear "to".
  - The favourite star is a drawn star, filled when the hero is a favourite.
  - The skill chart's tick and the phone's info, warning and refresh icons are drawn too.
  - Back links use ‹, which the fonts carry.
- **Every link names where it goes.** The 241 "↗" links on Changes now read "Source", and "Official notes ↗" reads "Official notes".
- **Plainer source labels:**
  - "Exact patch" → "This patch only"
  - "kit interaction points" → "Kit fit: N points from M kit interactions"
  - "gap vs stronger baseline" → "above the better solo win rate"
  - "Observed provenance" → "Observed · source dates"
  - "exact match window unconfirmed" → "Statz doesn't state the match dates"
  - Correction statuses read "Source matches official", "Corrected to official value" and "Reviewed fix applied". The stored values are unchanged.

## Not in this release

- **Font subsetting.** It isn't needed now that the missing glyphs are drawn.

## Files

- `ui.js`, `mobile.js`, `companion_simple.js`, `static_client.js`:
  - lazy desktop folds (`fillHeroFold`, `openedHeroFold`);
  - the drawn-symbol helpers (`TO`, `prose`, `star`);
  - display-time wording (`PLAIN`);
  - the phone movement line (`movementHTML`);
  - the packet's wait for the guide;
  - the engine rebuilt only for the guide;
  - the theme switch.
- `engine.js`: `roleMovement`.
- `predecessor_meta.py`: `scoped_movement` and `with_scoped_movement`; `VERSION` 2.53.0.
- `static_publish.py`: adds the movement digest to bundles collected before 2.53.0.
- `projection.py`: the trimmed core, and the Pred.gg history split by key. The projection version is unchanged, and every part still merges back to the exact bundle.
- `ui.html`: drawn evidence markers, the step arrow, the star, and `--panel-inset`.
- `broadcast.css`: the "QoL pass 3" section (insets, Sources table, Match columns, back chevron, skill tick).
- `companion_simple.css`: phone icons, the More chevron and the movement line.
- `sw.js`: cache `predecessor-meta-shell-v2-53-0`.
- `docs/DESIGN-SYSTEM.md`: `--panel-inset`, the drawn markers, the symbols rule and the theme switch.
- `docs/AI-CONTEXT.md`: notes for the above.
- Tests:
  - New probes in `tests/browser_audit_regressions.cjs`, with ledger entries in `tests/known-defects.json`: QF4, QP12–QP16, QT8, QS8–QS11 and LF1.
  - W3 and W6 compare the drawn marker shapes.
  - V1, V3, S4 and S5 draw or open folds before reading them.
  - `tests/browser_design.cjs` checks the theme switch's new wording.
  - `tests/test_static_scoped_movement.py` is new.
  - `tests/test_static_projection.py` and `tests/projection.test.cjs` cover the trimmed core, the movement line, the library, loadout definitions, the re-check queue, team alternates and calculated tiers.
- No new program files for the Windows install.

## Verification

See the report to the owner for the suite results of this commit.
