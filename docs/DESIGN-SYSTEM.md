# Design system

The visual language of Predecessor Meta: tokens, components and the rules that keep them consistent. Everything here is enforced by tests where it can be. If a rule and the stylesheet disagree, the stylesheet is wrong.

## Rules

- Every colour, space, radius and type size resolves through a token declared on `:root` in `ui.html`. The light theme (`:root[data-theme=light]`) redefines tokens only, never component rules (probes W1, W2, W4, DS1, DS2).
- The four classes of evidence (observed, calculated, reviewed, official) keep distinct colours and markers in both themes (W3). A status (warning, saved) is not a class of evidence.
- Gold is a fill. Borders, outlines and underlines that show selection use `--indicator`; focus uses `--focus`. Both reach 3:1 on every surface in both themes (DS5).
- Phone touch targets are at least 44px. Phone tab strips wrap; they never scroll sideways (2.29 stage 1, DS3).
- Phone text uses the rem scale (`--tr-*`) so the large-text setting applies; desktop reference text may use the pixel scale (`--t-*`).

## Tokens

### Surfaces and text

Page layers from back to front, lines and the three text strengths.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--bg` | `#07080d` | `#edf0f5` | Page background |
| `--rail` | `#0b0d14` | `#ffffff` | Sidebar, top bar and phone header |
| `--surface` | `#11141e` | `#ffffff` | Panels and cards |
| `--surface-2` | `#171b28` | `#f2f4f8` | Raised or hovered surface |
| `--surface-3` | `#202637` | `#e4e8f0` | Selected or emphasised surface; default chip fill |
| `--inset` | `#0c0f17` | `#f6f8fb` | Wells inside cards (loadout slots, tab tracks, build strip) |
| `--line` | `#282f42` | `#dde2eb` | Hairline borders and dividers |
| `--line-strong` | `#3d4660` | `#b6bfd0` | Borders that must stay visible (inputs, focusable edges) |
| `--control-line` | `#6b7896` | `#7a859b` | Control borders (selects, secondary buttons) |
| `--control-hover` | `#8591ad` | `#5d6982` | Control hover fill |
| `--text` | `#f5f7fc` | `#0a0e17` | Primary text |
| `--text-2` | `#c5cbdb` | `#2c3445` | Secondary text and labels |
| `--muted` | `#9099b0` | `#566176` | Tertiary text: dates, sources, captions |
| `--on-strong` | `#fff` | `#17233d` | Text on strong fills |
| `--icon-plate` | `var(--surface-3)` | `#2b3f48` | Background plate behind item and hero icons |
| `--backdrop` | `#060a13cc` | `rgba(20,35,42,.55)` | Dialog backdrop |

### Brand and accent

Blue is the interactive colour (selection, primary links). Gold is the product accent and a fill; it is never a border or outline on its own.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--brand` | `#35d6ff` | `#0071ab` | Selected tab fill, primary interactive colour |
| `--brand-hover` | `#86e8ff` | `#005a89` | Brand hover |
| `--brand-ink` | `#00161f` | `#fff` | Text on brand fills |
| `--brand-text` | `#62e0ff` | `#00679c` | Brand-coloured text and links |
| `--brand-tint` | `#0b2733` | `#ddf2fb` | Brand-tinted background (current skill level, soft selection) |
| `--brand-line` | `#1fa9d1` | `#2a8fc3` | Brand-tinted border |
| `--hero-wash` | `linear-gradient(120deg,#0f2a3d 0%,#0e1422 55%,#11141e 100%)` | `linear-gradient(120deg,#d6f0fb 0%,#f2f5f9 55%,#fff 100%)` | Hero header gradient wash |
| `--accent-fill` | `#1f2a2a` | `#faf3e2` | Accent fill for secondary emphasis |
| `--accent-line` | `#b8975a` | `#9a7a2c` | Accent border |
| `--gold` | `#ffc44d` | `#f2b632` | Primary button fill and gold accents |
| `--gold-ink` | `#14110a` | `#14110a` | Text on gold fills |
| `--gold-text` | `#ffd27a` | `#7a5300` | Gold text (reviewed marker, current values) |
| `--gold-tint` | `#2a220e` | `#fbefd0` | Gold-tinted background (reviewed chip) |
| `--indicator` | `#35d6ff` | `#0071ab` | Selection borders, outlines and underlines. At least 3:1 on every surface in both themes |
| `--focus` | `#35d6ff` | `#0071ab` | The focus ring colour. At least 3:1 on every surface in both themes |
| `--glow` | `rgba(255,196,77,.07)` | `rgba(154,122,44,.10)` | Soft highlight glow |

