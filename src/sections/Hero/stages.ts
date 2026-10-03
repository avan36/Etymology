import type { Word } from '../../data';

/** One frame of the hero's morphing word. */
export interface MorphStage {
  /** What to draw big (a romanisation for non-Latin scripts when the data gives one). */
  text: string;
  /** The form in its own script, shown small, when `text` is a romanisation. */
  native?: string;
  lang: string;
  year?: number;
  meaning?: string;
  /** Same spelling as the previous stage (only the language/date moves on). */
  same?: boolean;
  /** Script that must not be split into letters (Arabic, Devanagari…). */
  whole?: boolean;
}

export interface MorphEntry { word: Word; stages: MorphStage[] }

const NON_LATIN = /[Ͱ-Ͽἀ-῿Ѐ-ӿ԰-֏֐-ࣿऀ-෿฀-࿿က-႟Ⴀ-ჿ　-鿿가-힯יִ-﷿ﹰ-﻿]/;
const JOINING = /[֐-ࣿऀ-෿฀-࿿က-႟יִ-﷿ﹰ-﻿]/;

export function displayForm(form: string): { text: string; native?: string; whole?: boolean } {
  const f = form.trim();
  const m = f.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (m && m[1].trim()) {
    const main = m[1].trim();
    const paren = m[2].trim();
    if (NON_LATIN.test(main) && !NON_LATIN.test(paren)) return { text: paren, native: main };
    return { text: main, whole: JOINING.test(main) };
  }
  return { text: f, whole: JOINING.test(f) };
}

export function toStages(w: Word): MorphStage[] {
  const out: MorphStage[] = [];
  for (const s of w.path ?? []) {
    if (!s?.form?.trim()) continue;
    const d = displayForm(s.form);
    const prev = out[out.length - 1];
    out.push({ ...d, lang: s.lang, year: s.year, meaning: s.meaning, same: !!prev && prev.text === d.text });
  }
  const living = !w.status || w.status === 'living';
  const last = out[out.length - 1];
  if (living && last && last.text.toLowerCase() !== w.word.toLowerCase()) {
    out.push({ text: w.word, lang: 'en', year: undefined });
  }
  // Very long journeys: keep the first, the last and an even spread in between.
  if (out.length > 8) {
    const keep = new Set([0, out.length - 1]);
    for (let i = 1; keep.size < 8; i++) keep.add(Math.round((i * (out.length - 1)) / 7));
    return out.filter((_, i) => keep.has(i)).map((s, i, a) => ({ ...s, same: i > 0 && a[i - 1].text === s.text }));
  }
  return out;
}

export function heroWords(words: Word[]): MorphEntry[] {
  let pool = words.filter((w) => w.featured && (w.path?.length ?? 0) >= 2);
  if (pool.length < 2) pool = words.filter((w) => (w.path?.length ?? 0) >= 3);
  const list = pool.slice();
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const wi = list.findIndex((w) => w.id === 'water');
  if (wi > 0) list.unshift(...list.splice(wi, 1));
  return list.slice(0, 24).map((word) => ({ word, stages: toStages(word) })).filter((e) => e.stages.length >= 2);
}

/* ── letter alignment ───────────────────────────────────────────── */

export interface Glyph { key: string; ch: string; stamp: number }

const seg: { segment(s: string): Iterable<{ segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Split into user-perceived characters (keeps r̥, ṓ, ḱ together). */
export function graphemes(s: string): string[] {
  if (seg) return Array.from(seg.segment(s), (x) => x.segment);
  const out: string[] = [];
  for (const c of Array.from(s)) {
    if (/\p{M}/u.test(c) && out.length) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

/** The letter "underneath" a glyph, so ō≈o, æ≈a, þ≈t, ʷ≈w can stay in place and just re-ink. */
function baseOf(ch: string): string {
  const c = ch.toLowerCase();
  const map: Record<string, string> = { æ: 'a', œ: 'o', ø: 'o', þ: 't', ð: 't', ȝ: 'g', ƿ: 'w', ſ: 's', ı: 'i', ł: 'l', ʷ: 'w', ʰ: 'h', ʲ: 'j', ß: 's' };
  if (map[c]) return map[c];
  return c.normalize('NFD').replace(/\p{M}/gu, '') || c;
}

let keySeq = 0;
const newKey = () => `g${(keySeq += 1).toString(36)}`;

export function freshGlyphs(text: string, whole: boolean | undefined, stamp: number): Glyph[] {
  const chars = whole ? [text] : graphemes(text);
  return chars.map((ch) => ({ key: newKey(), ch, stamp }));
}

/** Longest-common-subsequence alignment: shared letters keep their identity (and position). */
export function alignGlyphs(prev: Glyph[], text: string, whole: boolean | undefined, stamp: number): Glyph[] {
  if (whole || prev.length === 1 && prev[0].ch.length > 2) return freshGlyphs(text, whole, stamp);
  const next = graphemes(text);
  const a = prev.map((g) => baseOf(g.ch));
  const b = next.map(baseOf);
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: Glyph[] = new Array(m);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      const same = prev[i].ch === next[j];
      out[j] = { key: prev[i].key, ch: next[j], stamp: same ? prev[i].stamp : stamp };
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      out[j] = { key: newKey(), ch: next[j], stamp };
      j++;
    }
  }
  for (; j < m; j++) out[j] = { key: newKey(), ch: next[j], stamp };
  return out;
}
