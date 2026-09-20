# Predecessor Meta 2.28.0: honest labels, readable counters, a compact status line

> **Correction (2.28.1).** The "Phone: tabs without scrollbars" section below says "Hero and Meta tab strips wrap instead of scrolling … every tab … fully on screen". That was true of the hero, Builds and Compositions strips and false of the Meta page's own role strip and the Live hero picker, which kept scrolling sideways with "Support" off screen. The live verification of 2.28.0 found it after publication; 2.28.1 fixes it. See RELEASE-2.28.1.md.

2.28.0 fixes the six findings from Astra's review of the live 2.27.0 site:
- every label now describes the hero, role and section it sits beside;
- the Counters tab leads with what you can act on;
- on desktop, content starts about 260 px higher;
- on phone, the hero tabs no longer scroll.

Nothing about the data changes:
- statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged;
- engine results are identical (`engine.js` is untouched), and the publisher and the data are unchanged;
- no number is estimated, and no review status or date is advanced.

## What changed

### A role without its own Statz sample says so (P1)
- **Build tab.** Steel Jungle's Build tab used to show Pred.gg builds above "No observed build for this hero/role". It now says "No Statz build sample for Jungle." A Statz page that failed to load, or reported a different patch, is named as such.
- **Footer.** It never presents another role's Statz page as this role's:
  - Build tab: an unlinked line, "No Statz Jungle sample in Gold+".
  - Partners, Counters and Kit: the hero-wide link is labelled with the page it was read from, e.g. "Statz hero-wide data (Offlane page)".
  - Heroes with no Statz page at all (Wukong) no longer show a dead link.

### Freshness belongs to the section it sits beside (P1)
- **Build coach.** It describes this hero and role, not the whole site:
  - with a role sample: "Statz offlane sample current · Mechanics retained";
  - without one: "No Statz Gold+ jungle sample · Mechanics retained".

  It used to say "Statistics current" everywhere.
- **Phone status chip.** It says whose date it shows: "Site refresh · Statz fetched 2h ago".
- **"Saved" labels.** Evidence that is retained from an earlier collection, or older than 48 hours, is labelled "Saved September 14" beside its own section:
  - Pred.gg builds, items, matchups and the compact summaries on the Builds page;
  - Statz build variants and matchups, and the Statz standout;
  - the desktop and phone hero headers.

  Current evidence, and evidence under 48 hours old, has no label.

### The official description review on the website (P2)
Sources & accuracy used to say "live check pending" on the website forever. It now says "reviewed for current patch" only when all of these hold:
- the latest cloud patch check is verified;
- it matches this publication's content signature, so a hotfix that edits the article under the same version number does not pass;
- it is for the reviewed version and less than 30 hours old;
- recommendations are not withheld;
- the page is online and is not a saved or offline copy.

Otherwise the status names the reason: "live check pending", "official patch check failed", "live check failed", or "needs review · official content changed since collection". The badge is a warning unless the review is confirmed.

An open item or blessing dialog updates when the status changes. It keeps its open sections, scroll position and keyboard focus, including which of several same-named sections you were on.

**Retraction.** RELEASE-2.26.1.md listed the website's permanent "live check pending" as a known gap. That gap is closed. The 2.26.1 draft that tried this was withdrawn because it ignored the content signature and failed checks; this version checks both. Guard probes P7, V5 and V13 fail if either returns.

### Counters lead with what you can act on (P2)
The Counters tab is now three sections, in order:
1. **Reviewed counterplay** from the current guide. When there is none, it says: "No reviewed counterplay for Wukong in the current guide."
2. **Matchups with 100 or more games.**
   - Each source and build variant is listed separately.
   - Hero-wide Statz rows sit in their own disclosure, labelled with the page they came from.
   - When nothing qualifies, the message says what exists:
     - "No matchup observations were collected for Wukong offlane in Gold+."
     - "No collected jungle matchup for Wukong reaches 100 games in Paragon+. Smaller samples are listed under Exploratory below."
     - A limited claim ("from a table with confirmed filters") while a Pred.gg table's filters are unconfirmed, while an alternate table differs from the primary one, or before the hero's evidence file has loaded.
3. **Exploratory**, its own section with a closed disclosure, "Samples under 100 games and alternate source tables".
   - It holds every thinner row and notes that a matchup can read 0% or 100% from a handful of games.
   - Pred.gg alternate tables that list exactly the same opponents, games and rates as the primary table are named once instead of repeated. In the committed Gold+ seed that is all 85 hero/role sets, and 85.7% of the 3,187 primary rows are under 100 games.

No row is removed, pooled or re-rated, and matchup scoring is unchanged.

### Desktop: one status line (P2)
Above the page there is now:
- the patch strip;
- one status line: a one-sentence status plus a **Status details** button, labelled with today's issue (e.g. "Source limitations · 4 notices — synergy");
- any material notice.

**Material notices** always stay visible:
- official patch content changed;
- collection paused;
- Windows updater over 30 hours;
- publication over 30 hours;
- saved or legacy data in use;
- the first required (non-Pred.gg) source failure, plus "N more in Status details".

Pred.gg is optional on the website and in its exported snapshots, so its failures are listed in Status details.

**Status details** holds the freshness schedule, announcements, the Pred.gg retained note and the full notice list. It opens and closes from the keyboard and stays open across refreshes.

