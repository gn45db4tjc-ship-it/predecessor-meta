# 2.52.1: Pred.gg kits kept over omeda.city

On 5 October 2026 the owner asked whether omeda.city and Pred.gg are independent sources. They are not: Pred.gg is omeda.city's renamed successor, run by the same operator. The evidence is in `docs/SOURCES-CHECK-2026-10-05.md`.

omeda.city's `heroes.json` and `items.json` stopped updating before patch 1.17:
- they have 54 heroes and no Valmont;
- the kit and item numbers are older (Transference shows 2900 / 35 / 10% against Pred.gg's 1.17.1 values of 3000 / 40 / 8%);
- they say nothing about their patch.

The owner approved three changes. No statistic, grade, build or rule changes.

## What changes

### 1. The last Pred.gg kits and items are kept, not omeda.city's older text

When Pred.gg can't be read, the collector now keeps the last Pred.gg kit, item and Eternal definitions it has. They keep their original fetch dates and are labelled "Saved <date> · retained from an earlier collection". They are kept only while the patch, the hotfix and the rank are the same.

- **A partial earlier collection still counts.** On 4 Oct 2026 Gold+ and Platinum+ dropped complete Pred.gg kits, because the earlier collection was marked "partial" after one rank-only counters page timed out. They fell back to omeda.city's wording, and the recheck queue flagged 28 plans for no balance reason (`docs/rechecks/2026-10-04-0453.md`). A partial collection now qualifies as long as its hero kits are complete.
- **Fresh statistics no longer block it.** If this collection's Pred.gg statistics arrive but its kits don't, the last kits are kept and the fresh statistics stay untouched. Before, nothing was kept.
- **Single failed pages are filled.** If only some hero pages (or the item or Eternal list) fail, those heroes keep their previous Pred.gg kit, marked `kept_from_previous`. Fresh entries are never replaced.
- **The right saved bundle is used.** The collector now picks the newest saved bundle that actually holds Pred.gg definitions. A failed collection saved since no longer hides the last good kits.
- **What stays the same:**
  - Pred.gg statistics are still retained only alongside the definitions, never instead of fresh ones.
  - A new hotfix, patch or rank never reuses old definitions.
  - Official and reviewed field protections still win.
  - With no Pred.gg definitions at all, the omeda.city text remains as the last resort, now labelled "older text".

### 2. Community builds are named for what they are

omeda.city's `builds.json` is Pred.gg's community guides, converted and relayed.
- The hero page's "Other sources · N community alternatives" is now "Community guides (Pred.gg) · N alternatives". A line says they are Pred.gg guides relayed by omeda.city, not a separate source from Pred.gg's statistics.
- The source notice is now "Community guides (Pred.gg, via omeda.city)". The name deliberately doesn't start with "Pred.gg ", so a failure still counts as a required-source failure, as before.
- The guide links already point to pred.gg.
- The item names were checked against two Pred.gg guides and are correct. omeda.city's item numbers drift from Pred.gg's above about 185, but the converted builds use omeda.city's own numbering.

### 3. Wording that claimed independence is corrected

- **15 reviewed-guidance source titles:** "Hero definitions collected independently from Omeda City" now reads "Hero definitions from Omeda City (Pred.gg's former site; not independent of Pred.gg)".
- **`docs/BUILD-REVIEW-2.32.md` and its ledger:** "cross-checked against Omeda" now carries a dated correction. The cross-check against the official notes stands.
- **`docs/AI-CONTEXT.md`:** its omeda.city entry now states the relationship.
- **Item and kit source lines:** omeda.city entries now say "older definitions" and "older text".

## Not changed

- **Statistics never came from omeda.city.** Nothing counted the two sites as two confirmations.
- **Other sites:** none was added. Every other live stats site except statz.gg re-serves the same Pred.gg/omeda.city data (see the check document).
- **omeda.city still supplies** the roster, hero images and suggested roles. A replacement for those would be its own change.

## Files

- `predecessor_meta.py`:
  - new `previous_pred_definitions` and `keep_previous_pred_definitions`;
  - `retain_pred_partition` and `previous_pred_bundle`;
  - `attach_pred_game_data(previous=...)` and `collect_bundle`;
  - the community-guide labels;
  - `VERSION` 2.52.1.
- `ui.js`: the kept-definition label, the community-guide heading and note, and the older-text source labels.
- `sw.js`: cache `predecessor-meta-shell-v2-52-1`.
- `reviewed_guidance.json`: 15 source titles.
- Docs: `docs/BUILD-REVIEW-2.32.md`, `docs/build-review-2.32-ledger.json`, `docs/AI-CONTEXT.md`, and the new `docs/SOURCES-CHECK-2026-10-05.md`.
- Tests:
  - `tests/test_static_independent_sources.py`: a partial previous collection is retained; failed kits are kept while fresh statistics stay; only failed heroes are filled; the fill runs before the one validated apply; the saved bundle with Pred.gg definitions is preferred. The fresh-data test now covers fresh statistics with fresh definitions.
  - `tests/test_static_optional_pred.py`: the new community-guide source name stays required.
- No new program files for the Windows install.

## Verification

- **Test first.** The four new behaviour tests failed on 2.52.0 and pass now.
- **Real-data replay.** The real Gold+ bundle of 3 Oct 14:05 CDT was used as the previous collection, with a copy of it marked failed as the current one.
  - 2.52.0 kept nothing: 0 of 55 kits from Pred.gg.
  - 2.52.1 kept all 55 kits and 270 items, labelled retained with the original date.
  - The publisher accepted the result.
- **Suites.** SUITE_RESULTS

## Taking effect

- **Website:** collections run by the website's own publisher use the repository code, so they get the fix once this is merged.
- **Windows collector:** the hourly collector is a separate install. It keeps the old behaviour until it is rebuilt and installed with the owner's approval.
