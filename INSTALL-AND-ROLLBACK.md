# 2.26.0 phone navigation release: installation and rollback

2.26.0 is the phone navigation release from the 2.23.0 audit (item 09), built from the phone prototype the owner tried and approved: every hero of a role can be browsed on Meta without typing a name, the status line separates the fetch time, the Statz dataset and the game patch, material source limitations are one compact line on every phone screen, Live shows a one-line evidence summary, the Live hero can be replaced in place with a preview and Undo, Draft shows allies and enemies separately with counts, redraws keep open sections open, and a running composition search can be cancelled. See [RELEASE-2.26.0.md](RELEASE-2.26.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.26.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.26.0 merge commit on `main`.

## Previous release: 2.25.0

2.25.0 completes the audit repairs: a fresh collection publishes even when a few hero pages fail (with the gaps named), saved offline ranks survive every release and only verified data is stored, five-hero composition search no longer freezes the page, the strategy review packet carries the official changes and is queued in the cloud for human review, and each published rank records who collected it. See [RELEASE-2.25.0.md](RELEASE-2.25.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.25.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.25.0 merge commit on `main`.

## Previous release: 2.24.0

2.24.0 is a reliability release: composition results always match the current draft, evidence age is described once and redrawn when it changes, and every publication path validates rows the same way. See [RELEASE-2.24.0.md](RELEASE-2.24.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.24.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.24.0 merge commit on `main`.

## Previous release: 2.23.0

The mobile Meta dashboard, Build Coach, and refresh-health changes are described in [RELEASE-2.23.0.md](RELEASE-2.23.0.md). Open the public website and add it to your home screen. The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.23.0.bat**. All existing data and settings are retained.

## Historical release notes

# 2.21.8 installable website and rollback

The shared website is now an installable Progressive Web App. No Windows installer or app-store package is required: open the public site, select **Install app**, and accept the browser prompt. Removing the installed app later does not delete the public website. Roll back the public app by reverting the 2.21.8 source commit and allowing the Pages workflow to deploy the prior site; published game-data bundles and their original dates remain separate.

The installed Windows app receives the 2.21.8 version label and matching UI template while keeping its local launcher, data, settings and snapshots. Its new PWA files are publication-only. The 2.21.7 source is retained in the dated `backups\pre-2.21.8-*` folder and restored by **Roll Back 2.21.8.bat**.

## Previous release: 2.21.7

The current release replaces `predecessor_meta.py`, `engine.js`, `ui.js` and `reviewed_guidance.json` in the installed app. The installer verifies the existing 2.21.6 source, creates a dated hashed backup and preserves settings, saved data and snapshots. Quit the app and use **Roll Back 2.21.7.bat** to restore that source. A public rollback should revert the release commit and republish; leave the data branch and cloud source history intact. See [RELEASE-2.21.7.md](RELEASE-2.21.7.md) for the current verification and collection limits.

The sections below describe earlier releases and are retained as historical handoff context.

## 2.21.1 upgrade and rollback

The 2.21.1 release updates `predecessor_meta.py`, `engine.js`, `ui.js`, and `shared_server.py` in the installed app. It preserves the Design Revision 2 CSS/template and authored guidance. Publication-side files are updated in the separate website source folder. Keep the existing data directories and settings.

The local installation creates a dated hashed backup and **Roll Back 2.21.1.bat**. To roll back, quit the app and double-click that file. It restores program files and the prior export, leaving all data and settings intact. The release receipt identifies the exact backup directory. Website rollback restores the previous source commit through the existing publication workflow; do not force-reset the data branch.

Use `RELEASE-2.21.1.md` for this release's checks. The instructions below are the historical incoming Design Revision 2 handoff, already completed on September 8; their presentation-only file list does not describe 2.21.1.

---

# Installing design revision 2 later (not done by this handoff)

This package (design revision 2, which supersedes revision 1) changes only `ui.html`, `ui.js`, `rank_view.js`, `static_client.js`, the tests, two capture tools and packaging notes. Revision 2 added the narrow-screen pass and the opt-in light theme; the user authorised both on 8 September 2026 (see CHANGE-REPORT.md). Data, settings, saved drafts, the updater and the publishing key are untouched. Nothing here has been installed or published.

## Installed Windows app (`C:\Users\Will\Documents\Predecessor Meta Tool`)

1. Use **Quit** in the app, or wait until `data\instance.json` disappears.
2. Copy the existing `ui.html`, `ui.js` and `static_client.js` into a dated folder under `backups\` (the existing installer scripts do this with SHA-256 receipts; reuse them if available).
3. Copy the new `ui.html`, `ui.js` and `static_client.js` from `source/` over the installed ones (the installed app may not ship `static_client.js`; if it does not, copy only the first two). Leave `predecessor_meta.py`, `engine.js`, `reviewed_guidance.json`, `settings.json`, `data\` and `snapshots\` alone.
4. Double-click the launcher. The app renders the saved bundle immediately; the live refresh runs as before.
5. Rollback: copy the backed-up files back and relaunch. Saved drafts and data are unaffected either way.

## Website source (`C:\Users\Will\Desktop\Predecessor Meta Free Hosting`)

1. Replace `ui.html`, `ui.js`, `rank_view.js`, `static_client.js`, `package_source.py` and `tests/` with the versions in `source/`.
2. Run the checks from `source/`: `python -B -m unittest discover -s tests -p "test_static*.py"`, then with a preview running (`python -B preview.py --no-open` from the handoff root) `node tests/browser_static.cjs`, `node tests/browser_ranks.cjs`, `node tests/browser_design.cjs` with `PREVIEW_URL=http://127.0.0.1:12928/project/`.
3. Publish through the existing workflow only after the checks pass. The published `index.html` is generated; do not edit it directly.
4. Rollback: revert the same files to commit `ad044213d04163ca19ebb4b4f1df59b93b8d2942` and republish. Published bundles are data, not UI, and are not affected.

## Standalone exports

Exports made after the upgrade embed the new UI, the rank adapter and the theme toggle (they open in whichever theme the viewer chooses). Exports made before it keep the old UI; they remain valid snapshots of their own data.
