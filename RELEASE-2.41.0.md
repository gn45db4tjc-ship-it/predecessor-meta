# 2.41.0 — The desktop pass

2.37.0 decluttered the phone. This release reviews the desktop site at 1440 and 1920 px wide and fixes what that review found:

- leftovers from the old Plan screens;
- a Match screen that put its answer below the fold;
- layout and wording bugs;
- one mislabelled evidence category.

The desktop keeps all its data.

## What changes for you

- **The hero page has "Use in Match" in its header**, next to the role, just like the phone. The old Live Build Coach at the top of the Build tab is gone: it worked from whatever enemies Match last had, so it rarely matched the game in front of you. The build's category and evidence stay on the build card. The per-position samples stay in the Position 4–6 alternatives.
- **Match on a wide screen (1100 px and up) shows the picker and the adapted build side by side:**
  - Your hero, the enemy team and the hero grid are on the left. The adapted build is on the right and stays in view as you scroll.
  - With five enemies picked, on live Gold+ data at 1440 × 900, the build now starts at 536 px instead of 953 px, so it is on the first screen.
  - At five enemies the grid closes and reads "Change enemy heroes".
  - On the phone the order is unchanged.
- **Match's summary names the net change** on phone and desktop. For example, Gideon Midlane against Steel, Narbash, Sparrow, Grux and Gadget reads "2 changes: add Spellbreaker, Tainted Scepter · drop Wraith Leggings, Oblivion Crown". Before, it listed a chain of swaps.
- **Match labels a kept build by its own category.** When you chose a source playstyle and the enemies need no change, the badge read "Starting build kept" in the reviewed colour, as if the build had been reviewed. It now reads "Starting build kept · Observed choice". A reviewed build reads "Starting build kept · Reviewed".
- **"Share plan" is now "Share match":**
  - The dialogs say "Share this match" and "Open shared match", and the button says "Use this match". Shared links work as before.
  - The "Open plan" button and the plan file download were removed. They carried lineups for the removed Plan screens.
- **The old Plan wording is gone:**
  - The tab title is "Predecessor · Meta & Builds" and the sidebar says "Meta & Builds" (they said "Meta & Planning").
  - The role picker is labelled "Role" (it was "Planning role").
  - The sidebar and install notes say "Your match stays in this browser" (they mentioned a draft and Live game).
  - The install prompt says "Install Predecessor Meta".
- **Status notices speak plainly:**
  - Sources are named in words, such as "Statz and Omeda hero matching" and "Pair statistics", not internal keys like `statz<->omeda` and `synergy`.
  - Official fields inside a notice read as names, such as "Rallying Roar perk description", not `patch-1.17-perks-rallying-roar-description`. This applies on the desktop and in the phone's limitations list.
  - Each source is listed once, with its details grouped under it. Notes read as sentences.
  - The empty "Other sources · 0 community alternatives" fold is gone.
- **One reconciliation notice, not two.** Each collection checks the official 1.17 corrections twice, before and after the Pred.gg data arrives, and each pass added its own notice. Five of the six live ranks carry both a three-field and a two-field notice. The later pass now replaces the earlier notice.
  - Replaying the live Gold+ bundle with 2.41.0 leaves one notice.
  - A bundle collected by the Windows collector keeps two until the collector is rebuilt at 2.41.0.
- **Layout fixes:**
  - Loadout labels are no longer in capitals and stay inside their cells (at 1920 px, 167 were in capitals).
  - The Reference fold's chevron no longer sits on its text.
  - The Meta side rail fits the screen at 1920 px; its right edge was at 1,992 px.
- **Links and dialogs:**
  - A hero link that cannot be opened now says "The linked hero is unavailable". Before, it silently showed Meta.
  - Closing an item dialog returns keyboard focus to the item you opened it from.
  - Back closes an open dialog instead of leaving it over the previous page.

## What was removed

- **The desktop Build Coach** (`coachHTML`) and its field handler.
- **Plan file handling:** the Download plan JSON button, the plan-file import (`plan-file`, `import-plan`, `download-plan`) and `downloadPlan`.
- **One style rule** for the removed ban buttons in the item dialog.

The page stays 164 KB compressed (573 KB uncompressed, from 576 KB).

## Verification

- **Probes first:** each probe reproduced on live 2.40.0 and passes now, on the seed and on the live Gold+ bundle.
  - **DQ1:** the coach was shown and there was no Use in Match.
  - **DQ2:** "Meta & Planning", "Draft stays", "Share plan" and "Open plan" on the page, and "picks and bans" and "No enemy locks" in the share dialog.
  - **DQ3:** 167 capitalised loadout labels, a 12 px chevron gutter, and the rail edge at 1,992 px on a 1,920 px screen.
  - **DQ4:** `statz<->omeda` and three `patch-1.17-perks-*` keys, and "Official 1.17 mechanics reconciliation" listed twice.
  - **DQ5:** a bad hero link opened Meta with no message.
  - **DQ6:** focus landed on the page instead of the item, and the dialog stayed open after Back.
  - **DQ7:** the build was at 953 px.
  - **DQ8:** Adele Support with the first source playstyle, against Argus, showed "Starting build kept" in the reviewed class. The seed has no active build with a matching source playstyle, so on the seed DQ8 finds no case.
- **Retired probes:** V2, X1, X2 and X3 checked the Build Coach: its evidence line, per-slot categories, per-slot samples, and categories with and without samples. They retire with it.
- **New unit test:** `test_static_patch_support.py` checks that a replay with a changed conflict list leaves one reconciliation notice, and a clean replay leaves none. It fails on 2.40.0's publisher.
- **Tests:**
  - `test_static_companion.py` now checks that `coachHTML` is absent.
  - Python static tests (325), Node tests (340) and the 11 CI browser suites.
