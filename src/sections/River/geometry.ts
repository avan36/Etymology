import type { Era, HistoryEvent, Influx, StreamId, Word } from '../../data/types';

/**
 * Pure geometry for the River of English. Everything is computed in "flow" coordinates:
 *   u — along the river (time), v — across it.
 * Horizontal layout maps (u, v) → (x, y); vertical (phones) maps (u, v) → (y, x).
 */

export type Orient = 'h' | 'v';

/** Stacking order, outer-bottom → outer-top. The English trunk (native + coined) sits in the
 *  middle so the river reads as one great current, with tributaries pouring in from both banks. */
export const ORDER: StreamId[] = [
  'world', 'asia', 'semitic', 'romance', 'greek', 'latin',
  'native', 'english',
  'norse', 'french', 'dutch', 'celtic', 'ancient',
];
const TRUNK = new Set<StreamId>(['native', 'english']);
const TRUNK_LO = ORDER.indexOf('native');
const TRUNK_HI = ORDER.indexOf('english');

export interface Frame {
  orient: Orient;
  /** Stage size in CSS px. */
  w: number;
  h: number;
  /** Flow range of the river. */
  u0: number;
  u1: number;
  /** Where the drawn river ends (a little past "today", so it flows on). */
  uEnd: number;
  /** Cross range of the river band. */
  c0: number;
  c1: number;
  /** Year domain. */
  y0: number;
  y1: number;
}

// ── time scale: gently stretched toward the present ──────────────────────────────
const BETA = 0.36;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export function yearToU(f: Frame, year: number): number {
  const t = clamp((year - f.y0) / (f.y1 - f.y0), 0, 1);
  const s = (1 - BETA) * t + BETA * t * t;
  return f.u0 + s * (f.u1 - f.u0);
}

export function uToYear(f: Frame, u: number): number {
  const s = clamp((u - f.u0) / (f.u1 - f.u0), 0, 1);
  const b = 1 - BETA;
  const t = (-b + Math.sqrt(b * b + 4 * BETA * s)) / (2 * BETA);
  return f.y0 + t * (f.y1 - f.y0);
}

// ── smooth interpolation of the binned influx (monotone cubic: no overshoot below zero) ──
function monotone(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => ys[0];
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
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
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] > x) hi = mid; else lo = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
}

/** A continuous, smoothed reading of the influx: value(stream, year). */
export interface Flow {
  streams: StreamId[];
  value: (s: StreamId, year: number) => number;
  /** Total of all streams at a year. */
  total: (year: number) => number;
  /** Share of all flow (integrated over the whole domain) for each stream, 0–1. */
  share: Record<StreamId, number>;
  /** Year at which each stream peaks. */
  peak: Record<StreamId, number>;
}

export function makeFlow(influx: Influx, y0: number, y1: number): Flow {
  const ys = influx.years ?? [];
  const centres = ys.map((y, i) => {
    const next = ys[i + 1] ?? (i > 0 ? y + (y - ys[i - 1]) : y + 50);
    return y + (next - y) / 2;
  });
  const fns = new Map<StreamId, (x: number) => number>();
  for (const s of ORDER) {
    const series = influx.series?.[s];
    if (!series || !series.length || series.every((v) => !v)) continue;
    fns.set(s, monotone(centres, ys.map((_, i) => Math.max(0, series[i] ?? 0))));
  }
  const streams = ORDER.filter((s) => fns.has(s));
  // A spring, not a wall: the river widens out of its source over the first decades.
  const spring = (year: number) => {
    const t = clamp((year - y0) / 70, 0, 1);
    return 0.22 + 0.78 * (t * t * (3 - 2 * t));
  };
  const value = (s: StreamId, year: number) => {
    const f = fns.get(s);
    return f ? Math.max(0, f(year)) * spring(year) : 0;
  };
  const total = (year: number) => streams.reduce((a, s) => a + value(s, year), 0);
  const share = {} as Record<StreamId, number>;
  const peak = {} as Record<StreamId, number>;
  const sums = new Map<StreamId, number>();
  let all = 0;
  for (const s of ORDER) { sums.set(s, 0); peak[s] = y0; }
  const best = new Map<StreamId, number>();
  for (let y = y0; y <= y1; y += 5) {
    for (const s of streams) {
      const v = value(s, y);
      sums.set(s, sums.get(s)! + v);
      all += v;
      if (v > (best.get(s) ?? -1)) { best.set(s, v); peak[s] = y; }
    }
  }
  for (const s of ORDER) share[s] = all ? sums.get(s)! / all : 0;
  return { streams, value, total, share, peak };
}

// ── the stacked river ───────────────────────────────────────────────────────────────
export interface Geometry {
  frame: Frame;
  flow: Flow;
  /** Number of samples along the flow axis. */
  n: number;
  /** Flow position of sample 0, and the step between samples. */
  start: number;
  step: number;
  /** For each stream in ORDER: lower/upper cross coordinate per sample (screen cross axis). */
  lo: Float32Array[];
  hi: Float32Array[];
  /** River envelope (min / max cross coordinate) per sample. */
  envLo: Float32Array;
  envHi: Float32Array;
  /** Peak sample index and thickness for each stream. */
  peakIdx: number[];
  peakTh: number[];
}

