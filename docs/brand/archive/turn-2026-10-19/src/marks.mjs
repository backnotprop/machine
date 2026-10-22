// Turn, final geometry. Plan units; a state is a 4-unit cube. Path: A -> B (corner, lit) -> C.
import { box, render } from './iso.mjs';
import { raster, toSVG } from './raster.mjs';
const cube = (x, y, s, hot) => box(x, y, 0, x + s, y + s, s, hot);

export const PAL = {
  hero:  { cold: ['#55555e', '#34343b', '#202026'], hot: ['#8dbbff', '#3b82f6', '#1f55c8'] }, // 64 px and up, on near-black or white
  ui:    { cold: ['#7c7c86', '#53535c', '#38383f'], hot: ['#93c2ff', '#3b82f6', '#1f55c8'] }, // 18-24 px in the product sidebar
  icon:  { cold: ['#73737d', '#4b4b54', '#303037'], hot: ['#8dbbff', '#3b82f6', '#1f55c8'] }, // on the graphite app-icon tile
  small: { cold: ['#a2a2ac', '#73737d', '#53535c'], hot: ['#9cc6ff', '#3b82f6', '#2257cc'] }, // 16 and 32 px pixel drawings
  mono:  { cold: ['M.5', 'M.34', 'M.2'], hot: ['M1', 'M.78', 'M.58'] },                      // currentColor at these opacities
};

// Large-size candidates (round three's Turn was pitch 7, bars 2 wide and 1.4 thick, gap 1.25)
export const CAND = {
  bridges: () => { const p = 8.5, a = 1.2, c = 2.8; return [cube(0, 0, 4), box(4, a, 3, p, c, 4), cube(p, 0, 4, true), box(p + a, 4, 3, p + c, p, 4), cube(p, p, 4)]; },
  trace: () => { const p = 10, a = 1.4, c = 2.6; const L = [box(a, a, 0, p + c, c, 0.4), box(p + a, c, 0, p + c, p + c, 0.4)]; L.forEach(q => q.grp = 'L'); return [...L, cube(0, 0, 4), cube(p, 0, 4, true), cube(p, p, 4)]; },
  close: () => [cube(0, 0, 4), cube(5, 0, 4, true), cube(5, 5, 4)],
};
export const CHOSEN = 'bridges';

// vector mark in a 64 box. gap is in 64-box units.
export function hero(o = {}) { return heroR(o).svg; }
export function heroR({ pal = PAL.hero, gap = 0.9, pad = 4, cand = CHOSEN } = {}) {
  const r = render(CAND[cand](), { pal, pad, gap, size: 64 });
  let svg = r.svg;
  svg = svg.replace(/fill="M([\d.]+)"/g, (_, o) => o === '1' ? 'fill="currentColor"' : `fill="currentColor" fill-opacity="${o}"`);
  return { svg, extent: r.extent };
}

// Pixel drawings: point-sampled, every edge on a whole pixel.
const bx = (x0, y0, z0, x1, y1, z1, hot, gap) => ({ b: [x0, y0, z0, x1, y1, z1], hot, gap });
const pc = (x, y, s, hot) => bx(x, y, 0, x + s, y + s, s, hot);
export const PIX = {
  // 16: three 8 px cubes, a 2 px step between them, no bars (bars do not survive at this size)
  16: () => raster({ W: 16, k: 2, ox: 5, oy: 5, gap: 'n4', pal: PAL.small, items: [pc(0, 0, 2), pc(3, 0, 2, true), pc(3, 3, 2)] }),
  // 32: three 16 px cubes, pitch 8, both bridges 3 px wide and 2 px thick, flush with the tops
  32: () => raster({ W: 32, k: 2, ox: 8, oy: 8, gap: 'n4', pal: PAL.small, items: [pc(0, 0, 4), bx(4, 1.25, 3, 8, 2.75, 4, false, 0), pc(8, 0, 4, true), bx(9.25, 4, 3, 10.75, 8, 4, false, 0), pc(8, 8, 4)] }),
};
export const pixSVG = n => toSVG(PIX[n]());
