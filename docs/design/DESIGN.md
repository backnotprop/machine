# machine on the Interfere Design System

Written 2026-10-21. Source of every system value: `docs/design/interfere/`, a mirror of https://design.interfere.com/ taken from the site's stylesheet and its public source maps (see `interfere/README.md` for provenance). Screenshots: `before/`, `after/`, reference shots of the system in `shots-interfere/`. Scripts: `scripts/shoot.mjs` (our screens), `scripts/shoot-interfere.mjs` (the system's).

The repo-root `DESIGN.md` records the product's own decisions: the graph is the hero, no tables, no ping dots, colour on blocks, history newest first, and the layout uses the full width. Those stay. This document changes how everything looks, not what is on each screen.

## 1. The system, in our words

Interfere's system is Tailwind v4 on Radix Colors. It is neutral, compact and quiet. A small number of semantic tokens sit over the Radix gray scale and four hue scales. Edges are 0.5px hairlines. Raised surfaces are white with a very light shadow in light mode, and a 0.5px inner white hairline with no shadow in dark mode. Radii are small. One blue carries brand, selection and focus. It ships light and dark with equal weight and follows the OS unless the user picks one.

What a visitor sees: a gray shell, content on a recessed panel inset 4px with 16px corners, 13px medium UI type in Inter, 28px controls with 6px corners, and black-on-white primary buttons (white-on-black in dark).

### Colour (semantic tokens, sRGB values; P3 equivalents are used on P3 displays)

