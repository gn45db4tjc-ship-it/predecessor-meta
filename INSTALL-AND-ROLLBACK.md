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
