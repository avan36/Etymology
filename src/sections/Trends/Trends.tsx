import { useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { data, wordStream } from '../../data';
import type { StreamId, Word } from '../../data';
import UsageChart from './UsageChart';
import type { Series } from './UsageChart';
import WordPicker from './WordPicker';
import Movers from './Movers';
import TimeMachine from './TimeMachine';
import { buildPresets } from './presets';
import { endYear, firstUsageYear, hasUsage } from './curves';
import './trends.css';

const MAX_WORDS = 8;

interface Sel {
  id: string;
  /** Variant within its stream, so two words of the same colour stay tellable apart. Fixed at add time. */
  v: number;
}

const rise = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const },
};

function styleFor(stream: StreamId, v: number): { color: string; dash?: string } {
  const base = `var(--s-${stream})`;
  const dark = `color-mix(in oklab, ${base} 52%, var(--ink))`;
  const light = `color-mix(in oklab, ${base} 50%, var(--paper))`;
  const table = [
    { color: base },
    { color: dark },
    { color: base, dash: '7 5' },
    { color: dark, dash: '7 5' },
    { color: light },
    { color: base, dash: '1.5 4.5' },
  ];
  return table[v % table.length];
}

const streamOf = (id: string) => wordStream(data.word.get(id)!);

function nextVariant(cur: Sel[], w: Word): number {
  const used = new Set(cur.filter((s) => streamOf(s.id) === wordStream(w)).map((s) => s.v));
  let v = 0;
  while (used.has(v)) v++;
  return v;
}

function assign(ids: string[]): Sel[] {
  const out: Sel[] = [];
  for (const id of ids) {
    const w = data.word.get(id);
    if (w) out.push({ id, v: nextVariant(out, w) });
  }
  return out;
}

export default function Trends() {
  const pool = useMemo(() => data.words.filter(hasUsage).sort((a, b) => a.word.localeCompare(b.word)), []);
  const presets = useMemo(() => buildPresets(), []);
  const fallback = useMemo(
    () => pool.filter((w) => w.featured).concat(pool.filter((w) => !w.featured)).slice(0, 4).map((w) => w.id),
    [pool],
  );
  const [presetId, setPresetId] = useState<string | null>(presets[0]?.id ?? null);
  const [sel, setSel] = useState<Sel[]>(() => assign(presets[0]?.words ?? fallback));
  const [k, setK] = useState(1);
  const [focusId, setFocusId] = useState<string | null>(null);

  const preset = presets.find((p) => p.id === presetId);
  const series: Series[] = useMemo(
    () =>
      sel
        .map((s) => {
          const w = data.word.get(s.id);
          return w ? { w, ...styleFor(wordStream(w), s.v) } : null;
        })
        .filter((x): x is Series => !!x),
    [sel],
  );

  const end = endYear();
  const d0 = useMemo(() => {
    if (!series.length) return 700;
    const min = Math.min(...series.map((s) => firstUsageYear(s.w)));
    const step = end - min > 300 ? 50 : 10;
    return Math.max(450, Math.floor(min / step) * step);
  }, [series, end]);

  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setPresetId(id);
    setFocusId(null);
    setSel(assign(p.words));
  };
  const add = (w: Word) => {
    setPresetId(null);
    setSel((cur) => (cur.some((s) => s.id === w.id) || cur.length >= MAX_WORDS ? cur : [...cur, { id: w.id, v: nextVariant(cur, w) }]));
  };
  const remove = (id: string) => {
    setPresetId(null);
    setFocusId(null);
    setSel((cur) => cur.filter((s) => s.id !== id));
  };
  const selectedIds = useMemo(() => new Set(sel.map((s) => s.id)), [sel]);

  return (
    <MotionConfig reducedMotion="user">
      <section id="trends" className="section trends" aria-labelledby="trends-title">
        <div className="page">
          <motion.header className="section__head" {...rise}>
            <p className="section__eyebrow">Chapter 4 · Popularity</p>
            <h2 id="trends-title" className="section__title">
              Words <em>rise</em>. Words fall.
            </h2>
            <p className="section__lede">
              Every word has a life: a first appearance, a heyday, and for some a long, slow goodbye. Put a few side by
              side and watch their fortunes cross over thirteen centuries.
            </p>
          </motion.header>

          {pool.length === 0 ? (
            <p className="muted">Usage curves are on their way.</p>
          ) : (
            <>
              {presets.length > 0 && (
                <motion.div className="tr-presets" role="toolbar" aria-label="Stories to compare" {...rise} transition={{ ...rise.transition, delay: 0.1 }}>
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip tr-preset ${p.id === presetId ? 'is-on' : ''}`}
                      aria-pressed={p.id === presetId}
                      onClick={() => applyPreset(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </motion.div>
              )}

              <motion.div className="tr-stage card" {...rise} transition={{ ...rise.transition, delay: 0.15 }}>
                <div className="tr-stage__top">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={preset?.id ?? 'custom'}
                      className="tr-caption"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.3 }}
                    >
                      {preset ? preset.blurb : 'Your own comparison. Hover the chart to read any year; click a name to open its story.'}
                    </motion.p>
                  </AnimatePresence>
                  <div className="tr-legend" aria-label="Words on the chart">
                    <AnimatePresence initial={false} mode="popLayout">
                      {series.map((s) => (
                        <motion.span
                          key={s.w.id}
                          layout
                          className={`tr-pill ${focusId === s.w.id ? 'is-focus' : ''}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                          onPointerEnter={() => setFocusId(s.w.id)}
                          onPointerLeave={() => setFocusId(null)}
                        >
                          <svg width="18" height="6" aria-hidden="true" className="tr-pill__key">
                            <line x1="1" x2="17" y1="3" y2="3" style={{ stroke: s.color, strokeDasharray: s.dash ? '4 3' : undefined }} />
                          </svg>
                          <span>{s.w.word}</span>
                          <button
                            type="button"
                            onClick={() => remove(s.w.id)}
                            aria-label={`Remove ${s.w.word}`}
                            onFocus={() => setFocusId(s.w.id)}
                            onBlur={() => setFocusId(null)}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                        </motion.span>
                      ))}
                      <motion.span layout key="__picker" className="tr-legend__picker">
                        <WordPicker
                          pool={pool}
                          selected={selectedIds}
                          onAdd={add}
                          onRemoveLast={() => sel.length && remove(sel[sel.length - 1].id)}
                          full={sel.length >= MAX_WORDS}
                        />
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>

                <UsageChart series={series} d0={d0} d1={end} k={k} focusId={focusId} onFocus={setFocusId} />

                <div className="tr-foot">
                  <p className="tr-note">
                    <span className="tr-note__mark" aria-hidden="true">*</span>
                    Estimated shape of each word&rsquo;s popularity, relative to its own peak (100). Curves are hand-curated
                    estimates, not measured frequencies: compare shapes and timing, not heights.
                  </p>
                  <div className="tr-scale" role="radiogroup" aria-label="Time scale">
                    <button type="button" role="radio" aria-checked={k === 1} className={k === 1 ? 'is-on' : ''} onClick={() => setK(1)}>
                      Recent zoom
                    </button>
                    <button type="button" role="radio" aria-checked={k === 0} className={k === 0 ? 'is-on' : ''} onClick={() => setK(0)}>
                      Even years
                    </button>
                  </div>
                </div>
              </motion.div>

              <Movers />
            </>
          )}

          <TimeMachine />
        </div>
      </section>
    </MotionConfig>
  );
}
