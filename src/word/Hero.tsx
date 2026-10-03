import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { data, formatYear } from '../data';
import { href } from '../lib/router';
import { WordLink } from '../ui/WordLink';
import { heroFrames, stageYear } from './model';
import type { SheetWord } from './model';
import { langInfo } from './langs';
import { IconReplay } from './icons';

const NOW = new Date().getFullYear();
const NBSP = '\u00a0';

/** Coloured language pill (works for live-lookup codes the curated data doesn't know). */
export function LangPill({ id, link = true }: { id: string; link?: boolean }) {
  const l = langInfo(id);
  const style = { '--c': l.color } as React.CSSProperties;
  const body = (
    <>
      <span className="dot" />
      {l.name}
    </>
  );
  return link && data.lang.has(l.id) ? (
    <a className="chip ws-pill" href={href.lang(l.id)} style={style}>{body}</a>
  ) : (
    <span className="chip ws-pill" style={style}>{body}</span>
  );
}

/** Letters with combining marks or phonetic modifiers render in the old-forms font, which
 *  positions marks properly (Fraunces lacks most of them). */
function needsOldFont(g: string): boolean {
  return /\p{M}|[\u02B0-\u02FF\u1D00-\u1DBF\u2080-\u209F\u1E00-\u1EFF\u0250-\u02AF]/u.test(g.normalize('NFC'));
}

function verb(sw: SheetWord): string {
  if (sw.origin === 'en') return 'Made in English';
  const l = langInfo(sw.origin);
  if (l.stream === 'native') return `Inherited from ${l.name}`;
  return `Borrowed from ${l.name}`;
}

