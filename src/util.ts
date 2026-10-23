import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PERSONAS = join(ROOT, "personas");
export const STUDIES = join(ROOT, "studies");
export const EVALS = join(ROOT, "evals");
export const MONITOR = join(ROOT, "monitor");
export const ANIM_PY = process.env.ANIM_PY ?? join(process.env.HOME ?? "", "projects/anim/vo/.venv/bin/python");

export const readJson = <T = any>(p: string): T => JSON.parse(readFileSync(p, "utf8"));
export function writeJson(p: string, v: unknown) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + "\n");
}
export const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
export const sha = (s: string | Buffer, n = 12) => createHash("sha256").update(s).digest("hex").slice(0, n);

/** Sortable id: <prefix>-YYYYMMDD-HHMMSS-xxxx */
export function newId(prefix: string) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${randomBytes(2).toString("hex")}`;
}

export const round = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` over items with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

/** Parse the first JSON object in a model reply (tolerates code fences and prose around it). */
export function parseJsonLoose<T = any>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{");
  if (start < 0) throw new Error(`no JSON object in reply: ${text.slice(0, 200)}`);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error(`unterminated JSON in reply: ${text.slice(0, 200)}`);
}
