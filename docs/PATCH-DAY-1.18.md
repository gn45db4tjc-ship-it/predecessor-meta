# Patch day: 1.18 (Frostbite)

Prepared 29 Oct 2026, before 1.18 was live. The publisher had announced it ("Update 1.18 Frostbite - First Look Dev Stream" on Steam); no 1.18 patch notes existed yet.

## Dry run

`tests/patch_day_dry_run.py` parses a synthetic official article that says 1.18 is live, enriches a copy of a live bundle with it and asks the engine what the site and the recheck queue would show. Run on the live Gold+ and Silver+ bundles of 28 Oct (1.17.2):

| Check | Result |
|---|---|
| Official article parsed as live 1.18 | Yes |
| Reviewed packet validates against a 1.18 bundle | Yes; enrichment completes |
| Reviewed guidance status | `needs review` (packet stays 1.17.2) |
| Reviewed grades / plans shown as current | 0 of 86 / 0 of 97 |
| 1.17 supplement (`patch-1.17.json`) | Inactive |
| Role statistics and calculated tiers | Unavailable until a Pred.gg 1.18 sample exists; nothing from 1.17.2 stands in |
| Recheck queue | One `patch-change` item, plus three `plan-mechanics` items (Countess jungle, midlane, offlane: "Loadout Sanguine Slash"), because the 1.17 supplement's correction no longer applies |

Nothing claims 1.17.2 guidance or statistics as current on 1.18. What the dry run cannot show: Pred.gg's 1.18 version id and first samples, Statz's lag, and the real 1.18 article's layout. If `official_parse` misreads the real article, the official check fails closed and the site keeps 1.17.2 labelled as such.

## Before the first collection on 1.18 can use Pred.gg

- The Windows collector runs the Pred.gg pulls. It must have the 29 Oct patch-check fix (Steam announcements such as dev streams and first looks no longer count as released patches); otherwise it withholds Pred.gg data whenever such a post is newest. Installing it needs the owner's go in the PC session thread.
- Pred.gg must list 1.18 as its newest version (`pred_cohort`); until then, current-patch statistics stay withheld.

## Owner decisions for the 1.18 build pass

From the owner on 28 Oct 2026 ("ok to table"), for the seven experimental plans left unresolved since the 1.17.2 build pass. Recheck each against the 1.18 sample first; a retired plan is still held by the review gate (`DECISION NEEDED`), and this decision is the owner's go for it.

| Plan | Decision | 1.17.2 evidence (Gold+) |
|---|---|---|
| Wraith support | Promote | 50.4% over 680 games, near average |
| Ikra support | Retire | 44.7% over 463 games, interval wholly below average |
| Maco midlane | Retire | 36 to 57 games; almost nobody plays it |
| Scarlett midlane | Retire | as above |
| The Fey carry | Retire | as above |
| Akeron support | Keep parked; look again on 1.18 samples | |
| Wukong offlane | Keep parked; look again on 1.18 samples | |

## Schedule

The recheck task runs once a day. When it reports a new verified patch, the owner can ask in project chat to run it every 3 hours for the next 7 days.
