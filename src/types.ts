import { z } from "zod";

export const Transform = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cvd"), kind: z.enum(["protan", "deutan", "tritan"]), severity: z.number().min(0).max(1).default(1) }),
  z.object({ type: z.literal("blur"), sigma: z.number().min(0) }),
  z.object({ type: z.literal("contrast"), amount: z.number().min(0).max(1) }),
]);
export type Transform = z.infer<typeof Transform>;

export const Persona = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["control", "persona"]).default("persona"),
  summary: z.string(),
  modality: z.enum(["sighted", "keyboard", "screen-reader"]),
  viewport: z.object({ width: z.number(), height: z.number(), deviceScaleFactor: z.number().default(1), isMobile: z.boolean().default(false), hasTouch: z.boolean().default(false) }),
  perception: z.object({ transforms: z.array(Transform).default([]) }),
  input: z.object({ misclick: z.object({ sigmaPx: z.number(), p: z.number() }) }),
  knowledge: z.object({ web: z.enum(["novice", "fluent", "expert"]), domain: z.enum(["none", "some", "expert"]), conventions: z.array(z.string()), unknown: z.array(z.string()) }),
  patience: z.object({ budget: z.number(), wrongTurnCost: z.number(), deadClickCost: z.number(), slowLoadCost: z.number(), progressGain: z.number() }),
  context: z.string(),
  temperament: z.string(),
  voice: z.object({ tts: z.string(), speed: z.number().default(1) }),
});
export type Persona = z.infer<typeof Persona>;

export const Success = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("js"), expr: z.string() }),
  z.object({ kind: z.literal("url"), url: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string() }),
]);

export const Task = z.object({
  id: z.string(),
  goal: z.string(),
  start: z.string(),
  success: Success,
  baseline: z.object({ steps: z.number(), path: z.array(z.string()) }),
  maxSteps: z.number().default(25),
});
export type Task = z.infer<typeof Task>;

export const Study = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  launch: z.object({ command: z.string(), ready: z.string() }).optional(),
  tasks: z.array(z.string()),
  personas: z.array(z.string()),
  block: z.array(z.string()).default([]),
});
export type Study = z.infer<typeof Study>;

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("type"), text: z.string(), replace: z.boolean().optional() }),
  z.object({ type: z.literal("press"), key: z.string() }),
  z.object({ type: z.literal("scroll"), dy: z.number() }),
  z.object({ type: z.literal("activate"), ref: z.number() }),
  z.object({ type: z.literal("fill"), ref: z.number(), text: z.string() }),
  z.object({ type: z.literal("select"), ref: z.number().optional(), x: z.number().optional(), y: z.number().optional(), option: z.string() }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("wait") }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("give_up") }),
]);
export type Action = z.infer<typeof Action>;

export const Feeling = z.enum(["on-track", "unsure", "stuck", "lost", "done"]);
export type Feeling = z.infer<typeof Feeling>;

export interface Mood { patience: number; frustration: number; words: string }

export interface Step {
  i: number;
  t: number;                    // seconds since session start, when the step began
  url: string;
  frame: string;                // real frame before the action (relative to session dir)
  view?: string;                // what the persona perceived (transformed frame), if different
  buffer?: string;              // screen-reader virtual buffer text, relative path
  say: string;                  // monologue line, spoken before the action
  feeling: Feeling;
  intent?: string;              // what the persona was trying to do (short)
  mood: Mood;
  act: Action;
  target?: { selector: string; text: string; role: string; focusable: boolean } | null;
  misclick?: { from: [number, number]; to: [number, number]; intended?: string };
  after?: string;
  glimpses?: { t: number; frame: string; note: string }[];
  events: string[];
  dtMs: number;
}

export type OutcomeKind = "completed" | "gave-up" | "timed-out" | "wrong-done" | "error";

export interface Finding {
  key: string;                  // kebab slug, stable across sessions for the same problem
  kind: string;
  severity: "high" | "medium" | "low";
  atStep: number;
  title: string;
  note: string;
  evidence?: string;            // the monologue line that shows it
}

export interface Verdict { pass: boolean; p: number; by: string; uncertain?: boolean; note?: string }

export interface Trace {
  id: string;
  ts: string;
  kind: "session";
  study: string;
  run: string;
  task: string;
  persona: string;
  trial: number;
  sut: { app: string; brain: string; promptHash: string; personaHash: string };
  viewport: { width: number; height: number };
  outcome: { kind: OutcomeKind; atStep: number; reason: string };
  steps: Step[];
  metrics?: Metrics;
  findings?: Finding[];
  judge?: { judge: string; rubricVersion: number; verdicts: Record<string, Verdict> };
  costUsd: number;
  durationMs: number;
  events: { type: string; ts: string; [k: string]: unknown }[];
}

export interface Metrics {
  completed: boolean;
  outcome: OutcomeKind;
  steps: number;
  stepsVsBaseline: number;
  backtracks: number;
  wrongTurns: number;
  deadClicks: number;
  confusionEvents: number;
  misclicks: number;
  timeToFirstCorrectNav: number | null;
  stuckStep: number | null;
  costUsd: number;
  durationMs: number;
}