export function streamIndex(s: StreamId): number {
  return ORDER.indexOf(s);
}

export function buildGeometry(frame: Frame, flow: Flow): Geometry {
  const { u0, u1, c0, c1 } = frame;
  const step = 3;
  const n = Math.max(2, Math.ceil((Math.max(u1, frame.uEnd) - u0) / step) + 1);
  const S = ORDER.length;
  const vals: Float64Array[] = ORDER.map(() => new Float64Array(n));
  const base = new Float64Array(n);
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let i = 0; i < n; i++) {
    const u = u0 + i * step;
    const year = uToYear(frame, u);
    let B = 0;
    let T = 0;
    let A = 0;
    for (let k = 0; k < S; k++) {
      const v = flow.value(ORDER[k], year);
      vals[k][i] = v;
      if (TRUNK.has(ORDER[k])) T += v;
      else if (k < TRUNK_LO) B += v;
      else A += v;
    }
    // Trunk-centred stacking, blended halfway toward a symmetric silhouette, plus a slow
    // meander so the river breathes rather than running ruler-straight.
    const t = Math.min(1, (u - u0) / (u1 - u0));
    const meander = Math.sin(t * Math.PI * 2.2 + 0.4) * 6 + Math.sin(t * Math.PI * 5.1 + 1.3) * 2.2;
    const centre = 0.5 * (B - A) / 2 + meander;
    const bottom = centre - T / 2 - B;
    base[i] = bottom;
    const top = bottom + B + T + A;
    if (bottom < zMin) zMin = bottom;
    if (top > zMax) zMax = top;
  }
  void TRUNK_HI;

  const span = zMax - zMin || 1;
  const scale = (c1 - c0) / span;
  // z grows "upward"; on screen the cross axis grows downward (h) / rightward (v).
  const toCross = (z: number) => c1 - (z - zMin) * scale;

  const lo = ORDER.map(() => new Float32Array(n));
  const hi = ORDER.map(() => new Float32Array(n));
  const envLo = new Float32Array(n);
  const envHi = new Float32Array(n);
  const peakIdx = ORDER.map(() => 0);
  const peakTh = ORDER.map(() => 0);
  for (let i = 0; i < n; i++) {
    let z = base[i];
    envHi[i] = toCross(z);
    for (let k = 0; k < S; k++) {
      const a = toCross(z);
      z += vals[k][i];
      const b = toCross(z);
      // b < a on screen (upward). Store lo < hi.
      lo[k][i] = b;
      hi[k][i] = a;
      const th = a - b;
      if (th > peakTh[k]) { peakTh[k] = th; peakIdx[k] = i; }
    }
    envLo[i] = toCross(z);
  }
  return { frame, flow, n, start: u0, step, lo, hi, envLo, envHi, peakIdx, peakTh };
}

/** Cross coordinates (lo, hi) of stream k at flow position u (linear between samples). */
export function bandAt(g: Geometry, k: number, u: number): [number, number] {
  const x = (u - g.start) / g.step;
  const i = x < 0 ? 0 : x > g.n - 1 ? g.n - 1 : x;
  const i0 = Math.floor(i);
  const i1 = Math.min(g.n - 1, i0 + 1);
  const t = i - i0;
  const lo = g.lo[k][i0] + (g.lo[k][i1] - g.lo[k][i0]) * t;
  const hi = g.hi[k][i0] + (g.hi[k][i1] - g.hi[k][i0]) * t;
  return [lo, hi];
}

/** Which stream (index into ORDER) contains cross coordinate v at flow position u, or -1. */
export function streamAt(g: Geometry, u: number, v: number): number {
  if (u < g.frame.u0 - 2 || u > g.frame.uEnd + 2) return -1;
  for (let k = 0; k < ORDER.length; k++) {
    const [lo, hi] = bandAt(g, k, u);
    if (hi - lo > 0.5 && v >= lo - 1 && v <= hi + 1) return k;
  }
  return -1;
}

// ── words placed on the river ───────────────────────────────────────────────────────
export interface Spot {
  word: Word;
  k: number;
  stream: StreamId;
  year: number;
  u: number;
  v: number;
  /** Lateral fraction inside the stream band. */
  f: number;
  /** Phase for the gentle bob. */
  phase: number;
  /** Priority for labelling (higher = labelled first). */
  rank: number;
}

