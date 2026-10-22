// Screenshots of the describe screen in its three dock modes: node docs/byoa/scripts/shot-dock.mjs → docs/byoa/shots/dock-{float,side,off}[-empty].png
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", args: ["--disable-gpu"] });
const id = (await (await fetch("http://localhost:7420/api/machines")).json())[0]?.id;
for (const [mode, revise] of [["float", id], ["side", id], ["off", id], ["float", null], ["off", null]]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  await p.addInitScript((m) => localStorage.setItem("machine:describe:dock", m), mode);
  await p.goto(`http://localhost:7420/#/machines/new${revise ? `?revise=${revise}` : ""}`); await p.waitForTimeout(1800);
  await p.screenshot({ path: `docs/byoa/shots/dock-${mode}${revise ? "" : "-empty"}.png` });
  await p.close();
}
await b.close(); console.log("ok");
