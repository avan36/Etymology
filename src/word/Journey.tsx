import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { data } from '../data';
import { href } from '../lib/router';
import type { SheetWord } from './model';
import { langPeriod, splitForm, stageYear } from './model';
import { langInfo } from './langs';

type Pt = { x: number; y: number };

/** Smooth flowing path through the dots: S-curves that bow alternately above/below the line. */
function ribbon(pts: Pt[], vertical: boolean): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const s = i % 2 ? 1 : -1;
    if (vertical) {
      const dy = b.y - a.y;
      const amp = Math.min(14, dy * 0.12) * s;
      d += ` C${(a.x + amp).toFixed(1)},${(a.y + dy * 0.42).toFixed(1)} ${(b.x - amp).toFixed(1)},${(b.y - dy * 0.42).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    } else {
      const dx = b.x - a.x;
      const amp = Math.min(26, dx * 0.16) * s;
      d += ` C${(a.x + dx * 0.4).toFixed(1)},${(a.y - amp).toFixed(1)} ${(b.x - dx * 0.4).toFixed(1)},${(b.y + amp).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    }
  }
  return d;
}

export function Journey({ sw }: { sw: SheetWord }) {
  const reduce = !!useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const [pts, setPts] = useState<Pt[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [vertical, setVertical] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  const inView = useInView(wrap, { once: true, amount: 0.25 });
  const stages = sw.path;
  const n = stages.length;
  const gid = useMemo(() => `ws-jg-${Math.random().toString(36).slice(2, 8)}`, []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    // Layout positions (offset*), so the entrance transforms on each stage don't skew the ribbon.
    const offsetIn = (node: HTMLElement) => {
      let x = node.offsetWidth / 2;
      let y = node.offsetHeight / 2;
      let cur: HTMLElement | null = node;
      while (cur && cur !== el) {
        x += cur.offsetLeft;
        y += cur.offsetTop;
        cur = cur.offsetParent as HTMLElement | null;
      }
      return { x, y };
    };
    const measure = () => {
      const v = el.clientWidth < 640 || (n > 3 && el.clientWidth / n < 128);
      setVertical(v);
      setBox({ w: el.scrollWidth, h: el.scrollHeight });
      setPts(dots.current.slice(0, n).map((d) => (d ? offsetIn(d) : { x: 0, y: 0 })));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Fonts can change line heights after first paint.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [n, vertical]);

  const d = useMemo(() => ribbon(pts, vertical), [pts, vertical]);
  const span = (() => {
    const ys = stages.map((s) => s.year).filter((y): y is number => y !== undefined);
    return ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : undefined;
  })();
  const DRAW = reduce ? 0 : Math.min(2.4, 0.5 + n * 0.32);
  const first = pts[0];
  const lastPt = pts[pts.length - 1];

  if (!n) return null;

  return (
    <section className="ws-sec ws-journey-sec" aria-labelledby={`${gid}-t`}>
      <div className="ws-sec__head">
        <p className="ws-sec__eyebrow">The journey</p>
        <h2 className="ws-sec__title" id={`${gid}-t`}>
          {n === 1 ? (
            <>Born in <em>{langInfo(stages[0].lang).name}</em></>
          ) : span && span > 0 ? (
            <><em>{span.toLocaleString('en-US')} years</em> in {n} {n === 1 ? 'step' : 'steps'}</>
          ) : (
            <>{n} steps to <em>English</em></>
          )}
        </h2>
      </div>

      <div ref={wrap} className={`ws-journey${vertical ? ' is-vertical' : ''}`} style={{ '--n': n } as React.CSSProperties}>
        {pts.length === n && n > 1 && (
          <svg className="ws-journey__svg" width={box.w} height={box.h} aria-hidden>
            <defs>
              <linearGradient
                id={gid}
                gradientUnits="userSpaceOnUse"
                x1={vertical ? 0 : first.x}
                y1={vertical ? first.y : 0}
                x2={vertical ? 0 : lastPt.x}
                y2={vertical ? lastPt.y : 0}
              >
                {stages.map((s, i) => {
                  const p = pts[i];
                  const off = vertical ? (p.y - first.y) / Math.max(1, lastPt.y - first.y) : (p.x - first.x) / Math.max(1, lastPt.x - first.x);
                  return <stop key={i} offset={Math.min(1, Math.max(0, off))} stopColor={langInfo(s.lang).color} />;
                })}
              </linearGradient>
              <filter id={`${gid}-blur`} x="-10%" y="-50%" width="120%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <motion.path
              d={d}
              className="ws-journey__glow"
              stroke={`url(#${gid})`}
              filter={`url(#${gid}-blur)`}
              initial={reduce ? false : { pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : undefined}
              transition={{ duration: DRAW, ease: [0.65, 0, 0.35, 1] }}
            />
            <motion.path
              d={d}
              className="ws-journey__line"
              stroke={`url(#${gid})`}
              initial={reduce ? false : { pathLength: 0 }}
              animate={inView ? { pathLength: 1 } : undefined}
              transition={{ duration: DRAW, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        )}

        <ol className="ws-journey__list">
          {stages.map((s, i) => {
            const l = langInfo(s.lang);
            const { main, roman } = splitForm(s.form);
            const year = stageYear(s) ?? (sw.source === 'wiktionary' ? langPeriod(s.lang) : undefined);
            const isLast = i === n - 1;
            const delay = reduce ? 0 : (n > 1 ? (i / (n - 1)) * DRAW * 0.92 : 0) + 0.05;
            return (
              <motion.li
                key={i}
                className={`ws-stage${isLast ? ' is-last' : ''}${l.proto ? ' is-proto' : ''}`}
                style={{ '--sc': l.color } as React.CSSProperties}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ delay, type: 'spring', stiffness: 160, damping: 22 }}
              >
                <span className="ws-stage__year">{year ?? '\u00a0'}</span>
                <span
                  className="ws-stage__dot"
                  ref={(el) => {
                    dots.current[i] = el;
                  }}
                >
                  <motion.span
                    className="ws-stage__dot-core"
                    initial={reduce ? false : { scale: 0 }}
                    animate={inView ? { scale: 1 } : undefined}
                    transition={{ delay, type: 'spring', stiffness: 420, damping: 16 }}
                  />
                </span>
                <span className="ws-stage__body">
                  <span className="ws-stage__form old" lang={l.id}>{main}</span>
                  {roman && <span className="ws-stage__roman old">{roman}</span>}
                  {data.lang.has(l.id) ? (
                    <a className="ws-stage__lang" href={href.lang(l.id)}>{l.name}</a>
                  ) : (
                    <span className="ws-stage__lang">{l.name}</span>
                  )}
                  {s.meaning && <span className="ws-stage__meaning">‘{s.meaning}’</span>}
                  {s.note && <span className="ws-stage__note">{s.note}</span>}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </div>
      {stages.some((s) => s.form.startsWith('*')) && (
        <p className="ws-footnote">
          <span className="old">*</span> marks a reconstructed form: never written down, rebuilt by comparing its descendants.
        </p>
      )}
    </section>
  );
}
