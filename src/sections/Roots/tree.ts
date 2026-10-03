import type { Root, Stage, StreamId, Word } from '../../data';
import { langStream, wordStream } from '../../data';
import { STREAMS } from '../../lib/streams';

/**
 * A root's family as a tree: the root → the languages each descendant passed through (shared
 * prefixes merged) → the English words as leaves.
 */
export interface FNode {
  key: string;
  /** Language of this stage (the root's language for the root; the word's origin for leaves). */
  lang: string;
  /** Distinct forms seen at this stage, most common first. */
  forms: FormInfo[];
  /** Set on leaves only. */
  word?: Word;
  children: FNode[];
  /** Number of words (leaves) at or below this node. */
  leaves: number;
}

export interface FormInfo {
  form: string;
  n: number;
  meaning?: string;
  year?: number;
}

const ORDER = new Map(STREAMS.map((s, i) => [s.id, i] as [StreamId, number]));
const streamIndex = (lang: string) => ORDER.get(langStream(lang)) ?? 99;

/**
 * The stages of a word's journey that sit *between* the root and the English leaf: drop the root
 * itself at the start, anything after the language English took it from (those stages are already
 * English), and collapse repeated stages in the same language.
 */
export function between(w: Word, root: Root): Stage[] {
  let st = (w.path ?? []).filter((s) => s && s.lang);
  while (st.length && st[0].lang === root.lang) st = st.slice(1);
  if (w.origin && w.origin !== 'en') {
    let i = -1;
    st.forEach((s, j) => { if (s.lang === w.origin) i = j; });
    if (i >= 0) st = st.slice(0, i + 1);
  }
  while (st.length && st[st.length - 1].lang === 'en') st = st.slice(0, -1);
  if (w.origin === 'en') while (st.length && st[st.length - 1].lang === 'enm') st = st.slice(0, -1);
  const out: Stage[] = [];
  for (const s of st) {
    if (out.length && out[out.length - 1].lang === s.lang) out[out.length - 1] = s;
    else out.push(s);
  }
  return out;
}

export function buildTree(root: Root, words: Word[]): FNode {
  const top: FNode = { key: root.id, lang: root.lang, forms: [{ form: root.form, n: words.length, meaning: root.meaning }], children: [], leaves: 0 };
  for (const w of words) {
    let node = top;
    for (const s of between(w, root)) {
      const key = `${node.key}>${s.lang}`;
      let c = node.children.find((x) => !x.word && x.key === key);
      if (!c) node.children.push((c = { key, lang: s.lang, forms: [], children: [], leaves: 0 }));
      const f = c.forms.find((x) => x.form === s.form);
      if (f) {
        f.n++;
        f.meaning ??= s.meaning;
      } else c.forms.push({ form: s.form, n: 1, meaning: s.meaning, year: s.year });
      node = c;
    }
    node.children.push({ key: `${node.key}>w:${w.id}`, lang: w.origin, forms: [], word: w, children: [], leaves: 1 });
  }
  const finish = (n: FNode): number => {
    if (n.word) return 1;
    n.leaves = n.children.reduce((s, c) => s + finish(c), 0);
    n.forms.sort((a, b) => b.n - a.n);
    n.children.sort((a, b) => {
      if (!!a.word !== !!b.word) return a.word ? -1 : 1;
      if (a.word && b.word) return (a.word.first ?? 0) - (b.word.first ?? 0) || a.word.word.localeCompare(b.word.word);
      return streamIndex(a.lang) - streamIndex(b.lang) || b.leaves - a.leaves;
    });
    return n.leaves;
  };
  finish(top);
  return top;
}

/** Streams a family passed through on its way into English (intermediate stages + immediate sources). */
export function familyStreams(root: Root, words: Word[]): { id: StreamId; n: number }[] {
  const per = new Map<StreamId, Set<string>>();
  const add = (s: StreamId, id: string) => {
    if (s === 'ancient') return;
    let set = per.get(s);
    if (!set) per.set(s, (set = new Set()));
    set.add(id);
  };
  for (const w of words) {
    for (const s of between(w, root)) add(langStream(s.lang), w.id);
    add(wordStream(w), w.id);
  }
  return [...per.entries()]
    .map(([id, set]) => ({ id, n: set.size }))
    .sort((a, b) => (ORDER.get(a.id) ?? 99) - (ORDER.get(b.id) ?? 99));
}

const NON_LATIN = /[Ͱ-Ͽἀ-῿Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]/;

/** Split "ἀστήρ (astēr)" into a readable label (the transliteration) and the native spelling. */
export function displayForm(form: string): { label: string; native?: string } {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(form);
  if (m && NON_LATIN.test(m[1])) return { label: m[2], native: m[1] };
  return { label: form };
}
