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
| `--bg` | `#090e1c` | `#f0f3fb` | Page background |
| `--rail` | `#0d1426` | `#e5ebf8` | Sidebar, top bar and phone header |
| `--surface` | `#131e34` | `#ffffff` | Panels and cards |
| `--surface-2` | `#1b2944` | `#f4f6fc` | Raised or hovered surface |
| `--surface-3` | `#243653` | `#e6ecf8` | Selected or emphasised surface; default chip fill |
| `--inset` | `#0f192d` | `#f7f9ff` | Wells inside cards (loadout slots, tab tracks, build strip) |
| `--line` | `#2c3d59` | `#d3dcec` | Hairline borders and dividers |
| `--line-strong` | `#435a7d` | `#a9b9d3` | Borders that must stay visible (inputs, focusable edges) |
| `--control-line` | `#8196bb` | `#617aa0` | Control borders (selects, secondary buttons) |
| `--control-hover` | `#8a9cc0` | `#49638c` | Control hover fill |
| `--text` | `#f0f4ff` | `#17233d` | Primary text |
| `--text-2` | `#c4d0e8` | `#354765` | Secondary text and labels |
| `--muted` | `#a0b1ce` | `#536687` | Tertiary text: dates, sources, captions |
| `--on-strong` | `#fff` | `#17233d` | Text on strong fills |
| `--icon-plate` | `var(--surface-3)` | `#2b3f48` | Background plate behind item and hero icons |
| `--backdrop` | `#060a13cc` | `rgba(20,35,42,.55)` | Dialog backdrop |

### Brand and accent

Blue is the interactive colour (selection, primary links). Gold is the product accent and a fill; it is never a border or outline on its own.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--brand` | `#a9c5ff` | `#2854d7` | Selected tab fill, primary interactive colour |
| `--brand-hover` | `#c5d8ff` | `#1d41ae` | Brand hover |
| `--brand-ink` | `#0b1c43` | `#fff` | Text on brand fills |
| `--brand-text` | `#aac7ff` | `#2449b5` | Brand-coloured text and links |
| `--brand-tint` | `#20375d` | `#e5edff` | Brand-tinted background (current skill level, soft selection) |
| `--brand-line` | `#719fea` | `#456eca` | Brand-tinted border |
| `--hero-wash` | `linear-gradient(120deg,#213c6d 0%,#142340 55%,#131e34 100%)` | `linear-gradient(120deg,#d7e5ff 0%,#edf3ff 55%,#fff 100%)` | Hero header gradient wash |
| `--accent-fill` | `#1f2a2a` | `#faf3e2` | Accent fill for secondary emphasis |
| `--accent-line` | `#b8975a` | `#9a7a2c` | Accent border |
| `--gold` | `#d8b25c` | `#cfa84f` | Primary button fill and gold accents |
| `--gold-ink` | `#14110a` | `#14110a` | Text on gold fills |
| `--gold-text` | `#e6c777` | `#7a5a10` | Gold text (reviewed marker, current values) |
| `--gold-tint` | `#2a2614` | `#f6ecd2` | Gold-tinted background (reviewed chip) |
| `--indicator` | `#d8b25c` | `#7a5a10` | Selection borders, outlines and underlines. At least 3:1 on every surface in both themes |
| `--focus` | `#d8b25c` | `#2f55b8` | The focus ring colour. At least 3:1 on every surface in both themes |
| `--glow` | `rgba(216,178,92,.07)` | `rgba(154,122,44,.10)` | Soft highlight glow |

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
| `--reviewed-tint` | `rgba(216,178,92,.12)` | `rgba(154,122,44,.12)` | Reviewed metric cell fill; current skill step |
| `--reviewed-line` | `rgba(216,178,92,.36)` | `rgba(154,122,44,.42)` | Reviewed metric cell border |
| `--enemy-line` | `#6a4552` | `#d9a9b4` | Enemy pick border |
| `--enemy-tint` | `#1b1520` | `#fbeef1` | Enemy pick fill |
| `--enemy-text` | `#d9a2b0` | `#8a2e42` | Enemy pick text |

### Tier badges

Fill and ink pairs for tiers A to D. S and S+ use the `--gold` fill with `--gold-ink`. Tier colours change between themes only through these tokens (probe W1).

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--tier-a-fill` | `#70cbb0` | `#8fd9c1` | Tier A fill |
| `--tier-a-ink` | `#0b2520` | same | Tier A text |
| `--tier-b-fill` | `#a6bbdd` | `#c3d1ea` | Tier B fill |
| `--tier-b-ink` | `#152338` | same | Tier B text |
| `--tier-c-fill` | `#f7ae86` | `#f7c3a6` | Tier C fill |
| `--tier-c-ink` | `#382112` | same | Tier C text |
| `--tier-d-fill` | `#ff8091` | `#ffa3af` | Tier D fill |
| `--tier-d-ink` | `#351019` | same | Tier D text |

