# 2.30.0 — quick mobile companion

Mobile navigation is Meta / Plan / More. Opening a hero leads to one build; alternatives,
five partners with role variety, counterplay and kit details are separate focused views.
Full details retains the original evidence, variants, community builds and reference routes.
Desktop keeps its full reference navigation and gains the same optional quick draft.

Quick draft offers at most three candidates and an optional three-hero pool per role.
Picks and bans stay shared with compositions and match advice. Suggestions stay in place
until explicitly regenerated; newly banned, taken or role-conflicting picks are disabled.
The pre-match setup leads with augment, Eternal, blessings and crest.

A selected source playstyle now has a hero/role/rank/patch identity and exact recipe and
mechanics preconditions. Statistics-only changes or reordered source variants can retain
it; changed loadouts, missing/ambiguous variants, mechanics and patch/rank changes require
reselection with a visible explanation. The old coach ignored variant selection; it now
uses the selected core when the reviewed kit preconditions match. A different augment or
Eternal remains inspectable, but does not borrow the default build's mechanics review.

Build and Live expose named skill points for levels 1–18. Observed orders retain their
own sample/date. Calculated allocations explicitly need review. No strategy or skill-order
review date was advanced by this UI release; source rates and bundle dates are unchanged.
The separate September 22 post-patch Codex trial covers five plans, not all 93.

## Verification and release state

The staged checks passed: 146 evidence regressions; 199 Python checks (one skipped);
213 JavaScript checks; 60 rank/role cases, 60 navigation states and 6 fresh links per
browser engine; 36 quick-flow layout/accessibility states per engine; 24 Plan states
per engine; 57 desktop and 50 phone static checks per engine; 30 extended accessibility
states; and 9 offline lifecycle checks. The actual 2.29.1 → 2.30.0 upgrade opened the
new shell offline while retaining picks and original source dates in Edge and WebKit.
The Windows local server passed selected-build, adaptation and persistence checks.
See `RELEASE-2.30.0-VERIFICATION.json`; packaging, installation and deployment have
separate receipts. WebKit on Windows is not a test on an actual iPhone.
The approved prototype was ported onto production's existing rank loading, lazy evidence,
local server, export, browser history and service-worker data cache. No new runtime service,
account, model download or paid API is introduced. The shell cache advances to 2.30.0;
the verified-data cache identity is unchanged.

Existing detailed evidence regressions deliberately select Full details. New companion
tests exercise the default quick flow. Navigation expectations change from four phone
destinations to three, and partner disclosure expectations from three leading cards to five.
Rank checks now follow the actual source policy: absent or outdated Pred.gg samples must
not be invented just to satisfy an old fixture expectation.
The legacy loadout inspection visits every authored hero/role directly, because statistical
table coverage is smaller than planning eligibility. No evidence assertion was waived.

Real-device touch and screen-reader acceptance cannot be claimed from desktop automation.
Exact skill schedules not individually reviewed remain pending. An observed difficult
matchup is not proof of a hard counter; thin/missing evidence never pads named suggestions.

## Rollback

The Windows installer creates a dated, checksum-verified source backup and a
`Roll Back 2.30.0.bat` launcher. Quit the local app before running it. Data, settings,
snapshots and authored guidance are preserved. The public site can be rolled back by
reverting the release merge and rerunning the existing publication workflow; keep the
data-updates and automation-state branches intact.
