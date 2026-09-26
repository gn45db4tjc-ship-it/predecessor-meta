# 2.35.1 — More of the skill chart fits on a phone

On a phone, the 2.35.0 skill chart showed 7 of its 18 levels at 375–390px before you had to swipe, because each row spent most of its width on the ability name. Rows now show the ability icon and key on phones, and a small legend under the chart names each key. Skill orders, labels, statistics and sources are unchanged.

## What changes for you

- **Phones (520px and narrower):**
  - each row shows the ability icon and its key (Q, E, RMB, R);
  - the tick boxes are slightly smaller;
  - a legend under the chart reads, for example, "Q Cosmic Rift · E Torn Space · RMB Void Breach · R Black Hole".
- **Levels visible without swiping:**

  | Screen width | 2.35.0 | 2.35.1 |
  |---|---|---|
  | 320px | 5 | 8 |
  | 375px | 7 | 10 |
  | 390px | 7 | 11 |
  | 430px | 9 | 12 |

- **Wider screens** are unchanged: the full ability name stays in each row.
- **Screen readers:** the ability name stays in each row header, so the table reads as before. The legend duplicates what the row headers say and is hidden from screen readers.

## Verification

- `tests/browser_companion_simple.cjs` now checks, at 320 and 390px, that at least 8 and 10 level columns fit beside the pinned ability column, and that every ability name is readable in the legend.
  - It failed on 2.35.0 (5 columns at 320px) and passes now.
  - 36 checks pass in Edge and in WebKit, including the axe scans.
- The 2.35.0 figures were measured on the live site. The 2.35.1 figures were measured on live Gold data (Gideon midlane) in Edge and WebKit at 320, 375, 390 and 430px: 8, 10, 11 and 12 levels fit, with no page overflow.
- Audit probes: 163 of 163 verdicts pass, including W1–W4 and DS1–DS6. Python static tests pass (1 skipped). Node unit tests: 332 pass.

## Compatibility

App version and service-worker shell cache advance together to 2.35.1. Saved selections, including each hero's chosen skill level, settings, the offline data cache and statistics are unchanged. Publication and Windows installation remain separate approvals.
