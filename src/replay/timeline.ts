// Replay timing: a pure function of the trace and the spoken line lengths. Runs in Node (mixing, export) and the browser (player).
// Time is inverted relative to the session: each step lasts as long as its line takes to say, plus the action.
import type { Step, Trace } from "../types.js";

export type Lens = "plain" | "split" | "persona";

export interface Seg {
  step: number; start: number; end: number;
  speakStart: number; speakEnd: number;
  moveStart: number; moveEnd: number;      // pointer glide (equal when none)
  chipStart: number; chipEnd: number;      // key or typing chip
  afterStart: number;                      // switch to the after frame
  glimpses: { start: number; end: number; frame: string; note: string }[];
  realStart: number; realEnd: number;      // session clock, seconds
}
export interface Timeline { duration: number; segs: Seg[]; lines: { id: string; start: number; dur: number; step: number }[]; endStart: number }

const POINTER = new Set(["click", "select"]);
const CHIP = new Set(["press", "type", "activate", "fill", "scroll", "back", "wait"]);

export function buildTimeline(t: Trace, durations: Record<string, number>): Timeline {
  const segs: Seg[] = [], lines: Timeline["lines"] = [];
  let T = 0.4;
  t.steps.forEach((s, k) => {
    const id = String(s.i).padStart(2, "0");
    const dur = s.say ? durations[id] ?? Math.max(1.2, s.say.split(/\s+/).length * 0.33) : 0;
    const speakStart = T + 0.3, speakEnd = speakStart + dur;
    if (s.say) lines.push({ id, start: speakStart, dur, step: s.i });
    let moveStart = speakEnd, moveEnd = speakEnd, chipStart = speakEnd, chipEnd = speakEnd;
    if (POINTER.has(s.act.type)) { moveStart = Math.max(speakStart, speakEnd - Math.min(0.5, dur * 0.3)); moveEnd = moveStart + 0.75; }
    else if (CHIP.has(s.act.type)) { chipStart = Math.max(speakStart, speakEnd - 0.2); chipEnd = chipStart + (s.act.type === "type" || s.act.type === "fill" ? 0.5 + ((s.act as any).text?.length ?? 0) * 0.045 : 0.9); }
    const terminal = s.act.type === "done" || s.act.type === "give_up" || s.events.includes("final-look");
    let afterStart = terminal ? speakEnd + 0.6 : Math.max(moveEnd, chipEnd) + 0.3;
    const glimpses = (s.glimpses ?? []).map((g, j) => ({ start: afterStart + j * 0.9, end: afterStart + (j + 1) * 0.9, frame: g.frame, note: g.note }));
    if (glimpses.length) afterStart = glimpses[glimpses.length - 1].end;
    const end = terminal ? afterStart + 0.4 : afterStart + 0.7;
    const next = t.steps[k + 1];
    segs.push({ step: s.i, start: T, end, speakStart, speakEnd, moveStart, moveEnd, chipStart, chipEnd, afterStart, glimpses, realStart: s.t, realEnd: next ? next.t : s.t + s.dtMs / 1000 });
    T = end;
  });
  return { duration: T + 4, segs, lines, endStart: T };
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export interface FrameState {
  seg: Seg | null; step: Step | null; ending: boolean;
  real: string | null;           // real frame path for this moment
  view: string | null;           // persona-perceived frame path (null when not applicable)
  buffer: string | null;         // screen-reader buffer path
  glimpse: string | null;        // note when showing a glimpse
  cursor: { x: number; y: number; visible: boolean; click: number; slip: { x: number; y: number } | null } | null;
  chip: string | null;
  caption: string; captionOn: boolean;
  clock: number;
  stepIndex: number;
}

/** Where the cursor rests before step k: the last pointer target, or the middle of the screen. */
function restPoint(t: Trace, k: number): { x: number; y: number } {
  for (let j = k - 1; j >= 0; j--) { const a = t.steps[j].act as any; if (POINTER.has(a.type) && a.x != null) return t.steps[j].misclick ? { x: t.steps[j].misclick!.to[0], y: t.steps[j].misclick!.to[1] } : { x: a.x, y: a.y }; }
  return { x: t.viewport.width / 2, y: t.viewport.height / 2 };
}

function chipText(s: Step): string | null {
  const a = s.act as any;
  switch (a.type) {
    case "press": return `⌨ ${a.key}`;
    case "type": return `⌨ “${a.text}”`;
    case "fill": return `⌨ [${a.ref}] “${a.text}”`;
    case "activate": return `⏎ item [${a.ref}]`;
    case "scroll": return a.dy > 0 ? "↓ scroll" : "↑ scroll";
    case "back": return "← back";
    case "wait": return "… waiting";
    case "select": return `▾ ${a.option}`;
    default: return null;
  }
}

export function stateAt(tl: Timeline, t: Trace, time: number): FrameState {
  const k = tl.segs.findIndex((s) => time < s.end);
  const ending = k < 0;
  const idx = ending ? tl.segs.length - 1 : k;
  const seg = tl.segs[idx] ?? null, step = t.steps[idx] ?? null;
  if (!seg || !step) return { seg: null, step: null, ending: true, real: null, view: null, buffer: null, glimpse: null, cursor: null, chip: null, caption: "", captionOn: false, clock: 0, stepIndex: 0 };
  const next = t.steps[idx + 1];
  let real = step.frame, view = step.view ?? null, glimpse: string | null = null;
  const g = seg.glimpses.find((x) => time >= x.start && time < x.end);
  if (g) { real = g.frame; view = null; glimpse = g.note; }
  else if (time >= seg.afterStart && step.after) { real = step.after; view = next?.view ?? null; }
  if (ending) { real = next?.frame ?? step.after ?? step.frame; }
  const a = step.act as any;
  let cursor: FrameState["cursor"] = null;
  if (t.steps.some((s) => POINTER.has(s.act.type))) {
    const from = restPoint(t, idx);
    let x = from.x, y = from.y, click = 0, slip: { x: number; y: number } | null = null;
    if (POINTER.has(a.type) && a.x != null) {
      const p = ease(clamp((time - seg.moveStart) / Math.max(0.01, seg.moveEnd - seg.moveStart)));
      x = from.x + (a.x - from.x) * p; y = from.y + (a.y - from.y) * p;
      const since = time - seg.moveEnd;
      if (since >= 0) {
        click = clamp(1 - since / 0.5);
        if (step.misclick) { const q = ease(clamp(since / 0.15)); x = a.x + (step.misclick.to[0] - a.x) * q; y = a.y + (step.misclick.to[1] - a.y) * q; slip = { x: a.x, y: a.y }; }
      }
    }
    cursor = { x, y, visible: true, click, slip };
  }
  const chip = time >= seg.chipStart && time < Math.max(seg.chipEnd, seg.chipStart + 0.01) + 0.4 ? chipText(step) : null;
  const clock = seg.realStart + (seg.realEnd - seg.realStart) * clamp((time - seg.start) / Math.max(0.01, seg.end - seg.start));
  return {
    seg, step, ending, real, view, buffer: step.buffer ?? null, glimpse, cursor, chip,
    caption: step.say, captionOn: time >= seg.speakStart - 0.1 && !ending, clock, stepIndex: idx,
  };
}
