# Predecessor Meta 2.22.0 — Mobile companion and Build Coach

The phone app now starts with Role → Hero → optional Opponent. Five bottom tabs expose Heroes, Builds, Draft, Live and More. All previous tools remain available. New users can prevent conflicting picks, recover removals with Undo, share a hero view, and keep the next completed item visible while scrolling.

## Build Coach

The same pure engine serves desktop builds, mobile hero lookups and Live game. Choose your own ahead/even/behind state, primary enemy threat and urgent need. The coach preserves reviewed core items and entered completed inventory, changes at most two flexible positions, and explains mechanics and purchase timing. It never proposes a sale or a fabricated build win rate. Rank evidence is restricted to compatible current observations with at least 100 games collected within 30 hours. Old observations remain inspection-only.

An unavailable or invalidated review produces an explicit unavailable result. Existing reviewed plans and all source figures are unchanged. The saved six-bracket evidence was used for this interface release; this release does not claim a new collection or strategic review.

## Phone usability

- Progressive lineup entry, search, recent heroes, guarded options and contextual hints.
- Bottom next-item dock with a Situation dialog; no need to scroll back to change inputs.
- Eight-second Undo; timer pauses while the banner is focused or hovered.
- New match resets inventory and live judgments while retaining planning picks and preferences.
- Live context is session-only; old persistent inventory is no longer restored. Planning picks remain persistent.
- Hero links include only hero, role, rank and tab. Draft sharing remains separate.
- More contains full reference/planning tools, theme and large-text settings, export and installation help.
- Offline views keep original dates. Failed network/HTTP responses can reopen cached content with a visible cache indicator. Invalidated guidance stays unavailable.
- Phone safe areas, minimum 44px control targets, large text, reduced motion, keyboard dialogs, focus recovery and both themes.

## Verification

- 78 JavaScript engine tests, including 36 focused Build Coach regressions.
- 92 Python publication and inline-rendering tests.
- 93 saved hero/role reviewed plans produce an available baseline through the new engine.
- 42 browser companion checks: wizard, inventory/session restoration, Undo, invalid links, six brackets, theme, large text, offline cache and no browser exceptions.
- Desktop acceptance covers 2/3/5 suggestions with locks/bans/unique roles, shared draft preview/import, standalone exports, source failure and missing cohorts.
- Microsoft Edge layout checks: 320, 375, 390, 412 and 844 CSS-pixel widths; 1920×1080, 2560×1440 and 1536×864 desktop viewports.
- Axe WCAG 2.1 A/AA scans passed for 11 mobile views in both themes; keyboard dialog and reflow checks passed. An insufficient-contrast light-theme rank label was corrected.

Automated browser emulation is not physical-device verification. Native iPhone/Android installation, VoiceOver/TalkBack, and native Windows display scaling still need device acceptance. The 1536×864 viewport exercises the effective workspace size of a 1080p display at 125%, rather than changing Windows settings. Existing historical design tests describe the older navigation; the new companion tests exercise its replacement.

## Install, share and rollback

Open https://gn45db4tjc-ship-it.github.io/predecessor-meta/ . On iPhone use Safari → Share → Add to Home Screen; on Android use Chrome → Install app / Add to Home screen. Previously installed PWAs use the updated page when reopened online.

The Windows installation creates a hashed `backups/pre-2.22.0-*` directory and `Roll Back 2.22.0.bat`. Quit the local app, run that launcher and reopen to restore 2.21.8. Data, snapshots and settings are preserved. Restore public source by reverting the release commit and deploying through the existing Pages workflow; keep the data branch and original collection dates.

The source ZIP contains only the explicit public source allowlist and tests. It excludes local settings, saved picks, collector storage, credentials, private keys and QA caches.
