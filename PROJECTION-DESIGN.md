# Publication projection (audit item 11)

Goal from the audit: publish a compact recommendation bundle plus hashed, lazy-loaded evidence annexes; remove duplication only from the delivery projection. Acceptance: initial decoded bundle ≤ 5 MB; engine outputs match the full bundle; evidence remains inspectable; export can assemble a complete snapshot.

## Baseline (live 2.26.1, 19 September 2026)

| Rank | Decoded | gzip | brotli |
|---|---|---|---|
| Gold+ | 16.9 MB | 2.73 MB | – |
| Bronze+ | 18.4 MB | 3.06 MB | – |
| Paragon+ | 12.3 MB | 1.77 MB | 0.86 MB |

Phone profile (4x CPU slowdown, fast 3G 1.6 Mbps / 150 ms): about 16.8 s until the page is ready, almost all of it the download; `JSON.parse` 0.22 s; heap 54 MB. Desktop: about 0.5 s. (`bundle-baseline.json` has every figure.)

What the bytes are (Gold+): Pred.gg per-hero role data 7.1 MB (item/slot tables 4.0, overview 2.3, counters 0.8), heroes 4.0 MB (abilities 1.0 including 0.42 of raw source copies, previous abilities 0.57, per-role builds 0.74, per-role matchups 0.5), reviewed guidance 1.4 MB, official patch data 1.1 MB (definition history 0.62, publisher news 0.19), items 0.74 MB (raw source copies about 0.5), perks 0.41 MB (raw source copies 0.3).

## Principles

1. **Lossless.** Every published part is an exact subset of the full bundle. Core + annexes reassemble the full bundle, deep-equal (key order included).
2. **Parity by construction.** The engine only ever sees the core. A field leaves the core only when the engine cannot read it: either no engine code reads it, or it is read only under a condition that the published bundle makes impossible (see "conditional placement"). Parity tests compare engine outputs from the core against the full bundle for every hero and role.
3. **Unknown fields stay in the core.** The annex is an explicit list of paths; anything not listed (including fields added later) is delivered in the core.
4. **Compatibility.** The full bundle keeps being published at its current URL and checksum, so a page from 2.26.x that has not reloaded yet, the Windows import path and the review queue keep working unchanged. New pages load the core.

## Delivery files (per rank, per publication)

- `bundles/<rank>-<sha>.json`: the full bundle (unchanged).
- `bundles/<rank>-core-<sha>.json`: the core, with a lossless columnar encoding: an array of three or more objects with identical keys in the same order becomes `{"$c": [keys], "$r": [[values]...]}`. The client expands it back to identical objects. About 25% smaller before compression.
- `bundles/<rank>-hero-<slug>-<sha>.json`: one per hero: that hero's display-only evidence.
- `bundles/<rank>-shared-<sha>.json`: display-only evidence used by the Sources, library and audit views.

The manifest keeps `url`/`sha256` (full bundle) and adds `core`, `shared` and `heroes` entries, each with URL, SHA-256 and byte size.

## Placement

Moved out of the core (reader in parentheses; none are engine code):

- Per hero: `statz_abilities`, `_teammates_raw`, `tag_evidence`, `lane_previews` (no reader); `previous_abilities` (kit tab); `pred_attributes` (kit tab); each ability's `pred_raw` and `pred_source` (kit tab, audit); per-role `matchups` (no reader); Pred.gg `overview` (hero Builds tab); Pred.gg item tables other than the six Tier 3 purchase tables (hero Builds tab); Pred.gg `antiCounters` and `laneCounters` tables (hero Counters tab).
- Shared: `pred_game_data.assets`, `items_catalog`, `eternals_catalog`, `heroes` (no reader); `field_protections`, `records` (audit views); `official.definition_history`, `official.publisher_news` (Sources, definition audit); `image_index`, `omeda_items`, `unverified_changes` (no reader); `scoped_changes` (history view); each item's and perk's `pred_raw`, `previous_source` (catalog audit).

Conditional placement (the engine provably cannot read these for this bundle):

- The six Tier 3 item tables go to the hero annex when `scoped_statistics.status` is not `ok`: `currentItemPool` returns before reading any table unless the Pred.gg cohort status is `ok`, and nothing in the page changes that status. When Pred.gg is current they stay in the core, because the Builds list plans every hero of a role.
- The Pred.gg `counters` table goes to the hero annex when its `cohort_verified` flag is not true: `matchup` reads its rows only when that flag is true.

## Client

1. Load the manifest; fetch the core, verify its SHA-256, expand it, validate its structure, render.
2. Opening a hero page fetches that hero's annex (verified) and redraws the evidence sections; until then they say the evidence is loading. Sources, library and audit views fetch the shared annex the same way.
3. Offline: the core is saved for every rank opened, annexes for the heroes and views opened while online; an evidence section whose annex is not saved says so and never shows partial numbers.
4. Export assembles core + annexes into the full bundle (fetching missing annexes when online) and labels a snapshot incomplete if an annex is unavailable.

## Tests

- Size budget: the Gold+ core is at most 5 MB decoded when Pred.gg is retained (today); the report also states the size when Pred.gg is current.
- Round trip: core + annexes deep-equal the full bundle for all six ranks.
- Engine parity: for every hero and role, the outputs of `plannedBuild`, `adaptBuild` (several situations), `performance`, `metaReview`, `recommend`, `generate` (sample inputs), `evidenceState` and the review packet are identical from the core and from the full bundle.
- Page: every route renders from the core alone with no errors; the hero page shows its evidence once the annex arrives; a failed or tampered annex is reported and never shown; offline behaviour and export as above; the existing suites unchanged.