| Role | Token | Light | Dark |
|---|---|---|---|
| Shell (behind everything, ≥768px) | `--color-shell` | `oklch(97.3% 0 0)` (#f5f5f5) | `#000` |
| Page | `--color-page` | `#fff` | `oklch(15% 0 0)` |
| Container (content panel) | `--color-container` | `#fff` | gray-1 `#111` |
| Recessed container (the docs' content frame) | `--color-container-recessed` | gray-1 `#fcfcfc` | gray-1 `#111` |
| Card | `--color-card` | gray-a2 `#00000006` | gray-a2 `#ffffff09` |
| Sunken | `--color-sunken` | black-a1 `#0000000d` | black-a6 `#0006` |
| Modal | `--color-modal` | `#fff` | `oklch(25.2% 0 0)` |
| Standout (tooltip) | `--color-standout` | gray-12 `#202020` | gray-3 `#222` |
| Component / hover / active | `--color-component(-hover/-active)` | gray-a3/a4/a5 `#0000000f/17/1f` | gray-a3/a4/a5 `#ffffff12/1b/22` |
| Subtle surface on container | `--color-component-on-container-subtle` | `#fff` | gray-a2 |
| Strong surface on container (fields, secondary buttons) | `--color-component-on-container-strong` (`-hover`) | `#fff` (gray-2 `#f9f9f9`) | gray-a3 (gray-a4) |
| Popup surface | `--color-component-on-sunken` | `#fff` | gray-4 `#2a2a2a` |
| Transparent hover | `--color-transparent-hover` | gray-a3 | gray-a4 |
| Text primary / secondary / tertiary / disabled | `--color-*-foreground` | gray-a12 / a11 / a9 / a8 (`#000000df / 9b / 72 / 44`) | gray-a12 / a11 / a9 / a8 (`#ffffffed / af / 64 / 55`) |
| Brand solid / hover / active | `--color-brand-solid…` | blue-9 `#0090ff` / blue-10 `#0588f0` / blue-11 `#0d74ce` | `#0090ff` / `#3b9eff` / `#70b8ff` |
| Brand subtle, foreground | `--color-brand-subtle`, `--color-brand-foreground` | blue-a3, blue-a10 | blue-a3, blue-a10 |
| Positive | `--color-positive-*` | green-9 `#30a46c`, subtle green-a3 | same scale, dark steps |
| Warning | `--color-warning-*` | orange-9 `#f76b15`, subtle orange-a3 | same scale, dark steps |
| Danger | `--color-danger-*` | tomato-9 `#e54d2e`, subtle tomato-a2 | same scale, dark steps |
| Inverted solid (primary button) | `--color-inverted-solid` | black-a12 `#000000f2` | white-a12 `#fffffff2` |
| Borders | `--color-border-default / subtle / strong` | gray-a3 / a2 / a6 | gray-a3 / a2 / a6 |
| Focus | `--color-brand-border-focus` | blue-a8 | blue-a9 |

Full table with every token, light and dark: the source site, https://design.interfere.com/ (a local mirror is kept out of the repo).

### Type

Inter Variable with `font-feature-settings: "ss03"`. Mono is Berkeley Mono (a commercial build licensed to Interfere). Base unit 4px.

| Use | Utility | Size / line |
|---|---|---|
| Page title (docs header) | `text-heading-6` semibold | 20 / 24, −0.01em |
| Larger headings | `text-heading-5 … 1` | 24/32, 28/36, 36/44, 44/56, 56/56 |
| Large body | `text-body-lg` | 18 / 24 |
| Body (the `body` default) | `text-body-base` | 15 / 24 |
| UI text: controls, nav, table cells, labels at ≥768px | `text-body-sm` | 13 / 20 |
| Caption lg (table heads, small badges) | `text-caption-lg` | 12 / 16 |
| Caption base / sm / xs | | 11/16, 10/16, 8/12 |
| Code | `text-code-sm` / `text-code-xs` | 13/20, 12/16 (mono) |

Weights: 400, 450 ("semimedium", menu items), 500 (headings, labels, buttons), 600 (page header). Uppercase captions add `tracking-wider` (0.05em).

### Radius, shadow, motion, focus

- Radius: xs 2, sm 4, md 6, lg 8, xl 10, 2xl 12, 3xl 16, 4xl 20, 5xl 24, full. Buttons 6 (md/sm). Inputs 8. Menus 10. Cards and dialogs 12. Content frame and preview panels 16.
- Shadow: `--s-default` (0.5px ring at 6% plus a 1–2px drop; in dark a 0.5px inner `#ffffff12` hairline only), `--s-large`, `--s-extra-large` (popups), `--s-border`.
- Motion: colours 150ms `cubic-bezier(.4,0,.2,1)` (Tailwind default). Buttons: colour 150ms and transform 200ms `--ease-out` `cubic-bezier(0,0,.2,1)`, with an optional press scale of 0.97. Popups: 200ms opacity and scale from 0.95. Indicators: 200ms ease-out. Named curves include `--ease-out-quint` `cubic-bezier(.23,1,.32,1)`. Under reduced motion all durations become 0.01ms.
- Focus: a 1px `--color-brand-border-focus` outline at −1px offset with a 2px radius. Fields swap to a 0.5px inset plus a 1px outer brand ring.

### Components used here (exact values in `interfere/pages/*.md`)

- **Button** `.int-btn`. Sizes xs 20, sm 24, md 28, lg 32, xl 40, with paddings 6, 8, 10, 12, 14. Text 13/20 medium (xs 12). Variants: primary (inverted solid), secondary (strong surface plus `--s-default`), tertiary (component), brand, danger, danger-subtle, transparent, link. Default shape is rounded, 6px.
- **Input / Select trigger** (lg): 32px tall, 8px radius, padding 10/8, 13px. Strong surface plus `--s-default`. Hover uses strong-hover. Focus adds a 0.5px inset and a 1px outer ring in brand focus, on the subtle-hover surface. Textarea (md): min 80px, 8px radius, padding 8/4.
- **Card**: subtle surface, `--s-default`, 12px radius.
- **Menu / Popover**: popup surface (`component-on-sunken`), `--s-extra-large`, 10px radius, 4px padding. Items 28px min, 6px radius, padding 8/6, 13px weight 450, highlight `transparent-hover`. Separator 0.5px `border-default`.
- **Tabs** (default, md): the list is `component` with 6px radius. Triggers are 28px tall, 10px padding, 13px medium, secondary text going primary when active. The indicator is a strong surface with a 1px gray-6 border (gray-7 in dark).
- **Badge** (md): 20px tall, 6px padding, 12px text, 4px radius. Default is `component` with secondary text. Variants for brand, success, warning, danger, outline and inverted.
- **Table**: head 36px, 12px medium secondary. Cells 13px with 12/10 padding. Rows divided by 0.5px `border-default`. Interactive rows hover to `transparent-hover`.
- **Choice (card)**: 1px `border-default`, subtle surface, 10px radius, 12px padding. Checked uses `brand-border-default` and `brand-subtle`. The indicator is a 16px radio with a 1.5px `border-strong` ring, and when checked a brand-solid disc with a 6px white dot.
- **Code** (inline): 0.5px `border-default`, card surface, mono 12px, 4px radius, padding 4/1, secondary text.
- **Kbd**, **Tooltip** (standout, 12px medium, 8px radius), **Divider** (0.5px, size A), **Skeleton**, **Spinner**.
- **App frame** (docs shell): the shell, with a recessed content panel at 4px inset and 16px radius, `--s-default` (a 0.5px border in dark). Page padding 40px (24 below 768). Page header is heading-6 semibold over sm secondary text, then a 0.5px divider. Section titles are body-base medium.

### What the system does not define

Spacing scale (only the 4px unit), motion guidelines, iconography rules, grid, data visualisation, graphs, timelines, or any prose guidance. The system documents no top navigation bar (the docs app uses a sidebar). It defines no status colours beyond brand, positive, warning and danger. Mono font: Berkeley Mono is licensed and cannot be shipped by us.

## 2. Mapping: our tokens and components to the system's

### Tokens

| Ours (v5) | Becomes | Note |
|---|---|---|
| `--color-page` #08080a | `--color-shell` | Behind the bar and around the content frame |
| `--color-stage` (the frame) | `--color-component-on-container-subtle` plus `--s-default`, on `--color-container-recessed` | The graph frame and inspector become Card-like surfaces inside the content panel |
| `--color-raise` (row hover, inner surfaces) | `--color-transparent-hover` (hover), `--color-card` (inset surfaces) | |
| `--color-raise-2` (fields, controls) | Fields: `--color-component-on-container-strong` plus `--s-default`. Controls: `--color-component` | |
| `--color-raise-3` (control hover/pressed) | `--color-component-hover` / `-active` | |
| `--color-field-focus` | `--color-component-on-container-subtle-hover` plus the brand ring | The system's focus state |
| `--color-hair` | `--color-border-default` at 0.5px | |
| `--color-ink / ink-2 / ink-3` | `--color-primary / secondary / tertiary-foreground` | |
| `--color-ink-4` (marks only) | `--color-disabled-foreground` | |
| `--color-on-light` | `--color-on-inverted-foreground` / `--color-on-*-solid-foreground` | |
| `--color-graphite-lo / graphite / graphite-hi` (block fills) | `--color-component-active` (gray-a5) / `--color-border-strong` (gray-a6) / `--color-disabled-foreground` (gray-a8) | Alpha steps, so they read on any surface in both themes |
| blue `#3b82f6` (running, selection) | `--color-brand-solid` (blue-9 `#0090ff`) | |
| amber `#f2b45a` (your decision) | `--color-warning-solid` (orange-9 `#f76b15`) | The system's warning is orange, not amber |
| red `#ff5d62` (blocked) | `--color-danger-solid` (tomato-9 `#e54d2e`) | |
| done `#e9e9ee` (succeeded, the white block) | `--color-inverted-solid` | Still white in dark. Black in light. |
| failed `#b8494d` | `--tomato-8` | A Radix step from the system's own palette (components reference raw steps the same way, e.g. `--tomato-a11`). tomato-8 is `#ec8e7b` in light and `#ac4d39` in dark, close to the old muted red. |
| `*-hi` tone variants | `--color-brand / warning / danger-foreground`, `--color-primary-foreground` | |
| graph `--g-*` | node `--color-component-on-container-strong`, final node `--color-card`, walked node `--color-component`. Strokes `--color-border-strong`; edges `--color-border-strong`, walked `--color-tertiary-foreground` | |
| Geist Sans, 14.5px body | Inter Variable (`ss03`), body 15/24, UI 13/20 | `@fontsource-variable/inter` (OFL) |
| Geist Mono 12 / 11 | Geist Mono 12/16 (`text-code-xs`) everywhere except the graph's edge labels and the dock's label, which stay at 11px (the caption-base step) | Berkeley Mono cannot be shipped. Geist Mono keeps the graph's measured layout exact (0.6em per character). At 12px the edge labels would truncate one character sooner, so they keep the size `graph.tsx` measures them at. |
| `--t-xs 12 / sm 13 / md 14.5 / lg 18 / xl 30` | caption-lg 12/16, body-sm 13/20, body-base 15/24, body-lg 18/24, heading-6 20/24 | Page titles drop from 30 to 20, as in the system's page header |
| radii frame 30 / card 22 / item 16 / field 12 / chip 7 / controls 999 | 16 (3xl) / 12 (2xl) / 8 (lg) / 8 (lg) / 4 (sm) / 6 (md) | |
| ease `cubic-bezier(.22,1,.36,1)`; .15/.32/.7s | `--ease-out` (0,0,.2,1) at 150ms for colour; `--ease-out-quint` (.23,1,.32,1) at 200ms for movement; 500ms for the graph's draw and ring | 500ms is the timeline pill's spring duration, the longest documented value |
| two-layer focus ring | 1px brand-focus outline, −1px offset; fields get the system's field ring | |
| maxw 1680, gutter 40 | Unchanged width (product decision). Gutter 40 is the system's `md:px-10`; 24 below 768 | |

### Components

| Ours | System equivalent |
|---|---|
| `.bar` (top bar), brand, team pill | Sits on the shell. Height 56 (14 × 4). The team switcher is a transparent sm button. |
| `.bar .switch` (Runs / Machines / Credentials) | Sidebar-item nav laid out in a row: transparent buttons, 28px, 6px radius, 13px medium, secondary text. Active gets `transparent-hover` and primary text. Counts are small badges. |
| `.screen` | The recessed content frame: `container-recessed`, `--s-default` (0.5px border in dark), 16px radius, 4px from the window edges |
| `PageHead` (h1 30, sub) | Page header: heading-6 semibold, sm secondary sub, 0.5px divider below. Back link is a link button. |
| `.pill` / `.primary` / `.quiet` / `.ghost` / `.danger` / `.sm` | Button md / primary / transparent / secondary / danger / sm |
| `.pills` (zoom) | Buttons inside a `component` group, 6px radius |
| editor `.switch` (Machine / Skill / JSON) | Tabs, default, md |
| `.link` | Button link variant (secondary, then primary on hover, medium) |
| `.row` (runs, machines, credentials, team) | Interactive table row without the table: 12/10 padding, 13px cells, 0.5px dividers, `transparent-hover` |
| `.row.big` (needs you, with tone glow) | Card (subtle surface, `--s-default`, 12px). The tone stays on the glyph; the glow goes. |
| `.eyebrow` (group label and count) | Sidebar group label (sm medium tertiary) with a Badge md |
| `.count` | Badge md default |
| `.kind`, `.readout .rs` (mono caps) | Caption base, uppercase, tracking-wider, medium |
| `.label`, `.k.label` | Label: 13px medium secondary |
| `.hint`, `.quiet` | Text sm secondary/tertiary; caption-lg for footnotes |
| `.field input / textarea / select`, `.answer textarea`, composer | Input lg / Textarea md / Select trigger lg |
| `.choice` (decision cards) | Choice card, with a round radio indicator |
| `.menu`, `.agent-menu`, `.ask-inline` | Menu: popup surface, items, separator |
| `.empty`, `.paste`, `.once`, `.ask` | Card. `.ask` is a card inside the frame. |
| `dl.kv.inset`, `.skill pre`, `.json`, `.once .key` | Code card surface: card or strong surface, 0.5px border, 10px radius |
| inline `code` in prose | Code (inline): 0.5px border, card surface, 4px radius |
| `.problems` footer | 0.5px divider, caption-lg text, a warning block |
| `.sep` (3px block) | Kept. It is our status vocabulary at its smallest, coloured `disabled-foreground`. |

## 3. Gaps per screen, in the order a visitor notices them

**Every screen**
1. Dark only, near-black, with no light theme. The system follows the OS and treats both themes equally.
2. The type: Geist at 14.5 for body and 30px titles. The system is Inter with `ss03` at 13 for UI, 15 for body and 20 semibold for page titles.
3. Pill buttons (999px radius, 40px tall, flat raise-2). The system's are 28px, 6px radius, and the secondary variant has a hairline shadow.
4. Huge radii (30 / 22 / 16) against the system's 16 / 12 / 8 / 6.
5. No edges at all ("soft, not boxed"). The system separates with 0.5px hairlines and `--s-default`.
6. The top bar is a floating pill switch. The system has no top nav, so it becomes sidebar-item buttons in a row, on the shell, above a recessed content frame.
7. Focus: a custom grey double ring instead of the 1px blue focus outline.
8. Below 768px the layout overflows (the 390-wide shot is 641px wide). The system's responsive rules: body on container, 24px page padding, 40px touch rows.

**Runs**
1. "Needs you" rows glow with a radial tone gradient and a tinted inset. The system has nothing like this. They become Cards.
2. Group labels and counts are ad hoc. They become a sidebar group label and a Badge.
3. Row metrics: 15px title, 22px padding, a 22px radius on hover. Table-row metrics (13px, 12/10 padding, 0.5px dividers) replace them.
4. Status colours are amber/red/blue at our values. They become warning (orange), danger (tomato) and brand (blue-9).

**Run (blocked, waiting, running, finished)**
1. The frame's HUD: a tone glow 140px deep plus four 30px corner arcs. The system has no glow. It keeps a 1px inset tone border (`*-border-default`) and drops the arcs and the glow.
2. The ask panel is a raised dark slab with 30px padding. It becomes a Card: 16px padding, 12px radius, a heading-6/body-lg title, a caption-uppercase kind line.
3. Decision choices are square-tick tiles. They become system Choice cards with a round radio, a brand-subtle checked state and a brand border.
4. The answer textarea becomes Textarea. The send button becomes primary md.
5. History: 18px semibold section heads become body-base medium. The vertical rail goes to 1px `border-default`. "You" beats sit on the card surface. Time and actor become caption and code-xs.
6. Facts column: labels become Label/caption, values body-sm, mono values code-xs.
7. Payload key/values become the code-card surface.

**Machines**
1. Row metrics as for Runs. The thumbnail strokes and blocks move to the alpha gray tokens.
2. Import and New machine become secondary and primary md buttons.

**Editor**
1. Stage tabs: a pill switch becomes Tabs.
2. The inspector is a dark slab. It becomes a Card-like panel. Block rows get 8px radius and `transparent-hover`. The selected block gets the card surface.
3. Fields are mono on raise-2 with 12px radius. They become the system's field (13px, mono where the value is code).
4. Graph: nodes get 8px corners, strong surface and border-strong stroke. Edges go to border-strong, and the selection uses brand.
5. The JSON and Skill faces get the code-card surface and system prose.

**Describe (new machine)**
1. The composer textarea becomes the field. The agent picker becomes a transparent button that opens a Menu.
2. Message bubbles: "you" goes to the card surface with 8px radius. Agent text becomes body-sm secondary.

**Credentials, Team**
1. The paste form is a dark slab with 12px fields. It becomes a Card with system fields, labels and a select.
2. The one-time key panel becomes a Card with code-card wells.
3. Rows: table-row metrics. "Remove" links become link-danger.

**Sign-in, Create team**
1. A 30px title in a left-aligned column becomes heading-5/6 with a body sm description and a primary lg button, on the recessed frame.

## 4. Migration plan

Order: tokens, then type, then components, screen by screen. Behaviour stays identical. The work is CSS, plus small markup changes only where the system needs an element that does not exist yet:

1. **Theme**: an inline script in `index.html` applies the system's init logic. It reads the stored `theme` key ("light" or "dark") if present, otherwise `prefers-color-scheme`, and sets `.light` or `.dark` and `color-scheme` on `<html>`. The token block declares the light values on `:root` and the dark values on `.dark`, copied from the system's sRGB values. P3 variants are not copied; the sRGB values are what non-P3 screens get from the system too. A System / Light / Dark segmented control sits at the right of the bar (`ThemeSwitch` in `main.tsx`, the system's segmented control as `.seg`); it writes the same `theme` key and calls the init script's apply function (`window.__theme`), so the choice holds across loads and tabs.
2. **Fonts**: `@fontsource-variable/inter` replaces Geist Sans. Geist Mono stays as the mono substitute (open choice below). Geist Sans and JetBrains Mono imports are dropped.
3. **Tokens**: the `:root` block in `styles.css` is replaced by the system's tokens (only those we use) plus a small product layer that names our status tones in terms of the system's (`--tone-*`). Every rule then reads system tokens.
4. **Shell**: body on the shell, a 56px bar on the shell, `.screen` as the recessed content frame. The window still scrolls, so the docking, the bar's hairline on scroll and keyboard lists keep working.
5. **Components**: buttons, links, badges, labels, fields, tabs, menus, cards, rows and code surfaces are written once as system equivalents on our existing class names.
6. **Screens**: Runs, Run, Machines, Editor and Describe, Credentials and Team, Sign-in. After each: `bunx tsc --noEmit`, `bunx vite build`, screenshots light and dark into `after/`, console check, compare.
7. **Narrow screens**: the system's md breakpoint (768). Below it: rows stack, the bar's nav fits on one line, the frame has no inset or radius (as in the docs app), and page padding is 24.

### What the system does not cover, and how it is styled using only its tokens

- **The graph canvas.** Nodes are drawn like the system's raised controls: strong surface, a 1px `border-strong` stroke (SVG cannot draw the 0.5px shadow ring crisply at every zoom), 8px corners (the input radius), final states as pills. Labels are code-xs in secondary text, primary text once walked. Edges are `border-strong` at 1.25px, walked edges `tertiary-foreground`, the last edge in the run's tone. The lit node is filled solid in the tone with `on-*-solid` text, as a brand button is. The gradient is removed. Editor selection uses brand. The canvas surface is the subtle card surface.
- **The status blocks (glyphs, thumbs, Block).** The system's own logo and status icons are pixel squares, so the vocabulary fits as it is. Fills are alpha grays for walked steps and the tone's solid colour for the lit block. Cancelled stays dashed hollow in tertiary.
- **The HUD.** Kept as a 1px inset ring in the tone's border token (`danger-border-default` / `warning-border-default`), fading in over 500ms. Corner arcs, the inner glow and the blocked node's drop-shadow are removed, because the system has no glows.
- **The run timeline.** The system's Introduction shows a vertical stepper (12px rings, 4px dots, brand for the current step). Our chapters keep their blocks as markers (product status language) on a 1px `border-default` rail. Chapter titles are body-sm medium, times code-xs tertiary. Beats are table-cell metrics. Your moves sit on the card surface.
- **Agent marks.** Third-party logos at their own colours, 14–16px (the system's icon sizes). The tile behind a mark is the Avatar treatment: `component` fill, 0.5px `border-default` outline, 6px radius.
- **The full-screen graph.** On the shell colour. Controls are secondary sm buttons; the zoom group is a `component` group.

### Open choices for the owner

1. **Mono font.** Berkeley Mono is what the system uses, but it is a paid licence (and the site's file is Interfere's own build). Geist Mono stands in for now. Buying Berkeley Mono would change the graph's measured character width; the constant in `graph.tsx` would need retuning.
2. **Theme.** The product now follows the OS, as the system does. A visible System/Light/Dark switch (as in the docs app) was added later at the owner's request; shots in `docs/design/shots/theme-*.png`, script `docs/design/scripts/shot-theme.mjs`.
3. **Using Interfere's look at all.** The site states no licence. Confirm with Interfere before release that "open design system" covers a separate product adopting its tokens and component styling.

## 5. Result (2026-10-21)

Done as planned. Files touched: `src/ui/styles.css` (rewritten), `src/ui/index.html` (theme init script, `color-scheme` meta), `package.json`/`bun.lock` (`@fontsource-variable/inter` 5.3.0). No TSX changed, so behaviour is untouched by construction. Backups are in `/tmp/machine-design-bak/`.

Checks: `bunx tsc --noEmit` and `bunx vite build` pass. All 19 screens plus 4 interaction states were shot at 1440 in light and dark, and 7 screens at 390, with zero console errors (`scripts/shoot.mjs`, `scripts/shoot-states.mjs`). Inter with `ss03` is confirmed live by pixel comparison (`scripts/check-ss03.mjs`, `scripts/check-fonts.mjs`).

Known residuals, not caused by this change:
- On narrow screens the editor's stage is tall and the graph sits below the first viewport (the before shot shows the same).
- Long edge labels truncate (`build_br…`) exactly as before. The label size and measurement are unchanged.
- The hosted editor-credentials shot shows "Credentials None" in both before and after, because its mock lacks a machine route. That is the script, not the UI.

## Mono font (decided 2026-10-21)

The owner chose [IoskeleyMono](https://github.com/ahatem/IoskeleyMono) v2.2.0 (OFL-1.1), an Iosevka build in the manner of Berkeley Mono, over Geist Mono. Regular, Medium and Italic woff2 files live in `src/ui/public/fonts/` with the licence; `@font-face` rules are at the top of `styles.css` and `--font-mono` points at it. Its advance is 0.5em per character against the 0.6em the graph measures for labels, so labels sit a little looser than measured, never tighter. Theme stays "follow the OS"; light and dark both ship.
