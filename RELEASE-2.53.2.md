# 2.53.2 — one missing hero kit no longer fails a rank

On 11 Oct 2026 the owner asked to fix the failed collection of 10 Oct.

## The problem

The 21:00 CDT full collection on 10 Oct failed on every rank (`collector.json` on `data-updates`):

- Gold, Bronze, Silver, Platinum and Diamond each stopped with `Unknown or duplicate sequence-review ability`, with no run time recorded, so they aborted early.
- Paragon ran for 627 s and failed with omeda.city `heroes.json` (`SSL: UNEXPECTED_EOF_WHILE_READING`) and many Pred.gg HTTP 500s.

The cause, reproduced on the saved Gold, Diamond and Paragon bundles:

1. When omeda.city `heroes.json` cannot be read, a hero's kit comes only from its Statz hero page.
2. A hero with no Statz page in that rank (GRIM.exe and Wukong on Gold; Kallari, Mourn, Narbash and Scarlett on Diamond; Iggy & Scorch on Paragon in the last saved bundles), or whose page failed, then has no kit at all.
3. `enrich_bundle` validates the reviewed packet against the collected kits before the Pred.gg pass. The sequence review names GRIM.exe's Q, so the check raised and the whole rank was lost.

The 15:01 CDT Diamond failure (`'abilities'`) is the same gap: a hero with no kit and a meta-review row (the probe uses Eden) raises a `KeyError` in the same check.

What is inferred, not recorded: the omeda.city failure for Gold through Diamond. Those runs stopped before they saved errors; Paragon, which ran in the same window, recorded it, and simulating omeda.city being down reproduces the exact message. The collector's own log on the Windows PC would confirm it.

## What changes

- **omeda.city kits are kept when it cannot be read.** `previous_kit_records` rebuilds the `heroes.json` entries from the newest saved collection of the rank, in their original ability order (official audit paths use ability indexes). The source is `retained` with its original `fetched_at`, the attempt time and this collection's error. The error stays an error, so the source is retried and the collection is never called complete. omeda.city stopped updating before 1.17, so the kept text is the same text.
- **A hero still without a kit keeps its previous kit.** `keep_previous_kits` runs before the review is validated. The hero is marked `kit_kept_from_previous` with that collection's date, and a "Hero kits" warning names it. A kit collected now is never replaced, and a hero with no previous kit stays without one.
- **Retained omeda.city kits do not block an update.** The Pred.gg-primary and fresh-Statz publication paths accept `retained` for `omeda_heroes` (its date is not checked as fresh). A complete collection still needs a fresh omeda.city read.
- Pred.gg kits replace the kept kits wherever Pred.gg is collected, as before.

## Where it takes effect

The full collection runs on the Windows collector, so this takes effect once the collector is rebuilt from this release and installed. That is a separate approval. The website is unchanged.

## Files

- `predecessor_meta.py`: `previous_kit_records`, `keep_previous_kits`, the retained `omeda_heroes` source record in `build_bundle`, `collect_bundle`, `bundle_has_current_primary`, `bundle_has_fresh_statz`; `VERSION` 2.53.2.
- `sw.js`: cache `predecessor-meta-shell-v2-53-2`.
- `docs/AI-CONTEXT.md`, `README.md`.
- Tests: `tests/test_static_kept_kits.py` (new, 7 tests). Its reproduction step raises the 10 Oct error on 2.53.1's validation for GRIM.exe and Eden, then passes after the kits are kept.

## Verification

- Replays of the saved 10 Oct 18:00 CDT Gold, Diamond and Paragon bundles with omeda.city removed: each raised `Unknown or duplicate sequence-review ability` and each enriches after the fix (kept: GRIM.exe and Wukong; Kallari, Mourn, Narbash and Scarlett; Iggy & Scorch).
- Python static tests and Node tests: see the pull request.
