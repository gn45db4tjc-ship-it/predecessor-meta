# 2.34.1 — item list on an iPhone's first screen

This release is a phone layout fix for Items & loadouts. The engine, evidence rules, reviewed guidance, statistics and source dates are unchanged.

## What changes for you (phone)

- **The first items are on the first screen.** On an iPhone-sized screen (390 × 664, Safari with its toolbars), the list used to start below the bottom navigation, so you had to scroll before seeing any item. It now starts on the first screen.
  - Show and Find sit side by side on phones from 360 px to 700 px wide, each with its label above the control. The controls keep their 44 px touch height.
  - The amber note's summary is shorter: "Pred.gg catalogue unavailable". Open it for the reason and for which sources are listed instead. The sources are still named in the page heading and on every row.
- **No sideways scrolling on small phones with large text.** At 320 px with large text on, the Show menu sized itself to its longest option, "Augments, Eternals & blessings", and pushed the page sideways. It now fits the screen. This was already the case on 2.34.0.

Screens 320–359 px wide keep Show and Find stacked. Desktop is unchanged.

## Verification

- Browser probe LB4 in `tests/browser_audit_regressions.cjs` checks three things at 390 × 664 with the live 1.17 data: one row for Show and Find, a first entry on the first screen, and no sideways scrolling. It also checks 320 px with large text. It reproduced on 2.34.0 (first entry at 647 px against a bottom bar at 607 px; page 359 px wide at 320 px). It was recorded as open in `tests/known-defects.json` and is closed by this release.
- WebKit with an iPhone 13 profile, on a site staged from the six published rank bundles: the first entry starts at 561 px. At 320, 360 and 375 px, with normal and large text, nothing scrolls sideways and the controls stay 44 px or taller.

## Compatibility

App version and service-worker shell cache advance together to 2.34.1. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
