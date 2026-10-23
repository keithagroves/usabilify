// Static server for fixture apps, with single-page-app fallback to index.html.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { ROOT } from "./util.js";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

export function serveFixture(name: string, port: number) {
  const base = join(ROOT, "fixtures", name);
  if (!existsSync(base)) throw new Error(`no fixture ${name}`);
  const srv = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    let f = join(base, p);
    if (!f.startsWith(base) || !existsSync(f) || statSync(f).isDirectory()) f = join(base, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(f).pipe(res);
  });
  return new Promise<typeof srv>((resolve) => srv.listen(port, () => resolve(srv)));
}
