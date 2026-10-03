/** Result items shared by the command palette and the hero search box. */
import { Fragment, memo } from 'react';
import type { Language, Root, Word } from '../data';
import { data, formatYear, langColor, langName, wordColor } from '../data';
import { go, href } from '../lib/router';
import { STREAM } from '../lib/streams';
import { featuredWords, highlight, randomWord, search } from './engine';
import type { WordHit } from './engine';
import { addRecent } from './recent';
import type { Recent } from './recent';
import { ClockIcon, DiceIcon, GlobeIcon, ReturnIcon, RootIcon } from './icons';

export type Item =
  | { kind: 'word'; key: string; word: Word; hit?: WordHit }
  | { kind: 'root'; key: string; root: Root; count: number; score?: number }
  | { kind: 'lang'; key: string; lang: Language; count: number; score?: number }
  | { kind: 'live'; key: string; q: string }
  | { kind: 'random'; key: string }
  | { kind: 'recent'; key: string; recent: Recent };

export interface Group { id: string; label: string; items: Item[]; action?: 'clear-recent' }

export function buildGroups(q: string, recent: Recent[], opts: { compact?: boolean } = {}): Group[] {
  const query = q.trim();
  if (!query) {
    const groups: Group[] = [];
    if (recent.length && !opts.compact) {
      groups.push({ id: 'recent', label: 'Recent', action: 'clear-recent', items: recent.slice(0, 5).map((r) => ({ kind: 'recent', key: `recent:${r.kind}:${r.id}`, recent: r })) });
    }
    const featured = featuredWords().slice(0, opts.compact ? 4 : 6);
    if (featured.length) groups.push({ id: 'featured', label: 'Featured words', items: featured.map((w) => ({ kind: 'word', key: `w:${w.id}`, word: w })) });
    groups.push({ id: 'surprise', label: 'Feeling curious?', items: [{ kind: 'random', key: 'random' }] });
    return groups;
  }
  const r = search(query, opts.compact ? { words: 5, roots: 1, langs: 1 } : { words: 12, roots: 4, langs: 4 });
  const groups: Group[] = [];
  if (r.words.length) groups.push({ id: 'words', label: 'Words', items: r.words.map((h) => ({ kind: 'word', key: `w:${h.word.id}`, word: h.word, hit: h })) });
  if (r.roots.length) groups.push({ id: 'roots', label: 'Roots', items: r.roots.map((h) => ({ kind: 'root', key: `r:${h.root.id}`, root: h.root, count: h.count, score: h.score })) });
  if (r.langs.length) groups.push({ id: 'langs', label: 'Languages', items: r.langs.map((h) => ({ kind: 'lang', key: `l:${h.lang.id}`, lang: h.lang, count: h.count, score: h.score })) });
  groups.push({ id: 'live', label: groups.length ? 'Beyond the collection' : 'Not in the collection yet', items: [{ kind: 'live', key: 'live', q: query }] });
  return groups;
}

/**
 * Which row Enter should open before the user moves: the strongest confident match, otherwise the
 * live lookup (typing an unknown word and pressing Enter looks that word up, not a fuzzy cousin).
 */
export function defaultActive(groups: Group[]): number {
  let i = 0;
  let best = -1;
  let bestScore = 0;
  let live = -1;
  for (const g of groups) {
    for (const it of g.items) {
      const s = it.kind === 'word' ? (it.hit?.score ?? 0) : it.kind === 'root' || it.kind === 'lang' ? (it.score ?? 0) : 0;
      if (s > bestScore) { bestScore = s; best = i; }
      if (it.kind === 'live') live = i;
      i++;
    }
  }
  if (live < 0) return 0;
  return bestScore >= 60 ? best : live;
}

/** Navigate to an item and remember it. Returns false if nothing happened. */
export function activate(item: Item): boolean {
  switch (item.kind) {
    case 'word':
      addRecent({ kind: 'word', id: item.word.id, label: item.word.word });
      go(href.word(item.word.id));
      return true;
    case 'root':
      addRecent({ kind: 'root', id: item.root.id, label: item.root.form });
      go(href.root(item.root.id));
      return true;
    case 'lang':
      addRecent({ kind: 'lang', id: item.lang.id, label: item.lang.name });
      go(href.lang(item.lang.id));
      return true;
    case 'live': {
      const q = item.q.trim();
      if (!q) return false;
      addRecent({ kind: 'live', id: q, label: q });
      go(href.word(q));
      return true;
    }
    case 'random': {
      const w = randomWord();
      if (!w) return false;
      go(href.word(w.id));
      return true;
    }
    case 'recent': {
      const r = item.recent;
      addRecent(r);
      go(r.kind === 'root' ? href.root(r.id) : r.kind === 'lang' ? href.lang(r.id) : href.word(r.id));
      return true;
    }
  }
}

