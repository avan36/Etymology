import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { data } from '../../data';
import type { Word } from '../../data';
import { T0, T1 } from './lostUtil';

interface Props {
  words: Word[];
  century: number | null;
  onCentury: (c: number | null) => void;
}

const fmt = (c: number) => `${c}s`;
const short = (t: string) => {
  const s = t.replace(/^The /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** When the words died: one glowing bar per century, with the history that did it. */
export default function DeathStrip({ words, century, onCentury }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px' });

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bins = useMemo(() => {
    const out: { c: number; ws: Word[] }[] = [];
    for (let c = Math.floor(T0 / 100) * 100; c <= Math.floor(T1 / 100) * 100; c += 100) out.push({ c, ws: [] });
    for (const w of words) {
      if (w.died === undefined) continue;
      const b = out.find((x) => w.died! >= x.c && w.died! < x.c + 100);
      b?.ws.push(w);
    }
    return out;
  }, [words]);
  const max = Math.max(4, ...bins.map((b) => b.ws.length));
  const top = bins.reduce((a, b) => (b.ws.length > a.ws.length ? b : a), bins[0]);
  const total = bins.reduce((n, b) => n + b.ws.length, 0);

  const narrow = W < 640;
  const H = narrow ? 150 : 176;
  const m = { t: 46, b: 58, l: 2, r: 2 };
  const ih = H - m.t - m.b;
  const x = (y: number) => m.l + ((y - T0) / (T1 - T0)) * (W - m.l - m.r);
  const bw = Math.max(5, Math.min(narrow ? 12 : 26, (x(T0 + 100) - x(T0)) * 0.42));
  const events = data.events.filter((e) => e.year > T0 && e.year < T1);
  // Label events left to right, skipping any that would collide with the last label.
  const labelled = new Set<number>();
  {
    let lastEnd = -Infinity;
    for (const e of events) {
      const width = (String(e.year).length + short(e.title).length + 3) * 6.2 + 14;
      const ex = x(e.year);
      if (ex > lastEnd + 8 && ex + width < W + 40 && (!narrow || e.year === 1066)) {
        labelled.add(e.year);
        lastEnd = ex + width;
      }
    }
  }

  const why = (c: number) =>
    c >= 1050 && c < 1400
      ? 'the long shadow of the Norman Conquest'
      : c >= 1400 && c < 1700
        ? 'as print, the Renaissance and a flood of Latin reshaped the language'
        : c >= 1700 && c < 1900
          ? 'as dictionaries and schools fixed what counted as proper English'
          : c < 1050
            ? 'as Norse settlers and then Norman lords changed the language'
            : 'in the age of mass media';

  const hb = hover !== null ? bins.find((b) => b.c === hover) : undefined;

  return (
    <div className="lost-strip">
      <div className="lost-strip__head">
        <h3 className="lost-strip__title">When they fell silent</h3>
        {total > 1 && top.ws.length > 1 && (
          <p className="lost-strip__caption">
            More words in our collection died in the <b>{fmt(top.c)}</b> than in any other century: {why(top.c)}.
          </p>
        )}
      </div>
      <div ref={ref} className="lost-strip__chart" style={{ height: H }}>
        {W > 0 && (
          <svg width={W} height={H} role="img" aria-label={`Number of lost words by the century they died. ${bins.filter((b) => b.ws.length).map((b) => `${fmt(b.c)}: ${b.ws.length}`).join(', ')}`}>
            <defs>
              <linearGradient id="lost-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--lost-ember)" stopOpacity="1" />
                <stop offset="1" stopColor="var(--lost-ember)" stopOpacity="0.15" />
              </linearGradient>
              <filter id="lost-bar-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            {/* eras along the bottom */}
            {data.eras.map((e, i) => {
              const a = x(Math.max(T0, e.start)), b = x(Math.min(T1, e.end));
              const label = narrow ? e.name.replace(' English', '').replace('Early Modern', 'Early Mod.') : e.name;
              return (
                <g key={e.id}>
                  <rect x={a} y={m.t + ih + 30} width={Math.max(0, b - a - 2)} height={2} rx={1} className={`lost-strip__era ${i % 2 ? 'is-alt' : ''}`} />
                  {b - a > label.length * 6 && (
                    <text x={a} y={m.t + ih + 48} className="lost-strip__label">{label}</text>
                  )}
                </g>
              );
            })}
            {/* events */}
            {events.map((e) => (
              <g key={e.year} className="lost-strip__event">
                <line x1={x(e.year)} x2={x(e.year)} y1={labelled.has(e.year) ? 6 : m.t - 10} y2={m.t + ih} />
                {labelled.has(e.year) && (
                  <text x={x(e.year) + 6} y={14} className="lost-strip__evt">
                    {e.year} · {short(e.title)}
                  </text>
                )}
              </g>
            ))}
            <line x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} className="lost-strip__base" />
            {/* bars */}
            {bins.map((b, i) => {
              const h = b.ws.length ? Math.max(3, (b.ws.length / max) * ih) : 0;
              const bx = x(b.c) + (x(b.c + 100) - x(b.c) - bw) / 2;
              const dim = century !== null && century !== b.c;
              return (
                <g
                  key={b.c}
                  className={`lost-strip__bin ${b.ws.length ? '' : 'is-empty'} ${century === b.c ? 'is-on' : ''}`}
                  role={b.ws.length ? 'button' : undefined}
                  tabIndex={b.ws.length ? 0 : -1}
                  aria-pressed={b.ws.length ? century === b.c : undefined}
                  aria-label={b.ws.length ? `${fmt(b.c)}: ${b.ws.length} word${b.ws.length > 1 ? 's' : ''} fell silent. Filter the collection.` : undefined}
                  onPointerEnter={() => setHover(b.c)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(b.c)}
                  onBlur={() => setHover(null)}
                  onClick={() => b.ws.length && onCentury(century === b.c ? null : b.c)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && b.ws.length) { e.preventDefault(); onCentury(century === b.c ? null : b.c); }
                  }}
                  style={{ opacity: dim ? 0.35 : 1 }}
                >
                  <rect x={x(b.c)} y={m.t - 8} width={x(b.c + 100) - x(b.c)} height={ih + 8} className="lost-strip__hit" />
                  {h > 0 && (
                    <>
                      <motion.rect
                        x={bx} width={bw} rx={Math.min(4, bw / 2)} className="lost-strip__glow" filter="url(#lost-bar-glow)"
                        initial={{ y: m.t + ih, height: 0 }}
                        animate={inView ? { y: m.t + ih - h, height: h } : undefined}
                        transition={{ delay: 0.1 + i * 0.03, type: 'spring', stiffness: 150, damping: 20 }}
                      />
                      <motion.rect
                        x={bx} width={bw} rx={Math.min(4, bw / 2)} fill="url(#lost-bar)" className="lost-strip__bar"
                        initial={{ y: m.t + ih, height: 0 }}
                        animate={inView ? { y: m.t + ih - h, height: h } : undefined}
                        transition={{ delay: 0.1 + i * 0.03, type: 'spring', stiffness: 150, damping: 20 }}
                      />
                      {(!narrow || b.ws.length === max) && (
                        <motion.text
                          x={bx + bw / 2} y={m.t + ih - h - 6} textAnchor="middle" className="lost-strip__n"
                          initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : undefined} transition={{ delay: 0.5 + i * 0.03 }}
                        >
                          {b.ws.length}
                        </motion.text>
                      )}
                    </>
                  )}
                  {b.c % (narrow ? 400 : 200) === 0 && b.c >= T0 && (
                    <text x={x(b.c)} y={m.t + ih + 18} textAnchor="middle" className="lost-strip__year">{b.c}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        <AnimatePresence>
          {hb && hb.ws.length > 0 && (
            <motion.div
              className="lost-strip__tip"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, left: Math.min(Math.max(8, x(hb.c + 50) - 110), W - 228) }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            >
              <b>{fmt(hb.c)}</b> · {hb.ws.length} fell silent
              <span>{hb.ws.slice(0, 5).map((w) => w.word).join(', ')}{hb.ws.length > 5 ? '…' : ''}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
