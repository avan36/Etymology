import { data, langName } from '../../data';
import type { Era, Word } from '../../data';

export const isLost = (w: Word) => w.status === 'extinct' || w.status === 'archaic';

/** Timeline bounds for lifespans: the start of Old English to the present. */
export const T0 = 450;
export const T1 = 2025;

const norm = (s: string) => s.toLowerCase().replace(/[*\s\-–()]/g, '');

/** The word's older written form (Old/Middle English or its source), if it differs from today's spelling. */
export function oldForm(w: Word): { lang: string; form: string } | undefined {
  const prefer = ['ang', 'enm', 'sco'];
  const stages = [...w.path].filter((s) => s.form && norm(s.form) !== norm(w.word));
  const s = stages.find((x) => prefer.includes(x.lang)) ?? stages.find((x) => x.lang === w.origin);
  return s ? { lang: langName(s.lang), form: s.form } : undefined;
}

export function lifespan(w: Word): string {
  const a = `c. ${w.first}`;
  if (w.died === undefined) return `${a} – fading`;
  return `${a} – c. ${w.died}`;
}

export function yearsLived(w: Word): number | undefined {
  return w.died === undefined ? undefined : Math.max(0, w.died - w.first);
}

/** The era a word fell silent in (by data.eras), or undefined if it's still lingering. */
export function deathEra(w: Word): Era | undefined {
  if (w.died === undefined) return undefined;
  return data.eras.find((e) => w.died! >= e.start && w.died! < e.end) ?? data.eras[data.eras.length - 1];
}

export const statusLabel = (w: Word) => (w.status === 'archaic' ? 'Archaic' : 'Extinct');

/** Rough rendered height of a card, for balancing masonry columns. */
export function estimateHeight(w: Word): number {
  return 190 + Math.min(260, w.story.length) * 0.42 + (w.replacedBy ? 28 : 0) + (oldForm(w) ? 24 : 0) + (w.gloss.length > 40 ? 22 : 0);
}

/** Deterministic pseudo-random in [0, 1) for a small integer seed. */
export function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
