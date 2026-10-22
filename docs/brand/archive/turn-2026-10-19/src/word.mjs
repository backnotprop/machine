// Round two "Pull" wordmark letterforms (round geometric monoline, 8-unit stroke), baseline y=36, x-height top y=0.
// Final change: the i's stem is back on the baseline in the text colour, and its dot is the lit state, in blue.
const WORD = 'machine';
const RR = 14.6, C50 = [18 + RR * Math.cos(50 * Math.PI / 180), RR * Math.sin(50 * Math.PI / 180)];
const cBot = `${C50[0].toFixed(2)} ${(18 + C50[1]).toFixed(2)}`, cTop = `${C50[0].toFixed(2)} ${(18 - C50[1]).toFixed(2)}`;
const st = (c, s = 8) => `fill="none" stroke="${c}" stroke-width="${s}" stroke-linecap="butt" stroke-linejoin="round"`;
const L = {
  m: { w: 56, draw: p => `<path d="M4 36V16A12 12 0 0 1 28 16V36M28 16A12 12 0 0 1 52 16V36" ${st(p.fg)}/>` },
  a: { w: 36, draw: p => `<circle cx="18" cy="18" r="${RR}" ${st(p.fg)}/><path d="M32 0V36" ${st(p.fg)}/>` },
  c: { w: 32, draw: p => `<path d="M${cTop}A${RR} ${RR} 0 1 0 ${cBot}" ${st(p.fg)}/>` },
  h: { w: 36, draw: p => `<path d="M4 -16V36M4 18A14 14 0 0 1 32 18V36" ${st(p.fg)}/>` },
  i: { w: 8, draw: p => `<path d="M4 0V36" ${st(p.fg)}/><circle cx="4" cy="-11" r="5" fill="${p.acc}"/>` },
  n: { w: 36, draw: p => `<path d="M4 36V18A14 14 0 0 1 32 18V36" ${st(p.fg)}/>` },
  e: { w: 36, draw: p => `<path d="M${18 - RR} 18H${18 + RR}A${RR} ${RR} 0 1 0 ${cBot}" ${st(p.fg)}/>` },
};
const GAP = { ma: 6, ac: 6, ch: 9, hi: 9, in: 9, ne: 7 };
// returns { inner, vb:[x,y,w,h] } in letter units; vb spans ascender top (-16) to baseline (36)
export function wordmark(p) {
  let x = 0; const parts = [];
  for (let k = 0; k < WORD.length; k++) {
    const ch = WORD[k], l = L[ch];
    parts.push(`<g transform="translate(${x} 0)">${l.draw(p)}</g>`);
    x += l.w + (k < WORD.length - 1 ? GAP[ch + WORD[k + 1]] : 0);
  }
  return { inner: parts.join(''), vb: [0, -16, x, 52] };
}
