import { useSyncExternalStore } from 'react';

/** Open/close the search palette from anywhere (hero, nav, keyboard shortcut). */
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSearch() { open = true; emit(); }
export function closeSearch() { open = false; emit(); }

export function useSearchOpen(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => open, () => false);
}
