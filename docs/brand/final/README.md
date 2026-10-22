# machine brand: GT Badge (final)

Chosen 2026-10-21 from the logo competition (`../logo-competition.html`, option 04). The design is a chamfered enamel badge with a chrome bezel, a red pinline and italic chrome capitals. The letters are drawn geometry, not a font.

## Files

| File | Use |
|---|---|
| `gt-badge.svg` | **The master.** Product top bar (`.brand .badge`, 26 px high), site header, docs, anywhere in colour from about 110 px wide up. Natural size 1180 × 220. |
| `gt-badge@2x.png` | The master as a 2360 × 440 PNG for decks, social posts and tools that cannot take SVG. |
| `gt-badge-flat.svg` | One colour (#ededef) for dark backgrounds. It is the badge silhouette with the word and pinline knocked out, with no gradients. Use it for monochrome contexts, embossing, single-colour print and dark merch. |
| `gt-badge-flat-light.svg` | The same geometry in #0a0a0c for light backgrounds and paper. The knock-out makes the two versions exact inverses: only the fill colour differs. |
| `gt-mark.svg` | Square mark: the same plate, bezel, enamel, engine turning and pinline, carrying a bold italic chrome M. Use it for the app icon and any square avatar, from 48 px up. |
| `gt-mark-32.svg` | The mark redrawn for about 24 to 40 px: heavier bezel and pinline, larger M, no engine turning. |
| `gt-mark-16.svg` | The mark redrawn on a 16-unit grid: one-pixel chrome rim, no pinline, and a heavy M in light metal with no horizon. |
| `favicon-16.png` | From `gt-mark-16.svg`. Use as `<link rel="icon" sizes="16x16">`. |
| `favicon-32.png` | From `gt-mark-32.svg`. Use as `<link rel="icon" sizes="32x32">`. |
| `apple-touch-icon.png` | 180 × 180 from `gt-mark.svg`. The plate is inset 14 px on #0b0b0d, because iOS applies its own rounded mask and fills transparency with black. |
| `icon-192.png`, `icon-512.png` | From `gt-mark.svg`, with a transparent background. Use for the web app manifest. |
| `topbar.png` | A 240 × 56 preview of the badge in the product's top bar: #0b0b0d, badge 26 px high at the 44 px content inset. |

For an SVG favicon, use `gt-mark-32.svg`. Browsers draw one SVG at every size, and the 32 px drawing holds at 16 px better than the full mark does.

## Rebuild

From the repo root: `node docs/brand/logo-src/build-final.mjs`. It writes the SVGs, then renders the PNGs with Playwright (channel "chrome", `--disable-gpu`) at exact pixel sizes. It fails if any page logs an error. The drawing is in `docs/brand/logo-src/gt.mjs`, and competition option 04 uses the same code.

## Changes from competition option 04

- In the M and the N, each sharp inside corner where a diagonal meets a stem now has a 4.5-unit flat (cap height = 100). Before, the bevel's mitred corner ran far up the stem and left a light sliver in the face. With the flat, the bevel facets meet cleanly at every size. The silhouette is otherwise unchanged.

## Previous set

This folder used to hold the "Turn" mark (2026-10-19). An intact copy, including its spec sheet and `src/`, is in `../archive/turn-2026-10-19/`. The Turn files that do not clash by name (`favicon.svg`, `turn*.svg`, `lockup.svg`, `wordmark.svg`, `icon-1024.*`, `in-app.png`, `social.png`, `sheet.png`, `index.html`, `src/`) are still here. `DESIGN.md` and `src/ui/mark.tsx` refer to them. The five PNGs with shared names now hold the GT versions.
