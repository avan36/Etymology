import { useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { langName } from '../../data';
import type { Word } from '../../data';
import { endYear, sparkPath } from './curves';

interface Props {
  pool: Word[];
  selected: Set<string>;
  onAdd: (w: Word) => void;
  onRemoveLast: () => void;
  full: boolean;
}

/** Inline type-ahead (ARIA combobox) for adding curated words with usage curves to the chart. */
export default function WordPicker({ pool, selected, onAdd, onRemoveLast, full }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const end = endYear();

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const avail = pool.filter((w) => !selected.has(w.id));
    if (!s) return avail.filter((w) => w.featured).concat(avail.filter((w) => !w.featured)).slice(0, 7);
    const starts = avail.filter((w) => w.word.toLowerCase().startsWith(s));
    const has = avail.filter(
      (w) => !w.word.toLowerCase().startsWith(s) && (w.word.toLowerCase().includes(s) || (s.length >= 3 && w.gloss.toLowerCase().includes(s))),
    );
    return [...starts.sort((a, b) => a.word.length - b.word.length), ...has].slice(0, 7);
  }, [q, pool, selected]);

  const pick = (w: Word | undefined) => {
    if (!w) return;
    onAdd(w);
    setQ('');
    setActive(0);
    inputRef.current?.focus();
  };

  const listId = `${id}-list`;
  const show = open && !full && results.length > 0;

  return (
    <div className="tr-picker">
      <span className="tr-picker__plus" aria-hidden="true">+</span>
      <input
        ref={inputRef}
        className="tr-picker__input"
        type="text"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show ? `${id}-o${active}` : undefined}
        aria-label="Add a word to the chart"
        placeholder={full ? 'Chart is full' : 'Add a word'}
        disabled={full}
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
          else if (e.key === 'Enter') { pick(results[active]); e.preventDefault(); }
          else if (e.key === 'Escape') { setOpen(false); setQ(''); }
          else if (e.key === 'Backspace' && !q) onRemoveLast();
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <AnimatePresence>
        {show && (
          <motion.ul
            id={listId}
            role="listbox"
            className="tr-picker__list"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
          >
            {results.map((w, i) => (
              <li
                key={w.id}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : ''}
                onPointerDown={(e) => { e.preventDefault(); pick(w); }}
                onPointerEnter={() => setActive(i)}
              >
                <span className="tr-picker__word">{w.word}</span>
                <span className="tr-picker__meta">
                  {langName(w.origin)} · {w.first}
                </span>
                <svg viewBox="0 0 64 20" width="64" height="20" aria-hidden="true">
                  <path d={sparkPath(w, 64, 20, 650, end)} className="tr-picker__spark" />
                </svg>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
