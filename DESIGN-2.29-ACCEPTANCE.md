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

## Stage 2 — shell foundations *(done: #42)*

**Scope as built:** the freshness strip, status and notices, and the behaviour of the
chrome — focus, scroll-padding and short-viewport reflow. It did **not** reorganise
navigation, and must not be read as having done so.

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

## Stage 2b — the four destinations *(implemented; review pending)*

The redesign's navigation — **Meta, Plan, Reference, Sources**, with heroes opened from
Meta — is implemented on `codex/navigation-stage2b`, based on PR #45 at `03068f8`.
PR #45's GitHub verification completed successfully on that exact commit. Neither branch
has been installed or published by this handoff.

**Scope:** the destination structure itself, and every route that reaches it.

Accepted when:

- **The four destinations exist** and each of the thirteen live routes lands somewhere,
  exactly as `prototype-2.29-design/FEATURE-MAP.md` assigns it. Nothing is dropped.
- **Legacy route mapping.** Every route name in use today still resolves:
  `meta`, `builds`, `planner`, `draft`, `live`, `library`, `guidance`, `changes`, `data`,
  and the hero tabs `builds`, `pairings`, `counters`, `kit`. A name that addressed a tab
  now addresses a section, and is scrolled to. No name 404s or silently lands on Meta.
- **Active navigation state.** Exactly one destination is marked current at a time, with
  `aria-current="page"`, on every route including a hero page opened from Meta and each
  optional Plan stage. A section within a destination never marks a second one current.
- **Browser Back and Forward.** Moving between destinations, opening a hero, and changing
  a Plan stage each leave a history entry, and Back returns to the previous one with its
  scroll position and saved selections intact. Back out of a hero returns to the field it
  was opened from, in the role it was opened in.
- **Shared links.** A URL copied from the address bar reopens the same screen in a fresh
  browser, with no stored state: `#hero=<slug>&role=<role>&bracket=<band>&tab=<tab>`, and
  the destination and stage forms. An unknown hero, role, band or tab degrades to a valid
  screen and says nothing false.
- Saved selections, offline data and the export snapshot keep working across all of it.

Each of these gets a probe before the change, as the standing conditions require.

### Implementation and verification boundaries (2026-09-21)

- The primary navigation has four destinations on both layouts. Plan exposes Compose,
  Draft and Live as optional stages. Reference exposes Playbook (starting builds and
  reviewed guide), Items & loadouts and What changed. Sources retains the full accuracy
  screen and app settings. Existing screen IDs and saved-selection keys remain intact.
- Only the visible primary navigation has `aria-current="page"`. Section controls use
  `aria-current="true"`; all new navigation controls are at least 44 pixels tall.
- History entries checkpoint screen, role, search, disclosure state and scroll when
  leaving a screen. They do not contain picks or inventory, and scrolling does not write
  history. Back/Forward restores the view without rolling back edits to the shared picks.
- Canonical links use `view=plan&stage=compose|draft|live`,
  `view=reference&section=playbook|guidance|items|changes`, and `view=sources`.
  They include the selected bracket; Meta and starting builds also include their role.
  Legacy route names and the hero/role/bracket/tab contract still resolve.
- Startup waits for a linked cohort instead of replacing the requested URL with the
  initial Gold screen. The static adapter no longer resets the route and hero on a rank
  change. Local links adopt a newly loaded matching cohort without repeatedly requesting
  the same settings change. These are navigation corrections, not statistical changes.
- The What changed source selector is constrained to its container after the 320-pixel
  check found it exceeding the available width.

N1–N5 reproduce on `03068f8` before these changes (`qa/navigation-before.json`).
N6 separately reproduces the local cohort retry on the preceding staged shell
(`qa/navigation-local-before.json`). `browser_navigation.cjs` additionally checks both
themes, desktop/phone/short-viewport layouts, keyboard navigation, six independent fresh
rank links, rank changes and reloads. Its screenshots and receipts are under ignored `qa/`.

The five existing browser harnesses use `navigation_helpers.cjs` to click the real
destination and section controls. The static harness adapts the seven historical suites'
navigation setup while retaining their content assertions and all nine screen checks.
This deliberately replaces the retired flat-menu assumption; it does not remove tests
because a button moved. The older general design/revision harnesses receive the same
navigation compatibility change; running them is distinct from the current acceptance
suite and is not implied by these notes.

