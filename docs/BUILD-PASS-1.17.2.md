# 1.17.2 build pass, 17 Oct 2026

The owner allowed the code and test changes this pass needed (issue #157). It is a patch-targeted build review, not a strategy review: tiers, compositions and the strategy packet stay on their 24 Sep 1.17 review (`patch` 1.17, `maintenance_review` "1.17 strategy review").

**Result: 0 changed, 89 checked and retained, 7 unresolved** (96 plans, including the 1.17 supplement's Baron Valmont Midlane).

## What moved

- `guidance.build_patch_review` is patch 1.17.2, reviewed 2026-10-17T08:58:00-05:00, with the live 1.17.2 and 1.17 article fingerprints. Its `adaptation_review` is on 1.17.2 and reproduces on all six ranks. The 1.17 pass's `source_reconciliation` is dropped: it was bound to the 1.16.4 and 1.17 articles and a 1.17 source bundle, and 1.16.4 is no longer live.
- Every plan is patch 1.17.2 with a new `patch_review` (reason, alternative from the 1.17 review, limitation, official 1.17.2 and 1.17 sources, the Pred.gg role items page and the Pred.gg 169 kit and items). Its preconditions carry the live Pred.gg 169 text. The 1.17 plan is kept as `previous_review`, so the site shows what changed since the last patch.
- The text fixes deferred by the 12:47 recheck are applied: Taproot 6% (Drongo carry, Yin jungle and offlane), Soulbinder 8% (Gadget support), the Phase support caution and the Zinx carry caution. Valmont's caution now says crowd control breaks the bind.
- Muriel support's limitation states the official Sentinel values (25/35/45% at levels 1/7/13), since the Pred.gg 1.17.2 text repeats and adds values and 1.17.2 did not change Sentinel.
- The five reviewed skill orders (Gideon, Greystone, Serath, Steel, Baron Valmont) were rechecked against the live ability text.
- `patch_support.py` now adds the supplement's plans to the build pass when every supplement plan carries that pass's patch. Its corrections and Valmont's counter ideas stay bound to 1.17 and are inactive on 1.17.2.

## Evidence

Live bundles of the 12:21 UTC publication (Gold+ collected 16 Oct 19:20 CDT; Pred.gg 1.17.2, version 169), official Patch_Notes_1.17.2 and Patch_Notes_1.17. Each plan's Gold+ 1.17.2 slot sample (first to sixth item, crest, augment, Eternal, blessings) was compared with its plan; 34 plans had a slot whose sample stood out, and each such slot is named in that plan's limitation ("Watch, in the Gold+ 1.17.2 sample: ..."). About four days of data and many compared slots mean no part was changed on win rate alone.

## Unresolved (7)

The seven experimental plans stay unresolved by design, with their 1.17 reason and the current sample.

## Not covered

Tiers, compositions and strategy (the 1.17.2 strategy review is still due), item order, the other ranks' samples, and any in-game test.
