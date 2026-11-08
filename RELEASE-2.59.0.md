# 2.59.0 — patch-week trust: eligibility at the point of decision, official changes on hero pages

On 4 Nov 2026 the owner reviewed `docs/UX-REVIEW-2026-11-04.md` (PRED-UX-REVIEW-01) and asked for every fix ("fix them all"). Patch 1.18 had gone live the day before, and the first Pred.gg 1.18 sample had no hero at 100 games. Nothing new is collected, and no grade, plan or schedule changes.

## What changes

- **Phone Meta says when no hero is eligible (PW1).** When no hero in the role (or only one) has 100 games in the current sample, the compact phone Meta now shows the engine's existing sentence above the list, for example "No jungle hero has 100 or more games in Gold+ yet. Smaller samples remain visible below." Before, that sentence sat in a disclosure that renders only for previous, unavailable or saved statistics, so a current but small sample showed nothing.
- **No rank numerals without a basis (PW2).** On phone and desktop Meta, a row gets its slanted rank numeral only when it has a shown tier or an eligible sample (100+ games, current patch), in a list not ordered by name. Rows without one are not counted, so the numbers stay consecutive. Before, a name-ordered list with no eligible row was numbered 1, 2, 3, so the first hero alphabetically read as the best.
- **The hero stat names a small sample (PW3).** Under 100 games, the phone hero line adds "small sample" (as the Meta rows already did) and the desktop plate adds "Exploratory, under 100 games" (as the Meta table already did).
- **Official changes on the hero page (PW4).** The build area on desktop and phone has a closed "Official 1.18 changes for Steel · 4 changes" disclosure. It lists that hero's change notes for the live patch and its current hotfixes as written, with an Official marker and a link to the notes. Changes are never labelled buff or nerf. Before, the hero page showed only the reviewed interpretation of an older patch ("Patch 1.17 · what changed for this hero · needs review"), which stays as it was.
- **1.18 eternal changes are mapped.** The 1.18 article puts "Eternals:" as an h3 inside "Gameplay Balance", and the parser only recognised an eternals h2. So 18 eternal and blessing changes (The Maw, Predator, Lich, Phylactery, Memory Leak and others) were stored as unmapped, though the catalogue knows them by name. `attach_official_changes` now treats an Eternals h3 as eternal context, and leaving it clears the last entry so the next h3 ("Towers:") is not attributed to it. On the live 1.18 article, unmapped rows go from 37 to 19; the rest are systems changes and Major Blessing, which names no eternal. The publication replays this when the tool version changes, so it reaches the site at the first publication after the merge.
- **Watchdog wording.** The recheck issue said the reviewer runs "every 3 hours"; it has run once a day since 28 Oct 2026. A pending required-source retry now gives its real time: the publisher retries only 3 hours after the last full attempt, so an attempt after the retry was scheduled moves it later. (Issue #189 said 04:31 UTC at 05:50 UTC, after the 05:11 attempt.) `docs/RECHECK-RUNNER.md` says the same.
- **Desktop build heading.** It reads "Build" rather than "Recommended build" when the plan below it says a recommendation is unavailable.

## What does not change

- No source, sample, grade, plan, review date or schedule. Old-patch guidance keeps its "Historical advice" and "needs review" labels.
- Two items from the review were re-checked and left alone. The desktop breadcrumb names the Meta role because it is a link back to that list, and a link names its destination (QP15). The filled tan callout is the documented `.note.warning` style (`docs/DESIGN-SYSTEM.md`).
- Styles add two rules to `broadcast.css` and no tokens.

## Files

- `mobile.js`: the eligibility line in `guidedHome`, `heroTile` `ranked`, "small sample" in `displayedRoleText`.
- `companion_simple.js`: "small sample" in `compactRoleText`; official changes in the phone build tab.
- `ui.js`: `officialChangesHTML`, desktop row numerals, the plate's Exploratory note, the build heading.
- `broadcast.css`: `.unranked` rows draw no numeral and are not counted.
- `predecessor_meta.py`: `attach_official_changes` h3 eternal context; `VERSION` 2.59.0. `sw.js`: cache `predecessor-meta-shell-v2-59-0`.
- `watchdog.py`: daily cadence wording, retry time from the last full attempt.
- `docs/RECHECK-RUNNER.md`, `docs/AI-CONTEXT.md`, `docs/UX-REVIEW-2026-11-04.md`, `README.md`, `SOURCE-MANIFEST.json`.
- Tests: probes PW1–PW4 in `tests/browser_audit_regressions.cjs`, recorded in `tests/known-defects.json`. All four reproduced before the fix and pass after it. Also new: `tests/test_static_official_subsections.py` (3 tests, 2 failed on main) and `tests/test_static_watchdog_next_attempt.py` (3 tests, 2 failed on main).
