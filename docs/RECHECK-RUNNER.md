# Scheduled recheck runner

The owner's decision of 2 October 2026 (`STRATEGY-REVIEW-POLICY.md`, "Current scheduling decision"): reviews of builds and grades are queued automatically and run by a scheduled agent, and a review PR merges itself when it passes the gate.

- **Runner:** a Claude Code scheduled task on the owner's machine (`predecessor-meta-rechecks`), every 3 hours. It runs only while the Claude app is open; a missed run starts at the next launch.
- **Single accountable reviewer:** the runner owns review content. Code changes stay with whoever is assigned the code.
- **Queue:** `review/index.json` on the live site, field `rechecks` (`review_queue.cjs`, engine `recheckQueue`).
- **Gate:** `.github/workflows/review-gate.yml` and `review_gate.py`. Never merge yourself.

## Each run

1. **Read the queue.**
   - Fetch `https://gn45db4tjc-ship-it.github.io/predecessor-meta/review/index.json`.
   - If `rechecks` is an empty list, stop: "No rechecks queued."
   - If it is `null`, the queue is unknown; stop and say so.
2. **One pass at a time.**
   - List open PRs labeled `automated-review` (`gh pr list --label automated-review --state open`).
   - If one is open, stop and report its state; don't start another:
     - waiting for the gate;
     - `DECISION NEEDED`: the owner decides;
     - `gate failed`: fix it in that PR's branch only if the failure is in this pass's own records, otherwise leave it for the owner.
   - **The lock** (`C:\Users\Will\Desktop\Predecessor Meta\Work-Sessions\rechecks.lock`, a one-line JSON `{started_at, worktree}`):
     - If it exists and is under 3 hours old, another run is working: stop and say so.
     - If it is older, that run ended without finishing (it was cut off, or it waited on a prompt): resume its worktree (step 3).
     - Otherwise write the lock now. Delete it after the PR is opened, or when you stop for any other reason.
   - **Unfinished passes** (since 2 Oct, when a run stopped before writing its records and the next run started over): `git worktree list` from the repository, looking for `Work-Sessions/rechecks-*` worktrees whose `review/recheck-*` branch has no PR (`gh pr list --head <branch> --state all`).
     - If one has commits or changes, resume it: continue its pass from its last committed record. Use only items still in the queue, and today's live bundles for any item not yet recorded.
     - If one is clean and its branch has no commits beyond `origin/main`, remove it (`git worktree remove <path>` and `git branch -D <branch>`).
3. **Workspace.**
   - Repository: `C:\Users\Will\Desktop\Predecessor Meta\Hosting\Predecessor Meta Free Hosting`. Don't check out branches in the shared tree.
   - Unless you are resuming an unfinished pass, create a fresh worktree from `origin/main`: `Work-Sessions/rechecks-<YYYYMMDD-HHMM>`, branch `review/recheck-<YYYYMMDD-HHMM>`.
   - **Commit as you go:** commit the grade records once the grades are done, then after each further group (plans, mechanics). A run that is cut off then leaves its work for the next run to resume. Don't push until step 8.
   - Never touch `data-updates` or `automation-state`.
   - Never read `.local-publisher`.
   - Never force-push.
