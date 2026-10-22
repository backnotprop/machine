// The GT badge (option 04, picked as the brand) and its family: master, flat, square mark.
import { upper, setWord } from './glyphs.mjs';
import { d, bbox, skew, mapPts, inset, rect, chamfer, r2 } from './geom.mjs';
import { bevelled, linear, vgrad, GRADS, svgDoc } from './metal.mjs';
import { UX, upStyle } from './styles.mjs';

export const CROTCH = 4.5; // flat in the M and N crotches, in letter units (cap height 100)
const LEAN = 12, PADX = 74, PADY = 50, PLATE_CHAMFER = 38, BEZEL = 11, PIN_INSET = 20, PIN_W = 2.6;
const RED = '#d8323f', NAVY_RIM = '#04102b';

export function badgeGeometry() {
  const wd = setWord('MACHINE', upper(UX), UX, upStyle({ gap: 24, sizes: { x: CROTCH } }));
  const BW = wd.width + PADX * 2, BH = UX.X + PADY * 2;
  const badge = skew([chamfer(rect(-PADX, -PADY, BW, BH, 'o'), () => PLATE_CHAMFER)], LEAN, UX.X / 2)[0];
  const letters = skew(wd.contours, LEAN, UX.X / 2);
  return { badge, letters, BW, BH };
}

const enamelDefs = (id, y0, y1, glossTo, clip) =>
  vgrad(id('enamel'), y0, y1, [[0, '#24519f'], [0.5, '#123477'], [1, '#081c47']]) +
  linear(id('gloss'), 0, y0, 0, glossTo, [[0, '#ffffff', 0.22], [1, '#ffffff', 0]]) +
  `<clipPath id="${id('clip')}"><path d="${d([clip])}"/></clipPath>`;

// Engine-turned lines and the clear-coat reflection, clipped to the enamel.
function enamelFinish(id, x0, x1, y0, y1, glossTo, step, sw) {
  let s = `<g clip-path="url(#${id('clip')})">`;
  for (let y = y0 + step * 0.57; y < y1; y += step) s += `<path d="M${r2(x0)} ${r2(y)}H${r2(x1)}" stroke="#ffffff" stroke-opacity="0.035" stroke-width="${sw}"/>`;
  return s + `<path d="M${r2(x0)} ${r2(y0)}H${r2(x1)}V${r2(glossTo)}H${r2(x0)}Z" fill="url(#${id('gloss')})"/></g>`;
}

export function gtBadgeSVG(prefix = 'gt', width) {
  const id = (s) => `${prefix}-${s}`;
  const { badge, letters, BW } = badgeGeometry();
  const defs = enamelDefs(id, -PADY, UX.X + PADY, UX.X * 0.42, inset(badge, BEZEL)) + vgrad(id('face'), 2, UX.X - 2, GRADS.chrome);
  let body = bevelled([badge], { bevel: BEZEL, rim: 2, rimColor: '#030405', face: `url(#${id('enamel')})`, rampName: 'chrome' });
  body += enamelFinish(id, -PADX - 60, BW, -PADY, UX.X + PADY, UX.X * 0.42, 7, 2);
  body += `<path d="${d([inset(badge, PIN_INSET)])}" fill="none" stroke="${RED}" stroke-width="${PIN_W}"/>`;
  body += bevelled(letters, { bevel: 3.6, rim: 2.2, rimColor: NAVY_RIM, face: `url(#${id('face')})`, rampName: 'chrome' });
  const b = bbox([badge]), pad = 10;
  return svgDoc([b.x0 - pad, b.y0 - pad, b.w + pad * 2, b.h + pad * 2], body, defs, 'machine', width);
}

// One colour: the silhouette, with the pinline and the word knocked out (even-odd).
export function gtFlatSVG(color) {
  const { badge, letters } = badgeGeometry();
  const ring = [inset(badge, PIN_INSET - PIN_W / 2), inset(badge, PIN_INSET + PIN_W / 2)];
  const body = `<path d="${d([badge, ...ring, ...letters])}" fill="${color}" fill-rule="evenodd"/>`;
  const b = bbox([badge]), pad = 10;
  return svgDoc([b.x0 - pad, b.y0 - pad, b.w + pad * 2, b.h + pad * 2], body, '', 'machine', 1180);
}

