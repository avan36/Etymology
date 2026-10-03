import { data, findWord, wordStream } from '../../data';
import type { Word } from '../../data';
import { endYear, hasUsage, peakYear, usage, firstUsageYear } from './curves';

/** A ready-made comparison that tells a story. Built from whatever words exist in the data. */
export interface Preset {
  id: string;
  label: string;
  blurb: string;
  words: string[];
}

const MAX = 6;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const uniq = (ws: Word[]) => [...new Map(ws.map((w) => [w.id, w])).values()];
const peakVal = (w: Word) => Math.max(...(w.usage ?? [[0, 0]]).map((p) => p[1]));
const tagged = (pool: Word[], ...tags: string[]) => pool.filter((w) => w.tags?.some((t) => tags.includes(t)));
const byFeatured = (a: Word, b: Word) => Number(!!b.featured) - Number(!!a.featured);

/** Reorder so no stream dominates: take words round-robin across streams, keeping each stream's order. */
function diverse(ws: Word[]): Word[] {
  const by = new Map<string, Word[]>();
  for (const w of ws) {
    const k = wordStream(w);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(w);
  }
  const lanes = [...by.values()];
  const out: Word[] = [];
  for (let i = 0; out.length < ws.length; i++) for (const l of lanes) if (l[i]) out.push(l[i]);
  return out;
}

/** Pick up to n words spread evenly through a list (keeps the first and last). */
function spread(ws: Word[], n = MAX): Word[] {
  if (ws.length <= n) return ws;
  return Array.from({ length: n }, (_, i) => ws[Math.round((i * (ws.length - 1)) / (n - 1))]);
}

