# 2.51.0 — Broadcast Overdrive

On 4 October 2026 the owner picked **Broadcast Overdrive** from the five stylized Figma directions (file `rjHeYv9EVKJ1GnijQg5ETd`, page 01) and asked for it to be built. It is the 2.49.0 Broadcast look pushed further. This release ships with 2.50.0 (the QoL pass, see RELEASE-2.50.0.md). It is a visual change only. No evidence, figure, label or rule is different.

## What changes for you

- **A second accent.** A hot pink (`--signal`) joins the cyan. It marks state, never evidence: the ticker's tag when the data is current, a second glow in the top-right of the page, and the sidebar's state dot.
- **The ticker (desktop).** The patch strip reads as one broadcast line: a slanted tag, then each fact separated by `//`.
  - The tag is the data's real state: Current (pink), Aging, Stale, Saved, Paused or Previous data. These are the same words as the phone's status.
  - It never says "live".
- **Hero plate.**
  - Two cyan light streaks and one pink one cross the portrait and fade with it.
  - A cyan rule tops the desktop plate.
  - The eyebrow names the verified game patch ("Gold+ · Midlane · Patch 1.17").
  - "Use in Match" ends in chevrons.
  - The desktop win rate draws its gauge underneath: the distance from 50%, green above and red below, full at six points. The figure itself is unchanged and stays the claim.
- **Phone stat strip.** Under the plate:
  - the tier and its label sit on the left;
  - the win rate sits large on the right with its gauge;
  - the sample line (games, source, date) runs underneath.
- **Build.** Core purchases are labelled in the accent colour. On the desktop, each loadout part shows its icon beside its name, with the label above and the figure below. Crest alternatives line up the same way.
- **Brand mark.** A slanted cyan bar replaces the diamond.

## Kept

- Every 2.49.0 rule:
  - self-hosted fonts and no Google requests;
  - tokens only;
  - one 3 px focus ring, with slants dropped while focused;
  - the plate stays dark in both themes;
  - 44 px phone targets.
- The new colours meet contrast in both themes:
  - text on the pink tag is 5.9:1 dark and 5.3:1 light;
  - the pink as text on the ground is 6.2:1 dark and 4.6:1 light.
- The light streaks are decoration; screen readers skip the chevrons and the `//` separators (alt text empty).

## Files

- `ui.html`: tokens `--signal`, `--signal-ink`, `--signal-glow`, `--streak`, `--streak-2` (both themes).
- `broadcast.css`: the Overdrive section at its end.
- `mobile.js`: `statusFacts()`, the freshness label shared by the phone status and the ticker tag.
- `ui.js`: the ticker's `data-state`, the patch in the plate's eyebrow, `wrVars()` on the win-rate plate and `small.is-core`.
- `companion_simple.js`: the phone stat strip (`.hero-figure`, `.hero-sample`).
- `docs/DESIGN-SYSTEM.md`: the new tokens and "Broadcast Overdrive (2.51.0)".
- Tests: probe BO1 in `tests/browser_audit_regressions.cjs`, with its entry in `tests/known-defects.json`.
- No new program files for the Windows install.

## Verification

- **Probe first.** BO1 reproduced on 2.50.0 and passes now. The 2.49 look and design-system probes still pass: BC1, BC2, DS1–DS6 and W1–W4.
- **Suites.** Python static tests, Node tests and the 11 CI browser suites against the committed seed.
- **Visor suite.** `browser_visor_look` runs the real Windows app.
- **Checked by eye** on the six live bundles:
  - desktop at 1440 px, dark and light: Meta, hero plate, ticker, loadout;
  - phone at 390 px: Meta and hero.
