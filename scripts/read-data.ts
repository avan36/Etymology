import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Dataset } from '../src/data/types';

const root = join(import.meta.dirname, '..', 'data');
const json = (p: string) => {
  try {
    return JSON.parse(readFileSync(join(root, p), 'utf8'));
  } catch (e) {
    throw new Error(`data/${p}: ${(e as Error).message}`);
  }
};
const dir = (d: string) =>
  readdirSync(join(root, d))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => json(join(d, f)));

export function readDataset(): Dataset {
  return {
    languages: dir('languages'),
    roots: dir('roots'),
    words: dir('words'),
    eras: json('eras.json'),
    events: json('events.json'),
    influx: json('influx.json'),
  };
}
