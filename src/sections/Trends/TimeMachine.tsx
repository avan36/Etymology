import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'framer-motion';
import { data, wordColor } from '../../data';
import type { Word } from '../../data';
import { href } from '../../lib/router';
import { prefersReducedMotion } from '../../lib/theme';
import { endYear, eraAt, firstUsageYear, hasUsage, peakYear, timeScale } from './curves';

const RES = 1000;
const MAX_CHIPS = 7;
const K = 0.95;

interface Column {
  key: 'born' | 'peak' | 'died';
  title: string;
  hint: string;
  items: { w: Word; year: number }[];
  more: number;
  next?: { w: Word; year: number };
}

/** Drag through the centuries and watch words being born, peaking, and falling silent. */
export default function TimeMachine() {
  const end = endYear();
  const start = useMemo(() => {
    const min = Math.min(700, ...data.words.map((w) => w.first));
    return Math.max(450, Math.floor(min / 50) * 50);
  }, []);
  const s = useMemo(() => timeScale(start, end, 0, 1, K), [start, end]);
  const [p, setP] = useState(() => s(1066));
  const [playing, setPlaying] = useState(false);
  const pRef = useRef(p);
  pRef.current = p;
  const year = Math.round(s.invert(p));

  // How wide "around this year" is: a few percent of the slider, so it scales with the axis.
  const win = Math.max(1, (s.invert(Math.min(1, p + 0.022)) - s.invert(Math.max(0, p - 0.022))) / 2);

  const peaks = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data.words) {
      if (!hasUsage(w)) continue;
      const py = peakYear(w);
      if (py === firstUsageYear(w) && py <= start + 60) continue; // the data simply starts at its height
      m.set(w.id, py);
    }
    return m;
  }, [start]);

  const cols: Column[] = useMemo(() => {
    const near = (get: (w: Word) => number | undefined) => {
      const all = data.words
        .map((w) => ({ w, year: get(w) }))
        .filter((x): x is { w: Word; year: number } => x.year !== undefined);
      const hits = all
        .filter((x) => Math.abs(x.year - year) <= win)
        .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || Number(!!b.w.featured) - Number(!!a.w.featured));
      const next = all.filter((x) => x.year > year + win).sort((a, b) => a.year - b.year)[0];
      return { items: hits.slice(0, MAX_CHIPS).sort((a, b) => a.year - b.year), more: Math.max(0, hits.length - MAX_CHIPS), next };
    };
    return [
      { key: 'born', title: 'Born', hint: 'first recorded around now', ...near((w) => w.first) },
      { key: 'peak', title: 'In their prime', hint: 'at the height of their use', ...near((w) => peaks.get(w.id)) },
      { key: 'died', title: 'Fell silent', hint: 'last heard around now', ...near((w) => w.died) },
    ];
  }, [year, win, peaks]);

  const alive = useMemo(() => data.words.filter((w) => w.first <= year && !(w.died !== undefined && w.died <= year)).length, [year]);
  const era = eraAt(year);
  const event = data.events.find((e) => Math.abs(e.year - year) <= Math.max(12, win * 1.2));

  // Track art: a ridge of how many new words appeared at each point, plus a tick per birth/loss.
  const track = useMemo(() => {
    const N = 240;
    const sigma = 0.014;
    const bx = data.words.map((w) => s(Math.max(start, w.first)));
    const dens = Array.from({ length: N + 1 }, (_, i) => {
      const x = i / N;
      let v = 0;
      for (const b of bx) { const d = (x - b) / sigma; if (d > -4 && d < 4) v += Math.exp(-0.5 * d * d); }
      return v;
    });
    const max = Math.max(1e-6, ...dens);
    const pts = dens.map((v, i) => [(i / N) * 1000, 58 - Math.pow(v / max, 0.8) * 50] as const);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const area = `${line}L1000,60L0,60Z`;
    const births = data.words.map((w) => ({ id: w.id, x: s(Math.max(start, w.first)) * 1000, c: wordColor(w) }));
    const deaths = data.words.filter((w) => w.died !== undefined).map((w) => ({ id: w.id, x: s(w.died!) * 1000 }));
    return { line, area, births, deaths };
  }, [s, start]);

  // Autoplay: sweep forward through time (slider-linear, so modern decades get their due).
  useEffect(() => {
    if (!playing) return;
    if (pRef.current >= 0.999) setP(0);
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const next = Math.min(1, pRef.current + dt / 28);
      setP(next);
      if (next >= 1) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const jumpTo = (y: number) => {
    setPlaying(false);
    const target = s(y);
    if (prefersReducedMotion()) { setP(target); return; }
    animate(pRef.current, target, { duration: 1.1, ease: [0.65, 0, 0.35, 1], onUpdate: setP });
  };

  const ticks = [700, 1066, 1300, 1500, 1700, 1800, 1900, 1950, 2000].filter((t) => t >= start && t <= end);

  return (
    <motion.div
      className="tm"
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="tm__intro">
        <p className="tm__eyebrow mono">Time machine</p>
        <p className="tm__lede">Drag through thirteen centuries. Watch words arrive, hit their stride, and fall silent.</p>
      </div>

      <div className="tm__top">
        <div className="tm__yearbox">
          <RollingYear value={year} />
          <div className="tm__context">
            <span className="tm__era mono">{era?.name}</span>
            <span className="tm__alive">
              <b>{alive.toLocaleString('en-US')}</b> of our {data.words.length.toLocaleString('en-US')} words in use
            </span>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {event ? (
            <motion.div
              key={event.year}
              className="tm__event"
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.4 }}
            >
              <span className="mono">{event.year}</span>
              <strong>{event.title}</strong>
              <p>{event.blurb}</p>
            </motion.div>
          ) : (
            <motion.div key="none" className="tm__event tm__event--empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          )}
        </AnimatePresence>
      </div>

      <div className="tm__track">
        <svg viewBox="0 0 1000 72" preserveAspectRatio="none" className="tm__art" aria-hidden="true">
          <defs>
            <linearGradient id="tm-pop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.01" />
            </linearGradient>
            <clipPath id="tm-past-clip">
              <rect x="0" y="0" width={p * 1000} height="72" />
            </clipPath>
          </defs>
          <path d={track.area} fill="url(#tm-pop)" />
          <path d={track.line} className="tm__ridge" />
          <path d={track.line} className="tm__ridge tm__ridge--past" clipPath="url(#tm-past-clip)" />
          {track.births.map((b) => (
            <line key={b.id} x1={b.x} x2={b.x} y1={60} y2={66} style={{ stroke: b.c }} className="tm__birth" />
          ))}
          {track.deaths.map((d) => (
            <line key={d.id} x1={d.x} x2={d.x} y1={66} y2={72} className="tm__death" />
          ))}
        </svg>
        <div className="tm__rail" aria-hidden="true">
          <div className="tm__fill" style={{ transform: `scaleX(${p})` }} />
        </div>
        <input
          type="range"
          className="tm__range"
          min={0}
          max={RES}
          step={1}
          value={Math.round(p * RES)}
          onChange={(e) => { setPlaying(false); setP(Number(e.target.value) / RES); }}
          aria-label="Year"
          aria-valuetext={`${year}${event ? `, ${event.title}` : ''}`}
        />
        <div className="tm__ticks" aria-hidden="true">
          {ticks.map((t) => (
            <button key={t} type="button" tabIndex={-1} className={[1300, 1700, 1900, 1950].includes(t) ? 'is-minor' : ''} style={{ left: `${s(t) * 100}%` }} onClick={() => jumpTo(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="tm__controls">
        <button type="button" className="btn tm__play" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="1.5" width="3.5" height="11" rx="1" fill="currentColor" /><rect x="8.5" y="1.5" width="3.5" height="11" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.8v10.4a.6.6 0 0 0 .9.5l8.4-5.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
          )}
          {playing ? 'Pause' : p >= 0.999 ? 'Replay history' : 'Play history'}
        </button>
        <span className="tm__window mono">± {win < 10 ? Math.max(1, Math.round(win)) : Math.round(win / 5) * 5} years</span>
        <span className="tm__legend" aria-hidden="true">
          <span><i className="tm__lg-ridge" />new words</span>
          <span><i className="tm__lg-birth" />first recorded</span>
          <span><i className="tm__lg-death" />last heard</span>
        </span>
      </div>

      <div className="tm__cols">
        {cols.map((c) => (
          <section key={c.key} className={`tm__col tm__col--${c.key}`} aria-label={c.title}>
            <header>
              <h4>{c.title}</h4>
              <span className="tm__count mono">{c.items.length + c.more}</span>
            </header>
            <p className="tm__hint">{c.hint}</p>
            <motion.ul className="tm__chips" layout>
              <AnimatePresence mode="popLayout" initial={false}>
                {c.items.map(({ w, year: y }) => (
                  <motion.li
                    key={w.id}
                    layout
                    initial={{ opacity: 0, y: 14, scale: 0.86, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -12, scale: 0.86, filter: 'blur(4px)' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  >
                    <a href={href.word(w.id)} className="tm__chip" style={{ '--c': wordColor(w) } as React.CSSProperties}>
                      <span className="dot" />
                      <span className="tm__chip-word">{w.word}</span>
                      <span className="tm__chip-year mono">{y}</span>
                    </a>
                  </motion.li>
                ))}
                {c.more > 0 && (
                  <motion.li key="more" layout className="tm__more mono" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    +{c.more} more
                  </motion.li>
                )}
                {c.items.length === 0 && (
                  <motion.li key="empty" layout className="tm__empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {c.next ? (
                      <button type="button" onClick={() => jumpTo(c.next!.year)}>
                        Quiet here. Next: <em>{c.next.w.word}</em>, {c.next.year} →
                      </button>
                    ) : (
                      <span>Quiet here.</span>
                    )}
                  </motion.li>
                )}
              </AnimatePresence>
            </motion.ul>
          </section>
        ))}
      </div>
    </motion.div>
  );
}

/** A big year whose digits roll like an odometer. */
function RollingYear({ value }: { value: number }) {
  const digits = String(Math.abs(value)).padStart(4, ' ').split('');
  return (
    <span className="tm-year" aria-live="off" aria-label={String(value)}>
      {digits.map((ch, i) => (
        <span key={i} className={`tm-digit ${ch === ' ' ? 'is-empty' : ''}`}>
          <span className="tm-digit__strip" style={{ transform: `translateY(${ch === ' ' ? 0 : -Number(ch) * 10}%)` }}>
            {Array.from({ length: 10 }, (_, d) => (
              <span key={d}>{d}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
