# Scheduled reasoning reviews

## Current scheduling decision (2 October 2026)

The owner's decisions of 2 October 2026, in the owner's words. They supersede the
21 September decision below and are part of the freshness overhaul
(docs/FRESHNESS-BASELINE.md):

- **Calculated per-rank tiers.** "Each rank gets a tier for every hero and role,
  calculated by the engine from that rank's own current sample and labeled
  'Calculated'. It is never labeled 'Reviewed'. Gold+ reviewed grades remain the
  editorial reference."
- **Automatic rechecks with auto-merge.** "Reviews of builds and grades are queued
  automatically and run by a scheduled agent. A review PR merges itself when it passes
  the gate in Phase 4. This replaces the 21 Sep decision that ran a one-time trial
  with no recurring review."
- **Merging code for this objective.** "Code may merge to main when every check
  passes, which deploys to production, provided the live site verifies afterward and
  you revert at once if it doesn't. This authorization covers this objective only."

Unchanged: installing on Windows still needs the owner's separate approval. No paid
APIs; the budget is free GitHub Pages and standard Actions runners. Pred.gg access
stops are never bypassed.

The Phase 4 auto-merge gate (all must hold): the PR touches guidance and review files
only; validators, Python and Node tests and the browser suites pass on a preview built
from live data; every changed entry has a complete ledger record; no grade moves more
than one step; nothing unresolved supports a newly endorsed choice. The PR is held for
the owner (DECISION NEEDED) for a hero's first grade, a policy exception, a validator
change, or a pass that would change more than 10 grades. Auto-merge stays off until the
nightly live check has passed on main for two consecutive runs.

## Previous scheduling decision (September 21, 2026), superseded on 2 October 2026

The owner replaced the three-hour AI checks and automatic weekly full-roster work
with a one-time trial on September 22 at 14:00 America/Chicago, after independently
confirming the new patch is live. Codex will review five representative plans,
prioritizing jungle. Qwen and PPLX are also available locally according to the
owner, but are not a dependency for this trial. A full-roster review is not
complete or currently scheduled by this trial. The owner will decide the ongoing
review regime after seeing its value. GitHub data collection remains unchanged.
The historical policy below defines quality and coverage requirements if a full
review is resumed; its older scheduling description does not override this decision.

## What is actually scheduled

The GitHub workflow collects public data daily, checks official changes every three
hours, and prepares `review/index.json` plus checksum-addressed review packets.
`review_queue.cjs` does not perform an AI review. Creating a packet must never
advance a strategy review date or relabel guidance as current.

A separate Codex heartbeat checks the existing queue every three hours. Full
analysis is due weekly after Sunday's daily collection, or sooner for a newly live
patch, changed hotfix content, new hero, or supporting mechanics conflict. A missed
Sunday remains due at the next available run. Unchanged queue checks exit promptly.
This uses the user's Codex allowance, not a paid API. Runs require the Codex
automation host to be available; GitHub's independent collection remains separate.

## Review coverage

Enumerate every hero/role plan at runtime (currently 93 across 54 heroes). Review
jungle first, especially jungle/mid and jungle/support, then finish all roles.
Never infer that checking a hero's main role covers its other role plans.

For each plan, evaluate purchase order, role economy, core and alternatives, crest
and evolution, augment, Eternal and blessing compatibility, ability scaling,
conditional item effects, expected execution, weaknesses and matchup adaptations.
Check 18-level skill-point orders separately from maximum-rank priorities. Explain
level-one choice, early utility versus damage, ultimate timing and role differences.
Revenant's initial skill rank and loadout effects on levelling must not be replaced
with a generic template. Calculated point schedules do not become reviewed solely
because their input priorities were reviewed.

Use official live changes and embedded hotfixes first, verified kit/item/loadout
definitions, eligible public Pred.gg evidence when accessible, Statz and Omeda
community builds as comparisons. Respect access pauses and rate limits. No paid
API, bypass, inferred current cohort, or fabricated statistics. Inspect all six
brackets separately; keep Gold+ as the editorial reference unless explicitly changed.

## Required record per plan

Every completed review records hero, role, `changed`, `checked and retained`, or
`unresolved`; actual review time; verified live patch; source URLs and collection
dates; the mechanics checked; reason for the judgment; and specific uncertainties.
Compare the previous plan with at least one plausible alternative where evidence
permits. High observed win rate alone is not an adequate reason. An unresolved
mechanic may not support a newly endorsed choice.

For an explicit skill-order review, use `skill_order_review` on the authored plan:
`order` (18 ability tokens), `reviewed_at`, `patch`, `reason`, `sources`, and
`source_abilities` (exact Q/E/RMB/R supporting description text). Tokens
are `Primary`, `Secondary`, `Alternate`, `Ultimate`; the UI resolves hero-specific
ability names. Also capture supporting ability preconditions in the existing review
structures. The order requires a separate actual review; do not promote a generated
template by adding a timestamp. Reviewers must verify exceptional point rules.

Only declare the weekly roster complete after every enumerated plan has a result.
Keep a resumable ledger for unfinished batches; interrupted or limited runs do not
stamp the remaining plans as reviewed. A patch-targeted pass records its narrower
scope and does not postpone the next weekly full review.

## Workflow and release boundary

Read the currently published manifest and review packet before collecting again.
Verify checksums. Independently verify live versus announced patch dates. Use an
isolated strategy worktree from current source; never check out another branch in
the shared tree or modify the installed data directory in place. Keep strategy
changes separate from the mobile prototype and avoid overlapping refreshes.

Use the existing guidance format and precondition checks. Update references only
after a real mechanics review. Do not change observed rates, samples, source dates
or the statistics' patch label. Preserve historical advice and make review gaps
visible. Run the current guidance validation, Python/Node tests and affected browser
evidence checks. Prepare a reviewable patch and concise report; retain the existing
explicit approval boundary for public installation/publication. Scheduling analysis
does not itself authorize bypassing that release boundary.

The app may continue to show the last reviewed advice with its date while a review
is queued, interrupted, unresolved or waiting for publication. Never imply a
completed or deployed review from a successful scheduler wake-up alone.
