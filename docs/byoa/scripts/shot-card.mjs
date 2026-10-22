// Screenshots of connecting an agent: the empty designer, the agent menu, the lines: node docs/byoa/scripts/shot-card.mjs → docs/byoa/shots/card-{light,dark}.png
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", args: ["--disable-gpu"] });
for (const scheme of ["light", "dark"]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await p.goto("http://localhost:7420/#/machines/new"); await p.waitForTimeout(1500);
  await p.screenshot({ path: `docs/byoa/shots/card-${scheme}.png` });
  await p.locator(".agent-pick").click(); await p.waitForTimeout(300); await p.screenshot({ path: `docs/byoa/shots/card-${scheme}-menu.png` });
  await p.locator('.agent-menu button[data-host="claude-code"]').click(); await p.waitForTimeout(600); await p.screenshot({ path: `docs/byoa/shots/card-${scheme}-lines.png` });
  await p.close();
}
await b.close(); console.log("ok");
