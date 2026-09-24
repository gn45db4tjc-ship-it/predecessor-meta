# 2.33.2 — one export button id on phones

This release fixes a duplicate element id on phones. Nothing visible changes. The engine, evidence rules, reviewed guidance, statistics and source dates are unchanged.

## What changes

- **One `id="export"` per page.** On phones, the More screen rendered its own "Export snapshot" button with `id="export"`, while the hidden top-bar button kept the same id.
  - A page with two elements sharing one id is invalid HTML.
  - Code that updates `#export` only ever reached the hidden top-bar button.
- **The fix.** The More-screen button is now `#more-export`, and the local-app and website click handlers accept either button.
  - The button is disabled until a rank's data has loaded, like the top-bar button.
  - Export snapshot works as before on phones and desktops.

## Verification

- Browser probe LB3 in `tests/browser_audit_regressions.cjs` reproduced the duplicate id on 2.33.1. It was recorded as open in `tests/known-defects.json` and is closed by the fix; the probe also confirms the More-screen export still downloads.
- The phone export checks in `tests/browser_static.cjs` and `tests/browser_rank_companion.cjs` now select whichever export button is visible.

## Compatibility

App version and service-worker shell cache advance together to 2.33.2. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
