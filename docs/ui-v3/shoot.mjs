// Capture screens at 1440x900 @2x and measure what competes for attention in the first viewport.
// Usage (from the repo root so "playwright" resolves):
//   bun docs/ui-v3/shoot.mjs http://localhost:7420/ docs/ui-v3/before
//   bun docs/ui-v3/shoot.mjs file://$PWD/docs/ui-v3/prototype/index.html docs/ui-v3/after
import { chromium } from "playwright";
const [base, out] = process.argv.slice(2);
const shots = [
  ["runs", "#/"],
  ["run-blocked", "#/runs/run_8y031ugp"],
  ["run-finished", "#/runs/run_6uits7en"],
  ["machines", "#/machines"],
  ["editor", "#/machines/plannotator-release"],
];
const proto = base.startsWith("file:");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const metrics = {};
// Visible things in the first viewport: text runs, controls, distinct type styles, distinct text colours, boxed regions.
const measure = () => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && cs.visibility !== "hidden" && +cs.opacity > 0.05; };
  const texts = [], styles = new Set(), colours = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || !vis(el) || el.closest("svg")) continue;
    texts.push(el); const cs = getComputedStyle(el);
    styles.add(`${cs.fontFamily.split(",")[0]} ${cs.fontSize} ${cs.fontWeight}`); colours.add(cs.color);
  }
  const svgText = [...document.querySelectorAll("svg text")].filter(vis).length;
  const controls = [...document.querySelectorAll("a[href], button, input, textarea, select")].filter(vis).length;
  const boxes = [...document.querySelectorAll("body *")].filter((el) => { if (!vis(el)) return false; const cs = getComputedStyle(el); return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" && el.getBoundingClientRect().width > 40; }).length;
  return { textRuns: new Set(texts).size, graphLabels: svgText, controls, typeStyles: styles.size, textColours: colours.size, borderedBoxes: boxes };
});
for (const [name, hash] of shots) {
  await page.goto(proto ? base + hash : base.replace(/\/?$/, "/") + hash, { waitUntil: "networkidle" });
  if (proto) await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png` });
  metrics[name] = await measure();
  if (!proto) await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
}
if (proto) {
  // The disclosed states: history open with one step expanded, the map open, the editor with a step selected.
  await page.goto(base + "#/runs/run_8y031ugp"); await page.waitForTimeout(400);
  await page.click('[data-open="history"]'); await page.click('[data-step="1"]');
  await page.evaluate(() => document.querySelector('[data-open="history"]').scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/run-blocked-history.png` });
  await page.click('[data-open="history"]'); await page.click('[data-open="map"]');
  await page.evaluate(() => document.querySelector('[data-open="map"]').scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400); await page.screenshot({ path: `${out}/run-blocked-map.png` });
  await page.goto(base + "#/runs/run_8y031ugp"); await page.reload(); await page.waitForTimeout(300);
  await page.fill("#reply", "Record OpenCode and Pi as skipped for this fixture run, and the Inbox store check as not applicable.");
  await page.click('[data-act="resume"]'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/run-resumed.png` });
  await page.goto(base + "#/machines/plannotator-release"); await page.reload(); await page.waitForTimeout(300);
  await page.click('[data-node="smoke"]'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/editor-step.png` });
}
await Bun.write(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 1)); if (errors.length) console.log("ERRORS", errors);
await browser.close();
