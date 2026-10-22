import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" }); const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.route("**/api/me", r => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthenticated", login: "/auth/login" }) }));
await p.goto("http://localhost:7420/#/"); await p.waitForTimeout(1000); await p.screenshot({ path: "docs/design/after/23-signin-badge-dark.png" }); console.log("errors:", errs); await b.close();
