import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion';
import { data } from '../../data';
import type { Word } from '../../data';
import Embers from './Embers';
import type { BurstFn } from './Embers';
import Featured from './Featured';
import DeathStrip from './DeathStrip';
import LostCard from './LostCard';
import { deathEra, estimateHeight } from './lostUtil';
import './lost.css';

const PAGE = 12;
type Status = 'all' | 'extinct' | 'archaic';

const rise = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const },
};

function useColumns(ref: React.RefObject<HTMLElement | null>): number {
  const [n, setN] = useState(3);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setN(w < 600 ? 1 : w < 940 ? 2 : 3);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return n;
}

export default function Lost() {
  const lost = data.lost;
  const hostRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<BurstFn | null>(null);
  const cols = useColumns(gridRef);

  const [status, setStatus] = useState<Status>('all');
  const [era, setEra] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [century, setCentury] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => {
    const extinct = lost.filter((w) => w.status === 'extinct').length;
    const eras = data.eras
      .map((e) => ({ e, n: lost.filter((w) => deathEra(w)?.id === e.id).length }))
      .filter((x) => x.n > 0);
    const lingering = lost.filter((w) => w.died === undefined).length;
    const tagCount = new Map<string, number>();
    for (const w of lost) for (const t of w.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    const tags = [...tagCount].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { extinct, archaic: lost.length - extinct, eras, lingering, tags };
  }, [lost]);

  const filtered = useMemo(
    () =>
      lost
        .filter((w) => status === 'all' || (w.status ?? 'extinct') === status)
        .filter((w) => !era || (era === '__lingering' ? w.died === undefined : deathEra(w)?.id === era))
        .filter((w) => !tag || w.tags?.includes(tag))
        .filter((w) => century === null || (w.died !== undefined && w.died >= century && w.died < century + 100))
        .sort((a, b) => (a.died ?? 9999) - (b.died ?? 9999) || a.first - b.first),
    [lost, status, era, tag, century],
  );
  useEffect(() => setShown(PAGE), [status, era, tag, century]);

  const visible = filtered.slice(0, shown);
  // Balanced masonry: each card goes to the currently shortest column (by estimated height).
  const columns = useMemo(() => {
    const out: { w: Word; i: number }[][] = Array.from({ length: cols }, () => []);
    const h = new Array(cols).fill(0);
    visible.forEach((w, i) => {
      const c = h.indexOf(Math.min(...h));
      out[c].push({ w, i });
      h[c] += estimateHeight(w);
    });
    return out;
  }, [visible, cols]);

  const ghosts = useMemo(() => lost.map((w) => w.word), [lost]);
  const showFilters = lost.length >= 6;
  const anyFilter = status !== 'all' || era || tag || century !== null;
  const reset = () => { setStatus('all'); setEra(null); setTag(null); setCentury(null); };
  const n = lost.length;

  return (
    <MotionConfig reducedMotion="user">
      <section id="lost" ref={hostRef} className="section lost" aria-labelledby="lost-title">
        <div className="lost__night">
          <div className="lost__sky" aria-hidden="true">
            <div className="lost__dusk lost__dusk--top" />
            <div className="lost__dusk lost__dusk--bottom" />
            <div className="lost__fog lost__fog--a" />
            <div className="lost__fog lost__fog--b" />
            <div className="lost__sticky">
              <Embers ghosts={ghosts} burstRef={burstRef} hostRef={hostRef} />
            </div>
          </div>

          <div className="page lost__content">
            <motion.header className="section__head lost__head" {...rise}>
              <p className="section__eyebrow">Chapter 5 · The lost words</p>
              <h2 id="lost-title" className="section__title">
                Gone, but <em>not forgotten</em>
              </h2>
              <p className="section__lede">
                English has let thousands of words slip away. Some were elbowed out by French or Norse rivals, some went
                out of fashion, and some vanished without anyone noting why.{' '}
                {n > 1 ? `Here are ${n} we miss.` : n === 1 ? 'Here is one we miss.' : ''}
              </p>
            </motion.header>

            {n === 0 ? (
              <p className="lost__empty">The lost words are still being gathered. Check back soon.</p>
            ) : (
              <>
                <Featured words={lost} burstRef={burstRef} />

                <motion.div {...rise}>
                  <DeathStrip words={lost} century={century} onCentury={setCentury} />
                </motion.div>

                <div className="lost__collection">
                  <motion.div className="lost__collection-head" {...rise}>
                    <h3>The collection</h3>
                    <p className="mono">
                      {filtered.length === n ? `${n} word${n === 1 ? '' : 's'}` : `${filtered.length} of ${n} words`}
                    </p>
                  </motion.div>

                  {showFilters && (
                    <motion.div className="lost-filters" {...rise}>
                      {counts.extinct > 0 && counts.archaic > 0 && (
                        <div className="lost-seg" role="radiogroup" aria-label="Status">
                          {(['all', 'extinct', 'archaic'] as Status[]).map((s) => (
                            <button key={s} type="button" role="radio" aria-checked={status === s} className={status === s ? 'is-on' : ''} onClick={() => setStatus(s)}>
                              {status === s && <motion.span layoutId="lost-seg-pill" className="lost-seg__pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                              <span className="lost-seg__label">
                                {s === 'all' ? 'All' : s === 'extinct' ? 'Extinct' : 'Archaic'}
                                <span className="lost-seg__n">{s === 'all' ? n : s === 'extinct' ? counts.extinct : counts.archaic}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="lost-chips" role="group" aria-label="Died in">
                        <span className="lost-chips__label mono">Died in</span>
                        {counts.eras.map(({ e, n: c }) => (
                          <button key={e.id} type="button" className={`chip ${era === e.id ? 'is-on' : ''}`} aria-pressed={era === e.id} onClick={() => setEra(era === e.id ? null : e.id)}>
                            {e.name} <span className="lost-chips__n">{c}</span>
                          </button>
                        ))}
                        {counts.lingering > 0 && (
                          <button type="button" className={`chip ${era === '__lingering' ? 'is-on' : ''}`} aria-pressed={era === '__lingering'} onClick={() => setEra(era === '__lingering' ? null : '__lingering')}>
                            Still fading <span className="lost-chips__n">{counts.lingering}</span>
                          </button>
                        )}
                      </div>
                      {counts.tags.length > 1 && (
                        <div className="lost-chips" role="group" aria-label="Themes">
                          <span className="lost-chips__label mono">Theme</span>
                          {counts.tags.map(([t, c]) => (
                            <button key={t} type="button" className={`chip ${tag === t ? 'is-on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                              {t.replace(/-/g, ' ')} <span className="lost-chips__n">{c}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <AnimatePresence>
                        {anyFilter && (
                          <motion.div className="lost-active" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            {century !== null && (
                              <button type="button" className="chip is-on" onClick={() => setCentury(null)} aria-label={`Remove filter: died in the ${century}s`}>
                                Died in the {century}s <span aria-hidden="true">×</span>
                              </button>
                            )}
                            <button type="button" className="lost-active__reset" onClick={reset}>Clear filters</button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  <div ref={gridRef} className="lost-grid" style={{ '--cols': cols } as React.CSSProperties}>
                    <LayoutGroup>
                      {columns.map((col, ci) => (
                        <div key={ci} className="lost-grid__col">
                          <AnimatePresence mode="popLayout">
                            {col.map(({ w, i }) => (
                              <LostCard key={w.id} w={w} index={i % PAGE} />
                            ))}
                          </AnimatePresence>
                        </div>
                      ))}
                    </LayoutGroup>
                  </div>

                  {filtered.length === 0 && (
                    <p className="lost__none">
                      No lost words match that. <button type="button" onClick={reset}>Clear filters</button>
                    </p>
                  )}

                  {filtered.length > shown && (
                    <div className="lost__more">
                      <button type="button" className="btn btn--ghost" onClick={() => setShown((s) => s + PAGE)}>
                        Show {Math.min(PAGE, filtered.length - shown)} more
                        <span className="lost__more-n mono">{filtered.length - shown} left</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
