import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return mq?.matches ? 'dark' : 'light';
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('etymon-theme', t); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

mq?.addEventListener('change', () => listeners.forEach((l) => l()));

/** The active theme; re-renders when it changes (canvases should redraw with new colours). */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    currentTheme,
    () => 'light' as Theme,
  );
}

/** Read a CSS custom property from :root (e.g. cssVar('--ink')). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
