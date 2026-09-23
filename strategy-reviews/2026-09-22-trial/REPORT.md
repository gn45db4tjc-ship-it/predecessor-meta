# Post-patch strategy trial — September 22, 2026

**Completed locally. Nothing installed, pushed, merged or published.** This is the requested five-plan trial, separate from the earlier 93-build transition and the held 2.31.1 release. It does not complete or start a weekly full-roster review.

The trial was useful: it caught a contradictory Eternal recommendation, changed a purchase-order decision, and produced four reasoned level-by-level skill defaults. It also identified a skill-label conflict that should remain visible rather than be guessed away.

**Follow-up scope:** the new hero and patch-wide balance, item, Eternal and bug-fix effects remain required. The trial did not cover Baron Valmont or complete a roster-wide impact review. See [PATCH-COVERAGE.md](PATCH-COVERAGE.md) for the explicit outstanding work and effects on these five heroes.

## Evidence and scope

- The publisher explicitly announced **1.17 LIVE NOW** at **11:19:35 UTC**. The official article and publisher feed were checked again at about **19:06 UTC**. This confirms release independently of the article's scheduled date. [Publisher announcement](https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1844115010503898), [official 1.17 notes](https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_1.17).
- No later version appeared in the checked publisher feed/index, and the parsed 1.17 article had no embedded hotfix section. Its content fingerprint matched the earlier check. This is a check at that time, not a promise that no subsequent hotfix can arrive.
- The public review packet and all six manifest bundles passed their published SHA-256 checks. The packet was generated at **02:15 UTC**, before the live announcement, and refers to an earlier bundle. It is collection/preparation, not an AI review. The six current manifest bundles were examined separately.
- The Gold bundle's Statz collection dates are about **17:32 UTC**, but its statistical label is still **1.16**. A post-release download is not a 1.17 match cohort. Other brackets retain their own dates, URLs and samples in the ledger.
- Fresh Omeda requests matched the published raw descriptions for all **30 target abilities** and the metadata for all **34 unique selected items/crests**. Those feeds still contain known older mechanics. Official changes take precedence; no damage simulation uses the conflicting old numbers.
- Pred.gg's published collection failed with **“no structured page responses found.”** No bypass, paid API or repeated live access attempt was made. The current-version Omeda community-build page in the bundle contained no entries; it supplies no corroborating build here.
- Gold+ remains the editorial reference. None of these recommendations claims a verified current-patch rank advantage. No source figures, sampling labels or original collection dates were changed.

## Decisions

| Hero / role | Build verdict versus staged baseline | Material decision | Exact skills |
|---|---|---|---|
| Serath jungle | Changed | Fix the note that still called Weald the default although Thraex was selected. Retain Thraex as a sustained-contact choice; keep Weald as a viable execution alternative, not a disproven option. | Newly authored 18-level default |
| Greystone jungle | Changed | Overlord → Augmentation → **Giant's Ring** → Basilisk → Void Helm → Aegis Of Agawar. Buy dedicated armor before the third damage-oriented item; adapt earlier defense to the actual threat. | Newly authored 18-level default |
| Steel jungle | Checked and retained | Keep Fire Blossom's farm opening, then control amplification/armor. Never use the removed Heavy Metal spell-shield interaction as the engage plan. | Newly authored 18-level default |
| Gideon mid | Checked and retained | Keep the mana/protected-channel build. Take the escape at level two in the safety default; the second damage spell at two remains an explicit safe-lane alternative. | Newly authored 18-level default |
| Muriel support | Checked and retained, skill uncertainty retained | Keep affordable ally-enabling support purchases. Judge the early one/two-item support budget, not only the theoretical final six. | **Unresolved** button mapping; no reviewed schedule added |

The full per-plan record covers economy, all six purchases, alternatives, crest, augment, Eternal, both blessings, counters, team fit, supporting sources and uncertainty. It also preserves each before/proposed plan. See [ledger.json](ledger.json).

### Why these are not automatic reactions to nerfs

