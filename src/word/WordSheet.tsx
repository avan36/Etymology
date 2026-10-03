import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { motion, useDragControls, useIsPresent, useReducedMotion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { back, go, href, parse } from '../lib/router';
import { findWord } from '../data';
import type { Word } from '../data';
import { STREAM } from '../lib/streams';
import { useSearchOpen } from '../search/bus';
import { fromCurated, streamSiblings } from './model';
import type { SheetWord } from './model';
import { SheetBody } from './SheetBody';
import { LiveSheet } from './LiveSheet';
import { IconArrow, IconClose, IconLink, IconCheck } from './icons';
import './wordsheet.css';

/**
 * The Word Sheet: the overlay that opens for #/w/<word>. Curated words render from data; anything
 * else is looked up live on Wiktionary. App.tsx mounts it inside <AnimatePresence> keyed by word,
 * so moving between words swaps sheets (sideways), while opening/closing slides up/down.
 */

// Several sheets can be mounted at once while one leaves and the next arrives.
let openCount = 0;
let savedFocus: HTMLElement | null = null;
let savedStyle: { overflow: string; gutter: string } | null = null;
/** Direction of the last word-to-word move (1 = forward/right, -1 = back/left). */
let navDir: 1 | -1 = 1;
const isSwapping = () => typeof window !== 'undefined' && parse(window.location.hash).kind === 'word';

function useOverlayLock() {
  useEffect(() => {
    if (openCount++ === 0) {
      const html = document.documentElement;
      savedFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      savedStyle = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter };
      if (window.innerWidth > html.clientWidth) html.style.scrollbarGutter = 'stable';
      html.style.overflow = 'hidden';
    }
    return () => {
      if (--openCount === 0) {
        const html = document.documentElement;
        if (savedStyle) {
          html.style.overflow = savedStyle.overflow;
          html.style.scrollbarGutter = savedStyle.gutter;
        }
        const f = savedFocus;
        savedFocus = null;
        if (f && document.contains(f)) f.focus({ preventScroll: true });
      }
    };
  }, []);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export default function WordSheet({ word }: { word: string }) {
  const curated = useMemo(() => findWord(word), [word]);
  const sw = useMemo<SheetWord | null>(() => (curated ? fromCurated(curated) : null), [curated]);
  const present = useIsPresent();
  const reduce = !!useReducedMotion();
  const searchOpen = useSearchOpen();
  const [swap] = useState(() => openCount > 0);
  const [dir] = useState(() => navDir);
  useOverlayLock();

  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const drag = useDragControls();

  // Prev / next through the words of the same stream, in order of arrival.
  const sibs = useMemo(() => (curated ? streamSiblings(curated) : []), [curated]);
  const idx = curated ? sibs.findIndex((w) => w.id === curated.id) : -1;
  const n = sibs.length;
  const prev = idx >= 0 && n > 1 ? sibs[(idx - 1 + n) % n] : undefined;
  const next = idx >= 0 && n > 1 ? sibs[(idx + 1) % n] : undefined;
  const goto = (w: Word | undefined, d: 1 | -1) => {
    if (!w) return;
    navDir = d;
    go(href.word(w.id));
  };

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      if (searchOpen || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        back();
        return;
      }
      if (e.key === 'Tab') {
        const root = sheetRef.current;
        if (!root) return;
        const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
        const a = document.activeElement;
        if (!els.length) {
          e.preventDefault();
          root.focus();
        } else if (!root.contains(a)) {
          e.preventDefault();
          els[0].focus();
        } else if (e.shiftKey && (a === els[0] || a === root)) {
          e.preventDefault();
          els[els.length - 1].focus();
        } else if (!e.shiftKey && a === els[els.length - 1]) {
          e.preventDefault();
          els[0].focus();
        }
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === 'ArrowLeft' && prev) {
        e.preventDefault();
        goto(prev, -1);
      } else if (e.key === 'ArrowRight' && next) {
        e.preventDefault();
        goto(next, 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [present, searchOpen, prev, next]);

  const spring = { type: 'spring' as const, stiffness: 240, damping: 30, mass: 0.9 };
  const leave = [0.4, 0, 1, 1] as const;

  const startDrag = (e: ReactPointerEvent) => {
    if (reduce || (scrollRef.current?.scrollTop ?? 0) > 4) return;
    if ((e.target as HTMLElement).closest('button, a')) return;
    drag.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 130 || info.velocity.y > 700) back();
  };

  const stream = sw ? STREAM[sw.stream] : undefined;

  return (
    <div className={`ws-root${present ? '' : ' is-leaving'}`}>
      <motion.div
        className="ws-backdrop"
        initial={swap ? false : { opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } }}
        exit="exit"
        variants={{ exit: () => ({ opacity: 0, transition: { duration: isSwapping() ? 0 : 0.35 } }) }}
        onClick={() => back()}
        aria-hidden
      />
      <motion.div
        ref={sheetRef}
        className="ws-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : swap ? { opacity: 0, x: 64 * dir } : { opacity: 0, y: 72, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1, transition: reduce ? { duration: 0.2 } : spring }}
        exit="exit"
        variants={{
          exit: () =>
            reduce
              ? { opacity: 0, transition: { duration: 0.15 } }
              : isSwapping()
                ? { opacity: 0, x: -64 * navDir, transition: { duration: 0.26, ease: leave } }
                : { opacity: 0, y: 56, scale: 0.975, transition: { duration: 0.3, ease: leave } },
        }}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={onDragEnd}
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a[href^="#/w/"]')) navDir = 1;
        }}
        style={{ '--c': sw?.color ?? 'var(--accent)' } as React.CSSProperties}
      >
        <div ref={scrollRef} className="ws-scroll">
          <SheetBar
            scrollRef={scrollRef}
            word={sw?.word ?? word}
            label={stream ? `${stream.short} stream` : 'Live lookup'}
            color={sw?.color}
            position={idx >= 0 && n > 1 ? `${idx + 1} / ${n}` : undefined}
            prev={prev}
            next={next}
            onPrev={() => goto(prev, -1)}
            onNext={() => goto(next, 1)}
            onHandleDown={startDrag}
          />
          {sw ? <SheetBody sw={sw} titleId={titleId} next={next} onNext={() => goto(next, 1)} /> : <LiveSheet word={word} titleId={titleId} />}
        </div>
      </motion.div>
    </div>
  );
}

