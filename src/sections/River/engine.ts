import { area, line, curveBasis } from 'd3-shape';
import { STREAM } from '../../lib/streams';
import { cssVar, type Theme } from '../../lib/theme';
import { ORDER, bandAt, streamAt, uToYear, yearToU, type Geometry, type Spot } from './geometry';

/**
 * The imperative heart of the River: paints the streams (watercolour on paper, light on ink),
 * runs thousands of drifting particles and word glints at 60fps, and handles pointer/scroll
 * interaction. React owns the DOM overlays; this class only pokes a few of them for speed.
 */

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const parseColor = (c: string, fallback: RGB): RGB => {
  if (c.startsWith('#')) return hex(c);
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[ ,/]+/).map(Number);
    return [p[0], p[1], p[2]];
  }
  return fallback;
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface CursorSnap { u: number; year: number; bucket: number }
export interface EngineHandlers {
  hover: (s: Spot | null) => void;
  stream: (k: number) => void;
  tapStream: (k: number) => void;
  open: (s: Spot) => void;
  front: (u: number, playing: boolean) => void;
  playEnd: () => void;
}

const REVEAL_MS = 3400;
const PLAY_MS = 17000;

interface StreamPaths {
  band: Path2D;
  core: Path2D;
  edgeLo: Path2D;
  edgeHi: Path2D;
  /** Thickness fade per gradient stop (offset 0–1). */
  thStops: [number, number][];
  wash: [number, number][];
}

export class RiverEngine {
  // DOM
  private stage: HTMLElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private veils: HTMLCanvasElement[] = [];
  private veilIdx = 0;
  private veilKey = '';
  private focusKs: number[] = [];
  private focusStrength = 1;
  private veilDirty = true;
  private gctx: CanvasRenderingContext2D | null = null;
  private base: HTMLCanvasElement | null = null;
  private mottle: HTMLCanvasElement | null = null;
  private grain: CanvasPattern | null = null;
  private fx: HTMLCanvasElement | null = null;
  private bctx: CanvasRenderingContext2D | null = null;
  private fctx: CanvasRenderingContext2D | null = null;
  hair: HTMLElement | null = null;
  hairYear: HTMLElement | null = null;
  readout: HTMLElement | null = null;
  bigYear: HTMLElement | null = null;

  // data
  private geo: Geometry | null = null;
  private spots: Spot[] = [];
  private paths: StreamPaths[] = [];
  private dpr = 1;
  private theme: Theme = 'light';
  private reduced = false;

  // emphasis per stream (current / target)
  private emph = new Float32Array(ORDER.length).fill(1);
  private emphT = new Float32Array(ORDER.length).fill(1);
  private baseDirty = true;

  // colours
  private col: RGB[] = [];
  private paper: RGB = [246, 243, 236];
  private ink: RGB = [22, 20, 15];

  // particles
  private N = 0;
  private pk = new Uint8Array(0);
  private pu = new Float32Array(0);
  private pf = new Float32Array(0);
  private psp = new Float32Array(0);
  private plife = new Float32Array(0);
  private pmax = new Float32Array(0);
  private pph = new Float32Array(0);
  private psz = new Float32Array(0);
  private pkind = new Uint8Array(0);
  private cdf = new Float64Array(0);
  private cdfTotal = 0;
  private rand = rng(1066);
  private buckets: Float32Array[] = [];
  private bucketN: Int32Array = new Int32Array(0);
  private palette: string[] = [];
  private sprites: HTMLCanvasElement[] = [];

  // animation state
  private raf = 0;
  private running = false;
  private visible = false;
  private time = 0;
  private last = 0;
  front = 0;
  private mode: 'wait' | 'reveal' | 'play' | 'idle' = 'wait';
  private modeStart = 0;
  private revealed = false;
  private tracked = new Map<Element, number>();
  private labelEls = new Map<string, HTMLElement>();
  private spotById = new Map<string, Spot>();

  // interaction
  private hoverSpot: Spot | null = null;
  private pointerU: number | null = null;
  private pointerInside = false;
  private streamK = -1;
  private cursor: CursorSnap | null = null;
  private cursorSubs = new Set<() => void>();
  private kbYear: number | null = null;
  handlers: EngineHandlers = { hover: () => {}, stream: () => {}, tapStream: () => {}, open: () => {}, front: () => {}, playEnd: () => {} };
  private io: IntersectionObserver | null = null;
  private cleanups: (() => void)[] = [];

