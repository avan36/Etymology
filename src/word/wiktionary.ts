import type { Stage, WordStatus } from '../data';
import { langInfo, normLang } from './langs';

/**
 * Live lookups for words that are not in the curated data.
 *
 *   lookupWiktionary('serendipity') → { kind: 'ok', entry } | { kind: 'notfound' } | { kind: 'error' }
 *
 * Reads the English ===Etymology=== wikitext (CORS-enabled MediaWiki API), turns its templates
 * ({{inh}}, {{bor}}, {{der}}, {{m}}, {{af}}…) into a journey (oldest first) and a plain-text
 * summary, and reads the gloss from the REST definition endpoint. `parseEtymology` is pure and
 * exported for testing.
 */

export interface LiveEntry {
  title: string;
  word: string;
  pos?: string;
  gloss?: string;
  status: WordStatus;
  /** Oldest first; ends with the English word. */
  path: Stage[];
  /** Immediate source language (the newest non-English stage), "en" for coinages. */
  origin: string;
  root?: { lang: string; form: string };
  summary: string;
  first?: number;
}

export type LiveResult =
  | { kind: 'ok'; entry: LiveEntry }
  | { kind: 'notfound'; word: string }
  | { kind: 'error'; word: string; message: string };

// ── template scanning ──────────────────────────────────────────────────────────

export interface Tpl {
  name: string;
  pos: string[];
  named: Record<string, string>;
}
type Chunk = string | Tpl;

/** Split wikitext into top-level text chunks and (parsed) templates. Handles nesting. */
export function scan(text: string): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  let buf = '';
  while (i < text.length) {
    if (text.startsWith('{{', i)) {
      const end = matchBraces(text, i);
      if (end < 0) {
        buf += text.slice(i);
        break;
      }
      if (buf) out.push(buf);
      buf = '';
      out.push(parseTpl(text.slice(i + 2, end)));
      i = end + 2;
    } else {
      buf += text[i++];
    }
  }
  if (buf) out.push(buf);
  return out;
}

function matchBraces(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length - 1; i++) {
    if (s[i] === '{' && s[i + 1] === '{') {
      depth++;
      i++;
    } else if (s[i] === '}' && s[i + 1] === '}') {
      depth--;
      if (depth === 0) return i;
      i++;
    }
  }
  return -1;
}

function parseTpl(inner: string): Tpl {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      cur += two;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      cur += two;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += inner[i];
  }
  parts.push(cur);
  const [name, ...rest] = parts;
  const pos: string[] = [];
  const named: Record<string, string> = {};
  for (const p of rest) {
    const m = /^\s*([A-Za-z][\w-]*|\d+)\s*=([\s\S]*)$/.exec(p);
    if (m && !/^\d+$/.test(m[1])) named[m[1]] = m[2].trim();
    else if (m) pos[Number(m[1]) - 1] = m[2].trim();
    else pos.push(p.trim());
  }
  for (let k = 0; k < pos.length; k++) if (pos[k] === undefined) pos[k] = '';
  return { name: name.trim(), pos, named };
}

// ── rendering templates & markup to plain text ─────────────────────────────────

