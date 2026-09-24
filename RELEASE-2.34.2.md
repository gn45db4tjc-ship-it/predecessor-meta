# 2.34.2: keep Pred.gg data when a 1.17 supplement correction conflicts

This is a data-collection fix. Display, the engine, reviewed guidance, statistics and source dates are unchanged.

## What was wrong

- 2.34.0 made the reviewed strategy packet current for Patch 1.17. That activated a step that re-checks conflicting reviewed corrections against Pred.gg's own text.
- The step looked up every conflicting receipt among the packet's rules. Receipts from the separate `patch-1.17.json` supplement are not packet rules, for example `patch-1.16.4-perks-shred-spree-description` or `patch-1.17-perks-peal-description`. When one of them conflicted, the lookup failed and that rank's Pred.gg data was discarded for the whole collection.
- On the 24 September Windows collection, Bronze, Diamond and Paragon lost their Pred.gg data this way. Gold and Platinum were not affected. The Windows app could hit the same failure when refreshing those ranks.

## What changes

Supplement receipts are left to the supplement's own reconciliation (`patch_support`). Packet rules are re-checked exactly as before. A conflicting supplement field stays marked as a conflict, and no replacement is guessed.

## Verification

- `tests/test_static_pred_source_supplement.py` failed with the same `KeyError` on 2.34.1 and passes with the fix.
- On the dated Bronze+ 1.17 bundle from 23 September, the full enrichment and Pred.gg step failed on 2.34.1 with `KeyError: 'patch-1.17-perks-peal-description'`. With the fix it completes, and the conflict stays recorded.
- Python and Node suites pass.

## Compatibility

App version and service-worker shell cache advance together to 2.34.2. Saved selections, settings, the offline data cache and statistics are unchanged. Publication and Windows installation remain separate approvals.