**Serath:** the staged Eternal change had left contradictory prose behind. The official patch also fixes a Weald trigger, so treating the nerf as proof that Thraex wins every matchup would be unjustified. Thraex is retained for the stated sustained-contact playstyle, with Savage Strikes/Ferocity matching that goal. Her existing items remain coherent: repeat attacks and sustain, physical defense, then matchup-dependent penetration/protection. No old conditional variant win rate decides the Eternal.

**Greystone:** two clear/damage purchases already fund farming and cast/attack weaving. The third purchase now supports surviving the contact required by his kit. Basilisk still has a purpose, especially with physical allies, but is less urgent when Make Way already provides some armor shred. Giant's Ring is conditional on incoming attacks; his ultimate spends part of its triggered window in stasis. The recommendation does not promise six uninterrupted seconds of retaliation.

**Steel:** there is no Steel-jungle role sample in any of the six bundles. This is a kit/economy recommendation, not an offlane win rate relabelled jungle. Shield Bash's monster interaction supports the role; his shield is not native healing. Unbroken Will is not selected by interpreting the disputed feed tenacity value as a percentage.

**Gideon:** mana still supports his kit despite weaker conversion. Truesilver earns its place only when protecting the interruptible channel matters. A shield-removal/silence threat such as Riktor can still make that purchase insufficient; position and allied setup remain necessary. An earlier offensive item is the alternative when there is little interruption pressure.

**Muriel:** Marshal needs an ally who can attack nearby. Crystal Tear first is a sensible alternative when reusable spell support matters more than an attack aura. A remote ultimate does not project nearby item auras across the map. Keep anti-heal conditional rather than assuming separate reductions add together.

## Skill points

These are authored defaults supported by the kit and rank functions, not measured optimal clear times. Take ultimates at **6, 11 and 16**. Each order passes the app's existing legality and evidence-precondition checks.

| Hero | Levels 1–6 | Levels 7–12 | Levels 13–18 |
|---|---|---|---|
| Serath | RMB, Q, E, RMB, RMB, R | RMB, Q, RMB, Q, R, Q | Q, E, E, R, E, E |
| Greystone | Q, E, RMB, Q, Q, R | Q, E, Q, E, R, E | E, RMB, RMB, R, RMB, RMB |
| Steel | RMB, Q, E, RMB, RMB, R | RMB, Q, RMB, Q, R, Q | Q, E, E, R, E, E |
| Gideon | Q, E, RMB, Q, Q, R | Q, RMB, Q, RMB, R, RMB | RMB, E, E, R, E, E |

- **Serath:** Chastise for the cheap reset/area attack; Heaven's Fury supplies monster strikes and a dodge window; Ascend provides access. Learn escape at two instead when an invade demands it.
- **Greystone:** Make Way for clear, Sacred Oath for cheap empowered cleave, then leap. An early safety/travel need can swap the second and third unlocks.
- **Steel:** Shield Bash for its cheap area stun and monster interaction; Bull Rush for access, then projectile protection. The old monster-damage amount is not reused.
- **Gideon:** the new level-two portal trades pressure for safety. Extra portal ranks remain late because their mana cost rises sharply; Ground still stops it.

