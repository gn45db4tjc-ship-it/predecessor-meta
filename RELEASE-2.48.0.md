# 2.48.0 — A shorter desktop hero page

Phase 6 of the 2 Oct brief. It is a separate change, not part of freshness.

## What changes for you

- **The answer comes first.** On the desktop hero page the reviewed build card now opens with all six items, then the loadout (augment, Eternal, both blessings, crest). The reasoning follows, and the build's patch review is one click away ("Patch review · date"). The six items and Use in Match are now in the first screen at 1280×800 and 1440×900; before, the items started below it.
- **Secondary sections are folded** behind the page's existing disclosure, each with a one-line preview:
  - **Partners:** "Leading: …" names the top three;
  - **Counters:** how to play as or against the hero, reviewed responses, and the matchup tables;
  - **Kit:** abilities, augments and official patch evidence;
  - **Adapt to the enemy team:** the build alternatives by team type;
  - **Build sources and evidence:** the evidence search, the Pred.gg and Statz variants, reviewed adaptations and source lines.
- **Order of what stays open:** the build, then the skill order, then "what changed for this hero" (itself a closed panel). The Build section's own source line (role sample, Statz availability) stays visible.
- **Evidence problems stay visible.** While the hero's detailed evidence loads, or if it fails (checksum, a website update, not saved offline), one line under the section bar says so, with the reason. Its placeholders now sit inside folds, so the line keeps the problem from being hidden.
- **Nothing is removed.**
  - Each section keeps its source line inside its fold, so provenance stays one click away.
  - The section bar (Build, Partners, Counters, Kit), a shared link to a section and Back/Forward open the matching fold.
  - A fold you open stays open while you stay on that hero.
  - An active evidence search opens its fold.
- **The phone is unchanged:** 700 px and narrower, including the phone's full-details page.

## Measured (desktop hero page height, live data of 2 Oct)

| Hero | 1280×800 before | after | 1440×900 before | after |
|------|----------------:|------:|----------------:|------:|
| Gideon midlane | 11,799 | 3,130 | 11,461 | 3,063 |
| Steel jungle | 9,412 | 3,015 | 9,167 | 2,996 |
| Sparrow carry | 10,968 | 3,028 | 10,707 | 2,985 |

The same in both themes: about 72–74% shorter. "Before" was measured on the live site (2.47.0); "after" on a preview built from the same six live bundles. Opening every fold restores the full content: Gideon with Counters open is 5,568 px at 1440.

## Verification

- **Probes first** (commit 9fdf48f):
  - Audit probe DH1 reproduced on main 0c422ee: Gideon at 1440×900 was 11,552 px on the seed, nothing was folded, and a section jump opened nothing.
  - DH2 guards the phone, quick and full-details, against any desktop fold.
  - DH1 now passes: 3,548 px on the seed; items and Use in Match in the first screen; Partners, Counters, Kit, alternatives and sources folded; the Counters jump opens its fold.
- **Caught by the first suite run and fixed:**
  - D1: a failed Statz hero page warning sat in the evidence fold. The Build section's source line is visible again.
  - I3, I7, I9, I13 and the offline-cache check: a hero's evidence that is loading, refused, gone after a redeploy or not saved offline was named only inside folds. The visible status line now names it.
- **Tests adapted, intent unchanged:**
  - S5 (the evidence search keeps focus and restores every row) and the design check that partner cards keep the kit-fit evidence now open the fold first, as a reader must.
  - A closed `<details>` can't be focused or read as visible text, so before this they tested a state no reader can reach.
- **Suites:** Python static tests, Node tests, the 11 CI browser suites, and the static and design suites on a preview built from the six live bundles.
- **Checked by eye:** desktop at 1280 and 1440 in both themes, the folds, and a section jump.