**Still separate:** Stage 4's compact shared roster and Plan presentation, Stage 5's
content layout, native-device/screen-reader acceptance, merging, installation and
publication. The existing Plan and Reference content is retained, not declared redesigned.

## Stage 3a — build evidence labels *(done: #43)*

**Scope as built:** the categories and supporting evidence of a build's parts, in the Build
Coach. It did **not** rebuild the hero screen, and must not be read as having done so. The
jump row, the loadout layout, the disclosures, partners, counters and kit are **Stage 3b**.

Accepted when, in addition to the standing conditions:

- Every observed figure prints **its own cohort**, its sample size and its collection date.
  A broader-population figure is never labelled as the selected rank band.
- **No calculation crosses cohorts.** A pair rate and the baselines it is compared against come
  from the same pool, as `engine.js` produces them.
### Build labels — the engine's categories, not a two-way split

An earlier draft of these criteria asked for every part to read "observed or substituted".
That is not what the engine produces, and forcing its output into two buckets would
mislabel most of a build. The categories below are the ones `engine.js` actually emits,
and the screen uses these and no others.

| Category | Where it comes from | What the screen must say |
|---|---|---|
| **Reviewed recommendation** | `plannedBuild` returns `kind:'reviewed'` when `buildReview` is active for this hero and role. Slots carry `label:'Reviewed core'` or `'Reviewed flexible slot'` | Written by a person for a stated patch and band. The patch is named |
| **Observed choice** | `plan.manual === true` — the reader selected a source playstyle (`title:'Selected source playstyle'`), so the sequence is the one that variant was observed to use | The source and the variant are named, with the variant's own sample |
| **Calculated starting selection** | `plannedBuild` returns `kind:'provisional'`; slots carry `label:'Calculated starting sequence'` | Derived by the engine from observed variants plus official item data. Not counted, and not authored |
| **Substitution** | A slot whose `kind` became `'need'`, recorded in `swaps[]` with `from`, `to`, `position` and `reason` | What it replaced, in which position, and the need it answers |
| **Owned item** | A slot whose `kind` is `'owned'` (`label:'Owned · kept'`) | Kept because the reader owns it, not chosen by anything |

Rules that follow, each with a probe:

- **A supporting statistic never changes a part's category.** Every slot may carry
  `measured` — a purchase rate from the item pool. On a reviewed core, on a calculated
  starting selection, on an owned item, that rate is *supporting evidence shown beside the
  choice*. It must never be presented as the reason for the choice, and must never make
  the part read as an observed recommendation. The category label is what the engine set;
  the rate sits next to it, attributed to its own source.
- **Every observed figure still carries its sample size and its collection date.** A rate
  without its sample is not evidence, whatever it is supporting.
- **A part with no statistic says so plainly** and nothing is estimated in its place.
- **`swaps` and `unmet` are shown, not summarised away.** A need the engine could not
  answer is named; a need answered by an existing slot says which slot answers it.
- **The whole six is never presented as an observed loadout.** The engine says so itself
  (`caution: 'The full six combines source choices; no full-loadout win rate is inferred.'`)
  and the screen carries that, not a combined rate.
- `tab=builds|pairings|counters|kit` land on the matching section.

### Provenance rules added after review

- **A purchase-timing change is not a substitution.** `engine.js` sets `slot.timing` when it
  moves an item **earlier**; the item is unchanged. Only `slot.kind === 'need'` replaces one.
  The two carry different labels, and neither is mistaken for an untouched part.
- **A supporting percentage is a win rate**, and says so.
- **An observation keeps its own provenance.** `currentItemPool` merges the **largest**
  observation across purchase positions onto an item, so the sample shown beside slot 4 may
  have been recorded at position 3. The screen carries the observation's own position, its
  cohort and its collection date, and **says when that position is not the slot it sits
  beside**. A sample is never implied to belong to the displayed slot unless it does.

  Only a **Statz core-sequence** observation lacks an individual purchase position;
  `measuredItemPool` records its fourth-, fifth- and sixth-item rows against positions 4, 5
  and 6, and those keep their positions like any other. The "recorded against a variant
  sequence" note is for the core row alone.
- **An exclusion states the engine's reason, not a guess.** There are four: a Statz
  observation is inspection-only by construction; a Pred.gg one loses support when it is
  under the 100-game minimum, older than thirty hours, or dated in the future. Where the
  reason is known it is given. Where it is not, the screen says only what is true — that the
  observation is inspection-only and does not support automatic selection. No blanket
  "too small or too old".

## Stage 3b — the hero experience *(done: #44)*

