# 2.36.0 — Match, enemy team-type builds, and a chart-only skill order

Three changes Will asked for: the skill order is the chart alone, every build page says what to change for each kind of enemy team, and one Match screen replaces Compose, Draft and Live.

## What changes for you

### Skill order: the chart only
The "Your hero level" picker and the "Level N: put the point in…" line are gone. The level chart shows the whole order at once. The label (reviewed, observed or calculated) and "Why this order & source" are unchanged.

### Adapt to the enemy team, on every build page
Each hero's build page now has an **Adapt to the enemy team** section. You don't need to enter a draft to use it. It has one row per enemy team type:

| Enemy team | What the row answers with |
|---|---|
| Tanky or high-health | armor shred or %-health damage |
| Healing or lifesteal | anti-heal |
| Magic-heavy damage | magical armor |
| Physical-heavy damage | physical armor |
| Burst damage *(squishy builds)* | a low-health shield or similar |
| Magic burst casters *(squishy builds)* | a spell shield |
| Shield-heavy | anti-shield damage |
| Basic-attack carries *(frontline builds)* | attack-speed or damage reduction |

Each row says one of three things:
- **Swap** item A for item B. It names the slot and the effect that qualifies, for example "Reduce the Target's Healing by 45% for 4s" or "+40 magical armor".
- **Already in this build.** When the answer is a flexible item, it may say to buy it earlier.
- **No calculated swap fits** this build's flexible slots.

**How it works:**
- The rows use the same item rules as Live adaptation did.
- The reviewed core is never changed; at most one flexible item changes.
- The section is labelled "Calculated · item rules", and it doesn't predict win rates.
- If a hero's build isn't currently reviewed, the section says so instead of guessing.

### Match replaces Compose, Draft and Live
The Plan section is now **Match**:
1. Pick your hero; the role can be changed.
2. Tap the enemy heroes you can see, up to five. Tap one again to remove it.
3. Read:
   - the **enemy team type**, counted from each enemy's kit (tanky, healing, magic damage, physical damage, burst, shields, crowd control), with the heroes named;
   - the **build for this match**, with changed items marked, what they replace and why.

With no enemies entered, Match shows the team-type alternates from the build page. "Adapt to my match" on a hero page opens Match with that hero.

**What's removed:**
- the Compose composition search;
- the Draft "choose from three" shortlist;
- Live's lineup editor, bans, owned-item tracking and next-purchase coach.

**Where things went:**
- Reviewed team compositions stay on **Reference → Reviewed guide**.
- Hero partners and counters stay on each hero page.
- Old links and saved screens for Compose, Draft or Live open Match.

## Evidence rules kept
- Team types are counts from enemy kits, not from purchases or damage share, and the screen says so.
- Build changes come from the dated reviewed plan plus item effects. They are always labelled calculated, and no adapted-build win rate is estimated.
- Items that the rules leave to your judgement (conditional crowd-control protection) are listed as "Not changed automatically".

## Verification
- **New unit tests:** `tests/team_alternates.test.cjs` covers the build-page alternates:
  - a swap per team type that keeps the core;
  - armor rows cite the armor stat;
  - an answer already in the build is reported as covered, or bought earlier;
  - burst answers appear only for squishy builds and basic-attack answers only for frontline builds;
  - nothing is offered when the reviewed build is not usable.
- **Across all 97 live Gold builds,** 89 get rows. The other 8 show the reason their reviewed build is not usable. No row ever changes more than one flexible item.
- **Unit and static suites:** Python static tests pass (1 skipped). Node unit tests: 337 pass.
- **The 11 CI browser suites pass locally in Edge.** The audit suite has 130 of 130 checks passing.
- **Retired audit checks:** 33 checks covered the removed screens. They are listed under `retired` in `tests/known-defects.json`, with the release and reason, and the runner skips them. Among the checks that remain, these were rewritten for Match:
  - navigation and old links (N1, N2, N4–N6);
  - swaps named with what they replace (X4);
  - phone layout and focus (P9, P13, V11, M10, U3).
- **Legacy acceptance scripts:** the static suite's scripts reset the lineup directly instead of through Live. Each stops, with a named skip, where it would enter a removed screen.
- **Problems these tests found and this release fixes:**
  - Old `#view=draft`, `#view=live` and `#view=planner` links opened Meta instead of Match.
  - The website failed to load because `rank_view.js` still wrapped the removed screens.
  - On phones, changed build rows squeezed item names into a column.
  - The Match hero search did not filter.
  - Keyboard focus fell back to the top of the page after picking a hero.
  - A hero whose first listed role has no reviewed build now opens on a role that has one (Valmont opens on Midlane).
- **Match keyboard checks:** Enter picks your hero and moves focus to the enemy search. Enter on an enemy keeps focus on it. Removing a chip hands focus back to that hero. Focus survives a data redraw.
- **Windows app build:** smoke-tested with saved data on phone and desktop widths, with no page errors.

## Compatibility
App version and service-worker shell cache advance together to 2.36.0. Saved hero, favourites, selected playstyles, rank, theme and the offline data cache are unchanged. A saved Live hero becomes your Match hero, and saved enemies carry over. Saved allies, bans and draft shortlists are no longer shown. Publication and Windows installation remain separate approvals.
