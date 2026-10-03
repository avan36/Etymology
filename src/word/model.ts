import { data, family, formatYear, rootOf, wordStream } from '../data';
import type { Stage, StreamId, Word, WordStatus } from '../data';
import { STREAM } from '../lib/streams';
import { langInfo } from './langs';

/**
 * One shape for everything the sheet renders, whether the word is curated (data/words) or was
 * looked up live on Wiktionary. Optional fields are simply not shown.
 */
export interface SheetRoot {
  id?: string; // curated Root id, when we have one
  form: string;
  lang: string;
  meaning?: string;
  blurb?: string;
}

export interface SheetWord {
  id: string;
  word: string;
  pos?: string;
  gloss?: string;
  first?: number;
  origin: string;
  status: WordStatus;
  died?: number;
  replacedBy?: string;
  path: Stage[];
  story?: string;
  usage?: [number, number][];
  root?: SheetRoot;
  family: Word[];
  related: string[];
  stream: StreamId;
  color: string;
  source: 'curated' | 'wiktionary';
  /** Live lookups: the cleaned etymology text from Wiktionary. */
  summary?: string;
  wikiUrl: string;
}

export const wiktionaryUrl = (w: string) => `https://en.wiktionary.org/wiki/${encodeURIComponent(w.replace(/ /g, '_'))}#English`;

export function fromCurated(w: Word): SheetWord {
  const r = rootOf(w);
  const stream = wordStream(w);
  return {
    id: w.id,
    word: w.word,
    pos: w.pos,
    gloss: w.gloss,
    first: w.first,
    origin: w.origin,
    status: w.status ?? 'living',
    died: w.died,
    replacedBy: w.replacedBy,
    path: w.path?.length ? w.path : [{ lang: w.origin, form: w.word, year: w.first }],
    story: w.story,
    usage: w.usage?.length ? w.usage : undefined,
    root: r ? { id: r.id, form: r.form, lang: r.lang, meaning: r.meaning, blurb: r.blurb } : undefined,
    family: family(w),
    related: (w.related ?? []).filter((id) => id !== w.id),
    stream,
    color: STREAM[stream].color,
    source: 'curated',
    wikiUrl: wiktionaryUrl(w.word),
  };
}

/** "ἀστήρ (astēr)" → { main: "ἀστήρ", roman: "astēr" }. */
export function splitForm(form: string): { main: string; roman?: string } {
  const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(form.trim());
  return m ? { main: m[1], roman: m[2] } : { main: form.trim() };
}

/** Latin, Greek, Cyrillic (and IPA/punctuation) can be animated letter by letter. Scripts with
 *  joining or conjuncts (Arabic, Devanagari…) must stay whole or they break apart. */
export function isSplittable(s: string): boolean {
  return !/[^\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]/u.test(s);
}

/** Grapheme clusters (a base letter plus its combining marks). */
export function graphemes(s: string): string[] {
  return s.match(/\P{M}\p{M}*/gu) ?? [];
}

/** Year label for a stage: approximate for proto-languages / BCE dates. */
export function stageYear(st: Stage): string | undefined {
  if (st.year === undefined) return undefined;
  const info = langInfo(st.lang);
  return formatYear(st.year, info.proto || st.year < 0);
}

/** Language period ("1150–1500") for stages without a year (live lookups). */
export function langPeriod(lang: string): string | undefined {
  const l = langInfo(lang);
  if (l.start === undefined) return undefined;
  const a = formatYear(l.start, l.proto);
  if (l.end === undefined) return `${a} – today`;
  const b = formatYear(l.end);
  return `${a} – ${b}`;
}

// ── hero time-lapse frames ──────────────────────────────────────────────────

export interface Letter {
  id: number;
  glyph: string;
}
export interface Frame {
  letters: Letter[];
  /** Grapheme count, for sizing. */
  len: number;
  whole: boolean;
  lang: string;
  year?: number;
  final: boolean;
}

const FOLD: Record<string, string> = { æ: 'a', ǣ: 'a', œ: 'o', ø: 'o', þ: 't', ð: 'd', ȝ: 'g', ſ: 's', ı: 'i', ł: 'l', đ: 'd', ŋ: 'n', ə: 'e', ɛ: 'e', ɔ: 'o', ʊ: 'u', ɪ: 'i', ç: 'c' };
const base = (g: string) => {
  const s = g.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return FOLD[s] ?? s;
};

