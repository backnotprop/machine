# machine: logo competition

The brief: a metallic, angular "machine" wordmark, explored across race car, old-school AC, and 70s technical directions. Open `logo-competition.html` (self-contained) or look at `logo-competition.png` (1920 px wide). Each option is a standalone SVG in `logos/`.

## Options

| # | File | Direction | Type source |
|---|---|---|---|
| 01 | `logos/01-extended-chrome.svg` | Angular metallic. Squared, extended lower case with 45° chamfers, in mirror chrome with a hard horizon. | Drawn |
| 02 | `logos/02-machined.svg` | Angular metallic. Extended capitals with a deep machined bevel. Each facet is shaded by its angle to one light. | Drawn |
| 03 | `logos/03-inline.svg` | Angular metallic. Monoline extended letters with an engraved inline channel, leaning forward 10°. | Drawn |
| 04 | `logos/04-gt-badge.svg` | Race car. An enamel badge with number-plate chamfers, a chrome bezel, italic chrome capitals and a red pinline. | Drawn |
| 05 | `logos/05-livery.svg` | Race car. Chrome capitals leaning forward, led in by three speed stripes. The middle stripe is machine blue. | Drawn |
| 06 | `logos/06-competition-plate.svg` | Race car. A white enamel plate with a chrome rim and a blue start band, lettered in gloss black. | Drawn |
| 07 | `logos/07-cobra-script.svg` | Old-school AC. Chrome fender script in the AC Cobra manner, with a tapered speed line. | SignPainter HouseScript Semibold (macOS system font), outlined |
| 08 | `logos/08-ac-roundel.svg` | Old-school AC. A blue enamel roundel with a chrome ring and engine-turned finish, crossed by the chrome script. | SignPainter HouseScript Semibold (macOS system font), outlined |
| 09 | `logos/09-rock-block.svg` | AC rock lettering. Heavy condensed capitals with knife-cut corners, in gold chrome on an oxblood extrusion. | Drawn |
| 10 | `logos/10-trace.svg` | 70s technical. Monoline letters with 45° bends, like a circuit trace. The e runs out into the lit state node. | Drawn |
| 11 | `logos/11-instrument-panel.svg` | 70s technical. A black anodised faceplate with engraved letters and four status lamps. RUN is lit. | Drawn; lamp labels in Geist Mono 500 (OFL), outlined |
| 12 | `logos/12-stencil-plate.svg` | 70s technical. Capitals die-cut through a brushed steel plate, with stencil bridges and rivets. | Drawn |
| 13 | `logos/13-drawing-sheet.svg` | 70s technical, **light**. The wordmark as a dimensioned engineering drawing: gunmetal letters on a gridded sheet. | Drawn; dimensions in Geist Mono 500 (OFL), outlined |
| 14 | `logos/14-hex-node.svg` | Symbol + wordmark. A machined hex nut whose socket holds the lit state, beside the extended chrome wordmark. | Drawn |
| 15 | `logos/15-flywheel.svg` | Symbol + wordmark, **light**. A toothed, spoked flywheel in dark steel around a lit hub, with the gunmetal wordmark. | Drawn |
| 16 | `logos/16-node-tile.svg` | Symbol + wordmark. An app-icon tile: a chrome state, a machined edge and the lit next state, with tracked capitals. | Drawn |

"Drawn" means the letters are constructed geometry, not a font. One squared, chamfered letter system (lower case `machine` and capitals `MACHINE`) is built from tagged polygons in `logo-src/glyphs.mjs`. The style of each option decides which corners get a 45° cut and how large it is. The bevels are real offset geometry (`logo-src/geom.mjs`). Each facet gets a flat tone from its angle to a single top-left light. Every face uses the same chrome gradient: sky, a hard dark horizon just below the middle, then reflected ground.

Every SVG is self-contained: there is no `<text>`, no webfont, no filter, no raster, and no external reference. All effects use linear and radial gradients, strokes, one `clipPath` (04, 06, 08, 12), and one vector `pattern` for the brushed finish (11, 12). The marks have transparent backgrounds except where the concept is its own ground (badge, plate, panel, sheet). Options 13 and 15 are designed for light backgrounds.

## Rebuilding

From the repo root:

```
node docs/brand/logo-src/build.mjs                  # all SVGs and logo-competition.html
node docs/brand/logo-src/shoot.mjs docs/brand/logo-competition.html docs/brand/logo-competition.png 1920 full
```

`shoot.mjs` uses Playwright with channel "chrome" and `--disable-gpu`. It exits non-zero if the page logs a console error, warning or failed request. The page logs none. `font-paths.json` holds the outlined script and label text. To regenerate it, use `logo-src/text-to-path.py`, which needs fonttools, brotli and uharfbuzz in a scratch venv; its header has the command. If you add a label, the build prints the missing keys.

## Limits and things not achieved

- **Script licence (07, 08).** The script comes from SignPainter HouseScript, an Apple system font, outlined. That is fine for choosing a direction. For production, license the face from House Industries or have the script drawn by hand. The other options have no font dependency. Geist Mono, used for small labels, is OFL.
- **Brushed metal is suggested, not simulated.** Without raster filters there is no anisotropic noise. The brushed finish is a fine vector line pattern at low opacity (11, 12) or the engine-turned lines (04, 08).
- **Small sizes.** All wordmarks still read at 80 px wide. Fine detail does not survive at that size: the panel lamp labels (11), the drawing annotations (13), and the script's chrome rim (07, 08 go muddy below about 120 px). The badge, plate and panel options need a flat one-colour version for favicons and small UI. That version is not drawn yet.
- **AC Cobra script.** It is an interpretation in a sign-painter script, not a redrawing of the AC emblem lettering. The "AC rock lettering" (09) is blocky metal-band lettering in that spirit. It does not copy the AC/DC logo's blackletter forms or its lightning bolt.
- **Fixed after the pick.** Deep bevels made a light sliver where the M and N diagonals meet their stems. The GT letters (04 and `final/`) now have a small flat in those corners. 02, 05 and 16 still show the sliver above about 2000 px wide.
