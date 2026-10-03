import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as RPointerEvent } from 'react';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import { data } from '../../data';
import type { Word } from '../../data';
import { href } from '../../lib/router';
import { prefersReducedMotion } from '../../lib/theme';
import { eraAt, firstUsageYear, lastUsageYear, peakYear, timeScale, timeTicks, usage } from './curves';
import type { TimeScale } from './curves';

export interface Series {
  w: Word;
  color: string;
  dash?: string;
}

interface Props {
  series: Series[];
  d0: number;
  d1: number;
  /** 0 = linear time, 1 = "recent zoom" logarithmic time. */
  k: number;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}

/** Animate a number towards a target (framer-motion tween; instant under reduced motion). */
export function useTween(target: number, duration = 0.9): number {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion() || cur.current === target) {
      cur.current = target;
      setV(target);
      return;
    }
    const c = animate(cur.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (x) => { cur.current = x; setV(x); },
    });
    return () => c.stop();
  }, [target, duration]);
  return v;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Sample a word's curve with roughly one point every 2px (step adapts to the non-linear scale). */
function curvePoints(w: Word, x: TimeScale, k: number, a: number, b: number): [number, number][] {
  const C = x.d1 + 80;
  const iw = x.r1 - x.r0;
  const la = Math.log(C - x.d0) - Math.log(C - x.d1);
  const pts: [number, number][] = [];
  let yr = a;
  for (let guard = 0; guard < 2000; guard++) {
    pts.push([x(yr), usage(w, yr)]);
    if (yr >= b) break;
    const dt = (1 - k) / (x.d1 - x.d0) + (k * (1 / (C - yr))) / la; // d(t)/d(year)
    yr = Math.min(b, yr + Math.max(0.05, 2 / (dt * iw)));
  }
  return pts;
}

const ERA_SHORT: Record<string, string> = { old: 'Old English', middle: 'Middle English', 'early-modern': 'Early Modern', modern: 'Modern', global: 'Global' };