**Meta page.** The statistics selector is in the page header, the role-statistics note is one collapsed line, and the role tabs share a row with the counts.

**Rank sites.** For a rank the authored tiers do not cover, the Guidance cell reads "Guidance · Gold+ only", which keeps the strip on one row on all six ranks at 1440 px. The rank note ("The authored tier review covers Gold+ and is reference advice here") now also heads Library, Changes and Sources.

**Measured** on the staged Gold+ seed at 1440×900, with Pred.gg retained as on the live site since 19 September:
- the first Meta row moves from 649 px to 385 px (the live 2.27.0 site measured about 707 px);
- the status chrome above the page is 127 px, excluding material notices.

### Phone: tabs without scrollbars (P2)
- Hero and Meta tab strips wrap instead of scrolling. There is no vertical scrollbar at any width, and every tab is at least 44 px tall and fully on screen. Checked at 320, 360, 390 and 412 px, with default and large text.
- The hero's review status has its own full-width row, and no word is split across lines.

## Verification (actual results, 19 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153, Playwright WebKit 26.6)
- **Probes first.** Each defect probe was run against the code before its fix and reproduced there:
  - V1–V4 and V6 (labels);
  - V7 (Counters: 27 and 87 thin rows shown openly);
  - V8 (first Meta row 762 px);
  - V10 (Status details unreachable);
  - V11 (tab strips overflowing 44 > 43 px);
  - V12 (status squeezed, words split).

  V5, V9 and V13 are guards. P7 (hotfix signature) now runs on a controlled clock with a control case.
- **Probe strength.** 23 regressions were reapplied to scratch copies of the fixed code, and a probe failed for each. Most were applied one at a time; six of the Phase 1 label hunks were reverted together, each detected by its own probe field, and the seventh on its own. Examples: the reviewed hunks for the labels, badge and Saved tags; the dialog rebuild; each Counters message branch; dropped or misplaced rows; a missing required-source notice; the old Guidance cell.
- **Audit browser suite:** 93 of 93 verdicts match the ledger (V1–V13 are new), and no defect is open.
- **Other browser suites:**
  - `browser_static` on the six-rank preview: 57 checks at 1440×900 and 50 at 390×844, in Edge and in WebKit.
  - `browser_ranks`: 30 role tables and 30 phone dashboards in Edge and WebKit, plus, on every rank at 1440 px, one patch-strip row, at most 76 px of status chrome, and the "Gold+ only" and rank-note text on non-Gold ranks.
  - `browser_companion`: 46 checks at seven widths, no page errors.
  - Axe (WCAG 2.1 A/AA) on 30 phone states: no violations.
  - `browser_release_222`: 8 checks.
- **Offline cache suite:** 10 of 10 with a real service worker.
- **Upgrade and rollback** with real service workers, between staged 2.27.0 and 2.28.0 builds of the same six ranks:
  - Upgrade: right after the update to 2.28.0, with the network down, all six ranks and a saved hero's evidence open offline with their original dates. What 2.27.0 saved is kept as is, and only the 2.28.0 shell cache remains.
  - Rollback: right after the rollback to 2.27.0, again offline, all six ranks open.
- **Python:** 196 tests pass, 1 skipped where no local bundle store exists.
- **JavaScript:** 163 tests pass.
- **Engine:** `git diff 25a6e06 -- engine.js` is empty, and engine parity tests pass.
- **Clean-room source package:** 99 files, unpacked into an empty folder and tested there: 196 Python tests run, 18 skipped without the public seed and local store; 152 JavaScript tests pass, 11 skipped without the public seed.
- **Reviews.** Independent review rounds, each with adversarial verification. The labels had four rounds and the status line three; for each, the last round found nothing. Counters had four rounds; the last found one low-severity case (the claim before the evidence file loads), which is fixed and probed. Every confirmed finding was fixed, and each behavioural one has a probe that fails without its fix.

## Not in scope, or known gaps
- Draft's "Individual enemy matchup evidence" and Live's threat list still show matchups without a minimum sample.
- The phone's limits line does not show "collection paused" or "Windows updater over 30 hours"; the desktop material notices do.
- After a failed website check, the Sources verdict still reads "Patch verified". That describes the collection's own verification; the description review status beside it now names the failed check.
- A rebuilt dialog reopens a section that opens by default ("Official … changes") if you had closed it. The same happens on redraws elsewhere on the page.
- `tests/browser_design.cjs` has been stale since the 2.21 fixture: it already fails on 2.27.0 (first row 562 > 520 at 1920). It is not a release gate; probe V8 and `browser_ranks` now cover the layout targets.
- `tests/browser_revision2_modes.cjs` needs three separately prepared previews and was not run for this release, as for 2.27.0. Its changed notice check was run directly on the Phase 3 preview:
  - true with one or with two required failures;
  - false once the notice is removed, and false with only a Pred.gg failure.
- Not tested on real devices: Playwright WebKit on Windows is not Safari. The owner's iPhone check, screen readers and native installs are still open.

## Rollback
- **Windows app:** quit the app, then run **Roll Back 2.28.0.bat**. It verifies the backup's checksums before restoring 2.27.0, and does not touch `data\`, `snapshots\` or `settings.json`.
- **Website:** revert the 2.28.0 merge commit on `main`; Pages redeploys 2.27.0. Saved offline data does not change format in 2.28.0, so a rollback keeps every saved rank (checked above). Never force-push.
