import type { ReactNode } from 'react';
import { href } from '../lib/router';
import { findWord, wordColor } from '../data';

/** An inline link that opens a word's sheet, tinted by the stream it came through. */
export function WordLink({ word, children, className = '' }: { word: string; children?: ReactNode; className?: string }) {
  const w = findWord(word);
  return (
    <a href={href.word(w?.id ?? word)} className={`word-link ${className}`} style={{ '--c': w ? wordColor(w) : undefined } as React.CSSProperties}>
      {children ?? w?.word ?? word}
    </a>
  );
}
