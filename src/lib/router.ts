import { useSyncExternalStore } from 'react';

/**
 * Tiny hash router. URLs are shareable and work on GitHub Pages without server config.
 *
 *   #/w/water        → the word sheet for "water" (curated, or looked up live if not in the data)
 *   #/w/Wasser/de    → a live lookup of the German entry (any Wiktionary language code)
 *   #/root/bher-carry → Roots section with that root selected
 *   #/lang/la        → Languages section with Latin selected
 *   #/river, #/roots, #/languages, #/trends, #/lost → scroll to a section
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'word'; word: string; lang?: string }
  | { kind: 'root'; id: string }
  | { kind: 'lang'; id: string }
  | { kind: 'section'; id: string };

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { kind: 'home' };
  const [a, b, c] = parts;
  if (a === 'w' && b) return c ? { kind: 'word', word: b, lang: c } : { kind: 'word', word: b };
  if (a === 'root' && b) return { kind: 'root', id: b };
  if (a === 'lang' && b) return { kind: 'lang', id: b };
  return { kind: 'section', id: a };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const snapshot = () => window.location.hash;

export function useRoute(): Route {
  const h = useSyncExternalStore(subscribe, snapshot, () => '');
  return parse(h);
}

export const href = {
  word: (w: string, lang?: string) => `#/w/${encodeURIComponent(w)}${lang ? `/${encodeURIComponent(lang)}` : ''}`,
  root: (id: string) => `#/root/${encodeURIComponent(id)}`,
  lang: (id: string) => `#/lang/${encodeURIComponent(id)}`,
  section: (id: string) => `#/${id}`,
  home: () => '#/',
};

export function go(h: string) {
  if (window.location.hash !== h) window.location.hash = h;
}

/** Close an overlay (e.g. the word sheet) and return to the page. */
export function back() {
  go('#/');
}
