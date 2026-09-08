# Predecessor Meta — free shared website

Prepared on September 8, 2026. **Public publication approved; not published yet. No hosting has been purchased.**

This is the selected $0 hosting approach. It supersedes the earlier paid Render proposal. It adds static publication to the installed 2.21.0 app; the six original runtime files, including Builds, Live game and the recommendation engine, are unchanged. The installed Windows app and its saved data have not been replaced.

## How it will work

- Open a normal website link on your PC, Mac or iPhone. Neither your Windows PC nor the spare iMac needs to remain on.
- The site loads the latest published bundle. Planning, builds, counters and combinations run in your browser. Your draft stays in that browser; Share plan deliberately transfers it.
- One full update is targeted daily at **17:23 UTC**: **12:23 PM Central during daylight saving time**, 11:23 AM in winter. This is our chosen update time, not a claimed Omeda release schedule.
- Official notes are checked every three hours. A changed live patch or hotfix article triggers an extra full collection. Future announcements are shown separately.
- If statistical sources lag a newly detected patch, a catch-up attempt can run after six hours, within a 48-hour patch window. A source block prevents these extra retries. Ordinary failures wait until the next daily attempt or an explicit maintenance request.
- Check updates retrieves the latest publication; it does not start another scrape. Open tabs check for published updates every five minutes while visible.
- Source failures retain the last complete successful bundle for each bracket, with its original timestamp and a visible error. A bracket with no successful bundle is clearly unavailable. No samples are invented or combined across ranks.
- A new patch invalidates the current status of old written advice. Automatic data collection does not author new strategic judgments or resolve undocumented mechanics.

All six rank brackets are configured, with Gold+ first. The local acceptance preview uses the real saved Gold+ bundle; other cloud cohorts must be collected successfully before appearing as available.

## Free hosting and the publication decision

Use a **public GitHub repository**, GitHub Pages, standard Ubuntu Actions runners, and the included github.io address. There is no paid server, custom domain, database, AI API or subscription in this setup. [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The app's source code and published game data will be public. Owner settings, drafts, local backups, research conversations and browser profiles are excluded. The prepared source package contains only the runtime, publication scripts, tests and instructions. Do not upload the entire installed Documents folder or the older source/audit archive.

The owner approved making this package and website public on September 8, 2026. The public repository is [gn45db4tjc-ship-it/predecessor-meta](https://github.com/gn45db4tjc-ship-it/predecessor-meta). Website setup and first cloud verification are in progress. The first cloud run must be inspected before calling the service live and verified.

Use only standard runners and the free account plan. Do not enable paid cache expansion, larger runners, a paid domain or paid features. The workflow keeps one day's Pages artifacts and uses the ordinary cache limit. Cloud-free allowances and source access are finite; this is not a guarantee of uninterrupted service or unlimited usage. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Reliability and maintenance

GitHub schedules can be delayed or dropped during busy periods. The website shows the last successful source collection and official check; bundles older than 30 hours receive a warning. [Scheduling behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Public-repository schedules can stop after 60 days without repository activity. The workflow commits a tiny daily publication-activity record to keep normal repository activity, using its automatic GitHub token. It never force-pushes or rewrites source files. Those token-created pushes do not recursively start the workflow. This activity step still needs verification in the first cloud deployment. [Workflow trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Source caches and tier snapshots are kept in GitHub's cache, which can be evicted. A cache miss causes a cold collection. If that fails before any complete bundle exists, no empty website replaces the current deployment. Its dated existing publication remains online. Cloud snapshot retention is best-effort; the Windows app's local snapshots and backups remain separate and intact. [Cache limits and eviction](https://github.com/actions/cache#cache-limits).

If a source blocks GitHub's hosting addresses, the app must report that boundary; it does not bypass the block. The spare iMac is a possible future place to run the collector and publish bundles while the website stays hosted for free. Nothing has been installed or scheduled on the iMac.

## Files and verification

- `static_publish.py`: source collection decisions, public bundles, separate rendering, per-bracket failure handling.
- `static_client.js`: published-bundle loading, checksums, bracket selection, read-only update checks, and standalone export.
- `free_hosting.json`: selected schedule and bracket policy.
- `.github/workflows/publish.yml`: serialized daily/patch checks and Pages deployment. Actions are pinned to verified commit IDs.
- `publication_activity.py`: minimal daily activity record; no private state.
- `VERIFICATION.md`: what has actually been checked and what still needs a cloud or native-device test.

The hosting adapter is injected at the existing UI startup marker. If a future UI removes that marker, generation fails clearly. Desktop source files are not rewritten by the publisher.

Developer preview using the existing Windows Python installation:

```text
python -B static_publish.py --preview-seed "C:\path\to\last_successful_gold.json" --state-dir qa\state --output qa\site
python -B -m http.server 12926 --bind 127.0.0.1 --directory qa\site
```

That preview is a saved-data check. It does not refresh samples. `python -B -m unittest discover -s tests -p "test_static*.py" -v` runs the standard-library publication tests. Browser acceptance uses the existing development Playwright installation; it is not an installation requirement for the user or cloud collector.

To roll back the shared website, redeploy a prior known-good source revision. Preserve its dated data; never relabel an old bundle as newly fetched. The installed Windows tool keeps its existing rollback launcher.