// Square mark: the same plate, bezel, enamel and pinline, carrying a bold italic chrome M.
// S = 512 units. Everything scales from the badge's proportions to its height (200).
export function gtMarkSVG(prefix = 'gm', o = {}) {
  const id = (s) => `${prefix}-${s}`;
  const S = 512, k = S / 200; // badge-height units -> mark units
  const plate = chamfer(rect(0, 0, S, S, 'o'), () => PLATE_CHAMFER * k * 0.92);
  const bezel = (o.bezel ?? BEZEL) * k, pinIn = (o.pinInset ?? PIN_INSET) * k, pinW = (o.pinW ?? PIN_W) * k;
  // A heavier M than the wordmark so it holds at 16 px.
  const P = { X: 100, tv: 29, th: 25, td: 26, vy: 0.48, dm: 8, w: { M: 156 } };
  const st = upStyle({ sizes: { x: CROTCH, o: 14 } }, P);
  const wd = setWord('M', upper(P), P, st);
  const mh = o.mHeight ?? 196, s = mh / 100;
  let M = skew(wd.contours, LEAN, P.X / 2);
  const mb = bbox(M);
  M = mapPts(M, (x, y) => [S / 2 + (x - (mb.x0 + mb.x1) / 2) * s, S / 2 + (y - P.X / 2) * s + (o.mDy ?? 4)]);
  const my0 = S / 2 - mh / 2 + (o.mDy ?? 4);
  const defs = enamelDefs(id, 0, S, S * 0.44, inset(plate, bezel)) + vgrad(id('face'), my0 + 2 * s, my0 + mh - 2 * s, GRADS.chrome);
  let body = bevelled([plate], { bevel: bezel, rim: (o.rim ?? 2) * k, rimColor: '#030405', face: `url(#${id('enamel')})`, rampName: 'chrome' });
  if (o.finish !== false) body += enamelFinish(id, 0, S, 0, S, S * 0.44, 7 * k, 2 * k);
  if (pinW > 0) body += `<path d="${d([inset(plate, pinIn)])}" fill="none" stroke="${RED}" stroke-width="${r2(pinW)}"/>`;
  body += bevelled(M, { bevel: (o.mBevel ?? 3.6) * s, rim: (o.mRim ?? 2.2) * s, rimColor: NAVY_RIM, face: `url(#${id('face')})`, rampName: 'chrome' });
  return svgDoc([0, 0, S, S], body, defs, 'machine', o.width ?? S);
}

// 16 px drawing of the mark, on a 16-unit grid. At this size the chrome horizon splits the M and the
// pinline turns to noise, so: a one-pixel chrome rim, the enamel, and a heavy M in light metal without a horizon.
export function gtMark16SVG(prefix = 'g16', o = {}) {
  const id = (s) => `${prefix}-${s}`;
  const plate = chamfer(rect(0, 0, 16, 16, 'o'), () => 3);
  const enamel = inset(plate, o.rimW ?? 1.25);
  const P = { X: 100, tv: o.tv ?? 34, th: o.th ?? 30, td: o.td ?? 31, vy: 0.44, dm: 6, w: { M: 160 } };
  const wd = setWord('M', upper(P), P, upStyle({ sizes: { x: CROTCH, o: 12 } }, P));
  const mh = o.mh ?? 8.6, s = mh / 100;
  let M = skew(wd.contours, o.lean ?? LEAN, P.X / 2);
  const mb = bbox(M);
  M = mapPts(M, (x, y) => [8 + (x - (mb.x0 + mb.x1) / 2) * s + (o.dx ?? 0), 8 + (y - P.X / 2) * s + (o.dy ?? 0.3)]);
  const defs = vgrad(id('rim'), 0, 16, [[0, '#f2f4f6'], [0.5, '#a9b0b8'], [1, '#5d646d']]) +
    vgrad(id('en'), 1, 15, [[0, '#2a5bb0'], [1, '#0c2560']]) +
    vgrad(id('m'), 8 - mh / 2, 8 + mh / 2, [[0, '#ffffff'], [1, '#c4cad1']]);
  const body = `<path d="${d([plate])}" fill="url(#${id('rim')})"/><path d="${d([enamel])}" fill="url(#${id('en')})"/>` +
    `<path d="${d(M)}" fill="#04102b" stroke="#04102b" stroke-width="0.9" stroke-linejoin="round"/><path d="${d(M)}" fill="url(#${id('m')})"/>`;
  return svgDoc([0, 0, 16, 16], body, defs, 'machine', 16);
}
