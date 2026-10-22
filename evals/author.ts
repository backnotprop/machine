#!/usr/bin/env bun
// M3 check: author changelog-draft from an empty machine through the real editor UI, publish it,
// and confirm the published definition equals the hand-written example. Then the normal eval can run it.
//   bun evals/author.ts <port>        (server must be running with MACHINE_SKILLS_DIR pointing at a scratch dir)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatEvents, formatFields, formatRequirements } from "../src/ui/lines.ts";

const port = process.argv[2]; const base = `http://127.0.0.1:${port}`;
const root = resolve(import.meta.dir, "..");
const target = JSON.parse(readFileSync(join(root, "examples/changelog-draft.machine.json"), "utf8"));

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
await page.goto(`${base}/#/machines/new/draw`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".blk");

const fill = async (label: string, value: string) => {
  console.log("  fill", label, JSON.stringify(value.slice(0, 40)));
  const field = page.locator(".blk.sel .field", { has: page.locator(".k", { hasText: new RegExp(`^${label}$`, "i") }) }).first();
  const box = field.locator("input, textarea").first();
  await box.fill(value); await box.blur();
};
const selectBlock = async (text: string) => { await page.locator(".blk", { hasText: text }).first().click(); };

// head
await fill("id", target.id); await fill("name", target.name); await fill("description", target.description); await fill("initial", target.initial);
await selectBlock("inputs"); await fill("fields", formatFields(target.inputs));
await selectBlock("Checks"); await fill("checks", formatRequirements(target.requirements));
// states: rename the two template states, add the rest
const ids = Object.keys(target.states);
const templateIds = ["start", "done"];
for (let i = 0; i < ids.length; i++) {
  if (i < templateIds.length) await selectBlock(templateIds[i]);
  else { await page.locator(".blk", { hasText: "+ Add state" }).click(); }
  const idBox = page.locator(".blk.sel .field", { has: page.locator(".k", { hasText: /^id$/i }) }).locator("input");
  await idBox.fill(ids[i]); await idBox.press("Enter");
  await page.waitForSelector(`.blk.sel:has-text("${ids[i]}")`);
  const s = target.states[ids[i]];
  console.log("state", ids[i], s.kind);
  await page.locator(".blk.sel select").first().selectOption(s.kind);
  await fill("title", s.title);
  if (s.kind === "final") await page.locator(".blk.sel select").nth(1).selectOption(s.outcome);
  else {
    if (s.kind !== "wait") { await fill("instructions", s.instructions ?? ""); await fill("report", formatFields(s.output)); }
    await fill("events", formatEvents(s.on));
  }
}
const problems = (await page.locator(".problems").textContent())?.trim();
console.log("problems line:", problems);
await page.screenshot({ path: "/tmp/author-before-publish.png", fullPage: true });
await page.getByRole("button", { name: "Publish" }).click();
await page.waitForSelector("text=/published v\\d+/i", { timeout: 5000 });
console.log("status:", (await page.locator("header.top .actions").textContent())?.trim());
await browser.close();

const published = await (await fetch(`${base}/api/machines/${target.id}`)).json();
// order-independent comparison: sort keys at every level, ignore version
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const strip = (m: any) => { const c = structuredClone(m); delete c.version; return canon(JSON.parse(JSON.stringify(c, (k, v) => (k === "required" && v === false) ? undefined : v))); };
const a = JSON.stringify(strip(published), null, 1), b = JSON.stringify(strip(target), null, 1);
if (a !== b) {
  const al = a.split("\n"), bl = b.split("\n");
  console.log("DIFFERENCE between published and example (published / example):");
  al.forEach((l, i) => { if (l !== bl[i]) console.log(`  ${l}   /   ${bl[i]}`); });
}
console.log(a === b ? "published definition equals examples/changelog-draft.machine.json" : "published definition DIFFERS");
process.exit(a === b ? 0 : 1);
