# 2.29 redesign — acceptance criteria per stage

The prototype in `prototype-2.29-design/` guides **presentation only**. Its data and its
recommendation logic are mock; neither is copied into production. Every number on screen
keeps coming from the publication and from `engine.js`.

## Standing conditions, every stage

1. **Production data, recommendation logic and saved selections stay intact.**
   `git diff <base> -- engine.js` is empty unless a change is justified separately.
   Saved-selection storage keys are unchanged; a reload, a rank change and a theme change
   all preserve picks, locks, enemies, bans, favourites, rank, theme and reading preferences.
2. **Mock logic is not ported.** No figure the prototype invented appears in production.
   The engine's own fields are rendered as they are emitted — `base_a`, `base_b`, `lift`,
   `lift_mean`, `beats_both`, `interval95`, `MIN_PAIR_GAMES` — never recomputed in the view.
3. **Legacy routes and shared links keep working.** The hash contract
   `#hero=<slug>&role=<role>&bracket=<band>&tab=<tab>` resolves for every value in use,
   including `tab=` names that now address sections rather than tabs. A link that worked
   before the stage works after it.
4. **Regression checks pass** for the surface the stage touches, and a **phone and desktop
   preview** is captured before the PR merges.
5. **Installation and publication are separate approvals**, as for 2.24.0–2.28.2.
6. **Probes first.** Each stage adds its probes to `tests/browser_audit_regressions.cjs`
   with `tests/known-defects.json` entries, each shown to fail before its fix.
7. **DOM contracts** are kept unless the redesign requires otherwise; then the affected
   test is updated in the same commit, with the reason in the commit message.

---

## Stage 1 — tokens and typography

**Scope:** colour roles, type scale, spacing scale, both themes. No markup moves, no copy
changes, no information architecture.

Accepted when:

- Every colour, space and type size in `ui.html` / `mobile.css` resolves through a token
  declared on `:root`, with the light theme redefining tokens only — never component rules.
- The four evidence classes keep distinct, non-interchangeable treatments in both themes:
  **observed**, **calculated**, **reviewed**, **official text**. No class inherits another's colour.
- Contrast: axe (WCAG 2.1 A/AA) clean on the existing phone-state sweep, both themes.
- No layout budget regresses: status chrome ≤ 132 px desktop and ≤ 76 px from the patch
  strip on the six-rank site; phone tab strips do not scroll; every tab ≥ 44 px.
- Screenshot diff reviewed at 320/360/390/412 and 1280/1440/1920, both themes, Edge and WebKit.

## Stage 2 — shell and navigation

**Scope:** top bar, navigation, the freshness strip, status and notices.

Accepted when:

- The freshness strip **wraps rather than scrolls**, and its details control is on screen at
  every width from 320 px up. Material notices stay visible without opening anything.
- Retained data is labelled in **neutral** chrome with its own date. It is a date, not a fault,
  and never wears the warning colour.
- Sticky chrome never covers a focused control: every control on every route, focused with the
  browser's own scrolling, is on screen and clear of the bars — at 390×844 and at 320×256.
- Below 480 px tall (what 400 % browser zoom produces) the chrome yields: reflow with no
  horizontal scroll **and** enough readable height to use the page.
- Deep links and saved selections unaffected; `#main` stays `<main id="main" tabindex="-1">`;
  one `<h1>` per screen on every route and viewport.

## Stage 3 — hero screen

**Scope:** the jump row, the loadout, per-part evidence labels, disclosures, partners, counters, kit.

Accepted when, in addition to the standing conditions:

- Every observed figure prints **its own cohort**, its sample size and its collection date.
  A broader-population figure is never labelled as the selected rank band.
- **No calculation crosses cohorts.** A pair rate and the baselines it is compared against come
  from the same pool, as `engine.js` produces them.
- Every part of a build says whether it was **observed** (with its purchase rate *and* its sample
  count) or **substituted** by the engine (with its reason, and "no direct sample").
- `tab=builds|pairings|counters|kit` land on the matching section.

### Statistical wording — required, and tested

These are acceptance criteria, not style preferences. Each has a probe.

- **The Wilson interval describes the observed pair win rate. It is not an interval for the
  calculated lift.** The screen says which quantity it belongs to, next to that quantity, and
  never presents it as uncertainty in the gap. Wording in use: *"95% interval on 214 games:
  49.8–63.0%"* attached to the pair rate, with the consequence stated separately.
- **"Beats both baselines" is an observed point-estimate comparison, not proven synergy.**
  It states that one measured rate is higher than two other measured rates. It must not be
  worded, coloured or positioned as evidence that the pairing causes the improvement.
- **The lift is a difference between point estimates.** Describe it as the gap against the
  stronger overall baseline — never as an effect, a bonus, a synergy score or a prediction.
- **"Overall baseline" is the label for `hero_wide`.** Never "alone" or "without this partner":
  those games include games played with this partner, and describe performance across all
  roles, not performance apart.
- The 100-game line stays **eligibility, not confidence** — a size threshold, said in those words.

## Stage 4 — plan

**Scope:** the shared line-up across compose, draft and live.

Accepted when the existing validation is reused — `engine.js` `validPicks` and
`recommend(picks, {bans, enemies, …})` — rather than reimplemented; picks carry a role; one
hero appears once; one role per side; a banned hero is withheld from suggestions rather than
greyed out; and saved selections survive a reload and a rank change.

## Stage 5 — reference and sources

**Scope:** playbook, official item text, changes, sources and accuracy.

Accepted when every source states its scope, status and date; the description-review status
keeps its existing rules, including withdrawal on a hotfix that does not change the version;
and the full Changes history and rank-comparison tool remain reachable.
