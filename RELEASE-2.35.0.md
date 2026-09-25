# 2.35.0 — Skill order as a level chart

Each build's skill order now reads like the in-game ability bar: a chart with hero levels 1–18 running left to right, one row per ability, and a ticked box at every level showing which ability to rank up. Builds, skill orders, statistics, sources and review dates are unchanged.

## What changes for you

- **Where it appears.** Every hero's build page shows the chart, on phone and desktop. So does the Live page for your hero. It replaces the phone's hidden "All 18 levels" grid, and the chart is always visible.
- **How to read it.**
  - Rows are Q, E, RMB and the ultimate (R), with the ability icon and name.
  - Columns are levels 1–18.
  - A blue tick is a basic ability point; a gold tick is an ultimate point.
  - The level you pick in "Your hero level" is highlighted as a gold column header with outlined boxes, and the line under the chart still says the answer in words ("Level 6: put the point in Black Hole (R)").
- **Phones.** The chart scrolls sideways inside its own box, with the ability names pinned on the left. Picking a level scrolls that column into view. The page itself never scrolls sideways.
- **Same evidence labels.** The chart keeps the order's label: "Reviewed level-by-level order", "Observed skill order · Statz", or "Calculated starting order · needs review". "Why this order & source" is unchanged. Heroes without a valid order still show "Skill order · unavailable" with the reason.

## Accessibility

- The chart is a real table: level column headers, ability row headers, and a caption for screen readers.
- Each ticked box has hidden text, for example "Level 7, rank 3".
- The current level is marked with `aria-current="step"`, not by colour alone.
- Level selection stays on the 44px "Your hero level" control. Level headers are labels, not small tap targets.

## Verification

- `tests/browser_companion_simple.cjs` now checks, at 320, 390 and 1440px in both themes, in Edge and WebKit:
  - the chart has 18 level columns and the four ability rows;
  - exactly one box is ticked per level, with 5/5/5/3 ticks per row;
  - the page does not scroll sideways;
  - choosing level 6 moves the current column.
  - 36 checks pass in each engine, including the axe scans.
- The new page-width check failed on the first draft. The screen-reader text inside the scrolling chart widened a 390px page to 620px. That draft was fixed before release.
- Audit probes: all 163 verdicts pass, including W1–W4 and DS1–DS6 (tokens, spacing, radius, gold-as-fill, focus and indicator contrast).
- Python static tests 249 pass (1 skipped). Node unit tests 332 pass.
- `engine.js`, `skill_guide.js`, the review packet and the data are unchanged.

## Compatibility

App version and service-worker shell cache advance together to 2.35.0. Saved selections, including each hero's chosen skill level, settings, the offline data cache and statistics are unchanged. Publication and Windows installation remain separate approvals.
