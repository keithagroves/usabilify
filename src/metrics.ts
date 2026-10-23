// Deterministic per-session metrics, recomputable at any time from the trace (free).
import type { Metrics, Task, Trace } from "./types.js";

const CONFUSED = /\?|\b(hm+|huh|wait|where|what|why|weird|can't|cannot|don't know|not sure|no idea|confus|lost|ugh)\b/i;

export function sessionMetrics(t: Trace, task: Task): Metrics {
  const acting = t.steps.filter((s) => !s.events.includes("final-look"));
  const has = (e: string) => acting.filter((s) => s.events.some((x) => x === e || x.startsWith(e + ":"))).length;
  const confusion = acting.filter((s) => ["unsure", "stuck", "lost"].includes(s.feeling) || CONFUSED.test(s.say)).length;
  const firstNav = acting.find((s) => s.events.some((e) => e.startsWith("navigated:") && task.baseline.path.slice(1).includes(e.slice(10))));
  // The stuck step: the first step of the longest run of confused or unproductive steps; else the last step.
  let best = -1, bestLen = 0, cur = -1, len = 0;
  for (const s of acting) {
    const bad = ["unsure", "stuck", "lost"].includes(s.feeling) || s.events.some((e) => ["dead", "wrong-turn", "backtrack", "misclick", "missed-transient"].includes(e) || e.startsWith("refused"));
    if (bad) { if (cur < 0) cur = s.i; len++; if (len > bestLen) { best = cur; bestLen = len; } } else { cur = -1; len = 0; }
  }
  const completed = t.outcome.kind === "completed";
  return {
    completed,
    outcome: t.outcome.kind,
    steps: acting.length,
    stepsVsBaseline: Math.round((acting.length / Math.max(1, task.baseline.steps)) * 100) / 100,
    backtracks: has("backtrack"),
    wrongTurns: has("wrong-turn"),
    deadClicks: has("dead"),
    confusionEvents: confusion,
    misclicks: has("misclick"),
    timeToFirstCorrectNav: firstNav ? firstNav.t : null,
    stuckStep: best >= 0 ? best : completed ? null : t.outcome.atStep,
    costUsd: Math.round(t.costUsd * 10000) / 10000,
    durationMs: t.durationMs,
  };
}
