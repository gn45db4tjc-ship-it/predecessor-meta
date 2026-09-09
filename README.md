# Predecessor Meta — free shared website


## Design revisions 1 and 2 (presentation only)

The interface was redesigned on top of 2.21.0 + hosting revision 3 after a six-critic review: a compact top bar with a global hero finder, a single status strip, a grouped rail, Meta with the table directly under the role tabs and the reviewed pool beside it, hero pages with tabs under the header and one headline figure per partner card, build plans that show six positions plus augment, Eternal, both blessings and crest without opening details, compact catalogue rows, a narrow-screen pass with an always-visible route row, an opt-in light theme (rail button, stored separately from the plan), and a computed trust verdict on Sources & accuracy. Observations, calculations, authored guidance, thresholds, routes, element IDs and saved state are unchanged. See `CHANGE-REPORT.md` and `INSTALL-AND-ROLLBACK.md`; `tests/browser_design.cjs` holds the design acceptance checks.

Published September 8, 2026. **[Open Predecessor Meta](https://gn45db4tjc-ship-it.github.io/predecessor-meta/) — free hosting, with data collected by your Windows PC.**

This is the selected $0 hosting approach. It supersedes the earlier paid Render proposal. It adds static publication to the installed 2.21.0 app; the six original runtime files, including Builds, Live game and the recommendation engine, are unchanged. The installed Windows app and its saved data have not been replaced.

## Current availability and update limits

- Open a normal website link on your PC, Mac or iPhone. Neither your Windows PC nor the spare iMac needs to remain on.
- The site loads the latest published bundle. Planning, builds, counters and combinations run in your browser. Your draft stays in that browser; Share plan deliberately transfers it.
- Your Windows PC collects the data. The small updater starts when you sign in and checks every three hours while the PC is on and connected. Codex does not need to be open; no AI account/API key is used by the updater.
- Full collection runs once per daily update cycle (17:23 UTC boundary), or after a live patch/hotfix changes. If the PC is off, the website continues serving its last successful data. Missed daily updates are collected when the PC is available again.
- GitHub checks official patch notes independently every three hours, imports validated public files from the `data-updates` branch, and deploys the site. The cloud does not repeat requests to the unavailable Pred.gg endpoints.
- The Windows publishing key is restricted to this repository. Its private half stays on the PC, outside the source package. The updater only pushes public bundles, a source-status receipt and a small reviewed deployment trigger to `data-updates`; it never force-pushes or modifies `main`.
- The first complete collection across all six brackets passed with no source errors in **23 minutes 56 seconds**. Individual fetch timestamps and sample labels remain visible. No source observations are relabelled or pooled.
- Check updates retrieves the latest publication; it does not start another scrape. Open tabs check for published updates every five minutes while visible.
- Source failures retain the last complete successful bundle for each bracket, with its original timestamp and a visible error. A bracket with no successful bundle is clearly unavailable. No samples are invented or combined across ranks.
- A new patch invalidates the current status of old written advice. Automatic data collection does not author new strategic judgments or resolve undocumented mechanics.

All six rank brackets are configured, with Gold+ first. Only complete, validated cohorts become available. The first full run can take around 25 minutes; the site stays usable throughout.

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
- `rank_view.js`: selected-rank tables and explicit separation of rank-specific observations from the Gold+ authored tier review; also runs in exports.
- `free_hosting.json`: selected schedule and bracket policy.
- `.github/workflows/publish.yml`: serialized daily/patch checks and Pages deployment. Actions are pinned to verified commit IDs.
- `publication_activity.py`: minimal daily activity record; no private state.
- `local_updater.py`: Windows checks, isolated data cache, public-only export and repository-only publishing.
- `import_local_feed.py`: verify the data receipt, hashes, bracket and original dates before cloud import.
- `Install Windows Updater.ps1`: sign-in shortcut and manual update shortcut; no Windows service or administrator task.
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

Keep this `Predecessor Meta Free Hosting` folder in place. Open **Predecessor Meta Website** on your Desktop to use the app. **Update Predecessor Website** starts an additional full update if wanted; its console shows progress. Normal updates run quietly at Windows sign-in and while signed in, without Codex running. Signing out, shutting down or sleeping stops work until the PC is available again. Website availability does not depend on the PC.

Installed and verified September 8, 2026: all six brackets were collected, uploaded and published successfully. The updater is running under your normal Windows account, and a second launch exits without starting overlapping work. GitHub's Pages environment allows exactly `main` and `data-updates`; a real automatic data-branch deployment passed after adding the latter rule.

Updater status and errors are in `.local-publisher/updater.json` and `.local-publisher/updater.log`. Failed publishing retains the prepared data for the next check. Source failures retain each bracket's previous successful bundle and remain visible on the website. There is no database or service to maintain.

To pause automatic updating, run `Install Windows Updater.ps1 -Uninstall` in this folder. This removes only the updater shortcuts and requests the process to stop after any current update; it preserves the website, data and keys. The repository owner can revoke **Predecessor Meta — Windows data updater** in GitHub Settings → Deploy keys. The source-only ZIP excludes `.local-publisher` entirely.

The updater runs the reviewed source copy installed here. It reads remote **data only**, and does not automatically execute changed GitHub source code. A future application upgrade should update this local source copy deliberately.
