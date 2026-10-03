import type { Dataset, StreamId } from './types';

const STREAM_IDS: StreamId[] = ['ancient', 'native', 'norse', 'dutch', 'latin', 'french', 'greek', 'celtic', 'romance', 'semitic', 'asia', 'world', 'english'];
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'numeral', 'phrase', 'prefix', 'suffix']);
const NOW = new Date().getFullYear();

/** Checks references, ranges and shapes. Errors fail the build; warnings are advice. */
export function validateDataset(ds: Dataset): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);
  const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const int = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

  // languages
  const langs = new Map<string, (typeof ds.languages)[number]>();
  for (const l of ds.languages) {
    if (!str(l.id)) { err(`language without id: ${JSON.stringify(l).slice(0, 80)}`); continue; }
    if (langs.has(l.id)) err(`duplicate language id "${l.id}"`);
    langs.set(l.id, l);
    if (!str(l.name)) err(`language ${l.id}: missing name`);
    if (!STREAM_IDS.includes(l.stream)) err(`language ${l.id}: unknown stream "${l.stream}"`);
    if (l.region && (!Array.isArray(l.region) || l.region.length !== 2 || Math.abs(l.region[0]) > 180 || Math.abs(l.region[1]) > 90))
      err(`language ${l.id}: region must be [lon, lat]`);
  }
  for (const l of ds.languages) {
    if (l.parent && !langs.has(l.parent)) err(`language ${l.id}: unknown parent "${l.parent}"`);
    // cycle check
    let p = l.parent, n = 0;
    while (p && n++ < 50) p = langs.get(p)?.parent;
    if (n >= 50) err(`language ${l.id}: parent cycle`);
  }

  // roots
  const roots = new Set<string>();
  for (const r of ds.roots) {
    if (!str(r.id)) { err(`root without id`); continue; }
    if (roots.has(r.id)) err(`duplicate root id "${r.id}"`);
    roots.add(r.id);
    if (!str(r.form) || !str(r.meaning)) err(`root ${r.id}: needs form and meaning`);
    if (!langs.has(r.lang)) err(`root ${r.id}: unknown language "${r.lang}"`);
  }

  // words
  const ids = new Set<string>();
  const texts = new Map<string, string>();
  for (const w of ds.words) {
    const at = `word "${w.id}"`;
    if (!str(w.id) || !/^[a-z0-9][a-z0-9-]*$/.test(w.id)) err(`${at}: id must be a lowercase slug`);
    if (ids.has(w.id)) err(`duplicate word id "${w.id}"`);
    ids.add(w.id);
    const t = (w.word ?? '').toLowerCase();
    if (texts.has(t)) warn(`${at}: same spelling as "${texts.get(t)}"`);
    texts.set(t, w.id);
    if (!str(w.word)) err(`${at}: missing word`);
    if (!str(w.gloss)) err(`${at}: missing gloss`);
    if (!str(w.story)) err(`${at}: missing story`);
    if (w.pos && !POS.has(w.pos)) warn(`${at}: unusual part of speech "${w.pos}"`);
    if (!langs.has(w.origin)) err(`${at}: unknown origin language "${w.origin}"`);
    if (!int(w.first) || w.first < 400 || w.first > NOW) err(`${at}: first must be a year between 400 and ${NOW}`);
    if (!Array.isArray(w.path) || w.path.length < 1) err(`${at}: path needs at least one stage`);
    else {
      let last = -Infinity;
      for (const s of w.path) {
        if (!langs.has(s.lang)) err(`${at}: path uses unknown language "${s.lang}"`);
        if (!str(s.form)) err(`${at}: path stage without form`);
        if (s.year !== undefined) {
          if (!int(s.year) || s.year > NOW) err(`${at}: bad path year ${s.year}`);
          else if (s.year < last - 50) warn(`${at}: path years go backwards (${s.form})`);
          else last = Math.max(last, s.year);
        }
      }
      if (!w.path.some((s) => s.lang === w.origin)) warn(`${at}: origin "${w.origin}" doesn't appear in its path`);
    }
    if (w.root && !roots.has(w.root)) err(`${at}: unknown root "${w.root}"`);
    if (w.status && !['living', 'archaic', 'extinct'].includes(w.status)) err(`${at}: bad status`);
    if ((w.status === 'extinct' || w.status === 'archaic') && !int(w.died)) warn(`${at}: lost words should have a "died" year`);
    if (w.died !== undefined && (!int(w.died) || w.died < w.first)) err(`${at}: died must be after first`);
    if (w.usage) {
      let prev = -Infinity;
      for (const p of w.usage) {
        if (!Array.isArray(p) || p.length !== 2 || !int(p[0]) || !int(p[1]) || p[1] < 0 || p[1] > 100) { err(`${at}: usage points must be [year, 0–100]`); break; }
        if (p[0] <= prev) { err(`${at}: usage years must increase`); break; }
        prev = p[0];
      }
    }
  }
  for (const w of ds.words) {
    for (const r of w.related ?? []) if (!ids.has(r)) warn(`word "${w.id}": related "${r}" isn't in the data`);
  }

  // eras, events, influx
  for (const e of ds.eras) if (!str(e.id) || !str(e.name) || !int(e.start) || !int(e.end) || e.end <= e.start) err(`era ${e.id}: bad shape`);
  for (const e of ds.events) {
    if (!int(e.year) || !str(e.title)) err(`event "${e.title}": needs year and title`);
    for (const s of e.streams ?? []) if (!STREAM_IDS.includes(s)) err(`event "${e.title}": unknown stream "${s}"`);
  }
  const ix = ds.influx;
  if (!ix || !Array.isArray(ix.years) || !ix.years.length) err('influx: needs years');
  else {
    for (const [k, v] of Object.entries(ix.series)) {
      if (!STREAM_IDS.includes(k as StreamId)) err(`influx: unknown stream "${k}"`);
      if (!Array.isArray(v) || v.length !== ix.years.length) err(`influx: series "${k}" must have ${ix.years.length} values`);
      else if (v.some((n) => !int(n) || n < 0)) err(`influx: series "${k}" has a bad value`);
    }
  }

  return { errors, warnings };
}
