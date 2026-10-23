// Voice a session's monologue in the persona's voice, then mix one track laid out by the replay timeline.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { findSession, loadPersona } from "../load.js";
import type { Trace } from "../types.js";
import { ANIM_PY, ROOT, readJson, sha, writeJson } from "../util.js";
import { buildTimeline } from "./timeline.js";

const SR = 24000;

export interface VoiceInfo { hash: string; engine: string; durations: Record<string, number> }

/** Mood shades delivery: frustrated people speed up a little; giving up slows down. */
function speedFor(base: number, frustration: number, giveUp: boolean) {
  return Math.round(base * (giveUp ? 0.92 : 1 + frustration * 0.08) * 100) / 100;
}

function readWav(p: string): Int16Array {
  const b = readFileSync(p);
  let o = 12;
  while (o < b.length - 8) {
    const id = b.toString("ascii", o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === "data") return new Int16Array(b.buffer.slice(b.byteOffset + o + 8, b.byteOffset + o + 8 + size));
    o += 8 + size + (size & 1);
  }
  throw new Error(`no data chunk in ${p}`);
}

function writeWav(p: string, pcm: Int16Array) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.byteLength, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(p, Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]));
}

/** macOS fallback when Kokoro isn't available. */
function sayFallback(dir: string, items: { id: string; text: string }[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const it of items) {
    const aiff = join(dir, `${it.id}.aiff`), wav = join(dir, `${it.id}.wav`);
    spawnSync("say", ["-o", aiff, it.text]);
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", String(SR), "-ac", "1", "-sample_fmt", "s16", wav]);
    d[it.id] = readWav(wav).length / SR;
  }
  return d;
}

export async function ensureVoice(dir: string, t: Trace): Promise<VoiceInfo> {
  const p = loadPersona(t.persona);
  const vdir = join(dir, "replay", "voice");
  const items = t.steps.filter((s) => s.say).map((s) => ({
    id: String(s.i).padStart(2, "0"), text: s.say, voice: p.voice.tts,
    speed: speedFor(p.voice.speed, s.mood.frustration, s.act.type === "give_up"),
  }));
  const hash = sha(JSON.stringify(items));
  const infoFile = join(dir, "replay", "voice.json");
  if (existsSync(infoFile)) { const info = readJson<VoiceInfo>(infoFile); if (info.hash === hash) return info; }
  mkdirSync(vdir, { recursive: true });
  let durations: Record<string, number> = {}, engine = `kokoro:${p.voice.tts}`;
  if (existsSync(ANIM_PY)) {
    const r = spawnSync(ANIM_PY, [join(ROOT, "src/replay/tts.py"), vdir], { input: JSON.stringify(items), encoding: "utf8", maxBuffer: 1 << 24, timeout: 600_000 });
    if (r.status === 0) durations = JSON.parse(r.stdout.trim().split("\n").pop()!);
    else console.error(`kokoro failed, using macOS say: ${r.stderr.slice(-300)}`);
  }
  if (!Object.keys(durations).length) { durations = sayFallback(vdir, items); engine = "say"; }
  const info = { hash, engine, durations };
  writeJson(infoFile, info);
  return info;
}

/** Mix every line into one track at the times the timeline gives. Returns the track path. */
export function mixTrack(dir: string, t: Trace, info: VoiceInfo): string {
  const tl = buildTimeline(t, info.durations);
  const pcm = new Int16Array(Math.ceil((tl.duration + 0.5) * SR));
  for (const l of tl.lines) {
    const f = join(dir, "replay", "voice", `${l.id}.wav`);
    if (!existsSync(f)) continue;
    const src = readWav(f), o = Math.round(l.start * SR);
    for (let i = 0; i < src.length && o + i < pcm.length; i++) pcm[o + i] = Math.max(-32768, Math.min(32767, pcm[o + i] + src[i]));
  }
  const out = join(dir, "replay", "track.wav");
  writeWav(out, pcm);
  return out;
}

export async function voiceSession(id: string) {
  const s = findSession(id);
  if (!s) throw new Error(`no session ${id}`);
  const t = readJson<Trace>(join(s.dir, "trace.json"));
  const info = await ensureVoice(s.dir, t);
  console.log(`${info.engine}: ${Object.keys(info.durations).length} lines, ${Object.values(info.durations).reduce((a, b) => a + b, 0).toFixed(1)}s of speech`);
  console.log(`track: ${mixTrack(s.dir, t, info)}`);
}
