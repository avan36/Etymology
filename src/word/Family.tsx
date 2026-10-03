import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { findWord, wordColor } from '../data';
import type { Word } from '../data';
import { href } from '../lib/router';
import type { SheetWord } from './model';
import { langInfo } from './langs';
import { IconArrow } from './icons';

const MAX = 24;

/** Root at the centre, its descendants around it on one or two elliptical rings. */
export function Family({ sw }: { sw: SheetWord }) {
  const reduce = !!useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const inView = useInView(wrap, { once: true, amount: 0.25 });
  const root = sw.root;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The current word sits in the constellation too, highlighted.
  const members = useMemo(() => {
    const self = findWord(sw.id);
    const fam = sw.family.slice().sort((a, b) => a.first - b.first);
    const list: { w: Word | null; label: string; self: boolean; color: string }[] = fam.slice(0, MAX - 1).map((f) => ({ w: f, label: f.word, self: false, color: wordColor(f) }));
    const me = { w: self ?? null, label: sw.word, self: true, color: sw.color };
    list.splice(Math.floor(list.length / 2), 0, me);
    return list;
  }, [sw]);

  if (!root) return null;
  const rl = langInfo(root.lang);
  const narrow = w > 0 && w < 600;
  const H = narrow ? 0 : Math.max(340, Math.min(480, 280 + members.length * 9));
  const cx = w / 2;
  const cy = H / 2;
  const n = members.length;
  const twoRings = n > 12;
  const pos = members.map((_, i) => {
    const ring = twoRings ? i % 2 : 0;
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (ring ? Math.PI / n : 0) + 0.18;
    const rx = (ring ? 0.3 : 0.42) * w;
    const ry = (ring ? 0.29 : 0.4) * H;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });

  return (
    <section className="ws-sec ws-fam-sec">
      <div className="ws-sec__head">
        <p className="ws-sec__eyebrow">The family</p>
        <h2 className="ws-sec__title">
          From the root <em className="old">{root.form}</em>
        </h2>
        <p className="ws-sec__lede">
          {root.meaning ? <>‘{root.meaning}’ in {rl.name}. </> : <>{rl.name}. </>}
          {root.blurb}
        </p>
      </div>

      <div ref={wrap} className={`ws-constel${narrow ? ' is-narrow' : ''}`} style={narrow ? undefined : { height: H }}>
        {w > 0 && !narrow && n > 1 && (
          <svg className="ws-constel__svg" width={w} height={H} aria-hidden>
            {pos.map((p, i) => (
              <motion.line
                key={i}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                className={`ws-constel__ray${members[i].self ? ' is-self' : ''}`}
                style={{ stroke: members[i].color }}
                initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
                transition={{ delay: 0.15 + i * 0.04, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </svg>
        )}
        {w > 0 && (
          <>
            <div className="ws-constel__anchor" style={narrow ? undefined : { left: cx, top: cy }}>
              <motion.div
                className="ws-constel__root"
                initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : undefined}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              >
                <span className="ws-constel__root-form old">{root.form}</span>
                {root.meaning && <span className="ws-constel__root-mean">{root.meaning}</span>}
              </motion.div>
            </div>
            <ul className="ws-constel__list">
              {members.map((m, i) => {
                const style = { '--c': m.color, ...(narrow ? {} : { left: pos[i].x, top: pos[i].y }) } as React.CSSProperties;
                return (
                  <li key={m.label + i} className={`ws-star${m.self ? ' is-self' : ''}`} style={style}>
                    <motion.span
                      className="ws-star__in"
                      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                      animate={inView ? { opacity: 1, scale: 1 } : undefined}
                      transition={{ delay: 0.35 + i * 0.045, type: 'spring', stiffness: 260, damping: 20 }}
                    >
                      {m.self ? (
                        <span className="ws-star__a" aria-current="page">
                          <span className="dot" />
                          {m.label}
                        </span>
                      ) : (
                        <a className="ws-star__a" href={href.word(m.w!.id)}>
                          <span className="dot" />
                          {m.label}
                        </a>
                      )}
                    </motion.span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      {root.id && (
        <a className="ws-more" href={href.root(root.id)}>
          Explore the whole <span className="old">{root.form}</span> family
          <IconArrow dir="right" />
        </a>
      )}
      {sw.family.length > MAX - 1 && <p className="ws-footnote">Showing {MAX - 1} of {sw.family.length} relatives.</p>}
    </section>
  );
}

export function Related({ sw }: { sw: SheetWord }) {
  const items = sw.related.map((id) => ({ id, w: findWord(id) }));
  return (
    <section className="ws-sec ws-rel-sec">
      {items.length > 0 && (
        <>
          <p className="ws-sec__eyebrow">Keep exploring</p>
          <ul className="ws-chips">
            {items.map(({ id, w }) => (
              <li key={id}>
                <a className="chip ws-chip" href={href.word(w?.id ?? id)} style={{ '--c': w ? wordColor(w) : 'var(--ink-4)' } as React.CSSProperties}>
                  <span className="dot" />
                  {w?.word ?? id}
                  {!w && <span className="ws-chip__live">live</span>}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <a className="ws-wikt" href={sw.wikiUrl} target="_blank" rel="noopener noreferrer">
        Explore <em>{sw.word}</em> on Wiktionary
        <IconArrow dir="up-right" />
      </a>
    </section>
  );
}
