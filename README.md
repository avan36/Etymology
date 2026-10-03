# Etymon — how English came to be

An interactive, animated history of English words: where they came from, how they changed on
the way, how popular they've been, and the words we lost.

**Live site:** https://avan36.github.io/Etymology/

- **The River of English** shows 1,500 years of vocabulary as one river, with a tributary for each
  source language: Old English, Norse, Latin, French, Greek, Arabic, Hindi, Nahuatl and more.
  Words float along it at the year they arrived.
- **Word pages** show each word's journey stage by stage (for example *wódr̥ → wæter → water)
  on a timeline and a map, plus its story, an estimated popularity curve, today's frequency
  and its word family.
- **Any word, live.** Words that aren't in the curated data are looked up on Wiktionary as you
  search, and their etymology is turned into the same journey view.
- **Roots** grows the family tree of a single ancient root into dozens of modern words.
- **Languages** shows where the English vocabulary comes from and the language family tree.
- **Trends** shows words rising and falling, with a time machine to scrub through the centuries.
- **Lost words** is a museum of words English dropped: wanhope, overmorrow, groak…

## Running it

```bash
npm install
npm run dev       # local dev server
npm run validate  # check the data
npm run build     # validate + typecheck + production build into dist/
```

Every push to the default branch builds the site and publishes it to the `gh-pages` branch
(`.github/workflows/deploy.yml`).

## The data

All content lives in [`data/`](data) as plain JSON, separate from the code:

| Path | What |
| --- | --- |
| `data/words/*.json` | Words: journey (`path`), first attestation, root, story, usage curve, status |
| `data/languages/*.json` | Languages (Wiktionary codes), their parent language, stream, period, region |
| `data/roots/*.json` | Ancestral roots (mostly Proto-Indo-European) that word families grow from |
| `data/eras.json`, `data/events.json` | Periods and milestones in the history of English |
| `data/influx.json` | Estimated rate of new words from each source over time (drives the river) |

Every file in a folder is merged, so new batches of words can be added as new files. The format
is documented in [`src/data/types.ts`](src/data/types.ts). `npm run validate` checks references,
years and shapes, and the build fails if the data is broken. The whole dataset can also be
downloaded as JSON from the site's footer.

**About the numbers.** Etymologies follow standard references (the OED, Etymonline and
Wiktionary). The popularity curves are hand-estimated shapes, relative to each word's own peak,
and are labelled as estimates on the site. "Today" frequencies come live from
[Datamuse](https://www.datamuse.com/api/), which uses Google Books Ngram counts. The river's
widths are smoothed approximations of published surveys of OED first attestations.

## Stack

Vite, React 19, TypeScript, framer-motion and d3 (shape, scale, hierarchy, geo), with Canvas and
SVG rendering. There's no backend: everything is static, and the live lookups call Wiktionary and
Datamuse directly from the browser.
