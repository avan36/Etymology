import { data } from '../data';
import type { StreamId } from '../data';
import { STREAM } from '../lib/streams';

/**
 * Language lookups for the word sheet. Curated data (data.lang) always wins; a small built-in
 * table fills the gaps for codes that turn up in live Wiktionary etymologies, so a live lookup
 * still gets a sensible name, colour and (often) a place on the map.
 */

export interface LangInfo {
  id: string;
  name: string;
  stream: StreamId;
  color: string;
  region?: [number, number];
  start?: number;
  end?: number;
  /** True for reconstructed proto-languages (forms are hypothetical, dates are rough). */
  proto: boolean;
}

/** Wiktionary etymology-only / legacy codes → canonical ids. */
const ALIAS: Record<string, string> = {
  'ML.': 'la-med', 'LL.': 'la-lat', 'NL.': 'la-new', 'VL.': 'la-vul', 'EL.': 'la-ecc', 'CL.': 'la',
  'la-cla': 'la', 'la-ear': 'la', 'la-lat': 'la-lat', 'la-ren': 'la-new', 'la-pro': 'itc-pro',
  'OF.': 'fro', 'MF.': 'frm', 'AN.': 'xno', 'ONF.': 'fro-nor', 'fr-mid': 'frm', 'fro-anc': 'fro',
  'grc-att': 'grc', 'grc-ion': 'grc', 'grc-dor': 'grc', 'grc-aeo': 'grc', 'grc-hom': 'grc', 'grc-cla': 'grc',
  'grc-bib': 'grc-koi', 'gkm-pro': 'gkm',
  'nds-de': 'nds', 'nds-nl': 'nds', 'de-AT': 'de', 'de-CH': 'gsw',
  'fa-cls': 'fa', 'fa-ira': 'fa', 'ar-cla': 'ar', 'ar-MSA': 'ar', 'he-IL': 'he',
  'zh-min-nan': 'nan', 'nan-hbl': 'nan', 'cmn-ear': 'cmn',
  'en-GB': 'en', 'en-US': 'en', 'en-AU': 'en', 'en-early': 'en', 'en-mid': 'en',
  'enm-nor': 'enm', 'enm-sou': 'enm', 'ang-ang': 'ang', 'ang-nor': 'ang', 'ang-wsx': 'ang',
  'non-own': 'non', 'non-oen': 'non', 'non-ogt': 'non',
  'sa-ved': 'sa', 'sa-cls': 'sa', 'pi-old': 'pi',
  'it-oit': 'it', 'es-old': 'osp', 'pt-old': 'roa-opt',
};

type Extra = { name: string; stream: StreamId; region?: [number, number] };

