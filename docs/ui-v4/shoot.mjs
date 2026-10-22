// Capture screens. Run from the repo root so "playwright" resolves:
//   bun docs/ui-v4/shoot.mjs <base> <outdir> <width>x<height> name=hash[,action] ...
// action: "full" presses f for the full screen graph; "sel:<state>" clicks a node in the editor.
import { chromium } from "playwright";
const [base, out, size, ...shots] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
for (const s of shots) {
  const [name, rest] = s.split("=");
  const [hash, ...actions] = rest.split(",");
  await page.goto(base.replace(/\/?$/, "/") + hash);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  let fullPage = false;
  for (const a of actions) {
    if (a === "full") { await page.keyboard.press("f"); await page.waitForTimeout(700); }
    else if (a === "page") fullPage = true;
    else if (a.startsWith("sel:")) { await page.click(`.gview [data-node="${a.slice(4)}"]`); await page.waitForTimeout(500); }
    else if (a.startsWith("type:")) { await page.fill("#reply", a.slice(5)); await page.waitForTimeout(200); }
    else if (a.startsWith("click:")) { await page.click(a.slice(6)); await page.waitForTimeout(400); }
    else if (a.startsWith("scroll:")) { await page.evaluate((s) => { const el = document.querySelector(s); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80); }, a.slice(7)); await page.waitForTimeout(400); }
    else if (a.startsWith("key:")) { await page.keyboard.press(a.slice(4)); await page.waitForTimeout(300); }
  }
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
  console.log("shot", name);
}
if (errors.length) console.log("ERRORS", errors);
await browser.close();
