#!/usr/bin/env bun
// M5 check, "describe it" through the UI: open New machine, type the description evals/describe.ts uses, send, and watch
// the graph build on the stage over SSE without reloading; then ask for the changelog step and watch one more node arrive.
//   bun evals/describe-ui.ts <port> [shots-dir]     (a running server; the default agent drafts; about a minute a turn)
import { chromium } from "playwright";

const DESCRIBE = "A process to ship a bug fix: reproduce it, write the fix, prove it with the test suite, open a PR, then a person reviews and approves or asks for changes; merged is the good end, abandoned if they reject.";
const REVISE = "Add a step before the PR where the agent updates the changelog.";
const TURN_MS = 4 * 60_000;
const [port, shots] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/#/machines/new`);
await page.waitForSelector("#describe");
await page.waitForSelector(".agent-pick");
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const nodes = () => page.locator(".gview [data-node]").count();
const shot = async (name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
await shot("describe-empty");
console.log(`${at()} opened New machine; agent: ${(await page.locator(".agent-pick").textContent())?.trim()}`);

async function turn(text: string, want: (n: number) => boolean, label: string, streamShot?: string) {
  await page.fill("#describe", text);
  await page.locator(".composer button.primary").click();
  const start = Date.now();
  let lastN = -1, sawStream = false, shotTaken = false;
  while (Date.now() - start < TURN_MS) {
    const n = await nodes();
    const running = await page.locator(".working").count();
    const streaming = await page.locator(".msg.agent.open").count();
    if (streaming && !sawStream) { sawStream = true; console.log(`${at()} agent text streaming`); }
    if (n !== lastN) { console.log(`${at()} graph shows ${n} node${n === 1 ? "" : "s"}${running ? " (turn running)" : ""}`); lastN = n; }
    if (streamShot && !shotTaken && running && n > 0) { await shot(streamShot); shotTaken = true; }
    if (!running && want(n) && Date.now() - start > 2000) break;
    await Bun.sleep(400);
  }
  const tools = await page.locator(".tool").allTextContents();
  const errs = await page.locator(".msg.err").allTextContents();
  const problems = (await page.locator(".problems").textContent())?.trim();
  console.log(`${at()} ${label}: ${await nodes()} nodes; tool rows: ${tools.map((t) => t.trim()).join(" | ") || "none"}; problems: ${problems}${errs.length ? `; errors: ${errs.join(" | ")}` : ""}`);
  return nodes();
}

const n1 = await turn(DESCRIBE, (n) => n >= 5, "after the description", "describe-streaming");
await shot("describe-done");
const url1 = page.url();
const n2 = await turn(REVISE, (n) => n >= n1 + 1, "after the follow-up");
const url2 = page.url();
const states = await page.locator(".gview [data-node]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.node));
console.log(`states: ${states.join(", ")}`);
console.log(`url: ${url2}${url1 === url2 ? "" : ` (was ${url1})`}; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
await browser.close();
const ok = n1 >= 5 && n2 === n1 + 1 && errors.length === 0;
console.log(ok ? `PASS: ${n1} nodes from the description, ${n2} after the follow-up, no reload` : `FAIL: ${n1} then ${n2} nodes`);
process.exit(ok ? 0 : 1);
