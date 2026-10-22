#!/usr/bin/env bun
// Browser-side check for M2. Opens the UI once and never reloads; everything it sees must arrive over SSE.
//   bun evals/watch.ts live <port> [seconds]   wait for a run to appear, open it, record the states it passes through
//   bun evals/watch.ts approve <port>           open the waiting run, click [ approved ], confirm the page moved to merged
import { chromium } from "playwright";
const [mode, portArg, secs] = process.argv.slice(2);
const base = `http://127.0.0.1:${portArg}`;
const shot = (n: string) => `/tmp/watch-${mode}-${n}.png`;

async function waitForServer() { for (let i = 0; i < 300; i++) { try { if ((await fetch(base + "/api/health")).ok) return; } catch { } await Bun.sleep(200); } throw new Error("no server"); }
await waitForServer();
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1100, height: 1300 } });

if (mode === "live") {
  await page.goto(base + "/#/");
  const seen: string[] = [];
  const deadline = Date.now() + Number(secs ?? 120) * 1000;
  let opened = false;
  while (Date.now() < deadline) {
    if (!opened) {
      const row = page.locator("a.row").first();
      if (await row.count()) { await row.click(); opened = true; await page.waitForSelector(".now .kind"); }
    } else {
      const kind = (await page.locator(".now .kind").textContent())?.trim() ?? "";
      const n = await page.locator(".hist li").count();
      const key = `${kind} · ${n} entries`;
      if (seen.at(-1) !== key) { seen.push(key); await page.screenshot({ path: shot(String(seen.length)), fullPage: true }); console.log(new Date().toTimeString().slice(0, 8), key); }
      if (kind.includes("succeeded") || kind.includes("failed") || kind.includes("blocked")) break;
    }
    await Bun.sleep(500);
  }
  console.log(`observed ${seen.length} distinct page states without reloading`);
  await browser.close();
  process.exit(seen.length >= 3 ? 0 : 1);
}

if (mode === "approve") {
  const runs = await (await fetch(base + "/api/runs")).json() as { id: string; status: string }[];
  const waiting = runs.find((r) => r.status === "waiting");
  if (!waiting) throw new Error("no waiting run to approve");
  await page.goto(`${base}/#/runs/${waiting.id}`);
  await page.waitForSelector(".now .kind");
  const before = (await page.locator(".now .kind").textContent())?.trim();
  await page.screenshot({ path: shot("before"), fullPage: true });
  await page.locator(".choice", { hasText: /approved/i }).click();
  await page.locator(".answer button.primary").click();
  await page.waitForFunction(() => document.querySelector(".now .kind")?.textContent?.includes("succeeded"), null, { timeout: 5000 });
  const after = (await page.locator(".now .kind").textContent())?.trim();
  const lastLine = (await page.locator(".hist li").last().textContent())?.trim();
  await page.screenshot({ path: shot("after"), fullPage: true });
  console.log(`before: ${before}\nafter:  ${after}\nlast history line: ${lastLine}`);
  const row = await (await fetch(`${base}/api/runs/${waiting.id}`)).json();
  console.log(`server says: ${row.status} / ${row.state}, last actor ${row.history.at(-1).actor}`);
  await browser.close();
  process.exit(after?.includes("succeeded") && row.state === "merged" && row.status === "succeeded" ? 0 : 1);
}
