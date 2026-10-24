// `usabilify init <study>`: scaffold a study for an app. Probes the URL for things the runner can't handle
// yet (sign-in, hash routing), suggests analytics hosts to block, and writes study.json plus a first task.
// Interactive when stdin is a terminal; every answer can also be given as a flag.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { listPersonas, loadPersona, studyDir } from "./load.js";
import { Study, Task } from "./types.js";

export interface InitOpts { url?: string; name?: string; launch?: string; ready?: string; personas?: string[]; goal?: string; start?: string; success?: string; task?: string; yes?: boolean }

const ANALYTICS = ["google-analytics.com", "googletagmanager.com", "analytics.google.com", "segment.com", "segment.io", "mixpanel.com", "hotjar.com", "fullstory.com", "posthog.com", "amplitude.com", "plausible.io", "clarity.ms", "intercom.io", "sentry.io", "datadoghq.com", "logrocket.com"];

export interface Probe { ok: boolean; status?: number; title?: string; hashRouting: boolean; login: boolean; flutter: boolean; analytics: string[]; error?: string }

/** Fetch the start page once and look for things worth warning about. */
export async function probe(url: string): Promise<Probe> {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    return {
      ok: r.ok, status: r.status, title,
      hashRouting: /href="#\/|location\.hash|HashRouter|hash:\s*true/i.test(html) || /flutter/i.test(html),
      login: /type="password"|\/login|\/signin|sign in/i.test(html),
      flutter: /flutter|flt-/i.test(html),
      analytics: ANALYTICS.filter((h) => html.includes(h)),
    };
  } catch (e) {
    return { ok: false, hashRouting: false, login: false, flutter: false, analytics: [], error: (e as Error).message };
  }
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const STOP = new Set(["a", "an", "the", "as", "and", "to", "your", "you", "of", "in", "on", "for", "it", "so", "that", "then", "with", "from", "is", "be", "can", "they"]);
/** A task id from its goal: the first clause, minus filler words. "Sign in as a student and open your first lesson" → sign-in-student-open-first */
const taskIdFrom = (goal: string) => slug(goal.split(/[.,;:]/)[0]).split("-").filter((w) => w && !STOP.has(w)).slice(0, 5).join("-") || "task-1";

function parseSuccess(s: string): Task["success"] {
  const m = s.match(/^(js|url|text):(.+)$/s);
  if (!m) throw new Error(`success must be js:<expression>, url:<path prefix> or text:<visible text>, got "${s}"`);
  return m[1] === "js" ? { kind: "js", expr: m[2] } : m[1] === "url" ? { kind: "url", url: m[2] } : { kind: "text", text: m[2] };
}

