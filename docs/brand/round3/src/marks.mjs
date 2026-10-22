import { box, prism } from './iso.mjs';
const cube = (x, y, z, s, hot) => box(x, y, z, x + s, y + s, z + s, hot);
const G = (it, g) => (it.grp = g, it);
export const PAL = {
  hero: { cold: ['#55555e', '#34343b', '#202026'], hot: ['#8dbbff', '#3b82f6', '#1f55c8'] },
  fav: { cold: ['#8b8b95', '#5d5d67', '#3d3d45'], hot: ['#93c2ff', '#3b82f6', '#1d4fc0'] },
};
const chev = (x, z, w, h, t) => [[x, z], [x + t, z], [x + w, z + h / 2], [x + t, z + h], [x, z + h], [x + w - t, z + h / 2]];
// bars: x-bar from (x0..x1) at y band, flush with top z
const xb = (x0, x1, y0, y1, z0, z1) => box(x0, y0, z0, x1, y1, z1);
const yb = (y0, y1, x0, x1, z0, z1) => box(x0, y0, z0, x1, y1, z1);
const diamond = (s, sp, lit, w, h, stub) => {
  const a = (s - w) / 2, b = a + w, z1 = s, z0 = s - h;
  const o = [cube(0, sp, 0, s, lit === 'A'), cube(0, 0, 0, s, lit === 'T'), cube(sp, sp, 0, s, lit === 'B'), cube(sp, 0, 0, s, lit === 'C')];
  if (w) o.push(yb(s, sp, a, b, z0, z1), xb(s, sp, sp + a, sp + b, z0, z1), xb(s, sp, a, b, z0, z1), yb(s, sp, sp + a, sp + b, z0, z1));
  if (stub) o.push(yb(-stub, 0, a, b, z0, z1), xb(sp + s, sp + s + stub, sp + a, sp + b, z0, z1));
  return o;
};
const HB = [1, 3, 2.6, 4]; // hero bar band: y0,y1,z0,z1 for 4-unit cubes
export const MARKS = {
  row: {
    hero: () => { const o = []; for (let i = 0; i < 3; i++) { const x = 7 * i; o.push(cube(x, 0, 0, 4, i === 1)); if (i < 2) o.push(xb(x + 4, x + 7, ...HB)); } return o; },
    s16: () => [cube(0, 0, 0, 2), xb(2, 3, 0.5, 1.5, 1, 2), cube(3, 0, 0, 2, true)],
  },
  stair: {
    hero: () => { const o = []; for (let i = 0; i < 3; i++) { const x = 7 * i, z = 2.5 * (2 - i); o.push(cube(x, 0, z, 4, i === 1)); if (i < 2) o.push(xb(x + 4, x + 7, 1, 3, z, z + 1.5)); } return o; },
    s16: () => [cube(0, 0, 1.5, 2), xb(2, 3, 0.5, 1.5, 1.5, 2), cube(3, 0, 0, 2, true)],
  },
  turn: {
    hero: () => [cube(0, 0, 0, 4), xb(4, 7, ...HB), cube(7, 0, 0, 4, true), yb(4, 7, 8, 10, 2.6, 4), cube(7, 7, 0, 4)],
    s16: () => [cube(0, 0, 0, 2), cube(3, 0, 0, 2, true), cube(3, 3, 0, 2)],
  },
  fork: {
    hero: () => diamond(4, 9, 'B', 2, 1.4, 3),
    s16: () => diamond(1.5, 2.5, 'B'),
  },
  loop: {
    hero: () => diamond(4, 9, 'C', 2, 1.4),
    s16: () => diamond(1.5, 2.5, 'C'),
  },
  channel: {
    hero: () => [G(box(0, 0, 0, 12, 2.5, 5), 'b'), G(box(0, 2.5, 0, 12, 7, 3.5), 'b'), G(box(0, 7, 0, 12, 9.5, 5), 'b'), box(4.5, 3, 3.5, 8, 6.5, 7, true)],
    s16: () => [G(box(0, 0, 0, 5, 1, 2), 'b'), G(box(0, 1, 0, 5, 3, 1), 'b'), G(box(0, 3, 0, 5, 4, 2), 'b'), box(2.5, 1, 1, 4.5, 3, 3, true)],
  },
  pull: {
    hero: () => [box(0, 0, 0, 10, 10, 3), box(4.5, 0, 4.2, 14.5, 10, 7.2, true), box(0, 0, 8.4, 10, 10, 11.4)],
    s16: () => [box(0, 0, 0, 3, 3, 1), box(1.5, 0, 1.5, 4.5, 3, 3, true), box(0, 0, 3.5, 3, 3, 4.5)],
  },
  faces: {
    hero: () => [box(0, 0, 7.8, 10, 10, 10), box(0, 7.8, 0, 10, 10, 7.2), box(7.8, 0, 0, 10, 7.2, 7.2, true)],
    s16: null,
  },
  rail: {
    hero: () => [box(-5, 3, 0, 27, 5, 1.4), ...[0, 1, 2].map(i => box(9 * i, 1, 1.4, 9 * i + 5, 7, 5.4, i === 1))],
    s16: () => [box(0, 0.5, 0, 6.5, 1.5, 1), box(2, 0, 1, 4, 2, 3, true)],
  },
  entry: {
    hero: () => [prism([[0, -1], [3.6, 2], [0, 5]], 0, 1.4), cube(5, 0, 0, 4), xb(9, 12, ...HB), cube(12, 0, 0, 4, true)],
    s16: () => [prism([[0, -1], [3, 0.5], [0, 2]], 0, 1), cube(3.5, 0, 0, 2, true)],
  },
};
