// Dashboard: runs, the personas × tasks grid, issues, session replay, labelling, calibration.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import * as esbuild from "esbuild";
import { addLabel, alignment, readLabels, rubric } from "../judge.js";
import { findSession, listPersonas, listRuns, listStudies, loadPersona, loadSessions, loadStudy, loadTask, runDir, studyDir } from "../load.js";
import { evaluateSignals } from "../monitor.js";
import { buildGrid } from "../report.js";
import { ensureVoice, mixTrack } from "../replay/voice.js";
import { decks, turingResults } from "../turing.js";
import type { Trace } from "../types.js";
import { EVALS, readJson, ROOT } from "../util.js";
import { appendFileSync } from "node:fs";
import { draftPersona, personaStudies, previewPersona, previewVoice, savePersona, voiceSamples, VOICES } from "../personas.js";

const UI = join(ROOT, "src/server/ui");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".wav": "audio/wav", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8", ".json": "application/json", ".zip": "application/zip" };

let playerJs = "";
async function bundle() {
  const r = await esbuild.build({ entryPoints: [join(ROOT, "src/replay/player.ts")], bundle: true, format: "iife", write: false, target: "es2022", minify: false });
  playerJs = r.outputFiles[0].text;
}

const json = (res: ServerResponse, v: unknown, code = 200) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(v)); };
const body = (req: IncomingMessage) => new Promise<any>((resolve) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } }); });

function file(res: ServerResponse, p: string, req?: IncomingMessage) {
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  const size = statSync(p).size, type = TYPES[extname(p)] ?? "application/octet-stream";
  const range = req?.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
    createReadStream(p, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "no-store" });
  createReadStream(p).pipe(res);
}

const summary = (t: Trace) => ({ id: t.id, persona: t.persona, task: t.task, trial: t.trial, outcome: t.outcome, metrics: t.metrics, findings: t.findings?.length ?? 0, unaware: t.events.some((e) => e.type === "unaware-of-success"), suspect: t.events.find((e) => e.type === "suspect")?.reason ?? null, judgeFails: t.judge ? Object.entries(t.judge.verdicts).filter(([, v]) => !v.pass).map(([k]) => k) : null, costUsd: t.costUsd });

function sessionPayload(id: string) {
  const s = findSession(id);
  if (!s) return null;
  const t = readJson<Trace>(join(s.dir, "trace.json"));
  const persona = loadPersona(t.persona), task = loadTask(s.study, t.task);
  const voiceFile = join(s.dir, "replay", "voice.json");
  const voice = existsSync(voiceFile) ? readJson(voiceFile) : null;
  const labels = readLabels().filter((l) => l.session === id);
  return { study: s.study, run: s.run, trace: t, persona, task, voice, track: voice && existsSync(join(s.dir, "replay", "track.wav")), labels, rubric: rubric(), mp4: ["plain", "split", "persona"].filter((l) => existsSync(join(s.dir, "replay", `${l}.mp4`))) };
}


