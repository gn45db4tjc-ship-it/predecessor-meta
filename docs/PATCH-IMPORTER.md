# Patch importer CLI

Run from the repository root with Python 3.11+ (standard library only):

```text
python patch_importer.py --url https://www.predecessorgame.com/news/patch-notes/PatchNotes_1.18
python patch_importer.py --latest
python patch_importer.py --fixture tests/fixtures/patch_importer/PatchNotes_1.18.html --source-url https://www.predecessorgame.com/news/patch-notes/PatchNotes_1.18 --output-dir qa/patch-import
```

Default output: `data/patches/<version>.csv` and `data/patches/index.json`.
The repository ignores data/, so imported live output is not automatically staged.
Nothing modifies the site, runs on a schedule, deploys or changes CI.

Exit statuses: 0 complete; 1 invalid input/fetch/storage error; 2 partial extraction with explicit warnings. Exit 2 writes the known rows and reports unresolved blocks/targets. Consumers must inspect status, not treat file existence as completion. The saved 1.18 fixture currently returns 2 because 21 Eternal rows do not have individual owners safely identified by the current parser. The artwork names are anonymous; adjacent prose names some owners, but this parser deliberately does not infer cross-blessing group ownership. Their actual values and blessing labels are retained without guessing owners.

Summary JSON includes version/date, category counts, uncertain Adjustments, source text per emitted row, ignored blocks with specific reasons and unparsed content. Withheld paragraphs use `prose not emitted; manual change review required`, so potentially meaningful prose can be found by reason. `--latest` selects the highest numeric version among canonical PatchNotes_X.Y[.Z] links on the official listing, ignoring foreign/unrecognized URLs. Dates always come from displayed page text, not local time.

Will selected official source over the editorial CSV on 10 Nov 2026. Numeric values, units and source descriptions are retained; old values absent from the source become `Not stated`, not invented baselines. New-hero/item rows use the requested None (New Hero/Item) sentinel and New. Only narrowly enumerated stat/direction pairs get Buff/Nerf; all other directions are Adjustment with reasons. Bugfix source text is kept and suffixed (Bugfix).

The fixture yields 286 rows (Hero 104, Item 28, System 90, Map/Mode 64), versus the editorial CSV's 235. One source line per row replaces several editorial aggregations and reconstructed before/after descriptions. `tests/audit_patch_reference.py` produces the checked-in machine-readable full row multiset comparison: 63 exact matching rows, 172 reference rows not emitted verbatim and 223 source rows not in the reference. The original reference and permitted New-only normalization are both preserved. See PATCH-IMPORTER-RECONCILIATION.md for prose coverage of reference rows.

Network safety: one robots request plus at most one listing and one page request, no retries or redirects; generic User-Agent; 30s request timeout; 8 MiB response ceiling. Robots failure/disallow fails closed. Integer Crawl-delay is honored from the previous request's completion, including robots; a directive above 60 seconds fails closed with `ImportFailure` before sleeping or requesting the listing/page. Python's robots parser does not expose fractional Crawl-delay or Request-rate. Tests use local fixtures or fakes exclusively. No successful live CLI fetch is claimed.

Storage: CSV/index writes are separately atomic, not a two-file transaction. A crash between writes is detected next run as an inconsistent pair and requires manual recovery. Corrupt or unindexed prior output is never silently overwritten. Identical HTML and serialized CSV hashes are a no-op and preserve file mtimes. A parser correction that changes rows updates the CSV/index even when the source bytes are unchanged, so existing imports gain restored prose. Changed output reports exact added/removed row multisets. Do not run concurrent writers into the same output directory.

Checks:
```text
python -B -m unittest discover -s tests -p "test_static_patch_import*.py" -v
python -B tests/audit_patch_reference.py
python -B -m unittest discover -s tests -p "test_static*.py"
node --test tests/*.test.cjs
```

Round 2 builder validation: 39 focused tests passed; full Python ran 526 (525 passed, 1 skipped for absent local publication); Node passed 425. Python 3.14.10 and Node 26.13.0, offline fixtures/fakes; the existing loopback HTTP test required local socket access outside the sandbox. An existing round-1 output directory upgraded to 286 rows with 14 additions and no removals, then reran without writes. Fresh external review and Claude's independent PC verification remain required.

Internal adversarial review found dropped list content, accepted truncation and unreported Eternal ambiguity. Those now have explicit handling and regressions. This is not a Muse review or independent verify. PR #213 is open; no merge or deployment has occurred.

## Prose policy and review fixes (rounds 1 and 2)

Will confirmed on 10 Nov 2026 that ranked/store changes stated only in prose are in scope. Paragraphs in Ranked News, Variant VFX, Hero Voice Comms and The Void & Daily Deals Changes are emitted by default with their exact wording, `Not stated` old values and Adjustment classification. Their Target is the system section; Ability_or_Stat retains the subsection/field when present. This includes the discretionary Ranked introduction, split end date, rewards summary, Voice Comms description, Void rollout timing and AFK overview. The summary and detailed rows can overlap; they are source statements, not disjoint numeric events.

Named exclusions: the two paragraphs under **Daybreak** remain in `ignored` as `future map teaser, not a current-patch change` because the map is announced for next year. This paragraph-only exclusion needs reassessment when Daybreak ships; structured lines under the heading remain eligible. The five per-rank **Royal Wukong** lines remain in `ignored` as `cosmetic rank reward list (Royal Wukong)`; the rewards summary stays in the rows. The filter recognizes those named rank/reward entries, not every line under Rank Split Reset. Colon-terminated list headers (including the [Bugfix] group header) and Relevant Ability/Type metadata stay ignored with their own reasons. No subsection-wide Rank Split Reset exclusion remains. Other withheld prose is explicitly marked for manual change review. The fixture has 77 ignored entries and 150 uncertain Adjustments.

New Hero and New Items are optional; their absence appears in absent_optional_sections without forcing partial status. Other expected-section warnings are unchanged. target_sources lists filename/quoted-introduction attribution for human inspection; it is not independent identity proof. Publication date still uses the first displayed date-shaped string; future layout changes need review. Rework remains an allowed output vocabulary but is not inferred from editorial descriptions. Audit freshness, classification, Map/Mode mapping, fake-fetch CLI, independent visible-text fidelity and fetch failure boundaries have regression coverage. Eternal prose-group attribution is deliberately deferred; the current parser reports 21 unresolved owners, not a claim that the HTML could never identify them. Round 2 adds 14 system paragraphs to round 1's output and caps Crawl-delay at 60 seconds.
