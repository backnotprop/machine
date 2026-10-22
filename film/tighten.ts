// bun film/tighten.ts <in.mp3> <out.mp3> [maxGap=0.22] [minGap=0.32] — shorten pauses inside a line: any silence (< -45 dBFS) longer than
// minGap becomes maxGap. Prints each cut with its position so timings can be re-derived. Leading and trailing silence untouched.
const [inp, outp] = [process.argv[2], process.argv[3]], maxGap = Number(process.argv[4] ?? .22), minGap = Number(process.argv[5] ?? .32);
const pcm = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", inp, "-ac", "1", "-ar", "44100", "-f", "f32le", "-"]).stdout;
const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4), W = 441, n = Math.floor(s.length / W), db: number[] = [];
for (let i = 0; i < n; i++) { let e = 0; for (let k = 0; k < W; k++) e += s[i * W + k] ** 2; db.push(10 * Math.log10(e / W + 1e-12)); }
let first = 0; while (first < n && db[first] < -28) first++; let last = n - 1; while (last > 0 && db[last] < -28) last--;
const keep: [number, number][] = []; let segStart = 0, i = first, cut = 0;
while (i < last) { if (db[i] < -45) { let j = i; while (j < last && db[j] < -45) j++; const gap = (j - i) * .01; if (gap > minGap) { const trim = gap - maxGap; keep.push([segStart, (i + Math.round(maxGap / 2 * 100)) * .01]); segStart = (j - Math.round(maxGap / 2 * 100)) * .01; cut += trim; console.log(`gap at ${(i * .01).toFixed(2)}s: ${gap.toFixed(2)}s → ${maxGap}s (cumulative cut ${cut.toFixed(2)}s)`); } i = j; } else i++; }
keep.push([segStart, s.length / 44100]);
const chain = keep.map(([a, b], k) => `[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS[s${k}]`).join(";") + ";" + keep.map((_, k) => `[s${k}]`).join("") + `concat=n=${keep.length}:v=0:a=1[o]`;
const r = Bun.spawnSync(["ffmpeg", "-y", "-v", "error", "-i", inp, "-filter_complex", chain, "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "160k", outp]); if (r.exitCode) { console.error(new TextDecoder().decode(r.stderr)); process.exit(1); }
console.log(`${inp} → ${outp}: ${(s.length / 44100).toFixed(2)}s → ${(s.length / 44100 - cut).toFixed(2)}s`);
