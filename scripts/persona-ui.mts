// Dev check: create a persona through the dashboard form, then confirm it's on disk and listed.
// Usage: npx tsx scripts/persona-ui.mts <outdir>
import { chromium } from "playwright";
const out = process.argv[2] ?? ".";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs: string[] = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto("http://localhost:4310/#/personas/new");
await p.waitForSelector("#pf");
await p.fill("[name=name]", "Test Tess");
await p.fill("[name=summary]", "29, test persona created by the UI check.");
await p.fill("[name=context]", "On a phone, in a hurry.");
await p.fill("[name=temperament]", "Brief.");
await p.selectOption("[name=device]", "phone");
await p.selectOption("[name=cvd]", "protan");
await p.fill("[name=samples]", "Where's the menu?\nUgh.");
await p.waitForSelector(".pv-pair img", { timeout: 20000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/form.png` });
await p.click("button[type=submit]");
await p.waitForFunction(() => location.hash.startsWith("#/persona/test-tess"), null, { timeout: 10000 });
await p.waitForSelector("dl.props");
await p.click("#pv-go");
await p.waitForSelector(".pv-pair img", { timeout: 20000 });
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/detail.png`, fullPage: true });
console.log(errs.join("\n") || "no page errors", "\nfinal hash:", await p.evaluate("location.hash"));
await b.close();
