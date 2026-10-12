# 2.55.0 — UI review fixes

On 12 October 2026 the owner asked for a review of the app's look and feel, then asked for its fixes. This release makes those fixes. It is a visual and labelling change only: no figure, source, date or evidence rule is different, and every label that moved is still one tap away.

## What changes for you

- **Warnings no longer look like an S grade.**
  - Warnings used to be filled yellow chips, the same family as the S-tier plate and the reviewed marker. A "Saved September 8" warning under an S badge read as part of the grade.
  - Warnings are now orange and outlined, with no fill (`--amber`, both themes).
  - Gold now means only the S tier, reviewed evidence and the primary fill.
  - On the hero plate, which stays dark in both themes, warnings use `--on-plate-warn` so they stay readable in the light theme.
- **Fewer labels around the desktop build.**
  - The "Recommended build" heading no longer carries a gold "Reviewed reasoning before rates" chip. It sat over calculated plans too, where it was wrong.
  - The plan head no longer repeats itself with a "Reviewed plan" or "Provisional plan" eyebrow over the title.
  - A calculated plan now carries the calculated chip, not a warning-coloured one.
  - Experimental-role plans keep their warning.
- **One band over the desktop hero, not two.** The "Selected rank" note now sits inside the role-statistics disclosure at the top of the hero page. It is still there, one tap away. Other pages keep it as before.
- **"Reviewed", not "Editorial judgment".** A reviewed tier's label now says "Reviewed". On the desktop plate, the line under it reads "Tier · open reasoning".
- **Shorter phone hero plate.** 196 px instead of 230 px, so the build starts higher. The art, the name, the role, Favorite, Share and Use in Match are unchanged.
- **Item names when an icon fails to load.** The phone build tile's position numeral used to cover the start of the name ("5ainted Rounds"). The name now sits below the numeral.

## Files

- `ui.html`: `--amber` (dark `#ffa36b`, light `#9a4500`), the new `--on-plate-warn`, and the outlined `.tag.warning`.
- `broadcast.css`: the plate maps `--amber` to `--on-plate-warn`. The phone plate's `min-height` and top padding are reduced, and a build tile whose icon failed keeps its name clear.
- `ui.js`: the build section heading, the plan head, the reviewed tier label and the desktop tier caption.
- `rank_view.js`: the hero page's rank note moves into `recommendationEvidenceHTML()`.
- `docs/DESIGN-SYSTEM.md`: the token changes and a "UI review fixes (2.55.0)" section.
- Tests: probes UI1–UI4 in `tests/browser_audit_regressions.cjs`, with their entries in `tests/known-defects.json`.
- No new program files for the Windows install.

## Verification

- **Probes first.** UI1–UI4 reproduced on 2.54.0 against the committed seed and pass now:
  - UI1: name/numeral overlap with item icons blocked;
  - UI2: the warning's hue and fill against the S plate;
  - UI3: the bands above the desktop plate and the build head's labels;
  - UI4: the phone plate's height.
- **Contrast.** The new `--amber` is at least 7.4:1 on every dark surface and at least 5.3:1 on every light surface. `--on-plate-warn` on the plate is about 10:1.
- **Suites.** The Python static tests, the Node tests and the CI browser suites, all against the committed seed.
- **Checked by eye** at 390 px and 1440 px in dark and light, with item and hero images loaded and with them blocked.