/** Longest-common-subsequence alignment: pairs of indexes (a[i] ↔ b[j]) that persist. */
function align(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = base(a[i]) === base(b[j]) && base(a[i]).trim() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base(a[i]) === base(b[j]) && base(a[i]).trim()) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * The sequence of forms the hero word "assembles" through, oldest first, with stable letter ids
 * so that letters shared by consecutive forms glide into place instead of being replaced.
 */
export function heroFrames(sw: SheetWord): Frame[] {
  type Raw = { text: string; whole: boolean; lang: string; year?: number; final: boolean };
  const raw: Raw[] = [];
  for (const st of sw.path) {
    const { main, roman } = splitForm(st.form);
    const primary = main.split(/,\s+/)[0].trim();
    if (!primary) continue;
    if (isSplittable(primary)) raw.push({ text: primary, whole: false, lang: st.lang, year: st.year, final: false });
    else {
      raw.push({ text: primary, whole: true, lang: st.lang, year: st.year, final: false });
      if (roman) raw.push({ text: roman.split(/,\s+/)[0].trim(), whole: !isSplittable(roman), lang: st.lang, year: st.year, final: false });
    }
  }
  raw.push({ text: sw.word, whole: !isSplittable(sw.word), lang: sw.path.at(-1)?.lang ?? 'en', final: true });

  // Merge consecutive identical forms (keep the earliest caption; the last one is the final word).
  const merged: Raw[] = [];
  for (const r of raw) {
    const prev = merged.at(-1);
    if (prev && prev.text === r.text) {
      prev.final = prev.final || r.final;
      continue;
    }
    merged.push({ ...r });
  }
  // Very long journeys: keep the oldest, the newest few, and an even sample between.
  let frames = merged;
  if (frames.length > 8) {
    const keep = new Set([0, frames.length - 1, frames.length - 2]);
    const step = (frames.length - 3) / 5;
    for (let k = 1; k <= 5; k++) keep.add(Math.round(k * step));
    frames = frames.filter((_, i) => keep.has(i));
  }

  let nextId = 1;
  const out: Frame[] = [];
  let prevG: string[] = [];
  let prevL: Letter[] = [];
  let prevWhole = true;
  for (const f of frames) {
    const g = f.whole ? [f.text] : graphemes(f.text);
    const letters: Letter[] = g.map((glyph) => ({ id: 0, glyph }));
    if (!f.whole && !prevWhole) for (const [i, j] of align(prevG, g)) letters[j].id = prevL[i].id;
    for (const l of letters) if (!l.id) l.id = nextId++;
    out.push({ letters, len: f.whole ? Math.max(3, Math.ceil(f.text.length * 0.8)) : g.length, whole: f.whole, lang: f.lang, year: f.year, final: f.final });
    prevG = g;
    prevL = letters;
    prevWhole = f.whole;
  }
  return out;
}

// ── navigation through a stream ─────────────────────────────────────────────

/** Words of the same stream in order of arrival (first attested), for prev/next. */
export function streamSiblings(w: Word): Word[] {
  const s = wordStream(w);
  const list = (data.wordsByStream.get(s) ?? []).slice();
  list.sort((a, b) => a.first - b.first || a.word.localeCompare(b.word));
  return list;
}

/** Closest curated words by spelling (for "did you mean"). */
export function suggestions(q: string, n = 6): Word[] {
  const s = q.toLowerCase();
  const scored = data.words.map((w) => {
    const t = w.word.toLowerCase();
    let d = lev(s, t);
    if (t.startsWith(s.slice(0, 3))) d -= 0.5;
    return { w, d };
  });
  scored.sort((a, b) => a.d - b.d);
  const max = Math.max(2, Math.ceil(s.length / 2.5));
  const close = scored.filter((x) => x.d <= max).slice(0, n).map((x) => x.w);
  if (close.length >= 3) return close;
  const featured = data.words.filter((w) => w.featured && !close.includes(w));
  return [...close, ...featured].slice(0, n);
}

function lev(a: string, b: string): number {
  const m = b.length;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[m];
}

