import { motion } from 'framer-motion';
import { findWord, wordColor } from '../../data';
import type { Word } from '../../data';
import { href } from '../../lib/router';
import { WordLink } from '../../ui/WordLink';
import Lifespan from './Lifespan';
import { deathEra, lifespan, oldForm, statusLabel, yearsLived } from './lostUtil';

/** A small museum plaque for one lost word. The whole card opens the word's sheet. */
export default function LostCard({ w, index }: { w: Word; index: number }) {
  const old = oldForm(w);
  const era = deathEra(w);
  const lived = yearsLived(w);
  const by = w.replacedBy ? findWord(w.replacedBy) : undefined;
  return (
    <motion.article
      layout="position"
      className="lost-card"
      style={{ '--c': wordColor(w) } as React.CSSProperties}
      initial={{ opacity: 0, y: 26, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(6px)', transition: { duration: 0.25 } }}
      transition={{ delay: Math.min(index, 12) * 0.045, duration: 0.7, ease: [0.16, 1, 0.3, 1], layout: { type: 'spring', stiffness: 300, damping: 34 } }}
    >
      <a className="lost-card__link" href={href.word(w.id)} aria-label={`${w.word}: ${w.gloss}`} />
      <p className="lost-card__top mono">
        <span className={`lost-card__status is-${w.status ?? 'extinct'}`}>{statusLabel(w)}</span>
        {era && <span>{era.name}</span>}
      </p>
      <h4 className="lost-card__word">{w.word}</h4>
      {old && (
        <p className="lost-card__old">
          {old.lang} <span className="old">{old.form}</span>
        </p>
      )}
      <p className="lost-card__gloss">{w.gloss}</p>
      <div className="lost-card__life">
        <div className="lost-card__dates mono">
          <span>{lifespan(w)}</span>
          {lived !== undefined && <span className="lost-card__lived">{lived} yrs</span>}
        </div>
        <Lifespan w={w} />
      </div>
      {w.replacedBy && (
        <p className="lost-card__by">
          <span className="lost-card__arrow" aria-hidden="true">→</span> replaced by{' '}
          {by ? <WordLink word={by.id} className="lost-card__bylink" /> : <em>{w.replacedBy}</em>}
        </p>
      )}
      <p className="lost-card__story">{w.story}</p>
    </motion.article>
  );
}
