# Predecessor Meta Tool 2.21.8

Version 2.21.8 makes the shared GitHub Pages site installable as a Progressive Web App while preserving the existing desktop launcher and data pipeline.

## User-facing change

- **Install app** appears on the shared website. In Edge, Chrome, and supported Android browsers it opens the browser's native installation prompt. On iPhone and iPad it provides the Safari **Share → Add to Home Screen** steps.
- The installed app has its own icon, opens in a standalone window, and continues to read the same six daily cloud publications.
- The public URL remains the sharing method. Recipients do not need Python, a GitHub account, or an installer.
- The service worker uses network-first handling for publication status and bundle data. When the network is unavailable, it can reopen the last data that device successfully loaded; all source and fetch dates remain visible.

## Boundaries

- Installation is a browser action and cannot be silently forced by the website.
- A device must load a bracket once while online before that bracket is available from its local cache.
- An offline installation retains dated data and cannot obtain new daily data until connectivity returns.

## Verification

- **89 Python publication tests passed** from the source tree and again from the clean source ZIP.
- **42 JavaScript engine tests passed** from the source tree and again from the clean source ZIP.
- Static browser acceptance passed in Microsoft Edge at **1440×900 and 390×844**, with 54 checks per viewport plus a dedicated service-worker check. It exercised all nine routes, sharing, imports, exports, rank changes, source failures, data checksums, saved selections, manifest metadata, service-worker registration, and offline reopening of the exact dated bundle.
- The manifest declares standalone display and valid 192px/512px PNG icons. The publication test verifies all PWA files are emitted by the same render step that writes the website.
