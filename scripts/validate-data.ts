import { readDataset } from './read-data';
import { validateDataset } from '../src/data/validate';

const ds = readDataset();
const { errors, warnings } = validateDataset(ds);
for (const w of warnings) console.warn(`  ⚠ ${w}`);
for (const e of errors) console.error(`  ✖ ${e}`);
const lost = ds.words.filter((w) => w.status === 'extinct' || w.status === 'archaic').length;
console.log(
  `\n${errors.length ? '✖' : '✔'} ${ds.words.length} words (${lost} lost or archaic), ${ds.languages.length} languages, ` +
    `${ds.roots.length} roots, ${ds.eras.length} eras, ${ds.events.length} events — ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
