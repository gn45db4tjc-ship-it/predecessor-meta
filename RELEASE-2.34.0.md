# 2.34.0: tiers, strategy and team advice reviewed for 1.17

This release carries a one-time editorial review of everything the 2.32 build review left dated 14 September. It covers tier grades, hero strategy notes, counter-picks, build adaptations, team compositions, pools and role notes, all for live Patch 1.17, with Gold+ as the reference. It also adds three new starting plans. The owner asked for this review; it does not start recurring AI reviews. Every verdict, with its evidence, is in [docs/STRATEGY-REVIEW-2.34.md](docs/STRATEGY-REVIEW-2.34.md).

## What changes for you

- **Tiers, strategy notes, counters, adaptations and compositions are current for 1.17** instead of showing "Tier/team review pending".
- **Four grades moved**, each for a 1.17 kit or patch reason with early 1.17 results pointing the same way:
  - Serath jungle, S → A;
  - Countess jungle, C → B;
  - Morigesh midlane, C → B;
  - Murdock carry, C → B.
- **Retained grades with corrected text.** Every other grade is retained. Many had text that stated 1.16.4 facts or named choices the 2.32 plans no longer use, and that text is corrected.
- **New mechanics in the notes.** Notes now cover 1.17's ground-effect interrupts (Crunch, Feng Mao, Grux, Yin, Yurei, Gideon), Greystone's stasis heal and Muriel's lower protection.
- **Pools:**
  - Khaimera joins the jungle pool, ahead of Serath.
  - Legion moves to the end of the carry pool.
- **New starting plans for three roles that had none:**
  - Legion Midlane;
  - Zinx Carry;
  - Rampage Offlane.

  Each plan states its very small sample: 31, 23 and 18 Gold+ games.
- **More accurate ability text on the website.** The published ranks no longer show 1.16 text for the abilities, costs and perks that 1.17 officially changed, including Akeron, Gadget, Kira, Morigesh, Murdock, Wukong and Zinx.

## Where it shows

- **Windows app:** every reviewed item is active on Gold+ with current Pred.gg data. That means:
  - 90 of 97 builds (the other 7 are experimental roles);
  - 70 tiers;
  - 54 hero notes;
  - 16 counter-picks;
  - 13 adaptations;
  - 12 compositions.
- **Website:**
  - Tiers appear once a collection with a current Pred.gg Gold+ sample is published. They need at least 100 current games, and today's published data has no Pred.gg sample.
  - The Khaimera and Mourn notes, the two compositions that use them, and 8 of 13 adaptations stay withheld while the site's source wording differs from the reviewed 1.17 text. Nothing is shown against text that doesn't match.
  - Published bundles pick up the review at their next collection.
- **Tiers with fewer than 100 current Gold+ games stay withheld** until the sample exists. The 100-game line is eligibility, not confidence.

## Other changes

- **Mechanics recertification.** Moving the reviewed packet to 1.17 re-activates its field corrections, mechanics resolutions and reviewed definitions. Each row was judged against 1.17, and none was re-stamped without a check:
  - rows whose values 1.17 changed, or that the 1.17 source now states correctly, were retired;
  - 28 guarded 1.17 text corrections were added;
  - 11 exact reconciliation entries keep every build that was active still active.
- **Engine fixes.** This review found two defects, and each fix has a test that failed before it:
  - build adaptations now compare item effects by value rather than by the order the source lists fields;
  - a full strategy review of the same patch now supersedes the interim 22 September patch note as the hero's strategy summary. The note stays visible in the Build and Kit sections.
- **Test staging.**
  - The committed Gold seed, collected on 1.16.4, is now staged with its own dated review packet (`tests/fixtures/reviewed-guidance-2.33.0.json.gz`), so its historical probes keep a coherent state.
  - Production always reads `reviewed_guidance.json`. `guidance_packet_path()` is overridden only by `tests/stage_preview.py`.
- **Label.** "Previous full strategy review" now reads "Full strategy review".

## Limitations

- **The Gold+ 1.17 sample was about 1.5 days old** at review, and Bronze+ contains the same games. These grades are flagged for the next review:
  - Kwang jungle;
  - Rampage jungle;
  - Legion carry;
  - Grim.exe carry;
  - Countess offlane;
  - Riktor support;
  - Neon midlane;
  - Greystone offlane.
- **Baron Valmont** has no tier entry.
- **Unverified mechanics are not relied on:**
  - whether silence ends a drum solo in progress;
  - whether interrupting Mourn ends Eclipse;
  - Phase's Hyperflux movement text;
  - Scarlett's Ashen Vow base damage;
  - Bayle's Berserk scaling.
- **No physical-device or screen-reader acceptance** is claimed.

Source version is not proof of installation or public deployment. Those use separate approvals and receipts.