export async function init(id: string, o: InitOpts) {
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new Error("study id: lowercase letters, digits and dashes");
  const dir = studyDir(id);
  if (existsSync(join(dir, "study.json"))) throw new Error(`${dir}/study.json already exists`);
  const tty = process.stdin.isTTY && !o.yes;
  const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q: string, def?: string) => {
    if (!rl) return def ?? "";
    const a = (await rl.question(def ? `${q} [${def}] ` : `${q} `)).trim();
    return a || def || "";
  };
  const say = (s: string) => console.log(s);

  try {
    say(`\nNew study: ${id}\n`);
    const url = o.url || (await ask("App URL (where the personas start, e.g. http://localhost:3000):"));
    if (!url) throw new Error("--url is required");
    let base: URL;
    try { base = new URL(url); } catch { throw new Error(`not a URL: ${url}`); }
    const baseUrl = base.origin;

    say(`Looking at ${url}…`);
    const p = await probe(url);
    if (!p.ok) say(`  ⚠ Not reachable (${p.error ?? p.status}). That's fine if the app isn't running yet; you can give a launch command below.`);
    else say(`  ✓ Reachable${p.title ? `: "${p.title}"` : ""}`);
    if (p.login) say("  ⚠ Looks like it has a sign-in. Sessions start cold with no credentials, so either point the start path past the login, or use a build that auto-signs-in a test user.");
    if (p.hashRouting) say(`  ⚠ Looks like it routes with the URL hash${p.flutter ? " (Flutter)" : ""}. URL-based success checks and wrong-turn detection read the path, not the hash, so use text or js success checks.`);
    if (p.flutter) say("  ⚠ Flutter renders to a canvas: sighted personas work (they click by coordinates), but the screen-reader persona needs Flutter's semantics turned on.");
    if (p.analytics.length) say(`  ✓ Will block analytics hosts so runs don't count as visits: ${p.analytics.join(", ")}`);

    const name = o.name || (await ask("Display name:", p.title?.split(/[|–-]/)[0].trim() || id));
    const launch = o.launch ?? (await ask("Command to start the app (blank if it's already running):"));
    const ready = launch ? o.ready || (await ask("URL that answers when it's up:", url)) : "";

    const all = listPersonas();
    let personas = o.personas?.length ? o.personas : all;
    if (!o.personas?.length && rl) {
      say("\nPersonas:");
      all.forEach((pid, i) => { const pp = loadPersona(pid); say(`  ${String(i + 1).padStart(2)}. ${pid.padEnd(18)} ${pp.summary.slice(0, 80)}`); });
      const pick = await ask("Which ones? (numbers or ids, comma-separated; blank for all):");
      if (pick) personas = pick.split(",").map((x) => x.trim()).map((x) => (/^\d+$/.test(x) ? all[Number(x) - 1] : x)).filter((x) => all.includes(x));
    }
    const unknown = personas.filter((x) => !all.includes(x));
    if (unknown.length) throw new Error(`unknown personas: ${unknown.join(", ")}`);

    say("\nFirst task. Write the goal the way you'd tell a real participant, without saying where to click.");
    const goal = o.goal || (await ask("Goal:", "Find the settings page and change the display language to French."));
    const start = o.start || (await ask("Start path:", base.pathname + base.search + base.hash || "/"));
    say("Success check: how we know they did it. js:<expression in the page>  url:<path prefix>  text:<text visible on the page>");
    const success = parseSuccess(o.success || (await ask("Check:", "text:Français")));
    const taskId = slug(o.task || (await ask("Task id:", taskIdFrom(goal))));
    if (!taskId) throw new Error("task id is empty");

    const study = Study.parse({ id, name, baseUrl, launch: launch ? { command: launch, ready } : undefined, tasks: [taskId], personas, block: p.analytics.map((h) => h.replace(/\./g, "\\\\.")) });
    const task = Task.parse({ id: taskId, goal, start, success, baseline: { steps: 5, path: [start] }, maxSteps: 25 });
    mkdirSync(join(dir, "tasks"), { recursive: true });
    writeFileSync(join(dir, "study.json"), JSON.stringify(study, null, 2) + "\n");
    writeFileSync(join(dir, "tasks", `${taskId}.json`), JSON.stringify(task, null, 2) + "\n");
    writeFileSync(join(dir, "README.md"), readme(id, taskId, p));
    say(`\nWrote ${dir}/study.json and tasks/${taskId}.json`);
    say(`\nNext:\n  1. Set the expert baseline in tasks/${taskId}.json: how many actions it takes someone who knows the app, and the pages on the way (used for "steps × expert" and wrong-turn detection).\n  2. Try one persona:  npx tsx src/cli.ts run ${id} --personas ${personas[0]} --tasks ${taskId}\n  3. Then the panel:   npx tsx src/cli.ts run ${id} --trials 3 && npx tsx src/cli.ts analyze ${id} <run>\n  4. Watch:            npx tsx src/cli.ts serve`);
  } finally { rl?.close(); }
}

function readme(id: string, taskId: string, p: Probe) {
  return `# Study: ${id}

Scaffolded by \`usabilify init\`. Edit \`study.json\` and the files in \`tasks/\`.

## Tasks

One file per task in \`tasks/\`. Fields:

- \`goal\`: what you'd tell a real participant. Don't say where things are ("add a teammate" not "open Settings and click Invite"), and don't give away answers the app should ask for.
- \`start\`: the path the session opens at.
- \`success\`: how we know the task is done, checked after every step.
  - \`{"kind": "text", "text": "Invitation sent"}\`: that text is visible on the page.
  - \`{"kind": "url", "url": "/members"}\`: the URL path starts with this (path only; hash routes don't count).
  - \`{"kind": "js", "expr": "..."}\`: a JavaScript expression evaluated in the page is truthy. Good for app state: \`document.querySelectorAll('.member').length > 3\`, or a value in local storage.
- \`baseline\`: the expert path. \`steps\` is how many actions someone who knows the app needs; \`path\` lists the pages on the way. Steps vs expert and wrong-turn detection come from this, so set it honestly.
- \`maxSteps\`: when to call it timed out.

## Personas

Listed in \`study.json\`. They're shared across studies and live in \`personas/\`; add or edit them in the dashboard.
${p.login ? "\n## Sign-in\n\nThe app looked like it has a login. Sessions start with a fresh browser and no credentials. Point `start` past the login, or run a build that auto-signs-in a test user.\n" : ""}${p.hashRouting ? "\n## Hash routing\n\nThe app looked like it routes with the URL hash. Use `text` or `js` success checks, not `url`.\n" : ""}
## Running

\`\`\`sh
npx tsx src/cli.ts run ${id} --tasks ${taskId} --personas alex-expert   # one session first
npx tsx src/cli.ts run ${id} --trials 3                                  # the panel
npx tsx src/cli.ts analyze ${id} <run>
npx tsx src/cli.ts serve
\`\`\`
`;
}