const ETYM = new Set([
  'inh', 'inh+', 'inh-lite', 'inherited', 'der', 'der+', 'der-lite', 'derived', 'bor', 'bor+', 'borrowed', 'lbor', 'learned borrowing',
  'slbor', 'semi-learned borrowing', 'ubor', 'unadapted borrowing', 'obor', 'orthographic borrowing', 'uder', 'cal', 'cal+', 'calque',
  'pcal', 'partial calque', 'sl', 'semantic loan', 'psm', 'phono-semantic matching', 'translit', 'transliteration',
]);
const PREFIX: Record<string, string> = {
  'inh+': 'Inherited from', 'der+': 'Derived from', 'bor+': 'Borrowed from', lbor: 'Learned borrowing from', 'learned borrowing': 'Learned borrowing from',
  slbor: 'Semi-learned borrowing from', 'semi-learned borrowing': 'Semi-learned borrowing from', ubor: 'Unadapted borrowing from',
  'unadapted borrowing': 'Unadapted borrowing from', obor: 'Orthographic borrowing from', 'orthographic borrowing': 'Orthographic borrowing from',
  cal: 'Calque of', 'cal+': 'Calque of', calque: 'Calque of', pcal: 'Partial calque of', 'partial calque': 'Partial calque of', sl: 'Semantic loan from',
  'semantic loan': 'Semantic loan from', psm: 'Phono-semantic matching of', 'phono-semantic matching': 'Phono-semantic matching of',
};
const MENTION = new Set(['m', 'mention', 'l', 'link', 'll', 'l-self', 'm-self', 'l-lite', 'm-lite']);
const COG = new Set(['cog', 'cognate', 'ncog', 'noncog', 'nc', 'cog-lite', 'm+']);
const AFFIX = new Set(['af', 'affix', 'compound', 'com', 'suffix', 'suf', 'prefix', 'pre', 'confix', 'con', 'blend', 'circumfix', 'infix', 'univerbation', 'surf', 'surface analysis', 'com+', 'af+']);
const INVISIBLE = new Set(['root', 'pie root', 'pie word', 'etymon', 'etystub', 'rfe', 'rfv-etym', 'rfelite', 'rfscript', 'attn', 'col', 'top2', 'top3', 'mid2', 'bottom', 'cln', 'c', 'categorize', 'catlangname', 'anchor', 'senseid', 'nb...', 'tlb', 'defdate', 'ref', 'refn', 'r:oed', 'r:etymonline', 'wp', 'wikipedia', 'swp', 'number box', 'wikispecies']);

const unq = (s?: string) => (s && s !== '-' ? s : '');

function affixParts(t: Tpl): string[] {
  const n = t.name.toLowerCase();
  const parts = t.pos.slice(1).map((p) => clean(p)).filter(Boolean);
  if (!parts.length) return parts;
  if (n === 'suffix' || n === 'suf') {
    const last = parts.length - 1;
    if (!parts[last].startsWith('-')) parts[last] = `-${parts[last]}`;
  } else if (n === 'prefix' || n === 'pre') {
    for (let k = 0; k < parts.length - 1; k++) if (!parts[k].endsWith('-')) parts[k] = `${parts[k]}-`;
  } else if (n === 'confix' || n === 'con') {
    if (!parts[0].endsWith('-')) parts[0] = `${parts[0]}-`;
    const last = parts.length - 1;
    if (last > 0 && !parts[last].startsWith('-')) parts[last] = `-${parts[last]}`;
  }
  return parts;
}

const quoteGloss = (g?: string) => (g ? ` (“${clean(g)}”)` : '');

