import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform } from 'framer-motion';
import { data } from '../../data';
import { countRows, shareRows } from './model';
import { useWidth } from './hooks';

type Mode = 'share' | 'count';
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * "Where the words came from": each source pours a ribbon, as thick as its share of the
 * vocabulary, into one trunk — English.
 */
export default function Pour({ reduced }: { reduced: boolean }) {
  const [mode, setMode] = useState<Mode>('share');
  const [hover, setHover] = useState<string | null>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const view = useRef<HTMLDivElement>(null);
  const seen = useInView(view, { once: true, amount: 0.35 });
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const share = useMemo(shareRows, []);
  const count = useMemo(countRows, []);
  const hasShare = share.some((r) => r.id !== 'other');
  const m: Mode = hasShare ? mode : 'count';
  const rows = m === 'share' ? share : count;

  const G = useMemo(() => {
    const narrow = W < 640;
    const labelW = narrow ? Math.min(168, W * 0.46) : Math.min(320, Math.max(236, W * 0.25));
    const endW = narrow ? 30 : Math.min(190, W * 0.16);
    const x0 = labelW + (narrow ? 6 : 28);
    const x2 = W - endW - (narrow ? 0 : 8);
    const x1 = x0 + (x2 - x0) * (narrow ? 0.6 : 0.56);
    const T = narrow ? 176 : Math.min(300, Math.max(220, W * 0.22));
    const minBand = narrow ? 46 : 56;
    const gap = narrow ? 4 : 8;
    const bands = rows.map((r) => {
      const t = Math.max(1.5, (r.value / 100) * T);
      return { r, t, band: Math.max(minBand, t + 10) };
    });
    const HL = bands.reduce((s, b) => s + b.band, 0) + gap * Math.max(0, bands.length - 1);
    const padT = 16;
    const inner = Math.max(HL, T);
    const H = padT + inner + 16;
    let y = padT + (inner - HL) / 2;
    let ty = padT + (inner - T) / 2;
    const trunkTop = ty;
    const placed = bands.map((b) => {
      const lt = y + (b.band - b.t) / 2;
      const lb = lt + b.t;
      const inset = b.t > 3 ? 0.9 : 0;
      const rt = ty + inset;
      const rb = ty + b.t - inset;
      const cx = x0 + (x1 - x0) * 0.5;
      const d = `M${x0},${lt} C${cx},${lt} ${cx},${rt} ${x1},${rt} L${x2},${rt} L${x2},${rb} L${x1},${rb} C${cx},${rb} ${cx},${lb} ${x0},${lb} Z`;
      const out = { ...b, mid: y + b.band / 2, d };
      y += b.band + gap;
      ty += b.t;
      return out;
    });
    return { narrow, labelW, x0, x1, x2, T, H, trunkTop, placed };
  }, [rows, W]);

  const total = data.words.length;

  return (
    <div className="lg-pour" ref={view}>
      <div className="lg-pour__bar">
        <div>
          <h3 className="lg-h3">Where the words came from</h3>
          <p className="lg-cap">{m === 'share' ? 'Share of the dictionary that ultimately comes from each source.' : `The ${total} words in Etymon, by the language English took each one from.`}</p>
        </div>
        {hasShare && (
          <div className="lg-seg" role="group" aria-label="Measure">
            {(['share', 'count'] as const).map((k) => (
              <button key={k} type="button" className={`lg-seg__b${m === k ? ' is-on' : ''}`} aria-pressed={m === k} onClick={() => setMode(k)}>
                {m === k && <motion.span layoutId={`${uid}-seg`} className="lg-seg__pill" transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="lg-seg__t">{k === 'share' ? 'Dictionary (approx.)' : 'Words in Etymon'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`lg-pour__fig${hover ? ' is-hovering' : ''}`} ref={box} style={{ height: W ? G.H : 360 }} onMouseLeave={() => setHover(null)}>
        {W > 0 && (
          <>
            <svg width={W} height={G.H} className="lg-pour__svg" role="img" aria-label={rows.map((r) => `${r.label} ${Math.round(r.value)}%`).join(', ')}>
              <defs>
                {G.placed.map((p) => (
                  <linearGradient key={p.r.id} id={`${uid}-g-${p.r.id}`} gradientUnits="userSpaceOnUse" x1={G.x0} x2={G.x2} y1={0} y2={0}>
                    <stop offset="0" stopColor={p.r.color} stopOpacity={0.28} />
                    <stop offset="0.16" stopColor={p.r.color} stopOpacity={0.82} />
                    <stop offset="0.6" stopColor={p.r.color} stopOpacity={0.92} />
                    <stop offset="1" stopColor={p.r.color} stopOpacity={1} />
                  </linearGradient>
                ))}
                <clipPath id={`${uid}-end`}>
                  <rect x={0} y={0} width={G.x2 - 16} height={G.H} />
                  <rect x={G.x2 - 40} y={G.trunkTop} width={40} height={G.T} rx={Math.min(18, G.T / 2)} />
                </clipPath>
                <clipPath id={`${uid}-pour`}>
                  <motion.rect x={0} y={0} height={G.H} initial={{ width: reduced ? W : 0 }} animate={{ width: seen ? W : 0 }} transition={{ duration: reduced ? 0 : 1.9, ease: [0.65, 0, 0.25, 1], delay: 0.15 }} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${uid}-pour)`}>
                <g clipPath={`url(#${uid}-end)`}>
                  <AnimatePresence initial={false}>
                    {G.placed.map((p) => (
                      <motion.path
                        key={p.r.id}
                        className={`lg-ribbon${hover && hover !== p.r.id ? ' is-dim' : ''}`}
                        fill={`url(#${uid}-g-${p.r.id})`}
                        initial={{ d: p.d, opacity: 0 }}
                        animate={{ d: p.d, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduced ? 0 : 0.9, ease: EASE }}
                        onMouseEnter={() => setHover(p.r.id)}
                      />
                    ))}
                  </AnimatePresence>
                </g>
              </g>
            </svg>

            <div className="lg-pour__labels">
              <AnimatePresence initial={false}>
                {G.placed.map((p, i) => (
                  <motion.div
                    key={p.r.id}
                    className={`lg-row${hover && hover !== p.r.id ? ' is-dim' : ''}${p.r.id === 'other' ? ' is-other' : ''}`}
                    style={{ width: G.labelW, '--c': p.r.color } as React.CSSProperties}
                    initial={{ opacity: 0, top: p.mid }}
                    animate={{ opacity: seen ? 1 : 0, top: p.mid }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.8, ease: EASE, opacity: { delay: seen && !reduced ? 0.25 + i * 0.07 : 0, duration: 0.6 } }}
                    onMouseEnter={() => setHover(p.r.id)}
                  >
                    <span className="lg-row__v">
                      <Num value={p.r.value} reduced={reduced} play={seen} />
                      <span className="lg-row__pct">%</span>
                    </span>
                    <span className="lg-row__txt">
                      <span className="lg-row__name">
                        <span className="dot" />
                        {p.r.label}
                        {m === 'count' && p.r.count !== undefined && <span className="lg-row__n mono">{p.r.count}</span>}
                      </span>
                      {p.r.sub && p.r.sub !== p.r.label && <span className="lg-row__sub">{p.r.sub}</span>}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <motion.div
              className={`lg-pour__end${G.narrow ? ' is-vertical' : ''}`}
              style={G.narrow ? { left: G.x2 + 8, top: G.trunkTop + G.T / 2 } : { left: G.x2 + 18, top: G.trunkTop + G.T / 2 }}
              initial={{ opacity: 0, x: -12 }}
              animate={seen ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
              transition={{ delay: reduced ? 0 : 1.6, duration: reduced ? 0 : 0.8, ease: EASE }}
            >
              <span className="lg-pour__en">English</span>
              <span className="lg-pour__en-sub mono">{m === 'share' ? 'the whole dictionary' : `${total} words`}</span>
            </motion.div>
          </>
        )}
      </div>

      <p className="lg-note">
        {m === 'share' ? (
          <>
            <b>Approximate.</b> After Finkenstaedt &amp; Wolff’s survey of the ~80,000 words in the <i>Shorter Oxford Dictionary</i> (1973), as summarised by Williams (1975); “everything else” covers other languages, words from names and words of unknown origin. Count every word you actually say, though, and the balance flips: nearly all of the hundred commonest English words are Germanic.
          </>
        ) : (
          <>Grouped by the stream of each word’s immediate source: <i>beef</i> counts as French, even though it began in Latin. “Coined” words were made inside English.</>
        )}
      </p>
    </div>
  );
}

/** A number that eases to its new value. */
function Num({ value, reduced, play }: { value: number; reduced: boolean; play: boolean }) {
  const mv = useMotionValue(reduced ? value : 0);
  const txt = useTransform(mv, (v) => (value < 1 && value > 0 ? v.toFixed(1) : Math.round(v).toString()));
  useEffect(() => {
    if (!play) return;
    if (reduced) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 1.2, ease: EASE });
    return () => c.stop();
  }, [value, play, reduced, mv]);
  return <motion.span>{txt}</motion.span>;
}
