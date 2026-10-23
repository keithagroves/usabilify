import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Persona, Study, Task, type Trace } from "./types.js";
import { isDir, PERSONAS, readJson, STUDIES } from "./util.js";

export const studyDir = (id: string) => join(STUDIES, id);
export const loadStudy = (id: string) => Study.parse(readJson(join(studyDir(id), "study.json")));
export const loadTask = (study: string, id: string) => Task.parse(readJson(join(studyDir(study), "tasks", `${id}.json`)));
export const loadPersona = (id: string) => Persona.parse(readJson(join(PERSONAS, id, "persona.json")));
export const listPersonas = () => readdirSync(PERSONAS).filter((d) => existsSync(join(PERSONAS, d, "persona.json"))).sort();
export const listStudies = () => readdirSync(STUDIES).filter((d) => existsSync(join(STUDIES, d, "study.json"))).sort();

export const runsDir = (study: string) => join(studyDir(study), "runs");
export const runDir = (study: string, run: string) => join(runsDir(study), run);
export function listRuns(study: string): string[] {
  const d = runsDir(study);
  return isDir(d) ? readdirSync(d).filter((r) => existsSync(join(d, r, "run.json"))).sort() : [];
}
export function loadSessions(study: string, run: string): Trace[] {
  const d = join(runDir(study, run), "sessions");
  if (!isDir(d)) return [];
  return readdirSync(d).filter((s) => existsSync(join(d, s, "trace.json"))).sort().map((s) => readJson<Trace>(join(d, s, "trace.json")));
}
/** Find a session by id across all studies and runs. */
export function findSession(id: string): { study: string; run: string; dir: string } | null {
  for (const st of listStudies()) for (const r of listRuns(st)) {
    const dir = join(runDir(st, r), "sessions", id);
    if (existsSync(join(dir, "trace.json"))) return { study: st, run: r, dir };
  }
  return null;
}