  // ── setup ─────────────────────────────────────────────────────────────────────────
  attach(stage: HTMLElement, glow: HTMLCanvasElement, base: HTMLCanvasElement, veils: HTMLCanvasElement[], fx: HTMLCanvasElement, reduced: boolean) {
    this.stage = stage;
    this.veils = veils;
    this.glow = glow;
    this.gctx = glow.getContext('2d');
    this.base = base;
    this.fx = fx;
    this.bctx = base.getContext('2d');
    this.fctx = fx.getContext('2d');
    this.reduced = reduced;
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          this.visible = e.isIntersecting;
          if (e.isIntersecting && e.intersectionRatio > 0.18 && this.mode === 'wait') this.startReveal();
        }
        this.updateRunning();
      },
      { threshold: [0, 0.18, 0.4] },
    );
    this.io.observe(stage);
    const onVis = () => this.updateRunning();
    document.addEventListener('visibilitychange', onVis);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    const opts: AddEventListenerOptions = { passive: true };
    const pm = (e: PointerEvent) => this.onPointerMove(e);
    const pl = (e: PointerEvent) => this.onPointerLeave(e);
    const pu = (e: PointerEvent) => this.onPointerUp(e);
    const pd = (e: PointerEvent) => this.onPointerDown(e);
    stage.addEventListener('pointermove', pm, opts);
    stage.addEventListener('pointerleave', pl, opts);
    stage.addEventListener('pointerdown', pd, opts);
    stage.addEventListener('pointerup', pu, opts);
    this.cleanups.push(() => {
      stage.removeEventListener('pointermove', pm);
      stage.removeEventListener('pointerleave', pl);
      stage.removeEventListener('pointerdown', pd);
      stage.removeEventListener('pointerup', pu);
    });
    if (reduced) {
      this.mode = 'idle';
      this.revealed = true;
    }
    if (this.geo) {
      this.resizeCanvases();
      this.applyFront();
      this.baseDirty = true;
      this.kick();
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  setTheme(t: Theme) {
    this.theme = t;
    this.paper = parseColor(cssVar('--paper') || '#f6f3ec', [246, 243, 236]);
    this.ink = parseColor(cssVar('--ink') || '#16140f', [22, 20, 15]);
    this.col = ORDER.map((s) => hex(STREAM[s].color));
    this.buildPalette();
    this.mottle = null;
    this.baseDirty = true;
    this.kick();
  }

  setGeometry(g: Geometry, spots: Spot[]) {
    const first = !this.geo;
    this.geo = g;
    this.spots = spots;
    this.spotById = new Map(spots.map((s) => [s.word.id, s]));
    if (this.hoverSpot) this.hoverSpot = this.spotById.get(this.hoverSpot.word.id) ?? null;
    this.resizeCanvases();
    this.buildPaths();
    this.buildCdf();
    this.seedParticles();
    if (first && this.mode === 'wait') this.front = g.frame.u0;
    if (this.mode === 'idle' || this.revealed) this.front = g.frame.uEnd + 200;
    this.applyFront();
    this.baseDirty = true;
    this.kick();
  }

  /** Streams to emphasise (indices into ORDER); empty = all. */
  setFocus(ks: number[], strength = 0.15) {
    for (let k = 0; k < ORDER.length; k++) this.emphT[k] = ks.length === 0 || ks.includes(k) ? 1 : strength;
    if (this.reduced) this.emph.set(this.emphT);
    const key = ks.length ? `${[...ks].sort((a, b) => a - b).join(',')}:${strength}` : '';
    if (key !== this.veilKey) {
      this.veilKey = key;
      this.focusKs = [...ks];
      this.focusStrength = strength;
      this.veilDirty = true;
    }
    this.kick();
  }

  /** Register an overlay element that appears once the reveal front passes `u`. */
  track(el: Element, u: number) {
    this.tracked.set(el, u);
    el.classList.toggle('is-in', this.front >= u - 6);
    return () => { this.tracked.delete(el); };
  }

  registerLabel(id: string, el: HTMLElement) {
    this.labelEls.set(id, el);
    return () => { if (this.labelEls.get(id) === el) this.labelEls.delete(id); };
  }

  /** Hover a word programmatically (e.g. from its DOM label). */
  hoverWord(id: string | null) {
    const s = id ? this.spotById.get(id) ?? null : null;
    this.setHoverSpot(s);
  }

  subscribeCursor = (cb: () => void) => {
    this.cursorSubs.add(cb);
    return () => { this.cursorSubs.delete(cb); };
  };
  getCursor = () => this.cursor;

  // ── canvases & paths ──────────────────────────────────────────────────────────────
  private resizeCanvases() {
    const g = this.geo;
    if (!g || !this.base || !this.fx || !this.glow || this.veils.length < 2) return;
    const { w, h } = g.frame;
    // Very tall phone canvases get a lower ratio to stay within memory budgets.
    const area = w * h;
    const cap = area > 900_000 ? 2 : 2.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    for (const c of [this.base, this.fx, ...this.veils]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    // The halo layer is blurred by CSS anyway: half resolution is plenty.
    this.glow.width = Math.round(w / 2);
    this.glow.height = Math.round(h / 2);
    this.glow.style.width = `${w}px`;
    this.glow.style.height = `${h}px`;
    this.mottle = null;
    this.veilDirty = true;
  }

  /** Watercolour blooms (light) / shimmer (dark), painted once per size & theme. */
  private buildTextures() {
    const g = this.geo;
    if (!g) return;
    const { w, h } = g.frame;
    const dark = this.theme === 'dark';
    const m = document.createElement('canvas');
    m.width = Math.max(1, Math.round(w / 2));
    m.height = Math.max(1, Math.round(h / 2));
    const x = m.getContext('2d')!;
    if (g.frame.orient === 'v') x.setTransform(0, 0.5, 0.5, 0, 0, 0);
    else x.setTransform(0.5, 0, 0, 0.5, 0, 0);
    const r = rng(449);
    const u0 = g.frame.u0;
    const L = g.frame.uEnd - u0;
    const C = g.frame.c1 - g.frame.c0;
    const nBlob = Math.round((L * C) / 7000);
    const tint: RGB = dark ? [255, 248, 235] : this.paper;
    for (let i = 0; i < nBlob; i++) {
      const u = u0 + r() * L;
      const v = g.frame.c0 + r() * C;
      const rad = 16 + r() * 80;
      const a = dark ? 0.05 + r() * 0.08 : 0.1 + r() * 0.2;
      const gr = x.createRadialGradient(u, v, 0, u, v, rad);
      gr.addColorStop(0, rgba(tint, a));
      gr.addColorStop(0.6, rgba(tint, a * 0.45));
      gr.addColorStop(1, rgba(tint, 0));
      x.fillStyle = gr;
      x.fillRect(u - rad, v - rad, rad * 2, rad * 2);
    }
    this.mottle = m;
    // Pigment granulation: a speckle that lets the paper show through.
    const n = document.createElement('canvas');
    n.width = n.height = 128;
    const nx = n.getContext('2d')!;
    const img = nx.createImageData(128, 128);
    const rr = rng(1755);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rr();
      img.data[i + 3] = v > 0.55 ? Math.round(((v - 0.55) / 0.45) ** 2 * 255) : 0;
    }
    nx.putImageData(img, 0, 0);
    this.grain = this.bctx?.createPattern(n, 'repeat') ?? null;
  }

  /** Transform from flow coordinates (u along, v across) to device pixels. */
  private flowTransform(ctx: CanvasRenderingContext2D) {
    const d = this.dpr;
    if (this.geo?.frame.orient === 'v') ctx.setTransform(0, d, d, 0, 0, 0);
    else ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  private buildPaths() {
    const g = this.geo!;
    const idx: number[] = [];
    for (let i = 0; i < g.n; i += 2) idx.push(i);
    if (idx[idx.length - 1] !== g.n - 1) idx.push(g.n - 1);
    const uOf = (i: number) => g.start + i * g.step;
    const span = g.start + (g.n - 1) * g.step - g.start;
    this.paths = ORDER.map((_, k) => {
      const lo = g.lo[k];
      const hi = g.hi[k];
      const band = new Path2D();
      area<number>().x(uOf).y0((i) => hi[i]).y1((i) => lo[i]).curve(curveBasis).context(band as unknown as CanvasRenderingContext2D)(idx);
      const core = new Path2D();
      area<number>()
        .x(uOf)
        .y0((i) => lo[i] + (hi[i] - lo[i]) * 0.66)
        .y1((i) => lo[i] + (hi[i] - lo[i]) * 0.34)
        .curve(curveBasis)
        .context(core as unknown as CanvasRenderingContext2D)(idx);
      const edgeLo = new Path2D();
      line<number>().x(uOf).y((i) => lo[i]).curve(curveBasis).context(edgeLo as unknown as CanvasRenderingContext2D)(idx);
      const edgeHi = new Path2D();
      line<number>().x(uOf).y((i) => hi[i]).curve(curveBasis).context(edgeHi as unknown as CanvasRenderingContext2D)(idx);
      const thStops: [number, number][] = [];
      const every = Math.max(1, Math.round(12 / g.step));
      for (let i = 0; i < g.n; i += every) thStops.push([(uOf(i) - g.start) / span, smooth(0.4, 5, hi[i] - lo[i])]);
      const r = rng(97 + k * 131);
      const wash: [number, number][] = [];
      const nW = Math.max(6, Math.round(span / 70));
      for (let j = 0; j <= nW; j++) wash.push([j / nW, 0.5 + r() * 0.26]);
      return { band, core, edgeLo, edgeHi, thStops, wash };
    });
  }

  private grad(ctx: CanvasRenderingContext2D, stops: [number, number][], color: RGB, scale: number) {
    const g = this.geo!;
    const gr = ctx.createLinearGradient(g.start, 0, g.start + (g.n - 1) * g.step, 0);
    for (const [o, a] of stops) gr.addColorStop(Math.max(0, Math.min(1, o)), rgba(color, a * scale));
    return gr;
  }

  private renderBase() {
    const ctx = this.bctx;
    const gx = this.gctx;
    const g = this.geo;
    if (!ctx || !gx || !g || !this.base || !this.glow) return;
    if (!this.mottle) this.buildTextures();
    const dark = this.theme === 'dark';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    gx.setTransform(1, 0, 0, 1, 0, 0);
    gx.clearRect(0, 0, this.glow.width, this.glow.height);
    this.flowTransform(ctx);
    if (g.frame.orient === 'v') gx.setTransform(0, 0.5, 0.5, 0, 0, 0);
    else gx.setTransform(0.5, 0, 0, 0.5, 0, 0);

    for (let k = 0; k < ORDER.length; k++) {
      const p = this.paths[k];
      const e = 1;
      if (g.peakTh[k] < 0.3) continue;
      const c = this.col[k];
      if (!dark) {
        // Halo (blurred by CSS) → wash → pooled edges: watercolour on paper.
        gx.globalCompositeOperation = 'source-over';
        gx.fillStyle = rgba(c, 0.5 * e);
        gx.fill(p.band);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = this.grad(ctx, p.wash, c, 0.95 * e);
        ctx.fill(p.band);
        const edge = mix(c, this.ink, 0.35);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = this.grad(ctx, p.thStops, edge, 0.45 * e);
        ctx.stroke(p.edgeLo);
        ctx.stroke(p.edgeHi);
      } else {
        // Light on ink: a soft halo, a translucent body, a luminous core and lit rims.
        const lit = mix(c, [255, 255, 255], 0.18);
        const hot = mix(c, [255, 250, 240], 0.62);
        gx.globalCompositeOperation = 'lighter';
        gx.fillStyle = rgba(lit, 0.55 * e);
        gx.fill(p.band);
        gx.fillStyle = rgba(hot, 0.55 * e);
        gx.fill(p.core);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = this.grad(ctx, p.wash, lit, 0.72 * e);
        ctx.fill(p.band);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1;
        ctx.strokeStyle = this.grad(ctx, p.thStops, hot, 0.55 * e);
        ctx.stroke(p.edgeLo);
        ctx.stroke(p.edgeHi);
      }
    }

    // Blooms and granulation, only where there is paint.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.mottle) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.drawImage(this.mottle, 0, 0, this.base.width, this.base.height);
    }
    if (this.grain && !dark) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, this.base.width, this.base.height);
      ctx.globalAlpha = 1;
    }

    // Source and mouth: the river wells up from nothing and flows on past today.
    for (const [c2, t] of [[ctx, true], [gx, false]] as const) {
      if (t) this.flowTransform(c2);
      else if (g.frame.orient === 'v') c2.setTransform(0, 0.5, 0.5, 0, 0, 0);
      else c2.setTransform(0.5, 0, 0, 0.5, 0, 0);
      const u0 = g.frame.u0;
      const span = g.frame.uEnd - u0;
      c2.globalCompositeOperation = 'destination-in';
      const fade = c2.createLinearGradient(u0, 0, g.frame.uEnd, 0);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(Math.min(0.2, 46 / span), 'rgba(0,0,0,1)');
      fade.addColorStop(Math.max(0, Math.min(1, (g.frame.u1 - u0) / span)), 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      c2.fillStyle = fade;
      c2.fillRect(u0 - 10, -1000, span + 400, g.frame.c1 + 3000);
      c2.globalCompositeOperation = 'source-over';
    }
  }

  /** Focus: veil the streams that step back with the paper colour. Two canvases crossfade via
   *  CSS opacity, so a focus change costs one cheap solid render and the GPU does the rest. */
  private renderVeil() {
    const g = this.geo;
    if (!g || this.veils.length < 2) return;
    const prev = this.veils[this.veilIdx];
    if (!this.veilKey) {
      prev.style.opacity = '0';
      return;
    }
    const next = this.veils[1 - this.veilIdx];
    const ctx = next.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, next.width, next.height);
    this.flowTransform(ctx);
    ctx.fillStyle = rgba(this.paper, 1);
    ctx.strokeStyle = rgba(this.paper, 1);
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    for (let k = 0; k < ORDER.length; k++) {
      if (this.focusKs.includes(k) || g.peakTh[k] < 0.3) continue;
      ctx.fill(this.paths[k].band);
      ctx.stroke(this.paths[k].edgeLo);
      ctx.stroke(this.paths[k].edgeHi);
    }
    const max = this.theme === 'dark' ? 0.84 : 0.8;
    next.style.opacity = String(((1 - this.focusStrength) * max).toFixed(3));
    prev.style.opacity = '0';
    this.veilIdx = 1 - this.veilIdx;
  }

  // ── particles ─────────────────────────────────────────────────────────────────────
  private buildCdf() {
    const g = this.geo!;
    const S = ORDER.length;
    this.cdf = new Float64Array(S * g.n);
    let acc = 0;
    for (let k = 0; k < S; k++) {
      for (let i = 0; i < g.n; i++) {
        const th = g.hi[k][i] - g.lo[k][i];
        acc += th > 1.2 ? th : 0;
        this.cdf[k * g.n + i] = acc;
      }
    }
    this.cdfTotal = acc;
  }

  private seedParticles() {
    const g = this.geo!;
    const areaPx = this.cdfTotal * g.step;
    const isV = g.frame.orient === 'v';
    const target = Math.round(Math.min(isV ? 1800 : 2800, Math.max(500, areaPx / (isV ? 80 : 100))));
    this.N = target;
    this.pk = new Uint8Array(target);
    this.pu = new Float32Array(target);
    this.pf = new Float32Array(target);
    this.psp = new Float32Array(target);
    this.plife = new Float32Array(target);
    this.pmax = new Float32Array(target);
    this.pph = new Float32Array(target);
    this.psz = new Float32Array(target);
    this.pkind = new Uint8Array(target);
    for (let i = 0; i < target; i++) {
      this.spawn(i);
      this.plife[i] = this.rand() * this.pmax[i];
    }
  }

  private spawn(i: number) {
    const g = this.geo!;
    const r = this.rand;
    let x = r() * this.cdfTotal;
    let lo = 0;
    let hi = this.cdf.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.cdf[m] < x) lo = m + 1; else hi = m;
    }
    x = lo;
    const k = Math.floor(x / g.n);
    const s = x - k * g.n;
    this.pk[i] = k;
    this.pu[i] = g.start + (s + r()) * g.step;
    this.pf[i] = 0.06 + 0.88 * r();
    const L = g.frame.u1 - g.frame.u0;
    this.psp[i] = (14 + r() * 26) * Math.max(0.7, Math.min(1.5, L / 1200));
    this.plife[i] = 0;
    this.pmax[i] = 2.5 + r() * 6;
    this.pph[i] = r() * Math.PI * 2;
    const q = r();
    this.psz[i] = q < 0.9 ? 0 : 1;
    this.pkind[i] = r() < (this.theme === 'dark' ? 0.0 : 0.62) ? 0 : 1;
  }

  /** Palette slots: 0 = white glint, 1..S = stream tints. Buckets = slot × 4 alpha × 2 sizes. */
  private buildPalette() {
    const S = ORDER.length;
    const dark = this.theme === 'dark';
    this.palette = [];
    for (let ci = 0; ci <= S; ci++) {
      for (let a = 0; a < 4; a++) {
        const alpha = [0.22, 0.4, 0.6, 0.85][a];
        if (ci === 0) this.palette.push(rgba([255, 255, 255], Math.min(1, alpha * (dark ? 0.85 : 1.05))));
        else {
          const c = this.col[ci - 1] ?? [128, 128, 128];
          const tint = dark ? mix(c, [255, 252, 245], 0.6) : mix(c, this.ink, 0.5);
          this.palette.push(rgba(tint, alpha * (dark ? 0.9 : 0.42)));
        }
      }
    }
    const nb = (S + 1) * 4 * 2;
    if (this.buckets.length !== nb) this.buckets = Array.from({ length: nb }, () => new Float32Array(4 * 2048));
    this.bucketN = new Int32Array(nb);
    // Glint sprites per stream.
    this.sprites = ORDER.map((_, k) => {
      const c = this.col[k] ?? [128, 128, 128];
      const sz = 48;
      const cv = document.createElement('canvas');
      cv.width = cv.height = sz;
      const x = cv.getContext('2d')!;
      const gr = x.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      if (dark) {
        const t = mix(c, [255, 255, 255], 0.35);
        gr.addColorStop(0, rgba([255, 255, 255], 1));
        gr.addColorStop(0.12, rgba(mix(t, [255, 255, 255], 0.6), 0.95));
        gr.addColorStop(0.35, rgba(t, 0.35));
        gr.addColorStop(1, rgba(t, 0));
      } else {
        gr.addColorStop(0, rgba([255, 255, 255], 0.95));
        gr.addColorStop(0.3, rgba([255, 255, 255], 0.55));
        gr.addColorStop(1, rgba([255, 255, 255], 0));
      }
      x.fillStyle = gr;
      x.fillRect(0, 0, sz, sz);
      return cv;
    });
  }

  // ── loop ──────────────────────────────────────────────────────────────────────────
  private kick() {
    if (!this.running) {
      // One-off redraw when paused (theme change, resize, reduced motion).
      requestAnimationFrame(() => {
        if (this.running) return;
        this.step(performance.now(), true);
      });
    }
  }

  private updateRunning() {
    const should = this.visible && !document.hidden;
    if (should && !this.running) {
      this.running = true;
      this.last = performance.now();
      const loop = (t: number) => {
        if (!this.running) return;
        this.step(t, false);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    } else if (!should && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
  }

  private startReveal() {
    if (!this.geo) return;
    if (this.reduced) {
      this.mode = 'idle';
      this.revealed = true;
      this.front = this.geo.frame.uEnd + 200;
      this.applyFront();
      return;
    }
    this.mode = 'reveal';
    this.modeStart = performance.now();
    this.stage?.classList.add('is-revealing');
  }

  play() {
    if (!this.geo || this.reduced) return;
    this.mode = 'play';
    this.modeStart = performance.now();
    this.front = this.geo.frame.u0;
    this.stage?.classList.add('is-playing');
    this.stage?.classList.remove('is-revealing');
    this.applyFront();
    this.kick();
  }

  stop() {
    if (!this.geo) return;
    if (this.mode === 'play') {
      this.mode = 'idle';
      this.revealed = true;
      this.front = this.geo.frame.uEnd + 200;
      this.stage?.classList.remove('is-playing');
      this.applyFront();
      this.setCursorU(null);
      this.handlers.playEnd();
    }
  }

  get playing() { return this.mode === 'play'; }

  private applyFront() {
    const g = this.geo;
    const st = this.stage;
    if (!g || !st) return;
    const done = this.front >= g.frame.uEnd + 100;
    st.style.setProperty('--front', `${this.front.toFixed(1)}px`);
    st.classList.toggle('is-masked', !done);
    for (const [el, u] of this.tracked) el.classList.toggle('is-in', this.front >= u - 6);
  }

  private step(now: number, single: boolean) {
    const g = this.geo;
    if (!g) return;
    const dt = single ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    // Reveal / play front.
    if (this.mode === 'reveal') {
      const t = Math.min(1, (now - this.modeStart) / REVEAL_MS);
      this.front = g.frame.u0 - 20 + (g.frame.uEnd + 160 - g.frame.u0) * easeInOut(t * 0.92 + 0.08 * t * t);
      if (t >= 1) {
        this.mode = 'idle';
        this.revealed = true;
        this.front = g.frame.uEnd + 200;
        this.stage?.classList.remove('is-revealing');
      }
      this.applyFront();
    } else if (this.mode === 'play') {
      const t = Math.min(1, (now - this.modeStart) / PLAY_MS);
      this.front = g.frame.u0 + (g.frame.u1 - g.frame.u0) * t;
      this.applyFront();
      this.setCursorU(this.front);
      if (this.bigYear) this.bigYear.textContent = String(Math.round(uToYear(g.frame, this.front) / 5) * 5);
      this.handlers.front(this.front, true);
      if (t >= 1) {
        this.mode = 'idle';
        this.revealed = true;
        this.stage?.classList.remove('is-playing');
        this.front = g.frame.uEnd + 200;
        this.applyFront();
        this.setCursorU(null);
        this.handlers.playEnd();
      }
    } else if (g.frame.orient === 'v' && !this.pointerInside && this.stage && this.kbYear === null) {
      // Phones: the time cursor rides a lens in the middle of the viewport as you scroll.
      const r = this.stage.getBoundingClientRect();
      const u = window.innerHeight * 0.5 - r.top;
      this.setCursorU(u >= g.frame.u0 && u <= g.frame.u1 ? u : null);
    }

    // Ease emphasis toward its target.
    let moving = false;
    const kE = single ? 1 : 1 - Math.exp(-dt * 11);
    for (let k = 0; k < ORDER.length; k++) {
      const dE = this.emphT[k] - this.emph[k];
      if (Math.abs(dE) > 0.002) { this.emph[k] += dE * kE; moving = true; }
      else if (dE !== 0) { this.emph[k] = this.emphT[k]; moving = true; }
    }
    void moving;
    if (this.baseDirty) {
      this.baseDirty = false;
      this.renderBase();
      this.veilDirty = true;
    }
    if (this.veilDirty) {
      this.veilDirty = false;
      this.renderVeil();
    }

    this.drawFx(dt);
  }

  private drawFx(dt: number) {
    const ctx = this.fctx;
    const g = this.geo!;
    if (!ctx || !this.fx) return;
    const isV = g.frame.orient === 'v';
    const d = this.dpr;
    const dark = this.theme === 'dark';
    const animate = !this.reduced;

    // Visible window along the flow axis (phones scroll a tall canvas; only paint what's seen).
    let w0 = g.start - 20;
    let w1 = g.frame.uEnd + 20;
    if (isV && this.stage) {
      const r = this.stage.getBoundingClientRect();
      w0 = Math.max(w0, -r.top - 160);
      w1 = Math.min(w1, -r.top + window.innerHeight + 160);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (isV) ctx.clearRect(0, Math.max(0, w0 * d), this.fx.width, Math.max(0, (w1 - w0) * d));
    else ctx.clearRect(0, 0, this.fx.width, this.fx.height);
    this.flowTransform(ctx);

    // Particles.
    const S = ORDER.length;
    this.bucketN.fill(0);
    const N = this.N;
    const t = this.time;
    const front = this.front;
    for (let i = 0; i < N; i++) {
      const k = this.pk[i];
      let u = this.pu[i];
      let f = this.pf[i];
      const prof = 0.4 + 0.9 * (1 - (2 * f - 1) * (2 * f - 1));
      if (animate && dt > 0) {
        u += this.psp[i] * prof * dt;
        f += Math.sin(t * 0.7 + this.pph[i]) * 0.035 * dt;
        f = f < 0.03 ? 0.03 : f > 0.97 ? 0.97 : f;
        this.pu[i] = u;
        this.pf[i] = f;
        this.plife[i] += dt;
        if (this.plife[i] > this.pmax[i] || u > g.frame.uEnd) { this.spawn(i); continue; }
      }
      if (u < w0 || u > w1 || u > front) continue;
      const [lo, hi] = bandAt(g, k, u);
      const th = hi - lo;
      if (th < 0.8) continue;
      const life = this.plife[i];
      const lf = Math.min(1, life / 0.9, (this.pmax[i] - life) / 0.9);
      const twinkle = animate ? 0.62 + 0.38 * Math.sin(t * 2.6 + this.pph[i] * 7) : 0.85;
      const a = lf * twinkle * smooth(0.8, 6, th) * (0.25 + 0.75 * this.emph[k]) * (front < g.frame.uEnd ? smooth(0, 60, front - u) : 1);
      if (a <= 0.05) continue;
      const v = lo + th * f;
      const big = this.psz[i];
      const len = animate ? this.psp[i] * prof * (big ? 0.12 : 0.07) : 0.5;
      // The streams curve gently: reuse the local slope instead of a second lookup.
      const [lo2, hi2] = bandAt(g, k, u - 6);
      const v2 = v + ((lo2 + (hi2 - lo2) * f) - v) * (len / 6);
      const slot = this.pkind[i] === 0 ? 0 : k + 1;
      const ab = a > 0.8 ? 3 : a > 0.55 ? 2 : a > 0.3 ? 1 : 0;
      const b = (slot * 4 + ab) * 2 + big;
      const arr = this.buckets[b];
      const n = this.bucketN[b];
      if (n * 4 + 4 > arr.length) continue;
      arr[n * 4] = u - len;
      arr[n * 4 + 1] = v2;
      arr[n * 4 + 2] = u;
      arr[n * 4 + 3] = v;
      this.bucketN[b] = n + 1;
    }
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (let b = 0; b < this.buckets.length; b++) {
      const n = this.bucketN[b];
      if (!n) continue;
      const slot = (b >> 1) >> 2;
      const ab = (b >> 1) & 3;
      const big = b & 1;
      const arr = this.buckets[b];
      ctx.strokeStyle = this.palette[slot * 4 + ab];
      ctx.lineWidth = big ? 1.9 : slot === 0 ? 1.1 : 0.9;
      if (!dark && slot > 0) ctx.globalCompositeOperation = 'multiply';
      else ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        ctx.moveTo(arr[j * 4], arr[j * 4 + 1]);
        ctx.lineTo(arr[j * 4 + 2], arr[j * 4 + 3]);
      }
      ctx.stroke();
    }
    void S;

    // Word glints.
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const hov = this.hoverSpot;
    for (const s of this.spots) {
      if (s.u > front || s.u < w0 || s.u > w1) continue;
      const bob = this.bob(s);
      const u = s.u + bob[0];
      const v = s.v + bob[1];
      const e = 0.25 + 0.75 * this.emph[s.k];
      const isH = hov === s;
      const tw = animate ? 0.75 + 0.25 * Math.sin(t * 2.1 + s.phase * 3) : 1;
      const spr = this.sprites[s.k];
      const R = (isH ? 22 : 10) * (dark ? 1 : 0.9);
      ctx.globalAlpha = e * tw * (front < g.frame.uEnd ? smooth(0, 40, front - s.u) : 1);
      ctx.drawImage(spr, u - R, v - R, R * 2, R * 2);
      ctx.globalAlpha = e;
      // A crisp bead at the centre; labelled words get a firmer ring.
      const c = this.col[s.k];
      const lab = this.labelEls.has(s.word.id);
      ctx.beginPath();
      ctx.arc(u, v, isH ? 4.4 : lab ? 2.6 : 1.9, 0, Math.PI * 2);
      if (dark) {
        ctx.fillStyle = rgba(mix(c, [255, 255, 255], 0.75), lab || isH ? 1 : 0.85);
        ctx.fill();
      } else {
        ctx.fillStyle = '#fffdf8';
        ctx.fill();
        ctx.lineWidth = isH ? 1.6 : lab ? 1.15 : 0.9;
        ctx.strokeStyle = rgba(mix(c, this.ink, 0.5), lab || isH ? 0.9 : 0.55);
        ctx.stroke();
      }
      if (isH && animate) {
        const ph = (t * 1.2) % 1;
        ctx.beginPath();
        ctx.arc(u, v, 6 + ph * 14, 0, Math.PI * 2);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rgba(dark ? mix(c, [255, 255, 255], 0.5) : mix(c, this.ink, 0.3), 0.6 * (1 - ph));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Labels bob with their glints.
    if (animate) {
      for (const [id, el] of this.labelEls) {
        const s = this.spotById.get(id);
        if (!s) continue;
        const [bu, bv] = this.bob(s);
        const [x, y] = isV ? [bv, bu] : [bu, bv];
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }
    }
  }

  private bob(s: Spot): [number, number] {
    if (this.reduced) return [0, 0];
    const t = this.time;
    return [Math.sin(t * 0.8 + s.phase) * 2.2, Math.sin(t * 1.25 + s.phase * 1.7) * 1.6];
  }

  // ── interaction ───────────────────────────────────────────────────────────────────
  private local(e: PointerEvent): [number, number] | null {
    if (!this.stage || !this.geo) return null;
    const r = this.stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return this.geo.frame.orient === 'v' ? [y, x] : [x, y];
  }

  private nearest(u: number, v: number, radius: number): Spot | null {
    let best: Spot | null = null;
    let bd = radius * radius;
    for (const s of this.spots) {
      if (s.u > this.front) continue;
      const du = s.u - u;
      const dv = s.v - v;
      const d2 = du * du + dv * dv;
      if (d2 < bd) { bd = d2; best = s; }
    }
    return best;
  }

  private setHoverSpot(s: Spot | null) {
    if (s === this.hoverSpot) return;
    this.hoverSpot = s;
    this.handlers.hover(s);
    if (this.stage) this.stage.style.cursor = s ? 'pointer' : '';
    this.kick();
  }

  private setStream(k: number) {
    if (k === this.streamK) return;
    this.streamK = k;
    this.handlers.stream(k);
  }

  setCursorU(u: number | null) {
    const g = this.geo;
    if (!g) return;
    if (u === null || u < g.frame.u0 - 1 || u > g.frame.u1 + 1) {
      if (this.cursor !== null) {
        this.cursor = null;
        this.cursorSubs.forEach((c) => c());
      }
      this.hair?.classList.remove('is-on');
      this.readout?.classList.remove('is-on');
      return;
    }
    const year = uToYear(g.frame, u);
    const isV = g.frame.orient === 'v';
    if (this.hair) {
      this.hair.classList.add('is-on');
      this.hair.style.transform = isV ? `translate3d(0, ${u.toFixed(1)}px, 0)` : `translate3d(${u.toFixed(1)}px, 0, 0)`;
    }
    if (this.hairYear) this.hairYear.textContent = String(Math.round(year / 5) * 5);
    if (this.readout && !isV) {
      const w = this.readout.offsetWidth || 220;
      const right = u + 18 + w < g.frame.w - 12;
      const x = right ? u + 18 : u - 18 - w;
      this.readout.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      this.readout.classList.add('is-on');
    } else if (this.readout) this.readout.classList.add('is-on');
    const bucket = Math.round(year / 5);
    if (!this.cursor || this.cursor.bucket !== bucket) {
      this.cursor = { u, year, bucket };
      this.cursorSubs.forEach((c) => c());
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const p = this.local(e);
    const g = this.geo;
    if (!p || !g) return;
    this.pointerInside = true;
    this.kbYear = null;
    const [u, v] = p;
    this.pointerU = u;
    const overLabel = (e.target as Element | null)?.closest?.('[data-river-label]');
    const overUi = (e.target as Element | null)?.closest?.('[data-river-ui]');
    if (overUi) {
      this.setHoverSpot(null);
      if (this.mode !== 'play') this.setCursorU(null);
      this.setStream(-1);
      return;
    }
    if (!overLabel) this.setHoverSpot(this.nearest(u, v, 16));
    if (this.mode !== 'play') this.setCursorU(u);
    const k = streamAt(g, u, v);
    this.setStream(u <= this.front ? k : -1);
  }

  private onPointerLeave(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    this.pointerInside = false;
    this.pointerU = null;
    this.setHoverSpot(null);
    if (this.mode !== 'play') this.setCursorU(null);
    this.setStream(-1);
  }

  private downAt: [number, number, number] | null = null;
  private onPointerDown(e: PointerEvent) {
    this.downAt = [e.clientX, e.clientY, performance.now()];
  }

  private onPointerUp(e: PointerEvent) {
    const start = this.downAt;
    this.downAt = null;
    if (!start || !this.geo) return;
    if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) return;
    const target = e.target as Element | null;
    if (target?.closest?.('a, button, [data-river-ui]')) return;
    const p = this.local(e);
    if (!p) return;
    const [u, v] = p;
    const touch = e.pointerType !== 'mouse';
    const s = this.nearest(u, v, touch ? 26 : 16);
    if (s) {
      if (!touch || this.hoverSpot === s) this.handlers.open(s);
      else this.setHoverSpot(s);
      return;
    }
    if (touch) {
      this.setHoverSpot(null);
      if (this.geo.frame.orient === 'h' && this.mode !== 'play') this.setCursorU(u);
    }
    const k = u <= this.front ? streamAt(this.geo, u, v) : -1;
    this.handlers.tapStream(k);
  }

  /** Keyboard scrubbing (arrow keys on the focused stage). */
  nudge(dir: number) {
    const g = this.geo;
    if (!g) return;
    const cur = this.kbYear ?? (this.cursor ? this.cursor.year : g.frame.y0 + 60);
    const next = Math.max(g.frame.y0 + 10, Math.min(g.frame.y1, Math.round((cur + dir * 25) / 25) * 25));
    this.kbYear = next;
    this.setCursorU(yearToU(g.frame, next));
  }

  clearKeyboard() {
    this.kbYear = null;
    if (!this.pointerInside) this.setCursorU(null);
  }

  get pointerFlowU() { return this.pointerU; }
}
