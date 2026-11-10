# Patch importer input reconciliation (PRED-M2 candidate)

Status: CLI implemented, source-authoritative extraction; 21 unresolved Eternal owner labels remain reported, never guessed. PR #213 / Issue #212. Muse reviewed 3f829c5; this fix round addresses F1-F6 without guessing Eternal owners.
Base: fda1ae265c720fcd26e5e136bbdbcb78776eb408. No PRED-M1 files changed.

## Verified inputs

Provided locally by Will on 10 Nov 2026; no network fetch was attempted after the earlier site-policy refusal.

- Official HTML SHA-256: ec44ca7c898a505bddca1bc4b9a1a9562b88d1ee8143c47f0cd46f18d255e499
- robots.txt SHA-256: d5f35244f130bb2e0ca6c36bd27b6e3d5359f626bd1c589b6ed799a5c23012f7
- Original CSV SHA-256: d4857fab0539081aa0a1467de11e2210f8708a5414f748504bcb4d307e9f6b4b
- Brief SHA-256: 868e9ad884aeeea9f5b9b27bf67a617c5e8f9511eeb3cf3b80be141564c20930

HTML and robots hashes match the provided fetch log. CSV/brief hashes were computed locally; no separate checksum manifest was supplied to this builder for those two files. Source date shown: Nov 3, 2026. CSV: 235 data rows (Hero 101, Item 22, System 54, Map/Mode 58).

Original CSV preserved unchanged. reference-normalized.csv changes only Change_Type to New for 31 rows whose Old_Value starts with None (New. Its SHA-256 is daeaf9dab86c400a6d659d89ec88d3bc9a6261f36e92ffe6d3ba6114f93e0751.

## Decision resolved: official source takes precedence

Will answered "official page" after Rocket explained the conflict on 10 Nov 2026. This supersedes exact reference matching where it conflicts with source/no-inference rules. The reference combines, paraphrases and infers text. That cannot be implemented as generic verbatim extraction that also returns every reference cell exactly. Do not hide this with a fixture-hash lookup, expected-CSV copying or patch-specific output constants.

Examples (data row numbers exclude header):

1. Row 14 (Kaelen / Razorstorm): CSV says `Hard CC immune`. Official text says `This ability cannot be interrupted by Hard Crowd Control Effects, meaning Kaelen will continue to spin even while Stunned.` Ability continuation is not a claim that the hero is immune to the control. Preserve the official distinction.
2. Row 190 (Overclocked / Ability Haste): CSV old value `0 bonus`; source states only `Ability Haste: +400`. Row 194 similarly infers `0 bonus` for Tenacity. A parser cannot recover these old values from the notes as written.
3. Rows 234-235 use `Standard Health Growth` as old value; source only says `Health Growth increased by 35%.` This is a chosen placeholder, not a source value.
4. Row 13 combines CD and Cost into one cell with a semicolon, while the HTML contains separate lines. New-hero ability, bugfix and Ranked rows require many similar editorial choices. Unknown-page handling cannot generally recreate that wording.
5. Row 209 calls reduced Orb of Growth Max Experience a Nerf. Source says `Max Experience decreased from 500 to 450` without an explicit buff/nerf verdict. Mechanical direction alone cannot establish desirability; the brief says use Adjustment when unclear.

A whitespace-normalized visible-text substring screen (scripts/styles removed, Bugfix suffix and None (New...) sentinel excluded) finds 166 old/new cells across 99 rows absent as literal strings. This is a screening count, NOT 166 factual errors: punctuation, aggregation and paraphrases contribute. Above are examples inspected in context.

Recommended decision: official HTML is authoritative; reference is a coverage/reconciliation aid. Preserve exact numeric strings and units, retain original descriptive source text, use an explicit not-stated old-value marker and Adjustment for unclear direction. Explain every changed reference row and approve the corrected expected fixture before acceptance. Alternatively explicitly authorize a curated mapping contract, while correcting row 14; do not call that generic mechanical extraction.

## Implementation and comparison

CLI in patch_importer.py, storage/fetch in patch_import_io.py. See PATCH-IMPORTER.md for invocation, exit codes and limits.

272 rows: Hero 104, Item 28, System 76, Map/Mode 64. Exact full-row comparison against the New-normalized reference: 63 match, 172 reference rows not emitted verbatim, 209 source rows not in the reference. Every mismatch is present in PATCH-IMPORTER-LITERAL-AUDIT.json. Source line splitting, source wording, not-stated old values, conservative classifications and section-level labels explain those differences. No expected-output lookup is used by the runtime. Mutation tests demonstrate changed source values flow through.

Known partial result: 21 Eternal rows have explicit blessing/section labels but their image assets do not identify an owner. The importer reports each unresolved owner and exits 2 rather than claiming complete extraction. It does not use the curated CSV as authority to invent those owners.

Original-head evidence: 18 focused tests, full Python 505 tests (1 skipped), Node 425 tests. See the PR fix-round evidence for current-head results. Syntax compilation passed for both modules. Original files preserved, no live fetch attempted, no site/workflow/gate edits and no formal checks posted.

## Muse fix round 1

Prose, list headers, augment metadata and cosmetic rank-reward lists are retained in ignored context, not emitted as changes (30 rows removed). New Hero and New Items are optional; their absence appears in absent_optional_sections without forcing partial status. Other expected-section warnings are unchanged. Crawl-delay is honored between requests, including after robots. target_sources lists filename/quoted-introduction attribution for human inspection; it is not independent identity proof. Publication date still uses the first displayed date-shaped string; future layout changes need review. Rework remains an allowed output vocabulary but is not inferred from editorial descriptions. Audit freshness, classification, Map/Mode mapping, fake-fetch CLI, independent visible-text fidelity and fetch failure boundaries now have regression coverage. Eternal prose-group attribution is deliberately deferred; the current parser reports 21 unresolved owners, not a claim that the HTML could never identify them.
