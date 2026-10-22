// Reference screenshots of design.interfere.com, light and dark, 1440x900.
import { chromium } from "playwright";
const out = new URL("../shots-interfere/", import.meta.url).pathname;
const pages = ["", "colors", "button", "card", "input", "textarea", "select", "menu", "table", "tabs", "badge", "kbd", "dialog", "tooltip", "divider", "code-card", "skeleton", "spinner", "switch", "heading", "text"];
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
for (const theme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
  const p = await ctx.newPage();
  for (const slug of pages) {
    await p.goto(`https://design.interfere.com/${slug}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}${slug || "index"}-${theme}.png` });
    console.log(theme, slug || "index");
  }
  // one menu open, one dialog open, for the overlay surfaces
  await p.goto("https://design.interfere.com/menu", { waitUntil: "networkidle" });
  await p.locator("main button").first().click(); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}menu-open-${theme}.png` });
  await p.keyboard.press("Escape");
  await p.goto("https://design.interfere.com/dialog", { waitUntil: "networkidle" });
  await p.locator("main button").first().click(); await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}dialog-open-${theme}.png` });
  await ctx.close();
}
await b.close();