export default function UsageChart({ series, d0: td0, d1, k: tk, focusId, onFocus }: Props) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const inView = useInView(wrapRef, { once: true, margin: '-15% 0px' });
  const uid = useId().replace(/:/g, '');
  const d0 = useTween(td0);
  const k = useTween(tk, 1.1);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState(false);

  const narrow = W < 640;
  const H = narrow ? 340 : Math.round(Math.min(520, Math.max(400, W * 0.42)));
  const m = { t: 46, r: narrow ? 82 : 132, b: 36, l: narrow ? 26 : 40 };
  const iw = Math.max(10, W - m.l - m.r);
  const ih = H - m.t - m.b;
  const x = useMemo(() => timeScale(d0, d1, m.l, m.l + iw, k), [d0, d1, m.l, iw, k]);
  const y = (v: number) => m.t + ih - (v / 100) * ih;

  // Fills get lighter as more curves overlap, so a crowded chart stays readable.
  const areaAlpha = [0.3, 0.3, 0.2, 0.14, 0.09, 0.07][Math.min(5, series.length)] ?? 0.06;
  const ticks = useMemo(() => timeTicks(x, narrow ? 46 : 64), [x, narrow]);
  const eras = data.eras.filter((e) => e.end > d0 && e.start < d1);
  const events = data.events.filter((e) => e.year >= d0 && e.year <= d1);

  const paths = useMemo(
    () =>
      series.map((s) => {
        const a = Math.max(firstUsageYear(s.w), x.d0);
        const b = Math.min(lastUsageYear(s.w), x.d1);
        if (b <= a) return { s, line: '', area: '', a, b };
        const pts = curvePoints(s.w, x, k, a, b);
        const line = pts.map(([px, v], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${y(v).toFixed(1)}`).join('');
        const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${y(0)}L${pts[0][0].toFixed(1)},${y(0)}Z`;
        return { s, line, area, a, b };
      }),
    [series, x, k, ih],
  );

  // Labels: living words at the right edge (stacked so they never collide); words that
  // faded out get their name above their peak instead.
  const labels = useMemo(() => {
    const edge: { s: Series; ty: number; y: number; ex: number; ey: number }[] = [];
    const peaks: { s: Series; x: number; y: number }[] = [];
    for (const p of paths) {
      if (!p.line) continue;
      const lv = usage(p.s.w, p.b);
      if (x(p.b) >= m.l + iw * 0.86) {
        edge.push({ s: p.s, ty: y(lv), y: y(lv), ex: x(p.b), ey: y(lv) });
      } else {
        const py = Math.max(x.d0, Math.min(x.d1, peakYear(p.s.w)));
        peaks.push({ s: p.s, x: x(py), y: Math.max(m.t - 12, y(usage(p.s.w, py)) - 14) });
      }
    }
    // nudge peak labels apart if they'd overlap
    peaks.sort((a, b) => a.x - b.x);
    for (let i = 1; i < peaks.length; i++) {
      const a = peaks[i - 1], b = peaks[i];
      const need = (a.s.w.word.length + b.s.w.word.length) * 4.2 + 14;
      if (b.x - a.x < need && Math.abs(b.y - a.y) < 18) b.y = a.y + 18;
    }
    edge.sort((a, b) => a.ty - b.ty);
    const gap = narrow ? 17 : 20;
    for (let i = 1; i < edge.length; i++) edge[i].y = Math.max(edge[i].y, edge[i - 1].y + gap);
    const maxY = m.t + ih;
    if (edge.length && edge[edge.length - 1].y > maxY) {
      edge[edge.length - 1].y = maxY;
      for (let i = edge.length - 2; i >= 0; i--) edge[i].y = Math.min(edge[i].y, edge[i + 1].y - gap);
    }
    return { edge, peaks };
  }, [paths, narrow]);

  const hy = hover === null ? null : Math.max(x.d0, Math.min(x.d1, hover));
  const hx = hy === null ? 0 : x(hy);
  const nearEvent = hy === null ? undefined : events.find((e) => Math.abs(x(e.year) - hx) < 10);

  const onMove = (e: RPointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = Math.max(m.l, Math.min(m.l + iw, e.clientX - r.left));
    setKbd(false);
    setHover(Math.round(x.invert(px)));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = (dir: number) => {
      const cur = hy ?? x.d1;
      const px = x(cur) + dir * Math.max(8, iw / 40);
      setKbd(true);
      setHover(Math.round(Math.max(x.d0, Math.min(x.d1, x.invert(px)))));
      e.preventDefault();
    };
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Home') { setKbd(true); setHover(Math.round(x.d0)); e.preventDefault(); }
    else if (e.key === 'End') { setKbd(true); setHover(x.d1); e.preventDefault(); }
    else if (e.key === 'Escape') setHover(null);
  };

  const rows = hy === null ? [] : series
    .map((s) => {
      const born = hy >= firstUsageYear(s.w);
      const v = usage(s.w, hy);
      const gone = hy > lastUsageYear(s.w) && v < 1;
      return { s, v, born, gone };
    })
    .sort((a, b) => Number(b.born) - Number(a.born) || b.v - a.v);

  const tipW = narrow ? 180 : 220;
  const tipLeft = hx + 18 + tipW > W - 4 ? Math.max(4, hx - 18 - tipW) : hx + 18;
  const summary = series.length
    ? `Estimated popularity of ${series.map((s) => s.w.word).join(', ')} from ${Math.round(x.d0)} to ${x.d1}, each relative to its own peak.`
    : 'Empty chart: add a word to plot it.';

  const reveal = inView || prefersReducedMotion();

  return (
    <div
      ref={wrapRef}
      className="tr-chart"
      style={{ height: H }}
      tabIndex={0}
      role="group"
      aria-label={`${summary} Use the left and right arrow keys to read values by year.`}
      onKeyDown={onKey}
      onBlur={() => kbd && setHover(null)}
    >
      {W > 0 && (
        <svg width={W} height={H} className="tr-chart__svg" aria-hidden="true">
          <defs>
            <filter id={`${uid}-glow`} x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            {series.map((s) => (
              <linearGradient key={s.w.id} id={`${uid}-g-${s.w.id}`} gradientUnits="userSpaceOnUse" x1="0" y1={m.t} x2="0" y2={m.t + ih}>
                <stop offset="0" style={{ stopColor: s.color, stopOpacity: areaAlpha }} />
                <stop offset="0.6" style={{ stopColor: s.color, stopOpacity: areaAlpha * 0.3 }} />
                <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>

          {/* eras */}
          <g className="tr-eras">
            {eras.map((e, i) => {
              const a = x(Math.max(e.start, x.d0));
              const b = x(Math.min(e.end, x.d1));
              const name = ERA_SHORT[e.id] ?? e.name;
              const fits = b - a > name.length * 6.6 + 14;
              return (
                <g key={e.id}>
                  {i % 2 === 1 && <rect x={a} y={m.t} width={Math.max(0, b - a)} height={ih} className="tr-eras__band" />}
                  {e.start > x.d0 && <line x1={a} x2={a} y1={m.t - 40} y2={m.t + ih} className="tr-eras__sep" />}
                  {fits && (
                    <text x={(a + b) / 2} y={m.t - 30} textAnchor="middle" className="tr-axis-label tr-eras__label">
                      {name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* grid */}
          <g className="tr-grid">
            {[25, 50, 75, 100].map((v) => (
              <line key={v} x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} />
            ))}
            {[0, 50, 100].map((v) => (
              <text key={v} x={m.l - 8} y={y(v) + 3.5} textAnchor="end" className="tr-axis-label">
                {v}
              </text>
            ))}
            <line x1={m.l} x2={m.l + iw} y1={y(0)} y2={y(0)} className="tr-grid__base" />
          </g>

          {/* x axis */}
          <g>
            {ticks.map((t) => (
              <g key={t} transform={`translate(${x(t)},${y(0)})`}>
                <line y2="5" className="tr-tick" />
                <text y="20" textAnchor="middle" className="tr-axis-label">
                  {t}
                </text>
              </g>
            ))}
            {events.map((e) => (
              <path key={e.year} d={`M${x(e.year)},${y(0) - 4}l3.5,4l-3.5,4l-3.5,-4z`} className={`tr-event ${nearEvent === e ? 'is-on' : ''}`} />
            ))}
          </g>

          {/* curves */}
          <AnimatePresence>
            {reveal &&
              paths.map(({ s, line, area, a }, i) =>
                line ? (
                  <motion.g
                    key={s.w.id}
                    className="tr-series"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: focusId && focusId !== s.w.id ? 0.16 : 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.25 } }}
                    transition={{ duration: 0.35 }}
                  >
                    <motion.path
                      d={area}
                      fill={`url(#${uid}-g-${s.w.id})`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 1.2, delay: 0.35 + i * 0.08 }}
                    />
                    <motion.path
                      key={`glow-${s.color}`}
                      d={line}
                      className="tr-series__glow"
                      style={{ stroke: s.color }}
                      filter={`url(#${uid}-glow)`}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.4, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.path
                      key={`line-${s.color}-${s.dash ?? ''}`}
                      d={line}
                      className="tr-series__line"
                      style={{ stroke: s.color, strokeDasharray: s.dash }}
                      initial={s.dash ? { opacity: 0 } : { pathLength: 0 }}
                      animate={s.dash ? { opacity: 1 } : { pathLength: 1 }}
                      transition={{ duration: s.dash ? 0.8 : 1.4, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    />
                    <motion.circle
                      cx={x(a)}
                      cy={y(usage(s.w, a))}
                      r={3.2}
                      className="tr-series__birth"
                      style={{ stroke: s.color }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2 + i * 0.08, type: 'spring', stiffness: 400, damping: 20 }}
                    />
                  </motion.g>
                ) : null,
              )}
          </AnimatePresence>

          {/* leaders from line ends to the stacked labels */}
          {reveal &&
            labels.edge.map((l) =>
              Math.abs(l.y - l.ey) > 2 || l.ex < m.l + iw - 2 ? (
                <path
                  key={l.s.w.id}
                  d={`M${l.ex + 3},${l.ey} C${m.l + iw + 4},${l.ey} ${m.l + iw + 2},${l.y} ${m.l + iw + 8},${l.y}`}
                  className="tr-leader"
                  style={{ stroke: l.s.color, opacity: focusId && focusId !== l.s.w.id ? 0.15 : 0.55 }}
                />
              ) : null,
            )}

          {/* crosshair */}
          {hy !== null && series.length > 0 && (
            <g className="tr-cross">
              <line x1={hx} x2={hx} y1={m.t - 4} y2={y(0)} />
              {rows.map(({ s, v, born, gone }) =>
                born && !gone ? (
                  <circle key={s.w.id} cx={hx} cy={y(v)} r={4.5} className="tr-cross__dot" style={{ fill: s.color }} />
                ) : null,
              )}
            </g>
          )}

          {/* pointer layer */}
          <rect
            x={m.l}
            y={m.t - 40}
            width={iw}
            height={ih + 40}
            className="tr-hit"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
          />
        </svg>
      )}

      {/* end labels (HTML so they're real links) */}
      {W > 0 && reveal && (
        <div className="tr-labels">
          <AnimatePresence>
            {labels.edge.map((l, i) => (
              <motion.a
                key={l.s.w.id}
                href={href.word(l.s.w.id)}
                className="tr-label"
                style={{ left: m.l + iw + 12, '--c': l.s.color } as React.CSSProperties}
                initial={{ opacity: 0, x: -6, top: l.y - 11 }}
                animate={{ opacity: focusId && focusId !== l.s.w.id ? 0.3 : 1, x: 0, top: l.y - 11 }}
                exit={{ opacity: 0 }}
                transition={{ delay: hover === null ? 0.6 + i * 0.06 : 0, type: 'spring', stiffness: 260, damping: 30 }}
                onPointerEnter={() => onFocus(l.s.w.id)}
                onPointerLeave={() => onFocus(null)}
                onFocus={() => onFocus(l.s.w.id)}
                onBlur={() => onFocus(null)}
              >
                <i style={{ background: l.s.color }} />
                {l.s.w.word}
              </motion.a>
            ))}
            {labels.peaks.map((l) => (
              <motion.a
                key={l.s.w.id}
                href={href.word(l.s.w.id)}
                className="tr-label tr-label--peak"
                style={{ '--c': l.s.color } as React.CSSProperties}
                initial={{ opacity: 0, left: l.x, top: l.y - 10 }}
                animate={{ opacity: focusId && focusId !== l.s.w.id ? 0.3 : 1, left: l.x, top: l.y - 10 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30, opacity: { delay: hover === null ? 0.9 : 0 } }}
                onPointerEnter={() => onFocus(l.s.w.id)}
                onPointerLeave={() => onFocus(null)}
              >
                {l.s.w.word}
                {l.s.w.status === 'extinct' && <span aria-label="extinct"> †</span>}
              </motion.a>
            ))}
          </AnimatePresence>
        </div>
      )}

      {series.length === 0 && W > 0 && (
        <div className="tr-empty" style={{ left: m.l, top: m.t, width: iw, height: ih }}>
          <p>Add a word to watch its fortunes rise and fall.</p>
        </div>
      )}

      {/* tooltip */}
      <AnimatePresence>
        {hy !== null && series.length > 0 && (
          <motion.div
            className="tr-tip"
            style={{ width: tipW }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, left: tipLeft, top: m.t + 4 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 700, damping: 45, opacity: { duration: 0.12 } }}
            aria-live="polite"
          >
            <div className="tr-tip__head">
              <span className="tr-tip__year">{hy}</span>
              <span className="tr-tip__era">{eraAt(hy)?.name}</span>
            </div>
            <ul>
              {rows.map(({ s, v, born, gone }) => (
                <li key={s.w.id} className={!born || gone ? 'is-dim' : ''}>
                  <i style={{ background: s.color }} className={s.dash ? 'is-dashed' : ''} />
                  <span className="tr-tip__word">{s.w.word}</span>
                  <b>{!born ? 'not yet' : gone ? 'gone' : Math.round(v)}</b>
                </li>
              ))}
            </ul>
            {nearEvent && (
              <p className="tr-tip__event">
                <span>{nearEvent.year}</span> {nearEvent.title}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <table className="sr-only">
        <caption>Estimated usage, relative to each word&rsquo;s own peak (100)</caption>
        <thead>
          <tr>
            <th scope="col">Word</th>
            {ticks.map((t) => (
              <th key={t} scope="col">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.w.id}>
              <th scope="row">{s.w.word}</th>
              {ticks.map((t) => (
                <td key={t}>{t < firstUsageYear(s.w) ? '–' : Math.round(usage(s.w, t))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
