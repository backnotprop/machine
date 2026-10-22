// node docs/byoa/scripts/shot.mjs   (from the repo root) → docs/byoa/shots/explainer.png + step-1..7.png
import { chromium } from "playwright";
const dir = new URL("../", import.meta.url).pathname, url = "file://" + dir + "mock.html";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(url); await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${dir}shots/explainer.png`, fullPage: true });
const app = page.locator("#app");
for (let n = 1; n <= 7; n++) { await page.evaluate((n) => window.go(n), n); await page.waitForTimeout(80); await app.screenshot({ path: `${dir}shots/step-${n}.png` }); }
console.log("shots", errs.length ? errs : "ok");
await browser.close();
