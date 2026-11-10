# Patch importer input reconciliation (PRED-M2 candidate)

Status: CLI implemented, source-authoritative extraction; 21 unresolved Eternal owner labels remain reported, never guessed. PR #213 / Issue #212. Round 2 starts from f6b1a5a and addresses Claude's N1-N3 after Will confirmed prose-only ranked/store changes are in scope. Fresh review and Claude's independent PC verification remain required.
Base: fda1ae265c720fcd26e5e136bbdbcb78776eb408. No PRED-M1 files changed.

## Verified inputs

Provided locally by Will on 10 Nov 2026; no network fetch was attempted after the earlier site-policy refusal.

- Official HTML SHA-256: ec44ca7c898a505bddca1bc4b9a1a9562b88d1ee8143c47f0cd46f18d255e499
- robots.txt SHA-256: d5f35244f130bb2e0ca6c36bd27b6e3d5359f626bd1c589b6ed799a5c23012f7
- Original CSV SHA-256: d4857fab0539081aa0a1467de11e2210f8708a5414f748504bcb4d307e9f6b4b
- Brief SHA-256: 868e9ad884aeeea9f5b9b27bf67a617c5e8f9511eeb3cf3b80be141564c23930

HTML and robots hashes match the provided fetch log. CSV/brief hashes were computed locally; no separate checksum manifest was supplied to this builder for those two files. Source date shown: Nov 3, 2026. CSV: 235 data rows (Hero 101, Item 22, System 54, Map/Mode 58).

Original CSV preserved unchanged. reference-normalized.csv changes only Change_Type to New for 31 rows whose Old_Value starts with None (New. Its SHA-256 is c5d251e1cfce397bb9aa2ced818d6e899c34f1418c50c628431278529a363f77 (the preserved file bytes, matching SOURCE-MANIFEST.json).

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

286 rows: Hero 104, Item 28, System 90, Map/Mode 64. Exact full-row comparison against the New-normalized reference: 63 match, 172 reference rows not emitted verbatim, 223 source rows not in the reference. Every mismatch is present in PATCH-IMPORTER-LITERAL-AUDIT.json. Source line splitting, source wording, not-stated old values, conservative classifications and section-level labels explain those differences. No expected-output lookup is used by the runtime. Mutation tests demonstrate changed source values flow through.

Known partial result: 21 Eternal rows have explicit blessing/section labels but their image assets do not identify an owner. The importer reports each unresolved owner and exits 2 rather than claiming complete extraction. It does not use the curated CSV as authority to invent those owners.

Round 2 offline builder evidence (Python 3.14.10, Node 26.13.0): 39 focused tests passed; full Python collected 526, passed 525 and skipped 1 (no locally stored publication in this clean checkout); Node passed 425 with no skips or failures. The first sandboxed Python run hit WinError 10013 in the existing Visor loopback endpoint test; the final full run with local socket access passed. Syntax compilation and diff checks passed. A migration probe upgraded existing round-1 output to the current rows with 14 additions and no removals. Original fixtures preserved, no live patch-site fetch attempted, no site/workflow/gate edits and no formal checks posted. These are builder checks, not Claude's independent verification.

## Prose coverage restored in round 2

Will's scope ruling was `WILL OK | PRED-M2 | via Claude | "yes"` (10 Nov 2026, 06:52Z), answering whether ranked/store changes given only as prose belong in the data file. Round 2 adds 14 verbatim system paragraphs. This restores the eight required changes and also includes the discretionary Ranked introduction, split end date, rewards summary, Voice Comms description, Void rollout timing and AFK overview. All are Adjustment rows with `Not stated` old values. Prose Targets name the system section; Ability_or_Stat preserves its subsection/field. The prose policy is the default for these sections, not a fixture/reference lookup.

Coverage below concerns the reference's stated new behavior, not its inferred old values or editorial Change_Type. Row numbers exclude headers; output numbers refer to the current 286-row fixture output. Exact-match counts cannot measure this semantic coverage.

| Reference row / Target / Ability_or_Stat | Coverage by prose rows, plus structured details |
|---|---|
| 159 / Ranked / Split 5 Reset & Placements | Output 114-116 preserve the split end, reward summary (15 wins) and full placements paragraph (5 matches; 10 for new/returning players). |
| 160 / Ranked / Master Tier Addition | Output 117 states Master sits between Diamond I and Paragon; 118-120 supply promotion, uncapped VP and +11 / -11. |
| 161 / Ranked / Paragon Top 100 Rework | Output 121 preserves the full paragraph with the 100-player cap; 122-125 supply eligibility, refresh and demotion details. |
| 162 / Ranked / Master & Paragon VP Decay | Output 126 preserves the full decay introduction; 127-130 supply banked days, time and VP amounts. |
| 163 / Ranked / Teammate AFK VP Loss Mitigation | Output 131-132 preserve the AFK overview and at least 25% less VP sentence; 133-134 supply percentages and the example. |
| 164 / Ranked / AFK Demotion Penalty Application | Output 131 introduces the stronger demotion effect; 135 states application after demotion. The reference's old-value claim is not invented. |
| 165 / Store / The Void & Daily Deals | Output 41 preserves the full personal-sale paragraph (5 skins, up to 70%); 48 restores Daily Deals removal and four featured items. Output 42-47 supply selection, discount range, duration, eligibility and rollout timing. |
| 166 / Store / Variant Coloured VFX | Output 36 preserves the full paragraph, including the four named variants and 200 premium. |
| 167 / Audio / Hero Voice Comms | Output 37 restores the description; 38-40 retain the supported Hero list and pack behavior. |

Both Daybreak paragraphs remain visible in `ignored` as the named future-map teaser exclusion; the map is announced for next year, not this patch. Only paragraphs under that named heading are excluded, so a structured change there would still be eligible. The five named Royal Wukong per-rank cosmetic reward entries also stay ignored; the summary sentence is included. These named exceptions and their reasons are documented in PATCH-IMPORTER.md. List headers ending in a colon, the [Bugfix] group header and Relevant Ability/Type metadata remain ignored. Nothing skips Rank Split Reset by name. Other withheld paragraphs now have the distinct reason `prose not emitted; manual change review required`, replacing the inaccurate narrative-context label. There are 77 ignored entries and 150 uncertain Adjustments.

## Other review fixes and remaining limits

N2 restores the brief hash above, rechecked against Will's local brief. N3 rejects robots Crawl-delay above 60 seconds before sleeping or fetching content; delays up to 60 seconds are honored, including after robots. Fractional Crawl-delay and Request-rate remain limitations of the current robots handling.

Internal builder QA also reproduced an upgrade issue: the source-hash-only no-op retained an existing incomplete CSV after the parser changed. The no-op now requires the serialized CSV hash to match too. Reimporting unchanged source with corrected rows updates the CSV/index and reports the row diff; rerunning identical source and output still preserves file mtimes. Source metadata mismatches and corrupt prior output continue to fail closed.

Round 1's F2-F6 fixes remain: New Hero and New Items are optional and reported via absent_optional_sections; other expected-section warnings are unchanged. target_sources lists filename/quoted-introduction attribution for inspection, not independent identity proof. The first displayed date-shaped string remains a future-layout risk. Rework is not inferred from editorial descriptions. Audit freshness, classification, Map/Mode mapping, fake-fetch CLI, independent visible-text fidelity and fetch boundaries have regression coverage. Eternal prose-group attribution is deferred: the same 21 unresolved-owner records and exit 2 remain, not a claim that the HTML could never identify them.
