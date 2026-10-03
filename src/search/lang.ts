/** Which language live lookups use: "auto" (English first, then any language) or a Wiktionary code. */
import { useSyncExternalStore } from 'react';
import { LOOKUP_LANGS } from '../word/langs';

const KEY = 'etymon-lookup-lang';
const listeners = new Set<() => void>();
let current: string | null = null;

function read(): string {
  if (current !== null) return current;
  try {
    const v = localStorage.getItem(KEY);
    current = v && (v === 'auto' || LOOKUP_LANGS.some((l) => l.code === v)) ? v : 'auto';
  } catch {
    current = 'auto';
  }
  return current;
}

export function setLookupLang(code: string) {
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

export function useLookupLang(): string {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => 'auto');
}

/** The language to put in a word link: none for "auto" (the sheet picks), otherwise the code. */
export const linkLang = (code: string) => (code === 'auto' ? undefined : code);

export const lookupLangName = (code: string) => (code === 'auto' ? 'Any language' : LOOKUP_LANGS.find((l) => l.code === code)?.name ?? code);
