// Checks that the system's type is live: Inter Variable with ss03 on body text, Geist Mono on code, and the theme class.
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
for (const scheme of ["light", "dark"]) {
  const p = await (await b.newContext({ colorScheme: scheme })).newPage();
  await p.goto("http://localhost:7420/#/", { waitUntil: "networkidle" });
  const r = await p.evaluate(async () => {
    await document.fonts.ready;
    const cs = getComputedStyle(document.body);
    const code = document.querySelector("code");
    // ss03 in Inter swaps quotes and commas for rounded forms; measure a string with and without it
    const c = document.createElement("canvas").getContext("2d");
    const span = (ff) => { const s = document.createElement("span"); s.textContent = "“a,b”"; s.style.cssText = `font: 400 60px "Inter Variable"; font-feature-settings: ${ff}; position:absolute;`; document.body.append(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
    return { html: document.documentElement.className, family: cs.fontFamily, features: cs.fontFeatureSettings, size: cs.fontSize, inter: document.fonts.check('15px "Inter Variable"'),
      mono: code ? getComputedStyle(code).fontFamily : null, ss03Width: span('"ss03"'), plainWidth: span("normal") };
  });
  console.log(scheme, JSON.stringify(r));
}
await b.close();
