# Calculated tiers

Since 2.45.0 every rank shows a tier for every hero and role that has enough games, calculated by the engine
(`engine.js`, `calculatedTier`) from that rank's own current sample. This follows the owner's decision of
2 October 2026 (`STRATEGY-REVIEW-POLICY.md`, "Current scheduling decision").

A calculated tier is always labeled **Calculated**, never "Reviewed". It is never written into the reviewed
guidance (`meta_review`). Gold+ reviewed grades remain the editorial reference.

## Inputs

- **The sample.** The rank's own role sample, from the source the page already uses (`performancePolicy`):
  - the Pred.gg current-patch cohort for that rank;
  - otherwise the broader Statz dataset, labeled as such.
  Ranks are never pooled, and a missing value is never filled with zero.
- **The role baseline.** The games-weighted win rate of every hero in that role with 100 or more games in that rank:
  total wins ÷ total games.
- **The interval.** The source's own 95% interval when the row carries one (Pred.gg rows do). Otherwise a Wilson 95%
  interval is computed from the win rate and games.

## Rule

| Tier | Condition |
|------|-----------|
| S | The interval's lower end is at least 2 points above the role baseline, **and** the sample has at least 500 games |
| A | The whole interval is above the baseline |
| B | The interval includes the baseline |
| C | The whole interval is below the baseline |
| D | The interval's upper end is at least 2 points below the baseline, **and** the sample has at least 500 games |
| none | Fewer than 100 games, or no verified current sample |

A wide interval keeps a thin sample near B, so it cannot produce an extreme tier on luck alone. The 500-game
requirement for S and D matches the threshold the engine already uses before a moved win rate withholds a reviewed
grade. A hero with 70% on 120 games is A, not S. Under 100 games there is no tier; the 100-game line is eligibility,
not confidence.

These thresholds were fixed before the comparison below and were not tuned to it.

## Labels and limits

- **Saved data.** When the sample is saved rather than current, the detail says "saved, not a current ranking".
- **Statz.** A tier from the broader Statz dataset says "broader dataset, not current-patch".
- **Patch.** With an unverified live patch, or statistics from another patch, there is no tier. Withheld statistics
  are not relabeled.
- **What a tier is.** It is an observed comparison with the role's average in that rank. It is not a power ranking:
  it ignores pick and ban rates, kit, draft and execution, and a win rate reflects who plays the hero as well as the
  hero.

## Where it shows

- **Desktop meta table.** A "Calculated tier" column for every rank other than Gold+, sortable by tier, then by win rate.
- **Detail.** Each tier opens a detail with:
  - the rank and role;
  - the win rate, games and 95% interval;
  - the source, patch and fetch date;
  - the role baseline;
  - this method.
  On a rank other than Gold+, the Gold+ reviewed grade stays one tap away as a separate reference.
- **Phone Meta list.** Each row shows its calculated tier, with "Calculated" above the games. The Tier order sorts by it.
- **Hero header.** On desktop and phone the tier sits in the hero header with the same detail.
- **Gold+.** An active reviewed grade leads. When a reviewed grade is withheld, the row shows the calculated tier
  instead, labeled:
  - "recheck queued" when the observed rate moved or the patch changed;
  - "reviewed grade withheld" for any other reason.
  The detail names the reviewed grade's status.

## Sanity comparison (live publications collected 2 October 2026, 13:20–13:43 CDT, by collector 2.44.0)

Tiers per rank, with every hero and role counted once:

| Rank | Calculated | No tier | S | A | B | C | D |
|------|-----------:|--------:|--:|--:|--:|--:|--:|
| Bronze+ | 96 | 2 | 7 | 13 | 41 | 25 | 10 |
| Silver+ | 95 | 3 | 7 | 12 | 46 | 21 | 9 |
| Gold+ | 95 | 3 | 3 | 10 | 62 | 16 | 4 |
| Platinum+ | 89 | 10 | 0 | 11 | 71 | 6 | 1 |
| Diamond+ | 65 | 35 | 0 | 5 | 57 | 3 | 0 |
| Paragon+ | 6 | 101 | 0 | 0 | 6 | 0 | 0 |

Higher ranks have fewer games per hero, so more heroes stay at B or have no tier. That is the intended behavior of
the interval rule, not missing data.

**Gold+ calculated tiers compared with the 73 active reviewed grades:**

- 31 are the same;
- 65 are within one step;
- 8 are two steps apart:
  - reviewed S, calculated B: Drongo carry, Eden carry, Sparrow carry, Steel support, The Fey midlane, Zarus jungle;
  - reviewed A, calculated C: Serath jungle;
  - reviewed B, calculated D: Kwang offlane.

Reviewed grades weigh kit, role economy and execution as well as observed results, so differences are expected. The
comparison is a sanity check that the calculation is not erratic. It did not change any threshold or any reviewed
grade. (A run on the 1 October publications gave 29 the same, 66 within one step and 7 two steps apart.) Large gaps are candidates for the automatic recheck queue (freshness Phase 4); they are not moved here.
