# 2.41.3 — Freshness baseline and the owner's 2 Oct decisions

Phase 0 of the freshness overhaul. A documentation release: nothing on the site or in the Windows app changes.

## What's in it

- **A measured baseline of how current the site is**, in [docs/FRESHNESS-BASELINE.md](docs/FRESHNESS-BASELINE.md), with every number in [docs/freshness-baseline-2026-10-02.json](docs/freshness-baseline-2026-10-02.json). Measured on live 2.41.2 on 2 Oct:
  - Statistics reach the site once a day, from the PC collector only. Ages peak at 24.7 h, and grow without limit when the PC is off.
  - Pred.gg changes continuously; Statz changed twice in 7 days.
  - 13 Gold+ grades are withheld for moved statistics, and Legion carry's build is inactive. Nothing queues a recheck.
  - Other ranks show no tier.
  - An open tab can take 30 min to pick up a new publication.
  - A lost Actions cache would fall back to the 8 Sep Gold+ seed.
- **The owner's decisions of 2 Oct 2026** are recorded in `STRATEGY-REVIEW-POLICY.md` ("Current scheduling decision") and `docs/AI-CONTEXT.md`. They cover:
  - calculated per-rank tiers labeled "Calculated";
  - automatic rechecks with an auto-merge gate;
  - merging code for this objective when every check passes and the live site verifies.

  They supersede the 21 Sep one-time-trial decision.
- **A correction to `docs/AI-CONTEXT.md`:** publication re-runs the full enrichment, tiers included, when a bundle's tool version differs from the publisher's. Before, it said "publication replays builds alone".

## Verification

- Python static tests, Node tests and CI on the pull request.
- No code or data changed, so no browser suite is affected. After merge, the live manifest reports 2.41.3, and the six ranks keep their dates.
