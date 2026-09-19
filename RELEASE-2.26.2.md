# Predecessor Meta 2.26.2 — WebKit maintenance release

A small maintenance release: one fix for Safari's engine, and browser checks that now also pass in WebKit. The engine, collection, publication and offline storage are unchanged. Saved selections, all six brackets, reviewed guidance, source rates, samples and dates are unchanged. No number is estimated, and no review status or review date is changed.

## What changed

- **Safari's limit on address updates.** The app updates the address bar whenever you change section, open a hero or switch a hero tab, so that Back and shared links work. WebKit, the engine behind Safari on iPhone and iPad, allows only a limited number of these updates in a short time (the WebKit build used for testing allows 100 in 10 seconds) and then throws an error. Opening many heroes, tabs or sections quickly could hit that limit. The page had already changed, but a hero tab raised an uncaught error, and changing section or opening a hero showed the raw message "Attempt to use history.pushState() more than 100 times per 10 seconds" as an error notice. The app now skips only that one address update and keeps working. It catches only this specific browser error; any other error still shows. It also leaves its record of the last applied address alone, so the next redraw does not jump back to the previous hero.
- **The browser checks pass in WebKit.** The static browser suite checked that the installed app reopens offline by switching the browser's network off and reloading. In Playwright's WebKit that setting blocks the reload before the service worker sees it, so the check could never pass there, although the app works: with the server really stopped, WebKit reopens the saved copy with the same dated bundle, just as Edge does. The check now serves the site through its own small server, lets the service worker take control, stops that server, confirms the site is unreachable and reloads. It also requires a newly opened page, so a failed reload can no longer pass by leaving the old page on screen. The same check runs in Edge and WebKit.
- **A check for the limit in every browser.** The static suite now makes the browser's address-update functions fail with the same error, then changes section, opens a hero, switches its tab and changes section again. It requires every view to open, with no uncaught error and no error notice. Without the fix this check fails even in Edge, which never reaches the real limit.

## Verification (actual results, 18 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153, Playwright WebKit 26.6)

- The new address-limit check was run against the code before the fix first: in Edge it found 1 uncaught error and the error notice. With the fix it passes in Edge and WebKit.
- `browser_static` on the six-bracket preview: 55 checks at 1440×900 and 48 at 390×844, in Edge and in WebKit. At 1440×900 this includes all seven legacy suites, with no page errors. At phone width the legacy desktop suites are skipped; `browser_companion` covers the phone presentation.
- `browser_ranks`: 30 rank/role tables and 30 phone role dashboards, in Edge and in WebKit.
- Audit browser suite: 67 of 67 verdicts match the ledger, and the ledger of open defects is empty. Longest main-thread stall while generating five-hero alternatives: 40 ms (budget 500 ms).
- Accessibility (axe, WCAG 2.1 A/AA) on 15 phone states in each theme: no violations.
- Python: 178 tests, all pass, 1 skipped where no local bundle store exists. JavaScript: 149 tests, all pass.
- Offline cache suite, real service worker in a real browser, against the six-bracket preview: 7 of 7. This includes an upgrade from a cache written by the actual 2.23.0 worker, after which all six ranks open with the network down. Saved ranks carry over to the new 2.26.2 shell cache.
- `browser_release_222` (8 checks) and `browser_companion` (46 checks, no page errors) pass.
- Clean-room source package (unpacked into an empty folder and tested there): 178 Python tests run with 6 skipped, and 146 JavaScript tests pass with 3 skipped.

## Known gaps

- Playwright's WebKit on Windows is not Safari. The address-update limit and the fix were verified in that WebKit build, and by simulating the error in Edge, not on an iPhone or iPad. Real-device acceptance of the phone changes on the owner's phone is still open.
- The limit itself still applies in WebKit. After a quick burst of navigation, Back can skip the sections opened during the burst, and the address bar can show an earlier section until the next update is allowed. The page itself always shows the section you chose.
- At phone width the seven legacy desktop suites are skipped, because the phone presentation replaces the desktop controls they drive; `browser_companion` covers it.

## Rollback

Windows app: quit the app, then run **Roll Back 2.26.2.bat**. It verifies the backup's checksums before restoring 2.26.1 and does not touch `data\`, `snapshots\` or `settings.json`. Website: revert the 2.26.2 merge commit on `main`; Pages redeploys 2.26.1. Ranks saved for offline use are kept. Never force-push.