function SheetBar(props: {
  scrollRef: RefObject<HTMLDivElement | null>;
  word: string;
  label: string;
  color?: string;
  position?: string;
  prev?: Word;
  next?: Word;
  onPrev: () => void;
  onNext: () => void;
  onHandleDown: (e: ReactPointerEvent) => void;
}) {
  const { scrollRef, word, label, color, position, prev, next, onPrev, onNext, onHandleDown } = props;
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const on = () => setScrolled(el.scrollTop > 260);
    on();
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [scrollRef]);

  const share = async () => {
    const url = window.location.href;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${word} · Etymon`, url });
      } catch { /* dismissed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <header className={`ws-bar${scrolled ? ' is-scrolled' : ''}`} onPointerDown={onHandleDown}>
      <span className="ws-bar__handle" aria-hidden />
      <div className="ws-bar__left">
        <span className="ws-bar__stream">
          <span className="dot" style={{ '--c': color ?? 'var(--ink-3)' } as React.CSSProperties} />
          <span className="ws-bar__label">{label}</span>
          {position && <span className="ws-bar__pos">{position}</span>}
        </span>
        <span className="ws-bar__word" aria-hidden={!scrolled}>{word}</span>
      </div>
      <div className="ws-bar__right">
        {prev && next && (
          <div className="ws-bar__nav">
            <button type="button" className="ws-iconbtn" onClick={onPrev} aria-label={`Previous word: ${prev.word}`} title={`${prev.word}  (←)`}>
              <IconArrow dir="left" />
            </button>
            <button type="button" className="ws-iconbtn" onClick={onNext} aria-label={`Next word: ${next.word}`} title={`${next.word}  (→)`}>
              <IconArrow dir="right" />
            </button>
          </div>
        )}
        <button type="button" className={`ws-iconbtn ws-share${copied ? ' is-done' : ''}`} onClick={share} aria-label="Copy link to this word">
          {copied ? <IconCheck /> : <IconLink />}
          <span className="ws-share__tip" role="status">{copied ? 'Link copied' : ''}</span>
        </button>
        <button type="button" className="ws-iconbtn ws-close" onClick={() => back()} aria-label="Close (Esc)" title="Close (Esc)">
          <IconClose />
        </button>
      </div>
    </header>
  );
}
