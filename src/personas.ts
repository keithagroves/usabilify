// Creating and editing personas from the dashboard: validation, saving, study membership,
// and previews of what a persona sees and how it sounds.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { listPersonas, listStudies, loadPersona, loadStudy, loadTask, studyDir } from "./load.js";
import { ensureApp } from "./run.js";
import { INIT_SCRIPT, screenshot, virtualBuffer } from "./runner/perceive.js";
import { transformPng } from "./runner/transform.js";
import { Persona } from "./types.js";
import { ANIM_PY, parseJsonLoose, PERSONAS, readJson, ROOT, sha } from "./util.js";

export const VOICES: [string, string][] = [
  ["af_heart", "Heart · US female"], ["af_bella", "Bella · US female"], ["af_sarah", "Sarah · US female"], ["af_nicole", "Nicole · US female"],
  ["af_sky", "Sky · US female"], ["af_nova", "Nova · US female"], ["af_river", "River · US female"], ["af_jessica", "Jessica · US female"],
  ["am_michael", "Michael · US male"], ["am_adam", "Adam · US male"], ["am_eric", "Eric · US male"], ["am_liam", "Liam · US male"],
  ["am_onyx", "Onyx · US male"], ["am_echo", "Echo · US male"], ["am_puck", "Puck · US male"],
  ["bf_emma", "Emma · UK female"], ["bf_alice", "Alice · UK female"], ["bf_isabella", "Isabella · UK female"], ["bf_lily", "Lily · UK female"],
  ["bm_george", "George · UK male"], ["bm_daniel", "Daniel · UK male"], ["bm_lewis", "Lewis · UK male"], ["bm_fable", "Fable · UK male"],
];

const AUTHORED = "<!-- AUTHORED sample lines, not from real sessions. Replace with real think-aloud excerpts for this kind of user when available (plan §0.7). -->";

export interface PersonaInput { persona: unknown; voiceSamples?: string; studies?: string[] }

export function personaStudies(id: string) { return listStudies().filter((s) => loadStudy(s).personas.includes(id)); }
export function voiceSamples(id: string) {
  const f = join(PERSONAS, id, "voice.md");
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).replace(/^"|"$/g, "")).join("\n") : "";
}

/** Validate and write a persona. On create the id must be new; on update it must exist. Returns the saved persona. */
export function savePersona(input: PersonaInput, mode: { create: boolean; id?: string }) {
  const parsed = Persona.safeParse(input.persona);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".") || "persona"}: ${i.message}`).join("; "));
  const p = parsed.data;
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.id)) throw new Error("id: use 2–41 lowercase letters, digits and dashes");
  const exists = listPersonas().includes(p.id);
  if (mode.create && exists) throw new Error(`id: a persona called ${p.id} already exists`);
  if (!mode.create && (mode.id !== p.id || !exists)) throw new Error("id can't be changed when editing");
  if (p.modality === "screen-reader") p.perception.transforms = [];
  const dir = join(PERSONAS, p.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "persona.json"), JSON.stringify(p, null, 2) + "\n");
  if (input.voiceSamples != null) {
    const lines = input.voiceSamples.split("\n").map((l) => l.trim().replace(/^[-*]\s*/, "").replace(/^"|"$/g, "")).filter(Boolean);
    writeFileSync(join(dir, "voice.md"), `${AUTHORED}\n${lines.map((l) => `- "${l}"`).join("\n")}\n`);
  }
  if (input.studies) {
    for (const st of listStudies()) {
      const f = join(studyDir(st), "study.json");
      const j = readJson(f);
      const has = j.personas.includes(p.id), want = input.studies.includes(st);
      if (want && !has) j.personas.push(p.id);
      if (!want && has) j.personas = j.personas.filter((x: string) => x !== p.id);
      if (want !== has) writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
    }
  }
  return p;
}

let browser: Browser | null = null;
async function getBrowser() { if (!browser || !browser.isConnected()) browser = await chromium.launch({ channel: "chrome", headless: true }); return browser; }

/** What this persona would perceive on a study's start page: the real frame and the transformed one (or the screen-reader buffer). */
export async function previewPersona(raw: unknown, studyId: string, taskId?: string) {
  const parsed = Persona.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const p = parsed.data, st = loadStudy(studyId);
  const start = taskId ? loadTask(studyId, taskId).start : st.tasks[0] ? loadTask(studyId, st.tasks[0]).start : "/";
  await ensureApp(studyId);
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: { width: p.viewport.width, height: p.viewport.height }, deviceScaleFactor: p.viewport.deviceScaleFactor, isMobile: p.viewport.isMobile, hasTouch: p.viewport.hasTouch });
  try {
    await ctx.addInitScript(INIT_SCRIPT);
    const page = await ctx.newPage();
    await page.goto(new URL(start, st.baseUrl).href, { waitUntil: "networkidle" });
    const real = await screenshot(page);
    if (p.modality === "screen-reader") return { real: real.toString("base64"), view: null, buffer: await virtualBuffer(page), url: start };
    const view = transformPng(real, p.perception.transforms, 1);
    return { real: real.toString("base64"), view: view.toString("base64"), buffer: null, url: start };
  } finally { await ctx.close(); }
}

/** Synthesise one line in a voice (cached). Returns a path under .cache served by the dashboard. */
export function previewVoice(voice: string, speed: number, text: string): string {
  if (!VOICES.some(([v]) => v === voice)) throw new Error("unknown voice");
  const id = sha(`${voice}|${speed}|${text}`);
  const dir = join(ROOT, ".cache", "voice-preview");
  const out = join(dir, `${id}.wav`);
  if (existsSync(out)) return `.cache/voice-preview/${id}.wav`;
  mkdirSync(dir, { recursive: true });
  if (existsSync(ANIM_PY)) {
    const r = spawnSync(ANIM_PY, [join(ROOT, "src/replay/tts.py"), dir], { input: JSON.stringify([{ id, text: text.slice(0, 300), voice, speed }]), encoding: "utf8", timeout: 180_000 });
    if (r.status === 0 && existsSync(out)) return `.cache/voice-preview/${id}.wav`;
  }
  const aiff = join(dir, `${id}.aiff`);
  spawnSync("say", ["-o", aiff, text.slice(0, 300)]);
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, out]);
  if (!existsSync(out)) throw new Error("voice synthesis failed");
  return `.cache/voice-preview/${id}.wav`;
}

/** Draft a persona from a one-line description with Claude. The result goes into the form for a human to check. */
export async function draftPersona(description: string, brain = "claude-code:sonnet") {
  const example = loadPersona("dana-deutan");
  const system = `You design realistic personas for synthetic usability testing. A persona is a perception transform, an input modality, a knowledge level, a patience model and a voice, not a stereotype.
