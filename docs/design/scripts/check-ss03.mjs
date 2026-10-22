// Does the bundled Inter carry ss03? Render the same glyphs with and without it and compare pixels.
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
const p = await b.newPage();
await p.goto("http://localhost:7420/#/", { waitUntil: "networkidle" });
await p.evaluate(async () => { await document.fonts.ready; document.body.innerHTML = ['"ss03"', "normal", '"ss01"', '"cv11"'].map((f, i) => `<div id="s${i}" style="font: 400 64px 'Inter Variable'; font-feature-settings: ${f}; padding: 8px; background: #fff; color: #000; width: 700px">“Quote,” a1 G'il</div>`).join(""); });
const shots = [];
for (let i = 0; i < 4; i++) shots.push((await p.locator(`#s${i}`).screenshot()).toString("base64"));
console.log("ss03 differs from normal:", shots[0] !== shots[1], "| ss01 differs:", shots[2] !== shots[1], "| cv11 differs:", shots[3] !== shots[1]);
await b.close();
