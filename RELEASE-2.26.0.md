# Predecessor Meta 2.26.0 — Phone navigation and evidence

This release implements the last user-facing item of the 2.23.0 audit (item 09: "Mobile ordering labels, evidence visibility, and hero browsing are misleading or incomplete"). It follows the phone prototype the owner tried on 18 September 2026 and approved. It changes presentation only: the engine, collection, publication and offline storage are unchanged. Most changes apply to the phone layout; on desktop, the build coach's source dates become the same one-line summary, a running search can be cancelled, and a redraw keeps the sections you opened. Saved selections, all six brackets, reviewed guidance, source rates, samples and dates are unchanged. No number is estimated, no bracket is substituted, and no review status or review date is changed by this release.

## What changed

**Every hero of a role can be browsed without typing a name.** Meta keeps the Top five and adds one button, "Show all 24 jungle heroes" (the count follows the role). The full list uses the Top-five order for heroes with at least 100 games, then the rest by sample size. A hero without a sample for the selected rank shows "No Gold+ jungle sample" and no number; a sample under 100 games is marked "small sample". The Top five itself is unchanged.

**The status line says exactly what is current.** It now reads, for example, "Fetched 2h ago · Statz dataset 1.16 · Game patch 1.16.4": the fetch time, the statistics dataset and the verified game patch are named separately instead of "Stats updated … · Patch 1.16.4". The state badge (Current, Aging, Stale, Paused) no longer wraps onto two lines on narrow phones or with large text. The same status line now also heads the hero page and Live.

**Material source limitations are visible on every phone screen.** The source notices that the phone layout used to hide entirely now appear as one compact line under the header on every phone screen: the count ("Limitations · 3", or "Source failure · 6" when a source failed) and the first item. One tap opens the full list (evidence limits such as saved statistics or dated guidance, and each source notice) with a link to Sources & accuracy.

**Live is shorter.** The build coach's source dates, which used to fill several lines, are now one line ("Statistics current · Mechanics retained"); the per-source fetch dates are one tap away.

**Your Live hero can be replaced where you are.** "Change my hero" in Live now opens a hero picker in Live itself (role tabs and every hero of the role, with win rate and games or "no sample"; banned, enemy-picked and already-placed heroes are shown but cannot be chosen, with the reason). Choosing a hero shows a preview, Now → New. If an ally already holds that role, the preview names them and says they will leave your lineup. Confirming makes the switch and offers Undo, which restores the previous hero, lineup and game state exactly. "Use in Live" on a hero page follows the same preview instead of telling you to clear the role in Draft first. When nothing is being replaced it stays one tap.

**Draft separates allies and enemies.** The phone Draft screen shows two lineups, "Allies · 1 of 5 selected" and "Enemies · 0 of 5 selected", each with all five role slots, instead of several nested "Edit lineup" and "other roles" sections; Compositions shows the allied lineup, counted against the combination size. (Corrected in 2.26.1: an earlier version of these notes said Compositions showed both.) An empty lineup opens by itself.

**Redraws keep what you opened.** When the page redraws (new data, an evidence change, a pick), sections you opened stay open, and lineups you closed stay closed, on the same screen.

**A running composition search can be cancelled.** While alternatives are being compared, a "Cancel search" button stops the search. Nothing is applied, your picks are unchanged, and the panel says the search was cancelled.

## Independent review

Before publication an independent reviewer checked the change against the code and in a browser. It confirmed that replacing the Live hero never leaves a duplicate hero, a hero on both teams, a banned hero or a Live hero outside the lineup, that Undo restores the previous state exactly, that the Top five order is unchanged, and that all new text is escaped. It found five defects, each now covered by a browser check that fails on the code before its fix (M10 to M13, and a stronger M4): sections opened on one screen or hero also opened on the next one (the page recorded the screen after it had already changed); following "Open Sources & accuracy" put focus back on the limitations line; the Compositions lineup counted allies out of 5 instead of the combination size; Cancel appeared when the search ran on the main thread and could not be cancelled; and the Live summary check would have passed even with the dates showing. It also noted that the picker said "You stay in Live" when opened from a hero page; that wording is fixed.

## Verification (actual results, 18 September 2026, Windows 11, Python 3.12.10, Node 24.19, Edge 153)

- Nine new browser checks (M1–M9), one for each phone finding, were added first and reproduced on 2.25.0 (all nine, including a state badge 41 px tall where one line is 27 px). All nine pass on 2.26.0, as do the four review checks (M10–M13).
- Audit browser suite on the staged build: 52 of 52 verdicts match the ledger, and the ledger of open defects is empty. Longest main-thread stall while generating five-hero alternatives: 33 to 40 ms across runs (budget 500 ms).
- Accessibility (axe, WCAG 2.1 A/AA) on 15 phone states in each theme, including the expanded hero list, the Live hero picker, the replacement preview and the limitations list: no violations. An early build failed this check (grey secondary text in the picker at 4.33:1 in the light theme) and was fixed.
- At 320 px with large text: no horizontal overflow on Meta with the full list, Live, the picker, the preview, Draft, Compositions or Builds; the state badge and the Undo button each stay on one line.
- Python: 178 tests, all pass, 1 skipped where no local bundle store exists. JavaScript: 149 tests, all pass.
- Offline cache suite, real service worker in a real browser, 7 of 7, including a next release that keeps all six saved ranks and an upgrade from a cache written by the actual 2.23.0 worker.
- `browser_release_222`, `browser_companion` (six brackets, no page errors), `browser_ranks` and `browser_static` pass. One desktop acceptance step in `browser_static` clicked a section open again after a redraw; because redraws now keep it open, that click closed it. The step now asserts that the section stays open.
- Clean-room source package (90 files, unpacked into an empty folder and tested there): 178 Python tests run with 6 skipped, and 146 JavaScript tests pass with 3 skipped. The skips are the checks that need the public seed or the local bundle store, which are not part of the package.

## Known gaps

- **Real-device acceptance is still needed.** The audit asks for the phone tasks to be tried on the phone you actually use before the mobile experience is called complete: find a jungle hero outside the top five without typing, say which evidence is current and which advice is dated, replace your Live hero without opening Draft, and enter your items and get back to the next item. These were verified in desktop Edge at phone sizes, not on a physical phone, with VoiceOver or TalkBack, or as an installed app.
- The Undo offer lasts 8 seconds, as for every other Undo in the app; it stays while the Undo button has focus.
- Items you entered for your previous Live hero stay saved with that hero for the rest of the match; the new hero starts with its own items and the previous match situation (ahead, even or behind).
- A tab or installed window that was open when 2.26.0 arrived keeps the previous page until it is reloaded.
- The suites were last certified on Edge 152; these runs used Edge 153.

## Rollback

Windows app: quit the app, then run **Roll Back 2.26.0.bat**. It verifies the backup's checksums before restoring 2.25.0 and does not touch `data\`, `snapshots\` or `settings.json`. Website: revert the 2.26.0 merge commit on `main`; Pages redeploys 2.25.0. Ranks saved for offline use are kept across the rollback (2.25.0 and 2.26.0 share the same data cache; only the page shell changes). Never force-push.