/** The text a template shows on the page (roughly how Wiktionary renders it). */
export function renderTpl(t: Tpl): string {
  const n = t.name.toLowerCase();
  const P = (k: number) => clean(t.pos[k] ?? '');
  if (ETYM.has(n)) {
    const lang = langInfo(t.pos[1] ?? '').name;
    const term = unq(P(2));
    const alt = unq(P(3));
    const tr = t.named.tr ? ` (${clean(t.named.tr)})` : '';
    const g = quoteGloss(t.named.t ?? t.named.gloss ?? t.pos[4]);
    const body = term || alt ? `${lang} ${alt || term}${tr}${g}` : lang;
    const pre = PREFIX[n];
    if (pre && !t.named.notext) return `${t.named.nocap ? pre[0].toLowerCase() + pre.slice(1) : pre} ${body}`;
    return body;
  }
  if (MENTION.has(n)) {
    const term = unq(P(1));
    const alt = unq(P(2));
    const tr = t.named.tr ? ` (${clean(t.named.tr)})` : '';
    return `${alt || term}${tr}${quoteGloss(t.named.t ?? t.named.gloss ?? t.pos[3])}`;
  }
  if (COG.has(n)) {
    const term = unq(P(1)) || unq(P(2));
    const tr = t.named.tr ? ` (${clean(t.named.tr)})` : '';
    return `${langInfo(t.pos[0] ?? '').name}${term ? ` ${term}` : ''}${tr}${quoteGloss(t.named.t ?? t.named.gloss ?? t.pos[3])}`;
  }
  if (AFFIX.has(n)) {
    const parts = affixParts(t);
    if (n === 'blend') return `Blend of ${parts.join(' + ')}`;
    if (n === 'surf' || n === 'surface analysis') return `By surface analysis, ${parts.join(' + ')}`;
    return parts.join(' + ');
  }
  if (INVISIBLE.has(n)) return '';
  switch (n) {
    case 'gloss':
    case 'gl':
      return `(“${P(0)}”)`;
    case 'q':
    case 'qual':
    case 'qualifier':
    case 'i':
    case 'qf':
    case 'sense':
    case 's':
    case 'lb':
      return n === 'lb' ? `(${t.pos.slice(1).map(clean).join(', ')})` : `(${t.pos.map(clean).join(', ')})`;
    case 'w':
    case 'pedia':
      return P(1) || P(0);
    case 'lang':
      return P(1);
    case 'taxlink':
    case 'taxfmt':
    case 'vern':
    case 'smallcaps':
    case 'sc':
    case 'nowrap':
    case 'nobr':
    case 'sup':
    case 'sub':
    case 'ipachar':
    case 'ja-r':
    case 'zh-l':
    case 'ko-l':
    case 'upright':
    case 'small':
    case 'en-wiki':
      return P(0);
    case 'coinage':
    case 'coin':
      return `Coined by ${P(1)}${t.named.in ? ` in ${clean(t.named.in)}` : ''}`;
    case 'named-after':
    case 'named after':
      return `Named after ${P(1)}`;
    case 'onomatopoeic':
    case 'onom':
      return 'Onomatopoeic';
    case 'unknown':
    case 'unk':
      return 'Of unknown origin';
    case 'uncertain':
    case 'unc':
      return 'Of uncertain origin';
    case 'back-formation':
    case 'back-form':
    case 'bf':
      return `Back-formation from ${P(1)}`;
    case 'clipping':
    case 'clip':
      return `Clipping of ${P(1)}`;
    case 'abbreviation':
    case 'abbrev':
      return `Abbreviation of ${P(1)}`;
    case 'initialism':
      return `Initialism of ${P(1)}`;
    case 'acronym':
      return `Acronym of ${P(1)}`;
    case 'doublet':
      return `Doublet of ${t.pos.slice(1).map(clean).filter(Boolean).join(', ')}`;
    case 'circa':
    case 'c.':
    case 'circa2':
      return `c. ${P(0)}`;
    case 'bce':
    case 'b.c.e.':
    case 'bc':
      return 'BCE';
    case 'ce':
    case 'c.e.':
    case 'ad':
      return 'CE';
    case '...':
    case 'ellipsis':
      return '…';
    case 'sic':
      return '[sic]';
    case 'nbsp':
      return ' ';
    case 'ndash':
      return '–';
    case 'mdash':
      return '—';
    default:
      return '';
  }
}

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', thinsp: ' ', zwj: '', zwnj: '' };

/** Strip comments/refs and turn links, formatting and HTML into plain text (templates must be gone). */
function stripMarkup(s: string): string {
  return s
    .replace(/\[\[(?:Category|File|Image|Media|Kategorie):[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, (_, a: string) => a.replace(/^:?w:|^:?wikipedia:/i, '').replace(/#.*$/, ''))
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\[(?:https?:)?\/\/[^\s\]]+\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] ?? m;
    });
}

function preclean(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>/]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<references\s*\/?>/gi, '');
}

