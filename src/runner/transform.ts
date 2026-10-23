// Perception transforms: pure functions on PNG frames. What the persona sees, not what is on screen.
import { PNG } from "pngjs";
import type { Transform } from "../types.js";

// Machado, Oliveira & Fernandes (2009), severity 1.0, defined on linear RGB.
const CVD: Record<"protan" | "deutan" | "tritan", number[]> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const TO_LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = (l: number) => { const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.max(l, 0) ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };

export function cvdMatrix(kind: keyof typeof CVD, severity: number): number[] {
  const m = CVD[kind];
  return m.map((v, i) => ID[i] + (v - ID[i]) * severity);
}

/** Apply a 3x3 matrix in linear RGB to RGBA pixel data, in place. */
export function applyMatrix(data: Uint8Array, m: number[]) {
  for (let i = 0; i < data.length; i += 4) {
    const r = TO_LIN[data[i]], g = TO_LIN[data[i + 1]], b = TO_LIN[data[i + 2]];
    data[i] = toSrgb(m[0] * r + m[1] * g + m[2] * b);
    data[i + 1] = toSrgb(m[3] * r + m[4] * g + m[5] * b);
    data[i + 2] = toSrgb(m[6] * r + m[7] * g + m[8] * b);
  }
}

/** Separable gaussian blur on RGB, in place. sigma in image pixels. */
export function blur(data: Uint8Array, w: number, h: number, sigma: number) {
  if (sigma <= 0.05) return;
  const rad = Math.ceil(sigma * 3);
  const k = new Float32Array(rad * 2 + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) { k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + rad]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = -rad; j <= rad; j++) { const xx = Math.min(w - 1, Math.max(0, x + j)), o = (y * w + xx) * 4, kk = k[j + rad]; r += data[o] * kk; g += data[o + 1] * kk; b += data[o + 2] * kk; }
    const t = (y * w + x) * 3; tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = -rad; j <= rad; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)), t = (yy * w + x) * 3, kk = k[j + rad]; r += tmp[t] * kk; g += tmp[t + 1] * kk; b += tmp[t + 2] * kk; }
    const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b;
  }
}

/** Reduced contrast sensitivity: pull every channel toward mid grey. amount 1 = unchanged. */
export function contrast(data: Uint8Array, amount: number) {
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = Math.round(128 + (data[i + c] - 128) * amount);
}

/** Transform a PNG frame. `scale` is device pixels per CSS pixel, so blur sigma stays in CSS px. */
export function transformPng(png: Buffer, transforms: Transform[], scale = 1): Buffer {
  if (!transforms.length) return png;
  const img = PNG.sync.read(png);
  const data = img.data as unknown as Uint8Array;
  for (const t of transforms) {
    if (t.type === "cvd") applyMatrix(data, cvdMatrix(t.kind, t.severity));
    else if (t.type === "blur") blur(data, img.width, img.height, t.sigma * scale);
    else if (t.type === "contrast") contrast(data, t.amount);
  }
  return PNG.sync.write(img);
}

export function describeTransforms(ts: Transform[]): string {
  return ts.map((t) => t.type === "cvd" ? `${t.kind} color vision (severity ${t.severity})` : t.type === "blur" ? `blur σ=${t.sigma}px` : `contrast ×${t.amount}`).join(", ") || "none";
}

/** Fraction of pixels that differ noticeably between two same-size PNG frames (1 if sizes differ). */
export function pixelDiff(a: Buffer, b: Buffer): number {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return 1;
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 24) n++;
  return n / (A.width * A.height);
}
