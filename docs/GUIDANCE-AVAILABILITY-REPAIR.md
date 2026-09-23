# Guidance availability repair — 2.31.3

September 23, 2026. Baseline: released `2e91acd` (2.31.2).

## Confirmed defects

- A Windows refresh produced zero active builds out of 94. Eighty-seven failed exact supporting-mechanics checks; seven experimental role plans were already unresolved. The live patch fingerprints matched the build review.
- Reviewed preconditions retained old source formatting, in-game counter placeholders and several pre-patch values even where the September 22 reasoning explicitly addressed the new patch. Pred.gg's fresh definitions consequently invalidated every otherwise usable build.
- The shorthand-tag parser incorrectly narrowed `Ability Damage` to `Ability magical damage`. This affects Aion and Caustica; an ability is not inherently magical.
- Meta's generic “Review unavailable” and the single global guidance strip conflated tier/strategy review with independently reviewed starting builds.

## Repair and boundaries

106 exact field transitions were inspected and recorded in `reviewed_guidance.json` under `build_patch_review.source_reconciliation`. Each has its original and accepted value, reason, collection date and public source. Relevant official changes were checked against the retained, currently verified 1.17 and 1.16.4 articles. Numeric source-only changes remain identified as public definitions rather than officially verified mechanics. No rule accepts arbitrary source edits, drops unknown effects, normalizes away numbers, or turns an unresolved role into an endorsed plan.

The parser preserves the phrase Ability Damage. Saved-data repair applies only where the existing field is exactly the former parser output for its stored raw source; independently corrected fields are left alone.

The reproduced Windows bundle now has **85 active starting plans**. Phase Support remains held: the new source claims stackable passive healing and changes the ultimate movement-speed representation beyond the verified notes. Valmont Mid remains held: Bloodbound's effect and Arterial Grip's attack-speed values conflict with the official launch text; other kit text has incomplete/irregular arrays. Their previous builds remain visible for inspection. Seven experimental roles also stay unresolved: Akeron Support, Ikra Support, Maco Mid, Scarlett Mid, Fey Carry, Wraith Support and Wukong Offlane.

Original review dates, statistical figures, samples, patch labels, source timestamps and the global September 14 strategy review are unchanged. This is not a full tier/composition review. The status strip now reports build availability separately; tier rows say “Tier review pending.” Each reconciled build exposes the dated supporting checks on demand.

## Regression record

- `tests/guidance_reconciliation.test.cjs`: the exact-transition case failed on the released engine. Tests cover unknown numeric/type/trigger changes, changed old preconditions, subject identity, article changes, future dates, missing provenance and unresolved roles.
- `tests/test_static_guidance_reconciliation.py`: Ability Damage reproduced as the wrong type before the parser fix. Tests cover guarded saved-data repair and preserved observations.
- The real-bundle replay separately asserts unchanged collection dates, pairs, scoped statistics, per-role samples, hero-wide figures and original strategy-review dates.

Installation and public publication are separate from this source report; only installation receipts establish that the taskbar application was updated.