Rules:
- Ground impairments in reality: deutan/protan/tritan severity 0–1 (Machado 2009 matrices); low vision as blur sigma 1–2.5 CSS px plus contrast 0.4–0.7 and usually a zoomed viewport (640×400 at deviceScaleFactor 2 for 200% zoom); mild ageing as blur 0.4–0.8.
- modality: "sighted" (mouse/touch), "keyboard" (no pointer), "screen-reader" (blind; no transforms).
- Phones: viewport 390×844, deviceScaleFactor 2, isMobile and hasTouch true, misclick sigmaPx 8–11.
- Mouse misclick sigmaPx 2–5; p (slip probability) 0.01–0.06.
- patience.budget 4–10 (lower = gives up sooner); costs around 1.
- summary: who they are in one or two sentences. context: their situation right now, second person. temperament: how they talk and react.
- No caricature. Real people are competent at their own lives.
- Exact enums: modality "sighted"|"keyboard"|"screen-reader"; role "control"|"persona"; knowledge.web "novice"|"fluent"|"expert"; knowledge.domain "none"|"some"|"expert".
- Transforms are exactly {"type":"cvd","kind":"protan"|"deutan"|"tritan","severity":0-1}, {"type":"blur","sigma":N}, {"type":"contrast","amount":0-1}. No other keys.
- voice.tts must be one of: ${VOICES.map(([v]) => v).join(", ")} (a = American, b = British, f/m = female/male).
Reply with only JSON: {"persona": <persona object exactly like the example's shape>, "voiceSamples": ["4–5 short lines this person might say while using an app"]}`;
  const { openBrain } = await import("./brain.js");
  const b = openBrain(brain, system);
  try {
    let r = await b.send([{ type: "text", text: `Example persona:\n${JSON.stringify(example, null, 1)}\n\nExisting ids (don't reuse): ${listPersonas().join(", ")}\n\nDescribe this person:\n${description}` }]);
    let cost = r.costUsd, j = parseJsonLoose(r.text);
    let parsed = Persona.safeParse(j.persona);
    if (!parsed.success) {
      // One repair round with the validator's own words.
      r = await b.send([{ type: "text", text: `That persona doesn't validate:\n${parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}\nReply with the corrected JSON in the same format.` }]);
      cost += r.costUsd; j = parseJsonLoose(r.text); parsed = Persona.safeParse(j.persona);
    }
    return { persona: parsed.success ? parsed.data : j.persona, voiceSamples: (j.voiceSamples ?? []).join("\n"), valid: parsed.success, errors: parsed.success ? null : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), costUsd: cost };
  } finally { b.close(); }
}
