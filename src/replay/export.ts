// Export a session replay to MP4: step the player's render(t) in headless Chrome, pipe frames to ffmpeg, mux the voice track.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { chromium } from "playwright";
import { findSession } from "../load.js";
import { serve } from "../server/server.js";
import type { Trace } from "../types.js";
import { readJson } from "../util.js";
import type { Lens } from "./timeline.js";
import { ensureVoice, mixTrack } from "./voice.js";

export async function renderSession(id: string, lens: Lens, fps: number): Promise<string> {
  const s = findSession(id);
  if (!s) throw new Error(`no session ${id}`);
  const t = readJson<Trace>(join(s.dir, "trace.json"));
  const info = await ensureVoice(s.dir, t);
  const track = mixTrack(s.dir, t, info);
  const out = join(s.dir, "replay", `${lens}.mp4`);
  const srv = await serve(0);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const t0 = Date.now();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://localhost:${srv.port}/export/${id}?lens=${lens}`);
    await page.waitForFunction("window.__ready === true", null, { timeout: 30_000 });
    const duration: number = await page.evaluate("window.__duration");
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-", "-i", track,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise<void>((resolve, reject) => ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)))));
    const n = Math.ceil(duration * fps);
    let lastKey = "", last: Buffer | null = null, shots = 0;
    for (let i = 0; i < n; i++) {
      await page.evaluate(`window.__render(${i / fps})`);
      const key = createHash("md5").update(await page.evaluate("window.__key()") as string).digest("hex");
      if (key !== lastKey || !last) { last = await page.screenshot({ type: "jpeg", quality: 88 }); lastKey = key; shots++; }
      if (!ff.stdin.write(last)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await done;
    console.log(`${out}\n${n} frames (${shots} rendered), ${duration.toFixed(1)}s of video in ${((Date.now() - t0) / 1000).toFixed(0)}s, voice ${info.engine}`);
  } finally {
    await browser.close();
    srv.close();
  }
  return out;
}
