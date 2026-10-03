/** The big, Google-style search pill in the hero, with inline suggestions. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { activate, buildGroups, defaultActive, ItemRow, itemLabel } from '../../search/items';
import type { Item } from '../../search/items';
import { exampleWords } from '../../search/engine';
import { openSearch } from '../../search/bus';
import { isApple, setPendingQuery } from '../../search/recent';
import { ArrowIcon, CloseIcon, SearchIcon } from '../../search/icons';
import { useLookupLang } from '../../search/lang';
import { LangPicker } from '../../search/LangPicker';

export default function HeroSearch() {
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const lang = useLookupLang();
  const groups = useMemo(() => (q.trim() ? buildGroups(q, [], { compact: true, lang }) : []), [q, lang]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const open = focused && !dismissed && flat.length > 0;
  const act = Math.max(0, Math.min(active, flat.length - 1));

  useEffect(() => { setActive(defaultActive(groups)); setDismissed(false); }, [groups]);

  // When suggestions open below the fold, bring them into view.
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = dropRef.current;
      if (!el) return;
      const over = el.getBoundingClientRect().bottom - (window.innerHeight - 20);
      if (over > 0) window.scrollBy({ top: over, behavior: reduce ? 'auto' : 'smooth' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, reduce]);

  // Rotating example in the placeholder.
  const examples = useMemo(() => exampleWords(9), []);
  const [ex, setEx] = useState(0);
  useEffect(() => {
    if (q || reduce) return;
    const t = window.setInterval(() => setEx((i) => (i + 1) % examples.length), 2600);
    return () => window.clearInterval(t);
  }, [q, reduce, examples.length]);

  const pick = (item: Item | undefined) => {
    if (!item) return;
    if (activate(item)) {
      setDismissed(true);
      inputRef.current?.blur();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // ⌘K from here carries the query into the full palette.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { setPendingQuery(q); inputRef.current?.blur(); return; }
    if (e.key === 'ArrowDown' && flat.length) { e.preventDefault(); setDismissed(false); setActive((a) => (Math.min(a, flat.length - 1) + 1) % flat.length); }
    else if (e.key === 'ArrowUp' && flat.length) { e.preventDefault(); setActive((a) => (Math.min(a, flat.length - 1) - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (q.trim()) pick(flat[act]);
      else { setPendingQuery(''); openSearch(); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setDismissed(true); }
      else if (q) { e.preventDefault(); setQ(''); }
      else inputRef.current?.blur();
    }
  };

  const onFocus = () => {
    setFocused(true);
    // On phones, lift the box towards the top so suggestions clear the keyboard.
    if (window.matchMedia('(max-width: 640px)').matches && inputRef.current) {
      const y = inputRef.current.getBoundingClientRect().top + window.scrollY - 88;
      window.setTimeout(() => window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' }), 60);
    }
  };

  const toPalette = () => {
    setPendingQuery(q);
    inputRef.current?.blur();
    openSearch();
  };

  let n = -1;
  return (
    <div className={`hs${focused ? ' is-focused' : ''}${open ? ' is-open' : ''}`} role="search">
      <div className="hs-glow" aria-hidden />
      <div className="hs-pill" onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); } }}>
        <SearchIcon size={20} className="hs-icon" />
        <div className="hs-field">
          <input
            id="hero-search-input"
            ref={inputRef}
            className="hs-input"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={() => setFocused(false)}
            aria-label="Search any word"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${uid}-list`}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${uid}-opt-${act}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {!q && (
            <span className="hs-ph" aria-hidden>
              <span className="hs-ph__lead">Search any word, like</span>
              <span className="hs-ph__lead hs-ph__lead--short">Try</span>
              <span className="hs-ph__slot">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.em
                    key={examples[ex]}
                    className="hs-ph__word"
                    initial={{ y: '100%', opacity: 0, filter: 'blur(4px)' }}
                    animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: '-100%', opacity: 0, filter: 'blur(4px)' }}
                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                  >
                    {examples[ex]}
                  </motion.em>
                </AnimatePresence>
              </span>
            </span>
          )}
        </div>
        <LangPicker className="hs-lang" />
        {q ? (
          <>
            <button type="button" className="hs-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Clear">
              <CloseIcon size={16} />
            </button>
            <button type="button" className="hs-go" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(flat[act])} aria-label={flat[act] ? itemLabel(flat[act]) : 'Search'}>
              <ArrowIcon size={18} />
            </button>
          </>
        ) : (
          <span className="hs-hint" aria-hidden><kbd>/</kbd></span>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={dropRef}
            className="hs-drop"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
          >
            <div id={`${uid}-list`} role="listbox" aria-label="Suggestions" className="hs-list">
              {groups.map((g) => (
                <div key={g.id} role="group" aria-label={g.label} className={`hs-group hs-group--${g.id}`}>
                  {g.items.map((item) => {
                    n += 1;
                    const i = n;
                    const on = i === act;
                    return (
                      <div
                        key={item.key}
                        id={`${uid}-opt-${i}`}
                        role="option"
                        aria-selected={on}
                        aria-label={itemLabel(item)}
                        className={`sx-row sx-row--${item.kind}${on ? ' is-active' : ''}`}
                        onPointerMove={() => { if (act !== i) setActive(i); }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(item)}
                      >
                        {on && <motion.span className="sx-row__bg" layoutId={`${uid}-bg`} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 48 }} />}
                        <ItemRow item={item} q={q} active={on} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <button type="button" className="hs-more" onMouseDown={(e) => e.preventDefault()} onClick={toPalette}>
              <span>All results for “{q.trim()}”</span>
              <span className="hs-more__keys"><kbd>{isApple() ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd></span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
