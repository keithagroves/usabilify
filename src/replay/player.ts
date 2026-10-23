// Browser replay player. render(t) draws the frame at time t and nothing else depends on wall-clock time,
// so the live dashboard and the MP4 export show the same thing. Bundled by the server with esbuild.
import type { Trace } from "../types.js";
import { buildTimeline, stateAt, type Lens, type Timeline } from "./timeline.js";

export const W = 1920, H = 1080;

interface Opts { trace: Trace; persona: { name: string; summary: string; modality: string; patience: { budget: number } }; task: { goal: string }; durations: Record<string, number>; lens: Lens; files: string; findings?: Trace["findings"] }

const CSS = `
.up-stage{position:relative;width:${W}px;height:${H}px;background:#0f1218;color:#e8ebf2;font:24px/1.35 Inter,-apple-system,"Segoe UI",sans-serif;overflow:hidden;transform-origin:0 0}
.up-head{position:absolute;left:32px;right:32px;top:20px;height:56px;display:flex;align-items:center;gap:20px}
.up-name{font-weight:700;font-size:28px}
.up-goal{color:#a9b1c4;font-size:20px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.up-clock{font:600 22px/1 "JetBrains Mono",ui-monospace,monospace;color:#cdd3e1;background:#1b2130;border-radius:8px;padding:10px 14px}
.up-win{position:absolute;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 12px 40px #0008}
.up-win img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
.up-label{position:absolute;font-size:17px;color:#a9b1c4;letter-spacing:.02em}
.up-cursor{position:absolute;width:30px;height:30px;margin:-3px 0 0 -3px;pointer-events:none;filter:drop-shadow(0 2px 3px #0009)}
.up-ring{position:absolute;border:3px solid #ffd166;border-radius:50%;pointer-events:none}
.up-slip{position:absolute;font:600 15px/1 Inter,sans-serif;background:#ffd166;color:#111;padding:4px 7px;border-radius:5px;white-space:nowrap}
.up-chip{position:absolute;left:50%;transform:translateX(-50%);background:#ffd166;color:#111;font:600 26px/1 "JetBrains Mono",ui-monospace,monospace;padding:12px 18px;border-radius:10px;white-space:nowrap;max-width:80%;overflow:hidden;text-overflow:ellipsis}
.up-glimpse{position:absolute;left:12px;top:12px;background:#111d;color:#ffd166;font-size:17px;padding:6px 10px;border-radius:6px}
.up-buffer{position:absolute;background:#141924;color:#d7dceb;font:17px/1.45 "JetBrains Mono",ui-monospace,monospace;padding:16px 18px;border-radius:10px;overflow:hidden;white-space:pre-wrap}
.up-buffer .hl{background:#ffd166;color:#111;border-radius:3px}
.up-strip{position:absolute;left:32px;right:32px;top:84px;height:40px;display:flex;align-items:center;gap:22px;font-size:20px}
.up-k{font-size:15px;color:#8f98ad;text-transform:uppercase;letter-spacing:.06em}
.up-meter{width:220px;height:12px;border-radius:6px;background:#2a3142;overflow:hidden}
.up-meter>div{height:100%;background:linear-gradient(90deg,#e9eef9,#9fb3d9)}
.up-mood{font-size:19px;color:#cdd3e1;min-width:260px}
.up-intent{font-size:20px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.up-find{position:absolute;right:32px;bottom:160px;max-width:900px;font-size:21px;background:#2b2412;color:#ffd166;border-radius:8px;padding:8px 14px;z-index:5}
.up-cap{position:absolute;left:32px;right:32px;bottom:28px;height:118px;display:flex;align-items:center;gap:18px;background:#171c27;border-radius:12px;padding:0 26px}
.up-who{font-weight:700;color:#ffd166;font-size:24px;white-space:nowrap}
.up-say{font-size:33px;line-height:1.25}
.up-end{position:absolute;inset:0;z-index:20;background:#0f1218f2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.up-end h2{font-size:56px;margin:0}
.up-end p{font-size:26px;color:#cdd3e1;margin:0;max-width:1300px;text-align:center}
`;