/** One row per run for the master table, with outcome counts and analysis state. */
function runRows() {
  return listStudies().flatMap((st) => listRuns(st).map((r) => {
    const run = readJson(join(runDir(st, r), "run.json"));
    const ss = loadSessions(st, r);
    const iss = join(runDir(st, r), "issues.json");
    const issues = existsSync(iss) ? readJson(iss) : null;
    const count = (k: string) => ss.filter((x) => x.outcome.kind === k).length;
    const starts = ss.map((x) => Date.parse(x.ts)), ends = ss.map((x) => Date.parse(x.ts) + x.durationMs);
    const svb = ss.map((x) => x.metrics?.stepsVsBaseline).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
    return {
      id: r, study: st, ts: run.ts, app: run.app, brain: run.brain, status: run.status, trials: run.trials,
      personas: run.personas.length, tasks: run.tasks.length, sessions: ss.length,
      completed: count("completed"), gaveUp: count("gave-up"), wrongDone: count("wrong-done"), timedOut: count("timed-out"), errors: count("error"),
      unaware: ss.filter((x) => x.events.some((e) => e.type === "unaware-of-success")).length,
      judged: ss.filter((x) => x.judge).length,
      analyzed: !!issues, issues: issues?.issues.length ?? null, highIssues: issues?.issues.filter((i: any) => i.severity === "high").length ?? null, recall: issues?.recall ?? null,
      costUsd: ss.reduce((a, x) => a + x.costUsd, 0) + (issues?.costUsd ?? 0),
      wallMs: ss.length ? Math.max(...ends) - Math.min(...starts) : 0,
      medianStepsVsBaseline: svb.length ? svb[Math.floor(svb.length / 2)] : null,
    };
  })).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

function sessionRows(study?: string | null, run?: string | null) {
  return listStudies().filter((st) => !study || st === study).flatMap((st) => listRuns(st).filter((r) => !run || r === run).flatMap((r) => loadSessions(st, r).map((t) => ({ ...summary(t), study: st, run: r, ts: t.ts, durationMs: t.durationMs }))));
}

function overview(study: string) {
  const runs = runRows().filter((r) => r.study === study).reverse();
  const latest = runs.filter((r) => r.sessions >= 5).at(-1) ?? runs.at(-1);
  const prev = latest ? runs.filter((r) => r.sessions >= 5 && Date.parse(r.ts) < Date.parse(latest.ts)).at(-1) : undefined;
  const ss = latest ? loadSessions(study, latest.id) : [];
  const st = loadStudy(study);
  const issFile = latest ? join(runDir(study, latest.id), "issues.json") : "";
  const issues = latest && existsSync(issFile) ? readJson(issFile) : null;
  const byPersona = st.personas.map((p) => {
    const ps = ss.filter((t) => t.persona === p);
    const c = (k: string) => ps.filter((t) => t.outcome.kind === k).length;
    const unaware = ps.filter((t) => t.outcome.kind === "completed" && t.events.some((e) => e.type === "unaware-of-success")).length;
    return { persona: p, name: loadPersona(p).name, n: ps.length, completed: c("completed") - unaware, unaware, gaveUp: c("gave-up"), wrongDone: c("wrong-done"), other: c("timed-out") + c("error") };
  }).filter((x) => x.n);
  const kinds: Record<string, number> = {};
  for (const i of issues?.issues ?? []) kinds[i.kind] = (kinds[i.kind] ?? 0) + i.sessions.length;
  const all = runs.flatMap((r) => loadSessions(study, r.id));
  return {
    study: st, runs, latest, prev,
    totals: { runs: runs.length, sessions: all.length, costUsd: runs.reduce((a, r) => a + r.costUsd, 0), personas: st.personas.length, tasks: st.tasks.length },
    grid: buildGrid(ss), byPersona, issueKinds: Object.entries(kinds).map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n),
    topIssues: (issues?.issues ?? []).slice(0, 6), recall: issues?.recall ?? null,
    attention: ss.filter((t) => t.outcome.kind !== "completed" || t.events.some((e) => e.type === "unaware-of-success")).map(summary),
    signals: evaluateSignals(study).signals,
    personas: Object.fromEntries(st.personas.map((id) => [id, loadPersona(id)])),
  };
}


