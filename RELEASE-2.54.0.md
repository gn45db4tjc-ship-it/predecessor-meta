# 2.54.0 — a daily trend on each hero page

On 12 Oct 2026 the owner asked for the improvements proposed in the project thread. 2.53.3 carried the three collector fixes; this release adds the fourth, a per-hero trend.

## What changes

- **The hero page shows a daily trend.** Under the hero header (desktop, phone and the companion), a small line plots the hero's Pred.gg win rate for the selected role at the last pull of each day over the past 7 days, with the first and last values, the change in percentage points, the dates and the games at each end ("Daily trend: 49.1% to 51.2% +2.10 pp").
- **It is honest about what it is.** Each Pred.gg pull counts the whole patch so far, so the points overlap; the text says "win rate so far this patch, at the last pull of each day", and the stored note says the change is not a separate sample or a measured patch effect. A point under 100 games is dropped, a row with no games is a gap rather than 0%, and the line needs two days. Other cohorts (another patch, game versions, rank or rating) never join the line.
- **Where it comes from.** `scoped_trend` in `predecessor_meta.py` reads the validated Pred.gg history snapshots the collector already keeps for the Changes view (`attach_scoped_history`) and stores `scoped_changes.trend`. The projection puts it in the guide, so the phone's first screen does not grow.

## Where it takes effect

The trend is built at collection on the Windows collector, so it appears once the collector is rebuilt from this release and installed (a separate approval) and has collected on two days. Until then the hero page is unchanged. No new source is read.

## Files

- `predecessor_meta.py`: `TREND_DAYS`, `scoped_trend`, `attach_scoped_history`; `VERSION` 2.54.0.
- `projection.py`: `('scoped_changes', 'trend')` in `GUIDE_PATHS`.
- `engine.js`: `heroTrend`.
- `ui.js` (`trendHTML`, `heroView`), `mobile.js` (`mobileHero`), `companion_simple.js`, `ui.html` (`.hero-trend`, existing tokens only).
- `sw.js`: cache `predecessor-meta-shell-v2-54-0`.
- `docs/AI-CONTEXT.md`, `README.md`.
- Tests: `tests/test_static_hero_trend.py` (new, 4 tests), `tests/hero_trend.test.cjs` (new, 2 tests).

## Verification

- `python -B -m unittest discover -s tests -p "test_static*.py"`: see the pull request.
- `node --test tests/*.test.cjs`: see the pull request.
- A preview staged from the gold seed with a synthetic trend added rendered the line on the desktop (1280 px) and phone (390 px) Adele offlane pages, and nothing on a hero without a series, with no page errors.
