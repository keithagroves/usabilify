// The analyst: turns a session's behaviour and monologue into findings, then merges findings across a run into issues.
// Never speaks as the persona. Runs after the loop, so it can't leak into the actor.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ask, type Block } from "./brain.js";
import { loadPersona, loadSessions, loadTask, runDir, studyDir } from "./load.js";
import { describeTransforms } from "./runner/transform.js";
import type { Finding, Trace } from "./types.js";
import { parseJsonLoose, pool, readJson, writeJson } from "./util.js";

export const KINDS = ["discoverability", "affordance", "feedback", "color-only-state", "color-only-error", "target-size", "low-contrast", "keyboard", "screen-reader", "copy", "error-recovery", "performance", "mobile-layout", "other"];

const SESSION_SYSTEM = `You are a senior UX researcher reviewing one recorded think-aloud session from a usability study.
The participant is a simulated persona with a specific profile. Their monologue is what they said, not telemetry: treat it as a narrative and check it against what they did and what the screens show.

Report usability findings: places where the product made this person slower, confused, wrong, or stopped them.
- Only report what this session gives evidence for. No generic advice, no issues the participant never touched.
- Write in UX language (this is for the product team), one finding per distinct problem.
- "key" is a short stable kebab-case slug naming the problem by WHERE and WHAT (e.g. "members-only-in-avatar-menu", "toggle-state-color-only"), so the same problem gets the same key in other sessions.
- kind is one of: ${KINDS.join(", ")}.
- severity: high = blocked or made them believe something false; medium = cost real time or confidence; low = friction.
- atStep is the step number where the problem shows.
- A MIS-CLICK is the persona's simulated motor error (hand, thumb or eyesight), not a fault in the control it aimed at. The intended control works. A mis-click is evidence that the target is small or crowded (kind target-size); a "dead" event right after one means the click landed on empty space, not that the control is broken.
- "target" is what code was under the action; trust it over the persona's guesses about what something is, but never claim a control is broken unless a direct hit on it did nothing.
- Also judge the persona itself: set "suspect" to a short reason if it acted on information its profile rules out (e.g. a color-blind persona distinguishing red from green, a screen-reader user describing layout, a novice using knowledge it shouldn't have), or null.

Reply with only JSON: {"findings":[{"key","kind","severity","atStep","title","note","evidence"}],"suspect":null|"..."}
"title" ≤ 12 words. "note" 1–2 sentences. "evidence" is the participant's own words that show it.`;

function transcript(t: Trace): string {
  const p = loadPersona(t.persona);
  const task = loadTask(t.study, t.task);
  const lines = [
    `PERSONA: ${p.name} (${p.id}). ${p.summary}`,
    `Modality: ${p.modality}${p.modality === "screen-reader" ? " (blind; hears a screen reader, sees nothing)" : p.modality === "keyboard" ? " (sighted, cannot use a mouse)" : " (sighted)"}. Vision: ${p.modality === "screen-reader" ? "none" : p.perception.transforms.length ? describeTransforms(p.perception.transforms) : "typical, full color"}. Viewport ${p.viewport.width}×${p.viewport.height}${p.viewport.isMobile ? " (phone)" : ""}.`,
    `TASK: ${task.goal}`,
    `Expert path: ${task.baseline.path.join(" → ")} in about ${task.baseline.steps} actions.`,
    `OUTCOME: ${t.outcome.kind} at step ${t.outcome.atStep}: ${t.outcome.reason}`,
    `Session events: ${t.events.map((e) => e.type).join(", ") || "none"}`,
    "",
    "STEPS (said before acting; target is what was actually under the action, which the persona did not see as code):",
  ];
  for (const s of t.steps) {
    const tgt = s.target ? ` target=${s.target.role} "${s.target.text.replace(/\s+/g, " ").slice(0, 40)}"${s.target.focusable ? "" : " (not focusable)"}` : "";
    const slip = s.misclick ? ` MIS-CLICK: aimed at ${s.misclick.intended ?? "a control"} but the simulated hand error landed ${Math.round(Math.hypot(s.misclick.to[0] - s.misclick.from[0], s.misclick.to[1] - s.misclick.from[1]))}px away, on the target shown.` : "";
    lines.push(`#${s.i} ${s.url} [${s.feeling}, patience ${s.mood.patience}] "${s.say}" → ${JSON.stringify(s.act)}${tgt}${slip}${s.events.length ? ` events: ${s.events.join(", ")}` : ""}`);
  }
  return lines.join("\n");
}

export async function analyzeSession(dir: string, t: Trace, brain: string): Promise<{ findings: Finding[]; suspect: string | null; costUsd: number }> {
  const blocks: Block[] = [{ type: "text", text: transcript(t) }];
  const at = t.metrics?.stuckStep ?? t.outcome.atStep;
  const s = t.steps.find((x) => x.i === at) ?? t.steps[t.steps.length - 1];
  if (s) {
    const real = join(dir, s.frame);
    if (existsSync(real)) blocks.push({ type: "text", text: `Screen at step ${s.i} (real):` }, { type: "image", png: readFileSync(real) });
    if (s.view && existsSync(join(dir, s.view))) blocks.push({ type: "text", text: `Same screen as the persona perceived it:` }, { type: "image", png: readFileSync(join(dir, s.view)) });
  }
  const r = await ask(brain, SESSION_SYSTEM, blocks);
  const j = parseJsonLoose(r.text);
  const findings: Finding[] = (j.findings ?? []).map((f: any) => ({ key: String(f.key), kind: KINDS.includes(f.kind) ? f.kind : "other", severity: ["high", "medium", "low"].includes(f.severity) ? f.severity : "medium", atStep: Number(f.atStep) || 0, title: String(f.title), note: String(f.note ?? ""), evidence: f.evidence ? String(f.evidence) : undefined }));
  return { findings, suspect: j.suspect ? String(j.suspect) : null, costUsd: r.costUsd };
}

