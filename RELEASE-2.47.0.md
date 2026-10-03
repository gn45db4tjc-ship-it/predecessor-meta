# 2.47.0 — Freshness Phase 4: automatic rechecks with an auto-merge gate

Part of the freshness overhaul ([docs/FRESHNESS-STATUS.md](docs/FRESHNESS-STATUS.md)). Owner's decision of 2 Oct 2026: reviews of builds and grades are queued automatically and run by a scheduled agent, and a review PR merges itself when it passes the gate.

## What changes for you

- **The site keeps a recheck queue.** Every publication lists what needs rechecking, grades first. Each item keeps the date it was first queued, so a missed run stays due. Listing an item changes no grade or date. The queue includes:
  - grades withheld because their statistics moved;
  - build plans whose supporting mechanics changed;
  - official mechanics notices;
  - heroes with no reviewed grade or plan;
  - a live patch the guidance was not reviewed for;
  - a weekly backstop after Sunday's collection.

  On today's data that is 13 withheld Gold+ grades, Legion carry and three mechanics notices.
- **A scheduled reviewer works through it.** A Claude Code task on your PC runs every 3 hours while the Claude app is open; the step-by-step procedure is in `docs/RECHECK-RUNNER.md`. It exits at once when the queue is empty. Otherwise it rechecks the items to the 2.34 / 27 Sep standard:
  - one step at most;
  - a kit or patch reason plus agreeing evidence;
  - the drop rule;
  - a high rate alone never raises a grade.

  It writes a ledger and a report, logs the pass, and opens a review PR.
- **A gate decides each review PR:**
  - **Merge**, only when every condition holds:
    - it touches review files only;
    - tests, validators and live-data browser suites pass, and CI is green;
    - every changed entry has a complete ledger record;
    - no grade moves more than one step;
    - nothing unresolved supports a newly endorsed choice;
    - the pass is logged.
  - **Hold for you** (`DECISION NEEDED`) for:
    - a first grade;
    - a removal;
    - a policy exception;
    - a validator or policy change;
    - more than 10 grade changes.
  - **Wait** while auto-merge is off.
  - **Fail** otherwise.
- **After a merge**, the gate publishes and checks that every rank carries the new packet within 30 minutes. If not, it reverts the merge and opens an issue.
- **Your switch:** `free_hosting.json` `review_auto_merge` (on). The gate also requires the last two nightly live checks to have passed; they passed twice on 2 Oct. Set the switch to `false` to hold every review PR for you.
- **The watchdog** now reports a recheck that has waited more than 24 hours.

## Verification

- **Probes first:**
  - `tests/recheck_queue.test.cjs` (commit 426624b) and `tests/test_static_review_gate.py` (commit c5b3203) failed on main 55d11e4: nothing queued a recheck, and no gate existed.
  - Both pass now.
- **Tests:**
  - **Queue (5):** each trigger in order; nothing queued once cleared; experimental unresolved plans never queued; first-queued dates kept; weekly backstop cleared only by a logged weekly pass.
  - **Recheck log validator (3).**
  - **Gate (13):** every merge, fail, hold and wait path; the SOURCE-MANIFEST and supplement rules; the live verification check; the workflow contract:
    - scope runs before any PR code;
    - read-only until the decision;
    - CI required;
    - merge pinned to the checked commit;
    - publish dispatched, live verification, revert.
  - **Watchdog:** a new overdue-rechecks case.
- **Suites:** Python static tests, Node tests, the 11 CI browser suites, and the static and design suites on a preview built from the live bundles.
- **Not yet exercised end to end:** the gate's GitHub path runs on the first review PR. The scheduled reviewer is created after this release merges, so it starts from the merged procedure.