const CURSOR = `<svg class="up-cursor" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const OUTCOME: Record<string, string> = { completed: "Completed", "gave-up": "Gave up", "timed-out": "Ran out of steps", "wrong-done": "Thought it was done — it wasn't", error: "Session error" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export class Player {
  tl: Timeline;
  el: HTMLElement;
  private o: Opts;
  private wins: { box: { x: number; y: number; w: number; h: number }; img: HTMLImageElement; cur: HTMLElement; ring: HTMLElement; slip: HTMLElement; glimpse: HTMLElement; kind: "real" | "view" }[] = [];
  private buf?: HTMLElement;
  private bufCache = new Map<string, string>();
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;

  constructor(host: HTMLElement, o: Opts) {
    this.o = o;
    this.tl = buildTimeline(o.trace, o.durations);
    if (!document.getElementById("up-css")) { const st = document.createElement("style"); st.id = "up-css"; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement("div");
    this.el.className = "up-stage";
    host.appendChild(this.el);
    const t = o.trace, vw = t.viewport.width, vh = t.viewport.height;
    const sr = o.persona.modality === "screen-reader";
    this.el.innerHTML = `
      <div class="up-head"><span class="up-name">${esc(o.persona.name)}</span><span class="up-goal">${esc(o.task.goal)}</span><span class="up-clock" id="up-step"></span><span class="up-clock" id="up-clock"></span></div>
      <div class="up-strip"><span class="up-k">Patience</span><div class="up-meter"><div id="up-meter"></div></div><span class="up-mood" id="up-mood"></span><span class="up-k">Trying to</span><span class="up-intent" id="up-intent"></span></div>
      <div class="up-find" id="up-findcard" style="display:none"></div>
      <div class="up-cap"><span class="up-who">${esc(o.persona.name)}</span><span class="up-say" id="up-say"></span></div>
      <div class="up-chip" id="up-chip" style="display:none"></div>
      <div class="up-end" id="up-end" style="display:none"></div>`;
    // Frame area: left of the sidebar, between header and caption.
    const area = { x: 32, y: 136, w: W - 64, h: H - 136 - 166 };
    const fit = (b: typeof area, aw: number, ah: number) => { const s = Math.min(b.w / aw, (b.h - 30) / ah); const w = aw * s, h = ah * s; return { x: b.x + (b.w - w) / 2, y: b.y + 30 + (b.h - 30 - h) / 2, w, h }; };
    const lens = o.lens;
    const panes: { kind: "real" | "view" | "buffer"; label: string; box: typeof area }[] = [];
    const personaKind = sr ? "buffer" : "view";
    const hasView = sr || o.trace.steps.some((s) => s.view);
    if (lens === "split" && hasView) {
      const half = (area.w - 24) / 2;
      panes.push({ kind: "real", label: "On screen", box: { ...area, w: half } }, { kind: personaKind, label: sr ? `What ${o.persona.name} hears` : `What ${o.persona.name} sees`, box: { ...area, x: area.x + half + 24, w: half } });
    } else if (lens === "persona" && hasView) panes.push({ kind: personaKind, label: sr ? `What ${o.persona.name} hears` : `What ${o.persona.name} sees`, box: area });
    else panes.push({ kind: "real", label: "On screen", box: area });
    for (const p of panes) {
      const lab = document.createElement("div"); lab.className = "up-label"; lab.textContent = p.label;
      if (p.kind === "buffer") {
        const b = { x: p.box.x, y: p.box.y + 30, w: p.box.w, h: p.box.h - 30 };
        Object.assign(lab.style, { left: `${b.x}px`, top: `${p.box.y}px` });
        this.buf = document.createElement("div"); this.buf.className = "up-buffer";
        Object.assign(this.buf.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
        this.el.append(lab, this.buf);
        continue;
      }
      const box = fit(p.box, vw, vh);
      Object.assign(lab.style, { left: `${box.x}px`, top: `${box.y - 30}px` });
      const win = document.createElement("div"); win.className = "up-win";
      Object.assign(win.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
      const img = document.createElement("img"); img.decoding = "sync";
      const glimpse = document.createElement("div"); glimpse.className = "up-glimpse"; glimpse.style.display = "none";
      win.append(img, glimpse);
      win.insertAdjacentHTML("beforeend", CURSOR);
      const ring = document.createElement("div"); ring.className = "up-ring";
      const slip = document.createElement("div"); slip.className = "up-slip"; slip.textContent = "slipped"; slip.style.display = "none";
      win.append(ring, slip);
      this.el.append(lab, win);
      this.wins.push({ box, img, cur: win.querySelector(".up-cursor") as HTMLElement, ring, slip, glimpse, kind: p.kind as "real" | "view" });
    }
    const chip = this.q<HTMLElement>("#up-chip");
    chip.style.top = `${area.y + area.h - 64}px`;
  }

  get duration() { return this.tl.duration; }

  private async loadBuffer(path: string) {
    if (!this.bufCache.has(path)) this.bufCache.set(path, await (await fetch(`${this.o.files}/${path}`)).text());
    return this.bufCache.get(path)!;
  }

  /** Draw time t. Resolves once images are decoded (the exporter waits on this). */
  async render(time: number): Promise<void> {
    const o = this.o, t = o.trace, st = stateAt(this.tl, t, time);
    if (!st.step || !st.seg) return;
    const vw = t.viewport.width;
    const loads: Promise<unknown>[] = [];
    for (const w of this.wins) {
      const src = w.kind === "view" ? st.view ?? st.real : st.real;
      const url = src ? `${o.files}/${src}` : "";
      if (url && w.img.getAttribute("src") !== url) { w.img.setAttribute("src", url); loads.push(w.img.decode().catch(() => {})); }
      const s = w.box.w / vw;
      if (st.cursor) {
        w.cur.style.display = "block";
        w.cur.style.left = `${st.cursor.x * s}px`; w.cur.style.top = `${st.cursor.y * s}px`;
        const r = 14 + (1 - st.cursor.click) * 30;
        w.ring.style.display = st.cursor.click > 0 ? "block" : "none";
        Object.assign(w.ring.style, { left: `${st.cursor.x * s - r}px`, top: `${st.cursor.y * s - r}px`, width: `${r * 2}px`, height: `${r * 2}px`, opacity: String(st.cursor.click) });
        w.slip.style.display = st.cursor.slip ? "block" : "none";
        if (st.cursor.slip) Object.assign(w.slip.style, { left: `${st.cursor.x * s + 18}px`, top: `${st.cursor.y * s + 18}px` });
      } else { w.cur.style.display = "none"; w.ring.style.display = "none"; w.slip.style.display = "none"; }
      w.glimpse.style.display = st.glimpse ? "block" : "none";
      if (st.glimpse) w.glimpse.textContent = "on screen for a moment";
    }
    if (this.buf && st.buffer) {
      const text = await this.loadBuffer(st.buffer);
      const ref = (st.step.act as any).ref;
      const lines = text.split("\n");
      const at = ref != null ? lines.findIndex((l) => l.startsWith(`[${ref}] `)) : -1;
      const from = Math.max(0, at - 8);
      this.buf.innerHTML = lines.slice(from, from + 34).map((l, j) => j + from === at && time >= st.seg!.chipStart ? `<span class="hl">${esc(l)}</span>` : esc(l)).join("\n");
    }
    const step = st.step, k = st.stepIndex;
    this.q<HTMLElement>("#up-step").textContent = `step ${k + 1}/${t.steps.length}`;
    const m = Math.floor(st.clock / 60), sec = Math.floor(st.clock % 60);
    this.q<HTMLElement>("#up-clock").textContent = `${m}:${String(sec).padStart(2, "0")}`;
    this.q<HTMLElement>("#up-meter").style.width = `${Math.max(0, Math.min(1, step.mood.patience / o.persona.patience.budget)) * 100}%`;
    this.q<HTMLElement>("#up-mood").textContent = step.mood.words.replace(/^You're /, "").replace(/^You've /, "");
    this.q<HTMLElement>("#up-intent").textContent = step.intent ?? "";
    this.q<HTMLElement>("#up-say").textContent = st.captionOn ? `“${st.caption}”` : "";
    const f = (o.findings ?? []).find((x) => x.atStep === step.i);
    const fc = this.q<HTMLElement>("#up-findcard");
    fc.style.display = f && !st.ending ? "block" : "none";
    if (f) fc.textContent = `Finding: ${f.title}`;
    const chip = this.q<HTMLElement>("#up-chip");
    chip.style.display = st.chip ? "block" : "none";
    if (st.chip) chip.textContent = st.chip;
    const end = this.q<HTMLElement>("#up-end");
    end.style.display = st.ending ? "flex" : "none";
    if (st.ending) {
      const mt = t.metrics;
      end.innerHTML = `<h2>${esc(OUTCOME[t.outcome.kind] ?? t.outcome.kind)}</h2><p>${esc(t.outcome.reason)}</p>${mt ? `<p>${mt.steps} steps (expert: ${Math.round(mt.steps / mt.stepsVsBaseline)}) · ${mt.wrongTurns} wrong turns · ${mt.confusionEvents} confused moments · ${Math.round(t.durationMs / 1000)}s</p>` : ""}`;
    }
    await Promise.all(loads);
  }
}

(globalThis as any).UsabPlayer = Player;
