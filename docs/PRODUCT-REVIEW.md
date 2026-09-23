# Product improvement review — 2026-09-23

Baseline: `origin/main` at `280035853ccede73cc721a0c2f2b283930162655`, release 2.31.1. This is a feature-branch review, not a release or a new strategy review.

## Architecture and decisions

Official notes + Statz + optional public Pred.gg + Omeda → Python collectors and guarded corrections → dated JSON per bracket → static publisher → hashed core and lazy evidence → JavaScript engine → desktop reference / phone companion. GitHub Actions collects; GitHub Pages serves. Local Python also serves the same UI over loopback. Picks/preferences live on the device. There is no product account, database, Supabase dependency or React build.

Inspected the implementation of rendering/state, companion overrides, recommendation eligibility, static delivery, local/shared servers, patch handling, package/test configuration and both Actions workflows. Visually inspected live Meta, hero, Plan, More and Sources on phone and desktop. Screenshots are captures, not proof of physical-device acceptance.

Keep: six separate cohorts, explicit unavailable/previous evidence, actual source dates, pure recommendation engine, local state, lazy evidence, offline validation, both themes, shared Plan lineup and existing navigation. No evidence justifies adding Supabase or changing frameworks/hosting. Vercel is requested only as a review preview; existing project/access must be established first.

## Prioritized findings and implementation scope

| Priority / status | Problem and evidence | Solution / benefit | Difficulty / risk | Acceptance |
|---|---|---|---|---|
| P1 / implement | Phone Meta is 4,486px tall for 24 Jungle heroes. `heroTile` / final companion CSS give every hero a 90px identity plus repeated CTA and source row. | Compact, aligned roster rows; keep WR, games and previous-dataset labels. Make the card's main area a hero target. | Low / medium: long names, zoom, favorite button overlap. | Full list and original figures survive; materially shorter identical-data capture; 44px targets, no overflow or intercepted favorite actions. |
| P1 / implement | Phone build starts below a tall header and section controls; pre-match choices begin below the first viewport. `mobileHero`, `simpleBuildHTML`, companion CSS. | Compact identity and spacing; keep complete loadout and purchase sequence, prominent review date and patch warning. Preserve existing section buttons/deep links. | Low / medium: first-screen density and text scaling. | Same five loadout choices and six purchases; top loadout choices appear earlier; both themes and large text pass. |
| P1 / implement | Quick Draft scrolls to its setup but leaves keyboard focus on the old candidate button (`quickPreview` handler). Three vertically expansive cards separate selection from setup. | Compact shortlist cards with an explicit selected state; move focus to the setup heading after selection. Never auto-refresh choices during a timed decision. | Low / medium: focus restoration, stale evidence. | Keyboard activation lands at the selected setup; bans still block it; publication changes withdraw it; at most three candidates. |
| P2 / implement | Favorites/recent are below the entire role list (`guidedHome`), defeating their shortcut purpose. | A compact, collapsible saved-hero shortcut above the list, using existing saved state. | Low / low. | Favorites and recent remain reachable, deduplicated, without duplicating full stat cards or replacing the complete roster. |
| P2 / implement | Context for future agents is spread across release history; no shared AI context file/pointer. Historical README schedules differ from the current strategy policy. | Shared current architecture/constraints/testing entry point; label historical notes as history. | Low / low. | One context file; no new schedule or alleged AI review. |
| P2 / investigate | Several layers replace global renderer functions; full redraw restoration is complex (`mobile.js`, `companion_simple.js`). | Extract responsibilities incrementally only when a behavior defect warrants it. Avoid a speculative port. | Medium / high. | Preserve history, focus, disclosure and selected-build identity tests before extraction. |
| P2 / investigate | Remote art did not load in the live baseline capture; readable initials/names survived. Could be source access or test environment. | Retain fallback; independently diagnose delivery before caching/rehosting assets. | Medium / medium. | Establish exact failing origin/status; no constructed filenames or unauthorized mirrors. |
| P2 / deferred | Desktop hero contains a full reference (6,892px in baseline). It intentionally includes more evidence than phone. | Consider a desktop compact reading mode after testing the phone changes; keep reference available. | Medium / medium. | No data/evidence loss; user tests distinguish reduced nesting from omitted content. |
| P1 / separate recommendation review | With no allies selected and current role statistics unavailable, Quick Draft can tie on kit fit and show alphabetical candidates with generic explanations (`refreshQuickDraft`, `E.recommend`). The live fixture starts Akeron/Aurora/Bayle. | Evaluate readiness-aware ordering and a better explanation of neutral ties; preserve personal pools, evidence exclusions and stable suggestions. Kept separate from presentation changes because it changes which heroes are recommended. | Medium / medium. | Fixtures for empty team, known allies, available vs unresolved starting builds, bans and all three locked-slot cases; never imply a neutral tie is superior measured performance. |
| P2 / open external gate | No linked Vercel configuration or authenticated Vercel session was found. | Use only an existing user-owned project for preview once identified. | External dependency / low if isolated. | Actual preview URL/build receipt; never label localhost or GitHub production as a Vercel preview. |

No confirmed P0 security or data-integrity defect was established in this bounded pass. This is not a penetration test. Local/shared mutations check origin, host and a session token; external links are escaped and scheme-filtered. Public data and personal preferences are separated. Backend changes, database migration and new authentication would add complexity without a demonstrated benefit.

## Design alternatives considered

1. Tile grid: attractive art, but long names, sample labels and 320px widths create uneven reading order.
2. Compact roster rows (chosen): fastest comparison and least regression risk; all heroes remain present without pagination.
3. Only favorites/top five: shortest but hides the full roster and can imply unsupported ranking; rejected.

For builds, retain explicit section controls and progressive disclosure. Do not replace them with icon-only controls, hide important staleness warnings, or add a second sticky rail. For Draft, preserve the existing lineup editor and deliberately stable shortlist instead of another wizard/countdown.

## Validation / remaining gates

Use current Python/Node suites and browser evidence/offline tests, plus focused density, favorite-hit-target and keyboard setup checks. Capture the same saved dataset before/after; synthetic observations are for tests only. Check 320/390 phone, 1440 desktop, short landscape, both themes and 200% text. Report physical phone and screen reader checks as not run. No runtime lint/typecheck exists; use JS syntax checks and Python tests, without introducing a framework.

Release approval is separate. This branch must not be merged, installed or deployed to production during this task.
