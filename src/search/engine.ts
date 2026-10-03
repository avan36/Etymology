/**
 * A small, fast fuzzy search over the whole dataset, shared by the command palette and the hero
 * search box. Scoring: exact > prefix > word-start > substring > subsequence, weighted by which
 * field matched (the word itself, an older form on its journey, its root, language, gloss, tags).
 */
import { data, langName } from '../data';
import type { Language, Root, StreamId, Word } from '../data';
import { STREAM } from '../lib/streams';

/** Fold a string to plain lowercase ASCII-ish letters so "wæter", "Wæter" and "waeter" all meet. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/[þð]/g, 'th')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/ȝ/g, 'g')
    .replace(/ƿ/g, 'w')
    .replace(/ł/g, 'l')
    .replace(/ı/g, 'i')
    .replace(/ʰ/g, 'h')
    .replace(/ʷ/g, 'w')
    .replace(/ʲ/g, 'j')
    .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[*()\u2019']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 0–100: how well `q` (normalised) matches text `t` (normalised). */
export function scoreText(q: string, t: string, fuzzy = true): number {
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90 - Math.min(18, (t.length - q.length) * 0.6);
  const i = t.indexOf(q);
  if (i > 0) {
    if (t[i - 1] === ' ') return 74 - Math.min(14, i * 0.25);
    return 56 - Math.min(14, i * 0.4);
  }
  if (!fuzzy || q.length < 2) return 0;
  // Subsequence: every query letter, in order, reasonably close together.
  let from = 0;
  let first = -1;
  let gaps = 0;
  for (const c of q) {
    if (c === ' ') continue;
    const j = t.indexOf(c, from);
    if (j < 0) return 0;
    if (first < 0) first = j;
    else gaps += j - from;
    from = j + 1;
  }
  const span = from - first;
  if (span > q.length * 2.6 + 2) return 0;
  return Math.max(8, 36 - gaps * 3 - (first === 0 ? 0 : 4));
}

export type MatchField = 'word' | 'form' | 'root' | 'lang' | 'gloss' | 'meaning' | 'tag';

export interface WordHit {
  word: Word;
  score: number;
  field: MatchField;
  /** The text that matched, when it is not the word itself (e.g. an older form). */
  via?: string;
  /** Language of the matching older form. */
  viaLang?: string;
}
export interface RootHit { root: Root; score: number; count: number }
export interface LangHit { lang: Language; score: number; count: number }
export interface Results { q: string; words: WordHit[]; roots: RootHit[]; langs: LangHit[] }

interface WordEntry {
  w: Word;
  word: string;
  forms: { n: string; form: string; lang: string }[];
  meanings: string[];
  root: string;
  rootMeaning: string;
  lang: string;
  gloss: string;
  tags: string[];
}

let index: { words: WordEntry[]; roots: { r: Root; form: string; meaning: string; id: string }[]; langs: { l: Language; name: string; id: string; stream: string }[] } | null = null;

function build() {
  const words: WordEntry[] = data.words.map((w) => {
    const word = norm(w.word ?? w.id);
    const root = w.root ? data.root.get(w.root) : undefined;
    const seen = new Set([word]);
    const forms: WordEntry['forms'] = [];
    for (const s of w.path ?? []) {
      if (!s?.form) continue;
      const n = norm(s.form);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      forms.push({ n, form: s.form, lang: s.lang });
    }
    return {
      w,
      word,
      forms,
      meanings: (w.path ?? []).map((s) => (s?.meaning ? norm(s.meaning) : '')).filter(Boolean),
      root: root ? norm(root.form) : '',
      rootMeaning: root ? norm(root.meaning) : '',
      lang: norm(langName(w.origin)),
      gloss: norm(w.gloss ?? ''),
      tags: (w.tags ?? []).map(norm),
    };
  });
  const roots = data.roots.map((r) => ({ r, form: norm(r.form), meaning: norm(r.meaning ?? ''), id: norm(r.id) }));
  const langs = data.languages.map((l) => ({ l, name: norm(l.name), id: l.id.toLowerCase(), stream: norm(STREAM[l.stream]?.label ?? '') }));
  index = { words, roots, langs };
  return index;
}

const usedLangCount = (() => {
  let cache: Map<string, number> | null = null;
  return (id: string) => {
    if (!cache) {
      cache = new Map();
      for (const w of data.words) {
        const ls = new Set((w.path ?? []).map((s) => s.lang));
        ls.add(w.origin);
        ls.forEach((l) => cache!.set(l, (cache!.get(l) ?? 0) + 1));
      }
    }
    return cache.get(id) ?? 0;
  };
})();

