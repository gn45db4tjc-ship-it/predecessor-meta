# 2.36.1 — The Windows app follows the Visor's colours

Will asked for the Windows app to match the colours of his Visor desktop HUD. In the dark theme, the app now takes its surfaces from the Visor's tint and its brand colour from the Visor's accent. The accent is lightened only where WCAG AA needs it. Evidence, warning and text colours are unchanged, and the website is unaffected.

## What changes for you

- **Surfaces:** backgrounds, panels, cards and lines take the Visor tint's hue. They keep the app's own brightness, so text reads exactly as well as before.
- **Brand colour:** the Visor accent colours:
  - the selected navigation item and segmented tabs;
  - eyebrows, the rank select and build step numbers;
  - the hero header wash.
- **When the accent is lightened:** only when it would be too dark to read against the surfaces, and only as far as needed. Pale or bright accents (ice, amber, white) are used as they are. Dark ones are lifted until they pass: navy `#1B2A6B` becomes `#6C84CD` as a fill and `#8AA5F1` as text.
- **Never changed:**
  - the colours and markers of the four classes of evidence: observed ●, calculated ◇, reviewed ✦, official ▢;
  - warnings, errors and stale-data notices;
  - gold, tier badges, text, and the focus and selection outlines.
- **Following changes:** when you change the Visor's theme, the app follows within about 30 seconds, or at once when you switch back to its window. It does not flash.
- **The setting:** "Follow the Visor's colours" sits under the theme switch in the sidebar.
  - It is on by default whenever the Visor has written its colours.
  - Untick it for the app's normal look; the choice is remembered like the theme.
  - It shows which look it follows, for example "Orbit · ember".
- **Light theme:** untouched. The Visor's colours apply to the dark theme only, and the setting says so while the light theme is on.
- **Visor not installed:** if the Visor's file is missing, unreadable or malformed, the app shows its normal look, with no message and no setting. It does the same if the file is dated in the future.

## How it works

- **Source file:** the Visor replaces `%LOCALAPPDATA%\VisorHost\look.json` whenever its theme changes.
- **Validation:** the Windows app's own server (127.0.0.1 only) validates the file strictly.
  - Accepted: schema 1, the known styles and glass levels, a true/false `calm`, `#RRGGBB` colours, a short palette id and a UTC time.
  - Anything else is ignored.
- **Derivation:** the server derives only the dark theme's brand and surface tokens.
  - Surfaces take the tint's hue at the app's own brightness or darker. Lines use the same hue at their own brightness or lighter.
  - The accent becomes the brand colour. It is lightened until brand text reaches 4.5:1 and brand fills and lines reach 3:1 against every derived surface.
  - The Visor's own text, muted and warning colours are read but not used.
- **Delivery:** only pages served by the Windows app carry the Visor code and the current look, so the first paint already uses it.
  - The page then re-reads `/api/look` on focus, when it becomes visible, and every 30 seconds while visible.
  - The website, exported snapshots and the shared server never include the code.
- **Details:** `docs/DESIGN-SYSTEM.md`, section "Following the Visor".

## Verification

- **New tests:**
  - `tests/test_static_visor_look.py` covers validation of every field and malformed form, the silent fallbacks, the endpoint, and a local page that cannot be broken by the file's contents.
    - It checks WCAG AA across ten palettes: near-white (ice `#E1EBFA`), dark navy, dark violet, amber, red, violet, the app's own blue, black, white, and green on a too-light tint.
    - It checks that every semantic colour keeps at least its reviewed contrast.
    - It checks that the hosted page is unaffected.
  - `tests/visor_look.test.cjs` covers the page's allow-list: only the listed tokens, only hex values, all or nothing.
  - `tests/browser_visor_look.cjs` is Windows-only, so it is not a CI step. It runs the local app on sample files with no fetching.
