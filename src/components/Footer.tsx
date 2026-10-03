/**
 * The closing page: a last big line, an invitation to search, credits and sources, a download
 * of the whole dataset as JSON, and the repository link.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { data } from '../data';
import { href } from '../lib/router';
import { STREAMS } from '../lib/streams';
import { openSearch } from '../search/bus';
import { isApple } from '../search/recent';
import { ArrowUpIcon, DownloadIcon, GitHubIcon, SearchIcon } from '../search/icons';
import './footer.css';

const REPO = 'https://github.com/avan36/etymology';

function datasetJson(): string {
  const { languages, roots, words, eras, events, influx } = data;
  return JSON.stringify({ languages, roots, words, eras, events, influx }, null, 2);
}

function download() {
  const blob = new Blob([datasetJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'etymon-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const fmtSize = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

const WRITTEN = 'still being written.';

export default function Footer() {
  const reduce = useReducedMotion();
  const [size, setSize] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const year = new Date().getFullYear();
  const apple = typeof navigator !== 'undefined' && isApple();
  // Mirrored so the drifting background repeats without a seam.
  const gradient = useMemo(() => {
    const cs = STREAMS.filter((s) => s.id !== 'ancient').map((s) => s.color);
    return `linear-gradient(90deg, ${[...cs, ...cs.slice(0, -1).reverse()].join(', ')})`;
  }, []);

  // Work out the download size when the browser is idle.
  useEffect(() => {
    const run = () => setSize(fmtSize(new Blob([datasetJson()]).size));
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, []);

  const onDownload = () => {
    download();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  };

  return (
    <footer className="foot" aria-labelledby="foot-title">
      <div className="foot__stream" style={{ backgroundImage: gradient }} aria-hidden />
      <div className="page">
        <div className="foot__closing">
          <p className="foot__eyebrow">Epilogue</p>
          <h2 className="foot__title" id="foot-title">
            <span className="sr-only">English is {WRITTEN}</span>
            <span aria-hidden>
              English is{' '}
              <motion.em
                className="foot__typed"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.6 }}
                variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.055, delayChildren: 0.2 } } }}
              >
                {WRITTEN.split(' ').map((word, wi, all) => (
                  <Fragment key={wi}>
                  <span className="foot__w">
                    {Array.from(word).map((c, ci) => (
                      <motion.span
                        key={ci}
                        className="foot__l"
                        variants={reduce ? { hidden: { opacity: 1 }, show: { opacity: 1 } } : { hidden: { opacity: 0, y: '0.12em', filter: 'blur(6px)' }, show: { opacity: 1, y: '0em', filter: 'blur(0px)', transition: { duration: 0.35 } } }}
                      >
                        {c}
                      </motion.span>
                    ))}
                    {wi === all.length - 1 && <span className="foot__caret" />}
                  </span>
                  {wi < all.length - 1 ? ' ' : null}
                  </Fragment>
                ))}
              </motion.em>
            </span>
          </h2>
          <p className="foot__lede">
            Every year, thousands of new words knock at the door. A few will stay for centuries, and someone,
            someday, will trace them back to us. Which word will you follow next?
          </p>
          <button type="button" className="foot__search" onClick={() => openSearch()}>
            <SearchIcon size={18} />
            <span className="foot__search-txt">Search any word</span>
            <span className="foot__search-keys" aria-hidden><kbd>{apple ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd></span>
          </button>
        </div>

        <div className="foot__grid">
          <section className="foot__col" aria-labelledby="foot-sources">
            <h3 id="foot-sources">Sources</h3>
            <p>
              Etymologies are hand-curated from the standard references:{' '}
              <a href="https://www.etymonline.com/" target="_blank" rel="noreferrer">Etymonline</a>,{' '}
              <a href="https://en.wiktionary.org/" target="_blank" rel="noreferrer">Wiktionary</a> and the{' '}
              <a href="https://www.oed.com/" target="_blank" rel="noreferrer">Oxford English Dictionary</a>, which we
              used for reference and cross-checking.
            </p>
          </section>
          <section className="foot__col" aria-labelledby="foot-notes">
            <h3 id="foot-notes">A note on the data</h3>
            <p>
              Dates are approximate and reconstructed forms (marked <span className="old">*</span>) were never written down.
              Popularity curves are honest estimates of shape, not measurements. Words outside the collection are looked
              up live from <a href="https://en.wiktionary.org/" target="_blank" rel="noreferrer">Wiktionary</a> &amp;{' '}
              <a href="https://www.datamuse.com/api/" target="_blank" rel="noreferrer">Datamuse</a>.
            </p>
          </section>
          <section className="foot__col" aria-labelledby="foot-take">
            <h3 id="foot-take">Take it with you</h3>
            <p>
              {data.words.length.toLocaleString('en-US')} words, {data.languages.length} languages and {data.roots.length} roots,
              as plain, open JSON.
            </p>
            <div className="foot__btns">
              <button type="button" className="foot__btn foot__btn--solid" onClick={onDownload}>
                <DownloadIcon size={17} />
                <span>{saved ? 'Saved' : 'Download the data'}</span>
                {size && !saved && <span className="foot__btn-meta">JSON · {size}</span>}
              </button>
              <a className="foot__btn" href={REPO} target="_blank" rel="noreferrer">
                <GitHubIcon size={16} />
                <span>Source on GitHub</span>
              </a>
            </div>
          </section>
        </div>

        <div className="foot__base">
          <a className="foot__mark" href={href.section('top')}>Etym<em>o</em>n</a>
          <span className="foot__fine">© {year} Etymon · An open, animated history of English words.</span>
          <a className="foot__top" href={href.section('top')} onClick={(e) => { if (location.hash === href.section('top')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}>
            <span>Back to top</span>
            <ArrowUpIcon size={15} />
          </a>
        </div>
      </div>
    </footer>
  );
}
