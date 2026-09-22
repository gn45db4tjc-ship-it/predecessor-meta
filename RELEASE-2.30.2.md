# 2.30.2 — clearer mobile presentation

This release builds on the 2.30.1 role-statistics repair at `e11c814`.

- Native system fonts replace three remotely loaded font families. Headings, controls and numbers stay stable when a font service is unavailable, offline, or blocked by the Windows app's policy.
- Mobile Meta brings the hero list forward. A closed, labelled disclosure retains the complete source dates, update status, ordering explanation and sample-eligibility rule. Missing-current-data warnings remain visible, along with every displayed rate's sample and previous-dataset label.
- Search and sorting controls align. The five roles fit in one row at 390px and use balanced rows on smaller screens. Large-text mode uses two columns. Sorting now says “Hero name” when reviewed tiers are unavailable and the actual fallback is alphabetical.
- Hero headings, section controls, loadout cells, purchase positions and action spacing are consistent. The selected section and bottom destination use a visible border as well as color. Full details and all existing routes remain available.
- Enlarged source notices wrap so their Details action remains reachable. Light-theme secondary text has sufficient contrast on the darker hover surface.
- Touch controls keep a 44px minimum; search focus, saved builds, favorites, shared picks and existing offline behavior are preserved.

No observed rates, samples, source timestamps, strategy reviews, recommendation calculations, cohort policy or collection schedules were changed. This presentation release does not claim to complete the post-patch strategy review or supply missing current-patch statistics.

## Validation

`RELEASE-2.30.2-VERIFICATION.json` records the completed checks. The focused visual regression runs in Edge and WebKit, exercises missing images, the patch-rollover state, selected source loadouts, both themes, 320/390/1440px layouts and 200% text, and checks accessibility and saved-choice restoration. It is also part of pull-request CI.

The release process reruns the Python and JavaScript suites from the extracted source ZIP. CI separately runs the complete evidence audit, offline lifecycle, companion flows, previous-dataset role statistics and visual regressions. Passing automated checks is not physical-device or real screen-reader acceptance; those remain not run.

## Installation and rollback

Installation and public deployment are recorded separately in the release result. Before installation, the installer verifies the existing source against 2.30.1, verifies the source ZIP, and preserves a hashed backup. Data, snapshots, settings and reviewed guidance are not replaced.

To undo the local installation, quit the app and double-click **Roll Back 2.30.2.bat** in `Documents\Predecessor Meta Tool`, then relaunch. Public rollback uses a reviewed revert of the release merge and the normal publication workflow.
