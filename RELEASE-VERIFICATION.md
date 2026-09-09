# Design Revision 2 — Codex release verification

Verified 8 September 2026. Application runtime remains **2.21.0**; this is **design revision 2** on hosting revision 3.

## Input and scope

Only Claude's `Predecessor Meta Tool - Design Revision 2 Source.zip` was used as the incoming source. SHA-256: `89a1163cc0f70f75a89135d6ea1867d1ea57d84f810e64cefb3dcd20938d1a76`. Every archived manifest hash was checked before safe extraction. No other Claude source package or design work was merged.

The engine, Python ingestion, authored guidance, shared server, updater, and publishing workflow match the existing baseline. Builds and Live game remain present. The local install changes `ui.html`, `ui.js`, and its generated standalone HTML. Website integration additionally changes the rank and static presentation adapters, tests, and release documentation.

Codex retained the complete phone pass and opt-in light theme. The only additional app change labels a retained patch **Last verified patch** when the latest official check failed. Two vacuous keyboard assertions in the supplied design suite were replaced with actual focus checks; they pass.

## Passed checks

| Check | Result |
|---|---|
| Python publication/updater suite | 43 passed; also run from the clean source archive |
| Edge and WebKit static acceptance | 51 recorded checks per viewport at 1440×900 and 390×844, including seven legacy suites with 671 assertions per viewport |
| Rank acceptance, Edge and WebKit | Each engine: 60 role/rank tables, source-exact figures, all six brackets, Diamond export |
| Design acceptance, Edge | 71 checks at each of 1920×1080, 2560×1440, and 1536×864 at 1.25 scaling; 33 phone checks; 35 light-theme checks |
| Additional mode checks, each engine | 318 checks across local, static, and current-failure views, at desktop and phone sizes |
| Additional features | Both themes on all nine routes; keyboard toggle; item dialogs; picks and enemy-role restoration; standalone exports with unchanged observations; named current failures and withheld unverified advice |
| Installed Windows app | All nine routes and the theme toggle exercised; saved settings, allies, enemies, and bans preserved |
| Installation integrity | Four protected runtime/data files and settings unchanged; 421 saved-data/snapshot files hash-verified unchanged through installation |

The dated fixture shell became interactive in roughly 0.3 seconds in the static browser tests. This is cached rendering, not a new data-collection timing. The actual installed browser timing is saved in the local verification folder.

## Test conditions and limits

The latest local updater check at 20:02 on 8 September failed to retrieve an official patch article. The last verified official check was at 14:02. Pred.gg's latest complete collection attempt also failed to find structured page responses. Previously successful public bundles were retained with their original dates.

The legacy suite requires active reviewed advice. It was run against unchanged public bundles with the actual earlier verified patch-check record replayed **only in an isolated preview**. A separate preview used the actual failed current check; both engines verified that it remains labelled and does not activate unverified plans. No publication state or stored bundle was modified to make tests pass.

The ordinary local server was tested with automatic fetching disabled in an isolated data directory, then the actual installation was checked without changing its data. Normal launch restores its existing refresh behavior.

WebKit on Windows is compatibility evidence, not a physical iPhone/Safari test. Windows 125% scaling was emulated, not changed in the OS. Google Fonts are optional; the local app's existing security policy keeps system-font fallbacks. Remote game art may fail independently; names and numbers remain readable. Shared-server mode was not newly browser-tested in this pass; its Python implementation is unchanged.

## Repeating checks

Run `python -B -m unittest discover -s tests -p "test_static*.py"` from the source folder. With dated public bundles rendered using `static_publish.render_site`, set `PREVIEW_URL` to the loopback preview and `PLAYWRIGHT_PATH` to the installed Playwright module. Run `tests/browser_static.cjs`, `tests/browser_ranks.cjs`, and `tests/browser_design.cjs`. Repeat static and rank tests with `BROWSER_ENGINE=webkit` and the appropriate `PLAYWRIGHT_BROWSERS_PATH`.

The additional `tests/browser_revision2_modes.cjs` expects three explicitly prepared loopback previews: `LOCAL_URL` (default port 12933, a local `--no-fetch --data-dir` test instance), `PREVIEW_URL` (default port 12932 `/project/`, dated verified state), and `FAILURE_URL` (port 12932 `/current/`, the real failed official check). Use public test data only: this test intentionally saves illustrative picks in its isolated local instance. Run it once in Edge and once in WebKit. Do not point this mutation test at the installed app.

`BROWSER-VERIFICATION.json` contains the fresh browser receipts. The source archive includes code/tests/receipts only, without bundles, saved drafts, settings, cache, or publishing credentials.

## Installation and rollback

Local rollback: close the app and double-click **Roll Back Design Revision 2.bat** in the installed Documents folder. Its backup manifest verifies the old presentation and export before restoration. The existing full-version rollback was left intact.

The website is published through the existing GitHub Actions workflow. Its commit and Pages deployment are the release record. UI rollback can restore only the design files from `ad044213d04163ca19ebb4b4f1df59b93b8d2942` and republish; keep the data-updates branch and current bundles. Do not force-reset the repository or copy credentials into an archive.

The original Claude ZIP remains unchanged. The integrated, independently tested archive is named **Predecessor Meta Tool - Design Revision 2 Verified Source.zip**.
