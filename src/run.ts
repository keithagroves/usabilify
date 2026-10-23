// A run: tasks × personas × trials against one build of the app.
import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "playwright";
import { loadPersona, loadStudy, loadTask, runDir } from "./load.js";
import { sessionMetrics } from "./metrics.js";
import { runSession } from "./runner/loop.js";
import type { Trace } from "./types.js";
import { newId, pool, ROOT, sha, writeJson } from "./util.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RunOpts { tasks?: string[]; personas?: string[]; trials: number; concurrency: number; brain: string; budgetUsd: number; trace?: boolean }

async function reachable(url: string) { try { const r = await fetch(url); return r.ok; } catch { return false; } }

/** Start the app if it isn't already up. Returns the child to stop afterwards, if we started it. */
export async function ensureApp(studyId: string): Promise<ChildProcess | null> {
  const st = loadStudy(studyId);
  if (!st.launch || (await reachable(st.launch.ready))) return null;
  const child = spawn("sh", ["-c", st.launch.command], { cwd: ROOT, stdio: "ignore", detached: true });
  for (let i = 0; i < 60; i++) { if (await reachable(st.launch.ready)) return child; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`app did not come up at ${st.launch.ready}`);
}

/** A version for the app under test: hash of the fixture files, or of the base URL for external apps. */
function appVersion(studyId: string): string {
  const fx = join(ROOT, "fixtures", studyId);
  try { return `${studyId}@${sha(readdirSync(fx).sort().map((f) => readFileSync(join(fx, f))).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)), 7)}`; }
  catch { return `${studyId}@${sha(loadStudy(studyId).baseUrl, 7)}`; }
}

export async function runStudy(studyId: string, o: RunOpts): Promise<{ runId: string; sessions: Trace[] }> {
  const study = loadStudy(studyId);
  const tasks = (o.tasks?.length ? o.tasks : study.tasks).map((t) => loadTask(studyId, t));
  const personas = (o.personas?.length ? o.personas : study.personas).map(loadPersona);
  const runId = newId("r");
  const dir = runDir(studyId, runId);
  const version = appVersion(studyId);
  const jobs = tasks.flatMap((task) => personas.flatMap((persona) => Array.from({ length: o.trials }, (_, k) => ({ task, persona, trial: k + 1 }))));
  writeJson(join(dir, "run.json"), { id: runId, study: studyId, ts: new Date().toISOString(), app: version, brain: o.brain, trials: o.trials, tasks: tasks.map((t) => t.id), personas: personas.map((p) => p.id), status: "running" });
  console.log(`run ${runId}: ${jobs.length} sessions (${tasks.length} tasks × ${personas.length} personas × ${o.trials}), brain ${o.brain}, concurrency ${o.concurrency}`);

  const app = await ensureApp(studyId);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let spent = 0;
  const sessions: Trace[] = [];
  try {
    await pool(jobs, o.concurrency, async ({ task, persona, trial }) => {
      if (spent >= o.budgetUsd) { console.log(`  skip ${persona.id}/${task.id}: budget $${o.budgetUsd} reached`); return; }
      const t = await runSession(browser, study, task, persona, { brain: o.brain, runDir: dir, runId, trial, appVersion: version, log: console.log, trace: o.trace });
      t.metrics = sessionMetrics(t, task);
      writeJson(join(dir, "sessions", t.id, "trace.json"), t);
      spent += t.costUsd;
      sessions.push(t);
      console.log(`✓ ${persona.id}/${task.id} t${trial}: ${t.outcome.kind} in ${t.metrics.steps} steps, $${t.costUsd.toFixed(3)}, ${(t.durationMs / 1000).toFixed(0)}s`);
    });
  } finally {
    await browser.close();
    if (app?.pid) try { process.kill(-app.pid); } catch {}
  }
  writeJson(join(dir, "run.json"), { id: runId, study: studyId, ts: new Date().toISOString(), app: version, brain: o.brain, trials: o.trials, tasks: tasks.map((t) => t.id), personas: personas.map((p) => p.id), status: "done", costUsd: spent });
  return { runId, sessions };
}
