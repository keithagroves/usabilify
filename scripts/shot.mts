// Dev helper: screenshot fixture pages. Usage: npx tsx scripts/shot.mts <outdir>
import { chromium } from "playwright";
const out = process.argv[2] ?? ".";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:4400/settings/notifications");
await p.screenshot({ path: out + "/notif.png" });
await p.click("#avatar"); await p.screenshot({ path: out + "/menu.png" });
await b.close();
