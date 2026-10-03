import type { Dataset, Era, HistoryEvent, Influx, Language, Root, Word } from './types';
import eras from '../../data/eras.json';
import events from '../../data/events.json';
import influx from '../../data/influx.json';

// Every file in these folders is merged, so new batches of words/languages/roots can be added
// as new files without touching code.
const words = import.meta.glob<Word[]>('../../data/words/*.json', { eager: true, import: 'default' });
const languages = import.meta.glob<Language[]>('../../data/languages/*.json', { eager: true, import: 'default' });
const roots = import.meta.glob<Root[]>('../../data/roots/*.json', { eager: true, import: 'default' });

const flat = <T,>(m: Record<string, T[]>) => Object.keys(m).sort().flatMap((k) => m[k]);

export function loadDataset(): Dataset {
  return {
    languages: flat(languages),
    roots: flat(roots),
    words: flat(words),
    eras: eras as Era[],
    events: events as HistoryEvent[],
    influx: influx as Influx,
  };
}