/** Plain-text label for screen readers / aria. */
export function itemLabel(item: Item): string {
  switch (item.kind) {
    case 'word': return `${item.word.word}: ${item.word.gloss ?? ''}`;
    case 'root': return `Root ${item.root.form}, ${item.root.meaning}`;
    case 'lang': return `Language: ${item.lang.name}`;
    case 'live': return `Look up “${item.q}” live on Wiktionary`;
    case 'random': return 'Random word';
    case 'recent': return `Recent: ${item.recent.label}`;
  }
}

function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const hits = highlight(text, q);
  if (!hits.size) return <>{text}</>;
  return (
    <>
      {Array.from(text).map((c, i) => (hits.has(i) ? <mark key={i}>{c}</mark> : <Fragment key={i}>{c}</Fragment>))}
    </>
  );
}

const yearOf = (w: Word) => (typeof w.first === 'number' ? formatYear(w.first, w.first < 1100) : '');

function wordSub(item: Extract<Item, { kind: 'word' }>) {
  const h = item.hit;
  if (h && h.field === 'form' && h.via) {
    return (
      <>
        <span className="sx-via">from</span> <span className="old sx-old">{h.via}</span>
        {h.viaLang && <span className="sx-via"> · {langName(h.viaLang)}</span>}
      </>
    );
  }
  if (h && h.field === 'root' && h.via) {
    return (<><span className="sx-via">root</span> <span className="old sx-old">{h.via}</span> <span className="sx-via">·</span> {item.word.gloss}</>);
  }
  return item.word.gloss;
}

export const ItemRow = memo(function ItemRow({ item, q, active }: { item: Item; q: string; active: boolean }) {
  switch (item.kind) {
    case 'word': {
      const w = item.word;
      const lost = w.status === 'extinct' || w.status === 'archaic';
      return (
        <>
          <span className="dot sx-dot" style={{ '--c': wordColor(w) } as React.CSSProperties} />
          <span className="sx-main">
            <span className="sx-title">
              <span className={`sx-word${lost ? ' is-lost' : ''}`}><Marked text={w.word} q={!item.hit || item.hit.field === 'word' ? q : ''} /></span>
              {w.pos && <span className="sx-pos">{w.pos}</span>}
            </span>
            <span className="sx-sub">{wordSub(item)}</span>
          </span>
          <span className="sx-meta">
            <span>{langName(w.origin)}</span>
            {yearOf(w) && <span className="sx-year">{yearOf(w)}</span>}
          </span>
        </>
      );
    }
    case 'root':
      return (
        <>
          <span className="sx-icon" style={{ '--c': langColor(item.root.lang) } as React.CSSProperties}><RootIcon size={16} /></span>
          <span className="sx-main">
            <span className="sx-title"><span className="sx-word old">{item.root.form}</span></span>
            <span className="sx-sub">“{item.root.meaning}” · {langName(item.root.lang)}</span>
          </span>
          <span className="sx-meta"><span>Root</span>{item.count > 0 && <span className="sx-year">{item.count} word{item.count === 1 ? '' : 's'}</span>}</span>
        </>
      );
    case 'lang':
      return (
        <>
          <span className="dot sx-dot" style={{ '--c': langColor(item.lang.id) } as React.CSSProperties} />
          <span className="sx-main">
            <span className="sx-title"><span className="sx-word"><Marked text={item.lang.name} q={q} /></span></span>
            <span className="sx-sub">{STREAM[item.lang.stream]?.label ?? ''}{item.lang.start !== undefined ? ` · from ${formatYear(item.lang.start, true)}` : ''}</span>
          </span>
          <span className="sx-meta"><span>Language</span>{item.count > 0 && <span className="sx-year">{item.count} word{item.count === 1 ? '' : 's'}</span>}</span>
        </>
      );
    case 'live':
      return (
        <>
          <span className="sx-icon sx-icon--live"><GlobeIcon size={16} /></span>
          <span className="sx-main">
            <span className="sx-title"><span className="sx-plain">Look up <strong>“{item.q}”</strong> live on Wiktionary</span></span>
            <span className="sx-sub">Fetches its etymology from Wiktionary &amp; Datamuse</span>
          </span>
          <span className="sx-meta sx-meta--icon">{active ? <ReturnIcon size={15} /> : null}</span>
        </>
      );
    case 'random':
      return (
        <>
          <span className="sx-icon sx-icon--dice"><DiceIcon size={16} /></span>
          <span className="sx-main">
            <span className="sx-title"><span className="sx-plain">Random word</span></span>
            <span className="sx-sub">One of {data.words.length.toLocaleString('en-US')} curated journeys</span>
          </span>
          <span className="sx-meta sx-meta--icon">{active ? <ReturnIcon size={15} /> : null}</span>
        </>
      );
    case 'recent': {
      const r = item.recent;
      return (
        <>
          <span className="sx-icon"><ClockIcon size={16} /></span>
          <span className="sx-main">
            <span className="sx-title"><span className={`sx-word${r.kind === 'root' ? ' old' : ''}`}>{r.label}</span></span>
          </span>
          <span className="sx-meta"><span>{r.kind === 'live' ? 'Live lookup' : r.kind === 'lang' ? 'Language' : r.kind === 'root' ? 'Root' : 'Word'}</span></span>
        </>
      );
    }
  }
});
