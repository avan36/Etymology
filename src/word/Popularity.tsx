import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { area, curveMonotoneX, line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { formatYear } from '../data';
import type { SheetWord } from './model';

// ── Datamuse: occurrences per million words (Google Books Ngram) ───────────────

const freqCache = new Map<string, Promise<number | null>>();

export function fetchFrequency(word: string): Promise<number | null> {
  const key = word.toLowerCase();
  let p = freqCache.get(key);
  if (!p) {
    const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(key)}&md=f&max=1`;
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const hit = Array.isArray(j) ? (j[0] as { word?: string; tags?: string[] } | undefined) : undefined;
        if (!hit || hit.word?.toLowerCase() !== key) return null;
        const tag = hit.tags?.find((t) => t.startsWith('f:'));
        const f = tag ? Number(tag.slice(2)) : NaN;
        return Number.isFinite(f) && f > 0 ? f : null;
      })
      .catch(() => null);
    freqCache.set(key, p);
  }
  return p;
}

/** Datamuse only knows English, so other languages get no "today" figure. */
function useFrequency(word: string, english: boolean): number | null | undefined {
  const [f, setF] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setF(undefined);
    if (english) fetchFrequency(word).then((v) => live && setF(v));
    else setF(null);
    return () => {
      live = false;
    };
  }, [word, english]);
  return f;
}

const fmtF = (f: number) => (f >= 100 ? Math.round(f).toLocaleString('en-US') : f >= 10 ? f.toFixed(0) : f >= 1 ? f.toFixed(1) : f >= 0.1 ? f.toFixed(2) : f.toPrecision(1));

function oneIn(f: number): string {
  const n = 1e6 / f;
  if (n < 1000) return Math.round(n).toLocaleString('en-US');
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return (Math.round(n / mag) * mag).toLocaleString('en-US');
}

const BANDS: [number, string][] = [
  [1000, 'one of the commonest words in English'],
  [100, 'an everyday word'],
  [10, 'a common word'],
  [1, 'a familiar word'],
  [0.1, 'an uncommon word'],
  [0, 'a rare word'],
];
const band = (f: number) => BANDS.find(([min]) => f >= min)![1];

// ── usage chart ────────────────────────────────────────────────────────────────

function niceStep(range: number): number {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (range / s <= 7) return s;
  return 2000;
}

function UsageChart({ sw }: { sw: SheetWord }) {
  const usage = sw.usage!;
  const reduce = !!useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const inView = useInView(wrap, { once: true, amount: 0.4 });
  const gid = useMemo(() => `ws-u-${Math.random().toString(36).slice(2, 8)}`, []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const H = w < 520 ? 190 : 230;
  const M = { t: 26, r: 10, b: 30, l: 10 };
  const x0 = usage[0][0];
  const x1 = Math.max(usage[usage.length - 1][0], x0 + 10);
  const x = scaleLinear().domain([x0, x1]).range([M.l, Math.max(M.l + 10, w - M.r)]);
  const y = scaleLinear().domain([0, 100]).range([H - M.b, M.t]);
  const areaD = area<[number, number]>().x((d) => x(d[0])).y0(H - M.b).y1((d) => y(d[1])).curve(curveMonotoneX)(usage) ?? '';
  const lineD = line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1])).curve(curveMonotoneX)(usage) ?? '';

  const step = niceStep(x1 - x0);
  const ticks: number[] = [];
  for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) ticks.push(t);
  const peak = usage.reduce((a, b) => (b[1] > a[1] ? b : a));
  const valAt = (yr: number) => {
    for (let i = 1; i < usage.length; i++) {
      if (yr <= usage[i][0]) {
        const [a0, b0] = usage[i - 1];
        const [a1, b1] = usage[i];
        return b0 + ((b1 - b0) * (yr - a0)) / (a1 - a0 || 1);
      }
    }
    return usage[usage.length - 1][1];
  };
  // Snap the hover readout to the curve as drawn (the path element), not the straight-line interpolation.
  const pathRef = useRef<SVGPathElement>(null);
  const hy = (() => {
    if (hover === null) return 0;
    const p = pathRef.current;
    const hx = x(hover);
    if (p && p.getTotalLength) {
      let lo = 0;
      let hi = p.getTotalLength();
      for (let it = 0; it < 22; it++) {
        const mid = (lo + hi) / 2;
        if (p.getPointAtLength(mid).x < hx) lo = mid;
        else hi = mid;
      }
      return p.getPointAtLength(lo).y;
    }
    return y(valAt(hover));
  })();
  const hv = hover === null ? 0 : Math.round(y.invert(hy));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const yr = Math.round(x.invert(e.clientX - r.left + M.l));
    setHover(Math.max(x0, Math.min(x1, yr)));
  };

  return (
    <div className="ws-usage" ref={wrap}>
      {w > 0 && (
        <svg width={w} height={H} className="ws-usage__svg" role="img" aria-label={`Estimated relative usage from ${formatYear(x0)} to ${formatYear(x1)}, peaking around ${formatYear(peak[0])}`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--c)" stopOpacity="0.42" />
              <stop offset="0.7" stopColor="var(--c)" stopOpacity="0.08" />
              <stop offset="1" stopColor="var(--c)" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`${gid}-clip`}>
              <motion.rect
                x={0}
                y={0}
                height={H}
                initial={reduce ? false : { width: 0 }}
                animate={inView ? { width: w } : undefined}
                width={reduce ? w : undefined}
                transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1], delay: 0.1 }}
              />
            </clipPath>
          </defs>
          {[25, 50, 75, 100].map((v) => (
            <line key={v} x1={M.l} x2={w - M.r} y1={y(v)} y2={y(v)} className="ws-usage__grid" />
          ))}
          <line x1={M.l} x2={w - M.r} y1={H - M.b} y2={H - M.b} className="ws-usage__base" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={H - M.b} y2={H - M.b + 5} className="ws-usage__tick" />
              <text x={x(t)} y={H - M.b + 19} textAnchor="middle" className="ws-usage__label">
                {formatYear(t)}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${gid}-clip)`}>
            <path d={areaD} fill={`url(#${gid})`} />
            <path ref={pathRef} d={lineD} className="ws-usage__line" />
            {sw.status !== 'living' && sw.died !== undefined && sw.died >= x0 && sw.died <= x1 && (
              <g className="ws-usage__died">
                <line x1={x(sw.died)} x2={x(sw.died)} y1={M.t} y2={H - M.b} />
                <text x={x(sw.died) + 6} y={M.t + 10}>† c. {formatYear(sw.died)}</text>
              </g>
            )}
          </g>
          <motion.g initial={reduce ? false : { opacity: 0 }} animate={inView ? { opacity: hover === null ? 1 : 0 } : undefined} transition={{ delay: hover === null ? (reduce ? 0 : 1.5) : 0, duration: 0.3 }}>
            <circle cx={x(peak[0])} cy={y(peak[1])} r={4} className="ws-usage__peak" />
            <text x={Math.min(Math.max(x(peak[0]), M.l + 40), w - M.r - 40)} y={y(peak[1]) - 11} textAnchor="middle" className="ws-usage__peaklabel">
              Peak · {formatYear(peak[0])}
            </text>
          </motion.g>
          {hover !== null && (
            <g className="ws-usage__hover" pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={M.t - 6} y2={H - M.b} />
              <circle cx={x(hover)} cy={hy} r={5} />
              <g transform={`translate(${Math.min(Math.max(x(hover), M.l + 48), w - M.r - 48)}, ${Math.max(14, M.t - 12)})`}>
                <rect x={-48} y={-13} width={96} height={22} rx={11} />
                <text textAnchor="middle" y={2}>
                  {formatYear(hover)} · {hv}%
                </text>
              </g>
            </g>
          )}
          <rect
            x={M.l}
            y={0}
            width={Math.max(0, w - M.l - M.r)}
            height={H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            style={{ touchAction: 'pan-y' }}
          />
        </svg>
      )}
      <p className="ws-usage__note">Estimated relative usage (shape, not exact counts) · 100% = the word’s own peak</p>
    </div>
  );
}

