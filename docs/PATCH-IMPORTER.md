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

Summary JSON includes version/date, category counts, uncertain Adjustments, source text per emitted row, ignored narrative/promotion blocks and unparsed content. `--latest` selects the highest numeric version among canonical PatchNotes_X.Y[.Z] links on the official listing, ignoring foreign/unrecognized URLs. Dates always come from displayed page text, not local time.

Will selected official source over the editorial CSV on 10 Nov 2026. Numeric values, units and source descriptions are retained; old values absent from the source become `Not stated`, not invented baselines. New-hero/item rows use the requested None (New Hero/Item) sentinel and New. Only narrowly enumerated stat/direction pairs get Buff/Nerf; all other directions are Adjustment with reasons. Bugfix source text is kept and suffixed (Bugfix).

The fixture yields 272 rows, not the editorial CSV's 235. One source line per row replaces several editorial aggregations and reconstructed before/after descriptions. `tests/audit_patch_reference.py` produces the checked-in machine-readable full row multiset comparison: 63 exact matching rows, 172 reference rows not emitted verbatim and 209 source rows not in the reference. The original reference and permitted New-only normalization are both preserved. See PATCH-IMPORTER-RECONCILIATION.md.

Network safety: one robots request plus at most one listing and one page request, no retries or redirects; generic User-Agent; 30s request timeout; 8 MiB response ceiling. Robots failure/disallow fails closed. Tests use local fixtures or fakes exclusively. No successful live CLI fetch is claimed.

Storage: CSV/index writes are separately atomic, not a two-file transaction. A crash between writes is detected next run as an inconsistent pair and requires manual recovery. Corrupt or unindexed prior output is never silently overwritten. An identical HTML hash is a no-op and preserves file mtimes; changed HTML reports exact added/removed row multisets. Do not run concurrent writers into the same output directory.

Checks:
```text
python -B -m unittest discover -s tests -p "test_static_patch_import*.py" -v
python -B tests/audit_patch_reference.py
python -B -m unittest discover -s tests -p "test_static*.py"
node --test tests/*.test.cjs
```

Internal adversarial review found dropped list content, accepted truncation and unreported Eternal ambiguity. Those now have explicit handling and regressions. This is not a Muse review or independent verify. PR #213 is open; no merge or deployment has occurred.

## Muse fix round 1

Prose, list headers, augment metadata and cosmetic rank-reward lists are retained in ignored context, not emitted as changes (30 rows removed). New Hero and New Items are optional; their absence appears in absent_optional_sections without forcing partial status. Other expected-section warnings are unchanged. Crawl-delay is honored between requests, including after robots. target_sources lists filename/quoted-introduction attribution for human inspection; it is not independent identity proof. Publication date still uses the first displayed date-shaped string; future layout changes need review. Rework remains an allowed output vocabulary but is not inferred from editorial descriptions. Audit freshness, classification, Map/Mode mapping, fake-fetch CLI, independent visible-text fidelity and fetch failure boundaries now have regression coverage. Eternal prose-group attribution is deliberately deferred; the current parser reports 21 unresolved owners, not a claim that the HTML could never identify them.
