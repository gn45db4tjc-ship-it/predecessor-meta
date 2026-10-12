# 2.54.1 — keep the official patch check working when an older article fails

On 12 Oct 2026 the owner approved fixing the collector's official patch check (typed in the PC session).

## The problem

The Windows collector 2.54.0's check at 08:03 UTC on 12 Oct failed with:

`HTTP 404 for https://www.predecessorgame.com/en-US/news/patch-notes/Patch_Notes_1.16.4`

The official index lists 1.17.2 (announced for 13 Oct), 1.17 (live since 22 Sep) and 1.16.4. `fetch_official` reads them newest first and stops once it has the live article and one older released article to compare with. 1.17.2 was announced and 1.17 was confirmed live, so 1.16.4 was fetched only as that comparison. Its single failed request raised out of the loop, the whole check failed, and the collector could not confirm 1.17.

The official site did not move its patch notes. The index still links `/news/patch-notes/<article>`, which the collector reads as `/en-US/news/patch-notes/<article>` as before, and the 1.16.4 page loads normally now. The cloud publisher's check at 08:07 UTC loaded the same three articles and verified 1.17 (live `manifest.json` `patch_check`). The 404 was a brief failure of one page, but one failed comparison page should not cost the whole check.

## What changes

- **An older comparison article keeps its last verified copy.** When an article older than the confirmed live article fails to load (a 4xx other than 403/429, a 5xx, or a network error), `previous_official_article` looks in the saved bundles (`latest_bundle.json`, `last_successful_*`, `last_primary_*`, `last_available_*`) for the newest copy with the same URL and version, status `live`, and blocks that still match its fingerprint. That copy is used with its original `fetched_at`, marked `kept_from_previous` with the `retrieval_error`, and listed in `official.kept_articles`.
- **It is named, not hidden.** The bundle carries a warning, "Official patch notes (older article)", naming the version, the error and the copy's date. The desktop Sources view's "Recent article checks" line says "last verified copy, fetched <date>".
- **The patch signature does not change.** The kept copy has the same fingerprint, so `live_signature` and the engine's `officialSignature` stay the same and a kept copy does not start a patch-day collection or a guidance review.

Unchanged:

- The current (newest live) article is always fetched live. If it fails, the check fails.
- An article newer than the live one (an announcement) is never kept.
- An access answer (HTTP 403 or 429, `SourceBlocked`) still stops the check at once.
- Without a matching saved copy, the check fails as before.
- No request is retried, and requests use the same plainly identified headers as before.

## Where it takes effect

The patch check runs on the Windows collector and on the cloud publisher. The cloud picks it up when this release is merged to `main`. The Windows collector picks it up once it is rebuilt from this release and installed, which is a separate approval.

## Files

- `predecessor_meta.py`: `previous_official_article`, `fetch_official`, `enrich_bundle`; `VERSION` 2.54.1.
- `ui.js`: the kept copy's date in "Recent article checks".
- `sw.js`: cache `predecessor-meta-shell-v2-54-1`.
- `docs/AI-CONTEXT.md`, `README.md`.
- Tests: `tests/test_static_official_preceding.py` (new, 8 tests). The 3 tests of the new behaviour fail on 2.54.0 with the same `HTTP 404` error; the 5 guard tests pass on both.

## Verification

- `python -B -m unittest discover -s tests -p "test_static*.py"`: see the pull request.
- `node --test tests/*.test.cjs`: see the pull request.
