# 2.37.0 — A decluttered phone app

Will asked for the phone app to be "as decluttered as possible", with every menu cleaned up and everything one tap away. The website keeps all of its detail. This release changes only the phone layout (700px wide or narrower, including the home-screen app). Desktop rendering and every evidence label are unchanged.

Measured at 390×844 on the live Gold+ data of 26 Sep 2026:

| Screen | 2.36.1 | 2.37.0 |
|---|---|---|
| Chrome above the content | 122–166px | 61px |
| First Meta hero row | y = 493 | y = 262 |
| Gideon Midlane, Build tab | 3,379px | 1,823px |
| Kit tab | about 4,400px | 1,659px |
| More menu | 12 entries | 8 entries |

## What changes for you

- **Top of the screen:**
  - One compact bar on every screen: rank, ↻ refresh, and the limitations chip ("ⓘ N").
  - The brand row and the top "More" button are gone; the bottom navigation has More.
  - The limitations dialog lists what matters to a player first (retained statistics, a source that could not be refreshed). The source audit sits under one collapsed "Source details", and duplicate entries are merged.
  - The app-update panel is one row.
- **Meta list:**
  - Search and Order share one row, and the subtitle and "Showing N of M" line are gone.
  - A tier shows only when that role's reviewed tier is active, so there is no "—" column.
  - "Build ready" is gone from nearly every row. A hero without an active reviewed build is flagged ("Build needs review" or "No reviewed build") only while that is the exception. When most of a role awaits review (a new patch), one line under the list says so instead of a chip on every row.
- **Hero page:**
  - **Header:** portrait, name, role, ☆ Favorite, Share and a **Use in Match** button. The sticky "Adapt to my match" dock and "← Meta" are gone.
  - **Build:** the six items appear once, numbered, in a Core and a Flexible group. The loadout is one row of five. One "Why this build ›" line opens the category, dates, reasons, alternatives and sources.
  - **Order:** Build, then Skill order, then Adapt to the enemy team, then Patch changes.
  - **Adapt to the enemy team:** one line per team type. When every swap replaces the same flexible item, that is said once. Answers already in the build fold into one "Already covered" line.
  - **Kit:** official changes are closed by default. Each ability shows its key, name and first sentence; the full text opens on tap.
  - **Options, Counters and Partners:**
    - The dataset or source line that repeated on every card is said once.
    - On a partner card, the kit score and "Evidence & why" share one row.
    - Counter "limits" open on tap, and dates show without the time of day.
- **Match:**
  - The enemy picker sits directly under "Enemy team": four columns on a 390px phone, fewer with large text. The duplicate hero name in the "you" panel is gone.
  - A one-line summary under the enemy chips, for example "2 swaps: Tainted Scepter for Oblivion Crown · Spellbreaker for Wraith Leggings", updates with every tap. The full adapted build stays below.
- **More:** Items & loadouts, Starting builds, Reviewed guide, Changes, Sources & accuracy, Preferences (theme, large text), Install help (hidden once installed) and App updates.
  - Quick draft, New match, Share/Open draft plan, Export snapshot and the review packet are no longer on the phone. The desktop keeps them all.

## Nothing is dropped

Every piece of provenance is still one tap away: dates, samples, patch, category, reasons, alternatives and sources. Screen-reader text keeps the labels and evidence that are hidden visually (for example "Blessing 1", or "replaces Oblivion Crown" with its qualifying effect). "Full details" still switches the phone to the complete reference.

## Code

- **Changed:**
  - `mobile.js`: chrome, Meta list, More and the limitations dialog.
  - `companion_simple.js`: hero header, build card, team alternates, Kit, Options, Counters, Partners and Match. It also adds one shared `adaptBuild` per Match line-up (`matchAdapted`).
  - `static_client.js`: the update row.
  - `companion_simple.css`: phone blocks only.
- **Removed:** the inert quick-draft code (`refreshQuickDraft`, `quickEvidenceKey`, `draftInputs` and their click branches). Nothing has rendered those buttons since 2.36.0.

## Verification

- **Probes first:** PD1–PD8 in `tests/browser_audit_regressions.cjs` reproduced on 2.36.1 and pass now.
  1. First Meta row within 280px.
  2. Content within 72px of the top, with no top menu button.
  3. Build tab within 2,000px, each item once.
  4. Match enemy grid above 700px.
  5. More has only the kept entries and no duplicate ids.
  6. Kit patch notes closed.
  7. No sticky overlay above the navigation.
  8. No "—" tier and no "Build ready" chips.
- **Rewritten probes:** U2, U3 and U7 now describe the 2.37 design (Use in Match in the header, the compact status on every screen, no "Build ready").
- **Suites that followed the design:**
  - Share, export and the review packet are checked on the desktop (`browser_static`, G1, LB3).
  - More is checked in the bottom bar (`browser_design`, `browser_static`).
  - DS4 measures the build flag.
  - `browser_role_statistics` expects the day, not the time of day.
- **Other tests:** Python static tests, Node tests and the 11 CI browser suites.
