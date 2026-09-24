# 2.34.3 — whole first item on an iPhone's first screen

This release finishes the 2.34.1 phone layout fix for Items & loadouts. The engine, evidence rules, reviewed guidance, statistics and source dates are unchanged.

## What changes for you (phone)

- **The first item is fully visible without scrolling.** On the live site, 2.34.1 brought the first entry onto an iPhone's first screen, but its name sat behind the bottom navigation. The rank note above the page is one line longer on the live 1.17 data than on the test data 2.34.1 was measured against.
- **The intro line is hidden on phones.** "Search the full collected catalog…" no longer shows on screens up to 700 px wide. The page title, Show, Find, the entry count and the Pred.gg note are unchanged. Desktop still shows the intro.

## Verification

- Browser probe LB4 now requires the whole first row above the bottom navigation, not just its top edge. It also recreates the live state more fully: Pred.gg's rank statistics have failed as well, which adds the tier-review sentence to the rank note. It reproduced on 2.34.1 (row ending at 627 px against 607 px) and passes on 2.34.3 (581 px).
- WebKit on a site staged from the six published 2.34.1 rank bundles:

  | Phone profile | Screen | First row ends | Bottom bar at |
  |---|---|---|---|
  | iPhone 13 | 390 × 664 | 591 px | 607 px |
  | iPhone 15 | 393 × 659 | 591 px | 602 px |
  | iPhone SE (3rd gen) | 375 × 667 | 591 px | 610 px |
  | Pixel 5 | 393 × 727 | 588 px | 670 px |

  Nothing scrolls sideways at 320, 360 or 375 px, with normal or large text.
- The first-generation iPhone SE (320 × 568) is too short to show an entry on the first screen with this page's controls; there the list still begins after one scroll.

## Compatibility

App version and service-worker shell cache advance together to 2.34.3. The permanent offline data cache, saved selections, settings and statistics are unchanged. Publication and Windows installation remain separate approvals.
