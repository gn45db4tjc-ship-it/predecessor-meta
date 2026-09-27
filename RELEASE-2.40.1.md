# 2.40.1 — Recheck of 21 flagged 1.17 grades, and Valmont's first grade

A narrow recheck of the 24 Sep 1.17 strategy review, done at the owner's request on 27 Sep, against about five days of the whole 1.17 line (1.17 plus Hotfix 1.17.1). The full report is [docs/GRADE-RECHECK-2026-09-27.md](docs/GRADE-RECHECK-2026-09-27.md), and every figure is in `docs/grade-recheck-2026-09-27-ledger.json`.

## What changes for you

- **Five Gold+ grades move.**
  - Kira carry B to A: the 1.17 buffs, and her results since the review, point the same way.
  - Legion carry S to A: his results stayed near even, below his previous patch.
  - Gideon midlane S to A: the 1.17 cuts, the Hotfix 1.17.1 Black Hole fix, and results that fell.
  - Greystone offlane S to A: the durability nerf, and results that fell.
  - Murdock carry back to C: his buffs did not lift his results.
- **Baron Valmont gets his first grade: midlane B.** He has a grounding bind and sustain but no dash, and his results are near even over 1,354 Gold+ midlane games.
- **Sixteen grades are retained.** Where their text cited early 1.17 results, it is updated. Ten of them were being withheld as "Statistics moved since review" and show again.
- **Each rechecked tier shows both dates**, for example "Reviewed 24 Sep · grade rechecked 27 Sep (was S)", and its sample reads "At recheck".
- **Working pools:**
  - Midlane: Lt. Belica, The Fey, Gideon, Argus.
  - Offlane: Grux, Greystone, Akeron, Shinbi.

## When it appears

Tiers come from the reviewed packet at collection time. Publishing re-applies only builds from saved data. The new grades therefore appear when a collection runs with this release's packet and code: on the website at the next collection after publication, and in the Windows app after installation. Gold+ Pred.gg data is collected by the Windows collector, so that collector needs this release too.

The packet and the code must ship together. Older code rejects this packet ("Unknown meta review entry fields").

## Verification

- `tests/grade_recheck.test.cjs` covers the engine dates, and checks that the packet and ledger agree.
- `tests/test_static_grade_recheck.py` covers the validator rules. A tier may use a plan from the same-patch supplement; where that hero is absent, the tier is inert rather than invalid.
- The new tests failed before the change.
- Python static tests: 334 pass, 1 skipped. Node tests: 343 pass.
- A preview staged from the live Gold+ bundle, with the rechecked meta review, rendered the tier detail with both dates and no page errors.
- The 11 browser suites run in CI on the pull request.

No physical-device or screen-reader acceptance is claimed.