function personaStats(id: string, all: Trace[], tur: ReturnType<typeof turingResults>) {
  const ss = all.filter((t) => t.persona === id);
  const judged = ss.filter((t) => t.judge);
  const rate = (c: string) => { const vs = judged.map((t) => t.judge!.verdicts[c]).filter(Boolean); return vs.length ? { pass: vs.filter((v) => v.pass).length, n: vs.length } : null; };
  const words = ss.flatMap((t) => t.steps.map((s) => s.say)).filter(Boolean).map((l) => l.split(/\s+/).length).sort((a, b) => a - b);
  return {
    persona: loadPersona(id), studies: personaStudies(id), sessions: ss.length, completed: ss.filter((t) => t.outcome.kind === "completed").length,
    gaveUp: ss.filter((t) => t.outcome.kind === "gave-up").length, suspect: ss.filter((t) => t.events.some((e) => e.type === "suspect")).length,
    judge: { realism: rate("realism"), grounded: rate("grounded"), consistent: rate("consistent"), voice: rate("voice") },
    turing: tur.byPersona[id] ?? null, medianWords: words.length ? words[Math.floor(words.length / 2)] : null,
    lastRun: ss.map((t) => t.ts).sort().at(-1) ?? null,
  };
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  const p = url.pathname;
  if (p === "/" || p === "/index.html") return file(res, join(UI, "index.html"));
  if (/^\/(app|charts|table)\.js$/.test(p) || p === "/style.css") return file(res, join(UI, p.slice(1)));
  if (p === "/player.js") { res.writeHead(200, { "content-type": TYPES[".js"] }); res.end(playerJs); return; }
  if (p.startsWith("/export/")) return file(res, join(UI, "export.html"));
  if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }


  if (p === "/api/runs") return json(res, runRows());
  if (p === "/api/sessions") return json(res, sessionRows(url.searchParams.get("study"), url.searchParams.get("run")));
  if (p === "/api/overview") { const st = url.searchParams.get("study") ?? listStudies()[0]; return st ? json(res, overview(st)) : json(res, { empty: true }); }
  if (p === "/api/issues") {
    // Issues from the latest analyzed run of each study.
    return json(res, listStudies().flatMap((st) => {
      const r = listRuns(st).filter((x) => existsSync(join(runDir(st, x), "issues.json"))).at(-1);
      if (!r) return [];
      const personas = Object.fromEntries(loadStudy(st).personas.map((id) => [id, loadPersona(id).name]));
      return readJson(join(runDir(st, r), "issues.json")).issues.map((i: any) => ({ ...i, study: st, run: r, personaNames: i.personas.map((p: string) => personas[p] ?? p) }));
    }));
  }
  if (p === "/api/monitor") {
    const alertsFile = join(ROOT, "monitor", "alerts.jsonl");
    const alerts = existsSync(alertsFile) ? readFileSync(alertsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse().slice(0, 100) : [];
    return json(res, { studies: listStudies().map((st) => ({ id: st, ...evaluateSignals(st) })), alerts, config: readJson(join(ROOT, "monitor", "signals.json")) });
  }
  if (p === "/api/studies") return json(res, listStudies().map((st) => {
    const s = loadStudy(st);
    return { id: st, name: s.name, runs: listRuns(st).reverse().map((r) => { const run = readJson(join(runDir(st, r), "run.json")); const ss = loadSessions(st, r); const iss = join(runDir(st, r), "issues.json"); const issues = existsSync(iss) ? readJson(iss) : null; return { ...run, sessions: ss.length, completed: ss.filter((x) => x.outcome.kind === "completed").length, analyzed: !!issues, issues: issues?.issues.length ?? null, recall: issues?.recall ?? null, costUsd: ss.reduce((a, x) => a + x.costUsd, 0) }; }) };
  }));

  let m = p.match(/^\/api\/run\/([^/]+)\/([^/]+)$/);
  if (m) {
    const [, st, r] = m;
    const sessions = loadSessions(st, r);
    const issuesFile = join(runDir(st, r), "issues.json"), knownFile = join(studyDir(st), "known-issues.json");
    const study = loadStudy(st);
    return json(res, {
      study, run: readJson(join(runDir(st, r), "run.json")), grid: buildGrid(sessions), sessions: sessions.map(summary),
      issues: existsSync(issuesFile) ? readJson(issuesFile) : null, known: existsSync(knownFile) ? readJson(knownFile).issues : [],
      signals: evaluateSignals(st).signals, personas: Object.fromEntries(study.personas.map((id) => [id, loadPersona(id)])), tasks: Object.fromEntries(study.tasks.map((id) => [id, loadTask(st, id)])),
    });
  }

  m = p.match(/^\/api\/session\/([^/]+)$/);
  if (m) { const v = sessionPayload(m[1]); return v ? json(res, v) : json(res, { error: "not found" }, 404); }

  m = p.match(/^\/api\/session\/([^/]+)\/voice$/);
  if (m && req.method === "POST") {
    const s = findSession(m[1]);
    if (!s) return json(res, { error: "not found" }, 404);
    const t = readJson<Trace>(join(s.dir, "trace.json"));
    const info = await ensureVoice(s.dir, t);
    mixTrack(s.dir, t, info);
    return json(res, info);
  }

  m = p.match(/^\/api\/session\/([^/]+)\/render$/);
  if (m && req.method === "POST") {
    const { renderSession } = await import("../replay/export.js");
    const lens = (url.searchParams.get("lens") ?? "split") as any;
    const out = await renderSession(m[1], lens, 24);
    return json(res, { ok: true, path: out });
  }

  m = p.match(/^\/files\/([^/]+)\/(.+)$/);
  if (m) {
    const s = findSession(m[1]);
    if (!s) { res.writeHead(404); res.end(); return; }
    const f = normalize(join(s.dir, decodeURIComponent(m[2])));
    if (!f.startsWith(s.dir)) { res.writeHead(403); res.end(); return; }
    return file(res, f, req);
  }

  if (p === "/api/label" && req.method === "POST") {
    const b = await body(req);
    const ver = rubric().version;
    for (const [criterion, v] of Object.entries(b.labels ?? {})) addLabel({ session: b.session, criterion, pass: (v as any).pass, note: (v as any).note || undefined, by: b.by || "reviewer", ts: new Date().toISOString(), rubricVersion: ver });
    return json(res, { ok: true });
  }

  if (p === "/api/personas" && req.method === "GET") {
    const all = listStudies().flatMap((st) => listRuns(st).flatMap((r) => loadSessions(st, r)));
    const tur = turingResults();
    return json(res, listPersonas().map((id) => personaStats(id, all, tur)));
  }
  if (p === "/api/personas" && req.method === "POST") {
    const b = await body(req);
    try { return json(res, { ok: true, persona: savePersona(b, { create: true }) }); } catch (e) { return json(res, { error: (e as Error).message }, 400); }
  }
  m = p.match(/^\/api\/personas\/([a-z0-9-]+)$/);
  if (m && req.method === "PUT") {
    const b = await body(req);
    try { return json(res, { ok: true, persona: savePersona(b, { create: false, id: m[1] }) }); } catch (e) { return json(res, { error: (e as Error).message }, 400); }
  }
  if (m && req.method === "GET") {
    if (!listPersonas().includes(m[1])) return json(res, { error: "not found" }, 404);
    const all = listStudies().flatMap((st) => listRuns(st).flatMap((r) => loadSessions(st, r).map((t) => ({ t, st, r }))));
    const mine = all.filter((x) => x.t.persona === m![1]);
    return json(res, { ...personaStats(m[1], all.map((x) => x.t), turingResults()), voiceSamples: voiceSamples(m[1]), sessionsList: mine.map((x) => ({ ...summary(x.t), study: x.st, run: x.r, ts: x.t.ts, durationMs: x.t.durationMs })) });
  }
  if (p === "/api/persona-meta") return json(res, { voices: VOICES, studies: listStudies().map((st) => ({ id: st, name: loadStudy(st).name, tasks: loadStudy(st).tasks })) });
  if (p === "/api/persona-preview" && req.method === "POST") {
    const b = await body(req);
    try { return json(res, await previewPersona(b.persona, b.study ?? listStudies()[0], b.task)); } catch (e) { return json(res, { error: (e as Error).message }, 400); }
  }
  if (p === "/api/voice-preview" && req.method === "POST") {
    const b = await body(req);
    try { return json(res, { url: "/" + previewVoice(b.voice, Number(b.speed) || 1, String(b.text || "Hm. Where would that be?")) }); } catch (e) { return json(res, { error: (e as Error).message }, 400); }
  }
  if (p === "/api/persona-draft" && req.method === "POST") {
    const b = await body(req);
    if (!b.description || String(b.description).length < 8) return json(res, { error: "Describe the person in a sentence or two." }, 400);
    try { return json(res, await draftPersona(String(b.description).slice(0, 2000))); } catch (e) { return json(res, { error: (e as Error).message }, 500); }
  }
  m = p.match(/^\/\.cache\/voice-preview\/([0-9a-f]+\.wav)$/);
  if (m) return file(res, join(ROOT, ".cache", "voice-preview", m[1]), req);

  if (p === "/api/calibration") return json(res, { alignment: alignment(), turing: turingResults(), decks: decks().map((d: any) => ({ id: d.id, n: d.items.length })), rubric: rubric() });
  m = p.match(/^\/api\/turing\/([^/]+)$/);
  if (m) { const d = decks().find((x: any) => x.id === m![1]); return d ? json(res, { id: d.id, items: d.items.map((i: any) => ({ id: i.id, text: i.text })) }) : json(res, { error: "not found" }, 404); }
  if (p === "/api/turing-guess" && req.method === "POST") {
    const b = await body(req);
    const d = decks().find((x: any) => x.id === b.deck);
    const item = d?.items.find((i: any) => i.id === b.item);
    if (!item) return json(res, { error: "unknown item" }, 400);
    appendFileSync(join(EVALS, "turing", "guesses.jsonl"), JSON.stringify({ ts: new Date().toISOString(), deck: b.deck, item: b.item, guess: b.guess, source: item.source, persona: item.persona }) + "\n");
    return json(res, { source: item.source, persona: item.persona });
  }

  res.writeHead(404); res.end("not found");
}

export async function serve(port: number): Promise<{ port: number; close: () => void }> {
  await bundle();
  const srv = createServer((req, res) => { route(req, res).catch((e) => { console.error(e); if (!res.headersSent) json(res, { error: String(e?.message ?? e) }, 500); }); });
  await new Promise<void>((r) => srv.listen(port, r));
  const actual = (srv.address() as any).port;
  if (port) console.log(`usabilify dashboard on http://localhost:${actual}`);
  return { port: actual, close: () => srv.close() };
}
