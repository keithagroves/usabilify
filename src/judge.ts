// Judging persona realism and grounding: deterministic checks → local typed judge (free) → human labels for alignment.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ask, ollamaYesNo, type Block } from "./brain.js";
import { listRuns, listStudies, loadPersona, loadSessions, runDir } from "./load.js";
import { agreement } from "./stats.js";
import type { Persona, Trace, Verdict } from "./types.js";
import { EVALS, pool, readJson, round, sha, writeJson } from "./util.js";

export const rubric = () => readJson(join(EVALS, "rubric.json"));
export const LABELS = join(EVALS, "labels", "labels.jsonl");

const JARGON = /\b(ux|ui|affordance|discoverab\w*|contrast ratio|cta|call to action|interface|user flow|navigation pattern|information architecture|accessibility|wcag|aria|element|hierarchy)\b/i;
const COLOR_RG = /\b(red|green|reddish|greenish)\b/i;
const VISUAL = /\b(color|colour|red|green|blue|grey|gray|icon|top right|top left|left side|right side|looks (blue|grey|gray|red|green|faded|bold)|visible|blurry|bold|highlighted|greyed)\b/i;

/** Rule checks that need no model. Returns a verdict or null when the rule doesn't apply. */
export function deterministic(t: Trace, p: Persona): Record<string, Verdict> {
  const lines = t.steps.map((s) => s.say).filter(Boolean);
  const words = lines.map((l) => l.split(/\s+/).length);
  const out: Record<string, Verdict> = {};
  // consistent
  const reasons: string[] = [];
  const deutan = p.perception.transforms.some((x) => x.type === "cvd" && (x.kind === "deutan" || x.kind === "protan"));
  if (deutan) {
    const bad = lines.filter((l) => COLOR_RG.test(l) && !/\b(not sure|can't tell|cannot tell|no idea|which|or|guess)\b/i.test(l));
    if (bad.length) reasons.push(`names red/green confidently: "${bad[0]}"`);
  }
  if (p.modality === "screen-reader") {
    const bad = lines.filter((l) => VISUAL.test(l));
    if (bad.length) reasons.push(`uses visual language: "${bad[0]}"`);
  }
  const refused = t.steps.filter((s) => s.events.some((e) => e.startsWith("refused:") && /not something you can do/.test(e))).length;
  if (refused) reasons.push(`${refused} action(s) outside its modality`);
  const suspect = t.events.find((e) => e.type === "suspect");
  if (suspect) reasons.push(`analyst: ${suspect.reason}`);
  out.consistent = { pass: reasons.length === 0, p: reasons.length ? 0 : 1, by: "rules", note: reasons.join("; ") || undefined };
  // voice: jargon and length
  const jargon = lines.filter((l) => JARGON.test(l));
  const avg = words.reduce((a, b) => a + b, 0) / Math.max(1, words.length);
  const long = words.filter((w) => w > 30).length;
  if (jargon.length || avg > 24 || long > lines.length / 3) out.voice = { pass: false, p: 0, by: "rules", note: [jargon.length ? `jargon: "${jargon[0]}"` : "", avg > 24 ? `avg ${round(avg, 1)} words/line` : "", long ? `${long} lines over 30 words` : ""].filter(Boolean).join("; ") };
  return out;
}

const Q = {
  realism: (t: Trace) => `Here are the lines a usability-study participant said out loud, in order, while trying to use a web app:\n\n${t.steps.map((s) => `- "${s.say}"`).join("\n")}\n\nWould an experienced usability researcher believe these came from a real human participant thinking aloud (not an AI, not a narrator, not a UX expert writing a report)?`,
  voice: (t: Trace, p: Persona) => `A usability-study participant is described as: ${p.summary} Temperament: ${p.temperament}\n\nWhat they said:\n${t.steps.map((s) => `- "${s.say}"`).join("\n")}\n\nDo these lines sound like this particular person (their age, mood and way of talking), in short spoken fragments?`,
  grounded: (line: string) => `This image is exactly what a person saw on their screen. Then they said: "${line}"\n\nIs everything they say about what's on the screen actually visible in this image (they may be unsure, but they must not describe things that aren't there)?`,
  giveup: (t: Trace, p: Persona) => `A usability-study participant (${p.summary} ${p.temperament}) tried a task and gave up. Their steps:\n${t.steps.map((s) => `- [${s.feeling}] "${s.say}"`).join("\n")}\n\nWould a real person like this plausibly give up at this point (not much too early, not much too late)?`,
};
export const JUDGE_PROMPT_HASH = sha(Object.values(Q).map((f) => f.toString()).join("\n"), 8);

/** Escalate one uncertain yes/no question to Claude. The critique comes before the verdict. */
async function claudeYesNo(brain: string, prompt: string, images: Buffer[]): Promise<{ pass: boolean; note: string; cost: number }> {
  const blocks: Block[] = [...images.map((png) => ({ type: "image" as const, png })), { type: "text", text: `${prompt}\n\nThink briefly, then answer with only JSON: {"critique": "...", "answer": "yes" | "no"}` }];
  const r = await ask(brain, "You are a careful evaluator of usability-study sessions. Judge strictly from the evidence given.", blocks);
  const j = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1));
  return { pass: String(j.answer).toLowerCase().startsWith("y"), note: String(j.critique ?? "").slice(0, 300), cost: r.costUsd };
}

