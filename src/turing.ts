// The Turing check (plan §9.3): can reviewers tell generated think-aloud from real?
// Real excerpts live in evals/turing/real.jsonl as {"persona":"<kind of user>","text":"..."}, one per line, from real sessions you have rights to.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listRuns, listStudies, loadSessions } from "./load.js";
import { EVALS, newId, readJson, writeJson } from "./util.js";

const DIR = join(EVALS, "turing");
export interface DeckItem { id: string; text: string; source: "real" | "generated"; persona: string; session?: string }

function excerpt(lines: string[], n = 4) {
  if (lines.length <= n) return lines;
  const start = Math.floor(Math.random() * (lines.length - n + 1));
  return lines.slice(start, start + n);
}

export function buildDeck(n: number) {
  const realFile = join(DIR, "real.jsonl");
  const real: DeckItem[] = existsSync(realFile) ? readFileSync(realFile, "utf8").split("\n").filter(Boolean).map((l, i) => ({ ...JSON.parse(l), id: `r${i}`, source: "real" as const })) : [];
  const gen: DeckItem[] = [];
  for (const s of listStudies()) for (const r of listRuns(s)) for (const t of loadSessions(s, r)) {
    const lines = t.steps.map((x) => x.say).filter(Boolean);
    if (lines.length >= 2) gen.push({ id: `g${gen.length}`, text: excerpt(lines).map((l) => `“${l}”`).join("\n"), source: "generated", persona: t.persona, session: t.id });
  }
  const pick = <T,>(xs: T[], k: number) => [...xs].sort(() => Math.random() - 0.5).slice(0, k);
  const items = pick([...pick(real, Math.ceil(n / 2)), ...pick(gen, real.length ? Math.floor(n / 2) : n)], n);
  const id = newId("deck");
  writeJson(join(DIR, `${id}.json`), { id, ts: new Date().toISOString(), items });
  console.log(`deck ${id}: ${items.length} items (${items.filter((i) => i.source === "real").length} real, ${items.filter((i) => i.source === "generated").length} generated)`);
  if (!real.length) console.log("WARNING: evals/turing/real.jsonl is empty. Without real excerpts the detection rate means nothing; add real think-aloud lines first.");
  console.log("Open the dashboard's Turing page to take it.");
}

export function decks() { return existsSync(DIR) ? readdirSync(DIR).filter((f) => f.startsWith("deck-")).sort().map((f) => readJson(join(DIR, f))) : []; }

export function turingResults() {
  const f = join(DIR, "guesses.jsonl");
  const gs = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const byPersona = new Map<string, { n: number; caught: number }>();
  for (const g of gs) if (g.source === "generated") { const r = byPersona.get(g.persona) ?? { n: 0, caught: 0 }; r.n++; if (g.guess === "generated") r.caught++; byPersona.set(g.persona, r); }
  return { guesses: gs.length, byPersona: Object.fromEntries(byPersona) };
}
