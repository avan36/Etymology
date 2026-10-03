import type { Language, StreamId, Word } from '../../data';
import { data, langName } from '../../data';
import { STREAM, STREAMS } from '../../lib/streams';

const ORDER = new Map(STREAMS.map((s, i) => [s.id, i] as [StreamId, number]));
export const streamOrder = (s: StreamId) => ORDER.get(s) ?? 99;

/** One band of the "pour" diagram. */
export interface PourRow {
  id: StreamId | 'other';
  label: string;
  /** Percent of the whole (0–100). */
  value: number;
  /** Raw word count (count mode). */
  count?: number;
  /** Sub-label: the languages (share mode) or example words (count mode). */
  sub: string;
  color: string;
}

const OTHER_COLOR = '#a39b8c';

/** Dictionary shares from the `share` field of each language, grouped by stream. */
export function shareRows(): PourRow[] {
  const per = new Map<StreamId, { v: number; langs: Language[] }>();
  for (const l of data.languages) {
    if (typeof l.share !== 'number' || l.share <= 0) continue;
    const e = per.get(l.stream) ?? { v: 0, langs: [] };
    e.v += l.share;
    e.langs.push(l);
    per.set(l.stream, e);
  }
  const rows: PourRow[] = [...per.entries()].map(([id, e]) => ({
    id,
    label: STREAM[id].short,
    value: e.v,
    sub: e.langs.sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).map((l) => l.name).join(', '),
    color: STREAM[id].color,
  }));
  rows.sort((a, b) => b.value - a.value || streamOrder(a.id as StreamId) - streamOrder(b.id as StreamId));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total < 99.5) rows.push({ id: 'other', label: 'Everything else', value: 100 - total, sub: 'names, unknown & the rest', color: OTHER_COLOR });
  if (total > 100) rows.forEach((r) => (r.value = (r.value / total) * 100));
  return rows;
}

/** The curated words, grouped by the stream of the language English took each from. */
export function countRows(): PourRow[] {
  const total = data.words.length || 1;
  const rows: PourRow[] = [];
  for (const [id, ws] of data.wordsByStream) {
    const s = id as StreamId;
    if (!STREAM[s]) continue;
    const ex = [...ws].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || (a.first ?? 0) - (b.first ?? 0)).slice(0, 4).map((w) => w.word);
    rows.push({ id: s, label: STREAM[s].short, value: (ws.length / total) * 100, count: ws.length, sub: ex.join(' · '), color: STREAM[s].color });
  }
  rows.sort((a, b) => b.value - a.value || streamOrder(a.id as StreamId) - streamOrder(b.id as StreamId));
  return rows;
}

/** Ancestors of a language, nearest first, by id. */
export function ancestry(id: string): string[] {
  const out: string[] = [];
  let l = data.lang.get(id);
  while (l && out.length < 40) {
    out.push(l.id);
    l = l.parent ? data.lang.get(l.parent) : undefined;
  }
  return out;
}

export type Relation =
  | { kind: 'self' }
  | { kind: 'ancestor'; gens: number }
  | { kind: 'descendant' }
  | { kind: 'cousin'; via: string }
  | { kind: 'unrelated' };

/** How a language is related to English, through the `parent` links in the data. */
export function relationToEnglish(id: string, en = 'en'): Relation {
  if (id === en) return { kind: 'self' };
  const a = ancestry(id);
  const e = ancestry(en);
  const gi = e.indexOf(id);
  if (gi > 0) return { kind: 'ancestor', gens: gi };
  if (a.includes(en)) return { kind: 'descendant' };
  const common = a.find((x) => e.includes(x));
  return common ? { kind: 'cousin', via: common } : { kind: 'unrelated' };
}

export function relationText(id: string): string {
  const r = relationToEnglish(id);
  const name = langName(id);
  switch (r.kind) {
    case 'self':
      return 'The destination. Every line on this page ends here.';
    case 'ancestor':
      return r.gens === 1 ? `${name} is the direct parent of Modern English.` : `A direct ancestor of English, ${r.gens} generations back.`;
    case 'descendant':
      return `A descendant of English.`;
    case 'cousin':
      return `A cousin of English: both descend from ${langName(r.via)}.`;
    default:
      return `No shared ancestor with English in our data — a pure lender.`;
  }
}

/** The path between a language and English through their common ancestor (ids, inclusive). */
export function pathToEnglish(id: string, en = 'en'): string[] {
  const a = ancestry(id);
  const e = ancestry(en);
  const common = a.find((x) => e.includes(x));
  if (!common) return [id];
  const up = a.slice(0, a.indexOf(common) + 1);
  const down = e.slice(0, e.indexOf(common)).reverse();
  return [...up, ...down];
}

/** Words that passed through a language on the way in, but weren't taken from it directly. */
export function passedThrough(id: string): Word[] {
  return data.words.filter((w) => w.origin !== id && w.path?.some((s) => s.lang === id));
}

/** Group words by the century they entered English: [["1300s", words], …], oldest first. */
export function byCentury(ws: Word[]): [string, Word[]][] {
  const m = new Map<number, Word[]>();
  for (const w of ws) {
    const c = typeof w.first === 'number' ? Math.floor(w.first / 100) * 100 : NaN;
    const k = Number.isFinite(c) ? c : 99999;
    const a = m.get(k) ?? [];
    a.push(w);
    m.set(k, a);
  }
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, list]) => [c === 99999 ? 'Undated' : c < 0 ? `${Math.abs(c)}s BCE` : `${c}s`, list.sort((a, b) => (a.first ?? 0) - (b.first ?? 0) || a.word.localeCompare(b.word))]);
}

/** "c. 700 BCE – 600", "1500 – today". */
export function period(l: Language, fmt: (y: number, approx?: boolean) => string): string | undefined {
  if (typeof l.start !== 'number') return undefined;
  const s = fmt(l.start, l.start < 1500);
  const e = typeof l.end === 'number' ? fmt(l.end) : 'today';
  return `${s} – ${e}`;
}