export function search(raw: string, limits = { words: 12, roots: 4, langs: 4 }): Results {
  const ix = index ?? build();
  const q = norm(raw);
  const out: Results = { q: raw, words: [], roots: [], langs: [] };
  if (!q) return out;
  const long = q.length >= 3;

  for (const e of ix.words) {
    let best = 0;
    let field: MatchField = 'word';
    let via: string | undefined;
    let viaLang: string | undefined;
    const consider = (s: number, f: MatchField, v?: string, vl?: string) => {
      if (s > best) { best = s; field = f; via = v; viaLang = vl; }
    };
    consider(scoreText(q, e.word), 'word');
    for (const f of e.forms) consider(scoreText(q, f.n) * 0.86, 'form', f.form, f.lang);
    if (e.root) consider(scoreText(q, e.root) * 0.62, 'root', data.root.get(e.w.root!)?.form);
    if (long) {
      if (e.rootMeaning) consider(scoreText(q, e.rootMeaning, false) * 0.42, 'root', data.root.get(e.w.root!)?.form);
      consider(scoreText(q, e.lang, false) * 0.5, 'lang', langName(e.w.origin));
      consider(scoreText(q, e.gloss, false) * 0.4, 'gloss');
      for (const t of e.tags) consider(scoreText(q, t, false) * 0.45, 'tag', t);
      for (const m of e.meanings) consider(scoreText(q, m, false) * 0.36, 'meaning', m);
    }
    if (best <= 0) continue;
    if (e.w.featured) best += 1.5;
    if (!e.w.status || e.w.status === 'living') best += 0.5;
    out.words.push({ word: e.w, score: best, field, via, viaLang });
  }
  // One or two letters: only prefixes and word-starts, not letters buried mid-word.
  const floor = q.length <= 2 ? 58 : 0;
  if (floor) out.words = out.words.filter((h) => h.score >= floor * (h.field === 'word' ? 1 : 0.86));
  out.words.sort((a, b) => b.score - a.score || a.word.word.length - b.word.word.length || a.word.word.localeCompare(b.word.word));
  out.words = out.words.slice(0, limits.words);

  for (const r of ix.roots) {
    const s = Math.max(scoreText(q, r.form), scoreText(q, r.id) * 0.7, long ? scoreText(q, r.meaning, false) * 0.8 : 0);
    if (s > 0) out.roots.push({ root: r.r, score: s, count: data.wordsByRoot.get(r.r.id)?.length ?? 0 });
  }
  out.roots.sort((a, b) => b.score - a.score || b.count - a.count);
  out.roots = out.roots.filter((r) => r.score >= Math.max(30, floor)).slice(0, limits.roots);

  for (const l of ix.langs) {
    const s = Math.max(scoreText(q, l.name), l.id === q ? 92 : 0, long ? scoreText(q, l.stream, false) * 0.55 : 0);
    if (s > 0) out.langs.push({ lang: l.l, score: s, count: usedLangCount(l.l.id) });
  }
  out.langs.sort((a, b) => b.score - a.score || b.count - a.count);
  out.langs = out.langs.filter((l) => l.score >= Math.max(30, floor)).slice(0, limits.langs);
  return out;
}

/** Character indices of `word` that match the query (for highlighting). */
export function highlight(word: string, raw: string): Set<number> {
  const q = norm(raw).replace(/ /g, '');
  const out = new Set<number>();
  if (!q) return out;
  const chars = Array.from(word);
  const folded = chars.map((c) => norm(c) || ' ');
  const flat = folded.join('');
  // contiguous first
  const at = flat.indexOf(q);
  if (at >= 0) {
    let pos = 0;
    folded.forEach((f, i) => {
      if (pos + f.length > at && pos < at + q.length) out.add(i);
      pos += f.length;
    });
    return out;
  }
  let k = 0;
  folded.forEach((f, i) => {
    if (k < q.length && f[0] === q[k]) { out.add(i); k += f.length; }
  });
  return k >= q.length ? out : new Set();
}

/* ── picks ─────────────────────────────────────────────────────── */

export function featuredWords(): Word[] {
  const f = data.words.filter((w) => w.featured);
  return f.length ? f : data.words.slice(0, 8);
}

let lastRandom = '';
export function randomWord(pool: Word[] = data.words): Word | undefined {
  const xs = pool.length > 1 ? pool.filter((w) => w.id !== lastRandom) : pool;
  const w = xs[Math.floor(Math.random() * xs.length)];
  if (w) lastRandom = w.id;
  return w;
}

/** Random-word "moods" for the I'm-feeling button. Only moods with enough words are offered. */
export interface Mood { id: string; label: string; pool: Word[] }
export function moods(): Mood[] {
  const byStream = (s: StreamId) => data.wordsByStream.get(s) ?? [];
  const byTag = (t: string) => data.words.filter((w) => w.tags?.includes(t));
  const list: Mood[] = [
    { id: 'viking', label: 'Viking', pool: byStream('norse') },
    { id: 'french', label: 'French', pool: byStream('french') },
    { id: 'latin', label: 'Latin', pool: byStream('latin') },
    { id: 'greek', label: 'Greek', pool: byStream('greek') },
    { id: 'ancient', label: 'ancient', pool: data.words.filter((w) => w.path?.[0]?.lang === 'ine-pro') },
    { id: 'nostalgic', label: 'nostalgic', pool: data.lost },
    { id: 'hungry', label: 'hungry', pool: byTag('food') },
    { id: 'online', label: 'online', pool: byTag('internet') },
    { id: 'worldly', label: 'worldly', pool: [...byStream('asia'), ...byStream('world'), ...byStream('semitic')] },
  ];
  return list.filter((m) => m.pool.length >= 2);
}

/** A friendly example list for rotating placeholders. */
export function exampleWords(n = 8): string[] {
  const prefer = ['water', 'algebra', 'selfie', 'robot', 'shampoo', 'disaster', 'nice', 'salary', 'sky'];
  const have = prefer.filter((p) => data.byText.has(p));
  const extra = featuredWords().map((w) => w.word).filter((w) => !have.includes(w));
  const rest = data.words.map((w) => w.word).filter((w) => !have.includes(w) && !extra.includes(w) && w.length <= 10);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out = [...have, ...extra, ...rest].slice(0, n);
  return out.length ? out : ['water'];
}

/** Count of languages that actually appear somewhere in the words' journeys. */
export function usedLanguages(): number {
  const s = new Set<string>();
  for (const w of data.words) {
    s.add(w.origin);
    for (const st of w.path ?? []) s.add(st.lang);
  }
  return s.size;
}

/** Earliest year mentioned anywhere in the data. */
export function earliestYear(): number {
  let min = Infinity;
  for (const w of data.words) for (const st of w.path ?? []) if (typeof st.year === 'number' && st.year < min) min = st.year;
  return Number.isFinite(min) ? min : 450;
}
