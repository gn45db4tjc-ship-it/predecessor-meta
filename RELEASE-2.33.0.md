# 2.33.0 — build first on the phone

This release implements the three priority recommendations from the design critique of 2.32.0. It changes the phone presentation only; the engine, evidence rules, reviewed guidance, statistics and source dates are unchanged.

## What changes for you (phone, quick companion)

- **The build is on the first screen.** The hero page shows a compact six-item strip, with its Reviewed / Observed / Calculated label, directly under the hero header. Tap an icon for the item details.
- **Adapt to my match is always within reach.** It stays docked above the bottom navigation while you scroll the hero page.
- **Status shown once.** Meta keeps the full status banner. On other pages the status becomes a small chip in the rank row: amber ⚠ for a required-source failure, neutral ⓘ for limitations. Reload becomes a ↻ button in the same row.
- **Optional-source problems are no longer called failures.** A Pred.gg problem on its own reads "Limitations", with neutral styling. Failures of a required source stay amber.
- **Less repetition.** The purchase order is grouped under "Core · 1–3" and "Flexible · 4–6", and the loadout states "Reviewed choices" once instead of under every slot.
- **Other layout changes:**
  - The hero sections are one scrolling tab row.
  - Meta rows show "✓ Build ready" for heroes with an active reviewed build.
  - The external-link arrow is gone from Meta rows.
  - Rows keep an even height, and each still states when its figures are from the previous dataset.

The desktop layout and the "Full details" phone mode are unchanged.

## Design system

A design-system audit followed the phone changes; all five of its priorities are in this release. They apply to phone and desktop.

- **Spacing and corners come from tokens.** Every padding, margin and gap below 40 px uses the spacing scale, which now includes 2 px and 6 px steps. Off-scale values moved to the nearest step: 617 values tokenised. Corner radius has four tokens: sm, md, lg and pill. Layout budgets are unchanged; the desktop status chrome is still 127 px.
- **One tab-strip and one chip component.**
  - The phone hero sections are a real tab list: screen readers announce the tabs and arrow keys move between them.
  - The tab list wraps instead of scrolling sideways, which restores the 2.29 rule "phone tab strips do not scroll". The labels "Options" and "Counters" keep all five tabs on one row at 375 px.
  - Evidence tags, status pills and "Build ready" share one chip shape. "Build ready" now uses the reviewed evidence style.
- **One focus ring and visible selection in light mode.** A single 3 px focus ring now applies on every screen. Selection borders use a new indicator colour: in light mode it reaches 5.7:1 against the background, where it was about 2:1.
- **A smaller token set.** The unused phone palette and two duplicate tokens are gone, and the phone type scale drops from ten sizes to six.
- **Documentation.** `docs/DESIGN-SYSTEM.md` lists every token and shared component. A test fails when one is added without being documented.

New probes DS1–DS6 reproduced each finding before its fix and are closed.

## Verification

- Browser probes U1–U7 in `tests/browser_audit_regressions.cjs` reproduced each finding on 2.32.0 before the change. They were recorded as open in `tests/known-defects.json` and closed with the fix.
- Existing phone guards still hold, including:
  - status on every route (M3);
  - the rank select width at 320 px with large text (P9);
  - per-row previous-dataset labels (role-statistics suite);
  - compact roster rows (product review).

## Compatibility

App version and service-worker shell cache advance together to 2.33.0. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
