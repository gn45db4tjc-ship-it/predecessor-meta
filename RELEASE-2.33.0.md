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

## Verification

- Browser probes U1–U7 in `tests/browser_audit_regressions.cjs` reproduced each finding on 2.32.0 before the change. They were recorded as open in `tests/known-defects.json` and closed with the fix.
- Existing phone guards still hold, including:
  - status on every route (M3);
  - the rank select width at 320 px with large text (P9);
  - per-row previous-dataset labels (role-statistics suite);
  - compact roster rows (product review).

## Compatibility

App version and service-worker shell cache advance together to 2.33.0. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