4. **Evidence.**
   - Download the live bundles: `python -B tests/fetch_live_bundles.py qa/live-bundles` (sha256-checked). Use the Python at `C:\Users\Will\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.
   - The Gold+ bundle holds the reference Pred.gg cohort (`scoped_statistics`, with 95% intervals). Bronze+ contains the Gold+ games, so it is nested, not independent.
   - Official changes are in the bundles (`official_changes`, `official_hotfix_changes`); the official notes URL is `official.live.url`.
   - Use only published, dated evidence. No paid API. No new requests to a source that has blocked access, and no workaround. Never invent a sample.
5. **Recheck each item, grades first.** Every item gets a verdict: `changed`, `checked and retained` or `unresolved`. When in doubt, the verdict is `unresolved`, never a guess.
   - **`grade-moved` (a withheld Gold+ grade).** The 2.34 / 27 Sep standard (`docs/STRATEGY-REVIEW-2.34.md`, `docs/GRADE-RECHECK-2026-09-27.md`):
     - a grade moves one step at most;
     - a move needs a kit or patch reason plus evidence pointing the same way;
     - the drop rule: a grade may drop one step without a kit reason when the whole-line 95% interval excludes the previous review rate;
     - a high rate alone never raises a grade.

     Then update the entry:
     - set `rechecked_at` (now, with a timezone);
     - set `previous_tier` only when the grade moved;
     - set `evidence` to the sample you rechecked against: `winRate`, `wonGames`, `matches`, `url`, `fetched_at`, as in the bundle;
     - correct `why` and `watch` where needed.
   - **`plan-mechanics` (a plan inactive because supporting mechanics changed).** Compare the plan's `source_preconditions` with the current mechanics in the bundle:
     - If the plan's reasoning still holds, update the precondition text from the live source and record `checked and retained`.
     - If it does not, change the plan's parts and record `changed`.
     - Otherwise record `unresolved` and leave the plan inactive.
   - **`mechanics-conflict` (an official correction, definition or reconciliation notice).** Resolve it only with the official source's own text, in the supplement (`patch-<version>.json`). Otherwise record `unresolved` and hold it: add `{id, evidence}` (the queue item's `evidence`, exactly as published) to the log's `held`. The queue then skips it until the notice or any live official article changes.
   - **`new-hero`.** Prepare the first grade and plan in the usual format; the gate holds a first grade for the owner.
   - **`patch-change`.** A patch-targeted pass records its narrower scope and does not postpone the weekly pass.
   - **`weekly`.** Check every withheld grade and inactive plan, then log a weekly pass with the ISO week from the item id.

   Follow `STRATEGY-REVIEW-POLICY.md` for coverage and for each plan's record: mechanics checked, reason, uncertainties, sources with dates. An unresolved mechanic may not support a newly endorsed choice.
6. **Records.**
   - Ledger: `docs/rechecks/<YYYY-MM-DD>-<HHMM>-ledger.json`, holding `{schema: 1, title, reviewed_at, reviewer, scope, standard, entries: [...]}`.
     - Each entry has `kind` (`grade`, `plan` or `mechanics`); `slug`, `role` (or `section`, `key` for mechanics); `verdict`; `old_tier` and `tier` for grades; `reason`; `limitation` (the uncertainties); `reviewed_at`; and `sources: [{url, fetched_at}]`. Figures go in `figures`.
     - Every changed packet entry, plan or supplement item needs one. A rule that would need an exception gets `policy_exception: "<why>"`, and the gate holds it.
   - Report: `docs/rechecks/<YYYY-MM-DD>-<HHMM>.md`, a short summary of changes, retained, unresolved and limitations.
   - Log: append to `guidance.recheck_log` in `reviewed_guidance.json`:
     - `{kind: "triggered" | "weekly", week (weekly only), reviewed_at, items: [queue ids], scope, ledger: "docs/rechecks/....json", result: "n changed, n checked and retained, n unresolved", held (optional): [{id, evidence}]}`.
     - `held` lists only `mechanics-conflict` items of this pass left `unresolved`, each with its queue `evidence`.
7. **Validate.**
   - `python -B review_gate.py validate-live qa/live-bundles/*.json`
   - `python -B -m unittest discover -s tests -p "test_static*.py"`
   - `node --test tests/*.test.cjs`
   - `python -B review_gate.py update-manifest`
   - Self-check: `python -B review_gate.py decide --base origin/main --head HEAD` after committing. It must not say `fail`. Fix your own records if it does. Never change code to pass.
8. **Pull request.**
   - Push the branch.
   - Run `gh pr create --base main --label automated-review --title "Recheck <date>: <n> changed, <n> retained, <n> unresolved" --body <report>`.
   - The gate merges, holds for the owner (`DECISION NEEDED`) or fails it. Don't merge.
9. **Report.**
   - Report the PR link, the items handled and the verdict counts.
   - If code would have to change (a validator, the engine or the policy), stop. Open an issue for the owner instead, labeled `DECISION NEEDED`.

## The gate's rules (for reference)

- **Merges only when:**
  - only review files changed (`reviewed_guidance.json`, the supplement, `docs/rechecks/`, and SOURCE-MANIFEST hashes of those files);
  - the validators, tests and live-data browser suites pass, and CI is green;
  - every changed entry has a complete ledger record;
  - no grade moves more than one step;
  - nothing unresolved supports a newly endorsed choice;
  - the pass is logged.
- **Holds for the owner** (`DECISION NEEDED`) for:
  - a first grade;
  - a removed grade or plan;
  - a policy exception;
  - a validator or policy change;
  - more than 10 grade changes.
- **Auto-merge** is on only while `free_hosting.json` `review_auto_merge` is true on main and the last two nightly live checks passed.
- **After a merge**, the live site must carry the merged packet on every rank within 30 minutes, or the merge is reverted.
