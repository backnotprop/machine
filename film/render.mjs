// node film/render.mjs                 → film/out/film.mp4 (every frame, 60 fps) + film/out/contact.jpg
// node film/render.mjs --still 3,12.5  → film/out/still-3.png, still-12.5.png
// node film/render.mjs --grid          → film/out/contact.jpg only (one frame a second)
// run from /Users/ramos/oss/machine so playwright resolves.
import { chromium } from "playwright";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const dir = new URL(".", import.meta.url).pathname, out = dir + "out/", url = "file://" + dir + "film.html";
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
// CPU rasterisation only: the GPU path (ANGLE on Metal) was running when the machine hung on 2026-10-20, so keep headless
// Chrome off the GPU driver. Slower per frame, but the picture is identical.
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--disable-gpu-compositing", "--force-color-profile=srgb"] });
let DUR = 47;
async function open() { const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); const errs = []; page.on("pageerror", (e) => errs.push(e.message)); await page.goto(url); await page.evaluate(() => window.__film.ready); DUR = await page.evaluate(() => window.__film.duration); return { page, errs }; }
const shoot = async (page, t, path) => { await page.evaluate((t) => window.__film.seek(t), t); await page.screenshot({ path, clip: { x: 0, y: 0, width: 1920, height: 1080 } }); };
const ff = (a) => { const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...a], { stdio: "inherit" }); if (r.status) process.exit(r.status); };

if (opt("--still")) { const { page, errs } = await open(); for (const t of opt("--still").split(",").map(Number)) await shoot(page, t, `${out}still-${t}.png`); console.log("stills", errs.length ? errs : "ok"); }
else if (args.includes("--grid")) { const { page, errs } = await open(); const g = out + "grid/"; rmSync(g, { recursive: true, force: true }); mkdirSync(g); let n = 0; for (let t = 0; t < DUR; t += 1) await shoot(page, t, `${g}${String(n++).padStart(3, "0")}.png`); ff(["-i", g + "%03d.png", "-vf", "scale=320:-1,tile=6x13", "-q:v", "3", out + "contact.jpg"]); console.log("grid", errs.length ? errs : "ok"); }
else {
  const fps = +(opt("--fps") || 60), fr = out + "frames/"; rmSync(fr, { recursive: true, force: true }); mkdirSync(fr);
  const workers = +(opt("--workers") || 2), pages = await Promise.all(Array.from({ length: workers }, open)), t0 = Date.now(), N = Math.round(DUR * fps);
  await Promise.all(pages.map(async ({ page }, w) => { for (let f = w; f < N; f += workers) { await shoot(page, f / fps, `${fr}${String(f).padStart(5, "0")}.png`); if (f % 300 === 0) console.log(`frame ${f}/${N}  ${((Date.now() - t0) / 1000) | 0}s`); } }));
  const errs = pages.flatMap((p) => p.errs); console.log("frames", errs.length ? errs : "ok");
  ff(["-framerate", String(fps), "-i", fr + "%05d.png", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out + "film.mp4"]);
  ff(["-i", out + "film.mp4", "-vf", `fps=1,scale=320:-1,tile=6x13`, "-frames:v", "1", "-q:v", "3", out + "contact.jpg"]);
  console.log("film/out/film.mp4");
}
await browser.close();
