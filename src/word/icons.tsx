/** Small line icons for the word sheet (1.6px strokes, currentColor). */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconArrow({ dir }: { dir: 'left' | 'right' | 'up-right' }) {
  const d = dir === 'left' ? 'M19 12H5m6-6l-6 6 6 6' : dir === 'right' ? 'M5 12h14m-6-6l6 6-6 6' : 'M7 17L17 7M9 7h8v8';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...P}>
      <path d={d} />
    </svg>
  );
}

export function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconReplay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden {...P}>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...P}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}