/** Codes that are common in etymologies but may be missing from the curated language list. */
const EXTRA: Record<string, Extra> = {
  'osx': { name: 'Old Saxon', stream: 'dutch', region: [9, 52.5] },
  'ofs': { name: 'Old Frisian', stream: 'dutch', region: [6, 53.2] },
  'fy': { name: 'West Frisian', stream: 'dutch', region: [5.8, 53.2] },
  'li': { name: 'Limburgish', stream: 'dutch', region: [5.7, 50.9] },
  'vls': { name: 'West Flemish', stream: 'dutch', region: [3.2, 51.2] },
  'lb': { name: 'Luxembourgish', stream: 'dutch', region: [6.1, 49.6] },
  'gsw': { name: 'Swiss German', stream: 'dutch', region: [8.5, 47.4] },
  'bar': { name: 'Bavarian', stream: 'dutch', region: [11.6, 48.1] },
  'gmq-pro': { name: 'Proto-Norse', stream: 'norse', region: [10, 59] },
  'gmq-osw': { name: 'Old Swedish', stream: 'norse', region: [18, 59.3] },
  'gmq-oda': { name: 'Old Danish', stream: 'norse', region: [12.6, 55.7] },
  'fo': { name: 'Faroese', stream: 'norse', region: [-6.8, 62] },
  'nb': { name: 'Norwegian Bokmål', stream: 'norse', region: [10.7, 59.9] },
  'nn': { name: 'Norwegian Nynorsk', stream: 'norse', region: [6, 61] },
  'gkm': { name: 'Byzantine Greek', stream: 'greek', region: [28.98, 41.01] },
  'fro-nor': { name: 'Old Northern French', stream: 'french', region: [2.8, 50.3] },
  'nrf': { name: 'Norman', stream: 'french', region: [-0.4, 49.2] },
  'oc': { name: 'Occitan', stream: 'french', region: [1.4, 43.6] },
  'frc': { name: 'Cajun French', stream: 'french', region: [-92, 30.2] },
  'osp': { name: 'Old Spanish', stream: 'romance', region: [-4.7, 41.6] },
  'roa-opt': { name: 'Old Galician-Portuguese', stream: 'romance', region: [-8.5, 42.9] },
  'gl': { name: 'Galician', stream: 'romance', region: [-8.5, 42.9] },
  'lad': { name: 'Ladino', stream: 'romance', region: [28.97, 41] },
  'nap': { name: 'Neapolitan', stream: 'romance', region: [14.25, 40.85] },
  'scn': { name: 'Sicilian', stream: 'romance', region: [13.36, 38.1] },
  'vec': { name: 'Venetian', stream: 'romance', region: [12.33, 45.44] },
  'sc': { name: 'Sardinian', stream: 'romance', region: [9.1, 39.2] },
  'kw': { name: 'Cornish', stream: 'celtic', region: [-5.05, 50.26] },
  'gv': { name: 'Manx', stream: 'celtic', region: [-4.5, 54.2] },
  'mga': { name: 'Middle Irish', stream: 'celtic', region: [-7, 53.3] },
  'owl': { name: 'Old Welsh', stream: 'celtic', region: [-3.6, 52.3] },
  'wlm': { name: 'Middle Welsh', stream: 'celtic', region: [-3.6, 52.3] },
  'cel-bry-pro': { name: 'Proto-Brythonic', stream: 'celtic', region: [-3, 52] },
  'mt': { name: 'Maltese', stream: 'semitic', region: [14.5, 35.9] },
  'syc': { name: 'Classical Syriac', stream: 'semitic', region: [38.8, 37.2] },
  'gez': { name: 'Ge’ez', stream: 'semitic', region: [38.7, 14.1] },
  'sux': { name: 'Sumerian', stream: 'semitic', region: [45.6, 31.3] },
  'xpu': { name: 'Punic', stream: 'semitic', region: [10.3, 36.85] },
  'cop': { name: 'Coptic', stream: 'semitic', region: [31.2, 30] },
  'iir-pro': { name: 'Proto-Indo-Iranian', stream: 'ancient', region: [62, 45] },
  'inc-pro': { name: 'Proto-Indo-Aryan', stream: 'asia', region: [70, 32] },
  'ine-bsl-pro': { name: 'Proto-Balto-Slavic', stream: 'ancient', region: [26, 54] },
  'urj-pro': { name: 'Proto-Uralic', stream: 'ancient', region: [60, 58] },
  'dra-pro': { name: 'Proto-Dravidian', stream: 'ancient', region: [78, 15] },
  'map-pro': { name: 'Proto-Austronesian', stream: 'ancient', region: [121, 23.7] },
  'bnt-pro': { name: 'Proto-Bantu', stream: 'ancient', region: [10, 5] },
  'sit-pro': { name: 'Proto-Sino-Tibetan', stream: 'ancient', region: [100, 33] },
  'trk-pro': { name: 'Proto-Turkic', stream: 'ancient', region: [95, 48] },
  'pra': { name: 'Prakrit', stream: 'asia', region: [80, 25] },
  'ps': { name: 'Pashto', stream: 'asia', region: [69.2, 34.5] },
  'pa': { name: 'Punjabi', stream: 'asia', region: [74.3, 31.5] },
  'mr': { name: 'Marathi', stream: 'asia', region: [73.85, 18.5] },
  'gu': { name: 'Gujarati', stream: 'asia', region: [72.6, 23] },
  'te': { name: 'Telugu', stream: 'asia', region: [78.5, 17.4] },
  'kn': { name: 'Kannada', stream: 'asia', region: [77.6, 13] },
  'ml': { name: 'Malayalam', stream: 'asia', region: [76.3, 10] },
  'si': { name: 'Sinhalese', stream: 'asia', region: [79.9, 6.9] },
  'ne': { name: 'Nepali', stream: 'asia', region: [85.3, 27.7] },
  'bo': { name: 'Tibetan', stream: 'asia', region: [91.1, 29.65] },
  'th': { name: 'Thai', stream: 'asia', region: [100.5, 13.75] },
  'vi': { name: 'Vietnamese', stream: 'asia', region: [105.85, 21] },
  'km': { name: 'Khmer', stream: 'asia', region: [104.9, 11.55] },
  'my': { name: 'Burmese', stream: 'asia', region: [96.1, 16.8] },
  'id': { name: 'Indonesian', stream: 'asia', region: [106.8, -6.2] },
  'jv': { name: 'Javanese', stream: 'asia', region: [110.4, -7.5] },
  'ltc': { name: 'Middle Chinese', stream: 'asia', region: [108.9, 34.3] },
  'och': { name: 'Old Chinese', stream: 'asia', region: [112.4, 34.6] },
  'nan': { name: 'Min Nan (Hokkien)', stream: 'asia', region: [118.1, 24.5] },
  'hak': { name: 'Hakka', stream: 'asia', region: [116.1, 24.3] },
  'ojp': { name: 'Old Japanese', stream: 'asia', region: [135.8, 34.7] },
  'ain': { name: 'Ainu', stream: 'asia', region: [142, 43] },
  'kk': { name: 'Kazakh', stream: 'asia', region: [71.4, 51.2] },
  'uz': { name: 'Uzbek', stream: 'asia', region: [69.3, 41.3] },
  'uk': { name: 'Ukrainian', stream: 'world', region: [30.5, 50.45] },
  'orv': { name: 'Old East Slavic', stream: 'world', region: [30.5, 50.45] },
  'sla-pro': { name: 'Proto-Slavic', stream: 'world', region: [27, 51] },
  'sh': { name: 'Serbo-Croatian', stream: 'world', region: [20.5, 44.8] },
  'bg': { name: 'Bulgarian', stream: 'world', region: [23.3, 42.7] },
  'sk': { name: 'Slovak', stream: 'world', region: [17.1, 48.15] },
  'sl': { name: 'Slovene', stream: 'world', region: [14.5, 46.05] },
  'lt': { name: 'Lithuanian', stream: 'world', region: [25.3, 54.7] },
  'lv': { name: 'Latvian', stream: 'world', region: [24.1, 56.95] },
  'et': { name: 'Estonian', stream: 'world', region: [24.75, 59.44] },
  'sq': { name: 'Albanian', stream: 'world', region: [19.8, 41.3] },
  'hy': { name: 'Armenian', stream: 'world', region: [44.5, 40.2] },
  'xcl': { name: 'Old Armenian', stream: 'world', region: [44.5, 40.2] },
  'ka': { name: 'Georgian', stream: 'world', region: [44.8, 41.7] },
  'hit': { name: 'Hittite', stream: 'world', region: [34.6, 40] },
  'eu': { name: 'Basque', stream: 'world', region: [-2.9, 43.3] },
  'rom': { name: 'Romani', stream: 'world', region: [21, 45] },
  'nah': { name: 'Nahuatl', stream: 'world', region: [-99.1, 19.4] },
  'tpn': { name: 'Tupinambá', stream: 'world', region: [-43, -22.9] },
  'tup': { name: 'Tupi', stream: 'world', region: [-46.6, -23.5] },
  'gn': { name: 'Guaraní', stream: 'world', region: [-57.6, -25.3] },
  'ay': { name: 'Aymara', stream: 'world', region: [-68.1, -16.5] },
  'arw': { name: 'Arawak', stream: 'world', region: [-58, 6] },
  'crk': { name: 'Plains Cree', stream: 'world', region: [-106, 52] },
  'cr': { name: 'Cree', stream: 'world', region: [-90, 53] },
  'oj': { name: 'Ojibwe', stream: 'world', region: [-85, 47] },
  'nv': { name: 'Navajo', stream: 'world', region: [-109, 36] },
  'esx': { name: 'Eskimo-Aleut', stream: 'world', region: [-150, 62] },
  'ht': { name: 'Haitian Creole', stream: 'world', region: [-72.3, 18.5] },
  'jam': { name: 'Jamaican Creole', stream: 'world', region: [-76.8, 18] },
  'tpi': { name: 'Tok Pisin', stream: 'world', region: [147.2, -9.4] },
  'sm': { name: 'Samoan', stream: 'world', region: [-171.8, -13.8] },
  'to': { name: 'Tongan', stream: 'world', region: [-175.2, -21.1] },
  'ty': { name: 'Tahitian', stream: 'world', region: [-149.6, -17.5] },
  'fj': { name: 'Fijian', stream: 'world', region: [178.4, -18.1] },
  'kky': { name: 'Guugu Yimidhirr', stream: 'world', region: [145.25, -15.47] },
  'xdk': { name: 'Dharug', stream: 'world', region: [151.2, -33.8] },
  'zu': { name: 'Zulu', stream: 'world', region: [31, -28.5] },
  'xh': { name: 'Xhosa', stream: 'world', region: [27, -32] },
  'yo': { name: 'Yoruba', stream: 'world', region: [3.9, 7.4] },
  'ha': { name: 'Hausa', stream: 'world', region: [8.5, 12] },
  'ak': { name: 'Akan', stream: 'world', region: [-1.6, 6.7] },
  'kg': { name: 'Kongo', stream: 'world', region: [15.3, -4.3] },
  'ln': { name: 'Lingala', stream: 'world', region: [15.3, -4.3] },
  'mg': { name: 'Malagasy', stream: 'world', region: [47.5, -18.9] },
  'mul': { name: 'Translingual', stream: 'world' },
};

