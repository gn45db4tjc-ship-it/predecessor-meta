# Grade recheck, 27 Sep 2026 (1.17 + Hotfix 1.17.1)

Rechecked 2026-09-27 by Claude (Opus 5.5) at the owner's request, answering the scheduled recheck reminder. This is a narrow recheck of the 2.34 strategy review (`docs/STRATEGY-REVIEW-2.34.md`), not a new full review. Grades are dated editorial judgments, not calculated win probabilities. Row-by-row reasons, limitations and every figure are in `docs/grade-recheck-2026-09-27-ledger.json`.

## Scope

- **Rechecked (21):** the 8 grades the 2.34 review flagged (Kwang jungle, Rampage jungle, Legion carry, Grim.exe carry, Countess offlane, Riktor support, Neon midlane, Greystone offlane); Gideon midlane, Kira carry and Zinx support, added on 25 Sep; the grades near the withhold line on 25 Sep (Grux offlane, Aurora jungle, Narbash support, Renna midlane, Drongo carry); and every grade the engine was withholding for "Statistics moved since review" (Dekker support, Howitzer midlane, Murdock carry, Sevarog offlane, Shinbi offlane, plus Kwang, Neon, Kira, Grux and Narbash above).
- **Proposed, not applied (1):** Baron Valmont midlane (see below).
- **Not re-reviewed:** the other 63 grades, hero notes other than the five role notes and the summary note, counters, adaptations, compositions and plans.

## Evidence

- **Pred.gg Gold+ ranked, whole 1.17 line** (versions 167 and 168, i.e. 1.17 plus Hotfix 1.17.1), fetched by the Windows collector 26 Sep 13:47 CDT, from the live Gold+ bundle (manifest published 27 Sep 17:32 UTC, tool 2.38.0, sha256 `c64f27bd…184a` checked). About five days of the patch; roughly 15,000 games per role.
- **Pred.gg Bronze+** from the live Bronze+ bundle (sha256 checked). It contains the Gold+ games, so it is nested, not independent.
- **At review**: the 2.34 sample (version 167, fetched 23 Sep 21:27 CDT). **Since review** is the whole-line sample minus the review sample; it assumes the review sample is contained in the whole line.
- **1.16.4 review rates** as quoted in the 2.34 ledger.
- **Official**: the 1.17 notes and Hotfix 1.17.1 (no newer hotfix at recheck).

## Standard

Unchanged from 2.34: a grade moves one step with a kit or patch reason and evidence pointing the same way, and a high rate alone never raises a grade. One rule is added, drawn from conditions the 2.34 review itself wrote down ("if a larger sample's interval excludes the review rate…"): a grade may **drop** one step without a kit reason when the whole-line 95% interval excludes the previous-patch review rate with at least 500 games and the games since the review point the same way. The asymmetry is deliberate: a raise on rate alone is what the policy forbids.

## Grade changes (5)

| Hero | Role | Before | After | Why | Limitation |
|---|---|---|---|---|---|
| kira | carry | B | A | Kit reason (1.17 Mercy damage, growth, Dusk mana refund) and the evidence now agree: whole line 50.9% over 1266 [48.2, 53.7] against 48.6% on 1.16.4; the 854 games since review ran 53.7% (z ≈ 2.9 against the review sample). The Murdock 2.34 precedent. | The rise is concentrated after the review; early-patch learning may be part of it. |
| legion | carry | S | A | The S carry 2.34 most wanted rechecked. Whole line 49.8% over 1623 [47.4, 52.2] now excludes 52.6% (1.16.4); since review 50.4%. The only 1.17 change (rifle hitbox) adds no damage. Lowest S carry, below A Revenant. | No kit reason: the new drop rule. Bronze+ is higher (51.3%). |
| gideon | midlane | S | A | Kit reason (1.17 cuts to Void Breach, Black Hole, Event Horizon, mana scaling) plus Hotfix 1.17.1 removing a Black Hole bug that favored him; evidence now agrees: 49.4% over 1739 [47.1, 51.7] against 51.2% on 1.16.4, since review 48.3% (nearly all after the hotfix). | The interval still includes 51.2%; the before/after-hotfix split is inferred from collection times. |
| greystone | offlane | S | A | Kit reason (1.17 base health and armor growth cut) and the interval now excludes 53.3% (1.16.4): 50.3% over 1884 [48.0, 52.5]; since review 49.5%. The Serath standard. | Close call: 2.34 named "below 50%" as its trigger and he is at 50.3%; Bronze+ is higher. |
| murdock | carry | B | C | The 2.34 raise rested on the buffs plus early results consistent in direction. That reversed: 44.4% over 1579 [42.0, 46.9], below his 1.16.4 46.2%; since review 42.6% (z ≈ −2.0). The raise's basis failed, so the grade returns to C. | The buffs are real; nothing in 1.17 explains the fall. |

## Retained (16)

