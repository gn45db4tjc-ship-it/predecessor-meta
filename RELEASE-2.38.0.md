# 2.38.0 — The phone opens on a third of the data

Will asked for the phone app to be "as crisp and snappy as possible". 2.37.1 made return visits instant. This release makes the first visit fast: the Meta list now shows after about a third of the download it used to need. What is shown and how it is labelled do not change.

## What changes for you

- **The Meta list appears sooner.** Before it could show anything, a phone had to download the whole rank "core", 1.10 MB compressed on Gold+. It now downloads a 0.36 MB core and draws the Meta list straight away.
- **The rest follows at once.** Right after the Meta list appears, the page fetches the "guide" (0.68 MB compressed): pairs, counters, Statz playstyles, patch context, the reviewed strategy and each build's text.
  - A hero page, Match, the reviewed guide or a desktop view opened before the guide arrives shows "Loading hero and build data…" and then the page. Nothing is worked out without it.
  - The status stays "checking" until the guide has arrived, at most ten seconds, as before.
  - On a phone that has visited before, both come straight from the phone (2.37.1).
- **Offline:** the guide is saved like the other files. If it isn't saved yet, the Meta list still works and other screens say the data will download when you're online.
- **The Windows app** loads its full data directly, so nothing changes there.

On Fast 3G (about 180 KB/s with a 0.56 s round trip), the Meta list could show after roughly 7 s before and about 3 s now. These figures are estimated from the compressed sizes and the two round trips (status, then core). The guide then takes about another 4 s, usually before you tap a hero.

## How it works

- **`projection.py` (version 2):**
  - The core keeps what the phone's first screen reads: the Meta list for every role, the rank bar and the limitations chip. That includes every reviewed build's preconditions, because the Meta list checks every build.
  - The guide takes the rest of what the engine reads.
  - Ability descriptions and official article text blocks, which no code reads, move to the hero and shared files.
  - Every parent object stays in the core, and each file records the original key order, so the parts rebuild the bundle byte for byte in any merge order. The publisher checks both orders and otherwise publishes the full bundle only, as before.
- **`static_client.js`:** accepts version 1 (a saved older manifest) and version 2 manifests, fetches and verifies the guide, and saves it for offline use. `guideGate` holds every screen except the phone's Meta and More until the guide has merged.
  - The service worker, the file-name checks, the saved-file cleanup and the desktop export all include the guide. An export is refused if the guide can't be verified.
- **Pages still open on 2.37.1** see an unknown version and load the full bundle instead, so they never read a partial core.

## Verification

- **Probes first:**
  - **PS1** reproduced on 2.37.1: 40.7% of the full Gold bundle had to download before the first Meta row. It is now 13.7%; the limit is 20%.
  - **Guards:** PS2 checks that Meta is identical with the guide blocked, for all five roles, and that a hero page says the data is missing rather than computing without it. PS3 checks that a hero opened before the guide arrives shows the loading state, then its page.
- **`tests/projection.test.cjs`,** in four Pred.gg states:
  - the first-screen engine answers are equal on the core alone;
  - every engine method's answers are equal on core + guide;
  - core, guide and evidence files rebuild the bundle in any order.
- **Live Gold data** (26 Sep):
  - first-screen answers: 406 of 407 equal on the core alone. The one exception is `freshnessAreas`, which only desktop screens call, and they wait for the guide.
  - every answer: 1,201 of 1,201 equal on core + guide.
- **Other tests:** Python static tests, Node tests and the 11 CI browser suites.
