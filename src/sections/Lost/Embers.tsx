import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { cssVar, prefersReducedMotion } from '../../lib/theme';

export type BurstFn = (rect: DOMRect, count?: number) => void;

interface Props {
  /** Words that drift through the dark as faint ghosts. */
  ghosts: string[];
  /** Filled with a function that releases a shower of embers from a screen rectangle. */
  burstRef: RefObject<BurstFn | null>;
  /** The element whose visibility starts/stops the animation (the section). */
  hostRef: RefObject<HTMLElement | null>;
}

interface P {
  x: number; y: number; vx: number; vy: number;
  r: number; a: number; ph: number; sp: number;
  warm: boolean; life: number; max: number; burst: boolean;
}
interface G { text: string; x: number; y: number; size: number; t: number; dur: number; vy: number }

/** Pre-rendered soft glow, tinted. Drawing sprites is far cheaper than per-particle gradients. */
function sprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, color);
  grd.addColorStop(0.4, color.replace(/rgb\(([^)]+)\)/, 'rgba($1,0.25)'));
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function hexToRgb(hex: string, fallback: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

/**
 * Embers and fireflies rising through the night of the Lost chapter, with the ghosts of lost
 * words drifting behind them. A sticky, viewport-sized canvas: cheap, and only runs on screen.
 */
export default function Embers({ ghosts, burstRef, hostRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostsRef = useRef(ghosts);
  ghostsRef.current = ghosts;

  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    const reduced = prefersReducedMotion();
    const warm = sprite(hexToRgb(cssVar('--s-native') || '#e3a008', 'rgb(227,160,8)'));
    const pale = sprite('rgb(255,236,200)');
    const cool = sprite('rgb(170,200,255)');
    let W = 0, H = 0, dpr = 1;
    let parts: P[] = [];
    let gs: G[] = [];
    let raf = 0;
    let running = false;
    let last = performance.now();
    let gi = Math.floor(Math.random() * 1000);

    const spawn = (y?: number): P => ({
      x: Math.random() * W,
      y: y ?? H + 10,
      vx: (Math.random() - 0.5) * 6,
      vy: -(6 + Math.random() * 22),
      r: 0.6 + Math.pow(Math.random(), 2.2) * 2.6,
      a: 0.25 + Math.random() * 0.6,
      ph: Math.random() * Math.PI * 2,
      sp: 0.6 + Math.random() * 2.4,
      warm: Math.random() < 0.82,
      life: reduced ? 2 : 0, max: Infinity, burst: false,
    });
    const nextGhost = (fresh = false): G => {
      const list = ghostsRef.current;
      const text = list.length ? list[gi++ % list.length] : '';
      const size = 18 + Math.pow(Math.random(), 1.8) * 46;
      return {
        text, size,
        // wide screens: haunt the margins, leaving the centred featured word alone
        x: W > 980 ? (Math.random() < 0.5 ? 0.04 + Math.random() * 0.17 : 0.79 + Math.random() * 0.17) * W : 0.1 * W + Math.random() * 0.8 * W,
        y: 0.1 * H + Math.random() * 0.85 * H,
        t: fresh ? Math.random() * 0.6 : 0,
        dur: 14 + Math.random() * 12,
        vy: -(2 + Math.random() * 4),
      };
    };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const n = Math.round(Math.min(110, Math.max(36, (W * H) / 15000)));
      parts = Array.from({ length: n }, () => spawn(Math.random() * H));
      gs = Array.from({ length: Math.min(W < 640 ? 2 : 6, Math.max(1, ghostsRef.current.length)) }, () => nextGhost(true));
      if (reduced || !running) draw(0);
    };

    // Keep embers and ghosts inside the night: fade them out where the band fades to paper.
    let bandTop = -Infinity, bandBottom = Infinity, fadeLen = 200, ghostCut = Infinity;
    const band = (y: number) => {
      const a = Math.min(1, Math.max(0, (y - bandTop) / (fadeLen * 0.5)));
      const b = Math.min(1, Math.max(0, (bandBottom - y) / (fadeLen * 0.5)));
      return a * a * b * b;
    };
    const draw = (dt: number) => {
      const host = hostRef.current;
      if (host) {
        const hr = host.getBoundingClientRect();
        const cr = cv.getBoundingClientRect();
        fadeLen = Math.min(300, Math.max(170, window.innerWidth * 0.2));
        bandTop = hr.top - cr.top + fadeLen * 0.85;
        bandBottom = hr.bottom - cr.top - fadeLen * 0.85;
        // Ghost words haunt the open sky around the featured word, not the dense collection below.
        const cut = host.querySelector('.lost-strip');
        ghostCut = cut ? cut.getBoundingClientRect().top - cr.top : Infinity;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const font = cssVar('--font-display') || 'Georgia, serif';
      // ghosts
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i];
        g.t += dt / g.dur;
        g.y += g.vy * dt;
        if (g.t >= 1) { gs[i] = nextGhost(); continue; }
        const cutFade = Math.min(1, Math.max(0, (ghostCut - g.y) / 160));
        const alpha = Math.sin(Math.PI * Math.min(1, Math.max(0, g.t))) * (reduced ? 0.045 : W < 640 ? 0.045 : 0.065) * band(g.y) * cutFade;
        if (alpha < 0.002) continue;
        ctx.font = `italic 300 ${g.size}px ${font}`;
        ctx.fillStyle = `rgba(244,239,228,${alpha.toFixed(3)})`;
        ctx.fillText(g.text, g.x, g.y);
      }
      // embers
      ctx.globalCompositeOperation = 'lighter';
      const t = performance.now() / 1000;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life += dt;
        p.x += (p.vx + Math.sin(t * 0.6 + p.ph) * 8) * dt;
        p.y += p.vy * dt;
        if (p.burst) { p.vx *= 0.97; p.vy = p.vy * 0.97 - 6 * dt; }
        const fade = p.burst ? Math.max(0, 1 - p.life / p.max) : Math.min(1, p.life / 2);
        if (p.y < -20 || p.x < -30 || p.x > W + 30 || (p.burst && p.life >= p.max)) {
          if (p.burst) { parts.splice(i--, 1); continue; }
          parts[i] = spawn();
          continue;
        }
        const flick = 0.55 + 0.45 * Math.sin(t * p.sp + p.ph);
        const a = p.a * flick * fade * band(p.y);
        if (a < 0.01) continue;
        const s = p.r * 9;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(p.burst ? pale : p.warm ? warm : cool, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    burstRef.current = (rect, count = 46) => {
      if (reduced) return;
      const cr = cv.getBoundingClientRect();
      for (let i = 0; i < count; i++) {
        const x = rect.left - cr.left + Math.random() * rect.width;
        const y = rect.top - cr.top + rect.height * (0.25 + Math.random() * 0.6);
        const ang = Math.random() * Math.PI * 2;
        const sp = 20 + Math.random() * 90;
        parts.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6 - 30,
          r: 0.5 + Math.random() * 1.8, a: 0.7 + Math.random() * 0.3,
          ph: Math.random() * 6.28, sp: 3 + Math.random() * 6, warm: true,
          life: 0, max: 1.2 + Math.random() * 1.6, burst: true,
        });
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { rootMargin: '100px' });
    if (hostRef.current) io.observe(hostRef.current);
    const vis = () => (document.hidden ? stop() : hostRef.current && hostRef.current.getBoundingClientRect().bottom > 0 && start());
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
      burstRef.current = null;
    };
  }, [burstRef, hostRef]);

  return <canvas ref={canvasRef} className="lost-embers" aria-hidden="true" />;
}
