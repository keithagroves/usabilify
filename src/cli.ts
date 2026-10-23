#!/usr/bin/env -S npx tsx
// usabilify: synthetic usability testing with realistic personas.
import { parseArgs } from "node:util";

const HELP = `usabilify <command>

  fixture <name> [--port 4400]                serve a fixture app
  run <study> [--tasks a,b] [--personas a,b] [--trials 1] [--concurrency 3] [--brain claude-code:sonnet] [--budget-usd 10] [--no-trace]
  grade <study> <run>                         recompute deterministic metrics (free)
  analyze <study> <run> [--brain claude-code:sonnet]   analyst findings per session, issues across the run, recall vs known issues
  report <study> [<run>] [--baseline <run>]   grid of personas × tasks with intervals
  judge <study> <run> [--judge local:gemma4:e4b | cascade+claude:gemma4:e4b]   realism and grounding verdicts; cascade escalates uncertain ones to Claude
  label <study> <run>                         (in the dashboard) blind human labels
  align                                       judge vs human agreement per criterion
  turing [--n 20]                             build a Turing deck from real excerpts + generated lines
  monitor [<study>]                           evaluate signals, append alerts
  render <session> [--lens plain|split|persona] [--fps 24]   narrated MP4 of a session
  voice <session>                             synthesise the persona's lines for a session (cached)
  serve [--port 4310]                         dashboard, session replay, labelling
  persona list | check <id>                   list personas; consistency check on one persona's sessions
`;

const [cmd, ...rest] = process.argv.slice(2);
const { values: v, positionals: pos } = parseArgs({
  args: rest, allowPositionals: true,
  options: {
    port: { type: "string" }, tasks: { type: "string" }, personas: { type: "string" }, trials: { type: "string" },
    concurrency: { type: "string" }, brain: { type: "string" }, "budget-usd": { type: "string" }, "no-trace": { type: "boolean" },
    baseline: { type: "string" }, lens: { type: "string" }, fps: { type: "string" }, judge: { type: "string" }, n: { type: "string" },
  },
});
const list = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
const BRAIN = v.brain ?? process.env.USABILIFY_BRAIN ?? "claude-code:sonnet";

async function main() {
  switch (cmd) {
    case "fixture": {
      const { serveFixture } = await import("./fixture.js");
      const port = Number(v.port ?? 4400);
      await serveFixture(pos[0] ?? "acme", port);
      console.log(`fixture ${pos[0] ?? "acme"} on http://localhost:${port}`);
      return;
    }
    case "run": {
      const { runStudy } = await import("./run.js");
      const { runId } = await runStudy(pos[0], { tasks: list(v.tasks), personas: list(v.personas), trials: Number(v.trials ?? 1), concurrency: Number(v.concurrency ?? 3), brain: BRAIN, budgetUsd: Number(v["budget-usd"] ?? 10), trace: !v["no-trace"] });
      console.log(`\nrun id: ${runId}\nnext: usabilify analyze ${pos[0]} ${runId} && usabilify report ${pos[0]} ${runId}`);
      return;
    }
    case "grade": {
      const { gradeRun } = await import("./report.js");
      gradeRun(pos[0], pos[1]);
      return;
    }
    case "analyze": {
      const { analyzeRun } = await import("./analyst.js");
      await analyzeRun(pos[0], pos[1], BRAIN);
      return;
    }
    case "report": {
      const { printReport } = await import("./report.js");
      printReport(pos[0], pos[1], v.baseline);
      return;
    }
    case "judge": {
      const { judgeRun } = await import("./judge.js");
      await judgeRun(pos[0], pos[1], v.judge ?? "local:gemma4:e4b");
      return;
    }
    case "align": { const { printAlign } = await import("./judge.js"); printAlign(); return; }
    case "turing": { const { buildDeck } = await import("./turing.js"); buildDeck(Number(v.n ?? 20)); return; }
    case "monitor": { const { runMonitor } = await import("./monitor.js"); runMonitor(pos[0]); return; }
    case "voice": { const { voiceSession } = await import("./replay/voice.js"); await voiceSession(pos[0]); return; }
    case "render": {
      const { renderSession } = await import("./replay/export.js");
      await renderSession(pos[0], (v.lens as any) ?? "split", Number(v.fps ?? 24));
      return;
    }
    case "serve": { const { serve } = await import("./server/server.js"); await serve(Number(v.port ?? 4310)); return; }
    case "persona": {
      const { listPersonas, loadPersona } = await import("./load.js");
      if (pos[0] === "check") { const { checkPersona } = await import("./judge.js"); checkPersona(pos[1]); return; }
      for (const id of listPersonas()) { const p = loadPersona(id); console.log(`${id.padEnd(18)} ${p.modality.padEnd(14)} ${p.summary}`); }
      return;
    }
    default: console.log(HELP);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exit(1); });
