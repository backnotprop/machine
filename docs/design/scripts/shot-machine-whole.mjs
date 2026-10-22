import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", args: ["--disable-gpu"] });
const page = await b.newPage({ viewport: { width: 2000, height: 1236 }, colorScheme: "light" });
await page.goto("http://localhost:7420/#/machines/plannotator-release"); await page.waitForSelector(".gview svg");
await page.waitForTimeout(400);
const m = await page.evaluate(() => {
  const v = document.querySelector(".gview"), g = v.querySelector("svg"), bb = g.getBBox();
  const r = v.getBoundingClientRect();
  return { frame: [r.width, r.height], svg: [g.width.baseVal.value, g.height.baseVal.value], viewBox: g.getAttribute("viewBox"), pans: v.classList.contains("pans"), scrollW: v.scrollWidth, clientW: v.clientWidth, bbox: [bb.x, bb.y, bb.width, bb.height] };
});
console.log(JSON.stringify(m));
await page.screenshot({ path: "docs/design/shots/machine-whole.png" });
await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(400);
console.log(await page.evaluate(() => { const v = document.querySelector(".gview"); return { pans: v.classList.contains("pans"), scrollW: v.scrollWidth, clientW: v.clientWidth, viewBox: v.querySelector("svg").getAttribute("viewBox") }; }));
await page.screenshot({ path: "docs/design/shots/machine-whole-1280.png" });
await b.close();
