// One persona attempting one task once: perceive → transform → think/speak → act → record.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { openBrain, type Block } from "../brain.js";
import type { Action, Persona, Step, Study, Task, Trace } from "../types.js";
import { newId, PERSONAS, round, sha, writeJson } from "../util.js";
import { ALLOWED, perform } from "./act.js";
import { parseReply, promptHash, systemPrompt, type ActorReply } from "./actor.js";
import { initialMood, reactionMs, updateMood } from "./mood.js";
import { focusedInfo, INIT_SCRIPT, pageNow, screenshot, settle, transientsSince, virtualBuffer, visibleTransient } from "./perceive.js";
import { describeTransforms, pixelDiff, transformPng } from "./transform.js";

export interface SessionOpts { brain: string; runDir: string; runId: string; trial: number; appVersion: string; log?: (s: string) => void; trace?: boolean }

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return url; } };

export async function checkSuccess(page: Page, task: Task): Promise<boolean> {
  const s = task.success;
  try {
    if (s.kind === "js") return !!(await page.evaluate(s.expr));
    if (s.kind === "url") return pathOf(page.url()).startsWith(s.url);
    return (await page.textContent("body"))?.includes(s.text) ?? false;
  } catch { return false; }
}

/** Plain-language feedback for the next turn: what the persona would notice, never what we measured. */
function feedback(p: Persona, events: string[], glimpseNote: string | null, transient: string): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e === "dead") out.push(p.modality === "screen-reader" ? "Your screen reader said nothing new." : "Nothing seemed to happen.");
    else if (e.startsWith("refused:")) out.push(`That didn't work: ${e.slice(8)}.`);
    else if (e.startsWith("dropdown-open:") && p.modality === "sighted") out.push(`A dropdown list opened with these options: ${e.slice(14)}. (It closes again when you do something else.)`);
    else if (e.startsWith("dropdown-focused:")) out.push(`You're on a dropdown. Its options are: ${e.slice(17)}.`);
    else if (e.startsWith("focus:") && p.modality === "keyboard") out.push(`Focus is now on: ${e.slice(6)}.`);
    else if (e === "typed-into-nothing") out.push("Your typing didn't seem to go anywhere.");
  }
  if (p.modality === "screen-reader" && transient) out.push(`Your screen reader announced: "${transient}".`);
  else if (glimpseNote) out.push(glimpseNote);
  return out;
}

