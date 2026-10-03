import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Root } from '../../data';

export interface Ranked {
  root: Root;
  n: number;
}

/** A horizontally scrolling shelf of roots, biggest families first. */
export default function RootPicker({ ranked, selected, onSelect, onSurprise, reduced }: { ranked: Ranked[]; selected?: string; onSelect: (id: string) => void; onSurprise: () => void; reduced: boolean }) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [spin, setSpin] = useState(0);
  const max = ranked[0]?.n ?? 1;

  const measure = () => {
    const el = strip.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 6, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 6 });
  };
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ranked.length]);

  // Keep the selected card in view (scrolling the strip only, never the page).
  useEffect(() => {
    const el = strip.current;
    const card = el?.querySelector<HTMLElement>(`[data-root="${CSS.escape(selected ?? '')}"]`);
    if (!el || !card) return;
    const target = card.offsetLeft - el.clientWidth / 2 + card.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: reduced ? 'auto' : 'smooth' });
  }, [selected, reduced]);

  const page = (dir: number) => {
    const el = strip.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = ranked.findIndex((r) => r.root.id === selected);
    const j = Math.max(0, Math.min(ranked.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
    if (j !== i) {
      e.preventDefault();
      onSelect(ranked[j].root.id);
      strip.current?.querySelector<HTMLElement>(`[data-root="${CSS.escape(ranked[j].root.id)}"]`)?.focus({ preventScroll: true });
    }
  };

  return (
    <div className="rp">
      <div className="rp-bar">
        <span className="rp-title mono">
          {ranked.length} {ranked.length === 1 ? 'root' : 'roots'} <span className="rp-sep">·</span> biggest families first
        </span>
        <div className="rp-actions">
          <button
            type="button"
            className="rp-surprise"
            onClick={() => {
              setSpin((s) => s + 1);
              onSurprise();
            }}
            disabled={ranked.length < 2}
          >
            <motion.svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" animate={{ rotate: spin * 180 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 16 }}>
              <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
              <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
              <circle cx="12" cy="12" r="1.4" fill="currentColor" />
              <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" />
              <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" />
            </motion.svg>
            Surprise me
          </button>
          <button type="button" className="rp-arrow" aria-label="Scroll roots left" onClick={() => page(-1)} disabled={edges.start}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="rp-arrow" aria-label="Scroll roots right" onClick={() => page(1)} disabled={edges.end}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
      <div className={`rp-shelf${edges.start ? ' at-start' : ''}${edges.end ? ' at-end' : ''}`}>
        <div className="rp-strip" ref={strip} onScroll={measure} role="group" aria-label="Choose a root" onKeyDown={onKey}>
          {ranked.map(({ root, n }, i) => {
            const on = root.id === selected;
            return (
              <motion.button
                type="button"
                key={root.id}
                data-root={root.id}
                className={`rp-card${on ? ' is-on' : ''}`}
                aria-pressed={on}
                aria-label={`${root.form}, ${root.meaning}: ${n} English ${n === 1 ? 'word' : 'words'}`}
                onClick={() => onSelect(root.id)}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 200px 0px 200px' }}
                transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="rp-card__form old">{root.form}</span>
                <span className="rp-card__mean">{root.meaning}</span>
                <span className="rp-card__meta">
                  <span className="rp-card__n mono">{n}</span>
                  <span className="rp-card__bar">
                    <i style={{ width: `${Math.max(6, (n / max) * 100)}%` }} />
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
