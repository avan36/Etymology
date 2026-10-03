/** Recent searches (per browser) and a hand-off slot for opening the palette with a query. */
import { useSyncExternalStore } from 'react';

export type Recent =
  | { kind: 'word'; id: string; label: string }
  | { kind: 'root'; id: string; label: string }
  | { kind: 'lang'; id: string; label: string }
  | { kind: 'live'; id: string; label: string };

const KEY = 'etymon-recent';
const MAX = 6;
const listeners = new Set<() => void>();
let cache: Recent[] | null = null;

function read(): Recent[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const xs = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(xs) ? xs.filter((x) => x && typeof x.id === 'string' && typeof x.label === 'string').slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(xs: Recent[]) {
  cache = xs;
  try { localStorage.setItem(KEY, JSON.stringify(xs)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

export function addRecent(r: Recent) {
  write([r, ...read().filter((x) => !(x.kind === r.kind && x.id === r.id))].slice(0, MAX));
}

export function clearRecent() { write([]); }

export function useRecent(): Recent[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => []);
}

/* A query typed elsewhere (the hero) that the palette should open with. */
let pending = '';
export function setPendingQuery(q: string) { pending = q; }
export function takePendingQuery(): string { const q = pending; pending = ''; return q; }

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. */
export function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(p) || /Mac OS X/.test(navigator.userAgent);
}
