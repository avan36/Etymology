import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { findWord, wordColor } from '../../data';
import type { Word } from '../../data';
import { href } from '../../lib/router';
import { prefersReducedMotion } from '../../lib/theme';
import { WordLink } from '../../ui/WordLink';
import { deathEra, lifespan, oldForm, rand, statusLabel, yearsLived } from './lostUtil';
import Lifespan from './Lifespan';
import type { BurstFn } from './Embers';

const CYCLE = 8000;

/** One lost word at a time, dissolving into embers and condensing out of the dark. */
export default function Featured({ words, burstRef }: { words: Word[]; burstRef: React.RefObject<BurstFn | null> }) {
  // Featured words first, then the ones with the richest stories.
  const order = useMemo(
    () => [...words].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || b.story.length - a.story.length),
    [words],
  );
  const [i, setI] = useState(() => (order.length > 1 ? Math.floor(Math.random() * Math.min(order.length, 8)) : 0));
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [revived, setRevived] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLHeadingElement>(null);
  const inView = useInView(boxRef, { margin: '-20% 0px' });
  const reduced = prefersReducedMotion();
  const w = order[i % Math.max(1, order.length)];
  const cycling = order.length > 1 && inView && !paused && !hovered && !revived;

  const go = (next: number, burst = 46) => {
    if (!order.length) return;
    const r = (wordRef.current?.querySelector('.lost-feature__letters') ?? wordRef.current)?.getBoundingClientRect();
    if (r) burstRef.current?.(r, burst);
    setCopied(false);
    setI(((next % order.length) + order.length) % order.length);
  };

  useEffect(() => {
    if (!cycling) return;
    const t = setTimeout(() => go(i + 1), CYCLE);
    return () => clearTimeout(t);
  }, [cycling, i]);

  if (!w) return null;

  const revive = () => {
    let j = i;
    if (order.length > 1) while (j === i) j = Math.floor(Math.random() * order.length);
    setRevived(order[j].id);
    go(j, 90);
  };
  const copy = async () => {
    const text = `${w.word}${w.pos ? ` (${w.pos})` : ''}: ${w.gloss}. ${lifespan(w)}. Bring it back. ${location.origin}${location.pathname}${href.word(w.id)}`;
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked: the message still nudges */ }
    setCopied(true);
  };

  const old = oldForm(w);
  const era = deathEra(w);
  const lived = yearsLived(w);
  const by = w.replacedBy;
  const byWord = by ? findWord(by) : undefined;
  const letters = [...w.word];
  const size = letters.length > 12 ? 'is-long' : letters.length > 8 ? 'is-mid' : '';

  return (
    <motion.div
      ref={boxRef}
      className="lost-feature"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      style={{ '--c': wordColor(w) } as React.CSSProperties}
    >
      <p className="lost-feature__label mono">
        <span className="lost-feature__pulse" aria-hidden="true" />
        {revived === w.id ? 'Revived' : 'Word of the moment'}
      </p>

      <h3 ref={wordRef} className={`lost-feature__word ${size}`} aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.a key={w.id} href={href.word(w.id)} className="lost-feature__letters" aria-label={w.word}>
            {letters.map((ch, k) => (
              <motion.span
                key={k}
                aria-hidden="true"
                initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(18px)', y: 22, scale: 1.08 }}
                animate={{
                  opacity: 1, filter: 'blur(0px)', y: 0, scale: 1,
                  transition: { delay: 0.1 + rand(k + 1) * 0.5, duration: reduced ? 0.3 : 1.1, ease: [0.16, 1, 0.3, 1] },
                }}
                exit={
                  reduced
                    ? { opacity: 0, transition: { duration: 0.2 } }
                    : { opacity: 0, filter: 'blur(14px)', y: -18 - rand(k + 7) * 20, x: (rand(k + 3) - 0.5) * 30, transition: { delay: rand(k + 11) * 0.35, duration: 0.7, ease: [0.4, 0, 1, 1] } }
                }
              >
                {ch === ' ' ? ' ' : ch}
              </motion.span>
            ))}
          </motion.a>
        </AnimatePresence>
      </h3>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={w.id}
          className="lost-feature__body"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: reduced ? 0 : 0.45, duration: 0.7, ease: [0.16, 1, 0.3, 1] } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.35 } }}
        >
          <p className="lost-feature__meta">
            {old && (
              <span className="lost-feature__old">
                {old.lang} <span className="old">{old.form}</span>
              </span>
            )}
            {w.pos && <span className="lost-feature__pos">{w.pos}</span>}
          </p>
          <p className="lost-feature__gloss">{w.gloss}</p>
          <div className="lost-feature__life">
            <span className="mono">{lifespan(w)}</span>
            <Lifespan w={w} big />
            <span className="mono lost-feature__lived">
              {lived !== undefined ? `${lived} years` : statusLabel(w)}
              {era ? ` · died in ${era.name}` : ''}
            </span>
          </div>
          <p className="lost-feature__story">{w.story}</p>
          {by && (
            <p className="lost-feature__by">
              Replaced by {byWord ? <WordLink word={byWord.id} /> : <em>{by}</em>}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="lost-feature__actions">
        <button type="button" className="btn lost-revive" onClick={revive} disabled={order.length < 2 && revived === w.id}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5z" fill="currentColor" />
            <circle cx="13" cy="13" r="1.2" fill="currentColor" />
          </svg>
          Revive a word
        </button>
        <button type="button" className="btn btn--ghost lost-use" onClick={copy}>
          {copied ? 'Copied. Now use it in a sentence.' : 'Use it today'}
        </button>
        {order.length > 1 && (
          <div className="lost-feature__nav">
            <button type="button" onClick={() => go(i - 1)} aria-label="Previous word">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" onClick={() => { setPaused((p) => !p); setRevived(null); }} aria-label={paused ? 'Resume cycling' : 'Pause cycling'} aria-pressed={paused}>
              {paused || revived ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 2v10l8-5z" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="2" width="2.6" height="10" rx="1" fill="currentColor" /><rect x="8.4" y="2" width="2.6" height="10" rx="1" fill="currentColor" /></svg>
              )}
            </button>
            <button type="button" onClick={() => go(i + 1)} aria-label="Next word">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="lost-feature__count mono">
              {String((i % order.length) + 1).padStart(2, '0')} / {String(order.length).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
      {order.length > 1 && (
        <div className="lost-feature__progress" aria-hidden="true">
          <span key={`${w.id}-${cycling}`} className={cycling ? 'is-running' : ''} style={{ animationDuration: `${CYCLE}ms` }} />
        </div>
      )}
    </motion.div>
  );
}
