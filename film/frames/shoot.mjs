// bun film/frames/shoot.mjs [a b c]  → film/frames/out/<name>.png at 1920×1080 (and a half-size sheet of all three)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const dir = new URL(".", import.meta.url).pathname, out = dir + "out/"; mkdirSync(out, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["a-floor", "b-code", "c-ascii"];
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=metal", "--force-color-profile=srgb"] });
for (const n of names) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("file://" + dir + n + ".html"); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  await page.screenshot({ path: out + n + ".png" }); console.log(n, errs.join(" | ") || "ok"); await page.close();
}
await browser.close();