- **Contrast results** (the lowest ratio against any derived surface):

  | Visor accent | Brand fill | Brand text | Brand text contrast | Brand fill contrast | Ink on the fill |
  |---|---|---|---|---|---|
  | Ice `#E1EBFA` | `#e1ebfa` | `#e1ebfa` | 9.09 | 9.09 | 13.93 |
  | Dark navy `#1B2A6B` | `#6c84cd` | `#8aa5f1` | 4.53 | 3.02 | 4.62 |
  | Dark violet `#2A0F4F` | `#917cc4` | `#b29ce7` | 4.56 | 3.05 | 4.67 |
  | Amber `#F0A020` | `#f0a020` | `#f0a020` | 5.07 | 5.07 | 7.75 |
  | Red `#E0303A` | `#f4464a` | `#ff837d` | 4.57 | 3.03 | 4.63 |
  | Violet `#8A4DFF` | `#976cff` | `#b098ff` | 4.55 | 3.06 | 4.69 |

  Primary text on the most raised surface stays at 11.05–11.15:1, against 11.05:1 before.
- **Website unaffected:** both 2.36.0 and 2.36.1 were staged from the committed seed and compared.
  - After replacing the version label and shell cache name, `index.html` and `sw.js` are byte-identical. The other site files are identical as they are.
  - The bundles and `manifest.json` differ only in `tool_version` and the staging run's own timestamps and hashes.
  - The 2.36.1 `index.html` contains no Visor code.
- **Suites on the final tree** (after #83 was merged in), run locally in Edge:
  - Python static tests: 294 pass (1 skipped). Node unit tests: 342 pass.
  - Audit: 130 of 130. Static: 52 + 46. Visor suite: 38.
- **All 11 CI browser suites** also passed locally on the same change just before #83 was merged in. Only #83's unwired Pred.gg files differ, and CI runs all eleven on the final head:

    | Suite | Result |
    |---|---|
    | Audit | 130 of 130 |
    | Offline cache | 9 |
    | Quick companion | 30 |
    | Static | 52 + 46 |
    | Design | 60, 60, 60, 29, 33 |
    | Role statistics | 30 screens |
    | Visual polish | 50 |
    | Visual redesign | 50 states |
    | App updates | 12 |
    | Product review | 6 states |
    | Review corrections | 15 |

  - The Visor suite passes 38 checks, including a real 30-second wait for the timed re-read.
  - `browser_revision2_modes.cjs` ran with a sample look active, covering the Windows app and the website at desktop and phone widths. It passes 49 checks in each of its four runs, with its export step left out (see Known issues).
- **Where the evidence comes from:**
  - Every check read sample files through the test-only `PREDECESSOR_META_VISOR_LOOK_FILE` override. None used the real `look.json`.
  - An app started from inside a Claude session sees Claude's private copy of `%LOCALAPPDATA%`, not Will's. A live check against such an instance does not prove the real Visor file is read.
  - Only the taskbar app reads Will's real file, so the first real confirmation is Will's own look after installation.
- **Writing the file:** a rename over `look.json` fails while any program has it open (tested on this PC). The app opens it with delete sharing, so the Visor never has to retry when it replaces the file with .NET's `File.Replace`. A `File.Move` writer should retry; the app's read lasts microseconds.

## Known issues (not introduced here)

- **Rank select at phone width:** in the Windows app below 700px, the Rank select in the top bar is 57px wide and shows no text. The website's phone layout shows "Gold+". Present on 2.36.0.
- **Export step in `browser_revision2_modes.cjs`:** the step that waits for the local app's Export download times out, on 2.36.0 as well. Clicking Export on a freshly opened page does download "Predecessor Meta.html" (17 MB), so the suite's step is probably stale rather than the app being broken.

## Also in this release

This release also carries PR #83's Pred.gg API groundwork: per-hero page queries in `pred_api.py` and `pred_api_queries.json`, with their tests. It is not wired in. Nothing the Windows app, the collector or the website runs imports `pred_api.py`, so it changes no behaviour, and the installer leaves both files out.

## Compatibility

App version and service-worker shell cache advance together to 2.36.1. Saved hero, favourites, selected playstyles, rank, theme and the offline data cache are unchanged. The new preference `predecessor-visor-colours` is stored only when you untick or tick the setting.

**Installation:** the new program file `visor_look.js` must be installed with the others. The installer's 2.36.1 entry names it; if it were missing, the app would simply keep its normal look.

Publication and Windows installation remain separate approvals.
