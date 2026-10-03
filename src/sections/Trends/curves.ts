import { data } from '../../data';
import type { Word } from '../../data';

/**
 * Smooth usage curves and the numbers derived from them (peaks, trends, time scale).
 * Shared by the Trends chart, the movers lists, the time machine, and the Lost chapter.
 */

type Pt = [number, number];

/** Monotone cubic (Fritsch–Carlson) through the points: smooth, and never overshoots 0–100. */
function monotone(pts: Pt[]): (x: number) => number {
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    const v = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    return Math.max(0, Math.min(100, v));
  };
}

export const hasUsage = (w: Word): boolean => (w.usage?.length ?? 0) >= 2;

const cache = new WeakMap<Word, (y: number) => number>();

/** Smoothed usage 0–100 at a year: 0 before the first point, holds the last value after it. */
export function usage(w: Word, year: number): number {
  const u = w.usage;
  if (!u?.length) return 0;
  if (year < u[0][0]) return 0;
  let f = cache.get(w);
  if (!f) cache.set(w, (f = monotone(u)));
  return f(year);
}

export const firstUsageYear = (w: Word) => w.usage?.[0]?.[0] ?? w.first;
export const lastUsageYear = (w: Word) => w.usage?.[w.usage.length - 1]?.[0] ?? w.first;

/** Year of the highest point of the curve (the first one, if it plateaus). */
export function peakYear(w: Word): number {
  const u = w.usage;
  if (!u?.length) return w.first;
  let best = u[0];
  for (const p of u) if (p[1] > best[1]) best = p;
  return best[0];
}

/** The "present" edge of every chart: 2020, or later if the data reaches further. */
let endMemo: { n: number; v: number } | undefined;
export function endYear(): number {
  if (endMemo && endMemo.n === data.words.length) return endMemo.v;
  let v = 2020;
  for (const w of data.words) if (w.usage?.length) v = Math.max(v, w.usage[w.usage.length - 1][0]);
  v = Math.min(v, new Date().getFullYear());
  endMemo = { n: data.words.length, v };
  return v;
}

/** Change in usage (points of the word's own peak) over the last `span` years. */
export function trend(w: Word, span = 100): number {
  const end = endYear();
  return usage(w, end) - usage(w, end - span);
}

export const isLost = (w: Word) => w.status === 'extinct' || w.status === 'archaic';

/* ── time scale ─────────────────────────────────────────────────── */

export interface TimeScale {
  (year: number): number;
  invert(px: number): number;
  d0: number;
  d1: number;
  r0: number;
  r1: number;
}

/**
 * Maps years to pixels. `k` blends a plain linear scale (0) with a logarithmic "time before
 * now" scale (1) that gives recent centuries more room — Old English stays legible while the
 * internet years don't collapse into a sliver.
 */
export function timeScale(d0: number, d1: number, r0: number, r1: number, k = 1): TimeScale {
  const C = d1 + 80;
  const L = (y: number) => -Math.log(C - y);
  const a = L(d0), b = L(d1);
  const t = (y: number) => {
    const lin = (y - d0) / (d1 - d0);
    if (k === 0) return lin;
    const lg = (L(Math.min(y, C - 1)) - a) / (b - a);
    return lin + (lg - lin) * k;
  };
  const s = ((y: number) => r0 + t(y) * (r1 - r0)) as TimeScale;
  s.invert = (px: number) => {
    const target = (px - r0) / (r1 - r0);
    let lo = d0 - (d1 - d0), hi = d1 + 60;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (t(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  Object.assign(s, { d0, d1, r0, r1 });
  return s;
}

/** Round, well-spaced tick years for a (possibly non-linear) scale. */
export function timeTicks(s: TimeScale, minGap: number): number[] {
  const span = s.d1 - s.d0;
  const steps = span > 500 ? [500, 100, 50] : span > 160 ? [100, 50] : span > 40 ? [50, 10] : [10, 5];
  // the domain's ends first (when they're round), then ever finer round years where there's room
  const out: number[] = [];
  const fits = (y: number) => out.every((o) => Math.abs(s(o) - s(y)) >= minGap);
  if (s.d0 % steps[steps.length - 1] === 0) out.push(s.d0);
  if (s.d1 % 10 === 0 && fits(s.d1)) out.push(s.d1);
  for (const step of steps) {
    for (let y = Math.ceil(s.d0 / step) * step; y <= s.d1; y += step) {
      if (!out.includes(y) && fits(y)) out.push(y);
    }
  }
  return out.sort((p, q) => p - q);
}

/** Era containing a year (by data.eras). */
export function eraAt(year: number) {
  return data.eras.find((e) => year >= e.start && year < e.end) ?? (year < (data.eras[0]?.start ?? 0) ? data.eras[0] : data.eras[data.eras.length - 1]);
}

/** Tiny SVG path for a sparkline of a word's curve over [d0, d1]. */
export function sparkPath(w: Word, width: number, height: number, d0: number, d1: number, k = 1, from?: number, to?: number): string {
  const s = timeScale(d0, d1, 0, width, k);
  const a = Math.max(from ?? d0, firstUsageYear(w));
  const b = Math.min(to ?? d1, d1);
  if (b <= a) return '';
  const steps = Math.max(8, Math.round(width / 2));
  let p = '';
  for (let i = 0; i <= steps; i++) {
    const y = a + ((b - a) * i) / steps;
    const px = s(y), py = height - 1 - (usage(w, y) / 100) * (height - 2);
    p += `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return p;
}
