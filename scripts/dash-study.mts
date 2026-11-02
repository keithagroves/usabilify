// Dev helper: screenshot dashboard pages with a given project selected. Usage: npx tsx scripts/dash-study.mts <outdir> <study> <hash>...
import { chromium } from "playwright";
const [out, study, ...hashes] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript((s) => { try { localStorage.setItem("study", s); } catch {} }, study);
const p = await ctx.newPage();
const errs: string[] = [];
p.on("pageerror", (e) => errs.push(String(e)));
for (const [i, h] of hashes.entries()) {
  await p.goto(`http://localhost:4310/${h}`);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/study-${i}.png`, fullPage: !h.includes("session/") });
}
console.log(errs.join("\n") || "no page errors");
await b.close();
