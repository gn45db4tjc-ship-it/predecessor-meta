# 2.45.0 — Freshness Phase 3: a calculated tier on every rank

Part of the freshness overhaul ([docs/FRESHNESS-STATUS.md](docs/FRESHNESS-STATUS.md)). Owner's decision of 2 Oct 2026: each rank gets a tier for every hero and role, calculated from that rank's own current sample, labeled "Calculated" and never "Reviewed".

## What changes for you

- **Every rank has tiers.**
  - Before, only Gold+ had tiers; the other five ranks showed "No reviewed tier for Silver+".
  - Now each rank shows a calculated tier for every hero and role with at least 100 games in that rank.
  - Method ([docs/CALCULATED-TIERS.md](docs/CALCULATED-TIERS.md)): each hero is compared with its role's average win rate in the same rank, through the sample's 95% interval.
    - S: clearly above the average (by 2+ points) with 500+ games.
    - A: above it.
    - B: within the uncertainty.
    - C: below it.
    - D: clearly below with 500+ games.
  - A thin sample stays near B, so luck alone cannot make an S. Ranks are never pooled.
- **Where it shows.**
  - Desktop: a "Calculated tier" column on the meta table, sortable by tier.
  - Phone: on each Meta row ("Calculated" above the games), and the Tier order uses it.
  - Hero header: desktop and phone.
  - Tapping a tier shows:
    - the rank, role, win rate, games and 95% interval;
    - the source, patch and date;
    - the role average it was compared with;
    - the method.
- **Gold+ keeps its reviewed grades.** A reviewed grade leads while it is active. While one is withheld (the observed rate moved, or the patch changed), its row shows the calculated tier labeled "recheck queued" instead of a blank. The detail names the reviewed grade's status and opens its reasoning.
- **Honest labels.** Saved statistics say "saved, not a current ranking"; the broader Statz dataset says "broader dataset, not current-patch". With an unverified patch there is no tier.

## On the live data (2 Oct publications, collected 13:20–13:43 CDT)

- **Hero roles with a calculated tier:**

  | Rank | With a tier |
  |------|------------:|
  | Bronze+ | 96 |
  | Silver+ | 95 |
  | Gold+ | 95 |
  | Platinum+ | 89 |
  | Diamond+ | 65 |
  | Paragon+ | 6 |

  Paragon+ has very few games per hero, so most of its heroes have no tier yet. That is the rule working, not missing data.
- **Sanity check against the 73 active Gold+ reviewed grades:** 31 identical, 65 within one step.
  - Eight are two steps apart. They are listed as recheck candidates in the status file.
  - No grade and no threshold was changed on that basis.

## Verification

- **Probes first:**
  - `tests/calculated_tiers.test.cjs` (commit 74e2958) failed on main 336fe6c: no calculated tier existed.
  - Audit probes CT1 and CT2 (commit 0235fff) reproduced on 912efb4:
    - CT1: no rank other than Gold+ showed a tier on desktop, in a detail or on phone rows;
    - CT2: a withheld Gold+ grade left its row without a tier.
  - CT1 now clicks the tier and reads the detail in the same step, because a later guide merge redraws the real bundle in the probe's relabelled page.
  - Guard C4 accepts the new order wording ("ordered by calculated tier, then role performance") while editorial tiers are paused.
  - Guard V12 (the phone hero's tier row spans the full width and never breaks inside a word) now measures whichever tier button the row holds: with a withheld grade it is the calculated fallback. It failed on the first full run only because it looked for the reviewed button.
  - The calculated tier button shares the reviewed tier button's styles (`ui.html`), except that its label stays visible in a narrow table.
  - The legacy meta acceptance (`tests/legacy/browser_meta_acceptance.js`, run by `browser_static.cjs`) still requires every Gold+ reviewed entry exactly once with its reasoning. For a withheld grade it now opens the calculated fallback, checks its label, and opens the reviewed reasoning from that detail. On the live publication it had failed because 13 withheld grades no longer render as the reviewed button.
- **Unit tests (8):**
  - the S/A/B/C/D rule;
  - a thin sample capped below S;
  - no tier under 100 games;
  - no pooling across ranks;
  - Statz and saved qualifiers;
  - a retained Pred.gg sample never ranked as current (Statz labeled broader, or no tier);
  - all six ranks named and calculated from their own sample;
  - an unverified patch or missing statistics giving no tier;
  - reviewed grades never modified.
- **Suites:** Python static tests, Node tests, the 11 CI browser suites, and the static and design suites on a preview built from all six live bundles.
- **Checked by eye:** desktop meta table, the tier detail, phone Meta list and phone hero header, both themes.
