/**
 * The first impression. Calm and centred like a search homepage, with a living centrepiece:
 * a giant word morphing through its history over drifting ink ribbons in the stream colours.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { data } from '../../data';
import type { StreamId } from '../../data';
import { go, href } from '../../lib/router';
import { STREAM } from '../../lib/streams';
import { earliestYear, moods, randomWord, usedLanguages } from '../../search/engine';
import type { Mood } from '../../search/engine';
import { ArrowIcon, DiceIcon } from '../../search/icons';
import InkRibbons from './InkRibbons';
import MorphWord from './MorphWord';
import HeroSearch from './HeroSearch';
import { heroWords } from './stages';
import type { MorphStage } from './stages';
import './hero.css';

const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 120, damping: 20, mass: 0.9 } },
};
/** Section links: re-clicking the current hash wouldn't fire hashchange, so scroll ourselves. */
function toRiver(e: React.MouseEvent) {
  if (window.location.hash === href.section('river')) {
    e.preventDefault();
    document.getElementById('river')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

const riseReduced: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.5 } } };

export default function Hero() {
  const reduce = !!useReducedMotion();
  const entries = useMemo(() => heroWords(data.words), []);
  const [stream, setStream] = useState<StreamId | undefined>(undefined);
  const onStage = useCallback((_s: MorphStage, st: StreamId) => setStream(st), []);
  const v = reduce ? riseReduced : rise;
  const inkColor = stream ? STREAM[stream].color : 'var(--accent)';

  return (
    <section id="top" className="hero" aria-label="Etymon">
      <div className="hero-ink" aria-hidden>
        <InkRibbons active={stream} />
        <div className="hero-ink__veil" />
      </div>

      <motion.div
        className="hero-inner"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0.05 : 0.11, delayChildren: 0.1 } } }}
      >
        <motion.h1 className="hero-mark" id="hero-mark" variants={v} style={{ '--c': inkColor } as React.CSSProperties}>
          <span className="sr-only">Etymon</span>
          <span className="hero-mark__word" aria-hidden>
            {'Etym'.split('').map((c, i) => <span key={i} className="hero-mark__l" style={{ animationDelay: `${0.12 + i * 0.07}s` }}>{c}</span>)}
            <span className="hero-mark__l hero-mark__o" style={{ animationDelay: '0.4s' }}>o<span className="hero-mark__drop" /></span>
            <span className="hero-mark__l" style={{ animationDelay: '0.47s' }}>n</span>
          </span>
        </motion.h1>

        <motion.p className="hero-tag" variants={v}>
          Every word is a <em>time machine.</em>
        </motion.p>
        <motion.p className="hero-sub" variants={v}>Trace any word back thousands of years, in English or 50 other languages.</motion.p>

        <motion.div className="hero-morph" variants={v}>
          {entries.length > 0 && <MorphWord entries={entries} onStage={onStage} />}
        </motion.div>

        <motion.div className="hero-search" variants={v}>
          <HeroSearch />
        </motion.div>

        <motion.div className="hero-actions" variants={v}>
          <a className="hero-btn" href={href.section('river')} onClick={toRiver}>
            <span>Explore the river</span>
            <ArrowIcon size={16} className="hero-btn__arrow" />
          </a>
          <CuriousButton />
        </motion.div>

        <motion.div variants={v}>
          <Stats />
        </motion.div>
      </motion.div>

      <motion.a
        className="hero-cue"
        href={href.section('river')}
        onClick={toRiver}
        aria-label="Scroll to the River of English"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 1.6, duration: 0.8 }}
      >
        <span className="hero-cue__txt">Scroll</span>
        <span className="hero-cue__line" />
      </motion.a>
    </section>
  );
}

/* ── I'm feeling curious ─────────────────────────────────────────── */

function CuriousButton() {
  const reduce = useReducedMotion();
  const all = useMemo(() => moods(), []);
  const [mood, setMood] = useState<Mood | null>(null);
  const [spin, setSpin] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const onEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !all.length || reduce) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMood(all[Math.floor(Math.random() * all.length)]), 650);
  };
  const onLeave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMood(null), 300);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = () => {
    setSpin((s) => s + 1);
    const w = randomWord(mood?.pool.length ? mood.pool : data.words);
    if (w) go(href.word(w.id));
  };
  const label = mood ? mood.label : 'curious';

  return (
    <button
      type="button"
      className="hero-btn hero-btn--curious"
      onClick={onClick}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      aria-label={`I'm feeling ${label}: open a random${mood ? ` ${mood.label}` : ''} word`}
    >
      <motion.span className="hero-btn__dice" animate={{ rotate: spin * 180 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}>
        <DiceIcon size={16} />
      </motion.span>
      <span>I’m feeling</span>
      <span className="hero-btn__slot">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            className="hero-btn__mood"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-110%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

/* ── Stats with a count-up ──────────────────────────────────────── */

function useCountUp(target: number, delay = 900, duration = 1700) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setV(target); return; }
    let raf = 0;
    let start = 0;
    const t = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const p = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(2, -10 * p);
        setV(Math.round(target * (p === 1 ? 1 : e)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { window.clearTimeout(t); cancelAnimationFrame(raf); };
  }, [target, delay, duration, reduce]);
  return v;
}

function Stats() {
  const words = data.words.length;
  const langs = useMemo(() => usedLanguages(), []);
  const span = useMemo(() => {
    const s = new Date().getFullYear() - earliestYear();
    return s >= 1000 ? Math.floor(s / 100) * 100 : s;
  }, []);
  const a = useCountUp(words, 900);
  const b = useCountUp(langs, 1000);
  const c = useCountUp(span, 1100);
  const fmt = (n: number) => n.toLocaleString('en-US');
  return (
    <dl className="hero-stats" aria-label={`${fmt(words)} words, ${fmt(langs)} languages, ${fmt(span)} years`}>
      <div><dt>words</dt><dd>{fmt(a)}</dd></div>
      <div><dt>languages</dt><dd>{fmt(b)}</dd></div>
      <div><dt>years of history</dt><dd>{fmt(c)}</dd></div>
    </dl>
  );
}
