# Predecessor Meta 2.27.0 — faster first load on the website (audit item 11)

The website now downloads a compact version of each rank's data first, and fetches the detailed evidence behind a hero or a Sources view only when you open it. In the phone test profile the site is ready in about half the time. Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged, and every engine result is the same as with the full data. The full bundle is still published at its usual address and checksum, and export still saves the complete publication. The Windows app uses the same page code with its complete local data, so it shows everything at once as before. No number is estimated, and no review status or review date is changed.

## What changed

- **A compact core, loaded first.** For each rank the publisher now also writes:
  - a core with everything the engine and the main screens read;
  - one shared evidence file: official definition history, publisher news, Pred.gg collection records and source copies;
  - one small evidence file per hero: source kit copies, previous abilities, the Pred.gg build overview, and the favourable and lane matchup tables.

  Each file is named by its checksum and listed in the manifest. The publisher refuses to publish these files unless they reassemble the full bundle byte for byte. If they cannot be built, the rank is published exactly as before, with its full bundle only, and the workflow log says why.
- **Evidence when you open it.**
  - A hero page, the Sources page or a definition dialog fetches its evidence, verifies its checksum and shows it. Until then the section says the evidence is loading.
  - Views that mix statistics and evidence show the statistics at once and mark only the evidence part. This covers ability cards, the kit section, reviewed descriptions and the source audits.
  - A failed download names the reason: checksum mismatch, timeout, "not saved on this device" while offline, or a file the website no longer has after an update. Reload latest data retries it.
  - Open dialogs fill in when their evidence arrives. Nothing is estimated in its place.
- **Engine results never change when evidence arrives.** A field leaves the core only when no engine code reads it, or when the engine provably cannot read it for that publication:
  - the Pred.gg Tier 3 purchase tables, while Pred.gg is not current;
  - a Pred.gg counters table that is not cohort-verified.

  A test compares every engine method for every hero and role, with and without enemies and allies, between the core and the full bundle. It runs in four Pred.gg states: current, retained, partial, and current with half the counters tables unverified.
- **Offline.**
  - The site saves the core of every rank you open, and the evidence of every hero and view you open while online.
  - Offline, saved evidence opens; evidence you never opened says it is not saved on this device.
  - Evidence that failed while the connection was down is retried when it returns.
  - The service worker still never stores data itself. Ranks saved by 2.26 (full bundles) keep working.
- **Export** still embeds the complete publication. If that cannot be downloaded (offline), the snapshot is assembled from the core and every evidence file that can be verified. A snapshot that lacks some evidence says so when opened, and marks those sections "not included when this snapshot was saved" instead of "unavailable".
- **Fixed while building this.** A rank comparison on the Data page no longer disappears when the page redraws while it downloads (found by the WebKit run).

## Measured (actual results, 19 September 2026)

Same data (Gold+, 14 September collection, Pred.gg current), served with gzip as GitHub Pages does. The phone profile is a 4× CPU slowdown on fast 3G (1.6 Mbps, 150 ms); two runs each.

| | 2.26 (full bundle) | 2.27 (core first) |
|---|---|---|
| Phone profile: ready | 16.4–16.5 s | 8.0 s |
| Data transferred at startup | 2.75 MB | 1.09 MB |
| `JSON.parse` | 207–243 ms | 85–92 ms |
| Heap after load | 54 MB | 36 MB |
| Open a hero with its evidence | 0.8–1.1 s | 1.4–1.5 s |
| Desktop: ready | 0.59–0.62 s | 0.33–0.35 s |

Core sizes across the six ranks:
- **Full bundles:** 12.3–18.4 MB.
- **Pred.gg current:** 5.1–6.8 MB (gzip 0.8–1.2 MB).
- **Pred.gg retained**, as on the live site since 19 September: 4.79–4.95 MB (gzip 0.76–0.85 MB).

`PROJECTION-DESIGN.md` has the per-rank table.

