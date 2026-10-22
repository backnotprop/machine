// Live proof of "connect your agent" over BYOA against the running server, with the fake connector (the real
// @byoa/connector-core with a scripted host) standing in for an agent:
//   node docs/byoa/scripts/e2e.mjs   (from the repo root; server on :7420; nothing else connected)
// 1 the designer asks for an agent; 2 picking Claude Code in the agent menu shows the lines and waits; 3 the connector starts,
// pairs in one command and the designer picks the session up by itself; 4 a message typed in the designer reaches the
// connector with the model the person picked, the agent drafts through the proxied tool; the graph and the note appear;
// 5 the connector dies: after the wire's 60 s the pick dims to "last seen"; a message sent then shows as waiting; 6 it comes
// back with the same session id and the waiting message goes out. Screenshots in docs/byoa/shots/live-*.png.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const out = "docs/byoa/shots/";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let plugin = null, said = "";
process.on("exit", () => plugin?.kill());   // never leave the stand-in polling after a failed run
import { mkdtempSync } from "node:fs";
const home = mkdtempSync("/tmp/machine-e2e-byoa-");   // one credential for the whole run: the restart keeps the session id
const start = () => { plugin = spawn("bun", ["docs/byoa/scripts/fake-connector.ts", "http://localhost:7420", "e2e-1", "/Users/ramos/code/acme", home], { stdio: ["ignore", "pipe", "inherit"] }); plugin.stdout.on("data", (d) => { said += d; process.stdout.write("  [connector] " + d); }); };

await p.goto("http://localhost:7420/#/machines/new");
await p.getByText("Connect your agent", { exact: true }).first().waitFor({ timeout: 10000 });
await p.screenshot({ path: out + "live-1-card.png" }); log("1 asks for an agent");

await p.locator(".agent-pick").first().click();
await p.locator('.agent-menu button[data-host="claude-code"]').click();
await p.getByText("Waiting for Claude Code").waitFor();
await p.screenshot({ path: out + "live-2-waiting.png" }); log("2 waiting, lines shown:", await p.locator(".connect .ln code").allTextContents());

start();
await p.locator(".agent-pick .dot:not(.off)").waitFor({ timeout: 10000 });
await p.screenshot({ path: out + "live-3-connected.png" }); log("3 connected:", await p.locator(".agent-pick").first().innerText());
// The model and effort the plugin reported are pickers now; choosing Opus here reaches the plugin with the next message.
await p.getByRole("button", { name: /^Model: Sonnet/ }).waitFor({ timeout: 5000 });
await p.getByRole("button", { name: /^Model: Sonnet/ }).click(); await p.getByRole("option", { name: "Opus" }).click();
await p.getByRole("button", { name: /^Model: Opus/ }).waitFor({ timeout: 5000 });
log("3 picked Opus; effort shows:", await p.getByRole("button", { name: /^Effort:/ }).innerText());

await p.getByLabel("Describe the process").fill("Triage the issue, implement the fix, run the tests, then a person reviews. Changes requested goes back to the fix. Merged is the end.");
await p.getByRole("button", { name: "Send" }).click();
log("4 sent");
await p.getByText("Drafted · 5 states · clean").waitFor({ timeout: 15000 });
await p.getByText("Drew it: triage, build, verify").waitFor({ timeout: 5000 });
await p.getByText("Nothing to fix. Publish when ready.").waitFor({ timeout: 5000 });
await p.waitForTimeout(400);
await p.screenshot({ path: out + "live-4-drawn.png" });
log("4 drawn; publish enabled:", await p.getByRole("button", { name: "Publish" }).isEnabled());
if (!said.includes("set model=opus")) throw new Error("the connector did not receive the model choice"); log("4 the connector applied model=opus before the message");

plugin.kill(); plugin = null; log("5 connector killed; waiting for the wire's 60 s gone timeout");
await p.locator(".agent-pick").first().getByText(/last seen/).waitFor({ timeout: 90000 });
await p.getByLabel("Describe the process").fill("Add a state before ship that deploys to staging.");
await p.getByRole("button", { name: "Send" }).click();
await p.getByText("Waiting for Claude Code to pick it up").waitFor({ timeout: 5000 });
await p.screenshot({ path: out + "live-5-away.png" }); log("5 away: message waits");

start();
await p.getByText("Drafted · 5 states · clean").nth(1).waitFor({ timeout: 15000 });
await p.waitForTimeout(400);
await p.screenshot({ path: out + "live-6-back.png" }); log("6 back: the waiting message was drained");
plugin.kill();
log("errors:", errs.length ? errs : "none");
await b.close();
