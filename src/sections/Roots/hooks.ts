import { useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/theme';

/** Content-box width of an element, kept up to date with a ResizeObserver. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Reduced-motion flag, read once per mount. */
export function useReduced() {
  const [r] = useState(prefersReducedMotion);
  return r;
}

/**
 * Update the address bar without firing `hashchange`, so picking a root keeps the URL shareable
 * without the page-level "scroll to section" behaviour yanking the viewport on every click.
 */
export function replaceHash(h: string) {
  if (window.location.hash === h) return;
  try {
    history.replaceState(history.state, '', h);
  } catch {
    window.location.hash = h;
  }
}
