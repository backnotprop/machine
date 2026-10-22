// Interactive states, light and dark: a chosen decision with the note focused, keyboard focus on a button,
// a hovered row, list keyboard selection, the agent menu open, and a node's draw controls in the editor.
import { chromium } from "playwright";
const out = new URL("../after/", import.meta.url).pathname;
const base = "http://localhost:7420";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
let errs = 0;
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { errs++; console.log("pageerror", e.message); });
  p.on("console", (m) => { if (m.type() === "error") { errs++; console.log("console", m.text()); } });
  await p.route("**/api/author/sessions", (r) => r.fulfill({ json: { id: "s_mock", agent: "claude", config: [{ id: "model", name: "Model", value: "opus", options: [{ value: "opus", name: "Opus" }, { value: "sonnet", name: "Sonnet" }] }], draft: null, problems: [] } }));
  await p.route("**/api/author/sessions/**", (r) => r.fulfill({ json: { ok: true } }));
  // runs: hover a row, then keyboard selection (j j)
  await p.goto(`${base}/#/`, { waitUntil: "networkidle" }); await p.waitForTimeout(700);
  await p.locator(".row").nth(1).hover(); await p.waitForTimeout(200);
  await p.keyboard.press("j"); await p.keyboard.press("j"); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}s1-runs-hover-select-${theme}.png` });
  // blocked run: type in the answer, then Tab to the button (keyboard focus ring)
  await p.goto(`${base}/#/runs/run_8y031ugp`, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
  await p.fill("#reply", "1. Record them as skipped.\n2. Yes, not applicable."); await p.keyboard.press("Tab"); await p.waitForTimeout(200);
  await p.locator(".frame").screenshot({ path: `${out}s2-answer-focus-${theme}.png` });
  // editor: hover a node for its + and ×, open a block
  await p.goto(`${base}/#/machines/ship-fix`, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
  await p.locator('.graph [data-node="verify"] .nb').hover(); await p.waitForTimeout(300);
  await p.locator(".stage-ed").screenshot({ path: `${out}s3-editor-node-hover-${theme}.png` });
  // describe: the agent menu open
  await p.goto(`${base}/#/machines/new`, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
  await p.locator(".agent-pick").first().click(); await p.waitForTimeout(400);
  await p.locator(".inspector").screenshot({ path: `${out}s4-agent-menu-${theme}.png` });
  console.log(theme, "done");
  await ctx.close();
}
await b.close();
console.log(errs ? `${errs} console problem(s)` : "console clean");
