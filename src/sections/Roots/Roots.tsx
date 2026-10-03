import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import type { Root, Word } from '../../data';
import { data, formatYear, langName } from '../../data';
import { href, useRoute } from '../../lib/router';
import { STREAM } from '../../lib/streams';
import { WordLink } from '../../ui/WordLink';
import RootPicker, { type Ranked } from './RootPicker';
import RootTree from './RootTree';
import RootOutline from './RootOutline';
import { buildTree, familyStreams } from './tree';
import { replaceHash, useReduced, useWidth } from './hooks';
import './roots.css';

const EASE = [0.16, 1, 0.3, 1] as const;
const NARROW = 620;

/** Chapter 2 — one ancestral root and the family of English words that grew from it. */
export default function Roots() {
  const route = useRoute();
  const reduced = useReduced();

  const ranked: Ranked[] = useMemo(
    () =>
      data.roots
        .map((root) => ({ root, n: data.wordsByRoot.get(root.id)?.length ?? 0 }))
        .filter((r) => r.n >= 2)
        .sort((a, b) => b.n - a.n || a.root.meaning.localeCompare(b.root.meaning)),
    [],
  );

  const routeId = route.kind === 'root' && data.root.has(route.id) ? route.id : undefined;
  const [sel, setSel] = useState<string | undefined>(() => routeId ?? ranked[0]?.root.id);
  useEffect(() => {
    if (routeId) setSel(routeId);
  }, [routeId]);

  const select = (id: string) => {
    setSel(id);
    replaceHash(href.root(id));
  };
  const surprise = () => {
    const pool = ranked.filter((r) => r.root.id !== sel);
    const rich = pool.filter((r) => r.n >= 3);
    const from = rich.length >= 3 ? rich : pool;
    if (from.length) select(from[Math.floor(Math.random() * from.length)].root.id);
  };

  const root = sel ? data.root.get(sel) : undefined;
  const words = useMemo(() => (sel ? (data.wordsByRoot.get(sel) ?? []) : []), [sel]);

  return (
    <section id="roots" className="section rt" aria-labelledby="roots-title">
      <div className="page">
        <motion.header className="section__head" initial="hide" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.09 } } }}>
          <motion.div className="section__eyebrow" variants={rise(reduced)}>Chapter 2 · Word families</motion.div>
          <motion.h2 id="roots-title" className="section__title" variants={rise(reduced)}>
            One root, <em>a hundred</em> words
          </motion.h2>
          <motion.p className="section__lede" variants={rise(reduced)}>
            Six thousand years ago, somewhere on the steppe, <span className="old">*bʰer-</span> meant “to carry”. Today you <i>bear</i> it, <i>transfer</i> it, <i>offer</i> it and call it a <i>metaphor</i>. Pick a root and watch its family branch into modern English.
          </motion.p>
        </motion.header>

        {ranked.length === 0 ? (
          <div className="rt-empty card">Word families appear here as soon as words are linked to their roots.</div>
        ) : (
          <>
            <RootPicker ranked={ranked} selected={sel} onSelect={select} onSurprise={surprise} reduced={reduced} />
            {root && <Stage root={root} words={words} reduced={reduced} />}
          </>
        )}
      </div>
    </section>
  );
}

function rise(reduced: boolean) {
  return {
    hide: reduced ? { opacity: 1 } : { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.8, ease: EASE } },
  };
}

function Stage({ root, words, reduced }: { root: Root; words: Word[]; reduced: boolean }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const view = useRef<HTMLDivElement>(null);
  const seen = useInView(view, { once: true, amount: 0.15 });
  const tree = useMemo(() => buildTree(root, words), [root, words]);
  const narrow = width > 0 && width < NARROW;

  return (
    <div className="rt-stage" ref={view}>
      <RootCard root={root} words={words} reduced={reduced} />
      <div className="rt-canvas" ref={box}>
        {words.length === 0 ? (
          <div className="rt-none">
            <span className="old">{root.form}</span> has no English words in Etymon yet.
          </div>
        ) : (
          width > 0 && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={root.id + (narrow ? ':n' : ':w')} initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.22 } }}>
                {narrow ? <RootOutline root={root} tree={tree} play={seen} reduced={reduced} /> : <RootTree root={root} tree={tree} width={width} play={seen} reduced={reduced} />}
              </motion.div>
            </AnimatePresence>
          )
        )}
      </div>
    </div>
  );
}

function RootCard({ root, words, reduced }: { root: Root; words: Word[]; reduced: boolean }) {
  const streams = useMemo(() => familyStreams(root, words), [root, words]);
  const dated = words.filter((w) => typeof w.first === 'number').sort((a, b) => a.first - b.first);
  const oldest = dated[0];
  const newest = dated.length > 1 ? dated[dated.length - 1] : undefined;
  const n = words.length;

  return (
    <aside className="rt-card card" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={root.id}
          className="rt-card__in"
          initial={reduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -6, transition: { duration: 0.16 } }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="rt-card__eyebrow mono">{langName(root.lang)} root</div>
          <h3 className="rt-card__form old">{root.form}</h3>
          <p className="rt-card__mean">“{root.meaning}”</p>
          {root.blurb && <p className="rt-card__blurb">{root.blurb}</p>}

          <div className="rt-card__stats">
            <div className="rt-stat">
              <span className="rt-stat__n">{n}</span>
              <span className="rt-stat__l">English {n === 1 ? 'descendant' : 'descendants'}</span>
            </div>
            {oldest && (
              <div className="rt-stat">
                <span className="rt-stat__n rt-stat__n--yr">{formatYear(oldest.first, oldest.first < 1500)}</span>
                <span className="rt-stat__l">
                  oldest, <WordLink word={oldest.id} />
                </span>
              </div>
            )}
          </div>

          {streams.length > 0 && (
            <div className="rt-card__streams">
              <div className="rt-card__label mono">Travelled through</div>
              <div className="rt-card__chips">
                {streams.map((s) => (
                  <span key={s.id} className="rt-chip" style={{ '--c': STREAM[s.id].color } as React.CSSProperties} title={STREAM[s.id].label}>
                    <span className="dot" />
                    {STREAM[s.id].short}
                    <span className="rt-chip__n mono">{s.n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {newest && (
            <p className="rt-card__foot">
              Youngest: <WordLink word={newest.id} />, {formatYear(newest.first)}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
