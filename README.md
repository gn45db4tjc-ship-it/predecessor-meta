# Predecessor Meta — 2.25.0

2.25.0 completes the audit repairs: a fresh collection publishes even when a few hero pages fail (with the gaps named), saved offline ranks survive every release and only verified data is stored, five-hero composition search no longer freezes the page, the strategy review packet carries the official changes and is queued in the cloud for human review, and each published rank records who collected it. See [RELEASE-2.25.0.md](RELEASE-2.25.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.25.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.25.0 merge commit on `main`.

## Previous release: 2.24.0

2.24.0 is a reliability release: composition results always match the current draft, evidence age is described once and redrawn when it changes, and every publication path validates rows the same way. See [RELEASE-2.24.0.md](RELEASE-2.24.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.24.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.24.0 merge commit on `main`.

## Previous release: 2.23.0

The mobile Meta dashboard, Build Coach, and refresh-health changes are described in [RELEASE-2.23.0.md](RELEASE-2.23.0.md). Open the public website and add it to your home screen. The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.23.0.bat**. All existing data and settings are retained.

## Historical release notes

# Predecessor Meta — 2.21.8

The shared site is now installable as an app. Open **[Predecessor Meta](https://gn45db4tjc-ship-it.github.io/predecessor-meta/)** and choose **Install app**. Edge, Chrome and supported Android browsers use their native install prompt; on iPhone or iPad, Safari shows the **Share → Add to Home Screen** steps. The installed icon opens in its own window and uses the same free daily cloud updates. Anyone can use the public link without Python, a GitHub account or an installer.

The app also keeps the last successfully loaded bracket on that device for offline reopening. It preserves the bundle's original dates and resumes normal cloud checks when the device reconnects. See [the 2.21.8 release report](RELEASE-2.21.8.md).

## Previous release: 2.21.7

The September 14 strategy review covers all 93 setups, with 12 changed, 74 retained and 7 experimental roles still unresolved for broad use. Builds now shows each review result and separate dated bracket references. Six editorial tier judgments, jungle openings and several execution/counterplay explanations were updated. A real GitHub runner refreshed Statz and Omeda across all six brackets; optional Pred.gg retained its original records when unavailable. See [the release report](RELEASE-2.21.7.md) and the full `STRATEGY-REVIEW-2026-09-14.json` ledger. September 20 remains the next weekly strategy review.

## Previous release: 2.21.6

Pred.gg is now an optional public-page source. No API access or account is needed. When its pages expose structured data, the collector validates the patch, ranks, roles and numbers before using them. When unavailable, other sources continue and retained records keep their dates. HTTP 401/403/429 or an embedded denial stops further Pred.gg requests and persists that stop across launches; Refresh Data cannot bypass it. A page without embedded data can be checked on the next daily collection.

Data updates remain daily in the cloud, with official patch checks every three hours. Strategy reviews run weekly with priority for live patch/hotfix changes through the separately configured Codex review task; that task requires an available computer/Codex session. Source data refreshes do not automatically rewrite authored advice. See RELEASE-2.21.6.md.

## Previous release: 2.21.5

There are now 93 reviewed hero/role builds, covering every role sampled in the six September 14 brackets. Seven added roles are labelled experimental and require deliberate selection. Changed supporting mechanics withdraw the new plans from current advice. Daily cloud collection, original source dates and Design Revision 2 remain intact. See RELEASE-2.21.5.md for checks and remaining freshness limits.

## Previous release: 2.21.4 — verification-status repair

Failed or pending official verification leaves saved plans readable but disables current build, strategy and comparison claims. Successful verification restores them. Fresh observed builds remain available when only written guidance needs review. The daily cloud schedule, source dates, saved drafts and themes are preserved. See RELEASE-2.21.4.md.

## Previous release: 2.21.3 (14 September 2026)

The automatic meta view and recommendation role statistics now use an available, patch-compatible source. While Pred.gg is retained, they use the newly collected Statz dataset and explicitly name its broader, unconfirmed match window and game-mode coverage. Pred.gg remains inspectable as dated evidence. Old Pred.gg counters cannot rank current draft suggestions, and Live game prefers available same-role observations over retained ones. A Statz rate cannot silently reaffirm a tier reviewed against Pred.gg. Daily free cloud collection from 2.21.2 continues. See `RELEASE-2.21.3.md`.

## Previous release: 2.21.2 (14 September 2026)

Available sources now refresh daily in GitHub for all six brackets, even when your PC is off. Only Pred.gg is paused pending authorized access. Its old records remain explicitly dated; they are not called fresh. The daily target is 17:23 UTC, with official patch/hotfix checks every three hours. Calculated rankings and suggestions use the published observations. Written build plans still need a separate strategic review; data collection does not author new advice. See `RELEASE-2.21.2.md`.


## Previous release: 2.21.1 (14 September 2026)

An unavailable Pred.gg collection no longer discards successful Statz/Omeda downloads. The app and website can publish a validated partial update, with each source's original date and an explicit warning. The last complete success remains in a separate file. Older Pred.gg records can be reused only for the identical bracket and unchanged verified official patch content. Retained samples cannot silently reaffirm an authored tier or add current item-fit points. No observed rates are adjusted.

Builds, Live game, all six rank brackets, phone layouts and both themes remain. This release does not provide authorized Pred.gg API access, change hosting costs, or make Windows collection independent of the PC. Source freshness and statistical match-window coverage are different facts. See `RELEASE-2.21.1.md` for verification and limits.

## Previous design revisions 1 and 2

The interface was redesigned on top of 2.21.0 + hosting revision 3 after a six-critic review: a compact top bar with a global hero finder, a single status strip, a grouped rail, Meta with the table directly under the role tabs and the reviewed pool beside it, hero pages with tabs under the header and one headline figure per partner card, build plans that show six positions plus augment, Eternal, both blessings and crest without opening details, compact catalogue rows, a narrow-screen pass with an always-visible route row, an opt-in light theme (rail button, stored separately from the plan), and a computed trust verdict on Sources & accuracy. Observations, calculations, authored guidance, thresholds, routes, element IDs and saved state are unchanged. See `CHANGE-REPORT.md` and `INSTALL-AND-ROLLBACK.md`; `tests/browser_design.cjs` holds the design acceptance checks.

**[Open Predecessor Meta](https://gn45db4tjc-ship-it.github.io/predecessor-meta/) — free hosting and daily cloud collection of available sources.**

The selected hosting approach remains $0. The 2.21.1 repair updates collection, publication and provenance labels on the existing Design Revision 2 interface. Installed settings, drafts, historical bundles and rollback files are preserved.

## Current availability and update limits

- Open a normal website link on your PC, Mac or iPhone. Neither your Windows PC nor the spare iMac needs to remain on.
- The site loads the latest published bundle. Planning, builds, counters and combinations run in your browser. Your draft stays in that browser; Share plan deliberately transfers it.
- GitHub collects available sources once per daily update cycle (17:23 UTC boundary), or after live patch/hotfix content changes. Your PC and Codex can be off. Pred.gg is optional and limited to public game pages; missing optional data does not stop the other sources.
- The Windows updater is manual recovery only (from 2.25.0). It runs when you open **Update Predecessor Website** on the Desktop; nothing starts at sign-in. Before 2.25.0 it started at sign-in and checked every three hours. Neither collector requires an AI account or API key for the currently enabled sources.
- GitHub checks official patch notes every three hours, imports newer validated public files from `data-updates`, and deploys the site. Old Windows receipts cannot reset a newer cloud collection clock. An access denial stops later Pred.gg requests, while the cloud continues other sources.
- The Windows publishing key is restricted to this repository. Its private half stays on the PC, outside the source package. The updater only pushes public bundles, a source-status receipt and a small reviewed deployment trigger to `data-updates`; it never force-pushes or modifies `main`.
- The first complete collection across all six brackets passed with no source errors in **23 minutes 56 seconds**. Individual fetch timestamps and sample labels remain visible. No source observations are relabelled or pooled.
- Check updates retrieves the latest publication; it does not start another scrape. Open tabs check for published updates every five minutes while visible.
- Source failures preserve the last complete success separately. A validated independent update can publish fresh available-source records with retained or missing sources labelled. A bracket without usable evidence remains unavailable. No samples are invented or combined across ranks.
- A new patch invalidates the current status of old written advice. Pair comparisons, observed builds, counters and composition calculations use the latest loaded evidence, with missing/retained sources labelled. Automatic data collection does not author new strategic judgments or resolve undocumented mechanics. A separate daily Codex review uses existing Codex allowance and requires the host to be available if the owner chooses to enable it.

All six rank brackets are configured, with Gold+ first. Complete cohorts and validated partial updates can become available, with distinct collection statuses. The first full run can take around 25 minutes; the site stays usable throughout.

Choose a rank with the **Rank bracket** control at the top. All six have their own published observations. The authored tier review currently covers Gold+; other ranks lead with their own sortable win rates and games, and keep Gold+ tiers and working pools in a collapsed reference section. Builds, hero pages, counters and planners label the selected statistical rank. The written review is not relabelled as advice reviewed for every rank. Standalone exports retain the selected rank and this distinction.

## Free hosting and the publication decision

Use a **public GitHub repository**, GitHub Pages, standard Ubuntu Actions runners, and the included github.io address. There is no paid server, custom domain, database, AI API or subscription in this setup. [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The app's source code and published game data will be public. Owner settings, drafts, local backups, research conversations and browser profiles are excluded. The prepared source package contains only the runtime, publication scripts, tests and instructions. Do not upload the entire installed Documents folder or the older source/audit archive.

The owner approved making this package and website public on September 8, 2026. The public repository is [gn45db4tjc-ship-it/predecessor-meta](https://github.com/gn45db4tjc-ship-it/predecessor-meta). GitHub Pages is enabled, HTTPS is active, and the public site was verified on September 8. Its data and source limitations are described above.

Use only standard runners and the free account plan. Do not enable paid cache expansion, larger runners, a paid domain or paid features. The workflow keeps one day's Pages artifacts and uses the ordinary cache limit. Cloud-free allowances and source access are finite; this is not a guarantee of uninterrupted service or unlimited usage. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Reliability and maintenance

GitHub schedules can be delayed or dropped during busy periods. The website shows the last successful source collection and official check; bundles older than 30 hours receive a warning. [Scheduling behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Public-repository schedules can stop after 60 days without repository activity. The workflow commits a tiny daily publication-activity record to keep normal repository activity, using its automatic GitHub token. It never force-pushes or rewrites source files. Those token-created pushes do not recursively start the workflow. The cloud activity commit and cache save/restore have been verified. [Workflow trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Source caches and tier snapshots are kept in GitHub's cache, which can be evicted. The repository includes a public-only compressed Gold+ seed. A cache miss restores this dated seed; it never replaces newer validated data. The latest public data branch is imported after cache recovery; the initial seed cannot replace newer data. If that fails before any complete bundle exists, no empty website replaces the current deployment. Its dated existing publication remains online. Cloud snapshot retention is best-effort; the Windows app's local snapshots and backups remain separate and intact. [Cache limits and eviction](https://github.com/actions/cache#cache-limits).

If a source blocks GitHub's hosting addresses, the app must report that boundary; it does not bypass the block. The iMac is not needed and has not been changed.

## Files and verification

- `static_publish.py`: source collection decisions, public bundles, separate rendering, per-bracket failure handling.
- `static_client.js`: published-bundle loading, checksums, bracket selection, read-only update checks, and standalone export.
- `app.webmanifest`, `sw.js`, and `assets/app-icon-*.png`: browser installation metadata, app icons, and date-preserving offline reopening of previously loaded data.
- `rank_view.js`: selected-rank tables and explicit separation of rank-specific observations from the Gold+ authored tier review; also runs in exports.
- `free_hosting.json`: selected schedule and bracket policy.
- `.github/workflows/publish.yml`: serialized daily/patch checks and Pages deployment. Actions are pinned to verified commit IDs.
- `publication_activity.py`: minimal daily activity record; no private state.
- `local_updater.py`: Windows checks, isolated data cache, public-only export and repository-only publishing.
- `import_local_feed.py`: verify the data receipt, hashes, bracket and original dates before cloud import.
- `Install Windows Updater.ps1`: creates the manual recovery shortcut on the Desktop and removes the sign-in shortcut older versions created; no Windows service or administrator task.
- `public-seed-gold.json.gz`: public game-data snapshot for initial deployment/cache recovery; excluded from the source-only ZIP.
- `VERIFICATION.md`: completed local/cloud checks and remaining native-device limitations.

The hosting adapter is injected at the existing UI startup marker. If a future UI removes that marker, generation fails clearly. Desktop source files are not rewritten by the publisher.

Developer preview using the existing Windows Python installation:

```text
python -B static_publish.py --preview-seed "C:\path\to\last_successful_gold.json" --state-dir qa\state --output qa\site
python -B -m http.server 12926 --bind 127.0.0.1 --directory qa\site
```

That preview is a saved-data check. It does not refresh samples. `python -B -m unittest discover -s tests -p "test_static*.py" -v` runs the standard-library publication tests. Browser acceptance uses the existing development Playwright installation; it is not an installation requirement for the user or cloud collector.

To roll back the shared website, redeploy a prior known-good source revision. Preserve its dated data; never relabel an old bundle as newly fetched. The installed Windows tool keeps its existing rollback launcher.

## Using and pausing the Windows updater

**From 2.25.0 cloud collection is primary and this PC is manual recovery.** GitHub collects daily whether or not the PC is on. Each published rank records who actually collected it (`collector` in the manifest: `cloud`, `windows`, `local`, or `unrecorded` for data collected before 2.25.0). When a collection keeps (retains) sources from an earlier one, `retained_from` names who collected those. A Windows upload is imported only when it is genuinely newer: a later assembly of older sources never replaces the publication, this applies to every dated source including Pred.gg, a refused upload leaves the cloud's own collection record and schedule untouched, and a Windows upload can never be labelled as a cloud run. Use **Update Predecessor Website** only when the cloud has failed and you want to publish a fresh collection from this PC. The paragraphs below describe the original automatic updater and are kept as history.

Keep this `Predecessor Meta Free Hosting` folder in place. Open **Predecessor Meta Website** on your Desktop to use the app. **Update Predecessor Website** starts an additional full update if wanted; its console shows progress. Normal updates run quietly at Windows sign-in and while signed in, without Codex running. Signing out, shutting down or sleeping stops work until the PC is available again. Website availability does not depend on the PC.

Installed and verified September 8, 2026: all six brackets were collected, uploaded and published successfully. The updater is running under your normal Windows account, and a second launch exits without starting overlapping work. GitHub's Pages environment allows exactly `main` and `data-updates`; a real automatic data-branch deployment passed after adding the latter rule.

Updater status and errors are in `.local-publisher/updater.json` and `.local-publisher/updater.log`. Failed publishing retains the prepared data for the next check. Source failures remain visible. Independently validated source updates can publish without replacing the saved complete success. There is no database or service to maintain.

To pause automatic updating, run `Install Windows Updater.ps1 -Uninstall` in this folder. This removes only the updater shortcuts and requests the process to stop after any current update; it preserves the website, data and keys. The repository owner can revoke **Predecessor Meta — Windows data updater** in GitHub Settings → Deploy keys. The source-only ZIP excludes `.local-publisher` entirely.

The updater runs the reviewed source copy installed here. It reads remote **data only**, and does not automatically execute changed GitHub source code. A future application upgrade should update this local source copy deliberately.
