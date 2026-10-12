# 2.54.0 — a daily trend on each hero page

On 12 Oct 2026 the owner asked for the improvements proposed in the project thread. 2.53.3 carried the three collector fixes; this release adds the fourth, a per-hero trend.

## What changes

- **The hero page shows a daily trend.** Under the hero header (desktop, phone and the companion), a small line plots the hero's Pred.gg win rate for the selected role at one pull a day over the past 7 days (going back from the newest pull, each point is the latest pull at least 24 hours before the next, so no two points share a date in any time zone), with the first and last values, the change in percentage points, the dates and the games at each end ("Daily trend: 49.1% to 51.2% +2.10 pp").
- **It is honest about what it is.** Each Pred.gg pull counts the whole patch so far, so the points overlap; the text says "win rate so far this patch, one pull a day", and the stored note says the change is not a separate sample or a measured patch effect. A point under 100 games is dropped, a row with no games is a gap rather than 0%, and the line needs two days. Other cohorts (another patch, game versions, rank or rating) never join the line.
- **Where it comes from.** `scoped_trend` in `predecessor_meta.py` reads the validated Pred.gg history snapshots the collector already keeps for the Changes view (`attach_scoped_history`) and stores `scoped_changes.trend`. The projection puts it in the guide, so the phone's first screen does not grow.

## Review follow-ups to 2.53.3

The Codex review of the pull request found five gaps in the 2.53.3 changes and the trend, fixed here:

- **An access stop also stops a waiting retry.** Pred.gg pages are read in parallel. If one page got 403 or 429 while another was waiting to retry, the waiting page could still send its retry. `fetch_retrying` now checks the stop after every wait, so no request goes out once access has stopped.
- **Only a transient failure schedules a same-day Pred.gg retry.** `pred_retryable` now needs a network or HTTP 5xx error (`PRED_TRANSIENT`) instead of accepting any error that is not an access answer, so a validation failure such as a roster mismatch no longer runs four extra collections.
- **The retry count is saved before collecting.** A crash during a Pred.gg retry could leave the count unchanged and repeat the same numbered retry indefinitely. The count is now saved with the existing checkpoint before any slow work.
- **Kept community guides come from the newest bundle that has them** (`previous_guides_bundle`), not the bundle chosen for Pred.gg definitions, which can be older.
- **A trend point whose Pred.gg hero id differs is a gap**, as the Changes view already treats it.
- **Trend points are at least 24 hours apart.** The first version took the last pull of each UTC day, so a pull just after midnight UTC and the one just before it could both be points and show the same local date at both ends. Points are now picked going back from the newest pull, each at least 24 hours before the next.

## Where it takes effect

The trend is built at collection on the Windows collector, so it appears once the collector is rebuilt from this release and installed (a separate approval) and has collected on two days. Until then the hero page is unchanged. No new source is read.

## Files

- `predecessor_meta.py`: `TREND_DAYS`, `scoped_trend`, `attach_scoped_history`; `fetch_retrying`, `previous_guides_bundle`, `saved_bundle_preferring`, `collect_bundle` (review follow-ups); `VERSION` 2.54.0.
- `static_publish.py`: `PRED_TRANSIENT`, `pred_retryable`, the pre-collection checkpoint in `run` (review follow-ups).
- `projection.py`: `('scoped_changes', 'trend')` in `GUIDE_PATHS`.
- `engine.js`: `heroTrend`.
- `ui.js` (`trendHTML`, `heroView`), `mobile.js` (`mobileHero`), `companion_simple.js`, `ui.html` (`.hero-trend`, existing tokens only).
- `sw.js`: cache `predecessor-meta-shell-v2-54-0`.
- `docs/AI-CONTEXT.md`, `README.md`.
- Tests: `tests/test_static_hero_trend.py` (new, 5 tests), `tests/hero_trend.test.cjs` (new, 2 tests), `tests/test_static_pred_retries.py` (4 review follow-ups added; with the trend id test, all 5 fail on the first 2.54.0 commit).

## Verification

- `python -B -m unittest discover -s tests -p "test_static*.py"`: see the pull request.
- `node --test tests/*.test.cjs`: see the pull request.
- A preview staged from the gold seed with a synthetic trend added rendered the line on the desktop (1280 px) and phone (390 px) Adele offlane pages, and nothing on a hero without a series, with no page errors.
