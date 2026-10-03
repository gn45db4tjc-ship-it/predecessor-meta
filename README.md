# Predecessor Meta - 2.49.0

2.49.0 gives the website and the Windows app a new look, the owner's "Broadcast" choice of 3 October 2026: condensed capital headings over Barlow text, both self-hosted (no Google requests, kept offline); an electric cyan action colour and brighter tiers; slanted plates; a dark hero plate with the portrait as art and a ghost name; rank numerals, tier-tinted rows and a win-rate gauge on the Meta list; bigger build icons; and calm 150 ms motion. Evidence, figures and labels are unchanged. See RELEASE-2.49.0.md.

## Previous release

### 2.48.1

Mechanics notices are correct again after a review is published: the publication replay applies the 1.17 corrections after the Pred.gg loadout rows are added, as a fresh collection does, so Peal, Hellfire Strikes and Terminal Treatment no longer read "source field missing", and the official correction notice names only the reviewed corrections still unresolved (Psychosis no longer stays listed after it was verified). Nothing else on the site changes. See [RELEASE-2.48.1.md](RELEASE-2.48.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.48.0

A shorter desktop hero page: the reviewed build now opens with all six items and the loadout, so the answer and Use in Match are in the first screen, and Partners, Counters, Kit, the team alternatives and the build sources are folded behind the page's disclosure with a one-line preview, one click away (a section jump or a shared link opens its fold). The page is about 72–74% shorter (Gideon midlane 11,461 → 3,063 px at 1440); nothing is removed, and the phone is unchanged. See [RELEASE-2.48.0.md](RELEASE-2.48.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.47.0

Freshness Phase 4: the site keeps a recheck queue (withheld grades, plans whose mechanics changed, mechanics notices, new heroes, patch changes, a weekly backstop), a scheduled reviewer works through it every 3 hours, and a gate merges a review PR only when it touches review files alone, passes the tests and live-data suites, and records every change in a ledger with one-step moves; it holds first grades, policy or validator changes and passes over 10 grades for the owner, and reverts a merge the live site does not verify within 30 minutes. See [RELEASE-2.47.0.md](RELEASE-2.47.0.md) and [docs/RECHECK-RUNNER.md](docs/RECHECK-RUNNER.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.46.0

Freshness Phase 5: an hourly watchdog checks the live site against the freshness targets (statistics and Pred.gg age, failed or missing ranks, the patch check, publication, a Windows collector quiet for 6 hours, an overdue review queue). It keeps one GitHub issue per problem, requests a refresh only where the publication rules allow, and records every miss in automation-state. Stale labels on the website now say why the data is old and when the next attempt is. See [RELEASE-2.46.0.md](RELEASE-2.46.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.45.0

Freshness Phase 3: every rank shows a calculated tier for each hero and role, from that rank's own sample and labeled Calculated, never Reviewed (each hero against its role's average through the sample's 95% interval; S and D need 500 games; no tier under 100 games). Gold+ keeps its reviewed grades and shows the calculated tier, labeled recheck queued, while a grade is withheld. See [RELEASE-2.45.0.md](RELEASE-2.45.0.md) and [docs/CALCULATED-TIERS.md](docs/CALCULATED-TIERS.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.44.0

Freshness Phase 2b: a merged review shows on the site within minutes (each rank records which reviewed packet it carries, and the next publication re-applies a changed packet without waiting for a collection; source dates never change), and the official patch notes are checked every hour. See [RELEASE-2.44.0.md](RELEASE-2.44.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.43.1

The Pred.gg API path now treats any GraphQL "Forbidden" or null statistic as a denial (not just a non-200 status), remembers a denial for those credentials, and stays off until Pred.gg's approval is recorded in free_hosting.json. Nothing on the site changes; no API credentials are set. See [RELEASE-2.43.1.md](RELEASE-2.43.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.43.0

Freshness Phase 2a: an app that opens or comes back checks for new data at once (every 5 minutes in an open tab), a lost GitHub cache restores the live publication instead of older data, and the Windows app says when the website runs a newer version (a notice only). See [RELEASE-2.43.0.md](RELEASE-2.43.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.42.0

Freshness Phase 1: community builds come back (Omeda labels them with the hotfix version v1.17.1, which we now accept when the official article dates that hotfix as live), and Match explains an inactive reviewed build in plain English. Every stale-type item from the 2 Oct baseline is classified in docs/FRESHNESS-STATUS.md, with the recheck queue for Phase 4. See [RELEASE-2.42.0.md](RELEASE-2.42.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.41.3

Phase 0 of the freshness overhaul: a measured baseline of how current the site is (docs/FRESHNESS-BASELINE.md), and the owner's 2 Oct decisions on calculated per-rank tiers, automatic rechecks with auto-merge, and merging code for this objective (STRATEGY-REVIEW-POLICY.md). Nothing on the site or in the Windows app changes. See [RELEASE-2.41.3.md](RELEASE-2.41.3.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.41.2

Five Gold+ grades moved in a recheck of the 1.17 review against five days of data: Kira carry to A; Legion, Gideon and Greystone from S to A; Murdock back to C. Valmont gets his first grade, midlane B. Sixteen others were retained and show again where they were withheld, and each rechecked tier shows both its review and recheck dates. See [RELEASE-2.41.2.md](RELEASE-2.41.2.md).

### 2.41.1

In the Windows app's phone layout, Quit keeps its own width instead of stretching beside Refresh, so the rank select gets the space. The reported unreadable rank select (57 px on 2.36.1) was already fixed by 2.37.0 and is now guarded by a test. The local-mode test suite no longer waits for a phone Export that has been desktop-only since 2.37.0. See [RELEASE-2.41.1.md](RELEASE-2.41.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.41.0

The desktop pass. The hero page has "Use in Match" in its header instead of the old Build Coach, and on a wide screen Match shows the picker and the adapted build side by side. "Share plan" is now "Share match", the old Plan wording is gone, and layout and wording bugs found at 1440 and 1920 px are fixed. Match labels a kept source playstyle as an observed choice, and status notices name official fields in words. See [RELEASE-2.41.0.md](RELEASE-2.41.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.40.0

The last pieces of the old Plan screen are gone. Three desktop buttons that wrote lineups Match never reads are removed, shared plan links open Match with their hero and enemies, the home-screen app has one Match shortcut, and the phone's Full details hero page skips work it threw away. Unreachable code and styles of the removed screens are deleted, so the page is 164 KB compressed instead of 175 KB. See [RELEASE-2.40.0.md](RELEASE-2.40.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.39.0

Tapping an item or loadout downloads a fifth as much: only the item catalogue (128 KB compressed on Gold+) instead of the whole 637 KB source-audit file. Changes, Sources and reviewed definitions fetch their own history file when opened. Nothing shown or labelled changes. See [RELEASE-2.39.0.md](RELEASE-2.39.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.38.0

The phone opens on a third of the data. A rank's first download is now 0.36 MB compressed instead of 1.10 MB (Gold+): the Meta list draws from it at once, and the rest of the hero and build data (the guide) follows straight away. Hero pages, Match and desktop screens wait for the guide and say so; nothing is worked out without it, and what is shown does not change. See [RELEASE-2.38.0.md](RELEASE-2.38.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.37.1

The phone app is faster. On return visits, a rank's data files open straight from the phone when their bytes still match the checksum in their names, instead of being downloaded again (the core file is 924 KB); a new publication is noticed exactly as before. Reviewed-build lookups no longer re-read every loadout definition, and Pred.gg icons load at 128px on high-density screens. Nothing shown or labelled changes. See [RELEASE-2.37.1.md](RELEASE-2.37.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.37.0

The phone app is decluttered: one compact bar at the top, a Meta list that starts at the first hero, a hero page whose Build tab shows the six items and loadout once on the first screen with "Use in Match" in the header, and a More menu with only the phone's own entries. Match shows a one-line summary of its swaps as you tap enemies. The website and the desktop keep every detail, and every piece of provenance stays one tap away. See [RELEASE-2.37.0.md](RELEASE-2.37.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.36.1

The Windows app can follow the Visor's colours. In the dark theme, surfaces take the Visor's tint at the app's own brightness, and its accent colours selection and brand details, lightened where needed to meet WCAG AA. Evidence, warning and text colours are unchanged, the light theme is untouched, and "Follow the Visor's colours" under the theme switch turns it off. The website behaves exactly as in 2.36.0: it cannot read local files, and only its version number advances. See [RELEASE-2.36.1.md](RELEASE-2.36.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.36.0

Match replaces Compose, Draft and Live: pick your hero, tap the enemies you see, and read the enemy team type and the adapted build. Every build page lists calculated changes by enemy team type (tanky, healing, magic-heavy, physical-heavy, burst, shields), and the skill order is the level chart alone. See [RELEASE-2.36.0.md](RELEASE-2.36.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.35.1

On phones, the skill order chart shows each ability's icon and key with a legend under the chart, so 8 to 12 of the 18 levels fit without swiping (5 to 9 before). See [RELEASE-2.35.1.md](RELEASE-2.35.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.35.0

Each build's skill order is a chart: hero levels 1–18 run left to right, one row per ability, and the ticked box at each level is the ability to rank up, with the order's reviewed, observed or calculated label kept. See [RELEASE-2.35.0.md](RELEASE-2.35.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.6

The Pred.gg sample counts the whole 1.17 line across Hotfix 1.17.1 (versions 167 and 168), labelled that way, so the reviewed Gold+ tiers have a current sample again once the Windows collector runs this release. See [RELEASE-2.34.6.md](RELEASE-2.34.6.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.5

The collector verifies Hotfix 1.17.1, which the publisher placed inside the 1.17 patch article, and the 1.17 reviews are checked against it: no advice changes, and reviewed builds and tiers stay active. See [RELEASE-2.34.5.md](RELEASE-2.34.5.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.4

Muriel's Sentinel passive reads as its official values (25/35/45% anti-heal at levels 1/7/13 and the 1.17 heal and shield bonus) instead of the source's malformed per-level list. See [RELEASE-2.34.4.md](RELEASE-2.34.4.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.3

On phones, Items & loadouts now shows the whole first entry without scrolling on current iPhones with the live 1.17 data; the page intro line is hidden on phones. See [RELEASE-2.34.3.md](RELEASE-2.34.3.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.2

Keeps each rank's Pred.gg data when a Patch 1.17 supplement correction conflicts, instead of discarding it for the whole collection. See [RELEASE-2.34.2.md](RELEASE-2.34.2.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.1

On an iPhone-sized screen, Items & loadouts now shows its first entries without scrolling: Show and Find share one row on phones, the Pred.gg note's summary is one line, and small phones with large text no longer scroll sideways. See [RELEASE-2.34.1.md](RELEASE-2.34.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.34.0

Tiers, strategy notes, counter-picks, build adaptations, team compositions and pools reviewed for live 1.17 (Gold+ reference), with four grade changes and three new starting plans (Legion Midlane, Zinx Carry, Rampage Offlane). One-time review; no recurring AI reviews. See [RELEASE-2.34.0.md](RELEASE-2.34.0.md) and [docs/STRATEGY-REVIEW-2.34.md](docs/STRATEGY-REVIEW-2.34.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

## Previous release

### 2.33.2

The phone More screen's Export snapshot button has its own id, so each page has one element with `id="export"`. Nothing visible changes. See [RELEASE-2.33.2.md](RELEASE-2.33.2.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.33.1

Items & loadouts lists the item and perk definitions from Statz, Omeda.city and official reviews, each with its source named, when Pred.gg's catalogue is unavailable, as it is on the published 1.17 ranks. Compose now names the one setting that helps when no statistics source is eligible. See [RELEASE-2.33.1.md](RELEASE-2.33.1.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.33.0

Build first on the phone: the six-item starting build and Adapt to my match are on the hero page's first screen, status is shown in full once on Meta and as a compact chip elsewhere, and repeated provenance lines are stated once per group. See [RELEASE-2.33.0.md](RELEASE-2.33.0.md). Source version is not proof of installation or public deployment; those use separate approvals and receipts.

### 2.32.0

Every hero/role build reviewed against live 1.17: 87 reviewed starting builds on all six ranks and in the Windows app, and Adapt to my match available again through a dated classification review. See [RELEASE-2.32.0.md](RELEASE-2.32.0.md) and [docs/BUILD-REVIEW-2.32.md](docs/BUILD-REVIEW-2.32.md) for every verdict and the remaining gaps. Source version is not proof of installation or public deployment; those use separate approvals and receipts.

## Previous release

### 2.31.3

Restores reviewed starting builds after refreshed source descriptions, corrects Ability Damage parsing, and separates build availability from tier/team review. See [RELEASE-2.31.3.md](RELEASE-2.31.3.md) for scope and remaining source conflicts. Source version is not proof of installation or public deployment; those use separate approvals and receipts.

## Previous release

# Predecessor Meta - 2.31.1

For contributors: read [shared AI context](docs/AI-CONTEXT.md) before changing the app. The [product improvement review](docs/PRODUCT-REVIEW.md) describes the current preview branch. Release notes below are history; current review scheduling is governed by the latest decision in `STRATEGY-REVIEW-POLICY.md`, not an older README paragraph.

Live patch 1.17 build update: 55 heroes and 94 hero/role plans, including Valmont Midlane. 87 starting plans are supported; seven experimental roles remain explicitly unresolved. Official mechanics corrections, skills and patch implications retain their own evidence. Observed source dates and statistical patch labels are unchanged. The September 14 full strategy record remains historical. See [RELEASE-2.31.1.md](RELEASE-2.31.1.md) for the complete scope and the separate installation/publication receipts.

## Previous release

# Predecessor Meta — 2.31.0

A larger visual redesign: midnight navy and ice blue in dark mode, porcelain and cobalt in light mode, portrait-led Meta cards, clearer navigation, and a numbered purchase list. Pre-match choices and shopping order are separate. More → Check app update refreshes the phone home-screen app without clearing your choices. See [RELEASE-2.31.0.md](RELEASE-2.31.0.md).

## Earlier releases

# Predecessor Meta — 2.30.2

The phone companion now has consistent native typography, aligned role controls and hero cards, clearer selected states, and a more compact Meta page. Source dates and sample rules are one tap away; missing-current-data warnings and every displayed sample stay visible. Both themes, Full details, builds, draft and saved choices remain available. See [RELEASE-2.30.2.md](RELEASE-2.30.2.md).

## Previous release documentation

# Predecessor Meta — 2.30.0

The quick mobile companion opens on Meta. Pick a hero for one starting build, alternative playstyles, named skill points, partners and counterplay. Adapt to my match carries the selected build forward. Plan offers a three-hero quick draft; More and Full details retain the complete reference. Desktop keeps its full navigation. See [RELEASE-2.30.0.md](RELEASE-2.30.0.md) for changes, evidence boundaries and validation.

## Historical release documentation

# Predecessor Meta — 2.29.0 review candidate

The design upgrade is ready for staged verification, not installed or published. Open Meta for the full role list; Plan combines Compose, Draft and Live; Reference holds builds, the guide and catalog; Sources holds provenance and app settings. See [RELEASE-2.29.0.md](RELEASE-2.29.0.md) and [DESIGN-2.29-ACCEPTANCE.md](DESIGN-2.29-ACCEPTANCE.md).

## Previous release documentation

# Predecessor Meta — 2.28.2

2.28.2 is a small accessibility release. When the website could not load a piece of its display-only evidence (source builds, counters, original descriptions), or loaded it after a wait, nothing was announced to a screen reader. It now says so once per view, from a live region that is always present, and the detail dialog has its own region and an accessible name. Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged. See [RELEASE-2.28.2.md](RELEASE-2.28.2.md).

## Previous release: 2.28.1

2.28.1 is a small fix release. On phone widths the role strip on the Meta page and in the Live hero picker (Jungle · Offlane · Midlane · Carry · Support) scrolled sideways, leaving "Support" off screen; it now wraps like the hero tabs. It also corrects a false claim in the 2.28.0 notes about those strips. Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged. See [RELEASE-2.28.1.md](RELEASE-2.28.1.md).

## Previous release: 2.28.0

2.28.0 fixes the six findings from Astra's review of the live 2.27.0 site. Every label now describes the hero, role and section it sits beside: a role without its own Statz sample says so instead of "No observed build", saved evidence is labelled "Saved <day>" beside its section, and the website's official description review is confirmed only after a current check that matches this publication. The Counters tab leads with reviewed counterplay and matchups of 100 or more games, with every thinner sample in one Exploratory disclosure. On desktop one status line with Status details replaces the stacked notices (the first Meta row moves from 649 px to 385 px at 1440×900), and the phone hero, Builds and Compositions tab strips no longer scroll (the Meta and Live picker role strips follow in 2.28.1). Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged, and every engine result is the same. See [RELEASE-2.28.0.md](RELEASE-2.28.0.md).

## Previous release: 2.27.0

2.27.0 makes the website's first load faster (audit item 11). Each rank's data now arrives as a compact core first; the detailed evidence behind a hero or a Sources view is fetched and checksum-verified when you open it. In the phone test profile the site is ready in 8.0 s instead of 16.4 s. Statistics, recommendations, reviewed guidance, source rates, samples and dates are unchanged, every engine result is the same as with the full data, the full bundle stays published, and export still saves the complete publication. The Windows app uses the same page code with its complete local data, so it shows everything at once as before. See [RELEASE-2.27.0.md](RELEASE-2.27.0.md).

## Previous release: 2.26.2

2.26.2 is a small maintenance release. WebKit, the engine behind Safari on iPhone and iPad, limits how often a page may update its address (the WebKit build used for testing allows 100 updates in 10 seconds). Opening many heroes, tabs or sections quickly could hit that limit, and the app then showed a raw error message or raised an uncaught error. It now keeps working and skips only that one address update. The browser checks now also pass in WebKit: the offline check stops a real server instead of using a browser setting that WebKit applies before the service worker. Statistics, reviewed guidance, collection, publication and offline storage are unchanged. See [RELEASE-2.26.2.md](RELEASE-2.26.2.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.26.2.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.26.2 merge commit on `main`.

## Previous release: 2.26.1

2.26.1 fixes the smaller issues found when 2.26.0 was checked live: limitations are counted per source, a cancelled search says so above the earlier alternatives, keyboard focus is kept, the Live picker marks small samples, a wrong device clock is named, every missing number gives its real reason (too few games, a failed page, or paused statistics), the hero page names the source of its numbers, review dates are readable, narrow phones with large text no longer clip the rank selector, pressed build variants meet contrast in the light theme, and offline a rank says whether it is saved on this device. See [RELEASE-2.26.1.md](RELEASE-2.26.1.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.26.1.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.26.1 merge commit on `main`.

## Previous release: 2.26.0

2.26.0 is the phone navigation release from the 2.23.0 audit (item 09), built from the phone prototype the owner tried and approved: every hero of a role can be browsed on Meta without typing a name, the status line separates the fetch time, the Statz dataset and the game patch, material source limitations are one compact line on every phone screen, Live shows a one-line evidence summary, the Live hero can be replaced in place with a preview and Undo, Draft shows allies and enemies separately with counts, redraws keep open sections open, and a running composition search can be cancelled. See [RELEASE-2.26.0.md](RELEASE-2.26.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.26.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.26.0 merge commit on `main`.

## Previous release: 2.25.0

2.25.0 completes the audit repairs: a fresh collection publishes even when a few hero pages fail (with the gaps named), saved offline ranks survive every release and only verified data is stored, five-hero composition search no longer freezes the page, the strategy review packet carries the official changes and is queued in the cloud for human review, and each published rank records who collected it. See [RELEASE-2.25.0.md](RELEASE-2.25.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.25.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.25.0 merge commit on `main`.

## Previous release: 2.24.0

2.24.0 is a reliability release: composition results always match the current draft, evidence age is described once and redrawn when it changes, and every publication path validates rows the same way. See [RELEASE-2.24.0.md](RELEASE-2.24.0.md). The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.24.0.bat**. All existing data, settings, saved drafts and snapshots are retained. The website is rolled back by reverting the 2.24.0 merge commit on `main`.

## Previous release: 2.23.0

The mobile Meta dashboard, Build Coach, and refresh-health changes are described in [RELEASE-2.23.0.md](RELEASE-2.23.0.md). Open the public website and add it to your home screen. The Windows upgrade uses a hashed backup; quit the local app before using **Roll Back 2.23.0.bat**. All existing data and settings are retained.

## Historical release notes

# Predecessor Meta — 2.21.8

The shared site is now installable as an app. Open **[Predecessor Meta](https://gn45db4tjc-ship-it.github.io/predecessor-meta/)** and choose **Install app**. Edge, Chrome and supported Android browsers use their native install prompt; on iPhone or iPad, Safari shows the **Share → Add to Home Screen** steps. The installed icon opens in its own window and uses the same free daily cloud updates. Anyone can use the public link without Python, a GitHub account or an installer.

The app also keeps the last successfully loaded bracket on that device for offline reopening. It preserves the bundle's original dates and resumes normal cloud checks when the device reconnects. See [the 2.21.8 release report](RELEASE-2.21.8.md).

## Previous release: 2.21.7

The September 14 strategy review covers all 93 setups, with 12 changed, 74 retained and 7 experimental roles still unresolved for broad use. Builds now shows each review result and separate dated bracket references. Six editorial tier judgments, jungle openings and several execution/counterplay explanations were updated. A real GitHub runner refreshed Statz and Omeda across all six brackets; optional Pred.gg retained its original records when unavailable. See [the release report](RELEASE-2.21.7.md) and the full `STRATEGY-REVIEW-2026-09-14.json` ledger. September 20 remains the next weekly strategy review.

## Previous release: 2.21.6

Pred.gg is now an optional source. By default the collector reads its public pages; no API access or account is needed. If Pred.gg grants this tool an application and either its credentials are set as PRED_API_CLIENT_ID and PRED_API_CLIENT_SECRET (exchanged at pred.gg/api/oauth2/token for a fresh access token each run, since access tokens expire) or a token is set as PRED_API_TOKEN (repository secrets for the daily cloud run), the collector reads the same data from Pred.gg's API instead (pred_api.py), and any API failure moves that run back to the public pages. When the data is available, the collector validates the patch, ranks, roles and numbers before using them. When unavailable, other sources continue and retained records keep their dates. HTTP 401/403/429 or an embedded denial stops further Pred.gg requests and persists that stop across launches; Refresh Data cannot bypass it. A page without embedded data can be checked on the next daily collection.

Data updates remain daily in the cloud, with official patch checks every three hours. Strategy reviews run weekly with priority for live patch/hotfix changes through the separately configured Codex review task; that task requires an available computer/Codex session. Source data refreshes do not automatically rewrite authored advice. See RELEASE-2.21.6.md.

## Previous release: 2.21.5

There are now 93 reviewed hero/role builds, covering every role sampled in the six September 14 brackets. Seven added roles are labelled experimental and require deliberate selection. Changed supporting mechanics withdraw the new plans from current advice. Daily cloud collection, original source dates and Design Revision 2 remain intact. See RELEASE-2.21.5.md for checks and remaining freshness limits.

## Previous release: 2.21.4 — verification-status repair

Failed or pending official verification leaves saved plans readable but disables current build, strategy and comparison claims. Successful verification restores them. Fresh observed builds remain available when only written guidance needs review. The daily cloud schedule, source dates, saved drafts and themes are preserved. See RELEASE-2.21.4.md.

## Previous release: 2.21.3 (14 September 2026)

The automatic meta view and recommendation role statistics now use an available, patch-compatible source. While Pred.gg is retained, they use the newly collected Statz dataset and explicitly name its broader, unconfirmed match window and game-mode coverage. Pred.gg remains inspectable as dated evidence. Old Pred.gg counters cannot rank current draft suggestions, and Live game prefers available same-role observations over retained ones. A Statz rate cannot silently reaffirm a tier reviewed against Pred.gg. Daily free cloud collection from 2.21.2 continues. See `RELEASE-2.21.3.md`.

## Previous release: 2.21.2 (14 September 2026)

Available sources now refresh daily in GitHub for all six brackets, even when your PC is off. Only Pred.gg is paused pending authorized access. Its old records remain explicitly dated; they are not called fresh. The daily target is 17:23 UTC, with official patch/hotfix checks every three hours. Calculated rankings and suggestions use the published observations. Written build plans still need a separate strategic review; data collection does not author new advice. See `RELEASE-2.21.2.md`.


## Previous release: 2.21.1 (14 September 2026)

An unavailable Pred.gg collection no longer discards successful Statz/Omeda downloads. The app and website can publish a validated partial update, with each source's original date and an explicit warning. The last complete success remains in a separate file. Older Pred.gg records can be reused only for the identical bracket and unchanged verified official patch content. Retained samples cannot silently reaffirm an authored tier or add current item-fit points. No observed rates are adjusted.

Builds, Live game, all six rank brackets, phone layouts and both themes remain. This release does not provide authorized Pred.gg API access, change hosting costs, or make Windows collection independent of the PC. Source freshness and statistical match-window coverage are different facts. See `RELEASE-2.21.1.md` for verification and limits.

## Previous design revisions 1 and 2

The interface was redesigned on top of 2.21.0 + hosting revision 3 after a six-critic review: a compact top bar with a global hero finder, a single status strip, a grouped rail, Meta with the table directly under the role tabs and the reviewed pool beside it, hero pages with tabs under the header and one headline figure per partner card, build plans that show six positions plus augment, Eternal, both blessings and crest without opening details, compact catalogue rows, a narrow-screen pass with an always-visible route row, an opt-in light theme (rail button, stored separately from the plan), and a computed trust verdict on Sources & accuracy. Observations, calculations, authored guidance, thresholds, routes, element IDs and saved state are unchanged. See `CHANGE-REPORT.md` and `INSTALL-AND-ROLLBACK.md`; `tests/browser_design.cjs` holds the design acceptance checks.

**[Open Predecessor Meta](https://gn45db4tjc-ship-it.github.io/predecessor-meta/) — free hosting and daily cloud collection of available sources.**

The selected hosting approach remains $0. The 2.21.1 repair updates collection, publication and provenance labels on the existing Design Revision 2 interface. Installed settings, drafts, historical bundles and rollback files are preserved.

## Current availability and update limits

- Open a normal website link on your PC, Mac or iPhone. Neither your Windows PC nor the spare iMac needs to remain on.
- The site loads the latest published bundle. Planning, builds, counters and combinations run in your browser. Your match stays in that browser; Share match deliberately transfers it.
- GitHub collects available sources once per daily update cycle (17:23 UTC boundary), or after live patch/hotfix content changes. While the Windows collector is connected and has checked in within 4 hours, GitHub's daily collection waits up to 5 hours after the boundary for it (2.37.2): GitHub cannot read Pred.gg's pages, so collecting first only marked the Windows collector's Pred.gg sample as retained and hid the tiers until the Windows data arrived. A changed patch article is still collected at once. Your PC and Codex can be off. Pred.gg is optional and limited to public game pages; missing optional data does not stop the other sources.
- The Windows updater is manual recovery only (from 2.25.0). It runs when you open **Update Predecessor Website** on the Desktop; nothing starts at sign-in. Before 2.25.0 it started at sign-in and checked every three hours. Neither collector requires an AI account or API key for the currently enabled sources.
- GitHub checks official patch notes every hour (every three hours before 2.44.0), imports newer validated public files from `data-updates`, and deploys the site. Old Windows receipts cannot reset a newer cloud collection clock. An access denial stops later Pred.gg requests, while the cloud continues other sources.
- The Windows publishing key is restricted to this repository. Its private half stays on the PC, outside the source package. The updater only pushes public bundles, a source-status receipt and a small reviewed deployment trigger to `data-updates`; it never force-pushes or modifies `main`.
- The first complete collection across all six brackets passed with no source errors in **23 minutes 56 seconds**. Individual fetch timestamps and sample labels remain visible. No source observations are relabelled or pooled.
- Check updates retrieves the latest publication; it does not start another scrape. Open tabs check for published updates every five minutes while visible.
- Source failures preserve the last complete success separately. A validated independent update can publish fresh available-source records with retained or missing sources labelled. A bracket without usable evidence remains unavailable. No samples are invented or combined across ranks.
- A new patch invalidates the current status of old written advice. Pair comparisons, observed builds, counters and composition calculations use the latest loaded evidence, with missing/retained sources labelled. Automatic data collection does not author new strategic judgments or resolve undocumented mechanics. A separate daily Codex review uses existing Codex allowance and requires the host to be available if the owner chooses to enable it.

All six rank brackets are configured, with Gold+ first. Complete cohorts and validated partial updates can become available, with distinct collection statuses. The first full run can take around 25 minutes; the site stays usable throughout.

Choose a rank with the **Rank bracket** control at the top. All six have their own published observations. The authored tier review currently covers Gold+; other ranks lead with their own sortable win rates and games, and keep Gold+ tiers and working pools in a collapsed reference section. Builds, hero pages, counters and planners label the selected statistical rank. The written review is not relabelled as advice reviewed for every rank. Standalone exports retain the selected rank and this distinction.

## Free hosting and the publication decision

Use a **public GitHub repository**, GitHub Pages, standard Ubuntu Actions runners, and the included github.io address. There is no paid server, custom domain, database, AI API or subscription in this setup. [Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The app's source code and published game data will be public. Owner settings, drafts, local backups, research conversations and browser profiles are excluded. The prepared source package contains only the runtime, publication scripts, tests and instructions. Do not upload the entire installed Documents folder or the older source/audit archive.

The owner approved making this package and website public on September 8, 2026. The public repository is [gn45db4tjc-ship-it/predecessor-meta](https://github.com/gn45db4tjc-ship-it/predecessor-meta). GitHub Pages is enabled, HTTPS is active, and the public site was verified on September 8. Its data and source limitations are described above.

Use only standard runners and the free account plan. Do not enable paid cache expansion, larger runners, a paid domain or paid features. The workflow keeps one day's Pages artifacts and uses the ordinary cache limit. Cloud-free allowances and source access are finite; this is not a guarantee of uninterrupted service or unlimited usage. [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Reliability and maintenance

GitHub schedules can be delayed or dropped during busy periods. The website shows the last successful source collection and official check; bundles older than 30 hours receive a warning. [Scheduling behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Public-repository schedules can stop after 60 days without repository activity. The workflow commits a tiny daily publication-activity record to keep normal repository activity, using its automatic GitHub token. It never force-pushes or rewrites source files. Those token-created pushes do not recursively start the workflow. The cloud activity commit and cache save/restore have been verified. [Workflow trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Source caches and tier snapshots are kept in GitHub's cache, which can be evicted. The repository includes a public-only compressed Gold+ seed. A cache miss restores this dated seed; it never replaces newer validated data. The latest public data branch is imported after cache recovery; the initial seed cannot replace newer data. If that fails before any complete bundle exists, no empty website replaces the current deployment. Its dated existing publication remains online. Cloud snapshot retention is best-effort; the Windows app's local snapshots and backups remain separate and intact. [Cache limits and eviction](https://github.com/actions/cache#cache-limits).

If a source blocks GitHub's hosting addresses, the app must report that boundary; it does not bypass the block. The iMac is not needed and has not been changed.

## Files and verification

- `static_publish.py`: source collection decisions, public bundles, separate rendering, per-bracket failure handling.
- `static_client.js`: published-bundle loading, checksums, bracket selection, read-only update checks, and standalone export.
- `app.webmanifest`, `sw.js`, and `assets/app-icon-*.png`: browser installation metadata, app icons, and date-preserving offline reopening of previously loaded data.
- `rank_view.js`: selected-rank tables and explicit separation of rank-specific observations from the Gold+ authored tier review; also runs in exports.
- `free_hosting.json`: selected schedule and bracket policy.
- `.github/workflows/publish.yml`: serialized daily/patch checks and Pages deployment. Actions are pinned to verified commit IDs.
- `publication_activity.py`: minimal daily activity record; no private state.
- `local_updater.py`: Windows checks, isolated data cache, public-only export and repository-only publishing.
- `import_local_feed.py`: verify the data receipt, hashes, bracket and original dates before cloud import.
- `Install Windows Updater.ps1`: creates the manual recovery shortcut on the Desktop and removes the sign-in shortcut older versions created; no Windows service or administrator task.
- `public-seed-gold.json.gz`: public game-data snapshot for initial deployment/cache recovery; excluded from the source-only ZIP.
- `VERIFICATION.md`: completed local/cloud checks and remaining native-device limitations.

The hosting adapter is injected at the existing UI startup marker. If a future UI removes that marker, generation fails clearly. Desktop source files are not rewritten by the publisher.

Developer preview using the existing Windows Python installation:

```text
python -B static_publish.py --preview-seed "C:\path\to\last_successful_gold.json" --state-dir qa\state --output qa\site
python -B -m http.server 12926 --bind 127.0.0.1 --directory qa\site
```

That preview is a saved-data check. It does not refresh samples. `python -B -m unittest discover -s tests -p "test_static*.py" -v` runs the standard-library publication tests. Browser acceptance uses the existing development Playwright installation; it is not an installation requirement for the user or cloud collector.

To roll back the shared website, redeploy a prior known-good source revision. Preserve its dated data; never relabel an old bundle as newly fetched. The installed Windows tool keeps its existing rollback launcher.

## Using and pausing the Windows updater

**From 2.25.0 cloud collection is primary and this PC is manual recovery.** GitHub collects daily whether or not the PC is on. Each published rank records who actually collected it (`collector` in the manifest: `cloud`, `windows`, `local`, or `unrecorded` for data collected before 2.25.0). When a collection keeps (retains) sources from an earlier one, `retained_from` names who collected those. A Windows upload is imported only when it is genuinely newer: a later assembly of older sources never replaces the publication, this applies to every dated source including Pred.gg, a refused upload leaves the cloud's own collection record and schedule untouched, and a Windows upload can never be labelled as a cloud run. Use **Update Predecessor Website** only when the cloud has failed and you want to publish a fresh collection from this PC. The paragraphs below describe the original automatic updater and are kept as history.

Keep this `Predecessor Meta Free Hosting` folder in place. Open **Predecessor Meta Website** on your Desktop to use the app. **Update Predecessor Website** starts an additional full update if wanted; its console shows progress. Normal updates run quietly at Windows sign-in and while signed in, without Codex running. Signing out, shutting down or sleeping stops work until the PC is available again. Website availability does not depend on the PC.

Installed and verified September 8, 2026: all six brackets were collected, uploaded and published successfully. The updater is running under your normal Windows account, and a second launch exits without starting overlapping work. GitHub's Pages environment allows exactly `main` and `data-updates`; a real automatic data-branch deployment passed after adding the latter rule.

Updater status and errors are in `.local-publisher/updater.json` and `.local-publisher/updater.log`. Failed publishing retains the prepared data for the next check. Source failures remain visible. Independently validated source updates can publish without replacing the saved complete success. There is no database or service to maintain.

To pause automatic updating, run `Install Windows Updater.ps1 -Uninstall` in this folder. This removes only the updater shortcuts and requests the process to stop after any current update; it preserves the website, data and keys. The repository owner can revoke **Predecessor Meta — Windows data updater** in GitHub Settings → Deploy keys. The source-only ZIP excludes `.local-publisher` entirely.

The updater runs the reviewed source copy installed here. It reads remote **data only**, and does not automatically execute changed GitHub source code. A future application upgrade should update this local source copy deliberately.
# Phone app updates (2.30.3)

Open **More → App updates** to see the running app version and check for an interface update. New releases also show an **Update app** button when the app returns to the foreground. Applying it keeps your saved picks, builds, preferences and offline data. Game statistics update separately.

If your home-screen app predates 2.30.3, fully close it from the phone's app switcher and reopen it while connected once to get the new update controls. Returning to the home screen alone may only suspend it. Do not delete the app or clear website data.
