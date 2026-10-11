# 2.53.1 — keep a failed Pred.gg role's last good rows

On 11 Oct 2026 the owner asked: "fix the partial Pred.gg fallback".

## The problem

In the 15:09 CDT collection on 10 Oct, Pred.gg returned HTTP 500 for the jungle, offlane and midlane role pages. Carry and support collected normally. The collection was "partial", so the site stayed on Pred.gg. The three failed roles had no rows, and their Meta tables were empty on the website until the next good collection (the desktop table showed only the error text). The site switches to Statz only when every Pred.gg role fails, which is what happened at 02:05 UTC on 11 Oct.

## What changes

- **The collector keeps a failed role's last good rows.** In a partial collection, each role whose page failed keeps its rows from the previous collection (`keep_previous_pred_roles`), under four rules:
  - Only from the identical cohort: patch, hotfix versions, rank, rating and ranked mode.
  - Only rows at most 30 hours old, the window the site already uses for retained Pred.gg observations.
  - The rows keep their original fetch date, and this collection's failure stays recorded.
  - A warning lists the kept roles and their dates.
- **What it never does:**
  - Replace a fresh role.
  - Call the collection complete: it stays "partial", so reviewed grades stay withheld as before.
  - Write the collection into the Pred.gg history used by Changes.
  - Fill a role with Statz rows: sources are never pooled.
- **Out of scope:** a wholly failed Pred.gg collection is still handled by the existing whole-source retention, or the switch to Statz. A role with nothing recent to keep stays unavailable.
- **The page says the rows are kept.**
  - The engine marks kept rows as retained, never fresh.
  - The desktop Meta source line adds "kept from the previous collection: this collection could not read the jungle page, so these rows are not a fresh sample".
  - Phone Meta shows a dated line above the list: "Jungle numbers are from the previous Pred.gg collection (fetched …): this collection could not read that page, so they are not a fresh sample."

Replayed on the real Windows feed, the 10 Oct 15:09 CDT Gold+ collection keeps jungle, offlane and midlane from the 9 Oct 14:03 CDT collection, about 25 hours earlier. That restores 24, 25 and 18 rows, and the publisher's projection accepts the bundle.

## Where it takes effect

- **Collector:** Pred.gg is collected only by the Windows collector, so the keep step runs once the collector is rebuilt from this release and installed. That is a separate approval.
- **Website and Windows app:** the labels and the engine's retained flag arrive with publication and the app install.

## Not changed (for the owner)

A partial collection, even one whose only failed page is the all-roles page, withholds every reviewed grade in every role. Reviewed grades need the whole collection to be "ok". This release leaves that editorial rule as it is.

## Files

- `predecessor_meta.py`: `keep_previous_pred_roles`, run by `collect_bundle` before the history and game-data steps; `VERSION` 2.53.1.
- `engine.js`: `performance()` marks a kept role's rows retained.
- `ui.js`: the desktop Meta source line.
- `mobile.js`: `keptRoleNote`.
- `sw.js`: cache `predecessor-meta-shell-v2-53-1`.
- `docs/AI-CONTEXT.md`: the rule.
- Tests: `tests/test_static_partial_pred_roles.py` (new, 8 tests, which failed on 2.53.0); probe PF1 in `tests/browser_audit_regressions.cjs` with its ledger entry (reproduced on 2.53.0, passes now).
- No new program files for the Windows install.

## Verification

- **Tests first:** `tests/test_static_partial_pred_roles.py` and probe PF1 failed on 2.53.0 and pass now. The ledger's open list is empty.
- **Real-data replay:** the last 20 Gold+ bundles on the Windows feed were replayed. Only the partial ones change: 10 Oct 15:09 CDT keeps jungle, offlane and midlane. 10 Oct 18:07 CDT, where only the all-roles page failed, keeps nothing because every role was fresh. Each result passes the publisher's projection.
- **Suites:**
  - Python static tests: 433 pass (1 skipped). Node tests: 404 pass.
  - The 11 CI browser suites against the committed seed: all pass. The audit suite's 229 probes match the ledger.
  - `browser_visor_look`: 35 checks, no errors.
  - `browser_release_upgrade` from 2.53.0 to 2.53.1 passes in Edge and WebKit.