### Elevation

Shadows by role; nothing else casts a shadow.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--card-shadow` | `0 8px 24px #02061330` | `0 8px 24px #263e7110` | Cards |
| `--shadow-lg` | `0 10px 30px rgba(0,0,0,.45)` | `0 10px 30px rgba(20,35,42,.20)` | Floating panels |
| `--shadow-dialog` | `0 30px 100px #0009` | `0 30px 100px rgba(20,35,42,.35)` | Dialogs |
| `--shadow-toast` | `0 10px 40px #0008` | `0 10px 40px rgba(20,35,42,.25)` | Toasts and the undo banner |
| `--shadow-nav` | `0 -4px 20px rgba(0,0,0,.08)` | `0 -4px 20px rgba(20,35,42,.08)` | Phone navigation and the docked Adapt button |

### Typography

Two scales. `--t-*` is fixed in pixels for the desktop reference. `--tr-*` is in rem so the phone follows the large-text setting; use it for phone text. Font sizes are never literals (probe W4).

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--sans` | `system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif` | same | All text |
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
| `--tr-xs` | `.75rem` | same | Phone chips and captions |
| `--tr-sm` | `.875rem` | same | Phone secondary text and controls |
| `--tr-base` | `1rem` | same | Phone body text |
| `--tr-lg` | `1.125rem` | same | Phone emphasis and card titles |
| `--tr-xl` | `1.5rem` | same | Phone page titles |
| `--tr-2xl` | `1.75rem` | same | Phone hero name |

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

Four steps (probe DS2). Circles use 50%.

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--radius-sm` | `6px` | same | Small controls, icons, focus corners |
| `--radius-md` | `10px` | same | Buttons, inputs, tabs, loadout slots |
| `--radius-lg` | `14px` | same | Cards, panels, strips |
| `--radius-pill` | `999px` | same | Chips and pill buttons |

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

The one pill-shaped component: padding `--s0-5` `--s2`, `--radius-pill`, `--t-xs`, weight 600. Variants add colour only.

- `.chip.tag.observed` / `.calculated` / `.reviewed` / `.official`: evidence. Always rendered with `badge(text, type)`, which adds the marker (●, ◇, ✦, ▢).
- `.chip.tag.warning` and `.chip.tag.saved`: status, not evidence.
- `.chip.status-pill`: a status summary inside the status strip.
- `.chip.tag.reviewed.ready-chip`: "Build ready" on Meta rows, shown only when the reviewed build is active.

_Usage:_ Do use a chip for a short state or provenance label. Don't use one as a button, or invent a new pill class; add a variant.

### `.tab-strip`

A content-switching tab list: `role=tablist` with an `aria-label`, `role=tab` buttons, one `aria-selected=true`, arrow/Home/End keys via the shared handler in `ui.js`.

- `.tab-strip--segmented` (phone): hero sections, Meta role picker, Live hero picker. Selected tab: `--brand` fill, `--brand-ink` text. Wraps, never scrolls; at least 44px tall.
- `.tab-strip--underline` (desktop): role and combination-size tabs. Selected tab: `--indicator` underline.

_Usage:_ Navigation that moves the page or route (hero jump links, destination sections, reference jumps) is not a tab strip: it uses `aria-current`. Keep labels short enough that five tabs fit one row at 375px.

### `.primary` / `.quiet` / `.text-button`

Buttons. `.primary` is the single main action on a screen (gold fill, `--indicator` border, pill). `.quiet` is a secondary action. `.text-button` is an inline or back link that behaves as a button.

- States: hover (`.primary` mixes the fill toward `--text`), focus (the one `--focus` ring), disabled (native `disabled`, never a class alone).

_Usage:_ One `.primary` per view. The docked "Adapt to my match" is that view's primary.

### `.item-button`

An item, crest or perk: icon plus name, opens the catalogue dialog. `data-catalog` and `data-key` identify the entry.

- Full: icon and name (purchase order, loadout).
- Icon-only inside `.build-strip`: the name stays in the accessible label.

_Usage:_ Never draw an item icon without this button; the dialog is how sources are inspected.

### `.build-strip`

The six-item starting build at a glance, under the phone hero header, with the plan's evidence chip.

_Usage:_ Only for the active plan of the current hero and role.

### `.panel`

A card: `--surface`, `--line` border, `--radius-lg`, padding `--s3` (phone) or `--s4`.

_Usage:_ Don't nest panels more than one deep.

### `.note`

An inline notice from `note(text, warning)`. Plain notes explain; `.note.warning` states a limitation or failure.

- `.empty` (from `empty(text)`): a list with nothing to show, with the reason.

_Usage:_ Say what is missing and why; never leave an empty area without a note.

### `.tier`

A tier badge from `tier(t)`, coloured by the tier token pairs.

_Usage:_ Only for reviewed or source tiers; never for calculated scores.

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