### Status and evidence

Each class of evidence keeps its own colour and marker (probe W3). Status colours never stand in for evidence.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--green` | `#74e0c1` | `#17735a` | Observed evidence text; positive values |
| `--green-tint` | `#15271f` | `#dff3ec` | Observed chip fill |
| `--blue` | `#c3a6ff` | `#6842a8` | Calculated evidence text |
| `--blue-tint` | `#182238` | `#e4e9fb` | Calculated chip fill |
| `--red` | `#ff8a9a` | `#b0273a` | Negative values and errors |
| `--amber` | `#f0c27a` | `#8a5a0a` | Warnings and required-source failures |
| `--amber-tint` | `#2b2419` | `#f7ecd6` | Warning background; offline banner |
| `--amber-tint-2` | `#2b201a` | `#f7ecd6` | Warning chip fill |
| `--amber-ink` | `#f1e3c8` | `#4a3204` | Text on amber backgrounds |
| `--official` | `#aab8c9` | `#4a5768` | Official text marker |
| `--official-tint` | `rgba(170,184,201,.12)` | `rgba(74,87,104,.09)` | Official chip and cell fill |
| `--official-line` | `rgba(170,184,201,.34)` | `rgba(74,87,104,.38)` | Official cell border |
| `--observed-tint` | `rgba(116,224,193,.10)` | `rgba(23,115,90,.09)` | Observed metric cell fill |
| `--observed-line` | `rgba(116,224,193,.34)` | `rgba(23,115,90,.38)` | Observed metric cell border |
| `--calculated-tint` | `rgba(195,166,255,.10)` | `rgba(104,66,168,.07)` | Calculated metric cell fill |
| `--calculated-line` | `rgba(195,166,255,.34)` | `rgba(104,66,168,.35)` | Calculated metric cell border |
| `--reviewed-tint` | `rgba(255,196,77,.12)` | `rgba(154,122,44,.12)` | Reviewed metric cell fill; current skill step |
| `--reviewed-line` | `rgba(255,196,77,.36)` | `rgba(154,122,44,.42)` | Reviewed metric cell border |
| `--enemy-line` | `#6a4552` | `#d9a9b4` | Enemy pick border |
| `--enemy-tint` | `#1b1520` | `#fbeef1` | Enemy pick fill |
| `--enemy-text` | `#d9a2b0` | `#8a2e42` | Enemy pick text |

### Tier badges

Fill and ink pairs for tiers A to D. S and S+ use the `--gold` fill with `--gold-ink`. Tier colours change between themes only through these tokens (probe W1).

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--tier-a-fill` | `#23e3a0` | `#1fd497` | Tier A fill |
| `--tier-a-ink` | `#03251a` | same | Tier A text |
| `--tier-b-fill` | `#4fa3ff` | `#5aa9ff` | Tier B fill |
| `--tier-b-ink` | `#04162e` | same | Tier B text |
| `--tier-c-fill` | `#ff9a4d` | `#ff9f57` | Tier C fill |
| `--tier-c-ink` | `#2e1300` | same | Tier C text |
| `--tier-d-fill` | `#ff4f6d` | `#ff6680` | Tier D fill |
| `--tier-d-ink` | `#2b0410` | same | Tier D text |

### Elevation

Shadows by role; nothing else casts a shadow.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--card-shadow` | `0 8px 24px #00000040` | `0 8px 24px #0a0e1710` | Cards |
| `--shadow-lg` | `0 10px 30px rgba(0,0,0,.45)` | `0 10px 30px rgba(20,35,42,.20)` | Floating panels |
| `--shadow-dialog` | `0 30px 100px #0009` | `0 30px 100px rgba(20,35,42,.35)` | Dialogs |
| `--shadow-toast` | `0 10px 40px #0008` | `0 10px 40px rgba(20,35,42,.25)` | Toasts and the undo banner |
| `--shadow-nav` | `0 -4px 20px rgba(0,0,0,.08)` | `0 -4px 20px rgba(20,35,42,.08)` | Phone navigation and the docked Adapt button |

