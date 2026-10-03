import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Language } from '../../data';
import { data, formatYear, langColor, lineage } from '../../data';
import { href } from '../../lib/router';
import { STREAM } from '../../lib/streams';
import { WordLink } from '../../ui/WordLink';
import MiniMap from './MiniMap';
import { byCentury, passedThrough, period, relationText } from './model';

const EASE = [0.16, 1, 0.3, 1] as const;
const CAP = 72;

/** Everything about one language: when and where, its ancestry, and the words English took from it. */
export default function LangDetail({ lang, onSelect, reduced }: { lang: Language; onSelect: (id: string) => void; reduced: boolean }) {
  return (
    <div className="lg-detail card" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={lang.id} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -8, transition: { duration: 0.15 } }} transition={{ duration: 0.5, ease: EASE }}>
          <Body lang={lang} onSelect={onSelect} reduced={reduced} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Body({ lang, onSelect, reduced }: { lang: Language; onSelect: (id: string) => void; reduced: boolean }) {
  const [all, setAll] = useState(false);
  const words = useMemo(() => data.wordsByOrigin.get(lang.id) ?? [], [lang.id]);
  const through = useMemo(() => passedThrough(lang.id), [lang.id]);
  const direct = words.length > 0;
  const wall = direct ? words : through;
  const groups = useMemo(() => byCentury(all ? wall : wall.slice().sort((a, b) => (a.first ?? 0) - (b.first ?? 0)).slice(0, CAP)), [wall, all]);
  const line = lineage(lang.id);
  const chain = [...line].reverse();
  const per = period(lang, formatYear);
  const s = STREAM[lang.stream];
  const click = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    onSelect(id);
  };
  let i = 0;

  return (
    <>
      <div className="lg-d__top">
        <div className="lg-d__id">
          <div className="lg-d__stream mono" style={{ '--c': s.color } as React.CSSProperties}>
            <span className="dot" />
            {s.label}
          </div>
          <h3 className="lg-d__name">{lang.name}</h3>
          {per && <div className="lg-d__per mono">{per}</div>}
        </div>
        {typeof lang.share === 'number' && (
          <div className="lg-d__share" title="Approximate share of the English vocabulary">
            <span className="lg-d__share-n">
              <small>≈</small>
              {lang.share}
              <small>%</small>
            </span>
            <span className="lg-d__share-l">of the dictionary</span>
          </div>
        )}
      </div>

      {lang.region && (
        <div className="lg-d__map">
          <MiniMap ids={line.map((l) => l.id)} width={340} height={150} reduced={reduced} />
        </div>
      )}

      {lang.blurb && <p className="lg-d__blurb">{lang.blurb}</p>}
      <p className="lg-d__rel">{relationText(lang.id)}</p>

      {chain.length > 1 && (
        <div className="lg-d__block">
          <div className="lg-d__label mono">Lineage</div>
          <ol className="lg-chain">
            {chain.map((l, k) => (
              <li key={l.id} style={{ '--c': langColor(l.id) } as React.CSSProperties}>
                {k > 0 && (
                  <svg className="lg-chain__arrow" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                    <path d="M2 6h8M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {l.id === lang.id ? (
                  <span className="lg-chain__item is-here">
                    <span className="dot" />
                    {l.name}
                  </span>
                ) : (
                  <a className="lg-chain__item" href={href.lang(l.id)} onClick={(e) => click(e, l.id)}>
                    <span className="dot" />
                    {l.name}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="lg-d__block">
        <div className="lg-d__label mono">
          {lang.id === 'en' ? 'Made in English' : direct ? `Words English took from ${lang.name}` : `Words that passed through ${lang.name}`}
          <span className="lg-d__count">{wall.length}</span>
        </div>
        {wall.length === 0 ? (
          <p className="lg-d__empty">No words from {lang.name} in Etymon yet.</p>
        ) : (
          <div className="lg-wall">
            {groups.map(([c, ws]) => (
              <div className="lg-wall__row" key={c}>
                <div className="lg-wall__c mono">{c}</div>
                <div className="lg-wall__ws">
                  {ws.map((w) => (
                    <motion.span key={w.id} className="lg-wall__w" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : Math.min(i++, 40) * 0.018 + 0.1, duration: 0.4, ease: EASE }}>
                      <WordLink word={w.id} />
                    </motion.span>
                  ))}
                </div>
              </div>
            ))}
            {wall.length > CAP && (
              <button type="button" className="lg-more" onClick={() => setAll((v) => !v)}>
                {all ? 'Show fewer' : `Show all ${wall.length}`}
              </button>
            )}
          </div>
        )}
      </div>

      {through.length > 0 && direct && (
        <details className="lg-through">
          <summary>
            <span className="mono">Also passed through {lang.name}</span>
            <span className="lg-d__count">{through.length}</span>
          </summary>
          <div className="lg-through__ws">
            {through.slice(0, 120).map((w) => (
              <WordLink key={w.id} word={w.id} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
