import type { StreamId } from '../data/types';

export interface StreamInfo {
  id: StreamId;
  label: string;
  /** Short label for tight spaces. */
  short: string;
  color: string;
  blurb: string;
}

/**
 * The streams of the River of English, in the order they are stacked (bottom → top is the order
 * in which they joined, roughly). Colours are mid-saturation jewel tones that read on both the
 * light paper theme (drawn with `multiply`) and the dark ink theme (drawn with `screen`).
 */
export const STREAMS: StreamInfo[] = [
  { id: 'ancient', label: 'Proto-Indo-European & older', short: 'Ancient', color: '#8b8172', blurb: 'Reconstructed mother tongues, spoken before writing.' },
  { id: 'native', label: 'Old English (Germanic)', short: 'Germanic', color: '#e3a008', blurb: 'The inherited core: the words of daily life, brought by Angles, Saxons and Jutes.' },
  { id: 'norse', label: 'Old Norse', short: 'Norse', color: '#0ea5e9', blurb: 'Viking settlers gave English sky, egg, they and law.' },
  { id: 'latin', label: 'Latin', short: 'Latin', color: '#e11d48', blurb: 'Church, scholarship and science: the language of learning for a thousand years.' },
  { id: 'french', label: 'French', short: 'French', color: '#9333ea', blurb: 'After 1066 French became the language of power, law, fashion and food.' },
  { id: 'greek', label: 'Greek', short: 'Greek', color: '#2563eb', blurb: 'Philosophy, medicine and nearly every -ology.' },
  { id: 'dutch', label: 'Dutch & German', short: 'Dutch/German', color: '#f97316', blurb: 'Sailors, traders and painters: yacht, boss, cookie, kindergarten.' },
  { id: 'celtic', label: 'Celtic', short: 'Celtic', color: '#16a34a', blurb: 'Few words but lovely ones: whisky, slogan, clan, bard.' },
  { id: 'romance', label: 'Italian, Spanish & Portuguese', short: 'Romance', color: '#db2777', blurb: 'Music, art and the New World: piano, canyon, mosquito.' },
  { id: 'semitic', label: 'Arabic, Hebrew & Near East', short: 'Arabic/Hebrew', color: '#0d9488', blurb: 'Algebra, coffee, sugar and amen.' },
  { id: 'asia', label: 'Asian languages', short: 'Asian', color: '#c2410c', blurb: 'Persian, Sanskrit, Hindi, Malay, Chinese, Japanese: shampoo, ketchup, tycoon.' },
  { id: 'world', label: 'Rest of the world', short: 'World', color: '#65a30d', blurb: 'The Americas, Africa, Oceania and Slavic lands: chocolate, kangaroo, robot.' },
  { id: 'english', label: 'Made in English', short: 'Coined', color: '#6366f1', blurb: 'Compounds, blends and inventions: blog, selfie, smog, nerd.' },
];

export const STREAM: Record<StreamId, StreamInfo> = Object.fromEntries(STREAMS.map((s) => [s.id, s])) as Record<StreamId, StreamInfo>;