### Typography

Two scales. `--t-*` is fixed in pixels for the desktop reference. `--tr-*` is in rem so the phone follows the large-text setting; use it for phone text. Font sizes are never literals (probe W4).

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--sans` | `"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif` | same | All text |
| `--display` | `"Saira Condensed","Arial Narrow",sans-serif` | same | Headings, tabs, navigation, figures and tier letters (condensed capitals) |
| `--mono` | `ui-monospace,"Cascadia Mono","Consolas",monospace` | same | Official text and tabular source figures |
| `--t-3xs` | `10px` | same | Micro labels |
| `--t-2xs` | `11px` | same | Dense table captions |
| `--t-xs` | `12px` | same | Chips, captions, status pills |
| `--t-sm` | `13px` | same | Secondary text |
| `--t-md` | `14px` | same | Controls and table text |
| `--t-base` | `16px` | same | Body text |
| `--t-lg` | `18px` | same | Brand and card titles |
| `--t-xl` | `20px` | same | Section and partner names |
| `--t-2xl` | `24px` | same | Page subtitles |
| `--t-3xl` | `26px` | same | Page titles |
| `--t-4xl` | `32px` | same | Large figures |
| `--t-5xl` | `44px` | same | Hero figures |
| `--t-6xl` | `64px` | same | Hero-plate win rate (desktop) |
| `--t-7xl` | `96px` | same | Hero-plate name (desktop) |
| `--t-ghost` | `240px` | same | The ghost name behind the desktop hero plate |
| `--tr-xs` | `.75rem` | same | Phone chips and captions |
| `--tr-sm` | `.875rem` | same | Phone secondary text and controls |
| `--tr-base` | `1rem` | same | Phone body text |
| `--tr-lg` | `1.125rem` | same | Phone emphasis and card titles |
| `--tr-xl` | `1.5rem` | same | Phone page titles |
| `--tr-2xl` | `1.75rem` | same | Phone hero name |
| `--display-sm` | `1.25rem` | same | Hero names on the phone Meta list |
| `--display-lg` | `2.75rem` | same | Hero-plate name (phone) |
| `--display-ghost` | `7.5rem` | same | The ghost name behind the phone hero plate |

### Spacing

Every padding, margin and gap below 40px uses these (probe DS1). Hairlines (0, 1px) and layout reservations of 40px or more stay literal.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--s0-5` | `2px` | same | Hairline gaps, chip vertical padding |
| `--s1` | `4px` | same | Tight gaps inside controls |
| `--s1-5` | `6px` | same | Between an icon and its label |
| `--s2` | `8px` | same | Default gap; compact padding |
| `--s3` | `12px` | same | Card and control padding |
| `--s4` | `16px` | same | Phone gutter; between groups |
| `--s5` | `24px` | same | Between sections |
| `--s6` | `32px` | same | Large section separation |

### Radius

Four steps (probe DS2). Circles use 50%. Since 2.49.0 corners are nearly square; slants come from `clip-path` with `--cut` and `--cut-lg`, not from radius.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--radius-sm` | `2px` | same | Chips, small controls, icons |
| `--radius-md` | `3px` | same | Buttons, inputs, tabs, loadout slots |
| `--radius-lg` | `4px` | same | Cards, panels, strips |
| `--radius-pill` | `999px` | same | Round controls (switches, counters) |

### Broadcast (2.49.0)

