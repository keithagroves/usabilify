// Run reports: personas × tasks grid with Wilson intervals, against an optional baseline.
import { join } from "node:path";
import { listRuns, loadSessions, loadStudy, loadTask, runDir } from "./load.js";
import { sessionMetrics } from "./metrics.js";
import { wilson } from "./stats.js";
import type { Trace } from "./types.js";
import { readJson, writeJson } from "./util.js";
import { existsSync } from "node:fs";

export function gradeRun(study: string, run: string) {
  const tasks = new Map<string, ReturnType<typeof loadTask>>();
  let n = 0;
  for (const t of loadSessions(study, run)) {
    if (!tasks.has(t.task)) tasks.set(t.task, loadTask(study, t.task));
    t.metrics = sessionMetrics(t, tasks.get(t.task)!);
    writeJson(join(runDir(study, run), "sessions", t.id, "trace.json"), t);
    n++;
  }
  console.log(`graded ${n} sessions`);
}

export interface Cell { persona: string; task: string; n: number; completed: number; failRate: number; lo: number; hi: number; medianSteps: number; confusion: number; outcomes: Record<string, number>; sessions: string[] }

export function buildGrid(sessions: Trace[]): Cell[] {
  const key = (t: Trace) => `${t.persona}|${t.task}`;
  const groups = new Map<string, Trace[]>();
  for (const s of sessions) groups.set(key(s), [...(groups.get(key(s)) ?? []), s]);
  return [...groups.entries()].map(([k, ss]) => {
    const [persona, task] = k.split("|");
    const completed = ss.filter((s) => s.outcome.kind === "completed").length;
    const [lo, hi] = wilson(ss.length - completed, ss.length);
    const steps = ss.map((s) => s.metrics?.steps ?? s.steps.length).sort((a, b) => a - b);
    const outcomes: Record<string, number> = {};
    for (const s of ss) outcomes[s.outcome.kind] = (outcomes[s.outcome.kind] ?? 0) + 1;
    return { persona, task, n: ss.length, completed, failRate: (ss.length - completed) / ss.length, lo, hi, medianSteps: steps[Math.floor(steps.length / 2)], confusion: ss.reduce((a, s) => a + (s.metrics?.confusionEvents ?? 0), 0) / ss.length, outcomes, sessions: ss.map((s) => s.id) };
  });
}

export function latestRun(study: string) { const r = listRuns(study); return r[r.length - 1]; }

export function printReport(study: string, run = latestRun(study), baseline?: string) {
  const st = loadStudy(study);
  const sessions = loadSessions(study, run);
  const grid = buildGrid(sessions);
  const base = baseline ? buildGrid(loadSessions(study, baseline)) : [];
  const personas = [...new Set(sessions.map((s) => s.persona))].sort((a, b) => st.personas.indexOf(a) - st.personas.indexOf(b));
  const tasks = [...new Set(sessions.map((s) => s.task))];
  const w = 22;
  console.log(`\n${st.name} — run ${run}${baseline ? ` vs ${baseline}` : ""}: ${sessions.length} sessions\nfailure rate (95% Wilson interval), cells are persona × task\n`);
  console.log("".padEnd(20) + tasks.map((t) => t.padEnd(w)).join(""));
  for (const p of personas) {
    const row = tasks.map((t) => {
      const c = grid.find((g) => g.persona === p && g.task === t);
      if (!c) return "·".padEnd(w);
      const b = base.find((g) => g.persona === p && g.task === t);
      const flag = b ? (c.lo > b.hi ? " ▲" : c.hi < b.lo ? " ▼" : "") : "";
      const out = Object.keys(c.outcomes).filter((k) => k !== "completed").map((k) => k[0]).join("");
      return `${Math.round(c.failRate * 100)}% [${Math.round(c.lo * 100)}–${Math.round(c.hi * 100)}] ${out}${flag}`.padEnd(w);
    }).join("");
    console.log(p.padEnd(20) + row);
  }
  console.log("\noutcome letters: g gave-up, w wrong-done, t timed-out, e error. ▲/▼ worse/better than baseline beyond the intervals.");
  const issuesFile = join(runDir(study, run), "issues.json");
  if (existsSync(issuesFile)) {
    const iss = readJson(issuesFile);
    console.log(`\nIssues found (${iss.issues.length}), most widespread first:`);
    for (const i of iss.issues) console.log(`  [${i.severity}] ${i.title}  — ${i.personas.length} personas, ${i.sessions.length} sessions${i.known ? `  (matches ${i.known})` : ""}`);
    if (iss.recall) console.log(`\nKnown-issue recall: ${iss.recall.found}/${iss.recall.total} (${iss.recall.ids.join(", ") || "none"}); missed: ${iss.recall.missed.join(", ") || "none"}`);
  }
  const cost = sessions.reduce((a, s) => a + s.costUsd, 0);
  console.log(`\ncost $${cost.toFixed(2)}, median session ${(median(sessions.map((s) => s.durationMs)) / 1000).toFixed(0)}s`);
}
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };
