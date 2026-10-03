import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { data, langName, wordColor } from '../../data';
import type { Word } from '../../data';
import { href } from '../../lib/router';
import { endYear, hasUsage, lastUsageYear, sparkPath, timeScale, trend } from './curves';

const SPAN = 100;
const N = 6;
const K = 0.5;

/** "On the rise" / "On the wane": ranked by how much each curve moved over the last century. */
export default function Movers() {
  const end = endYear();
  const { rising, falling } = useMemo(() => {
    const scored = data.words
      .filter((w) => hasUsage(w) && lastUsageYear(w) >= end - 30)
      .map((w) => ({ w, d: trend(w, SPAN) }));
    return {
      rising: scored.filter((s) => s.d >= 5).sort((a, b) => b.d - a.d).slice(0, N),
      falling: scored.filter((s) => s.d <= -5).sort((a, b) => a.d - b.d).slice(0, N),
    };
  }, [end]);

  if (!rising.length && !falling.length) return null;
  return (
    <div className="tr-movers">
      {rising.length > 0 && <List title="On the rise" sub={`Biggest climbs since ${end - SPAN}`} items={rising} dir="up" end={end} />}
      {falling.length > 0 && <List title="On the wane" sub={`Steepest falls since ${end - SPAN}`} items={falling} dir="down" end={end} />}
    </div>
  );
}

function List({ title, sub, items, dir, end }: { title: string; sub: string; items: { w: Word; d: number }[]; dir: 'up' | 'down'; end: number }) {
  // Every sparkline shares one window (the last 250 years) so the rows compare at a glance.
  const from = end - 250;
  const SPLIT = timeScale(from, end, 0, 1, K)(end - SPAN);
  return (
    <motion.section
      className={`tr-movers__col tr-movers__col--${dir}`}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      aria-label={title}
    >
      <header className="tr-movers__head">
        <h3>
          <span className="tr-movers__arrow" aria-hidden="true">{dir === 'up' ? '↗' : '↘'}</span>
          {title}
        </h3>
        <p className="mono">{sub}</p>
      </header>
      <ol>
        {items.map(({ w, d }, i) => {
          return (
            <motion.li
              key={w.id}
              initial={{ opacity: 0, x: dir === 'up' ? -14 : 14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <a href={href.word(w.id)} className="tr-mover" style={{ '--c': wordColor(w) } as React.CSSProperties}>
                <span className="tr-mover__rank mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="tr-mover__text">
                  <span className="tr-mover__word">{w.word}</span>
                  <span className="tr-mover__meta">
                    {langName(w.origin)} · {w.first}
                  </span>
                </span>
                <svg className="tr-mover__spark" viewBox="0 0 160 36" preserveAspectRatio="none" aria-hidden="true">
                  <line x1={SPLIT * 160} x2={SPLIT * 160} y1="0" y2="36" className="tr-mover__split" />
                  <path d={sparkPath(w, 160, 36, from, end, K, undefined, end - SPAN)} className="tr-mover__past" />
                  <path d={sparkPath(w, 160, 36, from, end, K, end - SPAN, end)} className="tr-mover__now" />
                </svg>
                <span className="tr-mover__delta" aria-label={`${d > 0 ? 'up' : 'down'} ${Math.abs(Math.round(d))} points`}>
                  {d > 0 ? '+' : '−'}
                  {Math.abs(Math.round(d))}
                </span>
              </a>
            </motion.li>
          );
        })}
      </ol>
    </motion.section>
  );
}