/** Small deterministic hash → [0, 1). */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function placeWords(g: Geometry, words: Word[], streamOf: (w: Word) => StreamId): Spot[] {
  const out: Spot[] = [];
  for (const w of words) {
    if (typeof w.first !== 'number' || !isFinite(w.first)) continue;
    const stream = streamOf(w);
    const k = ORDER.indexOf(stream);
    if (k < 0) continue;
    const year = clamp(w.first, g.frame.y0 + 8, g.frame.y1 - 4);
    const u = yearToU(g.frame, year);
    const [lo, hi] = bandAt(g, k, u);
    const th = hi - lo;
    const r = hash01(w.id, 7);
    const f = th > 14 ? 0.22 + 0.56 * r : 0.5;
    const v = lo + th * f;
    const rank = (w.featured ? 1000 : 0) + (w.story ? 10 : 0) + (12 - Math.min(12, w.word.length)) + hash01(w.id, 3) * 5;
    out.push({ word: w, k, stream, year, u, v, f, phase: hash01(w.id, 11) * Math.PI * 2, rank });
  }
  return out;
}

// ── label layout with collision avoidance ───────────────────────────────────────────
export interface Box { x: number; y: number; w: number; h: number }
export interface Label { spot: Spot; x: number; y: number; w: number; h: number; side: 'r' | 'l' | 't' | 'b' }

const overlaps = (a: Box, b: Box, pad = 3) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** Screen position of a flow point. */
export function toXY(f: Frame, u: number, v: number): [number, number] {
  return f.orient === 'h' ? [u, v] : [v, u];
}

export function layoutLabels(
  frame: Frame,
  spots: Spot[],
  measure: (text: string) => number,
  blockers: Box[],
  max: number,
  lineH = 16,
): Label[] {
  const placed: Box[] = [...blockers];
  const out: Label[] = [];
  const sorted = [...spots].sort((a, b) => b.rank - a.rank);
  // Dots themselves are mild blockers so a label never sits on top of another word's glint.
  const dotBoxes: Box[] = spots.map((s) => {
    const [x, y] = toXY(frame, s.u, s.v);
    return { x: x - 4, y: y - 4, w: 8, h: 8 };
  });
  for (const s of sorted) {
    if (out.length >= max) break;
    const [x, y] = toXY(frame, s.u, s.v);
    const w = measure(s.word.word) + 2;
    const h = lineH;
    const cands: [Label['side'], number, number][] = [
      ['r', x + 9, y - h / 2],
      ['l', x - 9 - w, y - h / 2],
      ['t', x - w / 2, y - 8 - h],
      ['b', x - w / 2, y + 8],
    ];
    for (const [side, bx, by] of cands) {
      const box = { x: bx, y: by, w, h };
      if (bx < 4 || by < 4 || bx + w > frame.w - 4 || by + h > frame.h - 4) continue;
      if (placed.some((p) => overlaps(box, p))) continue;
      if (dotBoxes.some((d, i) => spots[i] !== s && overlaps(box, d, 0))) continue;
      placed.push(box);
      out.push({ spot: s, x: bx, y: by, w, h, side });
      break;
    }
  }
  return out;
}

// ── axis furniture ──────────────────────────────────────────────────────────────────
export interface Tick { year: number; u: number; major: boolean }

export function makeTicks(f: Frame, minGap: number): Tick[] {
  const cands = [500, 600, 700, 800, 900, 1000, 1066, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000];
  const priority = [1000, 1500, 2000, 500, 1800, 1900, 1200, 1700, 1600, 1300, 1400, 1100, 800, 700, 900, 600];
  const chosen: Tick[] = [];
  for (const y of priority) {
    if (y < f.y0 || y > f.y1) continue;
    const u = yearToU(f, y);
    if (chosen.some((t) => Math.abs(t.u - u) < minGap)) continue;
    chosen.push({ year: y, u, major: y % 500 === 0 });
  }
  void cands;
  return chosen.sort((a, b) => a.u - b.u);
}

export interface EraBand { era: Era; a: number; b: number; i: number }
export function eraBands(f: Frame, eras: Era[]): EraBand[] {
  return [...eras]
    .sort((x, y) => x.start - y.start)
    .map((era, i) => ({ era, a: yearToU(f, Math.max(era.start, f.y0)), b: yearToU(f, Math.min(era.end, f.y1)), i }))
    .filter((e) => e.b > e.a + 1);
}

export interface Pin { ev: HistoryEvent; u: number; row: number; i: number; idx: number }
/** Event pins with a simple two-row stagger when they crowd. `i` = nearest geometry sample. */
export function makePins(g: Geometry, events: HistoryEvent[], minGap: number): Pin[] {
  const f = g.frame;
  const sorted = events
    .map((ev, idx) => ({ ev, idx }))
    .filter(({ ev }) => typeof ev.year === 'number')
    .sort((a, b) => a.ev.year - b.ev.year);
  const lastU = [-Infinity, -Infinity];
  const out: Pin[] = [];
  for (const { ev, idx } of sorted) {
    const u = clamp(yearToU(f, ev.year), f.u0, f.u1);
    let row = 0;
    if (u - lastU[0] < minGap) row = u - lastU[1] < minGap ? (lastU[0] < lastU[1] ? 0 : 1) : 1;
    lastU[row] = u;
    const i = clamp(Math.round((u - g.start) / g.step), 0, g.n - 1);
    out.push({ ev, u, row, i, idx });
  }
  return out;
}
