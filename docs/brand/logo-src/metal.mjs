// Shared metal rendering: gradients, bevelled letters, label text from font-paths.json.
import { facets, d, ramp, r2, bbox } from './geom.mjs';
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
let FONT = {};
try { FONT = JSON.parse(readFileSync(here + 'font-paths.json', 'utf8')); } catch {}
export const fontPaths = FONT;
export const missingLabels = new Set();

// Light comes from above and a little to the left (y is down).
const L = (() => { const v = [-0.38, -1]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l]; })();
export const facing = (n) => n[0] * L[0] + n[1] * L[1];

export const RAMPS = {
  chrome: [[-1, '#121418'], [-0.55, '#2b2f36'], [-0.1, '#5d646d'], [0.35, '#a7aeb6'], [0.75, '#e2e6ea'], [1, '#ffffff']],
  steel:  [[-1, '#1a1c20'], [-0.5, '#3a3e45'], [0, '#6f757d'], [0.5, '#a9afb6'], [1, '#e4e7ea']],
  dark:   [[-1, '#050608'], [-0.4, '#16181c'], [0.2, '#3b4048'], [0.7, '#7b828b'], [1, '#c4c9cf']],
  gold:   [[-1, '#2a1804'], [-0.5, '#5c3a0c'], [0, '#a8741f'], [0.5, '#e9c26a'], [1, '#fff4cf']],
  hole:   [[-1, '#030304'], [-0.3, '#0c0d10'], [0.3, '#4c5259'], [1, '#c9ced4']],
};

// Vertical gradients across a band [y0, y1]. Stops are fractions of the band.
export const GRADS = {
  // Classic chrome: sky, a hard dark horizon just under the middle, ground bouncing back light.
  chrome: [[0, '#fbfcfd'], [0.2, '#e3e7ec'], [0.44, '#a9b1ba'], [0.53, '#6c747e'], [0.535, '#1c2027'], [0.6, '#2f353d'], [0.8, '#7a828c'], [0.94, '#c3c9cf'], [1, '#e9ecef']],
  satin:  [[0, '#dde1e5'], [0.45, '#a5acb4'], [0.55, '#7d848d'], [0.551, '#5b626b'], [0.8, '#8c939b'], [1, '#b9bfc5']],
  steel:  [[0, '#c9ced3'], [0.5, '#8d949c'], [0.505, '#6b727a'], [1, '#9aa1a8']],
  gun:    [[0, '#6c737c'], [0.3, '#40464e'], [0.52, '#2a2f36'], [0.525, '#0f1216'], [0.8, '#2a3038'], [1, '#4b525b']],
  gold:   [[0, '#fff6d6'], [0.22, '#f5d27c'], [0.47, '#b9842a'], [0.52, '#7a4f12'], [0.525, '#3e2706'], [0.62, '#6b4510'], [0.85, '#d6a347'], [1, '#ffe8a8']],
  enamelBlue: [[0, '#2f5fb8'], [0.5, '#173f8f'], [1, '#0c2762']],
};

export function linear(id, x1, y1, x2, y2, stops, extra = '') {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"${extra}>${stops.map(([o, c, a]) => `<stop offset="${r2(o)}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
}
export const vgrad = (id, y0, y1, stops) => linear(id, 0, y0, 0, y1, stops);

// A bevelled solid: dark rim, facets lit by orientation, face filled with `face`.
// opts: { bevel, rim, rimColor, rampName, face, faceStroke }
export function bevelled(contours, o) {
  const buckets = new Map(); const inner = [];
  for (const c of contours) {
    const { facets: fs, inner: q } = facets(c, o.bevel);
    inner.push(q);
    for (const f of fs) {
      const k = Math.round(facing(o.invert ? [-f.out[0], -f.out[1]] : f.out) * 12) / 12;
      const col = ramp(RAMPS[o.rampName ?? 'chrome'], k);
      buckets.set(col, (buckets.get(col) ?? '') + d([f.pts]));
    }
  }
  const all = d(contours);
  let s = '';
  if (o.rim) s += `<path d="${all}" fill="${o.rimColor}" stroke="${o.rimColor}" stroke-width="${r2(o.rim * 2)}" stroke-linejoin="miter" stroke-miterlimit="8"/>`;
  s += `<path d="${all}" fill="${o.base ?? '#5d646d'}"/>`;
  for (const [col, pd] of buckets) s += `<path d="${pd}" fill="${col}"/>`;
  s += `<path d="${d(inner)}" fill="${o.face}"${o.faceStroke ? ` stroke="${o.faceStroke}" stroke-width="${o.faceStrokeW ?? 0.6}"` : ''}/>`;
  return s;
}

// Small set text from the converted fonts. key "font|tracking|text". Returns {svg, width}.
export function label(key, x, y, size, { anchor = 'start', fill = '#888', extra = '' } = {}) {
  const g = FONT[key];
  if (!g) { missingLabels.add(key); return { svg: '', width: 0 }; }
  const s = size / 1000, w = g.width * s;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return { svg: `<path transform="translate(${r2(x0)} ${r2(y)}) scale(${r2(s * 1000) / 1000})" d="${g.d}" fill="${fill}"${extra}/>`, width: w };
}

export function svgDoc(vb, body, defs, title, width) {
  const [x, y, w, h] = vb, W = width ?? w;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}" width="${Math.round(W)}" height="${Math.round((W * h) / w)}" role="img" aria-label="${title}"><title>${title}</title><defs>${defs}</defs>${body}</svg>\n`;
}
export { bbox, d };