## Verification (actual results, 19 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153, Playwright WebKit 26.6)

- **Probes first.** Every new browser probe (I5–I13), the save-race check and the full-bundle checksum check were run against the code before their fix and failed there. For example, without a service worker the old code made 66 evidence and 65 manifest requests in 6 s after one missing file; it now makes one of each.
- **Engine parity.** Every engine method, for every hero and role, is identical from the core and from the full bundle for Pred.gg current, retained, partial, and current with half the counters tables unverified. `plannedKit` returns the hero record itself, so it is compared without the moved display fields.
- **Audit browser suite:** 80 of 80 verdicts match the ledger (I1–I13 are new), and the ledger of open defects is empty. The longest main-thread stall while generating five-hero alternatives was 41 ms (budget 500 ms).
- **Offline cache suite:** 10 of 10, real service worker, six-rank preview. This includes:
  - evidence saved online that opens offline;
  - a save still running when the rank changes;
  - removal of older evidence;
  - an upgrade from the real 2.23.0 worker.
- **Upgrade from 2.26.2**, a separate check with real service workers on staged 2.26.2 and 2.27.0 builds of the same data:
  - After the update, with the network down, the six ranks saved by 2.26.2 all open from their full bundles.
  - Online, each is saved again as a core and the old full bundles are removed.
  - Offline again, all six reopen from their cores with their original dates.
- **Rollback to 2.26.2**, checked the same way:
  - Offline right after the rollback, 2.26.2 says a rank is not saved on this device.
  - Once each rank is opened online it is saved again, and all six open offline.
- **Other browser suites:**
  - `browser_static` on the six-rank preview: 56 checks at 1440×900 and 49 at 390×844, in Edge and in WebKit.
  - `browser_ranks`: 30 rank/role tables and 30 phone dashboards, in Edge and in WebKit.
  - `browser_companion`: 46 checks, no page errors.
  - `browser_release_222`: 8 checks.
  - Axe (WCAG 2.1 A/AA) on 15 phone states in each theme: no violations.
- **Python:** 195 tests pass, 1 skipped where no local bundle store exists.
- **JavaScript:** 163 tests pass.
- **Clean-room source package**, unpacked into an empty folder and tested there: 98 files; 195 Python tests run, 17 skipped without the public seed; 152 JavaScript tests pass, 11 skipped without the public seed.
- **Performance:** the figures above.
- **Reviews:** four independent review rounds; every finding was fixed. Behavioural findings have probes that fail without the fix. Three narrow timing cases were checked by review only: the rule that skips a save overtaken by a newer publication, the export time limits, and the queued check after a missing file.

## Known gaps

- **5 MB target.** The audit's 5 MB target for the first download is met while Pred.gg is retained. With Pred.gg current the core is 5.1–6.8 MB. Every hero's planned build reads the six Tier 3 purchase tables, and the engine copies whole rows into its build observations, so those tables cannot move out without changing results.
- **Slow connections.** Opening a hero now waits for one small extra download (about 24 KB) before its Pred.gg evidence appears.
- **Undescribed saved core.** A saved core that no saved manifest entry describes is not re-described offline; the rank opens again after one online visit. This can happen only in a browser without Web Locks, or after an older 2.26 tab rewrote the saved manifest.
- **After a rollback to 2.26.x:**
  - ranks saved as compact cores are saved again the next time each is opened online;
  - 2.27 files stay in the browser's storage until site data is cleared.
- **Not tested on real devices.** Playwright WebKit on Windows is not Safari. Acceptance on the owner's phone, screen readers and native installs are still open.

## Rollback

- **Windows app:** quit the app, then run **Roll Back 2.27.0.bat**. It verifies the backup's checksums before restoring 2.26.2, and does not touch `data\`, `snapshots\` or `settings.json`.
- **Website:** revert the 2.27.0 merge commit on `main`; Pages redeploys 2.26.2, which loads the full bundles again. Never force-push.
