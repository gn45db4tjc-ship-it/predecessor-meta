# Predecessor Meta 2.23.0 — Mobile Meta and dependable refresh status

The phone home page is now a Meta dashboard. It opens on Jungle with role chips, hero search, local favorites, recent heroes, five leading picks, and valid same-rank changes. The former Role → Hero → Opponent wizard is removed. Hero pages open on Build, followed by Partners, Counters, and Kit. Bottom navigation is Meta, Builds, Comps, Draft, and Live.

Builds uses compact expandable rows. Compositions and Draft keep picks and constraints first and limit the initial result set to three suggestions on phones. Live retains the next-item coach and moves lineup detail behind focused controls. Item and hero art now tries verified fallbacks before showing initials or names.

## Data updates

GitHub remains the daily collector, independent of the owner PC. The public manifest now separates core Statz statistics, Omeda mechanics, official patch verification, reviewed guidance, and optional Pred.gg health. Core freshness is labelled Current through 30 hours, Aging through 48 hours, Stale after 48 hours, or Unavailable. Optional Pred.gg failure remains visible without making fresh Statz data look stale.

Required-source transient failures receive at most two automatic retries, at least three hours apart. Blocking responses such as HTTP 403 or 429 wait for the next daily window. Pred.gg never triggers these retries. Patch and hotfix changes retain their existing priority window.

The browser checks on open, when returning after 15 minutes, and every 30 minutes while visible and online. It downloads a cohort only when its checksum changes. The public action is named **Reload latest data**. Statistics update automatically; authored strategy remains a dated human review. A due badge and downloadable 93-plan review packet support the weekly or patch-priority review.

The workflow keepalive record is written to the dedicated `automation-state` branch, so scheduled activity can no longer move `main` behind or ahead of a release.

## Verification

- 97 Python tests pass, including bounded retry, blocked-source, and optional-source separation cases.
- 78 JavaScript engine tests pass.
- Mobile browser acceptance passes at 320, 375, 390, 412, 844, 1080, and 1440 CSS pixels, all six brackets, offline restoration, favorites, links, themes, and saved match state.
- Axe WCAG 2.1 A/AA checks pass for both themes and all tested routes; keyboard dialog focus and 320 px large-text reflow pass.
- Desktop acceptance passes for complete 2/3/5 suggestions, unique roles, locks, bans, shared plans, standalone export, missing cohorts, and retained data after publication failure.

Physical iPhone/Android installation, VoiceOver/TalkBack, and native Windows display scaling remain device acceptance items. No source rates, samples, reviewed plans, saved drafts, or owner settings were rewritten by this interface release.