export async function runSession(browser: Browser, study: Study, task: Task, persona: Persona, o: SessionOpts): Promise<Trace> {
  const id = newId("ss");
  const dir = join(o.runDir, "sessions", id);
  mkdirSync(join(dir, "steps"), { recursive: true });
  const log = o.log ?? (() => {});
  const vp = persona.viewport;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await ctx.addInitScript(INIT_SCRIPT);
  for (const b of study.block) await ctx.route(new RegExp(b), (r) => r.abort());
  if (o.trace !== false) await ctx.tracing.start({ screenshots: true, snapshots: true });
  const page = await ctx.newPage();
  const sys = systemPrompt(persona, task, vp.width, vp.height);
  const brain = openBrain(o.brain, sys);
  writeFileSync(join(dir, "system-prompt.txt"), sys);

  const trace: Trace = {
    id, ts: new Date().toISOString(), kind: "session", study: study.id, run: o.runId, task: task.id, persona: persona.id, trial: o.trial,
    sut: { app: o.appVersion, brain: brain.id, promptHash: promptHash(persona), personaHash: sha(readFileSync(join(PERSONAS, persona.id, "persona.json"))) },
    viewport: { width: vp.width, height: vp.height },
    outcome: { kind: "timed-out", atStep: 0, reason: "Ran out of steps." },
    steps: [], costUsd: 0, durationMs: 0, events: [],
  };
  const t0 = Date.now();
  const save = () => { trace.durationMs = Date.now() - t0; writeJson(join(dir, "trace.json"), trace); };
  const rel = (n: number, k: string) => `steps/${String(n).padStart(2, "0")}-${k}.png`;
  const visited = new Set<string>();
  let mood = initialMood(persona);
  let notes: string[] = [];
  let glimpses: Step["glimpses"] = [];

  try {
    await page.goto(new URL(task.start, study.baseUrl).href, { waitUntil: "networkidle" });
    visited.add(pathOf(page.url()));
    for (let i = 0; i < task.maxSteps; i++) {
      const stepT = (Date.now() - t0) / 1000;
      const url = page.url();
      const frame = await screenshot(page);
      writeFileSync(join(dir, rel(i, "before")), frame);
      const step: Partial<Step> = { i, t: round(stepT), url: pathOf(url), frame: rel(i, "before"), mood, events: [], glimpses };
      glimpses = [];

      // What the persona perceives this turn.
      const blocks: Block[] = [];
      const header = i === 0 ? `You've just opened the app. ${mood.words}` : [...notes, mood.words].join(" ");
      if (persona.modality === "screen-reader") {
        const buf = await virtualBuffer(page);
        writeFileSync(join(dir, `steps/${String(i).padStart(2, "0")}-buffer.txt`), buf);
        step.buffer = `steps/${String(i).padStart(2, "0")}-buffer.txt`;
        blocks.push({ type: "text", text: `${header}\n\nYour screen reader reads the page (${pathOf(url)}):\n${buf}\n\nWhat now?` });
      } else {
        const view = transformPng(frame, persona.perception.transforms, 1);
        if (persona.perception.transforms.length) { writeFileSync(join(dir, rel(i, "view")), view); step.view = rel(i, "view"); }
        blocks.push({ type: "text", text: header }, { type: "image", png: view }, { type: "text", text: "What now?" });
      }

      let reply: ActorReply | null = null;
      for (let attempt = 0; attempt < 3 && !reply; attempt++) {
        const r = await brain.send(attempt === 0 ? blocks : [{ type: "text", text: "That wasn't a valid reply. Answer with only the JSON object in the format you were given." }]);
        trace.costUsd += r.costUsd;
        try { reply = parseReply(r.text); } catch (e) { log(`  parse error: ${(e as Error).message.slice(0, 120)}`); }
      }
      if (!reply) throw new Error("persona produced no valid reply after 3 attempts");
      Object.assign(step, { say: reply.say, feeling: reply.feeling, intent: reply.intent, act: reply.action });
      log(`  ${persona.id}/${task.id} #${i} [${reply.feeling}] "${reply.say}" → ${JSON.stringify(reply.action)}`);

      const act: Action = reply.action;
      if (act.type === "done" || act.type === "give_up") {
        const ok = await checkSuccess(page, task);
        trace.steps.push({ ...step, dtMs: 0 } as Step);
        trace.outcome = act.type === "give_up"
          ? (ok ? { kind: "completed", atStep: i, reason: "Finished without realising it." } : { kind: "gave-up", atStep: i, reason: reply.say })
          : (ok ? { kind: "completed", atStep: i, reason: reply.say } : { kind: "wrong-done", atStep: i, reason: `Believed it was done: ${reply.say}` });
        if (act.type === "give_up" && ok) trace.events.push({ type: "unaware-of-success", ts: new Date().toISOString() });
        break;
      }

      // Act, then look back at the screen after a human reaction time.
      const before = { url: page.url(), now: await pageNow(page), focus: JSON.stringify(await focusedInfo(page)) };
      const a0 = Date.now();
      const res = ALLOWED[persona.modality].includes(act.type) ? await perform(page, persona, act) : { events: [`refused:${act.type} is not something you can do`] };
      const st = await settle(page, reactionMs(persona));
      const after = await screenshot(page);
      writeFileSync(join(dir, rel(i, "after")), after);
      const nowTransient = await visibleTransient(page);
      const allTransients = await transientsSince(page, before.now);
      const missedTransient = allTransients.find((x) => x.text && !nowTransient.includes(x.text));

      const events = [...res.events];
      const urlChanged = pathOf(page.url()) !== pathOf(before.url);
      // Mutation counts are noisy (apps rewrite attributes on every click); a person judges by what changed on screen.
      const focusMoved = JSON.stringify(await focusedInfo(page)) !== before.focus;
      const changed = urlChanged || focusMoved || pixelDiff(frame, after) > 0.0002; // ~200 px: a toggle flip counts, cursor-free screenshots keep noise at 0
      const actsOnPage = ["click", "activate", "press"].includes(act.type);
      if (actsOnPage && !changed && !events.some((e) => e.startsWith("refused") || e.startsWith("dropdown"))) events.push("dead");
      if (urlChanged) events.push(`navigated:${pathOf(page.url())}`);
      if (st.slowMs > 2000) events.push(`slow:${st.slowMs}ms`);
      for (let g = 0; g < st.glimpses.length; g++) {
        const gp = `steps/${String(i).padStart(2, "0")}-glimpse${g}.png`;
        writeFileSync(join(dir, gp), st.glimpses[g].png);
        step.glimpses!.push({ t: st.glimpses[g].t / 1000, frame: gp, note: st.glimpses[g].note });
      }
      for (const tr of allTransients) events.push(`transient:${tr.text}`);

      const newPath = pathOf(page.url());
      const onPath = task.baseline.path.includes(newPath);
      const signals = {
        wrongTurn: urlChanged && !onPath && !visited.has(newPath),
        backtrack: act.type === "back" || (urlChanged && visited.has(newPath)),
        deadClick: events.includes("dead"),
        slow: st.slowMs > 2000,
        progress: urlChanged && onPath && !visited.has(newPath),
        feeling: reply.feeling,
        refused: events.some((e) => e.startsWith("refused")),
      };
      if (signals.wrongTurn) events.push("wrong-turn");
      if (signals.backtrack) events.push("backtrack");
      visited.add(newPath);
      mood = updateMood(mood, persona, signals);

      let glimpseNote: string | null = null;
      if (missedTransient) {
        glimpseNote = persona.knowledge.web === "novice"
          ? "Something flashed up near the bottom of the screen and vanished before you could read it."
          : `A message flashed up for a moment and disappeared: "${missedTransient.text}".`;
        events.push("missed-transient");
      }
      notes = feedback(persona, events, glimpseNote, allTransients.map((x) => x.text).join(" | "));
      trace.steps.push({ ...step, target: res.target ?? null, misclick: res.misclick, after: rel(i, "after"), events, dtMs: Date.now() - a0 } as Step);
      save();

      if (await checkSuccess(page, task)) {
        // One more look, so we hear whether the persona realises it worked.
        const fin = await screenshot(page);
        writeFileSync(join(dir, rel(i + 1, "before")), fin);
        const view = persona.modality === "screen-reader" ? null : transformPng(fin, persona.perception.transforms, 1);
        if (view && persona.perception.transforms.length) writeFileSync(join(dir, rel(i + 1, "view")), view);
        const buf = persona.modality === "screen-reader" ? await virtualBuffer(page) : "";
        const b: Block[] = [{ type: "text", text: [...notes, mood.words].join(" ") }];
        if (view) b.push({ type: "image", png: view }); else b.push({ type: "text", text: `Your screen reader reads the page:\n${buf}` });
        b.push({ type: "text", text: "What now?" });
        const r = await brain.send(b);
        trace.costUsd += r.costUsd;
        let fr: ActorReply | null = null;
        try { fr = parseReply(r.text); } catch {}
        const finStep: Step = {
          i: i + 1, t: round((Date.now() - t0) / 1000), url: pathOf(page.url()), frame: rel(i + 1, "before"), view: view && persona.perception.transforms.length ? rel(i + 1, "view") : undefined,
          say: fr?.say ?? "", feeling: fr?.feeling ?? "unsure", intent: fr?.intent, mood, act: { type: "done" }, events: ["final-look"], glimpses: [], dtMs: 0,
        };
        trace.steps.push(finStep);
        log(`  ${persona.id}/${task.id} #${i + 1} [${finStep.feeling}] "${finStep.say}" (task complete)`);
        if (fr && fr.action.type !== "done" && fr.feeling !== "done") trace.events.push({ type: "unaware-of-success", ts: new Date().toISOString() });
        trace.outcome = { kind: "completed", atStep: i + 1, reason: finStep.say };
        break;
      }
      if (mood.patience <= -2) { trace.outcome = { kind: "gave-up", atStep: i, reason: "Walked away (patience exhausted)." }; break; }
    }
  } catch (e) {
    trace.outcome = { kind: "error", atStep: trace.steps.length, reason: (e as Error).message.slice(0, 500) };
    log(`  ${persona.id}/${task.id} ERROR ${(e as Error).message.slice(0, 200)}`);
  } finally {
    brain.close();
    if (o.trace !== false) await ctx.tracing.stop({ path: join(dir, "playwright-trace.zip") }).catch(() => {});
    await ctx.close().catch(() => {});
    save();
  }
  trace.durationMs = Date.now() - t0;
  save();
  return trace;
}

export const sessionDir = (runDir: string, id: string) => join(runDir, "sessions", id);
export { describeTransforms };