/** Plain text of a wikitext fragment, templates rendered. */
export function clean(s: string): string {
  if (!s) return '';
  const chunks = scan(preclean(s));
  return stripMarkup(chunks.map((c) => (typeof c === 'string' ? c : renderTpl(c))).join(''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}

// ── sections ───────────────────────────────────────────────────────────────────

/** The ==English== section of a page's wikitext (or ''). */
export function englishSection(wikitext: string): string {
  const m = /^==\s*English\s*==\s*$/m.exec(wikitext);
  if (!m) return '';
  const rest = wikitext.slice(m.index + m[0].length);
  const next = /^==[^=].*==\s*$/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** The first ===Etymology=== / ===Etymology 1=== body inside the English section (or ''). */
export function etymologySection(english: string): string {
  const m = /^(={3,5})\s*Etymology(?:\s+\d+)?\s*\1\s*$/m.exec(english);
  if (!m) return '';
  const rest = english.slice(m.index + m[0].length);
  const next = /^=+[^=\n][^\n]*=+\s*$/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

// ── etymology → journey ────────────────────────────────────────────────────────

const STOP_MID = /(?:^|[,;(]\s*)(?:equivalent to|by surface analysis|cognate with|compare|cf\.|doublet of|akin to)\b/i;
const STOP = /(?:^|[.;!?]\s+|\n)\s*(?:Cognate|Cognates|Compare|Cf\.|Doublet|Doublets|Akin|Related|See also|More at|Displaced|Replaced|Supplanted|Equivalent to|Distantly|Not related|Unrelated|Compounds?|Synonyms?|Also compare|Further cognates)\b/i;

export interface ParsedEtymology {
  /** Newest-first stages as read ("From X, from Y, from Z"), reversed to oldest-first. */
  stages: Stage[];
  origin?: string;
  root?: { lang: string; form: string };
  summary: string;
  first?: number;
}

/** Turn an etymology section's wikitext into stages (oldest first) and a plain-text summary. */
export function parseEtymology(ety: string): ParsedEtymology {
  const text = preclean(ety);
  const chunks = scan(text);

  // Summary: render everything, keep the first two non-empty paragraphs, trim to ~650 chars.
  const rendered = stripMarkup(chunks.map((c) => (typeof c === 'string' ? c : renderTpl(c))).join(''));
  const paras = rendered
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^[:*#]+\s*/gm, '').replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim())
    .filter((p) => p && !/^[.,;:]+$/.test(p));
  let summary = paras.slice(0, 2).join('\n\n');
  if (summary.length > 650) {
    const cut = summary.slice(0, 650);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    summary = end > 200 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }

  // First attestation, if the prose mentions it.
  let first: number | undefined;
  const fm = /\b(?:coined|first (?:attested|recorded|used|appears?|appeared|found|documented)|attested (?:since|from|in)|recorded (?:since|from|in)|dates? (?:from|back to))\b[^.]{0,70}?\b(1[0-9]{3}|[5-9][0-9]{2})(?:s)?\b/i.exec(rendered);
  if (fm) first = Number(fm[1]);

  // Walk the chunks in reading order until a "Cognate with…" style sentence.
  const stages: Stage[] = [];
  let origin: string | undefined;
  let root: { lang: string; form: string } | undefined;
  let pending: Stage | null = null;
  let stopped = false;
  let formationSeen = false;

  for (let k = 0; k < chunks.length && !stopped; k++) {
    const c = chunks[k];
    if (typeof c === 'string') {
      const t = stripMarkup(c);
      if (STOP.test(t) || STOP_MID.test(t)) stopped = true;
      continue;
    }
    const n = c.name.toLowerCase();
    if (n === 'root') {
      if (!root && c.pos[1] && c.pos[2]) root = { lang: normLang(c.pos[1]), form: clean(c.pos[2]) };
      continue;
    }
    if (n === 'pie root') {
      if (!root && c.pos[1]) root = { lang: 'ine-pro', form: `*${clean(c.pos[1]).replace(/^\*|-$/g, '')}-` };
      continue;
    }
    if (ETYM.has(n)) {
      const lang = normLang(c.pos[1] ?? '');
      if (!lang) continue;
      const term = unq(clean(c.pos[2] ?? '')) || unq(clean(c.pos[3] ?? ''));
      const tr = c.named.tr ? clean(c.named.tr) : '';
      const meaning = clean(c.named.t ?? c.named.gloss ?? c.pos[4] ?? '') || undefined;
      const st: Stage = { lang, form: term ? (tr ? `${term} (${tr})` : term) : '', meaning };
      if (!origin && lang !== 'en') origin = lang;
      formationSeen = true;
      if (term) {
        stages.push(st);
        pending = null;
      } else pending = st;
      continue;
    }
    if (MENTION.has(n)) {
      const lang = normLang(c.pos[0] ?? '');
      const term = unq(clean(c.pos[1] ?? ''));
      if (!term) continue;
      const tr = c.named.tr ? clean(c.named.tr) : '';
      const gloss = clean(c.named.t ?? c.named.gloss ?? c.pos[3] ?? '');
      // A language-only template ({{der|en|la|-}}) waiting for its term.
      if (pending && pending.lang === lang) {
        pending.form = tr ? `${term} (${tr})` : term;
        if (!pending.meaning && gloss) pending.meaning = gloss;
        stages.push(pending);
        pending = null;
        continue;
      }
      // "{{m|ang|wan-||lacking}} + {{m|ang|hopa||hope}}": a compound stage.
      const parts = [{ term, gloss }];
      let j = k;
      while (j + 2 < chunks.length && typeof chunks[j + 1] === 'string' && /^\s*\+\s*$/.test(chunks[j + 1] as string)) {
        const nx = chunks[j + 2];
        if (typeof nx === 'string' || !MENTION.has(nx.name.toLowerCase())) break;
        parts.push({ term: unq(clean(nx.pos[1] ?? '')), gloss: clean(nx.named.t ?? nx.named.gloss ?? nx.pos[3] ?? '') });
        j += 2;
      }
      if (parts.length > 1) {
        const glosses = parts.map((p) => p.gloss).filter(Boolean);
        stages.push({ lang, form: parts.map((p) => p.term).join(' + '), meaning: glosses.length === parts.length ? glosses.join(' + ') : undefined });
        if (!formationSeen) {
          formationSeen = true;
          if (!origin && lang !== 'en') origin = lang;
        }
        k = j;
      }
      continue;
    }
    if (AFFIX.has(n) && n !== 'surf' && n !== 'surface analysis') {
      const lang = normLang(c.pos[0] ?? 'en');
      const parts = affixParts(c);
      if (parts.length >= 2) {
        stages.push({ lang, form: parts.join(' + ') });
        if (!formationSeen) {
          formationSeen = true;
          if (!origin) origin = lang;
        }
      }
      continue;
    }
    if ((n === 'coinage' || n === 'coin' || n === 'named-after' || n === 'back-formation' || n === 'bf' || n === 'clipping' || n === 'blend') && !formationSeen) {
      formationSeen = true;
      origin = origin ?? 'en';
    }
  }

  // Oldest first, without consecutive duplicates.
  const oldestFirst: Stage[] = [];
  for (const st of stages.reverse()) {
    const prev = oldestFirst.at(-1);
    if (prev && prev.lang === st.lang && prev.form === st.form) continue;
    oldestFirst.push(st);
  }
  return { stages: oldestFirst, origin, root, summary, first };
}

// ── definitions ────────────────────────────────────────────────────────────────

interface DefEntry {
  partOfSpeech?: string;
  language?: string;
  definitions?: { definition?: string }[];
}

function htmlText(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    doc.querySelectorAll('.HQToggle, .nyms, ul, ol, dl, style, sup.reference').forEach((n) => n.remove());
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  return stripMarkup(html).replace(/\s+/g, ' ').trim();
}

export function parseDefinitions(json: unknown): { pos?: string; gloss?: string; status: WordStatus } | null {
  const en = (json as { en?: DefEntry[] } | null)?.en;
  if (!Array.isArray(en) || !en.length) return null;
  for (const entry of en) {
    const defs = (entry.definitions ?? []).map((d) => htmlText(d.definition ?? '')).filter(Boolean);
    if (!defs.length) continue;
    const label = (d: string) => /^\(([^)]*)\)/.exec(d)?.[1].toLowerCase() ?? '';
    const isObs = (d: string) => /\bobsolete\b/.test(label(d));
    const isArch = (d: string) => /\b(archaic|dated)\b/.test(label(d));
    const status: WordStatus = defs.every(isObs) ? 'extinct' : isArch(defs[0]) || defs.every((d) => isObs(d) || isArch(d)) ? 'archaic' : 'living';
    const best = defs.find((d) => !isObs(d)) ?? defs[0];
    const gloss = best.replace(/^\([^)]*\)\s*/, '').replace(/[.:]\s*$/, '');
    return { pos: entry.partOfSpeech?.toLowerCase(), gloss: gloss ? gloss[0].toLowerCase() + gloss.slice(1) : undefined, status };
  }
  return null;
}

// ── fetching ───────────────────────────────────────────────────────────────────

const API = 'https://en.wiktionary.org/w/api.php';
const REST = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const cache = new Map<string, Promise<LiveResult>>();

async function getJSON(url: string, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchWikitext(title: string, signal?: AbortSignal): Promise<{ title: string; wikitext: string } | null> {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2&origin=*&redirects=1`;
  const j = (await getJSON(url, signal)) as { parse?: { title?: string; wikitext?: string | { '*': string } }; error?: { code?: string } } | null;
  if (!j || j.error || !j.parse) return null;
  const wt = j.parse.wikitext;
  const wikitext = typeof wt === 'string' ? wt : (wt?.['*'] ?? '');
  return { title: j.parse.title ?? title, wikitext };
}

async function fetchDefinitions(title: string, signal?: AbortSignal) {
  try {
    return parseDefinitions(await getJSON(REST + encodeURIComponent(title.replace(/ /g, '_')), signal));
  } catch {
    return null;
  }
}

export function lookupWiktionary(word: string): Promise<LiveResult> {
  const key = word.trim();
  let p = cache.get(key);
  if (!p) {
    p = doLookup(key).catch((e: unknown) => ({ kind: 'error' as const, word: key, message: e instanceof Error ? e.message : String(e) }));
    cache.set(key, p);
    // Don't keep failures around: a retry should really retry.
    p.then((r) => { if (r.kind === 'error') cache.delete(key); });
  }
  return p;
}

async function doLookup(word: string): Promise<LiveResult> {
  const variants = [...new Set([word, word.toLowerCase(), word.replace(/-/g, ' ')])];
  let page: { title: string; wikitext: string } | null = null;
  let english = '';
  for (const v of variants) {
    page = await fetchWikitext(v);
    english = page ? englishSection(page.wikitext) : '';
    if (english) break;
  }
  const title = page?.title ?? word;
  const defs = english ? await fetchDefinitions(title) : null;
  if (!english && !defs) return { kind: 'notfound', word };

  const ety = parseEtymology(etymologySection(english));
  const path = ety.stages.slice();
  const last = path.at(-1);
  if (!last || last.lang !== 'en' || last.form.toLowerCase() !== title.toLowerCase()) path.push({ lang: 'en', form: title });
  else last.form = title;

  return {
    kind: 'ok',
    entry: {
      title,
      word: title,
      pos: defs?.pos,
      gloss: defs?.gloss,
      status: defs?.status ?? 'living',
      path,
      origin: ety.origin ?? (path.length > 1 ? path[path.length - 2].lang : 'en'),
      root: ety.root,
      summary: ety.summary,
      first: ety.first,
    },
  };
}
