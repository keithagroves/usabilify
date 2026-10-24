// Dev helper: screenshot dashboard pages. Usage: npx tsx scripts/dash.mts <outdir> <hash> [<hash>...]
import { chromium } from "playwright";
const [out, ...hashes] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs: string[] = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
for (const [i, h] of hashes.entries()) {
  await p.goto(`http://localhost:4310/${h}`);
  await p.waitForTimeout(h.includes("session/") ? 15000 : h.includes("personas/new") || h.includes("persona/") ? 7000 : 2000);
  await p.screenshot({ path: `${out}/dash-${i}.png`, fullPage: !h.includes("session") });
}
console.log(errs.join("\n") || "no page errors");
await b.close();
