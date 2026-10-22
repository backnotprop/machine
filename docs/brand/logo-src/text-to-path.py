"""Shape text with HarfBuzz and write the outlines as SVG path data.

Needs fonttools, brotli and uharfbuzz (a scratch venv is fine):
  python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools brotli uharfbuzz
  /tmp/v/bin/python docs/brand/logo-src/text-to-path.py > docs/brand/logo-src/font-paths.json

Output: {key: {d, width, ascender, descender, unitsPerEm}} in font units scaled to size 1000,
y pointing down, baseline at y=0, origin at the pen start.
"""
import json, sys
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

GEIST = 'node_modules/@fontsource/'
SPECS = {
    # key: (file, ttc index, text, tracking in em/1000, features)
    'script':      ('/System/Library/Fonts/Supplemental/SignPainter.ttc', 1, 'machine', 0, {}),
    'mono600':     (GEIST + 'geist-mono/files/geist-mono-latin-600-normal.woff', 0, None, 0, {}),
    'mono500':     (GEIST + 'geist-mono/files/geist-mono-latin-500-normal.woff', 0, None, 0, {}),
    'sans600':     (GEIST + 'geist-sans/files/geist-sans-latin-600-normal.woff', 0, None, 0, {}),
}
# Strings set in the small fonts (labels on plates, panels, drawings).
LABELS = sys.argv[1:] if len(sys.argv) > 1 else []

def load(path, idx):
    font = TTFont(path, fontNumber=idx)
    blob = open(path, 'rb').read()
    if path.endswith('.woff'):
        # HarfBuzz wants sfnt bytes: re-save the decompressed font.
        import io
        buf = io.BytesIO(); f2 = TTFont(path); f2.flavor = None; f2.save(buf); blob = buf.getvalue()
        face = hb.Face(blob)
    else:
        face = hb.Face(blob, idx)
    return font, hb.Font(face)

def shape(path, idx, text, track=0, feats=None):
    font, hfont = load(path, idx)
    upem = font['head'].unitsPerEm
    s = 1000 / upem
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(hfont, buf, feats or {})
    gs = font.getGlyphSet(); order = font.getGlyphOrder()
    x = 0; parts = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (s, 0, 0, -s, (x + pos.x_offset) * s, -pos.y_offset * s))
        gs[name].draw(tp)
        d = pen.getCommands()
        if d: parts.append(d)
        x += pos.x_advance + track * upem / 1000
    hhea = font['hhea']
    return {'d': ' '.join(parts), 'width': round((x - track * upem / 1000) * s, 2),
            'ascender': hhea.ascent * s, 'descender': hhea.descent * s,
            'capHeight': getattr(font['OS/2'], 'sCapHeight', 0) * s,
            'xHeight': getattr(font['OS/2'], 'sxHeight', 0) * s}

out = {}
for key, (path, idx, text, track, feats) in SPECS.items():
    if text:
        out[key] = shape(path, idx, text, track, feats)
for spec in LABELS:
    # "fontkey|tracking|text"
    fk, tr, text = spec.split('|', 2)
    path, idx = SPECS[fk][0], SPECS[fk][1]
    out[f'{fk}|{tr}|{text}'] = shape(path, idx, text, float(tr))
json.dump(out, sys.stdout, indent=0)
