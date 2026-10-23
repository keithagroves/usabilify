// Small samples lie: intervals, paired bootstrap, and agreement. Same methods as anim/src/evals/stats.ts.

/** 95% Wilson score interval for k successes out of n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

/** Paired bootstrap over cases: CI for mean(b) - mean(a), where a and b are per-case rates. */
export function pairedBootstrap(a: number[], b: number[], iters = 2000): { diff: number; lo: number; hi: number } {
  const n = a.length, diffs: number[] = [];
  for (let i = 0; i < iters; i++) { let s = 0; for (let j = 0; j < n; j++) { const k = Math.floor(Math.random() * n); s += b[k] - a[k]; } diffs.push(s / n); }
  diffs.sort((x, y) => x - y);
  const diff = a.reduce((s, x, i) => s + (b[i] - x), 0) / Math.max(1, n);
  return { diff, lo: diffs[Math.floor(iters * 0.025)], hi: diffs[Math.floor(iters * 0.975)] };
}

/** Cohen's kappa for two binary raters, plus recall on failures and on passes. */
export function agreement(pairs: { human: boolean; judge: boolean }[]) {
  const n = pairs.length;
  if (!n) return { n, agree: 0, kappa: 0, failRecall: 0, passRecall: 0 };
  const agree = pairs.filter((p) => p.human === p.judge).length / n;
  const ph = pairs.filter((p) => p.human).length / n, pj = pairs.filter((p) => p.judge).length / n;
  const pe = ph * pj + (1 - ph) * (1 - pj);
  const kappa = pe === 1 ? 1 : (agree - pe) / (1 - pe);
  const fails = pairs.filter((p) => !p.human), passes = pairs.filter((p) => p.human);
  return { n, agree, kappa, failRecall: fails.length ? fails.filter((p) => !p.judge).length / fails.length : NaN, passRecall: passes.length ? passes.filter((p) => p.judge).length / passes.length : NaN };
}