The hero plate stays dark in both themes, so its tokens are defined once on `:root`. The light theme redefines only the ground tokens marked below.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--cut` | `10px` | same | Slant of tabs, nav plates and small tiles |
| `--cut-lg` | `14px` | same | Slant of the main action, Meta rows and build tiles |
| `--plate` | `#0a0d15` | same | The hero plate behind the portrait art |
| `--on-plate` | `#f5f7fc` | same | Text on the plate |
| `--on-plate-2` | `#bfe9f7` | same | Labels on the plate |
| `--plate-fade` | `rgba(7,8,13,.94)` | same | The plate's shade over the art (left edge) |
| `--plate-fade-2` | `rgba(7,8,13,.78)` | same | The plate's shade (middle and bottom) |
| `--plate-clear` | `rgba(7,8,13,0)` | same | Where the shade ends |
| `--plate-glass` | `rgba(255,255,255,.1)` | same | Controls on the plate |
| `--plate-stat` | `rgba(7,8,13,.62)` | same | Stat plates and buttons over the art |
| `--ghost-ink` | `rgba(255,255,255,.07)` | same | Outline of the ghost name |
| `--hatch` | `rgba(255,255,255,.022)` | `rgba(10,14,23,.03)` | The diagonal hatch on the page ground |
| `--brand-glow` | `rgba(53,214,255,.11)` | `rgba(0,113,171,.09)` | Corner glow on the ground; glow behind build icons |
| `--brand-sheen` | `#a6f2ff` | `#33a3d6` | The light slashes across the main action; brand text on the plate |
| `--icon-glow` | `rgba(53,214,255,.28)` | `rgba(0,113,171,.3)` | Hairline around build icons |
| `--tier-sheen` | `rgba(255,255,255,.28)` | same | Top sheen on tier plates |

Set on components rather than `:root`:

