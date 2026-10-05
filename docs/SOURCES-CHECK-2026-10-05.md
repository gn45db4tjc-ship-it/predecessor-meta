# Predecessor sources check, 5 October 2026

The owner asked on 5 Oct 2026: check whether omeda.city and Pred.gg are independent, and look for any site or tracker that supplies what the Predecessor Meta tool needs. This was read-only research (07:48–08:05 UTC) and a code audit of main (fedcd67). Nothing was changed. It accompanies the owner's source map of the same date (kept outside the repository). The fixes it led to are release 2.52.1 (`RELEASE-2.52.1.md`).

## omeda.city and Pred.gg are one source

Pred.gg is omeda.city's renamed successor, run by the same operator.

- **The operators say so.**
  - The Discord's own description is "The discord for the Pred.gg website (formerly Omeda.city)!" (checked 07:59 UTC).
  - omeda.city's news post "We are moving!" says it is moving to pred.gg.
  - omeda.city's sign-up page says account creation is disabled and points to Pred.gg.
  - The same developer, C0re, wrote omeda.city's API docs and answers Pred.gg API questions.
- **They share the same data.**
  - The same version IDs: 167 = 1.17, 168 = 1.17.1.
  - The same build records; a build's update time matches to the microsecond.
  - The same image hashes and hero slugs.
- **omeda.city's builds.json is Pred.gg's guides, converted back.** Each build begins "This guide has been converted, and some content may be missing".
- **omeda.city's heroes.json and items.json are frozen and stale.**
  - **Heroes:** 54, with no Valmont. Pred.gg has 55. Kit numbers predate 1.16 and 1.17.
  - **Items:** 270, at pre-1.17 values. Example: Transference shows 2900 gold, 35 magical armor and 10% heal-and-shield. Pred.gg's 1.17.1 values are 3000, 40 and 8%; I checked both directly.
  - There is no version field, so nothing in the files shows they are stale.
- **The official Omeda Studios public API is gone.** Its host, backend.production.omeda-aws.com, no longer exists (checked 08:05 UTC).

## How the tool uses omeda.city (code audit, main fedcd67)

- **Statistics never come from omeda.city.** Nothing in the code counts omeda.city and Pred.gg as two confirmations; the only source count is a status line ("N of M sources ok").
- **omeda.city is the starting point for the roster, hero images, suggested roles, kit text and item metadata** (`predecessor_meta.py` §4, `build_bundle`). Pred.gg kits and items then replace them (`pred_source`).
  - On the live site (5 Oct 08:00 UTC), Gold+ takes all 55 kits and all 270 items from Pred.gg 1.17.1, from the retained Pred.gg data of 4 Oct.
  - When no Pred.gg data is available, the stale omeda.city text is used instead. That happened on 4 Oct 04:53: 28 plans were flagged for recheck only because omeda.city words the kit differently (`docs/rechecks/2026-10-04-0453.md`).
- **"Omeda community builds"** (`attach_community_builds`, first popular page) are really Pred.gg guides relayed by omeda.city. The current page holds 20 builds; the tool reads only the first page, so the old "15 per page" note doesn't matter.
- **Wording that wrongly implies independence:**
  - 15 historical source titles in `reviewed_guidance.json` read "Hero definitions collected independently from Omeda City".
  - `docs/BUILD-REVIEW-2.32.md` (and its ledger) says Pred.gg definitions were "cross-checked against Omeda".
- **Elsewhere the docs already handle overlap correctly.** Pred.gg Bronze+ is treated as "nested, not independent" of Gold+.

## Other sites

| Site | What it offers | Shows patch 1.17 / samples | Access rules | Verdict |
|---|---|---|---|---|
| Official patch notes | Changes; hotfix 1.17.1 is a section inside the 1.17 page | Yes | robots allows; no API | Authority for patches |
| Pred.gg | Stats, builds (augments, eternals, crests), counters, kits, items, version table, leaderboard | Yes, with exact filters and counts | robots blocks only /matches/ and /search?; the statistics API needs a registered app | Primary source |
| statz.gg | Rank × role rates, builds, counters, a filtered "best duo" list | "Patch 1.17", with counts; mode and date window not stated | robots allows; no terms | Possibly independent, but its data source is undisclosed |
| PredBuilds (+ mobabuilds, which redirects there) | 7-day rates, builds, modelled duo/trio estimates, paid AI | No patch label | Terms ban scraping and automation; paid tiers | Derived: "Data from omeda.city" |
| ortus.gg | Rates, builds, AI recommendations | Unverified | Its app says it rotates an anonymous Pred.gg token every 15 min | Derived; avoid |
| riftstat.com | Build builder, player lookup | 54 heroes, no Valmont | Embedded API | Derived; stale roster |
| predecessor.wiki.gg | Mechanics, patch history | Latest entry V1.12.6; no Valmont | robots blocks api.php | Stale |
| predecessor.pro, PatchDiff, PredTools, Dekker.gg, Ometa.gg | — | — | — | Offline or unrelated |
| Overwolf or desktop trackers | none found | — | — | — |

Conclusion: every live stats site except statz.gg serves Pred.gg/omeda.city data again. Agreement between them is not independent confirmation.

## Gaps

- **Teammate synergy by hero.**
  - statz only lists pairs above about 51% win rate.
  - PredBuilds' figures are modelled, and its terms forbid automation.
  - Pred.gg pages have no teammate section.
- **The full rank × role × exact-patch grid with a stated date window.** Only Pred.gg's authorized API offers this, and app registration still needs a request to Pred.gg (the Discord request drafted on 27 Sep).
- **Eternals by rank bracket.**

## Research footprint

- Public pages, robots.txt and terms only; a few requests per site.
- No logins, no paywalled content, no Pred.gg API probing.
- One research agent made a single wiki.gg api.php query before noticing robots disallows it.
- About 6 PredBuilds pages were spot-read, although its terms forbid systematic downloading.
