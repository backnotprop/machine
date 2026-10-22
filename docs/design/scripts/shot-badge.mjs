import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" }); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("http://localhost:7420/#/runs"); await p.waitForTimeout(1000); await p.screenshot({ path: "docs/design/after/22-runs-badge-dark.png", clip: { x: 0, y: 0, width: 1440, height: 420 } }); console.log("errors:", errs); await b.close();
