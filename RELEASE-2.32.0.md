# 2.32.0 — reviewed builds for live 1.17, everywhere

Every hero/role plan was reviewed against live patch 1.17 (one-time review, September 23, 2026). The website, the Windows app and the phone home-screen app use the same engine and the same guidance file, so they show the same builds.

## What changes for you

- **87 reviewed starting builds** are available on all six ranks and in the Windows app. 45 builds changed: new item order, crest, augment, Eternal or blessings where current evidence and the kit supported it. 42 were checked and kept. Each change states its reasoning, an alternative and its limitation.
- **Adapt to my match works again** for every reviewed build. It was blocked because the tier and strategy review is overdue; it now depends on a separate, dated check of the item and hero-kit classifications it uses.
- **Seven experimental roles** (Akeron Support, Ikra Support, Maco Mid, Scarlett Mid, The Fey Carry, Wraith Support, Wukong Offlane) show their dated September 14 plan with the specific reason it is not recommended. Three newly offered roles without a plan (Legion Mid, Zinx Carry, Rampage Offlane) show the most-played observed variant, labelled as observed.
- **Phase Support and Valmont Mid** are available. The points where the source and official notes disagree are stated in each build; neither plan relies on them.
- The status strip shows build readiness and match-adaptation readiness separately from the pending tier/team review.

Tiers, compositions, counter picks and strategy were not reviewed and keep their September 14 dates. Enemy damage types stay unknown until that review, so armour needs in Adapt to my match apply when you choose them. No Gold+ 1.17 outcome sample exists; see `docs/BUILD-REVIEW-2.32.md` for every verdict and the remaining gaps.

## Engine

- Match adaptation is authorized by a dated adaptation review bound to the exact item-need and hero-kit classifications. A changed classification withholds adaptation without hiding the build.
- The armour-shred/health-damage rule accepts typed damage wording ("Max Health as physical damage") the same way as the published untyped wording.
- Changed mechanics still withhold exactly the builds that use them.
- Patch-plan loading counts retained verdicts correctly.

## Compatibility

App version and service-worker shell cache advance together to 2.32.0. The permanent offline data cache (`predecessor-meta-data-v1`), saved selections, settings and statistics are unchanged. Observed figures, samples and source dates are unchanged.

## Release path, installation and rollback

Built on released `main` (`2e91acd`, 2.31.2) plus the 2.31.3 guidance-availability repair (`2cbe26f`). Checks run on `release/2.32.0`; merging to `main` publishes the website. The Windows app is updated separately with a hashed backup that excludes `data\`, `snapshots\` and `settings.json`. This document is not a publication or installation receipt.

- **Phone home-screen app:** open the app, then **More → Check app update → Update app**. Do not clear browser data; saved picks, favourites and offline ranks are kept.
- **Website rollback:** revert the 2.32.0 commits on `main` through a reviewed change; publication runs normally. Statistics are never rolled back.
- **Windows rollback:** restore the program files from the pre-2.32.0 backup folder listed in the installation receipt; data, snapshots and settings stay as they are.
