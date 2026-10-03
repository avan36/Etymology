/**
 * Global command palette. ⌘K / Ctrl+K anywhere, "/" when not typing (focuses the hero search when
 * it is on screen), or openSearch() from code. Fuzzy-searches words (including their older forms),
 * roots and languages, and always offers a live Wiktionary lookup.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { closeSearch, openSearch, useSearchOpen } from './bus';
import { activate, buildGroups, defaultActive, ItemRow, itemLabel } from './items';
import type { Item } from './items';
import { clearRecent, isApple, takePendingQuery, useRecent } from './recent';
import { CloseIcon, SearchIcon } from './icons';
import './search.css';

let isOpenNow = false;

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
}

export default function SearchPalette() {
  const open = useSearchOpen();
  useEffect(() => { isOpenNow = open; }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpenNow) closeSearch();
        else openSearch();
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isOpenNow && !isTyping(e.target)) {
        e.preventDefault();
        const hero = document.getElementById('hero-search-input');
        if (hero && onScreen(hero) && !location.hash.startsWith('#/w/')) hero.focus();
        else openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <AnimatePresence>{open && <Palette key="palette" />}</AnimatePresence>;
}

function Palette() {
  const reduce = useReducedMotion();
  const [q, setQ] = useState(() => takePendingQuery());
  const [active, setActive] = useState(0);
  const [small] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  const recent = useRecent();
  const groups = useMemo(() => buildGroups(q, recent), [q, recent]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const optId = (i: number) => `${uid}-opt-${i}`;
  const keyboardNav = useRef(false);

  // Each new query starts on its most confident row (or the live lookup).
  useEffect(() => { setActive(defaultActive(groups)); }, [groups]);
  const act = Math.max(0, Math.min(active, flat.length - 1));

  // Focus in, lock page scroll, restore focus on the way out (unless we opened a word sheet).
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const t = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => {
      cancelAnimationFrame(t);
      root.style.overflow = prevOverflow;
      if (!location.hash.startsWith('#/w/') && prev && prev !== document.body && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);

  // Scroll the active row into view when moving with the keyboard.
  useEffect(() => {
    if (!keyboardNav.current) return;
    document.getElementById(optId(act))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const pick = (item: Item | undefined) => {
    if (!item) return;
    if (activate(item)) closeSearch();
  };

  const move = (d: number) => {
    if (!flat.length) return;
    keyboardNav.current = true;
    setActive((a) => (Math.max(0, Math.min(a, flat.length - 1)) + d + flat.length) % flat.length);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(flat[act]); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (q) setQ('');
      else closeSearch();
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog; the list is driven from the input.
      e.preventDefault();
      move(e.shiftKey ? -1 : 1);
    }
  };

  const counts = groups.filter((g) => g.id === 'words' || g.id === 'roots' || g.id === 'langs');
  const summary = q.trim()
    ? counts.length
      ? `${counts.map((g) => `${g.items.length} ${g.label.toLowerCase()}`).join(', ')}.`
      : `No curated matches for ${q.trim()}. Press Enter to look it up live.`
    : 'Type to search words, old forms, roots and languages.';

  let n = -1;
  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : small
      ? { initial: { opacity: 0, y: 48 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 36 } }
      : { initial: { opacity: 0, scale: 0.965, y: -12, filter: 'blur(10px)' }, animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }, exit: { opacity: 0, scale: 0.975, y: -6, filter: 'blur(6px)' } };

  return (
    <div className="sp-root">
      <motion.div
        className="sp-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={() => closeSearch()}
      />
      <div className="sp-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) closeSearch(); }}>
        <motion.div
          className="sp-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Search Etymon"
          {...panelMotion}
          transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
        >
          <div className="sp-bar">
            <SearchIcon size={20} className="sp-bar__icon" />
            <input
              ref={inputRef}
              className="sp-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search a word, an old form, a root…"
              aria-label="Search words, roots and languages"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${uid}-list`}
              aria-autocomplete="list"
              aria-activedescendant={flat.length ? optId(act) : undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {q && (
              <button type="button" className="sp-clear" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear search">
                <CloseIcon size={15} />
              </button>
            )}
            <button type="button" className="sp-esc" onClick={() => closeSearch()} aria-label="Close search">
              <kbd className="sp-esc__kbd">esc</kbd>
              <span className="sp-esc__txt">Cancel</span>
            </button>
          </div>

          <div className="sp-list" id={`${uid}-list`} role="listbox" aria-label="Results">
            {groups.map((g) => (
              <div className="sp-group" key={g.id} role="group" aria-labelledby={`${uid}-g-${g.id}`}>
                <div className="sp-group__head">
                  <span id={`${uid}-g-${g.id}`}>{g.label}</span>
                  {g.action === 'clear-recent' && (
                    <button type="button" className="sp-group__act" onMouseDown={(e) => e.preventDefault()} onClick={() => clearRecent()}>Clear</button>
                  )}
                </div>
                {g.items.map((item) => {
                  n += 1;
                  const i = n;
                  const on = i === act;
                  return (
                    <div
                      key={item.key}
                      id={optId(i)}
                      role="option"
                      aria-selected={on}
                      aria-label={itemLabel(item)}
                      className={`sx-row sx-row--${item.kind}${on ? ' is-active' : ''}`}
                      onPointerMove={() => { if (act !== i) { keyboardNav.current = false; setActive(i); } }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(item)}
                    >
                      {on && (
                        <motion.span
                          className="sx-row__bg"
                          layoutId={`${uid}-active`}
                          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 48 }}
                        />
                      )}
                      <ItemRow item={item} q={q} active={on} />
                    </div>
                  );
                })}
              </div>
            ))}
            {q.trim() && counts.length === 0 && (
              <p className="sp-empty">No curated story for <strong>“{q.trim()}”</strong> yet. Wiktionary may know where it came from.</p>
            )}
          </div>

          <div className="sp-foot" aria-hidden>
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
            <span className="sp-foot__end"><kbd>{isApple() ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> from anywhere</span>
          </div>
          <div className="sr-only" aria-live="polite" aria-atomic="true">{summary}</div>
        </motion.div>
      </div>
    </div>
  );
}
