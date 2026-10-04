# 2.50.0 — QoL pass: text that fits, things said once, fewer dead ends

The owner asked on 4 October 2026 for a thorough quality-of-life audit: make all text fit and line up, remove duplicated data and lists, and bring the builds up to date. Three checks fed this release. A fit sweep measured every screen on the live data at nine phone and desktop sizes. A tap-through used real taps and clicks on phone and desktop. A duplicates review read every page for repeated facts. Each finding below has a probe (QL1–QL29) that reproduced it before the fix and passes after it. No evidence, figure or rule changes.

## Phone

- **Full details is easy to leave.** It still remembers your choice. While it is on, a "Full details · Quick companion view" bar sits at the top of the hero page and of Meta. The exit used to be at the very end of a page about 16,000 px long, and Meta had none. The full page's button now says "Use in Match" (it said "Use in Live").
- **Back closes a dialog and nothing else.** On the phone an open item or loadout dialog is its own history step. The back gesture now closes only the dialog; it used to also leave the hero page. A tap outside a dialog closes it (desktop too).
- **Match keeps still under your finger.** Each enemy you pick adds a chip above the grid. The grid now stays where it was; before, the portraits jumped 17–52 px down. Tapping your own hero no longer puts the cursor in the enemy search, which raised the keyboard over the portraits; the keyboard still goes there.
- **New match can be undone.** It clears the enemy team and offers Undo in the message for as long as that shows.
- **Your place is kept.**
  - The META tab takes you back to where you were in the list, for the same role and search. Tapping META while on Meta still goes to the top.
  - Back no longer switches the rank back to the one a page was first opened under. The rank is your current choice.
  - "Your heroes" stays open or closed as you left it.
  - "Who do you play?" in Match lists your favorites and recent heroes first.
- **Search finds heroes in other roles.** A search with no match in this role lists matching heroes from other roles (for example "khai" on Midlane offers Khaimera) instead of "No hero matches". Changing role keeps the search. Enter opens the first match.
- **Skill order shows all 18 levels.** On the phone the chart is two rows of nine levels (1–9, 10–18). Levels 13–18, including the third ultimate point, used to be off to the side with no sign they were there.
- **Meta rows are compact again.** A calculated tier standing in for a withheld reviewed grade says "Calculated" on its row. Why ("N reviewed grades are withheld (recheck queued)") is said once above the list, not on every row. With grades withheld, rows went from up to 117 px to 84 px, and tier badges now share one left edge.
- **Loadout labels.** Both blessings show their number ("Blessing 1", "Blessing 2"); both used to read "Blessing".
- **Match's adapted build** is one row per item with room for each "Replaces …" note. It had become three narrow tiles a row.
- **Smaller fixes.**
  - Table headers on Sources and Changes are 11 px; they were 10 px.
  - Starting builds rows show a date, not a clock time.
  - The Sources page no longer ends with the desktop's Export note.
  - "Why this build" states the reason once (it was there three times). It leaves out the six items, which are on the page behind it.
  - A partner card no longer has both its own evidence disclosure and an "Evidence & why" button that opens the same evidence.

## Desktop

- **The hero header fits at 1024–1279 px.** Below about 1280 px the stats wrap under the name instead of squeezing it. At 1024 px the name was 13 px wide in a 110 px column, "Use in Match" took three lines and the rank line wrapped. A hero role with no sample now says why once ("No Pred.gg Gold+ midlane sample"), not "Sample unavailable · unavailable".
- **The loadout says each thing once.**
  - Its category ("Reviewed", "Calculated starting selection") and source variant and date head the strip once. Before, each of the five parts carried the same chip and date.
  - Each part shows only its figure ("51.1% · 376 games"). The Eternal, which shares the augment's pair figure, says so ("Same pair as the augment") instead of repeating it.
  - The crest path spans the card, so it is no longer cut off.
  - The other final upgrades, or the upgrades a base crest leads to, share one tile.
  - In two-column Starting builds cards, the six items sit as Core and Flexible rows of three, so names such as Spellbreaker no longer break mid-word.
- **Starting builds** says page-wide facts once above the cards: missing Pred.gg build observations ("unavailable for N of M heroes in this role") and the patch reviews' scope. Before, they were on every card (the warning up to 18 times, the scope 9 times).
- **Kit.** When every ability has the same Pred.gg source line, it is named once above the abilities instead of under each one.
- **Meta tables.**
  - The Statz view's tier column is labelled "Statz tier", so it is not confused with the calculated tiers. Its row button says "Partners" and opens Partners; it used to say "Pairings" and open Build.
  - A row under 100 games says so once.
- **Changes** opens on the history that exists (Statz when Pred.gg history is unavailable). It used to open on an empty Pred.gg view.
- "1 game", not "1 games". The app update row names the running version once.

## Builds and data (4 October)

- One forced collection at 05:11 CDT, published at 05:37 CDT:
  - Gold+ Pred.gg is OK again, and all 86 Gold+ reviewed grades are active (75 of 86 the day before).
  - Builds: 90 of 97 are ready. The rest are seven experimental off-role plans that a review deliberately keeps out of suggestions, and Morigesh Offlane, which has no authored plan. None is stale.
  - Bronze+ has one Pred.gg page gap and Platinum+ four Statz hero pages missing. The site names both, and the publish run flags them as designed.
- The scheduled reviewer's 4 October recheck (PR #119) was merged by the review gate at 10:13 UTC.

## Kept

- Every figure keeps its source, sample and date. Where one moved, it moved to a single place, the head of its strip or page, rather than being dropped.
- Screen readers hear the full scope of each figure, for example "Win rate 51.1% · 376 games · this blessing in variant 3".
- 44 px phone targets, both themes, six ranks, exports, saved selections, deep links and Back/Forward.

## Files

- `mobile.js`:
  - phone history: dialog entries, the kept rank and the Meta place;
  - search and "Your heroes";
  - the withheld-grade note;
  - the loadout head, figures and crest tiles (shared with the desktop).
- `companion_simple.js`: the full-details bar, the split skill chart, team-type swaps shared on one line, partner cards, Match (still grid, focus, Undo, favorites first) and the "Why this build" sheet.
- `ui.js`:
  - the build card (`plannedBuildHTML` options) and Starting builds' shared notes;
  - the kit's shared source, the tables, Changes and the header's no-sample text;
  - `games()` and the desktop-only Export note.
- `static_client.js`: the update row. `ui.html`, `broadcast.css` and `companion_simple.css`: styles.
- Tests:
  - `tests/browser_audit_regressions.cjs` adds QL1–QL29 with entries in `tests/known-defects.json`;
  - Y1 accepts the loadout's single category;
  - `tests/browser_companion_simple.cjs` reads the phone chart across both rows.
- No new program files for the Windows install.

## Verification

- **Probes first.** All 29 QL probes reproduced on 2.49.0 (commit 7c5e3d2) and pass now.
- **Suites.** Python static tests (410), Node tests (397) and the 11 CI browser suites against the committed seed.
- **Fit sweep on the six live bundles.** __SWEEP__
- **Checked by eye** on the live data:
  - phone at 360 px: Meta, hero top, loadout row, skill chart, Match;
  - desktop: the hero header at 1024 px, a Starting builds card at 1280 px.