/**
 * Judge specs: "local:<model>" (free; flags uncertain verdicts) or "cascade+claude:<model>" (escalates
 * uncertain verdicts to Claude, as in anim's cascade).
 */
export async function judgeSession(dir: string, t: Trace, judge: string): Promise<Record<string, Verdict>> {
  const p = loadPersona(t.persona);
  const v = deterministic(t, p);
  const escalate = judge.startsWith("cascade+claude:");
  const model = judge.replace(/^(local|cascade\+claude):/, "");
  const by = `local:${model}`;
  const mk = (r: { p: number; gap: number }): Verdict => ({ pass: r.p >= 0.5, p: round(r.p, 3), by, uncertain: (r.p > 0.25 && r.p < 0.75) || r.gap > 0.3 });
  const questions: [string, string, Buffer[]][] = [["realism", Q.realism(t), []]];
  if (!v.voice) questions.push(["voice", Q.voice(t, p), []]);
  if (t.outcome.kind === "gave-up") questions.push(["giveup_earned", Q.giveup(t, p), []]);
  const at = t.metrics?.stuckStep ?? t.outcome.atStep;
  const s = t.steps.find((x) => x.i === at);
  if (s && s.say && p.modality !== "screen-reader") {
    const img = join(dir, s.view ?? s.frame);
    if (existsSync(img)) questions.push(["grounded", Q.grounded(s.say), [readFileSync(img)]]);
  }
  for (const [k, q, imgs] of questions) {
    v[k] = mk(await ollamaYesNo(model, q, imgs));
    if (escalate && v[k].uncertain) {
      try { const c = await claudeYesNo("claude-code:sonnet", q, imgs); v[k] = { pass: c.pass, p: c.pass ? 1 : 0, by: "claude-code:sonnet", note: c.note }; }
      catch (e) { v[k].note = `escalation failed: ${(e as Error).message.slice(0, 80)}`; }
    }
  }
  return v;
}

export async function judgeRun(study: string, run: string, judge: string) {
  const sessions = loadSessions(study, run);
  const ver = rubric().version;
  const id = `${judge}@${JUDGE_PROMPT_HASH}+swap`;
  console.log(`judging ${sessions.length} sessions with ${id}`);
  await pool(sessions, 2, async (t) => {
    const dir = join(runDir(study, run), "sessions", t.id);
    try {
      const verdicts = await judgeSession(dir, t, judge);
      t.judge = { judge: id, rubricVersion: ver, verdicts };
      writeJson(join(dir, "trace.json"), t);
      const fails = Object.entries(verdicts).filter(([, x]) => !x.pass).map(([k, x]) => `${k}${x.note ? ` (${x.note})` : ""}`);
      console.log(`  ${t.persona}/${t.task}: ${fails.length ? "FAIL " + fails.join(", ") : "all pass"}`);
    } catch (e) { console.log(`  ${t.persona}/${t.task}: judge error ${(e as Error).message.slice(0, 120)}`); }
  });
}

