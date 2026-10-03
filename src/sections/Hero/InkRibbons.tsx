/**
 * Soft ink ribbons in the stream colours drifting behind the hero: watercolour bleeding through
 * wet paper in the light theme (multiply), aurora curtains in the dark (screen). The stream of the
 * word's current stage swells and brightens, so the background breathes with the centrepiece.
 *
 * Drawn small (¼ resolution) on a canvas and softened with a CSS blur, so it costs very little.
 */
import { useEffect, useRef } from 'react';
import type { StreamId } from '../../data';
import { STREAMS } from '../../lib/streams';
import { prefersReducedMotion, useTheme } from '../../lib/theme';

interface Ribbon {
  stream: StreamId;
  base: number; // resting intensity (0 = only appears when its stream is active)
  y: number; // centre line, fraction of height
  slope: number;
  a1: number; k1: number; w1: number; p1: number;
  a2: number; k2: number; w2: number; p2: number;
  th: number; k3: number; w3: number; p3: number;
}

// Resting cast: the big contributors to English. The rest wait offstage until their stream speaks.
const RESTING: Partial<Record<StreamId, number>> = { native: 1, latin: 0.85, french: 0.85, norse: 0.7, greek: 0.65, english: 0.7, dutch: 0.45 };

function rand(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const RIBBONS: Ribbon[] = STREAMS.map((s, i) => {
  const r = rand(i * 7 + 3);
  const lane = (i * 0.618034) % 1; // golden-ratio spread of lanes
  return {
    stream: s.id,
    base: RESTING[s.id] ?? 0,
    y: 0.36 + lane * 0.42,
    slope: (r() - 0.5) * 0.5,
    a1: 0.05 + r() * 0.08, k1: 0.55 + r() * 0.9, w1: (0.05 + r() * 0.07) * (r() > 0.5 ? 1 : -1), p1: r() * 6.28,
    a2: 0.015 + r() * 0.03, k2: 1.6 + r() * 1.8, w2: 0.08 + r() * 0.1, p2: r() * 6.28,
    th: 0.07 + r() * 0.09, k3: 0.8 + r() * 1.4, w3: 0.06 + r() * 0.08, p3: r() * 6.28,
  };
});

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const COLORS = Object.fromEntries(STREAMS.map((s) => [s.id, hex(s.color)])) as Record<StreamId, [number, number, number]>;

const TAU = Math.PI * 2;
const SEG = 44;

export default function InkRibbons({ active }: { active?: StreamId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const activeRef = useRef(active);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    activeRef.current = active;
    kick.current();
  }, [active]);

  useEffect(() => {
    const cvs = ref.current;
    const ctx = cvs?.getContext('2d');
    if (!cvs || !ctx) return;
    const dark = theme === 'dark';
    const reduce = prefersReducedMotion();
    const SCALE = 0.25;
    let w = 2;
    let h = 2;
    const levels = RIBBONS.map((r) => r.base);
    const top = new Float32Array((SEG + 1) * 2);
    const bot = new Float32Array((SEG + 1) * 2);

    const resize = () => {
      const r = cvs.getBoundingClientRect();
      w = Math.max(2, Math.round(r.width * SCALE));
      h = Math.max(2, Math.round(r.height * SCALE));
      if (cvs.width !== w) cvs.width = w;
      if (cvs.height !== h) cvs.height = h;
    };

    const trace = (rb: Ribbon, level: number, t: number, widthK: number) => {
      let minY = Infinity;
      let maxY = -Infinity;
      const swell = (0.72 + 0.4 * level) * widthK;
      // Wave height and ribbon thickness scale with the narrower side, so phones get ribbons, not blobs.
      const unit = Math.min(h, Math.max(w * 0.62, h * 0.42));
      for (let i = 0; i <= SEG; i++) {
        const u = i / SEG;
        const x = (-0.08 + u * 1.16) * w;
        const yc = rb.y * h + (rb.slope * (u - 0.5) + rb.a1 * Math.sin(rb.k1 * u * TAU + rb.w1 * t + rb.p1) + rb.a2 * Math.sin(rb.k2 * u * TAU - rb.w2 * t + rb.p2)) * unit;
        const th = rb.th * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(rb.k3 * u * TAU + rb.w3 * t + rb.p3))) * unit * swell;
        top[i * 2] = x; top[i * 2 + 1] = yc - th / 2;
        bot[i * 2] = x; bot[i * 2 + 1] = yc + th / 2;
        if (yc - th / 2 < minY) minY = yc - th / 2;
        if (yc + th / 2 > maxY) maxY = yc + th / 2;
      }
      ctx.beginPath();
      ctx.moveTo(top[0], top[1]);
      for (let i = 1; i <= SEG; i++) ctx.lineTo(top[i * 2], top[i * 2 + 1]);
      for (let i = SEG; i >= 0; i--) ctx.lineTo(bot[i * 2], bot[i * 2 + 1]);
      ctx.closePath();
      return [minY, maxY] as const;
    };

    const drawRibbon = (rb: Ribbon, level: number, t: number) => {
      const [r, g, b] = COLORS[rb.stream];
      const a = Math.min(1.7, level);
      if (dark) {
        // Aurora: a wide glow, brightest along the lower edge, fading upward like a light curtain…
        const [y0, y1] = trace(rb, level, t, 1);
        const grad = ctx.createLinearGradient(0, y0, 0, y1);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.65, `rgba(${r},${g},${b},${0.22 * a})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},${0.08 * a})`);
        ctx.fillStyle = grad;
        ctx.fill();
        // …with a brighter filament running through it.
        trace(rb, level, t + 0.6, 0.22);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.28 * a})`;
        ctx.fill();
      } else {
        // Watercolour: a pale wash with pigment pooling at the edges, and a denser core.
        trace(rb, level, t, 1);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.09 * a})`;
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.13 * a})`;
        ctx.stroke();
        trace(rb, level, t + 0.6, 0.3);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.12 * a})`;
        ctx.fill();
      }
    };

    let raf = 0;
    let running = false;
    let visible = true;
    const t0 = performance.now() - 40_000 * Math.random();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
      let settling = false;
      for (let i = 0; i < RIBBONS.length; i++) {
        const rb = RIBBONS[i];
        const target = rb.base * (activeRef.current && activeRef.current !== rb.stream ? 0.8 : 1) + (activeRef.current === rb.stream ? 1.05 : 0);
        const d = target - levels[i];
        levels[i] += reduce ? d : d * 0.025;
        if (Math.abs(d) > 0.005) settling = true;
        if (levels[i] > 0.01) drawRibbon(rb, levels[i], reduce ? 12 : t);
      }
      if (!reduce && visible) raf = requestAnimationFrame(frame);
      else if (reduce && settling) raf = requestAnimationFrame(frame);
      else running = false;
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    kick.current = start;

    resize();
    const ro = new ResizeObserver(() => { resize(); start(); });
    ro.observe(cvs);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === 'visible';
      if (visible) start();
    });
    io.observe(cvs);
    const onVis = () => {
      visible = document.visibilityState === 'visible';
      if (visible) start();
    };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      running = false;
      kick.current = () => {};
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [theme]);

  return <canvas ref={ref} className="hero-ink__cvs" aria-hidden />;
}