**Scope as built:** the loadout, the pairing statistics, and the readability of content under
the sticky summary. The tab-to-section conversion is **Stage 3c**, below.

Accepted when:

- **The jump row** replaces the four tabs that hide each other: Build · Partners · Counters ·
  Kit, sticky, with `tab=` deep links landing on the matching section (Stage 2b's contract).
- **The full loadout** — six items, augment, Eternal, both blessings, crest and its evolutions
  — is present, each part carrying its Stage 3a category and supporting evidence.
- **Partners** render the engine's own pair record: both `hero_wide` baselines, `lift` against
  the **stronger** one, `beats_both`, and `interval95`, with the statistical wording below.
- **Counters** keep the reviewed counterplay first and the 100-game split, with the thinner
  rows in a closed disclosure.
- **Kit** carries official text with its corrections.
- The complete evidence tables stay reachable and searchable rather than summarised away.
- One `<h1>`, no horizontal scroll, and the phone coach reachable — today the Build Coach
  renders only on desktop on the hero page; on a phone it is on the Live route.
- **The sticky "Next purchase" summary stops covering its own list.** Done. `.coach-next` is
  chrome that lives inside `main`, which the Stage 2 scroll-padding never accounted for, so a
  row scrolled or tabbed to the top landed 140 px underneath it. It now joins that watch list
  and publishes its own height for the list it covers. *(Corrected in Stage 3c: the watch list
  counted it even where it was not stuck, which could push the page's scroll padding to
  440 px. It now publishes only its own height, measured from where it actually pins.)*

### Evidence selection rules, added after review

- **An interval reading has four cases, not two.** Below the baseline, overlapping it, above
  it, and unavailable. Testing only the lower bound described an interval sitting entirely
  *below* the baseline as one that includes it. A bound that touches the baseline is an
  overlap. Every reading keeps the two kinds of uncertainty apart: the interval describes the
  **observed pair win rate**, and is never an interval for the calculated gap.
- **A card uses the hero and role of the plan it is drawing.** `plannedBuildHTML` is reused by
  Builds and by Live, so reading `S.hero` could show a previously opened hero's evidence. The
  plan carries its own `slug` and `role`; those are used and `S` is not consulted.
- **No cache between a card and the engine.** A key of hero, role and bracket does not change
  when the publication does, so refreshed data was served from a stale entry. The lookup runs
  once inside the function that draws the card and is passed down.
- **Evidence must be evidence of the part it sits beside.**
  - `currentItemPool` holds **item** observations. An augment, an Eternal and a blessing are
    not items, and are never looked up there.
  - The sample for an augment and an Eternal is the **source variant whose perk and Eternal
    are the recommended ones**. Any other variant describes a different loadout. The sample
    describes the pair together, and says so.
  - A blessing's sample is the row of that variant with **that blessing's name**. The
    summary's own top blessing is not a substitute: Countess is recommended *Tithe of Death*
    and *Mind Rot* while `buildSummary` reports *Lich* and *Millennia*.
  - A crest's evolutions are shown only when that variant's crest **is** the recommended
    crest, its mid form, or one of its evolutions — `plannedBuild` may name an upgrade as the
    recommendation, as Murdock's *Liberator* is an upgrade of *Marksman Crest*. When it is a
    different crest, the screen says so and estimates nothing.
  - **Finding a crest's family is not finding its sample.** Membership says which rows are
    relevant; the recommended crest then shows **its own** row. A recommended final upgrade
    shows the upgrade's figure, never its parent's. A mid form has no row of its own in this
    source and says so, borrowing nothing. An upgrade whose row carries no figures says so.
  - **The crest path is stated, not implied**: base, mid form, final upgrade, with the
    recommendation marked where it sits. A recommended *final* upgrade does not evolve again,
    so its siblings appear as alternatives to it, not as next steps; a recommended base crest
    lists its final upgrades as what it evolves into, each with its own figure.

## Stage 3c — sections and searchable evidence *(this PR)*

**Scope as built:** the four hero tabs that hid each other are now four sections on one page,
reached by a sticky jump row; `tab=` links land on sections; the evidence tables are
searchable. It does **not** build Stage 2b's four destinations, which stay pending below.

Accepted when, in addition to the standing conditions — each with its probe, each shown to
reproduce on `fa4066f` before the change:

- **S1 — every section is on the page.** Build, Partners, Counters and Kit render at once, in
  that order, none hidden, as `section#hero-sec-<tab>`. Each keeps **its own source line**:
  section-scoped freshness survives the merge. One `<h1>`.
- **S2 — the jump row is navigation, not a tablist.** Tabs claim panels that hide; nothing
  hides now. A `<nav>` of buttons, one marked `aria-current="true"`, each at least 44 px tall.
  A press brings its section to the top edge of the content, clear of the sticky chrome, and
  focus stays on the button pressed. Scrolling updates which button is current and writes
  **no** history entry (WebKit throttles `replaceState` to 100 calls in 10 s).
- **S3 — every `tab=` name ever issued lands.** `builds`, `pairings`, `counters` and `kit`
  each open with that section at the top and marked current, on a phone. Evidence arrives after
  the first draw and redraws `#main`; the section being read is captured before a redraw and
  restored after it, because replacing the DOM defeats the browser's own scroll anchoring —
  without that a link to Partners ended 1,400 px below it.
- **S4 — one page is not longer than the worst tab was.** Partners alone ran to 23,000–28,000
  px on a phone. The first three partners stay in view; the rest move into a closed disclosure
  whose summary states how many it holds. **No card is lost**: every partner the engine
  returns is on the page. Budgets 16,000 px desktop, 23,000 px phone.
- **S5 — complete evidence, searchable.** Build and Counters each carry a search box over every
  evidence row (`.choice` and table rows). A search hides non-matching rows, says *"Showing N
  of M evidence rows"*, opens any disclosure holding a match, keeps focus in the box, and
  clearing it restores every row. A table the search leaves empty is set aside rather than
  left as a bare header, and returns when the search is cleared. Nothing is summarised away.
- **S6 — drawing four sections stays cheap** (guard): a hero redraw under 80 ms.
- **S7 — Kit labels retained Pred.gg data like every other section.** See below.

**Measured on the staged Gold+ seed** (Countess, Steel, Murdock): every jump lands at the
content edge (65 px on desktop and phone); page height 6,030–8,375 px desktop and
10,470–15,844 px phone, against 7,700–10,300 and 23,000–28,000 px for the Partners tab alone;
48, 47 and 45 partner cards all present; a redraw 22–29 ms.

### Assertions re-scoped, and why

The rule each guards is unchanged; only where it looks has moved, because a page that used to
hold one tab now holds four.

- **V1** — *"Build shows no other role's Statz link; the other tabs label the hero-wide page."*
  It read all of `#main` while checking Build, which now also holds Partners' correctly
  labelled hero-wide link. It reads `#hero-sec-<tab>`.
- **V7** — *"Counters lead with reviewed counterplay."* It compared the reviewed block with the
  first table in `#main`, now the Build section's evidence table. It reads `#hero-sec-counters`.
- **Y5** — read `aria-selected`, a tablist attribute. The jump row marks `aria-current`.
- `mobile.js` slices the phone hero at the jump row rather than the tablist.

The static, ranks, companion, companion-accessibility, offline and release-2.22 suites pass
unchanged.

### A pre-existing defect the merge exposed — a product change, flagged for review

`predSourceHTML` labelled retained or stale Pred.gg data only when called for statistics.
The Kit section's call was not, so with Pred.gg retained every Kit source line read
*"Pred.gg · cached <date>"* with no *Saved* label and no *"retained from an earlier
collection"*: outdated ability text presented as current. It was already so on `fa4066f`
(7 Kit lines, none labelled). V3 never opened Kit; with every section on one page it does,
and caught it. The label is now applied whatever the call: current data reads as before;
retained or 48-hour-old data reads *Saved <date>* and, when retained, says so. This changes
what Kit shows, so it is called out here rather than folded in silently.

### Stage 3c follow-up — search isolation and restoration (2026-09-21)

Independent verification of `11d8bc7` found three search defects. S8–S10 were run
before the fixes and reproduced each defect; the receipt is retained locally as
`qa/search-before.json`.

- **S8:** the `.choice` display rule overrode the browser's hidden attribute, leaving
  40 non-matching choices painted despite a zero-results count. A section-scoped CSS
  rule now hides filtered choices and table rows. S5 also checks painted rows instead
  of trusting the same hidden attribute that the implementation writes.
- **S9:** searching opened disclosures permanently, including exploratory evidence.
  Search now saves their previous state and restores it when cleared, including after
  an evidence redraw. The saved state belongs to the hero, role, bracket and section.
- **S10:** a query leaked into another hero or planning role. Context changes now clear
  the query; a redraw within the same context retains it and its caret/focus behavior.

Verified locally on 2026-09-21: audit **130/130**; Python **196 run, one skipped**;
JavaScript **163 passed**; offline **9 receipt cases passed**, including reopening all
six brackets and concurrent saves for different brackets; static **57 desktop + 50
phone checks in each of Edge and WebKit**; rank tables **30** and dashboards **30** in
each engine; companion passed; accessibility **30 states, zero violations**;
`browser_release_222.cjs` passed. WebKit here is the pinned Playwright Windows browser,
not a real iPhone or native Safari. Existing saved September 14 bundles were reused
without collecting or changing source observations. `engine.js` remains unchanged.

This is verification of the staged code, not a live release or a fresh statistics
collection. GitHub's check receipt must still match the pushed commit before merging.
No installation, publication or merge is included in this follow-up.

## Stage 2b status

Implemented for review; see its acceptance and verification boundaries above. This does
not close Stage 4 or Stage 5, and it is not an installation or publication receipt.

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

### Stage 4 implementation (2026-09-21)

The three stages share a compact roster with a single editor for both teams and bans.
The existing in-page role controls remain available inside closed disclosures. Compose's
Generate action follows its size/options controls, before the longer coverage explanation.
The roster is sticky only while collapsed and in a sufficiently tall viewport; focus
scrolling reserves its actual height. Expanded picks and low-height views remain in flow.

PL1–PL3 reproduced on the navigation baseline before implementation. In addition to the
missing shared editor, PL3 found that direct slot mutations could evict the Live hero or
accept an unsupported allied role. `setPick` now reuses `E.validPicks` and protects the Live
hero; replacing that hero still uses Live's existing explicit replacement flow. Banning
uses one shared mutation function. Engine calculations and saved-selection keys are unchanged.

Acceptance includes Escape returning to the editor button after redraw, continued focus
on the edited role, bans excluded from picker options, and selections retained across
stages and reload. `browser_plan_layout.cjs` checks both themes at 390, 320, desktop and
320×256, including the editor's accessibility and the sticky roster's focus clearance.
Actual verification receipts must be checked before a merge; this record is not release approval.

## Stage 5 — reference and sources

**Scope:** playbook, official item text, changes, sources and accuracy.

Accepted when every source states its scope, status and date; the description-review status
keeps its existing rules, including withdrawal on a hotfix that does not change the version;
and the full Changes history and rank-comparison tool remain reachable.

### Stage 5 implementation (2026-09-21)

Source status and dates remain visible. Every source has an explicit Scope disclosure;
unknown sources remain unknown, and an absent URL no longer creates a misleading Statz
link. Source dates, rank comparisons and detailed audits have direct jump controls. The
long audits are folded with the current description-review status in their summary;
their full contents and withdrawal rules remain intact. The rank comparison and complete
Changes route retain their existing controls and observations.

Reviewed compositions in Reference are expandable by name, with withheld advice labelled
in the closed summary. Catalog search still covers every collected entry; the initial
page shows 40, Show more adds 40, and a zero-result search explains what happened. No
catalog records are dropped. Search and category changes reset the visible-page limit.

RS1–RS3 reproduced on the Stage 4 baseline and pass after implementation. P7 (same-version
official-content change), P8 (review dates), V3 (retained evidence labels) and PL4 pass as
focused guards. Full integrated browser and release gates remain required before merging.

### Meta completion and integration (2026-09-21)

The accepted whole-role-list decision replaces Top five on phones. Every eligible planning
hero is visible on arrival; missing and small samples remain labelled. Order by offers
reviewed tier (when active for Gold+), observed win rate, and name. No inactive review
influences ordering. The selected ordering persists in the existing preference store.
Favorites, recent heroes, and changes remain reachable after the full list.

ML1–ML2 reproduced before implementation and pass afterward. M1 now checks the full list
on arrival; P5 retains its missing/failed/paused/small-sample cases using the list's status;
P13 exercises duplicate hero buttons through Favorites instead of the removed Top five.
Rank checks now verify the whole planning roster and each available source row, and the
accessibility suite exercises the name-order state. These are deliberate DOM-contract
updates; none weakens the underlying data or focus requirements.

Integration caught that folded audits hid an evidence-download failure and a description
review's patch label. Both now remain in the closed summary; I8 and V4 keep their original
assertions. Audit runs also receive separate preview directories by port, preventing a
focused run from replacing files underneath a concurrently running full suite.