const STREAM_IDS = new Set(Object.keys(STREAM));

/** Canonical id for a language code (resolves Wiktionary etymology-only aliases). */
export function normLang(code: string): string {
  const c = code.trim();
  if (data.lang.has(c)) return c;
  return ALIAS[c] ?? c;
}

const cache = new Map<string, LangInfo>();

export function langInfo(code: string): LangInfo {
  const hit = cache.get(code);
  if (hit) return hit;
  const id = normLang(code);
  const l = data.lang.get(id);
  const x = EXTRA[id];
  const stream: StreamId = l?.stream ?? x?.stream ?? (id.endsWith('-pro') ? 'ancient' : 'world');
  const info: LangInfo = {
    id,
    name: l?.name ?? x?.name ?? id,
    stream: STREAM_IDS.has(stream) ? stream : 'world',
    color: STREAM[STREAM_IDS.has(stream) ? stream : 'world'].color,
    region: l?.region ?? x?.region,
    start: l?.start,
    end: l?.end,
    proto: id.endsWith('-pro') || /^Proto-/.test(l?.name ?? x?.name ?? ''),
  };
  cache.set(code, info);
  return info;
}

/** True when we know the language well enough to name it (curated or built-in). */
export function isKnownLang(code: string): boolean {
  const id = normLang(code);
  return data.lang.has(id) || id in EXTRA;
}
