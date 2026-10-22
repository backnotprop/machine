import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" }); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("http://localhost:7420/#/machines/ship-fix"); await p.waitForTimeout(1200); await p.screenshot({ path: "docs/design/after/20-editor-ioskeley-dark.png" });
const ok = await p.evaluate(() => document.fonts.check('13px "IoskeleyMono"')); console.log("IoskeleyMono loaded:", ok, "| errors:", errs);
const runs = await p.goto("http://localhost:7420/#/runs"); await p.waitForTimeout(900); const id = await p.evaluate(() => (document.querySelector('a[href^="#/runs/"]')||{}).getAttribute?.('href')); if (id) { await p.goto("http://localhost:7420/" + id); await p.waitForTimeout(1200); await p.screenshot({ path: "docs/design/after/21-run-ioskeley-dark.png" }); }
await b.close();
