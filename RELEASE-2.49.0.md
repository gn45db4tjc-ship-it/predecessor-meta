# 2.49.0 — Broadcast: a new look

The owner chose this on 3 October 2026: direction A ("Broadcast", an esports-overlay look), made more stylized. The concept board with the other two directions is in the private artifact "Predecessor Meta Refresh". This release is only a visual change. No evidence, figure, label or rule is different.

## What changes for you

- **Type.**
  - Headings, tabs, navigation, figures and tier letters use Saira Condensed in capitals.
  - Text uses Barlow.
  - Both fonts are free (OFL) and ship with the app and the website. Nothing is fetched from Google, and they work offline.
- **Colour.**
  - Cyan replaces the pale blue as the action colour.
  - The tier badges are brighter.
  - The dark ground is nearly black, with a faint diagonal hatch.
  - Gold stays the reviewed marker and the S tier.
- **Slanted plates.** These are now parallelograms or have a cut corner:
  - tier badges, the main action ("Use in Match") and the selected tab;
  - the selected navigation item;
  - Meta rows, build tiles and stat plates.
- **Hero plate.** The hero header is now a dark plate in both themes.
  - The portrait fills the right as art and fades out to the left.
  - The name is large and slanted, with a faint outline of it behind.
  - On the phone it works like a broadcast lower third: the name and role sit low, and Favorite and Share sit top right.
- **Meta list.**
  - Rows are numbered in the current order, with the first three filled.
  - Each row is tinted by its tier.
  - Under each win rate, a small gauge shows the distance from 50%. It is green above and red below, and full at six points. The figure itself is unchanged and stays the claim.
- **Build.**
  - Items sit three to a row on the phone, in tiles with bigger icons (52 px; 56 px on the desktop) and outlined numbers.
  - On the desktop, each loadout slot now stacks its label, item, evidence chip and source line. The source line no longer wraps around the chip.
- **Also restyled:**
  - Match: hero tiles with bigger portraits and no outlines.
  - More: rows as plates.
  - Panels: no outlines; their fill separates them.
- **Motion.** State changes ease over 150 ms. Build tiles lift and Meta rows nudge under the pointer or finger. All of this is off when the device asks for reduced motion.

## Kept

- Observed, calculated, reviewed and official evidence keep their own colours and markers in both themes.
- One focus ring (3 px, `--focus`), at 3:1 or better on every surface. Anything slanted drops its slant while focused, so the ring is never clipped.
- Every colour, space, radius and type size comes from a token: probes W1–W4, DS1–DS6 and `tests/test_static_design_system.py`.
- The light theme changes only tokens. The hero plate stays dark in it.
- The Visor colours in the Windows app still apply, through the same tokens. The defaults they derive from follow the new dark palette, and the AA checks over ten palettes pass.
- 44 px phone targets, wrapping tab strips, both themes, six ranks, exports and saved selections.

## Files

- `broadcast.css` (new): the look. It is the last stylesheet on every page (`__BROADCAST_CSS__` in `ui.html`).
- `assets/fonts/` (new):
  - `barlow-400/600/700.woff2` and `saira-condensed-700/800.woff2`, the latin subset, 101 KB in all;
  - their OFL licences.
- `ui.html`: the new token values and tokens.
- `ui.js`: `artVars()` (the plate art and name) and `wrVars()` (the gauge value).
- `mobile.js` and `companion_simple.js`: emit those values.
- Fonts on each surface:
  - Website: `static_publish.py` publishes the fonts and licences, and `sw.js` keeps the fonts in its shell cache.
  - Windows app and shared server: `predecessor_meta.py` and `shared_server.py` serve only the five allow-listed fonts (`UI_FONTS`, `ui_font()`) and allow `font-src 'self'`.
  - Hosted page: it preloads two of the faces.
- `docs/DESIGN-SYSTEM.md`: new values, new tokens and "The Broadcast look".
- Windows install: `broadcast.css` and `assets/fonts/*` are new program files.

## Verification

- **Probes first.**
  - BC1 reproduced on the live site (2.48.1): no self-hosted fonts, no plate art or ghost name, no gauge or rank numerals. It now passes.
  - BC2 guards the focus ring against the slants. It held before and holds now.
- **Design-system probes.** W1–W4 and DS1–DS6 pass.
- **Visor contrast tests.** These caught a hairline colour almost equal to the raised surface; the line tokens are lighter now.
- **Suites.** Python static tests, Node tests, the 11 CI browser suites, and the static and design suites on a preview built from the six live bundles.
- **Checked by eye.** Phone 390×844 and desktop 1440×900, both themes:
  - Meta, hero, Match, More and Sources;
  - Kit and Partners;
  - an item dialog and the limitations dialog.
