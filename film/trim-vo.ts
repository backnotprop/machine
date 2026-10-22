// bun film/trim-vo.ts [voice=charlie] — cut the breath Charlie takes after each line: find the last speech (> -28 dBFS over 10 ms),
// run on through any joined quiet tail (a final s), keep 60 ms after it, fade 60 ms, write video/audio/vo/<voice>-trim/<id>.mp3. Prints what was cut and the tail's loudness.
import { join } from "node:path"; import { mkdirSync, readdirSync } from "node:fs";
const V = join(import.meta.dir, "..", "video", "audio", "vo"), voice = process.argv[2] ?? "charlie", src = join(V, voice), dst = join(V, voice + "-trim");
mkdirSync(dst, { recursive: true });
const ids = JSON.parse(await Bun.file(join(import.meta.dir, "..", "video", "script.json")).text()).map((l: any) => l.id);
for (const id of ids) {
  const f = join(src, id + ".mp3"); if (!(await Bun.file(f).exists())) continue;
  const pcm = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", "44100", "-f", "f32le", "-"]).stdout;
  const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4), W = 441, n = Math.floor(s.length / W), db: number[] = [];
  for (let i = 0; i < n; i++) { let e = 0; for (let k = 0; k < W; k++) e += s[i * W + k] ** 2; db.push(10 * Math.log10(e / W + 1e-12)); }
  let last = db.length - 1; while (last > 0 && db[last] < -28) last--;
  // a final fricative (the s of agents) is quiet but joined to the word; the breath comes after a real gap. Extend through anything contiguous above -48 dB.
  while (last + 1 < db.length && db[last + 1] > -48) last++;
  let first = 0; while (first < db.length && db[first] < -28) first++;
  const total = s.length / 44100, end = Math.min(total, (last + 1) * .01 + .06);
  const tailMax = Math.max(...db.slice(last + 1)), headMax = Math.max(-99, ...db.slice(0, first));
  Bun.spawnSync(["ffmpeg", "-y", "-v", "error", "-i", f, "-af", `atrim=0:${end.toFixed(3)},afade=t=out:st=${(end - .06).toFixed(3)}:d=0.06`, "-c:a", "libmp3lame", "-b:a", "160k", join(dst, id + ".mp3")]);
  console.log(id.padEnd(12), `speech ${(first * .01).toFixed(2)}–${((last + 1) * .01).toFixed(2)}  was ${total.toFixed(2)} → ${end.toFixed(2)}  cut ${(total - end).toFixed(2)}s  tail peak ${tailMax.toFixed(0)} dB  head peak ${headMax.toFixed(0)} dB`);
}