export function buildPresets(words: Word[] = data.words): Preset[] {
  const pool = words.filter(hasUsage);
  const inPool = new Map(pool.map((w) => [w.id, w]));
  const get = (id?: string) => (id ? inPool.get(id) ?? (findWord(id) && inPool.get(findWord(id)!.id)) : undefined);
  const end = endYear();
  const out: Preset[] = [];
  const add = (p: Omit<Preset, 'words'> & { words: Word[] }) => {
    const ws = uniq(p.words).slice(0, MAX);
    if (ws.length >= 2) out.push({ ...p, words: ws.map((w) => w.id) });
  };

  // 1 · The Norman takeover — English words paired with the French ones that moved in beside them.
  {
    const pairs: [Word, Word][] = [];
    const seen = new Set<string>();
    // The classic pairs first, when we have them…
    const classic = [['cow', 'beef'], ['swine', 'pork'], ['sheep', 'mutton'], ['calf', 'veal'], ['deer', 'venison'], ['wanhope', 'despair'], ['here', 'army'], ['ea', 'river'], ['frith', 'peace'], ['ellen', 'courage']];
    for (const [a, b] of classic) {
      const n = get(a), f = get(b);
      if (n && f && pairs.length < 3) { pairs.push([n, f]); seen.add(n.id).add(f.id); }
    }
    // …then any English/French pairs the data links together.
    const french =pool.filter((w) => wordStream(w) === 'french' && w.first >= 1066 && w.first <= 1500).sort(byFeatured);
    for (const f of french) {
      if (pairs.length >= 3) break;
      const partners = [
        ...(f.related ?? []).map(get),
        ...pool.filter((n) => n.replacedBy === f.id || n.related?.includes(f.id)),
      ].filter((n): n is Word => !!n && wordStream(n) === 'native' && n.first < f.first);
      const n = partners.find((p) => !seen.has(p.id));
      if (n && !seen.has(f.id)) {
        pairs.push([n, f]);
        seen.add(n.id).add(f.id);
      }
      if (pairs.length >= 3) break;
    }
    add({
      id: 'norman',
      label: 'The Norman takeover',
      blurb: 'After 1066 the French-speaking lords brought their own words. English kept the farmyard, French took the table: watch each pair cross.',
      words: pairs.flat(),
    });
  }

  // 2 · Thou → you — the pronoun shift, or any pronouns we have.
  {
    const ids = ['thou', 'thee', 'ye', 'you', 'thy', 'thine'];
    const named = ids.map(get).filter((w): w is Word => !!w);
    const hasPair = named.some((w) => w.id === 'thou') && named.some((w) => w.id === 'you');
    const pron = hasPair ? named : pool.filter((w) => w.pos === 'pronoun');
    add({
      id: 'thou',
      label: hasPair ? 'Thou → you' : 'Pronouns on the move',
      blurb: 'Thou was for friends, children and God; you was the polite plural. Everyone wanted to be polite, and by 1700 thou had all but gone.',
      words: pron,
    });
  }

  // 3 · Slang — from the oldest slang word to the newest ("Groovy to rizz").
  {
    const slang = tagged(pool, 'slang').sort((a, b) => firstUsageYear(a) - firstUsageYear(b));
    const pick = spread(slang);
    if (pick.length >= 2) {
      add({
        id: 'slang',
        label: `${cap(pick[0].word)} to ${pick[pick.length - 1].word}`,
        blurb: 'Slang burns bright and fast. Each generation’s coolest word sounds dated to the next.',
        words: pick,
      });
    }
  }

  // 4 · Born online.
  {
    const web = tagged(pool, 'internet', 'web', 'online').filter((w) => w.first >= 1960);
    const fallback = web.length >= 2 ? web : pool.filter((w) => w.first >= 1990);
    add({
      id: 'online',
      label: 'Born online',
      blurb: 'Words the web made. Most are younger than the people using them, and some are already past their peak.',
      words: fallback.sort(byFeatured).slice(0, MAX).sort((a, b) => a.first - b.first),
    });
  }

  // 5 · Fading away — curves that peaked long ago and have fallen most since.
  {
    const taken = new Set(out.find((p) => p.id === 'thou')?.words ?? []);
    const fading = diverse(
      pool
        .map((w) => ({ w, drop: peakVal(w) - usage(w, end) }))
        .filter(({ w, drop }) => drop >= 40 && peakYear(w) < end - 60 && w.status !== 'extinct' && !taken.has(w.id))
        .sort((a, b) => b.drop - a.drop)
        .map((x) => x.w),
    );
    add({
      id: 'fading',
      label: 'Fading away',
      blurb: 'Not gone, not yet. These words peaked long ago and have been slipping out of use ever since.',
      words: fading,
    });
  }

  // 6 · The machine age — technology words born 1750–1960.
  {
    const tech = tagged(pool, 'technology', 'invention').filter((w) => w.first >= 1750 && w.first < 1960).sort((a, b) => a.first - b.first);
    add({
      id: 'machines',
      label: 'The machine age',
      blurb: 'Telegraph, radio, television. The gadgets arrived with their names, and most of the names faded when the gadgets did.',
      words: spread(tech),
    });
  }

  // 7 · Late bloomers — old words that only peaked in modern times.
  {
    const late = diverse(
      pool
        .filter((w) => w.first < 1500 && peakYear(w) >= 1900 && usage(w, 1600) <= 55)
        .sort((a, b) => usage(a, 1600) - usage(b, 1600)),
    );
    add({
      id: 'late',
      label: 'Late bloomers',
      blurb: 'Old words that waited centuries for their moment.',
      words: late,
    });
  }

  // 8 · Built to last — core vocabulary that barely moves.
  {
    const core = diverse(
      pool
        .filter((w) => w.first <= 1100 && usage(w, end) >= 60 && Math.min(...(w.usage ?? []).map((p) => p[1])) >= 50)
        .sort(byFeatured),
    );
    add({
      id: 'core',
      label: 'Built to last',
      blurb: 'Words that have barely flinched in thirteen centuries: the bedrock of everyday English.',
      words: core,
    });
  }

  return out;
}
