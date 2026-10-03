import { motion, useReducedMotion } from 'framer-motion';
import type { Word } from '../data';
import { wordColor } from '../data';
import { STREAM } from '../lib/streams';
import { wordStream } from '../data';
import type { SheetWord } from './model';
import { Hero } from './Hero';
import { Journey } from './Journey';
import { JourneyMap } from './JourneyMap';
import { Popularity } from './Popularity';
import { Family, Related } from './Family';
import { IconArrow } from './icons';

function Story({ text }: { text: string }) {
  const reduce = !!useReducedMotion();
  return (
    <motion.figure
      className="ws-story"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
    >
      <span className="ws-story__mark" aria-hidden>“</span>
      <blockquote className="ws-story__text">
        {text.split(/(\*[^\s,.;:!?)"”]+)/).map((part, i) => (i % 2 ? <span key={i} className="old ws-story__old">{part}</span> : part))}
      </blockquote>
    </motion.figure>
  );
}

function Summary({ text }: { text: string }) {
  return (
    <figure className="ws-summary">
      <p className="ws-sec__eyebrow">Etymology</p>
      {text.split(/\n\n/).map((p, i) => (
        <p key={i} className="ws-summary__p">{p}</p>
      ))}
      <figcaption className="ws-summary__src">
        From <a href="https://en.wiktionary.org/" target="_blank" rel="noopener noreferrer">Wiktionary</a>, the free dictionary ·{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
      </figcaption>
    </figure>
  );
}

function NextCard({ next, onNext }: { next: Word; onNext: () => void }) {
  const s = STREAM[wordStream(next)];
  return (
    <a
      className="ws-next"
      href={`#/w/${encodeURIComponent(next.id)}`}
      style={{ '--nc': wordColor(next) } as React.CSSProperties}
      onClick={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <span className="ws-next__k">
        Next in the {s.short} stream <kbd>→</kbd>
      </span>
      <span className="ws-next__word">{next.word}</span>
      <span className="ws-next__gloss">{next.gloss}</span>
      <span className="ws-next__arrow" aria-hidden>
        <IconArrow dir="right" />
      </span>
    </a>
  );
}

export function SheetBody({ sw, titleId, next, onNext, live, afterHero }: { sw: SheetWord; titleId: string; next?: Word; onNext?: () => void; live?: boolean; afterHero?: React.ReactNode }) {
  return (
    <article className={`ws-body${sw.status !== 'living' ? ' is-lost' : ''}`} style={{ '--c': sw.color } as React.CSSProperties}>
      <Hero sw={sw} titleId={titleId} live={live} />
      {afterHero}
      {sw.story && <Story text={sw.story} />}
      {sw.summary && <Summary text={sw.summary} />}
      <Journey sw={sw} />
      <JourneyMap sw={sw} />
      <Popularity sw={sw} />
      <Family sw={sw} />
      <Related sw={sw} />
      {next && onNext && next.id !== sw.id && <NextCard next={next} onNext={onNext} />}
    </article>
  );
}
