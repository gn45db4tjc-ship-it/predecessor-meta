# 2.44.0 — Freshness Phase 2b: reviews show at once, patch checks every hour

Part of Phase 2 of the freshness overhaul ([docs/FRESHNESS-STATUS.md](docs/FRESHNESS-STATUS.md)).

## What changes for you

- **A merged review shows on the site within minutes.**
  - Before, a review that changed grades, builds or notes only appeared after the next data collection: 12–24 hours, longer when the PC collector was off.
  - Now each published rank records which reviewed packet it carries (a short fingerprint of `reviewed_guidance.json` and its 1.17 supplement). When the packet changes, the next publication re-applies it to every rank. A merge triggers that publication itself, about 4 minutes.
  - Source and sample dates never change; only the reviewed layer is re-applied.
  - This also ends the review's dependence on the PC collector's version: the website applies the current packet whatever version collected the data.
- **The official patch notes are checked every hour** (every three hours before). A changed live patch or hotfix article starts a collection in that same run. The website's status text follows the schedule.

## Fixed along the way (found by testing on the live bundles)

- **A replay of an already-published Gold+ bundle failed.** The unwind step removed the official 1.17 fallback perk Peal (it has no source record) and then tried to restore its correction (`KeyError: 'peal'`). It now skips corrections on records the review itself added; enrichment re-adds and re-checks them.
- **Each full replay duplicated three notices** (Official correction review, Official definition review, Statz build definitions): 7 → 10 → 13 on Paragon+. They are now dropped before re-enriching and re-created once.
- **A replay that cannot validate never blocks publication.** The rank keeps the review it was collected with, and the reason is logged.
- **The fingerprint is kept when a bundle is published**, so the replay runs once per packet change, not on every publication.

## Verification

- **Probe first** (commit fc41b7f, failing on main 6021c2f): `tests/test_static_publication_guidance.py`. A changed packet on the same app version was not re-applied, and builds-only replay returned early.
- **Regression tests in the same file:**
  - the Peal unwind (fails on the pre-fix code with `KeyError: 'peal'`);
  - notices not growing across replays;
  - the fingerprint surviving `public_bundle`.
- **On the six live bundles (2 Oct):**
  - the replay ran on every rank in about 1 s each;
  - generated dates, sources, tier lists and samples were unchanged;
  - all 86 grades were present;
  - notices stayed at 7–8 across repeated replays;
  - the rendered Gold+ bundle carries the fingerprint.
- **Tests:**
  - Python static tests, Node tests and the 11 CI browser suites.
  - The static and design suites on a preview built from all six live bundles.
