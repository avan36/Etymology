import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { data, wordColor } from '../data';
import type { Word } from '../data';
import { href } from '../lib/router';
import { STREAM } from '../lib/streams';
import { openSearch } from '../search/bus';
import { lookupWiktionary } from './wiktionary';
import type { LiveEntry, LiveResult } from './wiktionary';
import { suggestions, wiktionaryUrl } from './model';
import type { SheetRoot, SheetWord } from './model';
import { langInfo } from './langs';
import { SheetBody } from './SheetBody';
import { IconArrow, IconSearch } from './icons';

const normRoot = (s: string) => s.normalize('NFC').replace(/[*\-\s()]/g, '').toLowerCase();

function fromLive(e: LiveEntry, id: string): SheetWord {
  const l = langInfo(e.origin);
  let root: SheetRoot | undefined;
  let family: Word[] = [];
  if (e.root) {
    const r = data.roots.find((x) => normRoot(x.form) === normRoot(e.root!.form));
    root = r ? { id: r.id, form: r.form, lang: r.lang, meaning: r.meaning, blurb: r.blurb } : { form: e.root.form, lang: e.root.lang };
    if (r) family = data.wordsByRoot.get(r.id) ?? [];
  }
  return {
    id,
    word: e.word,
    pos: e.pos,
    gloss: e.gloss && e.gloss.length > 150 ? `${e.gloss.slice(0, 150).replace(/[\s,;]+\S*$/, '')}…` : e.gloss,
    first: e.first,
    origin: l.id,
    status: e.status,
    path: e.first !== undefined ? e.path.map((st, i) => (i === e.path.length - 1 ? { ...st, year: e.first } : st)) : e.path,
    root,
    family,
    related: [],
    stream: l.stream,
    color: STREAM[l.stream].color,
    source: 'wiktionary',
    summary: e.summary || undefined,
    wikiUrl: wiktionaryUrl(e.title),
  };
}

export function LiveSheet({ word, titleId }: { word: string; titleId: string }) {
  const [res, setRes] = useState<LiveResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setRes(null);
    lookupWiktionary(word).then((r) => live && setRes(r));
    return () => {
      live = false;
    };
  }, [word, attempt]);

  if (!res) return <Loading word={word} titleId={titleId} />;
  if (res.kind === 'ok') return <SheetBody sw={fromLive(res.entry, word)} titleId={titleId} live />;
  return <Missing word={word} titleId={titleId} error={res.kind === 'error'} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Loading({ word, titleId }: { word: string; titleId: string }) {
  return (
    <article className="ws-body ws-loading" aria-busy="true">
      <header className="ws-hero">
        <div className="ws-hero__aura" aria-hidden />
        <div className="ws-hero__eyebrow">
          <span className="ws-badge ws-badge--live">
            <span className="ws-live-dot" />
            Looking it up on Wiktionary…
          </span>
        </div>
        <h1 id={titleId} className="ws-word ws-shimmer" style={{ '--len': Math.max(3, [...word].length) } as React.CSSProperties}>
          {word}
        </h1>
        <div className="ws-hero__caption" />
        <div className="ws-skel ws-skel--gloss" />
        <div className="ws-skel ws-skel--gloss2" />
        <div className="ws-skel-row">
          <span className="ws-skel ws-skel--pill" />
          <span className="ws-skel ws-skel--pill" />
          <span className="ws-skel ws-skel--pill" />
        </div>
      </header>
      <div className="ws-sec">
        <div className="ws-skel ws-skel--eyebrow" />
        <div className="ws-skel ws-skel--title" />
        <div className="ws-skel-journey">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="ws-skel-node" style={{ animationDelay: `${i * 0.12}s` }}>
              <span className="ws-skel ws-skel--dot" />
              <span className="ws-skel ws-skel--form" />
              <span className="ws-skel ws-skel--lang" />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function Missing({ word, titleId, error, onRetry }: { word: string; titleId: string; error: boolean; onRetry: () => void }) {
  const sugg = suggestions(word, 6);
  return (
    <article className="ws-body ws-missing">
      <header className="ws-hero">
        <div className="ws-hero__aura" aria-hidden />
        <motion.div className="ws-hero__eyebrow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="dot" />
          {error ? 'Wiktionary is out of reach' : 'Not in the dictionary — yet'}
        </motion.div>
        <motion.h1
          id={titleId}
          className="ws-word is-missing"
          style={{ '--len': Math.max(3, [...word].length) } as React.CSSProperties}
          initial={{ opacity: 0, filter: 'blur(14px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          {word}
        </motion.h1>
        <motion.div className="ws-missing__body" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
          <p className="ws-missing__msg">
            {error ? (
              <>We couldn’t reach Wiktionary just now, so this word’s story will have to wait. Check your connection and try again.</>
            ) : (
              <>
                Wiktionary has no English entry for <em>“{word}”</em>. Perhaps a different spelling, or one of these?
              </>
            )}
          </p>
          {sugg.length > 0 && (
            <ul className="ws-chips">
              {sugg.map((w) => (
                <li key={w.id}>
                  <a className="chip ws-chip" href={href.word(w.id)} style={{ '--c': wordColor(w) } as React.CSSProperties}>
                    <span className="dot" />
                    {w.word}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="ws-missing__actions">
            {error ? (
              <button type="button" className="btn" onClick={onRetry}>
                Try again
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => openSearch()}>
                <IconSearch /> Search Etymon
              </button>
            )}
            <a className="btn btn--ghost" href={`https://en.wiktionary.org/w/index.php?search=${encodeURIComponent(word)}`} target="_blank" rel="noopener noreferrer">
              Search Wiktionary <IconArrow dir="up-right" />
            </a>
          </div>
        </motion.div>
      </header>
    </article>
  );
}
