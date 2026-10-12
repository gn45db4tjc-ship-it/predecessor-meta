# 2.56.0 — favorites' patch changes, and your lane, enemies and allies in Match

On 12 Oct 2026 the owner asked for the four next ideas proposed in the project thread ("Sure do 1-4"). All four are display and engine changes; nothing new is collected. It is numbered 2.56.0 because the UI and design fixes (PR #145) take 2.55.0.

## What changes

- **Patch changes to your favorites (phone Meta).** When the live patch or a current hotfix changed a favorite hero, one closed line sits above Your heroes ("Patch 1.17 changed Adele", or "changed 2 of your favorites"). Opening it lists each official change note for that hero, with a link to the official notes. Earlier hotfixes are left out. The notes are shown as written; a change is not called a buff or a nerf, because the app cannot tell which a change is (a cooldown decrease helps, a health decrease hurts). The change rows arrive with the guide, so the line appears once it has loaded (engine `heroPatchChanges`, mobile.js `favoriteChangesHTML`).
- **One line per enemy in Match.** Under the enemy team, each enemy gets one line to watch for: the first sentence of the reviewed counterplay with its review date, labelled "Previous review · needs a check" when the review is not active for the live patch, or a line calculated from the kit (hard crowd control and the abilities that apply it, healing, shields, burst) when no review exists (engine `enemyWatch`).
- **Your lane opponent in Match.** Each enemy line has a My lane toggle. The marked enemy takes your role (the enemy who held it takes theirs) and becomes the adapted build's primary threat, so its damage type and kit can turn into an item need. A Your lane panel shows the current Pred.gg head-to-head win rate when there are 100 or more games (labelled as not a lane-only sample, since Pred.gg does not record the opponent's role), the reviewed counterplay against that hero, and which item needs answer them and what in the build covers each. The choice is saved with the match (`matchLane`).
- **Allies in Match.** A Your team section, below the enemy grid so the phone still shows the enemy portraits on the first screen (probe PD4), adds up to four allies, picked in place of the enemy grid so only one hero grid is on the page at a time. Allies go to the adapted build (`adaptBuild` allies), which already turns them into team advice (an aura option for a frontliner with magic-damage allies, uptime for a healer with a sustained attacker, an escape slot when no peel is identified). A Your team panel says which of frontline, hard crowd control, engage and peel are missing from the entered kits. Damage types are left out of that check: it needs each ally's current reviewed damage plan, which a kit alone cannot show. New match clears both teams; Undo restores them.

## What does not change

- Allies change advice, not item swaps. The engine has no rule that changes an item because of an ally, and the app cannot see what allies buy (for example whether someone already has anti-heal), so no such rule is invented here. The Your team panel says so.
- No new source, sample or tier. Head-to-head rows are the existing Pred.gg counters rows (`currentMatchup`).

## Review fixes

From the automated code review of the PR:

- A current hotfix counts when its version is one of the verified live hotfixes. The collector marks every hotfix row `historical`, so the first version showed no hotfix changes on a collected bundle.
- An ally keeps a role they play. An ally whose only roles are taken is refused with a message, and a role change that leaves an ally no free role removes that ally with a message.
- Clearing My lane puts enemy roles back in the order the enemies were added, so no enemy keeps your role.
- Use in Match from a hero page keeps your allies and applies the page's role.
- Opening a shared match clears the lane opponent.
- A previous-review watch line shows its review date.
- Team advice from allies shows before any enemy is picked.
- Removing an ally chip from the keyboard leaves focus on the allies button.

## Files

- `engine.js`: `heroPatchChanges`, `enemyWatch`; item needs carry `threat` when they answer the primary threat.
- `mobile.js`: `favoriteChangesHTML` on phone Meta.
- `companion_simple.js`: `matchAllies`, `matchFreeRole`, `matchFixRoles`, `matchAddAlly`, `matchSetLane`, `matchWatchHTML`, `matchLaneHTML`, `matchTeamHTML`; `matchAdapted` passes allies and the lane opponent.
- `ui.js`: `matchLane` in the saved state.
- `companion_simple.css`: styles for the new sections, existing tokens only.
- `predecessor_meta.py`: `VERSION` 2.56.0. `sw.js`: cache `predecessor-meta-shell-v2-56-0`.
- `docs/AI-CONTEXT.md`, `README.md`, `SOURCE-MANIFEST.json`.
- Tests: `tests/match_additions.test.cjs` (new, 6 tests; the engine tests failed before each change).

## Verification

- `python -B -m unittest discover -s tests -p "test_static*.py"`: 475 tests, OK (2 skipped).
- `node --test tests/*.test.cjs`: 411 pass, 0 fail (5 of them new).
- `tests/browser_companion_simple.cjs` against the staged gold seed (Chromium): 30 checks, no errors.
- A scripted preview check at 390 px and 1440 px: the favorites line for Adele (patch 1.16.4 seed, 10 changes, official notes link); Match with Khaimera, Muriel as ally and Kallari, Steel and Gideon as enemies; marking Gideon as the lane opponent moved Gideon to jungle and Kallari to midlane, showed the lane panel and saved the choice; New match cleared both teams and Undo restored them; no horizontal scroll, no page errors, and axe (WCAG 2 A/AA) found no violations on Meta or Match.
- `browser_companion.cjs`, `browser_navigation.cjs` and `browser_companion_accessibility.cjs` fail at the same step on main (they still expect the pre-2.36 Live and Plan screens), so they were not used.
- No physical-device or screen-reader check.
