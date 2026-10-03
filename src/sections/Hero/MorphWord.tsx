/**
 * The hero's centrepiece: a giant word that morphs through its history letter by letter.
 * Shared letters stay put and glide to their new place; new letters ink in (tinted by the
 * stream they arrived through, then drying to ink); lost letters blur away.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { formatYear, langColor, langName, langStream } from '../../data';
import type { StreamId } from '../../data';
import { href } from '../../lib/router';
import { PauseIcon, PlayIcon } from '../../search/icons';
import { alignGlyphs, freshGlyphs } from './stages';
import type { Glyph, MorphEntry, MorphStage } from './stages';

interface State { wi: number; si: number; glyphs: Glyph[]; stamp: number }

const yearLabel = (y?: number) => (typeof y === 'number' ? formatYear(y, y <= 1000) : 'Today');

const glyphVariants: Variants = {
  enter: { opacity: 0, y: '0.34em', scale: 0.9, filter: 'blur(14px)' },
  show: (i: number) => ({
    opacity: 1,
    y: '0em',
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      delay: 0.08 + i * 0.045,
      y: { type: 'spring', stiffness: 160, damping: 19, mass: 0.9 },
      scale: { type: 'spring', stiffness: 160, damping: 19 },
      opacity: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] },
      filter: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] },
    },
  }),
  exit: (i: number) => ({
    opacity: 0,
    y: '-0.3em',
    scale: 1.06,
    filter: 'blur(14px)',
    transition: { duration: 0.42, delay: Math.min(i, 8) * 0.012, ease: [0.4, 0, 1, 1] },
  }),
};

const reducedVariants: Variants = {
  enter: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

export default function MorphWord({
  entries,
  onStage,
}: {
  entries: MorphEntry[];
  onStage?: (stage: MorphStage, stream: StreamId) => void;
}) {
  const reduce = !!useReducedMotion();
  const [st, setSt] = useState<State>(() => {
    const s0 = entries[0]?.stages[0];
    return { wi: 0, si: 0, glyphs: s0 ? freshGlyphs(s0.text, s0.whole, 1) : [], stamp: 1 };
  });
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [docVisible, setDocVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  const entry = entries[st.wi];
  const stage = entry?.stages[st.si];
  const stream = stage ? langStream(stage.lang) : 'english';
  const color = stage ? langColor(stage.lang) : 'var(--ink)';

  const goTo = useCallback((wi: number, si: number) => {
    setSt((prev) => {
      const e = entries[wi];
      const s = e?.stages[si];
      if (!s) return prev;
      const stamp = prev.stamp + 1;
      const glyphs = wi !== prev.wi ? freshGlyphs(s.text, s.whole, stamp) : alignGlyphs(prev.glyphs, s.text, s.whole, stamp);
      return { wi, si, glyphs, stamp };
    });
  }, [entries]);

  const advance = useCallback(() => {
    setSt((prev) => {
      const e = entries[prev.wi];
      if (!e) return prev;
      const lastStage = prev.si >= e.stages.length - 1;
      const wi = lastStage ? (prev.wi + 1) % entries.length : prev.wi;
      const si = lastStage ? 0 : prev.si + 1;
      const s = entries[wi]?.stages[si];
      if (!s) return prev;
      const stamp = prev.stamp + 1;
      const glyphs = wi !== prev.wi || lastStage ? freshGlyphs(s.text, s.whole, stamp) : alignGlyphs(prev.glyphs, s.text, s.whole, stamp);
      return { wi, si, glyphs, stamp };
    });
  }, [entries]);

  // Report the stage upward (wordmark ink, background ribbons).
  useEffect(() => { if (stage) onStage?.(stage, stream); }, [stage, stream, onStage]);

  // Autoplay.
  const paused = userPaused || hovered || !onScreen || !docVisible;
  useEffect(() => {
    if (paused || !entry || !stage) return;
    const last = st.si === entry.stages.length - 1;
    let ms = st.si === 0 ? 2700 : stage.same ? 1500 : 2300;
    if (last) ms = 3900;
    if (reduce) ms *= 1.5;
    const t = window.setTimeout(advance, ms);
    return () => window.clearTimeout(t);
  }, [paused, st.wi, st.si, entry, stage, advance, reduce]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    const vis = () => setDocVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // Fit: one size per word, so it never jumps between stages of the same word.
  const measure = useCallback(() => {
    const box = boxRef.current;
    const m = measureRef.current;
    if (!box || !m) return;
    let widest = 1;
    for (const c of Array.from(m.children)) widest = Math.max(widest, (c as HTMLElement).scrollWidth);
    const avail = box.clientWidth * 0.96;
    setFit(Math.max(0.28, Math.min(1, avail / widest)));
  }, []);
  useLayoutEffect(measure, [measure, st.wi]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box);
    document.fonts?.ready.then(measure).catch(() => {});
    document.fonts?.addEventListener?.('loadingdone', measure);
    return () => { ro.disconnect(); document.fonts?.removeEventListener?.('loadingdone', measure); };
  }, [measure]);

  if (!entry || !stage) return null;
  const first = entry.stages[0];
  const label = `${entry.word.word}: from ${langName(first.lang)} ${first.text}${first.year !== undefined ? ` (${yearLabel(first.year)})` : ''} to English ${entry.word.word}. Open its story.`;

  return (
    <div
      className="hm"
      ref={rootRef}
      style={{ '--c': color } as React.CSSProperties}
    >
      <div className="hm-eyebrow" aria-hidden>
        <span className="hm-eyebrow__rule" />
        <span>Tracing</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.em
            key={entry.word.id}
            className="hm-eyebrow__word"
            initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {entry.word.word}
          </motion.em>
        </AnimatePresence>
        <span className="hm-eyebrow__rule" />
      </div>

      <div className="hm-box" ref={boxRef}>
        <a
          className="hm-word"
          href={href.word(entry.word.id)}
          aria-label={label}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
          onPointerLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
        >
          <span className="hm-line" style={{ fontSize: `calc(var(--hm-size) * ${fit.toFixed(3)})` }} aria-hidden>
            <AnimatePresence mode="popLayout" custom={0}>
              {st.glyphs.map((g, i) => (
                <motion.span
                  key={g.key}
                  className={`hm-g${g.ch.length > 2 ? ' is-whole' : ''}${g.ch === '*' ? ' is-star' : ''}${g.ch === '-' && (i === 0 || i === st.glyphs.length - 1) ? ' is-mark' : ''}`}
                  layout={reduce ? false : 'position'}
                  custom={i}
                  variants={reduce ? reducedVariants : glyphVariants}
                  initial="enter"
                  animate="show"
                  exit="exit"
                  transition={{ layout: { type: 'spring', stiffness: 150, damping: 22, mass: 1 } }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={g.ch}
                      className={`hm-ch${g.stamp === st.stamp ? ' is-fresh' : ''}`}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: '-0.22em', filter: 'blur(10px)' }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, y: '0em', filter: 'blur(0px)' }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: '0.22em', filter: 'blur(10px)' }}
                      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      {g.ch === ' ' ? ' ' : g.ch}
                    </motion.span>
                  </AnimatePresence>
                </motion.span>
              ))}
            </AnimatePresence>
          </span>
          <span className="hm-open" aria-hidden>Open the story →</span>
        </a>
        <div className="hm-measure" ref={measureRef} aria-hidden>
          {entry.stages.map((s, i) => <span key={i}>{s.text}</span>)}
        </div>
      </div>

      <div className="hm-meta">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${st.wi}-${st.si}`}
            className="hm-label"
            initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
            transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="dot" />
            <span className="hm-label__lang">{langName(stage.lang)}</span>
            <span className="hm-label__sep">·</span>
            <span className="hm-label__year">{yearLabel(stage.year)}</span>
            {stage.native && <bdi className="hm-label__native old">{stage.native}</bdi>}
            {stage.meaning && <span className="hm-label__mean">“{stage.meaning}”</span>}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="hm-steps">
        <ol className="hm-dots" aria-label={`Stages of ${entry.word.word}`}>
          {entry.stages.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className={`hm-dot${i === st.si ? ' is-on' : ''}${i < st.si ? ' is-past' : ''}`}
                style={{ '--c': langColor(s.lang) } as React.CSSProperties}
                onClick={() => goTo(st.wi, i)}
                aria-label={`${langName(s.lang)}, ${yearLabel(s.year)}: ${s.text}`}
                aria-current={i === st.si ? 'step' : undefined}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="hm-pause"
          onClick={() => setUserPaused((p) => !p)}
          aria-label={userPaused ? 'Play the word animation' : 'Pause the word animation'}
          aria-pressed={userPaused}
        >
          {userPaused ? <PlayIcon size={13} /> : <PauseIcon size={13} />}
        </button>
        <button type="button" className="hm-next" onClick={() => goTo((st.wi + 1) % entries.length, 0)} aria-label="Next word">
          Next word
        </button>
      </div>
    </div>
  );
}
