/**
 * The Etymon data model. Everything the site shows lives in /data as plain JSON, so it can be
 * edited, reviewed and exported without touching code. `npm run validate` checks it.
 *
 * Years are integers; negative = BCE. All language ids are Wiktionary language codes
 * (e.g. "ang" Old English, "la" Latin, "fro" Old French, "ine-pro" Proto-Indo-European),
 * which lets curated words and live Wiktionary lookups share one vocabulary.
 */

/** The coloured "streams" of the River of English. Every language belongs to exactly one. */
export type StreamId =
  | 'ancient' // reconstructed proto-languages beyond any one branch (PIE, Proto-Afroasiatic…)
  | 'native' // Proto-Germanic → Old English → Middle English: the inherited core
  | 'norse' // Old Norse and the Scandinavian languages
  | 'dutch' // Dutch, Low German, German, Frankish, Yiddish
  | 'latin' // Latin in all its periods
  | 'french' // Old French, Anglo-Norman, Middle & Modern French
  | 'greek' // Ancient & Modern Greek
  | 'celtic' // Irish, Scottish Gaelic, Welsh, Breton, Gaulish
  | 'romance' // Italian, Spanish, Portuguese and other Romance languages
  | 'semitic' // Arabic, Hebrew, Aramaic and the ancient Near East
  | 'asia' // Persian, Sanskrit, Hindi, Tamil, Malay, Chinese, Japanese, Turkish…
  | 'world' // the Americas, Africa, Oceania, Slavic & everything else
  | 'english'; // English itself: words coined inside English

export interface Language {
  /** Wiktionary language code, e.g. "ang", "la-med", "gem-pro". */
  id: string;
  name: string;
  stream: StreamId;
  /** The language it descends from, if that is in the data (forms the language family tree). */
  parent?: string;
  /** Rough period the language was spoken/used (years; negative = BCE). Omit `end` if still spoken. */
  start?: number;
  end?: number;
  /** Rough centre of where it was spoken: [longitude, latitude]. Used for journey maps. */
  region?: [number, number];
  /** One or two sentences about the language and what it gave English. */
  blurb?: string;
  /** Approximate share of the English vocabulary (percent) that ultimately comes from it. */
  share?: number;
}

/** A reconstructed (or attested) ancestral root that a family of English words grew from. */
export interface Root {
  /** Slug, e.g. "bher-carry". */
  id: string;
  /** The root as usually written, e.g. "*bʰer-". */
  form: string;
  /** Language code of the root (usually "ine-pro"). */
  lang: string;
  /** Core meaning, e.g. "to carry". */
  meaning: string;
  blurb?: string;
}

/** One step on a word's journey into English. */
export interface Stage {
  lang: string;
  form: string;
  /** What it meant at this stage, if notably different or worth showing. */
  meaning?: string;
  /** Approximate year this form is attested / was in use (negative = BCE). */
  year?: number;
  note?: string;
}

export type WordStatus = 'living' | 'archaic' | 'extinct';

export interface Word {
  /** URL slug; usually the word itself, lowercased with spaces → hyphens. Unique. */
  id: string;
  /** The word as written today (or as it was last written, for lost words). */
  word: string;
  /** Part of speech: "noun", "verb", "adjective"… */
  pos?: string;
  /** What it means (today, or when it was last used). */
  gloss: string;
  /** Language English took it from directly (its immediate source). For words formed inside
   *  English (compounds, coinages, blends, eponyms) use "en". */
  origin: string;
  /** The journey, oldest first. The last stage is normally the English form. */
  path: Stage[];
  /** Year it is first recorded in English (approximate). */
  first: number;
  /** The ancestral root this word grew from, if any (a Root id). */
  root?: string;
  /** Default "living". "archaic" = still known but rarely used; "extinct" = lost. */
  status?: WordStatus;
  /** For archaic/extinct words: roughly when it fell out of use. */
  died?: number;
  /** For lost words: the word that replaced it, if any. */
  replacedBy?: string;
  /** A short, delightful story of how the word came to be (1–3 sentences). */
  story: string;
  /** Approximate relative usage over time, as [year, 0–100] pairs (100 = the word's own peak),
   *  sorted by year. An honest estimate of the curve's shape, not a measurement. */
  usage?: [number, number][];
  /** Themes, e.g. "food", "animals", "body", "law", "science", "internet". */
  tags?: string[];
  /** Ids of other words worth jumping to (cognates, doublets, look-alikes). */
  related?: string[];
  /** Hand-picked showpieces for the hero and spotlights. */
  featured?: boolean;
}

export interface Era {
  id: string;
  name: string;
  start: number;
  end: number;
  blurb: string;
}

export interface HistoryEvent {
  year: number;
  title: string;
  blurb: string;
  /** Streams this event fed (used to highlight them on the river). */
  streams?: StreamId[];
}

/** Approximate rate at which each stream added new words to English over time. */
export interface Influx {
  /** Explanation of where the numbers come from and how rough they are. */
  note: string;
  /** Bin start years, ascending (e.g. every 50 years from 450). */
  years: number[];
  /** For each stream, one relative value per bin (same length as `years`). */
  series: Partial<Record<StreamId, number[]>>;
}

export interface Dataset {
  languages: Language[];
  roots: Root[];
  words: Word[];
  eras: Era[];
  events: HistoryEvent[];
  influx: Influx;
}
