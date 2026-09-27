# 2.40.0 — What still pointed at the old Plan screen

Match replaced the Compose, Draft and Live screens in 2.36.0. A code-coverage tour of the live 2.39.0 site then found the buttons, shortcuts, work and code that still pointed at them. This release removes or fixes each one. Nothing that works changes.

## What changes for you

- **Three desktop buttons that did nothing are gone.** "Plan this pair" (Partners), "Lock this response" (reviewed counterplay) and "Explore in planner" (reviewed compositions) each wrote a team lineup into the old Plan screen and opened Match, which never reads a lineup. On the live site that was 50, 2 and 12 buttons on a typical page.
- **Shared plan links work again.** Accepting a shared `#plan=` link used to open Match empty. It now opens Match with the plan's first ally as your hero and its enemies filled in.
- **One Match shortcut.** The home-screen app's long-press shortcuts are Meta, Builds and Match. "Compositions" and "Live game" both opened Match.
- **The phone's Full details hero opens with less work.** It no longer computes the Build Coach it always threw away.
- **The page is lighter:** 164 KB compressed instead of 175 KB (576 KB uncompressed instead of 613 KB), downloaded and parsed on every online visit.

## What was removed

- **Code** that no current screen can reach, confirmed by the coverage tour on phone and desktop and by tracing every remaining call, 22 KB in all:
  - the lineup editor (slots, bans, clear, Undo branches);
  - the Live hero picker and situation dialog;
  - the Compose search harness and its settings;
  - the matchup dialog;
  - the coach dock.

  Removing those left `draftBlocks`, `guidedPlanConflict` and `setPick` unused, so they went too.
- **Styles:** 127 rules (9 KB) that only those screens used. The phone keeps its 88 px bottom padding for the navigation bar without the dock.
- **Kept:** the engine's composition search (`generate`, `recommend`, `fightPlan` and related functions), which the engine tests use. Also kept is everything the Windows app and the shared server use.
- **Design system:** `.build-strip` retires; the 2.37.0 build card replaced it.

## Verification

- **Probes first:** PT1–PT5 reproduced on the live 2.39.0 site and pass now.
  - PT1: 64 dead buttons.
  - PT2: a shared link opened Match with no hero.
  - PT3: duplicate shortcuts.
  - PT4: one `adaptBuild` call on opening the Full details hero page.
  - PT5: nine dead functions shipped.
- **Earlier speed probes:** PS1 (first screen) and PS4 (item tap) still pass.
- **Tests:**
  - `test_static_companion.py` now checks that the removed functions are absent.
  - The Compose worker's parity test is retired with the worker.
  - Python static tests, Node tests and the 11 CI browser suites.
