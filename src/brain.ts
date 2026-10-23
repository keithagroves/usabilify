// Model backends. The actor holds one conversation per session; the analyst and judge make one-shot calls.
//   claude-code[:model]  persistent headless Claude Code over stream-json (default; no API key needed)
//   ollama:<model>       local vision model through Ollama (free; weaker)
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ROOT } from "./util.js";

export type Block = { type: "text"; text: string } | { type: "image"; png: Buffer };
export interface Reply { text: string; costUsd: number; ms: number }
export interface Brain { id: string; send(blocks: Block[]): Promise<Reply>; close(): void }

const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

export function openBrain(spec: string, system: string): Brain {
  if (spec.startsWith("ollama:")) return new OllamaBrain(spec.slice(7), system);
  const model = spec.includes(":") ? spec.split(":")[1] : "sonnet";
  return new ClaudeCodeBrain(model, system);
}

class ClaudeCodeBrain implements Brain {
  id: string;
  private p: ChildProcessWithoutNullStreams;
  private buf = "";
  private waiting: { resolve: (r: Reply) => void; reject: (e: Error) => void; t0: number } | null = null;
  private lastCost = 0;
  private dead: string | null = null;
  private stderr = "";

  constructor(model: string, system: string) {
    this.id = `claude-code:${model}`;
    this.p = spawn("claude", [
      "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--no-session-persistence", "--strict-mcp-config", "--tools", "", "--model", model,
      "--system-prompt", system,
    ], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    this.p.stdout.on("data", (d) => this.onData(String(d)));
    this.p.stderr.on("data", (d) => (this.stderr += d));
    this.p.on("close", (code) => {
      this.dead = `claude exited ${code}: ${this.stderr.slice(-400)}`;
      this.waiting?.reject(new Error(this.dead));
      this.waiting = null;
    });
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let j: any;
      try { j = JSON.parse(line); } catch { continue; }
      if (j.type !== "result" || !this.waiting) continue;
      const total = j.total_cost_usd ?? this.lastCost;
      const cost = Math.max(0, total - this.lastCost);
      this.lastCost = total;
      const w = this.waiting; this.waiting = null;
      if (j.is_error || j.subtype !== "success") w.reject(new Error(`${j.subtype}: ${String(j.result ?? "").slice(0, 300)}`));
      else w.resolve({ text: j.result ?? "", costUsd: cost, ms: Date.now() - w.t0 });
    }
  }

  send(blocks: Block[]): Promise<Reply> {
    if (this.dead) return Promise.reject(new Error(this.dead));
    const content = blocks.map((b) => b.type === "text" ? b : { type: "image", source: { type: "base64", media_type: "image/png", data: b.png.toString("base64") } });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = null; reject(new Error("brain turn timed out")); }, 180_000);
      this.waiting = { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject: (e) => { clearTimeout(timer); reject(e); }, t0: Date.now() };
      this.p.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n");
    });
  }

  close() { try { this.p.stdin.end(); } catch {} setTimeout(() => this.p.kill("SIGTERM"), 2000).unref(); }
}

class OllamaBrain implements Brain {
  id: string;
  private messages: { role: string; content: string; images?: string[] }[] = [];
  constructor(private model: string, system: string) {
    this.id = `ollama:${model}`;
    this.messages.push({ role: "system", content: system });
  }
  async send(blocks: Block[]): Promise<Reply> {
    const t0 = Date.now();
    // Keep only the newest images in context: small local models fall over with many frames.
    for (const m of this.messages) delete m.images;
    this.messages.push({
      role: "user",
      content: blocks.filter((b) => b.type === "text").map((b) => (b as any).text).join("\n\n"),
      images: blocks.filter((b) => b.type === "image").map((b) => (b as any).png.toString("base64")),
    });
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, stream: false, think: false, messages: this.messages, options: { temperature: 0.7, num_ctx: 16384 } }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
    const j: any = await res.json();
    const text = j.message?.content ?? "";
    this.messages.push({ role: "assistant", content: text });
    return { text, costUsd: 0, ms: Date.now() - t0 };
  }
  close() {}
}

/** One-shot call: open, send, close. */
export async function ask(spec: string, system: string, blocks: Block[]): Promise<Reply> {
  const b = openBrain(spec, system);
  try { return await b.send(blocks); } finally { b.close(); }
}

/**
 * Typed yes/no decision from a local model via option-letter log-probabilities, asked in both
 * letter orders and averaged (anim's letter-debiasing). Returns p(yes) and the gap between orders.
 */
export async function ollamaYesNo(model: string, prompt: string, images: Buffer[] = []): Promise<{ p: number; gap: number }> {
  const once = async (yesLetter: "A" | "B") => {
    const opts = yesLetter === "A" ? "A) yes\nB) no" : "A) no\nB) yes";
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model, stream: false, think: false, logprobs: true, top_logprobs: 20,
        options: { temperature: 0, num_predict: 1 },
        messages: [{ role: "user", content: `${prompt}\n\n${opts}\n\nAnswer with a single letter.`, images: images.map((b) => b.toString("base64")) }],
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
    const j: any = await res.json();
    const top: { token: string; logprob: number }[] = j.logprobs?.[0]?.top_logprobs ?? [];
    const pr = (L: string) => top.filter((t) => t.token.trim() === L).reduce((s, t) => s + Math.exp(t.logprob), 0);
    const a = pr("A"), b = pr("B");
    if (a + b === 0) { const c = String(j.message?.content ?? "").trim()[0]; return c === yesLetter ? 1 : 0; }
    return (yesLetter === "A" ? a : b) / (a + b);
  };
  const p1 = await once("A"), p2 = await once("B");
  return { p: (p1 + p2) / 2, gap: Math.abs(p1 - p2) };
}