export interface Label { session: string; criterion: string; pass: boolean; by: string; ts: string; rubricVersion: number; note?: string }
export function readLabels(): Label[] {
  if (!existsSync(LABELS)) return [];
  return readFileSync(LABELS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
export function addLabel(l: Label) { appendFileSync(LABELS, JSON.stringify(l) + "\n"); }

function allSessions(): Trace[] { return listStudies().flatMap((s) => listRuns(s).flatMap((r) => loadSessions(s, r))); }

export function alignment() {
  const labels = readLabels();
  const latest = new Map<string, Label>();
  for (const l of labels) latest.set(`${l.session}|${l.criterion}`, l);
  const traces = new Map(allSessions().map((t) => [t.id, t]));
  const crit = Object.keys(rubric().criteria);
  return crit.map((c) => {
    const pairs: { human: boolean; judge: boolean }[] = [];
    for (const l of latest.values()) {
      if (l.criterion !== c) continue;
      const v = traces.get(l.session)?.judge?.verdicts[c];
      if (v) pairs.push({ human: l.pass, judge: v.pass });
    }
    const a = agreement(pairs);
    return { criterion: c, ...a, trusted: a.n >= 10 && a.kappa >= 0.6 && (isNaN(a.failRecall) || a.failRecall >= 0.7) };
  });
}

export function printAlign() {
  console.log("criterion        n   agree  kappa  fail-recall  trusted");
  for (const a of alignment()) console.log(`${a.criterion.padEnd(16)} ${String(a.n).padStart(2)}   ${a.n ? round(a.agree).toFixed(2) : " -  "}   ${a.n ? round(a.kappa).toFixed(2) : " -  "}   ${isNaN(a.failRecall) || !a.n ? "  -  " : round(a.failRecall).toFixed(2)}        ${a.trusted ? "yes" : "no"}`);
  console.log("\nTrusted needs n ≥ 10, kappa ≥ 0.6, fail-recall ≥ 0.7. Label sessions in the dashboard (usabilify serve).");
}

/** Consistency and voice summary across every session a persona has run. */
export function checkPersona(id: string) {
  const p = loadPersona(id);
  const ss = allSessions().filter((t) => t.persona === id);
  if (!ss.length) { console.log(`no sessions for ${id}`); return; }
  const det = ss.map((t) => ({ t, v: deterministic(t, p) }));
  const lines = ss.flatMap((t) => t.steps.map((s) => s.say)).filter(Boolean);
  const words = lines.map((l) => l.split(/\s+/).length);
  console.log(`${p.name} (${id}): ${ss.length} sessions, ${lines.length} lines`);
  console.log(`  completed ${ss.filter((t) => t.outcome.kind === "completed").length}/${ss.length}; outcomes: ${[...new Set(ss.map((t) => t.outcome.kind))].join(", ")}`);
  console.log(`  words per line: median ${words.sort((a, b) => a - b)[Math.floor(words.length / 2)]}, max ${Math.max(...words)}`);
  const inc = det.filter((d) => !d.v.consistent.pass);
  console.log(`  consistency failures: ${inc.length}`); for (const d of inc) console.log(`    ${d.t.id} ${d.t.task}: ${d.v.consistent.note}`);
  const vo = det.filter((d) => d.v.voice && !d.v.voice.pass);
  console.log(`  voice rule failures: ${vo.length}`); for (const d of vo) console.log(`    ${d.t.id} ${d.t.task}: ${d.v.voice!.note}`);
  const judged = ss.filter((t) => t.judge);
  for (const c of ["realism", "voice", "grounded", "giveup_earned"]) {
    const vs = judged.map((t) => t.judge!.verdicts[c]).filter(Boolean);
    if (vs.length) console.log(`  judge ${c}: ${vs.filter((x) => x.pass).length}/${vs.length} pass${vs.some((x) => x.uncertain) ? ` (${vs.filter((x) => x.uncertain).length} uncertain)` : ""}`);
  }
}
