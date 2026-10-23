import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { applyMatrix, cvdMatrix, transformPng, contrast } from "../src/runner/transform.js";

const px = (r: number, g: number, b: number) => new Uint8Array([r, g, b, 255]);
const dist = (a: Uint8Array, b: Uint8Array) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("severity 0 is identity", () => {
  const p = px(214, 57, 57);
  applyMatrix(p, cvdMatrix("deutan", 0));
  assert.deepEqual([...p.slice(0, 3)], [214, 57, 57]);
});

test("deutan collapses the fixture's red and green toggles toward each other", () => {
  const red = px(0xd6, 0x39, 0x39), green = px(0x2f, 0xb3, 0x44);
  const before = dist(red, green);
  applyMatrix(red, cvdMatrix("deutan", 1)); applyMatrix(green, cvdMatrix("deutan", 1));
  const after = dist(red, green);
  assert.ok(after < before * 0.5, `expected collapse, ${before.toFixed(0)} -> ${after.toFixed(0)}`);
});

test("deutan keeps blue and yellow apart", () => {
  const blue = px(0x24, 0x57, 0xc5), yellow = px(0xf5, 0xd0, 0x2a);
  applyMatrix(blue, cvdMatrix("deutan", 1)); applyMatrix(yellow, cvdMatrix("deutan", 1));
  assert.ok(dist(blue, yellow) > 150);
});

test("grey is preserved by every CVD matrix", () => {
  for (const k of ["protan", "deutan", "tritan"] as const) {
    const g = px(128, 128, 128); applyMatrix(g, cvdMatrix(k, 1));
    for (const c of g.slice(0, 3)) assert.ok(Math.abs(c - 128) <= 2, `${k} moved grey to ${c}`);
  }
});

test("contrast reduction makes the fixture's edit link nearly vanish", () => {
  const link = px(0xc9, 0xcc, 0xd3), bg = px(255, 255, 255);
  const before = dist(link, bg);
  contrast(link, 0.55); contrast(bg, 0.55);
  assert.ok(dist(link, bg) < before * 0.6);
});

test("transformPng round-trips size and blurs a sharp edge", () => {
  const img = new PNG({ width: 20, height: 4 });
  for (let x = 0; x < 20; x++) for (let y = 0; y < 4; y++) { const o = (y * 20 + x) * 4; const v = x < 10 ? 0 : 255; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255; }
  const out = PNG.sync.read(transformPng(PNG.sync.write(img), [{ type: "blur", sigma: 2 }]));
  assert.equal(out.width, 20);
  const edge = out.data[(1 * 20 + 9) * 4];
  assert.ok(edge > 30 && edge < 225, `edge pixel should be mid-grey, got ${edge}`);
});
