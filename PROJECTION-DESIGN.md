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

## Publisher safeguards

- `build` verifies that the published parts reproduce the bundle byte for byte, refuses a bundle that uses a reserved key (`$c`, `$r`, `$order`, `$items`) and refuses hero keys that cannot name a file (`[a-z0-9-]` only, as the page and the service worker require).
- The projection is an optimisation. If it cannot be built, that rank is published exactly as before, with its full bundle only; the manifest records `projection_error` and the workflow log shows a warning. A rank is never withheld because of it.

## Client

1. Load the manifest. A rank whose evidence listing is malformed or of an unknown version is loaded from its full bundle instead; it is never withheld.
2. Fetch the core, verify its SHA-256, expand it, validate its structure, render. If the core cannot be fetched (for example offline with only a full copy saved) the full bundle is used; a core with the wrong checksum is refused like a full bundle.
3. Views that show display-only evidence ask for it. Whole evidence views (Pred.gg builds, counters and kit sections, publisher news, catalog source audits, Pred.gg history) say the evidence is loading; views that mix core data and evidence (ability cards, reviewed descriptions, the definition-review and Pred.gg audits) render their core data at once and mark only the evidence part. Each file is verified by checksum before it is merged in place; files arriving together share one redraw; an open dialog is refreshed when its evidence arrives.
4. A failed file is named in the view (checksum mismatch, timeout after 45 s, "not saved on this device" offline); Reload latest data retries it. A file that returns 404 because the site was redeployed triggers a check for the new publication (at most once a minute).
5. Evidence is tied to the bundle it was merged into: an update check that finds the same publication keeps it; a new publication or rank starts afresh.
6. Offline: the page saves the core (or full bundle) it loaded for every rank opened, together with the address it came from, and each evidence file it opened. Older cores and evidence of that rank are removed after the new ones are saved. The service worker serves them offline and never stores data itself.
7. Export downloads and verifies the full publication. If it cannot (offline), it assembles the core with every evidence file it can still verify; a snapshot that lacks some records which ones, shows a notice when opened, and marks those sections as not included instead of unavailable.

## Tests

- Publisher (`tests/test_static_projection.py`): round trip for Pred.gg ok, retained and partial; placement rules; reserved keys and file-name checks; the fallback publication; nested record lists; size (decoded core at most 5 MB with Pred.gg retained on the committed seed; under half the bundle with Pred.gg current).
- Engine parity (`tests/projection.test.cjs`): every engine method, for every hero and role, with and without enemies and allies, compared as JSON between the core and the full bundle, for Pred.gg ok, retained, partial, and ok with half the counters tables unverified. `plannedKit` returns the hero record itself, so it is compared without the moved display fields; its decisions are compared in full.
- Service worker (`tests/audit_regressions.test.cjs`): saved cores and evidence are served offline, never stored by the worker, and the one-time move from 2.23/2.24 never copies an old bundle next to a saved core.
- Browser (`tests/browser_audit_regressions.cjs` I1–I8, `tests/browser_offline_cache.cjs`, `tests/browser_static.cjs`): startup loads only the core; evidence equals the full bundle and engine results do not change; tampered evidence refused and retried; export complete, and labelled when evidence is missing; a rank comparison survives a redraw; an update check during a download; shared evidence failure, retry and dialog refresh; offline evidence; a save still running when the rank changes; the full-bundle checksum.

## Results (19 September 2026)

Six-rank preview from the 14 September collections (Pred.gg current, so the six Tier 3 tables are in the core):

| Rank | Full bundle (file / gzip) | Core (file / gzip) | Shared | Hero files (54) |
|---|---|---|---|---|
| Bronze+ | 18.4 / 3.06 MB | 6.78 / 1.18 MB | 2.61 MB | 4.37 MB total, largest 0.13 MB |
| Silver+ | 18.0 / 2.99 MB | 6.65 / 1.17 MB | 2.60 MB | 4.28 MB |
| Gold+ | 16.9 / 2.77 MB | 6.30 / 1.10 MB | 2.60 MB | 4.04 MB |
| Platinum+ | 15.5 / 2.49 MB | 5.91 / 1.01 MB | 2.59 MB | 3.71 MB |
| Diamond+ | 14.0 / 2.17 MB | 5.53 / 0.91 MB | 2.59 MB | 3.35 MB |
| Paragon+ | 12.3 / 1.81 MB | 5.08 / 0.80 MB | 2.58 MB | 2.93 MB |

With Pred.gg retained (the live state since 19 September) the cores are 4.79–4.95 MB (gzip 0.76–0.85 MB); expanded in memory they are 5.3–5.7 MB.

Gold+, same data and a gzip server as GitHub Pages uses; phone profile 4x CPU slowdown, fast 3G (1.6 Mbps, 150 ms), two runs each: ready in 8.0 s instead of 16.4–16.5 s; transfer 1.09 MB instead of 2.75 MB; `JSON.parse` 85–92 ms instead of 207–243 ms; heap 36 MB instead of 54 MB. Opening a hero with its evidence takes 1.4–1.5 s instead of 0.8–1.1 s (one extra 24 KB request at 150 ms latency). Desktop: ready in 0.33–0.35 s instead of 0.59–0.62 s.

## Known gaps

- The 5 MB target is met while Pred.gg is retained. With Pred.gg current the core is 5.1–6.8 MB, because every hero's planned build reads the six Tier 3 purchase tables and the engine copies whole rows into its observations; trimming them would change engine results.
- A saved core that no manifest entry describes (only possible in a browser without Web Locks, or after an older 2.26 tab rewrote the saved manifest) is not re-described offline, because its full-bundle identity is unknown; the rank opens again after one online visit.
- After a rollback to 2.26.x, cores and evidence files saved by 2.27 stay in the browser's storage until site data is cleared; 2.26 neither reads nor removes them.
