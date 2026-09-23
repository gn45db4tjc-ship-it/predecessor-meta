# 2.31.2 — Compact companion and reliable draft focus

Meta uses compact phone hero rows with whole-card navigation, saved shortcuts above the roster, and a shorter hero header. Quick Draft uses compact selected cards and moves keyboard focus to the pre-match setup. That focus now survives data redraws for the same hero and role without being transferred to a different setup.

## Corrections and compatibility

- Setup headings have stable hero/role-specific identities and keyboard-only `:focus-visible` styling.
- Saved hero counts correctly distinguish one favorite from multiple favorites.
- Card background clicks still open the hero and record history; nested links, inputs, disclosures and other interactive controls retain their native behavior.
- Protected preview data and interface-update requests retain same-origin authentication. No cross-origin credential forwarding was added.
- Shared agent context distinguishes durable safeguards from historical setup facts; `CLAUDE.md` imports the same document.
- App version and service-worker shell cache advance together to 2.31.2. The permanent offline data cache and saved-selection keys are unchanged.

Recommendation policy, alphabetical ties, evidence rules, collection schedules, authored strategy, observed figures and source dates are unchanged. This is an interface release, not a new strategic review or data collection.

## Release path and acceptance

PR #61 (`codex/product-companion-review`) targets `release/2.31.2`, initialized from the verified main baseline `280035853ccede73cc721a0c2f2b283930162655`. Review and checks precede any merge into that release branch. A later release-to-main promotion requires publication approval; installing the Windows copy requires its own approval, protected-data preservation and hashed rollback backup. This document grants neither approval and makes no deployment claim.

Verification scope and actual receipts are recorded in `docs/REVIEW-CORRECTIONS.md` and the PR checks on the exact commit. A release candidate, source archive or Vercel preview does not establish production deployment or Windows installation. Physical-device and real screen-reader testing remain separate acceptance work.

After a separately approved release, existing home-screen installations use **More → Check app update → Update app**. Do not clear browser data. Website rollback uses a reviewed source revert and normal publication; Windows rollback restores only verified program files from the release backup, preserving current data and preferences.
