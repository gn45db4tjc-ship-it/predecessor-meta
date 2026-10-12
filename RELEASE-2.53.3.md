# 2.53.3 — ride out a brief Pred.gg or omeda.city outage

On 12 Oct 2026 the owner asked for the improvements proposed in the project thread, starting with these three collector fixes.

## The problem

The Windows collector's run at 20:03 UTC on 11 Oct (`collector.json` and `gold.json` on `data-updates`, watchdog issues #137 and #138):

1. **Pred.gg was lost in every rank until the next day.** The first Pred.gg request (`https://pred.gg/heroes`) failed once with `SSL: UNEXPECTED_EOF_WHILE_READING`. `PredPages` tried each page once (`http_get`, `retries=0`). Pred.gg is optional, so `required_source_failure` never counted it, no same-day retry was scheduled, and the next attempt was the next day's 17:23 UTC run.
2. **Gold+ lost every Pred.gg row while the other ranks kept theirs.** Gold+'s last good collection (10 Oct 23:03 UTC) was `partial`: its cohort-wide page failed while all five roles were read (98 rows). `retain_pred_partition` kept a previous cohort only when it was `ok` or `retained`, so Gold+ published no Pred.gg statistics. Bronze+ to Paragon+ had `ok` cohorts and kept them.
3. **Community guides were empty in every rank.** omeda.city's `builds.json` answered HTTP 500 once, tried once. The endpoint answered normally again afterwards (20 records).

## What changes

- **A dropped Pred.gg page is tried again.** `PredPages.fetch_retrying` waits 5 s, then 15 s, after a network error or HTTP 5xx. An access answer (401, 403, 429) or any other 4xx is never retried, and a 403 still stops Pred.gg access after one request. After 3 pages in a row fail even with retries, the rest of the run tries each page once, so an outage does not slow every page.
- **The Windows collector retries Pred.gg the same day.** After a full collection with a retryable Pred.gg error, it schedules a `Pred.gg retry` collection on its next check at least 2.5 hours later, up to 4 times (`pred_retry_hours`, `pred_retry_limit` in `free_hosting.json`). An access answer, a pause or a stop schedules nothing. The cloud never retries Pred.gg, because it cannot read it. A Pred.gg retry does not reset the required-source retry count.
- **Gold+ keeps a partial cohort.** `retain_pred_partition` also retains a previous cohort that was `partial`, as `retained`, with its original dates. Its failed roles stay failed, and the error names them ("The retained collection was itself partial (all failed)").
- **Community guides are retried and kept.** `builds.json` is retried twice on a 5xx or network error. If it still fails, the previous collection's guides for the same live patch, for heroes and roles still on the roster, are kept with their original fetch date (`previous_community_builds`, source `retained`, each guide `kept_from_previous`), and the warning says so.
- The watchdog's Pred.gg issue names the same-day retries.

The engine's 30-hour window for retained Pred.gg statistics is unchanged, so kept rows still stop counting as current after 30 hours.

## Where it takes effect

All of this runs on the Windows collector, so it takes effect once the collector is rebuilt from this release and installed. That is a separate approval. The website shows no new wording beyond the retained labels it already uses.

## Files

- `predecessor_meta.py`: `PRED_RETRY_WAITS`, `PRED_RETRY_STOP`, `PredPages.fetch_retrying`, `retain_pred_partition`, `previous_community_builds`, `attach_community_builds`, `collect_bundle`; `VERSION` 2.53.3.
- `static_publish.py`: `PRED_RETRY`, `pred_retryable`, `collection_reason`, `state['pred_retry']` in `run`.
- `free_hosting.json`: `pred_retry_hours`, `pred_retry_limit`.
- `watchdog.py`: Pred.gg next-attempt wording.
- `sw.js`: cache `predecessor-meta-shell-v2-53-3`.
- `docs/AI-CONTEXT.md`, `README.md`.
- Tests: `tests/test_static_pred_retries.py` (new, 15 tests). All 15 fail or error on 2.53.2 and pass on 2.53.3.

## Verification

- `python -B -m unittest discover -s tests -p "test_static*.py"`: see the pull request.
- `node --test tests/*.test.cjs`: see the pull request.
