# Predecessor Meta — free shared website

Published September 8, 2026. **[Open Predecessor Meta](https://gn45db4tjc-ship-it.github.io/predecessor-meta/) — free hosting, with dated Gold+ data. Complete data refreshes need a local collector.**

This is the selected $0 hosting approach. It supersedes the earlier paid Render proposal. It adds static publication to the installed 2.21.0 app; the six original runtime files, including Builds, Live game and the recommendation engine, are unchanged. The installed Windows app and its saved data have not been replaced.

## Current availability and update limits

- Open a normal website link on your PC, Mac or iPhone. Neither your Windows PC nor the spare iMac needs to remain on.
- The site loads the latest published bundle. Planning, builds, counters and combinations run in your browser. Your draft stays in that browser; Share plan deliberately transfers it.
- **Complete cloud data refreshes are paused.** The first cloud pull failed because Pred.gg supplies a client-rendered shell without its statistical JSON. A direct anonymous statistics request returned Forbidden. No bypass is used.
- The initial public data are the complete Gold+ snapshot generated **September 8, 2026 at 08:36:59 Central**. The source dates are unchanged. Other rank brackets remain unavailable.
- Official patch notes and embedded hotfix sections continue to be checked every three hours. A changed patch marks old data and guidance for review; it does not manufacture updated builds or samples.
- The prepared daily/patch-triggered full collection policy remains in the code, but cannot operate until a working collector is connected. A Windows PC or the spare iMac can collect and publish while it is on; it does not need to host the website. That local publishing connection is not yet configured.
- Check updates retrieves the latest publication; it does not start another scrape. Open tabs check for published updates every five minutes while visible.
- Source failures retain the last complete successful bundle for each bracket, with its original timestamp and a visible error. A bracket with no successful bundle is clearly unavailable. No samples are invented or combined across ranks.
- A new patch invalidates the current status of old written advice. Automatic data collection does not author new strategic judgments or resolve undocumented mechanics.

All six rank brackets are configured, with Gold+ first. Only complete, validated cohorts become available.

## Free hosting and the publication decision

Use a **public GitHub repository**, GitHub Pages, standard Ubuntu Actions runners, and the included github.io address. There is no paid server, custom domain, database, AI API or subscription in this setup. [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The app's source code and published game data will be public. Owner settings, drafts, local backups, research conversations and browser profiles are excluded. The prepared source package contains only the runtime, publication scripts, tests and instructions. Do not upload the entire installed Documents folder or the older source/audit archive.

The owner approved making this package and website public on September 8, 2026. The public repository is [gn45db4tjc-ship-it/predecessor-meta](https://github.com/gn45db4tjc-ship-it/predecessor-meta). GitHub Pages is enabled, HTTPS is active, and the public site was verified on September 8. Its data and source limitations are described above.

Use only standard runners and the free account plan. Do not enable paid cache expansion, larger runners, a paid domain or paid features. The workflow keeps one day's Pages artifacts and uses the ordinary cache limit. Cloud-free allowances and source access are finite; this is not a guarantee of uninterrupted service or unlimited usage. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Reliability and maintenance

GitHub schedules can be delayed or dropped during busy periods. The website shows the last successful source collection and official check; bundles older than 30 hours receive a warning. [Scheduling behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Public-repository schedules can stop after 60 days without repository activity. The workflow commits a tiny daily publication-activity record to keep normal repository activity, using its automatic GitHub token. It never force-pushes or rewrites source files. Those token-created pushes do not recursively start the workflow. The cloud activity commit and cache save/restore have been verified. [Workflow trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Source caches and tier snapshots are kept in GitHub's cache, which can be evicted. The repository includes a public-only compressed Gold+ seed. A cache miss restores this dated seed; it never replaces newer validated data. Complete collection remains paused. If that fails before any complete bundle exists, no empty website replaces the current deployment. Its dated existing publication remains online. Cloud snapshot retention is best-effort; the Windows app's local snapshots and backups remain separate and intact. [Cache limits and eviction](https://github.com/actions/cache#cache-limits).

If a source blocks GitHub's hosting addresses, the app must report that boundary; it does not bypass the block. Nothing has been installed or scheduled on the iMac.

## Files and verification

- `static_publish.py`: source collection decisions, public bundles, separate rendering, per-bracket failure handling.
- `static_client.js`: published-bundle loading, checksums, bracket selection, read-only update checks, and standalone export.
- `free_hosting.json`: selected schedule and bracket policy.
- `.github/workflows/publish.yml`: serialized daily/patch checks and Pages deployment. Actions are pinned to verified commit IDs.
- `publication_activity.py`: minimal daily activity record; no private state.
- `public-seed-gold.json.gz`: public game-data snapshot for initial deployment/cache recovery; excluded from the source-only ZIP.
- `VERIFICATION.md`: what has actually been checked and what still needs a cloud or native-device test.

The hosting adapter is injected at the existing UI startup marker. If a future UI removes that marker, generation fails clearly. Desktop source files are not rewritten by the publisher.

Developer preview using the existing Windows Python installation:

```text
python -B static_publish.py --preview-seed "C:\path\to\last_successful_gold.json" --state-dir qa\state --output qa\site
python -B -m http.server 12926 --bind 127.0.0.1 --directory qa\site
```

That preview is a saved-data check. It does not refresh samples. `python -B -m unittest discover -s tests -p "test_static*.py" -v` runs the standard-library publication tests. Browser acceptance uses the existing development Playwright installation; it is not an installation requirement for the user or cloud collector.

To roll back the shared website, redeploy a prior known-good source revision. Preserve its dated data; never relabel an old bundle as newly fetched. The installed Windows tool keeps its existing rollback launcher.
