# 2.41.1 — The Windows app's phone top bar

The Visor session reported a phone-width bug in the Windows app while testing 2.36.1: at 390 px wide, the Rank select was 57 px wide and showed no rank. This release confirms that bug was already fixed, fixes a related one, and repairs a stale test.

## What changes for you

- **The rank stays readable.** The bug was real on 2.36.1: the full-width Refresh and Quit buttons squeezed the Rank select to 57 px at 390 px wide and 42 px at 320 px. The compact top bar in 2.37.0 already fixed it. On 2.41.0 the select is 159 px at 390 px and 107 px at 320 px, and it shows "Gold+". A new check keeps it that way.
- **Quit no longer stretches beside Refresh.** In the Windows app's phone layout, Quit grew to fill the rest of the row: 217 px wide at 700 px, right next to Refresh, which invited a mis-tap. It now keeps its own width (52 px), and the Rank select gets the space. The website has no Quit button and is unchanged.

## Tests

- **The local-mode suite's Export step no longer waits for nothing.** `browser_revision2_modes.cjs` still clicked Export on the 390 px phone run. Since 2.37.0, Export is on the desktop only, so the step waited 30 s for a download that could not start. Export itself works: 265 ms on the desktop, in both the Windows app and the website. The phone run now checks that More has no Export and opens the desktop export of the same mode at phone width.
- **New phone top-bar guard** in the same suite:
  - the Rank select is at least 96 px wide at 390 px, and its text fits;
  - Quit is at most 120 px wide at 700 px.

  Quit failed at 217 px before the fix and passes now; the Rank check would have caught 2.36.1's 57 px.

## Verification

- The local-mode suite passes against a scratch Windows-app instance (`--no-fetch`, its own data folder) and a staged website, at 1920 and 390 px: 52 and 55 checks per mode.
- Python static tests, Node tests (340) and the 11 CI browser suites.
