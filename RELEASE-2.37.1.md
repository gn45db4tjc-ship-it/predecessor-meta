# 2.37.1 — A faster phone app

Will asked for the app to be "as crisp and snappy as possible". 2.37.0 removed the clutter; this release removes waiting. Nothing about what is shown, or how it is labelled, changes.

## What changes for you

- **Return visits:**
  - A rank's data files are named after the checksum of their bytes, so a saved copy that still matches its name is the file itself.
  - The app now opens those files straight from the phone instead of downloading them again. The core file alone is 924 KB.
  - The page still checks every file's checksum as before. The published status file and the page itself still come from the network first, so a new publication or app release is noticed exactly as before.
- **Taps:** looking up a hero's reviewed build no longer re-reads every loadout definition each time. That lookup runs for every Meta row and several times for every adapted build.
- **Sharper icons:** item, loadout and ability icons from Pred.gg load at 128px on high-density screens (most phones) and at 64px elsewhere. If a 128px icon is unavailable, the 64px one (then the other sources) is used as before.

## Measured

Node, live Gold+ data of 26 Sep 2026, desktop CPU; a phone is roughly 4× slower:

| Work | 2.37.0 | 2.37.1 |
|---|---|---|
| Reviewed build for every hero and role (one Meta list) | 17.4 ms | 2.8 ms |
| Team alternates for one build (8 adapted builds) | 11.2 ms | 6.7 ms |

## How it works

- **`sw.js`, `savedImmutable`:** for a URL matching a rank bundle or evidence file (`<rank>-<sha256>.json`, `<rank>-core|shared|hero-*-<sha256>.json`), the worker:
  1. reads the saved copy from the data cache;
  2. hashes it;
  3. serves it, labelled `X-Predecessor-Cache: saved`, if the hash equals the name.
  - A copy that does not match is deleted and the network is asked, as before.
  - The worker still never writes network responses into the data cache; only the page saves verified data.
- **`engine.js`:** perks are indexed by normalised name once per engine, like items already were. The first perk with a name wins, as the linear search it replaces did. The index holds the bundle's own objects, so an edited definition is read live.
- **`ui.js`, `sharpIcon`:** adds a `srcset` for `pred.gg/assets/*_64.webp` icons. The image error handler drops the `srcset` first, so a missing 128px file falls back to 64px before the listed fallbacks.

## Considered and not done

- **An answer cache for build reviews and team alternates:** refused. An engine must never reuse a review after its bundle is edited, and `tests/build_patch_review.test.cjs` holds that rule.
- **Moving the history-state read in `recordNavigation`:** not done. Back/Forward restoration relies on that state, and the saving is a single layout.
- **Deferred to a release with its own review:**
  - moving reviewed guidance and hero text out of the 924 KB core file;
  - splitting the 574 KB shared evidence file.

## Verification

- **New tests:**
  - A saved checksum-named file is served without asking the network.
  - A saved copy whose bytes no longer match its name is deleted and fetched again.
  - A perk definition edited in the same engine is read live.
- **Updated tests:** three service-worker tests now expect the `saved` label for saved checksum-named files.
- **Other tests:** Python static tests, Node tests and the 11 CI browser suites.
