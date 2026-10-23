import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, stateAt } from "../src/replay/timeline.js";
import { sessionMetrics } from "../src/metrics.js";
import { agreement, wilson } from "../src/stats.js";
import { initialMood, updateMood } from "../src/runner/mood.js";
import { deterministic } from "../src/judge.js";
import { parseReply } from "../src/runner/actor.js";
import { parseJsonLoose } from "../src/util.js";
import type { Persona, Step, Task, Trace } from "../src/types.js";

const persona = (over: Partial<Persona> = {}): Persona => ({
  id: "p", name: "P", role: "persona", summary: "", modality: "sighted",
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  perception: { transforms: [] }, input: { misclick: { sigmaPx: 0, p: 0 } },
  knowledge: { web: "fluent", domain: "none", conventions: [], unknown: [] },
  patience: { budget: 6, wrongTurnCost: 1, deadClickCost: 1, slowLoadCost: 0.5, progressGain: 0.5 },
  context: "", temperament: "", voice: { tts: "af_heart", speed: 1 }, ...over,
});
const mood = { patience: 6, frustration: 0, words: "" };
const step = (i: number, over: Partial<Step> = {}): Step => ({ i, t: i * 3, url: "/", frame: `f${i}.png`, after: `a${i}.png`, say: "Hm, where is it?", feeling: "unsure", mood, act: { type: "click", x: 100, y: 100 }, events: [], dtMs: 2000, ...over });
const trace = (steps: Step[], outcome: Trace["outcome"]["kind"] = "gave-up"): Trace => ({
  id: "s", ts: "", kind: "session", study: "x", run: "r", task: "t", persona: "p", trial: 1,
  sut: { app: "", brain: "", promptHash: "", personaHash: "" }, viewport: { width: 1280, height: 800 },
  outcome: { kind: outcome, atStep: steps.length - 1, reason: "" }, steps, costUsd: 0, durationMs: 1000, events: [],
});
const task: Task = { id: "t", goal: "", start: "/", success: { kind: "url", url: "/x" }, baseline: { steps: 2, path: ["/", "/x"] }, maxSteps: 10 };

test("timeline: monologue comes before the cursor moves, and steps don't overlap", () => {
  const t = trace([step(0), step(1), step(2, { act: { type: "give_up" } })]);
  const tl = buildTimeline(t, { "00": 2, "01": 1.5, "02": 1 });
  for (const s of tl.segs) {
    assert.ok(s.speakStart >= s.start && s.speakEnd <= s.end + 1e-9);
    assert.ok(s.moveStart >= s.speakStart, "cursor never moves before the persona starts talking");
  }
  for (let k = 1; k < tl.segs.length; k++) assert.equal(tl.segs[k].start, tl.segs[k - 1].end);
  assert.equal(tl.lines.length, 3);
  assert.ok(tl.duration > tl.endStart);
});

test("timeline: stateAt is deterministic and shows the after frame late in a step", () => {
  const t = trace([step(0), step(1)]);
  const tl = buildTimeline(t, {});
  const a = stateAt(tl, t, 1.0), b = stateAt(tl, t, 1.0);
  assert.deepEqual(a, b);
  const late = stateAt(tl, t, tl.segs[0].end - 0.01);
  assert.equal(late.real, "a0.png");
  assert.equal(stateAt(tl, t, tl.duration - 0.1).ending, true);
});

test("timeline: a misclick slides the cursor to where it actually landed", () => {
  const t = trace([step(0, { misclick: { from: [100, 100], to: [130, 90] } }), step(1)]);
  const tl = buildTimeline(t, {});
  const s = stateAt(tl, t, tl.segs[0].moveEnd + 0.3);
  assert.ok(s.cursor && Math.abs(s.cursor.x - 130) < 1 && s.cursor.slip);
});

test("metrics: counts wrong turns, dead clicks, confusion and finds the stuck step", () => {
  const t = trace([
    step(0, { feeling: "on-track", say: "Okay.", events: ["navigated:/a", "wrong-turn"] }),
    step(1, { events: ["dead"] }),
    step(2, { events: ["dead"] }),
    step(3, { feeling: "on-track", say: "There.", events: [] }),
  ]);
  const m = sessionMetrics(t, task);
  assert.equal(m.wrongTurns, 1);
  assert.equal(m.deadClicks, 2);
  assert.equal(m.confusionEvents, 2);
  assert.equal(m.stuckStep, 0);
  assert.equal(m.stepsVsBaseline, 2);
});

test("mood: wrong turns spend patience, progress gives a little back, words follow", () => {
  const p = persona();
  let m = initialMood(p);
  const base = { wrongTurn: false, backtrack: false, deadClick: false, slow: false, progress: false, feeling: "on-track" as const, refused: false };
  m = updateMood(m, p, { ...base, wrongTurn: true, deadClick: true });
  assert.ok(m.patience < 4.2 && m.frustration > 0.3);
  const before = m.patience;
  m = updateMood(m, p, { ...base, progress: true });
  assert.ok(m.patience > before);
  for (let i = 0; i < 6; i++) m = updateMood(m, p, { ...base, wrongTurn: true });
  assert.match(m.words, /had enough/);
});

test("stats: wilson and kappa", () => {
  const [lo, hi] = wilson(0, 1);
  assert.ok(lo === 0 && hi > 0.7);
  const [lo2, hi2] = wilson(50, 100);
  assert.ok(lo2 > 0.39 && hi2 < 0.61);
  const a = agreement([{ human: true, judge: true }, { human: false, judge: false }, { human: true, judge: true }, { human: false, judge: true }]);
  assert.equal(a.agree, 0.75);
  assert.equal(a.failRecall, 0.5);
});

test("judge rules: a deutan persona naming red/green confidently is inconsistent; unsure is fine", () => {
  const p = persona({ perception: { transforms: [{ type: "cvd", kind: "deutan", severity: 1 }] } });
  assert.equal(deterministic(trace([step(0, { say: "It's green now, so it's on." })]), p).consistent.pass, false);
  assert.equal(deterministic(trace([step(0, { say: "Is that green or red? Can't tell." })]), p).consistent.pass, true);
});

test("judge rules: a screen-reader persona using visual words is inconsistent; jargon fails voice", () => {
  const sr = persona({ modality: "screen-reader" });
  assert.equal(deterministic(trace([step(0, { say: "The blue button top right." })]), sr).consistent.pass, false);
  const v = deterministic(trace([step(0, { say: "The affordance on this UI is unclear." })]), persona());
  assert.equal(v.voice?.pass, false);
});

test("actor replies parse from fenced or chatty output", () => {
  const r = parseReply('Sure:\n```json\n{"say":"Hm.","feeling":"unsure","intent":"find it","action":{"type":"click","x":1,"y":2}}\n```');
  assert.equal(r.action.type, "click");
  assert.equal(parseReply('{"say":"x","feeling":"weird","action":{"type":"wait"}}').feeling, "unsure");
  assert.deepEqual(parseJsonLoose('a {"b":"}{"} c'), { b: "}{" });
});