| Hero | Role | Grade | Whole 1.17 line | Since review | Note |
|---|---|---|---|---|---|
| kwang | jungle | B | 47.4% / 559 [43.3, 51.6] | 50.0% / 364 | 2.34 trigger for C (interval excluding 48.9%) not met; watch updated. |
| rampage | jungle | A | 49.6% / 779 [46.1, 53.1] | 50.7% / 542 | Early dip did not persist; watch updated. |
| grim-exe | carry | B | 47.1% / 384 [42.2, 52.1] | 50.6% / 257 | Recovered toward 47.9% (1.16.4); watch updated. |
| countess | offlane | A | 52.0% / 417 [47.3, 56.8] | 55.2% / 279 | Kit and results now agree; S would rest on a small sample; watch updated. |
| riktor | support | B | 48.4% / 1960 [46.2, 50.6] | 49.5% / 1322 | The feared fall did not develop. |
| neon | midlane | B | 51.7% / 729 [48.1, 55.3] | 50.0% / 506 | 2.34's condition for A (rate holding, with an explanation) not met; watch updated. |
| zinx | support | B | 49.0% / 780 [45.5, 52.5] | 47.6% / 510 | The rise did not persist; watch updated. |
| grux | offlane | A | 51.8% / 1466 [49.2, 54.3] | 53.4% / 957 | Rate up with only a nerf in the patch; no raise. |
| aurora | jungle | S | 54.3% / 951 [51.1, 57.4] | 53.4% / 637 | |
| narbash | support | S | 52.1% / 849 [48.7, 55.4] | 50.6% / 575 | Early high rate fell back. |
| renna | midlane | B | 49.0% / 1264 [46.2, 51.7] | 49.6% / 859 | |
| drongo | carry | S | 52.2% / 1922 [50.0, 54.5] | 51.4% / 1271 | |
| dekker | support | B | 45.9% / 1516 [43.4, 48.4] | 44.5% / 1030 | **Flagged**: lowest support; interval includes 47.7% (1.16.4) by 0.7 points; watch updated. |
| howitzer | midlane | A | 51.6% / 601 [47.6, 55.6] | 49.2% / 398 | Early high rate faded. |
| sevarog | offlane | B | 47.3% / 550 [43.1, 51.5] | 45.7% / 368 | Below even, no kit reason. |
| shinbi | offlane | A | 50.9% / 976 [47.8, 54.1] | 49.0% / 643 | Early high rate faded. |

Every rechecked entry now cites the whole-line sample it was rechecked against, so the engine's 3-point trigger compares against that sample, and the entry carries `rechecked_at` (and `previous_tier` when the grade moved).

## Valmont midlane: proposed B, not applied

Proposed: **B**. Whole line 50.4% over 1354 Gold+ midlane games [47.7, 53.0]; Bronze+ 53.3% over 3593 (nested). Arterial Grip grounds and slows a bound target (the only Ground source in the 1.17 kits, which stops dashes such as Torn Space) and Exsanguinate returns health. He has no dash, the bind breaks when he is crowd-controlled, and Exsanguinate's mana cost rises every second. The reviewed plan avoids the attack-speed text that the official launch notes and the current source still dispute.

Not applied because `validate_guidance_packet` requires a tier's plan to be in `reviewed_guidance.json`, and his midlane plan is in the `patch-1.17.json` supplement. Applying it means bringing that plan into the packet or widening the rule. That is a separate decision, outside a grade recheck. The text and figures are in the ledger, ready to apply.

## Pools and notes

- Midlane pool: Lt. Belica, The Fey, Gideon, Argus (Gideon moves behind the two S mids).
- Offlane pool: Grux, Greystone, Akeron, Shinbi. No pool leads with a hero the review moved down. Grux (A, 51.8% over 1466) leads as the fight-starting melee frontline, and Greystone stays second for lane pressure.
- The carry pool is unchanged (Legion was already last). Kira is not added.
- The jungle, mid, carry, support and offlane role notes and the summary note are updated to match. The meta-review method states the recheck and its added rule.

## Code

- `engine.js` `metaReview`: a rechecked entry reports `reviewed_at` = its recheck date and `review_reviewed_at` = the full review's date.
- `ui.js` tier detail: "Reviewed 24 Sep · grade rechecked 27 Sep (was S)".
- `predecessor_meta.py` `validate_guidance_packet`: allows `rechecked_at` (zoned, after the review and after its reference sample) and `previous_tier` (a different grade, only with a recheck).
- Tests: `tests/grade_recheck.test.cjs` (engine dates, and the packet and ledger agreeing) and `tests/test_static_grade_recheck.py` (validator). Both failed before the change. The pre-change validator rejects the new packet ("Unknown meta review entry fields"), so **the packet and the code must ship together**: an installed app or collector on older code must be updated before it receives this packet.

## Limitations

- About five days of 1.17 data; intervals are still ±2–4 points. "Since review" is a derived difference, not a separate query.
- The new drop rule is an editorial choice made in this recheck; the owner can veto it (it decides Legion, and is the stated trigger for Dekker, Kwang and Sevarog).
- Greystone is a close call against the trigger 2.34 wrote down.
- No physical-device or screen-reader acceptance is claimed.