function Today({ f }: { f: number }) {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  // Log meter from 0.01 to 10,000 per million.
  const pos = Math.max(0, Math.min(1, (Math.log10(f) + 2) / 6));
  return (
    <div className="ws-today" ref={ref}>
      <p className="ws-today__eyebrow">
        <span className="ws-live-dot" /> Today
      </p>
      <p className="ws-today__num">
        <span className="ws-today__approx">≈</span>
        {fmtF(f)}
        <span className="ws-today__unit">per million words</span>
      </p>
      <p className="ws-today__desc">
        Roughly <strong>1 in every {oneIn(f)}</strong> words in print: {band(f)}.
      </p>
      <div className="ws-meter" aria-hidden>
        <div className="ws-meter__track" />
        <motion.div className="ws-meter__fill" initial={reduce ? false : { scaleX: 0 }} animate={inView ? { scaleX: pos } : undefined} style={reduce ? { scaleX: pos } : undefined} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} />
        <motion.span className="ws-meter__dot" initial={reduce ? false : { left: '0%' }} animate={inView ? { left: `${pos * 100}%` } : undefined} style={reduce ? { left: `${pos * 100}%` } : undefined} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} />
        <div className="ws-meter__labels">
          <span>rare</span>
          <span>common</span>
          <span>everyday</span>
        </div>
      </div>
      <p className="ws-today__src">Google Books Ngram frequency via Datamuse</p>
    </div>
  );
}

export function Popularity({ sw }: { sw: SheetWord }) {
  const f = useFrequency(sw.word, sw.lang === 'en');
  const hasUsage = !!sw.usage && sw.usage.length >= 2;
  if (!hasUsage && !f) return null;

  const title = (() => {
    if (!hasUsage) return <>How common is it <em>today</em>?</>;
    const u = sw.usage!;
    const peak = u.reduce((a, b) => (b[1] > a[1] ? b : a));
    const lastV = u[u.length - 1][1];
    if (sw.status !== 'living') return <>Faded by <em>{formatYear(sw.died ?? u[u.length - 1][0])}</em></>;
    if (lastV >= 92) return <>Still near its <em>peak</em></>;
    if (peak[0] < 1800 && lastV < 50) return <>A long, slow <em>decline</em></>;
    const span = u[u.length - 1][0] - u[0][0];
    return <>Most popular around <em>{formatYear(span > 150 ? Math.round(peak[0] / 10) * 10 : peak[0])}</em></>;
  })();

  return (
    <section className="ws-sec ws-pop-sec">
      <div className="ws-sec__head">
        <p className="ws-sec__eyebrow">Popularity</p>
        <h2 className="ws-sec__title">{title}</h2>
      </div>
      <div className={`ws-pop${hasUsage ? '' : ' is-solo'}${f ? '' : ' no-today'}`}>
        {hasUsage && <UsageChart sw={sw} />}
        {f ? <Today f={f} /> : null}
      </div>
    </section>
  );
}