const MERGE_SYSTEM = `You merge usability findings from many sessions of one study into a deduplicated list of issues.
Findings with different keys may be the same problem; merge them. Different problems stay separate even if similar in kind. Never merge findings whose evidence contradicts each other (e.g. one persona could not tell a state while another, using assistive tech, heard it clearly): those are different problems for different users, or one is not a problem.
For each issue, list every finding id that belongs to it. Then match each issue to at most one KNOWN issue id if it is clearly the same problem (else null).
Reply with only JSON: {"issues":[{"title","kind","severity","summary","findings":["f12",...],"known":"K1"|null}]}`;

export async function analyzeRun(study: string, run: string, brain: string) {
  const dir = runDir(study, run);
  const sessions = loadSessions(study, run);
  let cost = 0;
  console.log(`analyzing ${sessions.length} sessions with ${brain}`);
  await pool(sessions, 4, async (t) => {
    const sdir = join(dir, "sessions", t.id);
    try {
      const a = await analyzeSession(sdir, t, brain);
      t.findings = a.findings;
      t.events = t.events.filter((e) => e.type !== "suspect");
      if (a.suspect) t.events.push({ type: "suspect", ts: new Date().toISOString(), reason: a.suspect });
      writeJson(join(sdir, "trace.json"), t);
      cost += a.costUsd;
      console.log(`  ${t.persona}/${t.task}: ${a.findings.length} findings${a.suspect ? `, SUSPECT: ${a.suspect}` : ""}`);
    } catch (e) { console.log(`  ${t.persona}/${t.task}: analyst failed: ${(e as Error).message.slice(0, 160)}`); }
  });

  // Merge across sessions.
  const all: (Finding & { id: string; persona: string; session: string; task: string })[] = [];
  for (const t of sessions) for (const f of t.findings ?? []) all.push({ ...f, id: `f${all.length + 1}`, persona: t.persona, session: t.id, task: t.task });
  const knownFile = join(studyDir(study), "known-issues.json");
  const known = existsSync(knownFile) ? readJson(knownFile).issues as { id: string; title: string; detail: string; kind: string }[] : [];
  if (!all.length) { writeJson(join(dir, "issues.json"), { issues: [], recall: null }); return; }
  const text = `FINDINGS:\n${all.map((f) => `${f.id} [${f.kind}/${f.severity}] (${f.persona}, ${f.task}) ${f.key}: ${f.title}. ${f.note}`).join("\n")}\n\nKNOWN ISSUES:\n${known.map((k) => `${k.id} [${k.kind}] ${k.title}. ${k.detail}`).join("\n") || "none"}`;
  const r = await ask(brain, MERGE_SYSTEM, [{ type: "text", text }]);
  cost += r.costUsd;
  const merged = parseJsonLoose(r.text).issues as any[];
  const byId = new Map(all.map((f) => [f.id, f]));
  const sev = { high: 3, medium: 2, low: 1 } as Record<string, number>;
  const issues = merged.map((m, i) => {
    const fs = (m.findings as string[]).map((id) => byId.get(id)).filter(Boolean) as typeof all;
    return {
      id: `I${i + 1}`, title: m.title, kind: m.kind, severity: m.severity, summary: m.summary, known: known.some((k) => k.id === m.known) ? m.known : null,
      personas: [...new Set(fs.map((f) => f.persona))], tasks: [...new Set(fs.map((f) => f.task))], sessions: [...new Set(fs.map((f) => f.session))],
      findings: fs.map((f) => ({ id: f.id, session: f.session, persona: f.persona, atStep: f.atStep, key: f.key, evidence: f.evidence })),
    };
  }).sort((a, b) => (sev[b.severity] ?? 0) * b.sessions.length - (sev[a.severity] ?? 0) * a.sessions.length);
  const foundIds = [...new Set(issues.map((i) => i.known).filter(Boolean))] as string[];
  const recall = known.length ? { found: foundIds.length, total: known.length, ids: foundIds.sort(), missed: known.map((k) => k.id).filter((id) => !foundIds.includes(id)) } : null;
  // Which personas surfaced each known issue, vs which were expected to.
  const perKnown = known.map((k: any) => ({ id: k.id, expected: k.expect ?? [], surfacedBy: [...new Set(issues.filter((i) => i.known === k.id).flatMap((i) => i.personas))] }));
  writeJson(join(dir, "issues.json"), { ts: new Date().toISOString(), brain, issues, recall, perKnown, unplanted: issues.filter((i) => !i.known).length, costUsd: cost });
  console.log(`\n${issues.length} issues; known-issue recall ${recall ? `${recall.found}/${recall.total}` : "n/a"}; analyst cost $${cost.toFixed(3)}`);
}