**Muriel remains unresolved:** Omeda/Statz and the [official 1.14 headings](https://www.predecessorgame.com/en-US/news/patch-notes/Patch_notes_1.14) map Consecrated Ground to Primary, Alacrity to Secondary and Serenity to Alternate. The 1.17 headings use conflicting slots without describing a remap. Thus the existing Alternate-first order currently renders **Serenity-first**, not a shield-first schedule. Verify current in-game slots before endorsing an exact button sequence. Compare protection-first, area-support and lane-pressure routes by ability name in the meantime. Existing observed/calculated alternatives remain explicitly unreviewed; this proposal does not turn them into current reviewed advice.

## Pairings, counters and bracket differences

The primary cross-map recommendations are **Steel → Gideon** for area setup/follow-up and **Muriel → Serath/Greystone** for attack time and survivability. Positioning matters: Steel should not push targets out of Black Hole; Muriel must have a survivable destination and remain in aura range. Greystone provides contact pressure rather than Steel's dependable initial knock-up.

For context only, the old hero-wide pair pool records the following. These are not jungle-specific, not established rank-exact cohorts, and not current-patch predictions. Reciprocal observations are not added together.

| Historical pair | Observed WR / games | Overall baselines | Calculated gap above stronger baseline | Pair-WR interval |
|---|---|---|---|---|
| Gideon + Steel | 52.66% / 3,895 | 51.67%, 51.30% | +0.99 points | 51.09–54.22% |
| Muriel + Serath | 56.97% / 739 | 54.25%, 52.39% | +2.72 points | 53.37–60.49% |
| Greystone + Muriel | 57.98% / 1,147 | 53.02%, 54.25% | +3.73 points | 55.10–60.80% |

These intervals describe observed pair WR, not uncertainty of the calculated gap or proof of causation. All three clear the 100-game inspection threshold; that threshold does not solve sampling or patch uncertainty.

Counterplay is explained from abilities rather than inventing three current counters for every hero. Riktor's shield removal/silence and Dekker's catch/space control are examples of relevant threats, not newly measured counter rankings. Historical per-variant counter rows remain separately inspectable in the ledger; sub-100 rows are not promoted into recommendations. Serath's old Thraex/Weald matchup disagreement against Rampage is a concrete reason not to flatten variant data into one verdict.

The six brackets were reviewed separately. Greystone jungle has old Bronze/Silver observations but no Gold/Platinum/Diamond/Paragon role sample; Steel jungle has none in all six. Serath's Paragon sample is much smaller than Gold's. Muriel's older rank rows differ, but neither composition, player-selection effects nor match-window differences are controlled. No new rank-dependent tier adjustment is supported by this evidence.

## Verification and handoff

- **Python:** 205 tests run; 204 passed, one existing skip.
- **JavaScript:** 229 passed, including five new focused trial regressions.
- Existing guidance validator accepts the proposal. All **88 non-trial plans** and the global September 14 strategy review remain unchanged.
- Replaying the proposal against six verified bundles preserves all observed data and source dates. The actual engine accepts the five builds in each band; SkillGuide returns the four reviewed orders in each band. Muriel remains observed in five bands and calculated/needs-review in Paragon.
- Fresh source comparison covers 30 abilities and 34 selected items/crests. Full receipts and runtime outcomes are in [validation.json](validation.json).
- **Not run:** browser/device release acceptance, real in-game key mapping, or controlled build/clear experiments. This is an editorial trial, not release acceptance.

Worktree: `C:\Users\Will\Desktop\Predecessor Meta\Strategy Trial September 22`.
Branch: `codex/strategy-trial-sep22`, based on staged `0b775eef88651378911b8a5e78c913210613f68a`.
Published baseline was independently fetched as `92d6297f82f5c589702ed950226daef5dc23f1f2`.

Proposed app changes are limited to five records in `reviewed_guidance.json`, with focused tests and review artifacts. No engine/UI behavior changed. The pending release worktree and installed data were untouched. The source manifest identifies this as an unpublished strategy proposal. Incorporate through the existing release review only; do not treat these tests as publication approval. Before release, resolve or visibly retain the Muriel mapping limitation and run the normal browser/device checks on the combined release.

## Value and usage

Evidence collection used **15 successful scripted public GETs**, plus one web open and one search call. No paid API, model installation or local-model configuration was used. Review and validation reached completion about **19 minutes** after the scheduled trigger. Exact attributable credits/tokens are not exposed, so no price estimate is asserted.

**Recommendation:** use targeted AI reviews after relevant live patch changes, followed by small rotating batches once useful current evidence appears. The trial found meaningful issues beyond win rates, but a recurring 93-plan rewrite on thin day-one evidence would spend capacity restating uncertainty. This one-time run creates no recurring analysis; the next scope is the user's decision.
