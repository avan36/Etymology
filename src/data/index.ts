import { loadDataset } from './load';
import type { Language, Root, StreamId, Word } from './types';
import { STREAM } from '../lib/streams';

export type { Dataset, Era, HistoryEvent, Influx, Language, Root, Stage, StreamId, Word, WordStatus } from './types';

const ds = loadDataset();

const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
const group = <T,>(xs: T[], key: (x: T) => string | undefined) => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (k === undefined) continue;
    let a = m.get(k);
    if (!a) m.set(k, (a = []));
    a.push(x);
  }
  return m;
};

const langMap = byId(ds.languages);

/**
 * The whole dataset plus handy indexes. Built once at startup; treat as read-only.
 *
 *   data.words / data.word.get(id) / data.byText.get('water')
 *   data.languages / data.lang.get('la')
 *   data.roots / data.root.get('wed-water') / data.wordsByRoot.get(rootId)
 *   data.wordsByStream.get('french')
 */
export const data = {
  ...ds,
  word: byId(ds.words),
  byText: new Map(ds.words.map((w) => [w.word.toLowerCase(), w])),
  lang: langMap,
  root: byId(ds.roots),
  wordsByRoot: group(ds.words, (w) => w.root),
  wordsByOrigin: group(ds.words, (w) => w.origin),
  wordsByStream: group(ds.words, (w) => langMap.get(w.origin)?.stream),
  living: ds.words.filter((w) => !w.status || w.status === 'living'),
  lost: ds.words.filter((w) => w.status === 'extinct' || w.status === 'archaic'),
};

/** Look a word up by id or spelling (case-insensitive). */
export function findWord(q: string): Word | undefined {
  const s = q.trim().toLowerCase();
  return data.word.get(s) ?? data.byText.get(s) ?? data.word.get(s.replace(/\s+/g, '-'));
}

export function langName(id: string): string {
  return langMap.get(id)?.name ?? id;
}

export function langStream(id: string): StreamId {
  return langMap.get(id)?.stream ?? 'world';
}

/** Hex colour for a language (via its stream). */
export function langColor(id: string): string {
  return STREAM[langStream(id)].color;
}

/** Stream a word arrived through (its immediate source's stream). */
export function wordStream(w: Word): StreamId {
  return langStream(w.origin);
}

export function wordColor(w: Word): string {
  return STREAM[wordStream(w)].color;
}

/** The language and all its ancestors, nearest first. */
export function lineage(id: string): Language[] {
  const out: Language[] = [];
  let l = langMap.get(id);
  while (l && out.length < 40) {
    out.push(l);
    l = l.parent ? langMap.get(l.parent) : undefined;
  }
  return out;
}

/** Other words from the same root, excluding `w`. */
export function family(w: Word): Word[] {
  return w.root ? (data.wordsByRoot.get(w.root) ?? []).filter((x) => x.id !== w.id) : [];
}

export function rootOf(w: Word): Root | undefined {
  return w.root ? data.root.get(w.root) : undefined;
}

/** Usage value (0–100) at a given year by linear interpolation; 0 outside the curve. */
export function usageAt(w: Word, year: number): number {
  const u = w.usage;
  if (!u?.length) return 0;
  if (year <= u[0][0]) return year === u[0][0] ? u[0][1] : 0;
  for (let i = 1; i < u.length; i++) {
    if (year <= u[i][0]) {
      const [x0, y0] = u[i - 1];
      const [x1, y1] = u[i];
      return y0 + ((y1 - y0) * (year - x0)) / (x1 - x0);
    }
  }
  return u[u.length - 1][1];
}

/** "1066", "500 BCE", "c. 4000 BCE" style labels. */
export function formatYear(y: number, approx = false): string {
  const s = y < 0 ? `${Math.abs(y).toLocaleString('en-US')} BCE` : String(y);
  return approx ? `c. ${s}` : s;
}
