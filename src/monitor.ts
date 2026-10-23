// Live signals over recent runs (plan §10). Each signal has an owner, a threshold and a why.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { listRuns, listStudies, loadSessions } from "./load.js";
import { wilson } from "./stats.js";
import type { Trace } from "./types.js";
import { MONITOR, readJson, round } from "./util.js";

const NUM: Record<string, (t: Trace) => boolean> = {
  not_completed: (t) => t.outcome.kind !== "completed",
  wrong_done: (t) => t.outcome.kind === "wrong-done",
  gave_up: (t) => t.outcome.kind === "gave-up",
  error: (t) => t.outcome.kind === "error",
  unaware: (t) => t.events.some((e) => e.type === "unaware-of-success"),
};

export function evaluateSignals(study: string) {
  const cfg = readJson(join(MONITOR, "signals.json"));
  const runs = listRuns(study).slice(-cfg.window.runs);
  const ss = runs.flatMap((r) => loadSessions(study, r));
  const out: { id: string; severity: string; owner: string; scope: string; value: number; lo?: number; threshold: number; n: number; firing: boolean; why: string }[] = [];
  for (const s of cfg.signals) {
    if (s.kind === "rate") {
      const groups = s.per === "persona" ? [...new Set(ss.map((t) => t.persona))].map((p) => [p, ss.filter((t) => t.persona === p)] as const) : [["all", ss] as const];
      for (const [scope, g] of groups) {
        const k = g.filter(NUM[s.num]).length, [lo] = wilson(k, g.length);
        out.push({ id: s.id, severity: s.severity, owner: s.owner, scope, value: round(k / Math.max(1, g.length)), lo: round(lo), threshold: s.threshold, n: g.length, firing: g.length > 0 && lo > s.threshold, why: s.why });
      }
    } else if (s.kind === "quantile" || s.kind === "mean") {
      const xs = ss.map((t) => (t.metrics as any)?.[s.metric]).filter((x) => typeof x === "number").sort((a, b) => a - b);
      const value = s.kind === "mean" ? xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) : xs[Math.min(xs.length - 1, Math.floor(xs.length * s.q))] ?? 0;
      out.push({ id: s.id, severity: s.severity, owner: s.owner, scope: "all", value: round(value), threshold: s.threshold, n: xs.length, firing: xs.length > 0 && value > s.threshold, why: s.why });
    } else if (s.kind === "judge") {
      for (const p of [...new Set(ss.map((t) => t.persona))]) {
        // Uncertain verdicts don't count: they need escalation or a human label first.
        const vs = ss.filter((t) => t.persona === p).map((t) => t.judge?.verdicts[s.criterion]).filter((v) => v && !v.uncertain);
        if (!vs.length) continue;
        const k = vs.filter((v) => !v!.pass).length;
        out.push({ id: s.id, severity: s.severity, owner: s.owner, scope: p, value: round(k / vs.length), threshold: s.threshold, n: vs.length, firing: k / vs.length > s.threshold, why: s.why });
      }
    }
  }
  return { runs, signals: out };
}

export function runMonitor(study?: string) {
  mkdirSync(MONITOR, { recursive: true });
  for (const st of study ? [study] : listStudies()) {
    const { runs, signals } = evaluateSignals(st);
    console.log(`\n${st}: ${runs.length} runs in window`);
    for (const s of signals.filter((x) => x.firing)) {
      console.log(`  ALERT [${s.severity}] ${s.id} (${s.scope}): ${s.value}${s.lo != null ? ` (lower bound ${s.lo})` : ""} > ${s.threshold}, n=${s.n}. ${s.why} → ${s.owner}`);
      appendFileSync(join(MONITOR, "alerts.jsonl"), JSON.stringify({ ts: new Date().toISOString(), study: st, ...s }) + "\n");
    }
    const quiet = signals.filter((x) => !x.firing).length;
    console.log(`  ${quiet} signals within threshold`);
  }
}
