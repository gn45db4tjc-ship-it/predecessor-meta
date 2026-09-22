# Scheduled reasoning reviews

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
