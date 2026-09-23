# PR #61 independent-review correction pass

Recorded September 23, 2026. Both the local and remote feature heads were exactly Claude's reviewed `780f257f447fd33b5b7a330c825ce70d8084df00` before this pass; the worktree was clean. Main remained `280035853ccede73cc721a0c2f2b283930162655`.

## Accepted findings and corrections

1. **Release safety:** prepare 2.31.2, matching the app version, README, source manifest, release notes and shell cache. The data cache and storage keys stay unchanged. PR #61 is retargeted to `release/2.31.2`, initialized from verified main, without a merge. Source manifest status now describes an artifact whose installation/publication need separate receipts, rather than a claim that becomes false after release.
2. **Redraw focus:** the setup heading previously acquired `tabindex` only after activation and lacked a stable restoration key. It now renders a hero-and-role-specific ID and `tabindex=-1`. Existing focus restoration finds the same heading after a data redraw; switching hero identity does not transfer focus to the new heading. No generic focus-restoration rewrite was needed.
3. **Keyboard styling:** setup outline uses `:focus-visible`. Pointer activation is tested to have no outline; keyboard activation and redraw retain focus-visible treatment.
4. **Grammar:** one saved favorite uses the singular; zero and multiple favorites use the plural.
5. **Shared context:** `CLAUDE.md` imports `docs/AI-CONTEXT.md`. Durable rules cite existing README, workflows and 2.29 release/acceptance documentation. Dated Vercel setup facts no longer grant standing authority. The publisher key and `.local-publisher` were not read or packaged.
6. **Delegated clicks:** only noninteractive card content delegates to the hero button. Links, buttons, form fields, disclosures, role-based controls, focusable descendants and editable text keep their own interactions. The guard is scoped to descendants of the card, avoiding the surrounding focusable main container. Native hero keyboard activation, whole-card clicks and Back history remain covered.

The same-origin authentication fix remains in this PR, unchanged. No recommendation, source collection or strategy changes were made.

## Regression evidence and validation

The focused suite was written before the UI fix and reproduced lost redraw focus, singular copy and hijacked native controls on the reviewed baseline. One initial history assertion incorrectly assumed `view=hero`; it was corrected to the existing `hero=<slug>` contract and waits for asynchronous history recording. A first draft of the guard also blocked card backgrounds because it matched the enclosing main container's tabindex; the navigation test caught it and the guard was narrowed before acceptance.

| Check | Result |
|---|---|
| Python static/release tests | 217 run, OK, one existing skip |
| Node tests | 233 passed |
| Full browser audit | 146 passed |
| Focused review corrections | 15 passed each in Edge and WebKit |
| Product workflow | Six width/theme combinations each in Edge and WebKit |
| Visual polish | 50 checks each in Edge and WebKit |
| Visual redesign | 50 states each in Edge and WebKit |
| Companion flow | 36 checks each in Edge and WebKit |
| Update lifecycle | 14 checks each in Edge and WebKit, including the actual saved 2.31.1 shell upgrading to 2.31.2 |
| Six-bracket offline lifecycle | Nine checks passed; all six ranks reopened during a real server outage |

Browser suites reported no runtime errors or axe violations where those checks run. Physical-device, home-screen touch and real screen-reader acceptance are not inferred from those tests. The focused suite is part of `verify.yml`; its fixtures exercise behavior rather than merely matching source strings. Release-contract tests enforce app/cache/manifest agreement and keep release branches outside the publication trigger.

## Optional changes deliberately deferred

- Favorites still preserve the existing disclosure behavior; opening them by default could add clutter or override a user's collapse choice.
- The selected Quick Draft card already has a border and pressed state. New selected-state wording is optional and was not necessary to correct focus.
- Stacked-disclosure differentiation remains a design choice for a separate preview, not a confirmed functional defect.
- No additional badge-wrap change was warranted by the passing 390px, narrow and large-text visual checks.

## Release and infrastructure boundaries

Release notes are `RELEASE-2.31.2.md`. Final commit, exact-head CI, source ZIP and protected Vercel Preview receipts belong in PR #61 and the handoff. This report records the correction pass; it is not permission to merge, publish or install. The release branch only runs verification. GitHub Pages, installed protected data, automation branches and existing Vercel Production remain unchanged during this pass.

The existing Hobby Vercel project is used only for Preview. No project, database, Git integration, production promotion or deletion is part of this pass. Preview data retains its original dates and is not a newly collected publication. Main-branch and Windows release approvals remain separate.

## Remaining limitations / review focus

Quick Draft's neutral ties, alphabetical ordering and generic explanations are unchanged and require a separately scoped recommendation review. Source availability, older dataset labels and overdue strategic guidance remain honestly exposed. No claim is made that this UI correction pass resolves them.

Claude should verify the exact final PR commit, confirm the release base, reproduce the focused suite and inspect heading identity when hero/role changes. Inspect the guard with new interactive descendants and confirm actual 2.31.1-to-2.31.2 update behavior before any release decision.