export function Hero({ sw, titleId, live }: { sw: SheetWord; titleId: string; live?: boolean }) {
  const reduce = !!useReducedMotion();
  const frames = useMemo(() => heroFrames(sw), [sw]);
  const last = frames.length - 1;
  const [k, setK] = useState(reduce ? last : 0);
  const [run, setRun] = useState(0);
  const [ghost, setGhost] = useState(false);
  const lost = sw.status !== 'living';

  useEffect(() => {
    setGhost(false);
    if (reduce || last === 0) {
      setK(last);
      if (lost) setGhost(true);
      return;
    }
    setK(0);
    const per = Math.max(620, Math.min(1000, 3600 / frames.length));
    const timers: number[] = [];
    let i = 0;
    const tick = () => {
      i++;
      setK(i);
      if (i < last) timers.push(window.setTimeout(tick, i === 1 ? per * 1.05 : per));
      else if (lost) timers.push(window.setTimeout(() => setGhost(true), 900));
    };
    timers.push(window.setTimeout(tick, run ? 900 : 1500));
    return () => timers.forEach(clearTimeout);
  }, [frames, last, reduce, run, lost]);

  const f = frames[k];
  const settled = k === last;
  const fc = langInfo(f.lang).color;
  const oldest = sw.path.find((s) => s.year !== undefined)?.year;
  const span = oldest !== undefined ? NOW - oldest : undefined;
  // Second glow: the oldest colourful stage (the grey of reconstructed languages looks muddy).
  const c0 = langInfo(sw.path.find((s) => langInfo(s.lang).stream !== 'ancient')?.lang ?? sw.origin).color;
  const n = f.letters.length;

  return (
    <header className={`ws-hero${lost ? ` is-lost is-${sw.status}` : ''}`} style={{ '--c0': c0 } as React.CSSProperties}>
      <div className="ws-hero__aura" aria-hidden />
      <motion.div className="ws-hero__eyebrow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <span className="dot" />
        <span>{verb(sw)}</span>
        {live && <span className="ws-badge ws-badge--live"><span className="ws-live-dot" />Live from Wiktionary</span>}
      </motion.div>

      <h1
        id={titleId}
        className={`ws-word${settled ? ' is-settled' : ' is-old'}${ghost ? ' is-ghost' : ''}`}
        style={{ '--len': Math.max(f.len, 3), '--fc': fc } as React.CSSProperties}
        aria-label={sw.word}
      >
        <span className="ws-word__line" aria-hidden>
          <AnimatePresence mode="popLayout">
            {f.letters.map((l, i) => (
              <motion.span
                key={l.id}
                layout={!reduce}
                className={`ws-ch${f.whole ? ' is-whole' : needsOldFont(l.glyph) ? ' is-old' : ''}`}
                style={{ '--mix': `${Math.round(8 + (n > 1 ? i / (n - 1) : 0.5) * 52)}%`, '--i': i, '--t': n > 1 ? i / (n - 1) : 0.5 } as React.CSSProperties}
                initial={reduce ? false : { opacity: 0, y: '0.22em', filter: 'blur(12px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: '-0.16em', filter: 'blur(12px)', transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
                transition={{ type: 'spring', stiffness: 170, damping: 24, mass: 0.9, delay: k === 0 && run === 0 ? 0.32 + i * 0.045 : 0, opacity: { duration: 0.5 }, filter: { duration: 0.55 } }}
              >
                <span className="ws-ch__ghost">
                  <motion.span
                    key={l.glyph}
                    className="ws-ch__g"
                    initial={reduce || k === 0 ? false : { opacity: 0.15, filter: 'blur(7px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.5 }}
                  >
                    {l.glyph === ' ' ? NBSP : l.glyph}
                  </motion.span>
                </span>
              </motion.span>
            ))}
          </AnimatePresence>
        </span>
      </h1>

      <div className="ws-hero__caption" aria-hidden={!settled}>
        <AnimatePresence mode="wait" initial={false}>
          {!settled ? (
            <motion.span key={`f${k}`} className="ws-cap" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              <span className="dot" style={{ '--c': fc } as React.CSSProperties} />
              <span className="ws-cap__lang" style={{ color: fc }}>{langInfo(f.lang).name}</span>
              {f.year !== undefined && <span className="ws-cap__year">{stageYear({ lang: f.lang, form: '', year: f.year })}</span>}
            </motion.span>
          ) : (
            frames.length > 1 && (
              <motion.button
                key="replay"
                type="button"
                className="ws-cap ws-replay"
                onClick={() => setRun((r) => r + 1)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <IconReplay />
                {span ? `Replay ${span.toLocaleString('en-US')} years` : 'Replay its journey'}
              </motion.button>
            )
          )}
        </AnimatePresence>
      </div>

      <motion.div className="ws-hero__sub" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.55, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        {(sw.pos || sw.gloss) && (
          <p className="ws-gloss">
            {sw.pos && <span className="ws-pos">{sw.pos}</span>}
            {sw.gloss && <span className="ws-gloss__text">{sw.gloss}</span>}
          </p>
        )}
        {lost && (
          <p className="ws-epitaph">
            <span className="ws-epitaph__dagger">†</span>
            {sw.status === 'extinct' ? 'Died out' : 'Fell out of use'}
            {sw.died !== undefined && <> c. {formatYear(sw.died)}</>}
            {sw.replacedBy && (
              <>
                , replaced by <WordLink word={sw.replacedBy} />
              </>
            )}
          </p>
        )}
        <ul className="ws-meta">
          {sw.first !== undefined && (
            <li className="ws-meta__item">
              <span className="ws-meta__k">First recorded</span>
              <span className="ws-meta__v">{formatYear(sw.first)}</span>
            </li>
          )}
          <li className="ws-meta__item ws-meta__item--lang">
            <span className="ws-meta__k">{sw.origin === 'en' ? 'Coined in' : 'From'}</span>
            <LangPill id={sw.origin} />
          </li>
          <li className="ws-meta__item">
            <span className="ws-meta__k">Status</span>
            <span className={`ws-status ws-status--${sw.status}`}>
              <span className="ws-status__dot" />
              {sw.status === 'living' ? 'In use today' : sw.status === 'archaic' ? 'Archaic' : 'Extinct'}
            </span>
          </li>
        </ul>
      </motion.div>
    </header>
  );
}