| Token | Set on | Role |
|---|---|---|
| `--tc` | Meta rows (`.mobile-hero-card`, `.meta-table tbody tr`) | The row's tier colour (from its `.tier-*` badge through `:has()`), tinting the row from the left |
| `--wr-d` | The same rows, from `wrVars()` in `ui.js` | The shown win rate's distance from 50%, scaled to -1…1 (full at six points). Draws the gauge; `data-trend` picks green or red |
| `--hero-art` | `.hero-header`, from `artVars()` in `ui.js` | The portrait as plate art (Pred.gg's 256 px size when available). Without a plain https URL the plate has no art and degrades to the dark plate and the name |

### Layout

Page geometry.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--rail-w` | `200px` | same | Desktop sidebar width |
| `--gutter` | `32px` | same | Desktop page gutter |
| `--content-max` | `1720px` | same | Maximum content width |
| `--prose` | `76ch` | same | Readable line length |

## Components

### `.chip`

The one label component: padding `--s0-5` `--s2`, `--radius-sm` since 2.49.0, `--t-xs`, weight 700, capitals. Variants add colour only.

- `.chip.tag.observed` / `.calculated` / `.reviewed` / `.official`: evidence. Always rendered with `badge(text, type)`, which adds the marker (●, ◇, ✦, ▢).
- `.chip.tag.warning` and `.chip.tag.saved`: status, not evidence.
- `.chip.status-pill`: a status summary inside the status strip.
- `.chip.tag.reviewed.ready-chip`: "Build ready" on Meta rows, shown only when the reviewed build is active.

_Usage:_ Do use a chip for a short state or provenance label. Don't use one as a button, or invent a new pill class; add a variant.

### `.tab-strip`

A content-switching tab list: `role=tablist` with an `aria-label`, `role=tab` buttons, one `aria-selected=true`, arrow/Home/End keys via the shared handler in `ui.js`.

- `.tab-strip--segmented` (phone): hero sections, Meta role picker, Live hero picker. Since 2.49.0 the selected tab has `--brand-text` text on a slanted `--brand-tint` plate over a 3px `--brand` underline. Wraps, never scrolls; at least 44px tall.
- `.tab-strip--underline` (desktop): role and combination-size tabs. Selected tab: `--indicator` underline.

_Usage:_ Navigation that moves the page or route (hero jump links, destination sections, reference jumps) is not a tab strip: it uses `aria-current`. Keep labels short enough that five tabs fit one row at 375px.

### `.primary` / `.quiet` / `.text-button`

Buttons. `.primary` is the single main action on a screen: since 2.49.0 a slanted `--brand` plate with two `--brand-sheen` slashes and `--brand-ink` capitals (before that a gold pill). `.quiet` is a secondary action. `.text-button` is an inline or back link that behaves as a button.

- States: hover (`.primary` turns `--brand-hover`), focus (the one `--focus` ring; the slant is dropped while focused), disabled (native `disabled`, never a class alone).

_Usage:_ One `.primary` per view. On a hero page (phone since 2.37.0, desktop since 2.41.0) it is "Use in Match" in the header.

### `.item-button`

An item, crest or perk: icon plus name, opens the catalogue dialog. `data-catalog` and `data-key` identify the entry.

- Full: icon and name (purchase order, loadout). Since 2.37.0 the phone build card shows every item with its name; there is no icon-only strip.

_Usage:_ Never draw an item icon without this button; the dialog is how sources are inspected.

### `.panel`

A card: `--surface` on the hatched ground, no visible border since 2.49.0, `--radius-lg`, padding `--s3` (phone) or `--s4`.

_Usage:_ Don't nest panels more than one deep.

### `.note`

An inline notice from `note(text, warning)`. Plain notes explain; `.note.warning` states a limitation or failure.

- `.empty` (from `empty(text)`): a list with nothing to show, with the reason.

_Usage:_ Say what is missing and why; never leave an empty area without a note.

### `.tier`

A tier badge from `tier(t)`, coloured by the tier token pairs: a slanted plate with a `--tier-sheen` top, letter in `--display`.

_Usage:_ Only for reviewed or source tiers; never for calculated scores.

## The Broadcast look (2.49.0)

`broadcast.css` is the last stylesheet on every page (`__BROADCAST_CSS__` in `ui.html`). It holds the look; the files before it hold layout. Owner's choice of 3 Oct 2026: direction A ("Broadcast", an esports-overlay look), more stylized.

- **Type.** Barlow (`--sans`) for text, and Saira Condensed (`--display`) in capitals for headings, tabs, navigation, figures and tier letters. Both are OFL fonts, self-hosted in `assets/fonts/` with their licences: only the latin subset, weights 400/600/700 and 700/800. The website publishes them and `sw.js` keeps them for offline use. The Windows app and the shared server serve only the allow-listed files (`UI_FONTS`, `ui_font()`) under `font-src 'self'`. An exported page falls back to system fonts. No page requests Google Fonts (`browser_visual_polish`).
- **Slants.** Tier badges, the main action, selected tabs and navigation, Meta rows, build tiles and stat plates are parallelograms or cut corners (`clip-path`, `--cut`, `--cut-lg`). A clip also cuts off the focus ring, so anything clipped that holds or is a control drops its clip on `:focus-visible` or `:focus-within`.
- **Hero plate.** `.hero-header` is a dark plate in both themes. The portrait (`--hero-art`) fills the right and fades out to the left. The hero's name is drawn behind as a ghost outline (`::after`, `content: attr(data-name) / ""`, so screen readers do not hear it twice). The name is slanted, and the plate redefines `--text`, `--text-2`, `--muted` and `--brand-text` for its contents. On the phone the plate is a lower third: the framed portrait is hidden, the actions sit top right, and the name and role sit low.
- **Meta list.** Each row is tinted from the left by its tier (`--tc`). The phone role list and the desktop table number their rows (`counter(meta-rank)`, alt text empty), with the first three filled. Each row has a win-rate gauge under the figure: a centre tick at 50%, green or red to the side, full at ±6 points. The figure stays the claim; the gauge only makes the list scannable.
- **Build.** Tiles with a cut corner, a glow behind each icon (52 px on the phone, 56 px on the desktop) and outlined slanted numbers. Desktop loadout slots stack their label, item, evidence chip and provenance in one column, so the provenance no longer wraps around the chip.
- **Ground.** A faint diagonal hatch and a brand glow in the top-left corner (`--hatch`, `--brand-glow`). Panels lose their outline; fills and the hatch separate them.
- **Motion.** 150 ms for state changes, a lift on build tiles and a nudge on Meta rows, all inside `prefers-reduced-motion: no-preference`.

## Focus and selection

- One focus ring: `outline: 3px solid var(--focus); outline-offset: 2px` on `:focus-visible` (ui.html). Components do not define their own.
- Selection: `aria-selected` on tabs, `aria-pressed` on toggles, `aria-current` on navigation. Visual indicators use `--indicator` or the segmented `--brand` fill.

## Tests that enforce this

| Probe or test | Guards |
|---|---|
| W1, W2 | Themes redefine tokens only; no literal colours in component rules |
| W3 | Evidence classes stay distinct in both themes |
| W4 | No literal font sizes |
| DS1 | Spacing through `--s*` |
| DS2 | Radius through the four radius tokens |
| DS3 | Tab-strip semantics, shared selected treatment, no sideways scrolling |
| DS4 | One chip geometry |
| DS5 | One focus ring; `--focus` and `--indicator` at 3:1 or better |
| DS6 | No parallel palettes, aliases or extra rem steps |
| `tests/test_static_design_system.py` | Every token and shared component here exists, and every token that exists is here |

## Following the Visor (Windows app only)

The Windows app can take its colours from Will's Visor desktop HUD. The hosted site never can: it cannot read local files, and it never carries this code.

**Source.** The Visor replaces `%LOCALAPPDATA%\VisorHost\look.json` whenever its theme changes: `{"schema":1,"updated":"<ISO-8601 UTC>","style":"orbit|nebula|cockpit","palette":"<id>","glass":"ghost|clear|light|medium|solid","calm":true|false,"accent":"#RRGGBB","text":"#RRGGBB","muted":"#RRGGBB","warn":"#RRGGBB","tint":"#RRGGBB"}`.

**Validation.** Section 12b of `predecessor_meta.py` accepts only the following:
- schema 1 (an integer)
- the listed enums
- a boolean `calm`
- `#RRGGBB` colours
- a palette id of 1-40 letters, digits, `-` or `_`
- a UTC `updated` time

Unknown fields are dropped, never passed on. Any of these fall back silently to the normal look:
- the file is missing, unreadable, larger than 16 KB, or malformed
- the file is stale: its `updated` time is more than 10 minutes in the future

An unchanged old theme is not stale, because the Visor writes the file only when its theme changes.

**Delivery.** `render_html` inlines `visor_look.js` and the current look only when the mode is `local`: pages served by the app itself on 127.0.0.1. Static, export and shared pages get nothing, and they are byte-identical whatever the file says. The page re-reads `GET /api/look` in these cases:
- on load
- on window focus
- when the page becomes visible
- every 30 seconds while it is visible

The look is applied as one `<style id="visor-look">` rule, `:root:not([data-theme=light]){…}`, which is edited in place only when the look changes, so it never flickers. The light theme is untouched: the Visor's colours apply to the dark theme only.

**Setting.** "Follow the Visor's colours" sits under the theme switch on desktop widths. It is on by default whenever a valid look exists, and it is stored like the theme choice, in localStorage (`predecessor-visor-colours` = `off` to stop). The phone shell (700px and narrower) hides it with the theme switch, but the saved choice still applies.

**Mapping.** Only these tokens are derived:

| Visor field | App tokens | Rule |
|---|---|---|
| `tint` | `--bg`, `--rail`, `--surface`, `--surface-2`, `--surface-3`, `--inset` | Tint hue, at the dark default's luminance or darker. Never more than 1.25× as colourful as the app's own navy |
| `tint` | `--line`, `--line-strong`, `--control-line`, `--control-hover` | Tint hue, at the default's luminance or lighter |
| `accent` | `--brand-tint`, `--hero-wash`, `--brand-ink` | Accent hue, at the default's luminance or darker |
| `accent` | `--brand`, `--brand-hover`, `--brand-text`, `--brand-line` | The accent, lightened only as far as WCAG AA needs on every derived surface. `--brand-text` reaches 4.5:1. `--brand`, `--brand-hover` and `--brand-line` reach 3:1, and `--brand-ink` on the brand fills reaches 4.5:1 |

WCAG contrast depends only on luminance. Surfaces keep their luminance or go darker, and lines keep theirs or go lighter. As a result, every text, evidence (observed, calculated, reviewed, official), warning, error, staleness, gold, tier, focus and selection colour keeps at least its reviewed contrast. Those tokens are never derived. They also keep their markers, so their meaning cannot change.

The Visor's `text`, `muted` and `warn` colours are validated but not used. `tests/test_static_visor_look.py` pins the mapping, the defaults above, and AA across ten palettes, including near-white, near-black, amber, red and violet accents. It also checks that the hosted page is unaffected. `tests/visor_look.test.cjs` covers the client allow-list.

**Testing.** `tests/browser_visor_look.cjs` runs only on Windows and is not a CI step. It starts the app in its no-fetch developer mode on a copy of the seed. It points the app at sample files through the test-only `PREDECESSOR_META_VISOR_LOOK_FILE` override, never at the Visor's real file.
