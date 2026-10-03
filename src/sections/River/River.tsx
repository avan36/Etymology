import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { data, formatYear, langName, wordStream } from '../../data';
import type { HistoryEvent, StreamId, Word } from '../../data';
import { STREAM } from '../../lib/streams';
import { go, href } from '../../lib/router';
import { prefersReducedMotion, useTheme } from '../../lib/theme';
import { WordLink } from '../../ui/WordLink';
import {
  ORDER, buildGeometry, eraBands, layoutLabels, makeFlow, makePins, makeTicks, placeWords, toXY,
  type Box, type Frame, type Geometry, type Pin, type Spot,
} from './geometry';
import { RiverEngine } from './engine';
import './river.css';

const Y0 = 440;
const Y1 = 2025;
const flow = makeFlow(data.influx, Y0, Y1);
const LIVE = new Set<StreamId>(flow.streams);

// ── frame (layout) ──────────────────────────────────────────────────────────────────
function makeFrame(width: number, vh: number): Frame {
  if (width < 720) {
    const h = Math.round(Math.min(2100, Math.max(1500, width * 4.3)));
    return { orient: 'v', w: width, h, u0: 64, u1: h - 96, uEnd: h, c0: 54, c1: width - 50, y0: Y0, y1: Y1 };
  }
  const h = Math.round(Math.max(540, Math.min(780, width * 0.5, vh - 90)));
  const side = Math.max(28, (width - 1820) / 2 + 28);
  const u1 = width - side - 70;
  return { orient: 'h', w: width, h, u0: side, u1, uEnd: Math.min(width, u1 + 140), c0: 88, c1: h - 84, y0: Y0, y1: Y1 };
}

// ── text measurement ────────────────────────────────────────────────────────────────
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
const WORD_FONT = "400 13.5px Fraunces, 'Noto Serif', Georgia, serif";
const NAME_FONT = (px: number) => `italic 400 ${px}px Fraunces, 'Noto Serif', Georgia, serif`;

// ── stream names, set along each stream like river names on a map ───────────────────
interface StreamName { k: number; s: StreamId; text: string; x: number; y: number; angle: number; size: number; box: Box; u: number }
function streamNames(g: Geometry): StreamName[] {
  const f = g.frame;
  const out: StreamName[] = [];
  const order = ORDER.map((_, k) => k).sort((a, b) => g.peakTh[b] - g.peakTh[a]);
  const boxes: Box[] = [];
  for (const k of order) {
    const s = ORDER[k];
    if (!LIVE.has(s) || g.peakTh[k] < 24) continue;
    const text = s === 'native' ? 'Old English' : s === 'english' ? 'Made in English' : STREAM[s].short;
    let best = -1;
    let bestScore = 0;
    let bestSize = 13;
    for (let i = 0; i < g.n; i += 2) {
      const th0 = g.hi[k][i] - g.lo[k][i];
      if (th0 < 22) continue;
      const size = Math.max(13, Math.min(f.orient === 'h' ? 21 : 16, th0 * 0.3));
      const tw = measure(text, NAME_FONT(size)) * 1.06;
      // Room needed along the flow (horizontal: the label's length) and across it.
      const along = f.orient === 'h' ? tw : size * 1.4;
      const across = f.orient === 'h' ? size * 1.5 : tw + 12;
      const half = Math.ceil(along / 2 / g.step) + 2;
      if (i - half < 0 || i + half >= g.n) continue;
      const uc = g.start + i * g.step;
      if (uc - along / 2 < f.u0 + 30 || uc + along / 2 > f.u1 - 6) continue;
      let minTh = Infinity;
      for (let j = i - half; j <= i + half; j++) minTh = Math.min(minTh, g.hi[k][j] - g.lo[k][j]);
      if (minTh < across) continue;
      const score = minTh - Math.abs(i - g.peakIdx[k]) * 0.02;
      if (score > bestScore) { bestScore = score; best = i; bestSize = size; }
    }
    if (best < 0) continue;
    const size = bestSize;
    const tw = measure(text, NAME_FONT(size)) * 1.06;
    const u = g.start + best * g.step;
    const v = (g.lo[k][best] + g.hi[k][best]) / 2;
    let angle = 0;
    if (f.orient === 'h') {
      const half = Math.ceil(tw / 2 / g.step);
      const a = Math.max(0, best - half);
      const b = Math.min(g.n - 1, best + half);
      const ma = (g.lo[k][a] + g.hi[k][a]) / 2;
      const mb = (g.lo[k][b] + g.hi[k][b]) / 2;
      angle = Math.max(-14, Math.min(14, (Math.atan2(mb - ma, (b - a) * g.step) * 180) / Math.PI));
    }
    const [x, y] = toXY(f, u, v);
    const bw = tw + 8;
    const bh = size * 1.3 + Math.abs(Math.sin((angle * Math.PI) / 180)) * tw;
    const box = { x: x - bw / 2, y: y - bh / 2, w: bw, h: bh };
    if (boxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
    boxes.push(box);
    out.push({ k, s, text, x, y, angle, size, box, u });
  }
  return out;
}

// ── words ───────────────────────────────────────────────────────────────────────────
function pathPreview(w: Word): string[] {
  const forms: string[] = [];
  for (const st of w.path ?? []) {
    if (!st?.form) continue;
    if (!forms.length || forms[forms.length - 1].toLowerCase() !== st.form.toLowerCase()) forms.push(st.form);
  }
  if (!forms.length || forms[forms.length - 1].toLowerCase() !== w.word.toLowerCase()) forms.push(w.word);
  if (forms.length <= 3) return forms;
  const src = (w.path ?? []).find((s) => s.lang === w.origin)?.form;
  const out = [forms[0]];
  if (src && src !== forms[0] && src.toLowerCase() !== w.word.toLowerCase()) out.push(src);
  else out.push(forms[forms.length - 2]);
  out.push(w.word);
  return out;
}

function examples(s: StreamId, n = 6): Word[] {
  const ws = data.wordsByStream.get(s) ?? [];
  const featured = ws.filter((w) => w.featured);
  const rest = ws.filter((w) => !w.featured).sort((a, b) => a.word.length - b.word.length || a.first - b.first);
  return [...featured, ...rest].slice(0, n);
}

const pct = (x: number) => (x >= 0.095 ? `${Math.round(x * 100)}%` : x >= 0.005 ? `${(x * 100).toFixed(1)}%` : '<1%');
const roundYear = (y: number) => Math.round(y / 25) * 25;
const eraAt = (year: number) => data.eras.find((e) => year >= e.start && year < e.end);

function composition(year: number) {
  const vals = flow.streams.map((s) => ({ s, v: flow.value(s, year) }));
  const total = vals.reduce((a, b) => a + b.v, 0) || 1;
  return vals.filter((x) => x.v > total * 0.002).map((x) => ({ ...x, p: x.v / total })).sort((a, b) => b.v - a.v);
}

const hoverNone = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

// ═════════════════════════════════════════════════════════════════════════════════════
export default function River() {
  const theme = useTheme();
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const engineRef = useRef<RiverEngine | null>(null);
  if (!engineRef.current) engineRef.current = new RiverEngine();
  const engine = engineRef.current;

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const veilRef = useRef<HTMLCanvasElement>(null);
  const veil2Ref = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);

  // Measure.
  const [size, setSize] = useState<{ w: number; vh: number } | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.clientWidth);
      const vh = window.innerHeight;
      setSize((p) => (p && p.w === w && (w < 720 || Math.abs(p.vh - vh) < 80) ? p : { w, vh }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener('resize', read);
    return () => { ro.disconnect(); window.removeEventListener('resize', read); };
  }, []);

  // Fonts change label metrics: re-layout once they arrive.
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setFontTick((t) => t + 1); };
    document.fonts?.ready.then(bump);
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => { alive = false; document.fonts?.removeEventListener?.('loadingdone', bump); };
  }, []);

  const frame = useMemo(() => (size ? makeFrame(size.w, size.vh) : null), [size]);
  const geo = useMemo(() => (frame ? buildGeometry(frame, flow) : null), [frame]);
  const spots = useMemo(() => (geo ? placeWords(geo, data.words, wordStream) : []), [geo]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const names = useMemo(() => (geo ? streamNames(geo) : []), [geo, fontTick]);
  const labels = useMemo(() => {
    if (!geo) return [];
    const f = geo.frame;
    const blockers: Box[] = names.map((n) => n.box);
    if (f.orient === 'h') {
      blockers.push({ x: 0, y: 0, w: f.w, h: f.c0 - 22 });
      blockers.push({ x: 0, y: f.c1 + 22, w: f.w, h: f.h - f.c1 });
    } else {
      blockers.push({ x: 0, y: 0, w: f.c0 - 14, h: f.h });
      blockers.push({ x: f.c1 + 16, y: 0, w: f.w, h: f.h });
    }
    const max = f.orient === 'h' ? Math.round(f.w / 48) : Math.round(f.h / 64);
    return layoutLabels(f, spots, (t) => measure(t, WORD_FONT), blockers, max, 18);
  }, [geo, spots, names, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = useMemo(() => (frame ? makeTicks(frame, frame.orient === 'h' ? 70 : 64).filter((t) => frame.u1 - t.u > (frame.orient === 'h' ? 46 : 30)) : []), [frame]);
  const bands = useMemo(() => (frame ? eraBands(frame, data.eras) : []), [frame]);
  const pins = useMemo(() => (geo ? makePins(geo, data.events, geo.frame.orient === 'h' ? 62 : 40) : []), [geo]);

  // Interaction state.
  const [hoverK, setHoverK] = useState(-1);
  const [legendHover, setLegendHover] = useState<StreamId | null>(null);
  const [locked, setLocked] = useState<StreamId | null>(null);
  const [pinOpen, setPinOpen] = useState<{ idx: number; sticky: boolean } | null>(null);
  const [hoverSpot, setHoverSpot] = useState<Spot | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playPin, setPlayPin] = useState<number | null>(null);
  const [kb, setKb] = useState(false);
  const pinsRef = useRef<Pin[]>(pins);
  pinsRef.current = pins;

  // River hover → stream focus, gently debounced so sweeping across doesn't flicker.
  const hoverTimer = useRef(0);
  const onStreamHover = useCallback((k: number) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHoverK(k), k < 0 ? 160 : 90);
  }, []);

  useEffect(() => {
    engine.handlers = {
      hover: (s) => setHoverSpot(s),
      stream: onStreamHover,
      tapStream: (k) => {
        const s = k >= 0 ? ORDER[k] : null;
        setLocked((cur) => (s && cur !== s ? s : null));
        setPinOpen(null);
      },
      open: (s) => go(href.word(s.word.id)),
      front: (u) => {
        let hit: number | null = null;
        for (const p of pinsRef.current) if (p.u <= u && u - p.u < 210) hit = p.idx;
        setPlayPin((cur) => (cur === hit ? cur : hit));
      },
      playEnd: () => { setPlaying(false); setPlayPin(null); },
    };
  }, [engine, onStreamHover]);

  const hasFrame = frame !== null;
  // Attach before geometry is pushed (layout effects run in declaration order).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !glowRef.current || !baseRef.current || !veilRef.current || !veil2Ref.current || !fxRef.current) return;
    engine.attach(stage, glowRef.current, baseRef.current, [veilRef.current, veil2Ref.current], fxRef.current, reduced);
    return () => engine.destroy();
  }, [engine, reduced, hasFrame]);

  useLayoutEffect(() => {
    if (geo) engine.setGeometry(geo, spots);
  }, [engine, geo, spots]);
  useEffect(() => { engine.setTheme(theme); }, [engine, theme]);

  // What's in focus.
  const activePin = playPin ?? pinOpen?.idx ?? null;
  const activeEvent: HistoryEvent | null = activePin !== null ? data.events[activePin] ?? null : null;
  const focus: StreamId[] = legendHover
    ? [legendHover]
    : activeEvent?.streams?.length && !playing
      ? activeEvent.streams
      : locked
        ? [locked]
        : hoverK >= 0 && !hoverSpot
          ? [ORDER[hoverK]]
          : [];
  const focusKey = focus.join(' ');
  const strength = legendHover || locked ? 0.13 : activeEvent ? 0.2 : 0.3;
  useEffect(() => {
    engine.setFocus(focusKey ? focusKey.split(' ').map((s) => ORDER.indexOf(s as StreamId)) : [], strength);
  }, [engine, focusKey, strength]);

  const detail: StreamId | null = legendHover ?? locked ?? (hoverK >= 0 ? ORDER[hoverK] : null);

  // Escape releases a locked stream / open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLocked(null); setPinOpen(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePlay = () => {
    if (engine.playing) { engine.stop(); setPlaying(false); setPlayPin(null); return; }
    setLocked(null);
    setPinOpen(null);
    setPlaying(true);
    engine.play();
  };

  const f = frame;
  const isV = f?.orient === 'v';
  const stageStyle: CSSProperties = f ? { height: f.h } : { height: 640 };

  return (
    <section id="river" className="section river" aria-labelledby="river-title">
      <div className="page">
        <header className="section__head river-head">
          <div className="section__eyebrow">Chapter 1 · 1,500 years in one river</div>
          <h2 id="river-title" className="section__title">Every word is a <em>tributary</em></h2>
          <p className="section__lede">
            English began as a trickle of Germanic dialects. Then Vikings, Norman lords, monks, scientists, sailors and the
            whole wide world poured in. Each ribbon is a source of new words, as wide as the flood it sent. Every glint is a
            real word, landing in the year it was first written down.
          </p>
        </header>
        {isV && <Legend locked={locked} setLocked={setLocked} setHover={setLegendHover} compact />}
        {!isV && f && (
          <div className="river-toolbar">
            <p className="river-toolbar__hint">
              <span>Hover the river to read any moment</span>
              <span>Click a glint to open its word</span>
            </p>
            {!reduced && (
              <button type="button" className="river-play" onClick={togglePlay} aria-pressed={playing}>
                <span className="river-play__icon" aria-hidden="true">{playing ? <StopIcon /> : <PlayIcon />}</span>
                {playing ? 'Stop' : 'Play 1,500 years'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="river-wrap" ref={wrapRef}>
        {f && geo && (
          <div
            ref={stageRef}
            className={`river-stage river-stage--${f.orient}${playing ? ' is-playing' : ''}${hoverSpot ? ' has-tip' : ''}`}
            style={stageStyle}
            data-focus={focusKey || undefined}
            tabIndex={0}
            role="group"
            aria-roledescription="interactive streamgraph"
            aria-label="The River of English: new words entering English from each source, 450 to today. Use the arrow keys to move through time."
            onKeyDown={(e) => {
              const fwd = isV ? 'ArrowDown' : 'ArrowRight';
              const bwd = isV ? 'ArrowUp' : 'ArrowLeft';
              if (e.target === e.currentTarget && (e.key === fwd || e.key === bwd)) {
                e.preventDefault();
                setKb(true);
                engine.nudge(e.key === fwd ? 1 : -1);
              }
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) { setKb(false); engine.clearKeyboard(); }
            }}
          >
            <Eras bands={bands} frame={f} engine={engine} />
            <div className="river-mask">
              <canvas ref={glowRef} className="river-canvas river-canvas--glow" aria-hidden="true" />
              <canvas ref={baseRef} className="river-canvas river-canvas--base" aria-hidden="true" />
              <canvas ref={veilRef} className="river-canvas river-canvas--veil" aria-hidden="true" />
              <canvas ref={veil2Ref} className="river-canvas river-canvas--veil" aria-hidden="true" />
              <canvas ref={fxRef} className="river-canvas river-canvas--fx" aria-hidden="true" />
              <Names names={names} engine={engine} />
            </div>
            <Labels labels={labels} engine={engine} />
            <div className="river-front" aria-hidden="true" />
            <Axis ticks={ticks} frame={f} engine={engine} />
            <Pins
              pins={pins}
              geo={geo}
              engine={engine}
              active={activePin}
              onOpen={(idx, sticky) => setPinOpen((cur) => (sticky && cur?.idx === idx && cur.sticky ? null : { idx, sticky }))}
              onClose={(idx) => setPinOpen((cur) => (cur && cur.idx === idx && !cur.sticky ? null : cur))}
            />
            <Cursor engine={engine} frame={f} />
            {!isV && <Readout engine={engine} frame={f} highlight={detail} />}
            <AnimatePresence>
              {activeEvent && activePin !== null && (
                <EventCard key={activePin} ev={activeEvent} pin={pins.find((p) => p.idx === activePin)} geo={geo} onClose={() => setPinOpen(null)} />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {hoverSpot && <WordTip key={hoverSpot.word.id} spot={hoverSpot} frame={f} />}
            </AnimatePresence>
            {!isV && (
              <div className="river-bigyear" aria-hidden="true" style={{ left: f.u0 + 4, bottom: f.h - f.c1 + 6 }}>
                <span ref={(el) => { engine.bigYear = el; }}>450</span>
              </div>
            )}
            {isV && (
              <div className="river-sticky">
                <MobileReadout engine={engine} locked={locked} onUnlock={() => setLocked(null)} />
              </div>
            )}
            <KeyboardAnnouncer engine={engine} active={kb} />
          </div>
        )}
      </div>

      <div className="page river-below">
        {!isV && (
          <div className="river-below__grid">
            <Legend locked={locked} setLocked={setLocked} setHover={setLegendHover} />
            <Detail stream={detail} />
          </div>
        )}
        <p className="river-note">
          <span className="river-note__label">About the widths</span>
          {data.influx.note} Time runs {isV ? 'top to bottom' : 'left to right'}, gently stretched toward the present so the
          crowded recent centuries have room.
        </p>
      </div>

      <A11yFallback />
    </section>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────────────
function PlayIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.8v8.4c0 .4.4.6.7.4l6.6-4.2c.3-.2.3-.6 0-.8L3.7 1.4c-.3-.2-.7 0-.7.4z" fill="currentColor" /></svg>;
}
function StopIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5" fill="currentColor" /></svg>;
}

const Eras = memo(function Eras({ bands, frame, engine }: { bands: ReturnType<typeof eraBands>; frame: Frame; engine: RiverEngine }) {
  const isV = frame.orient === 'v';
  return (
    <div className="river-eras" aria-hidden="true">
      {bands.map((b) => {
        const style: CSSProperties = isV ? { top: b.a, height: b.b - b.a } : { left: b.a, width: b.b - b.a };
        const wide = b.b - b.a;
        const name = !isV && wide < measure(b.era.name.toUpperCase(), '500 10.5px Geist Mono, monospace') * 1.2 + 20
          ? b.era.name.replace(/ English$/, '')
          : b.era.name;
        return (
          <div key={b.era.id} className={`river-era${b.i % 2 ? ' is-alt' : ''}`} style={style}>
            <div className="river-era__label river-reveal" ref={(el) => { if (el) return engine.track(el, b.a); }}>
              <span className="river-era__name">{name}</span>
              <span className="river-era__years">{formatYear(b.era.start)}–{b.era.end >= 2025 ? 'now' : formatYear(b.era.end)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

const Names = memo(function Names({ names, engine }: { names: StreamName[]; engine: RiverEngine }) {
  return (
    <div className="river-names" aria-hidden="true">
      {names.map((n) => (
        <div
          key={n.s}
          className="river-name"
          data-s={n.s}
          style={{ left: n.x, top: n.y, fontSize: n.size, '--c': STREAM[n.s].color, transform: `translate(-50%, -50%) rotate(${n.angle.toFixed(2)}deg)` } as CSSProperties}
        >
          <span className="river-reveal" ref={(el) => { if (el) return engine.track(el, n.u); }}>{n.text}</span>
        </div>
      ))}
    </div>
  );
});

const Labels = memo(function Labels({ labels, engine }: { labels: ReturnType<typeof layoutLabels>; engine: RiverEngine }) {
  return (
    <div className="river-labels">
      {labels.map((l) => {
        const w = l.spot.word;
        return (
          <div
            key={w.id}
            className="river-label-pos"
            data-s={l.spot.stream}
            style={{ left: l.x, top: l.y, width: l.w, height: l.h }}
            ref={(el) => { if (el) return engine.registerLabel(w.id, el); }}
          >
            <a
              href={href.word(w.id)}
              className={`river-label river-reveal river-label--${l.side}${w.featured ? ' is-featured' : ''}`}
              data-river-label
              style={{ '--c': STREAM[l.spot.stream].color } as CSSProperties}
              ref={(el) => { if (el) return engine.track(el, l.spot.u); }}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') engine.hoverWord(w.id); }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') engine.hoverWord(null); }}
              onFocus={() => engine.hoverWord(w.id)}
              onBlur={() => engine.hoverWord(null)}
              tabIndex={w.featured ? 0 : -1}
            >
              {w.word}
            </a>
          </div>
        );
      })}
    </div>
  );
});

const Axis = memo(function Axis({ ticks, frame, engine }: { ticks: ReturnType<typeof makeTicks>; frame: Frame; engine: RiverEngine }) {
  const isV = frame.orient === 'v';
  return (
    <div className="river-axis" aria-hidden="true">
      {ticks.map((t) => (
        <div
          key={t.year}
          className={`river-tick river-reveal${t.major ? ' is-major' : ''}`}
          style={isV ? { top: t.u } : { left: t.u }}
          ref={(el) => { if (el) return engine.track(el, t.u); }}
        >
          <span>{t.year}</span>
        </div>
      ))}
      <div
        className="river-tick river-tick--now river-reveal"
        style={isV ? { top: frame.u1 } : { left: frame.u1 }}
        ref={(el) => { if (el) return engine.track(el, frame.u1); }}
      >
        <span>today</span>
      </div>
    </div>
  );
});

function Pins({ pins, geo, engine, active, onOpen, onClose }: {
  pins: Pin[]; geo: Geometry; engine: RiverEngine; active: number | null;
  onOpen: (idx: number, sticky: boolean) => void; onClose: (idx: number) => void;
}) {
  const f = geo.frame;
  const isV = f.orient === 'v';
  return (
    <div className="river-pins">
      {pins.map((p) => {
        // Horizontal: pins ride a rail above the river; vertical: a rail to its right.
        const rail = isV ? f.w - 20 - p.row * 15 : f.c0 - 36 - p.row * 22;
        const stem = isV ? Math.max(0, rail - 6 - (geo.envHi[p.i] + 4)) : Math.max(0, geo.envLo[p.i] - 4 - (rail + 6));
        const style: CSSProperties = isV ? { top: p.u, left: rail } : { left: p.u, top: rail };
        const isOn = active === p.idx;
        return (
          <div key={p.idx} className={`river-pin river-reveal${isOn ? ' is-on' : ''}`} style={style} ref={(el) => { if (el) return engine.track(el, p.u); }} data-river-ui>
            <span className="river-pin__stem" aria-hidden="true" style={isV ? { width: stem } : { height: stem }} />
            <button
              type="button"
              className="river-pin__btn"
              aria-label={`${formatYear(p.ev.year)}: ${p.ev.title}`}
              aria-expanded={isOn}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') onOpen(p.idx, false); }}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') onClose(p.idx); }}
              onFocus={() => onOpen(p.idx, false)}
              onBlur={() => onClose(p.idx)}
              onClick={() => onOpen(p.idx, true)}
            >
              <span className="river-pin__dot" />
              <span className="river-pin__year">{p.ev.year}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function EventCard({ ev, pin, geo, onClose }: { ev: HistoryEvent; pin?: Pin; geo: Geometry; onClose: () => void }) {
  if (!pin) return null;
  const f = geo.frame;
  const isV = f.orient === 'v';
  const W = Math.min(300, f.w - 32);
  const style: CSSProperties = isV
    ? { top: pin.u + 16, right: 14, width: W }
    : { top: f.c0 - 6, left: Math.max(12, Math.min(f.w - W - 12, pin.u - W / 2)), width: W };
  return (
    <motion.div
      className="river-event card"
      data-river-ui
      style={style}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      role="note"
      aria-label={ev.title}
    >
      <div className="river-event__year">{formatYear(ev.year)}</div>
      <div className="river-event__title">{ev.title}</div>
      <p className="river-event__blurb">{ev.blurb}</p>
      {!!ev.streams?.length && (
        <div className="river-event__streams">
          {ev.streams.map((s) => (
            <span key={s} className="river-event__stream" style={{ '--c': STREAM[s]?.color } as CSSProperties}>
              <span className="dot" />
              {STREAM[s]?.short ?? s}
            </span>
          ))}
        </div>
      )}
      {hoverNone && <button type="button" className="river-event__close" onClick={onClose} aria-label="Close">×</button>}
    </motion.div>
  );
}

function WordTip({ spot, frame }: { spot: Spot; frame: Frame }) {
  const w = spot.word;
  const [x, y] = toXY(frame, spot.u, spot.v);
  const isV = frame.orient === 'v';
  const W = Math.min(280, frame.w - 24);
  const H = 156;
  let left = x + 20;
  let top = y - H - 14;
  if (isV) {
    left = Math.max(12, Math.min(frame.w - W - 12, x - W / 2));
    top = y - H - 22 < 8 ? y + 22 : y - H - 22;
  } else {
    if (left + W > frame.w - 12) left = x - W - 20;
    if (top < 8) top = y + 20;
  }
  const preview = pathPreview(w);
  const c = STREAM[spot.stream].color;
  return (
    <motion.div
      className="river-tip"
      style={{ left, top, width: W, '--c': c } as CSSProperties}
      data-river-ui={hoverNone ? '' : undefined}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      <a className="river-tip__inner card" href={href.word(w.id)} tabIndex={-1}>
        <span className="river-tip__meta">
          <span className="dot" />
          {langName(w.origin)}
          <span className="river-tip__sep">·</span>
          {formatYear(w.first)}
        </span>
        <span className="river-tip__word">{w.word}</span>
        <span className="river-tip__gloss">
          {w.pos && <em>{w.pos}. </em>}
          {w.gloss}
        </span>
        {preview.length > 1 && (
          <span className="river-tip__path old">
            {preview.map((p, i) => (
              <span key={i}>
                {i > 0 && <span className="river-tip__arrow">→</span>}
                <span className={i === preview.length - 1 ? 'is-last' : ''}>{p}</span>
              </span>
            ))}
          </span>
        )}
        <span className="river-tip__cta">{hoverNone ? 'Tap to open its story →' : 'Click to open its story'}</span>
      </a>
    </motion.div>
  );
}

function useCursor(engine: RiverEngine) {
  return useSyncExternalStore(engine.subscribeCursor, engine.getCursor, () => null);
}

function Cursor({ engine, frame }: { engine: RiverEngine; frame: Frame }) {
  const isV = frame.orient === 'v';
  return (
    <div
      className="river-hair"
      ref={(el) => { engine.hair = el; }}
      aria-hidden="true"
      style={isV ? { left: 0, right: 0, top: 0 } : { top: frame.c0 - 14, height: frame.c1 - frame.c0 + 34, left: 0 }}
    >
      <span className="river-hair__year" ref={(el) => { engine.hairYear = el; }} />
    </div>
  );
}

function Readout({ engine, frame, highlight }: { engine: RiverEngine; frame: Frame; highlight: StreamId | null }) {
  const cur = useCursor(engine);
  const year = cur ? cur.bucket * 5 : 1000;
  const comp = useMemo(() => composition(year), [year]);
  const era = eraAt(year);
  const top = comp.slice(0, 4);
  if (highlight && !top.some((t) => t.s === highlight)) {
    const h = comp.find((t) => t.s === highlight);
    if (h) top[3] = h;
  }
  return (
    <div
      className="river-readout card"
      ref={(el) => { engine.readout = el; }}
      style={{ '--top': `${frame.c0 + 4}px`, '--bottom': `${frame.h - frame.c1 + 8}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="river-readout__head">
        <span className="river-readout__year">{year}</span>
        {era && <span className="river-readout__era">{era.name}</span>}
      </div>
      <ul className="river-readout__list">
        {top.map((t) => (
          <li key={t.s} className={highlight === t.s ? 'is-hl' : ''} style={{ '--c': STREAM[t.s].color } as CSSProperties}>
            <span className="dot" />
            <span className="river-readout__name">{STREAM[t.s].short}</span>
            <span className="river-readout__bar"><span style={{ width: `${Math.max(2, t.p * 100)}%` }} /></span>
            <span className="river-readout__pct">{pct(t.p)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileReadout({ engine, locked, onUnlock }: { engine: RiverEngine; locked: StreamId | null; onUnlock: () => void }) {
  const cur = useCursor(engine);
  const year = cur ? cur.bucket * 5 : null;
  const comp = useMemo(() => (year !== null ? composition(year) : []), [year]);
  const era = year !== null ? eraAt(year) : undefined;
  const show = locked !== null || year !== null;
  return (
    <div className={`river-mread card${show ? ' is-on' : ''}`} data-river-ui>
      {locked ? (
        <div className="river-mread__stream" style={{ '--c': STREAM[locked].color } as CSSProperties}>
          <div className="river-mread__row">
            <span className="dot" />
            <strong>{STREAM[locked].label}</strong>
            <button type="button" className="river-mread__x" onClick={onUnlock} aria-label="Show all streams">×</button>
          </div>
          <p>
            {STREAM[locked].blurb} <span className="river-mread__share">About {pct(flow.share[locked])} of the river.</span>
          </p>
          <div className="river-mread__words">
            {examples(locked, 4).map((w) => <WordLink key={w.id} word={w.id} />)}
          </div>
        </div>
      ) : (
        year !== null && (
          <div aria-hidden="true">
            <div className="river-mread__row">
              <span className="river-mread__year">{year}</span>
              {era && <span className="river-mread__era">{era.name}</span>}
            </div>
            <div className="river-mread__bars">
              {comp.slice(0, 3).map((t) => (
                <span key={t.s} style={{ '--c': STREAM[t.s].color, flexGrow: Math.max(0.22, t.p) } as CSSProperties}>
                  <i />
                  <em><b>{STREAM[t.s].short}</b> {pct(t.p)}</em>
                </span>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function KeyboardAnnouncer({ engine, active }: { engine: RiverEngine; active: boolean }) {
  const cur = useCursor(engine);
  const text = active && cur
    ? `Around ${cur.bucket * 5}: ${composition(cur.year).slice(0, 3).map((c) => `${STREAM[c.s].label} ${pct(c.p)}`).join(', ')}.`
    : '';
  return <div className="sr-only" aria-live="polite">{text}</div>;
}

function Legend({ locked, setLocked, setHover, compact = false }: {
  locked: StreamId | null;
  setLocked: (f: (s: StreamId | null) => StreamId | null) => void;
  setHover: (s: StreamId | null) => void;
  compact?: boolean;
}) {
  const streams = useMemo(() => [...flow.streams].sort((a, b) => flow.share[b] - flow.share[a]), []);
  return (
    <div className={`river-legend${compact ? ' river-legend--compact' : ''}`} role="group" aria-label="Streams of the river: choose one to isolate it">
      {streams.map((s) => (
        <button
          key={s}
          type="button"
          className={`river-chip${locked === s ? ' is-on' : ''}`}
          style={{ '--c': STREAM[s].color } as CSSProperties}
          aria-pressed={locked === s}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(s); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
          onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setHover(s); }}
          onBlur={() => setHover(null)}
          onClick={() => setLocked((cur) => (cur === s ? null : s))}
        >
          <span className="river-chip__swatch" />
          <span className="river-chip__label">{STREAM[s].short}</span>
          <span className="river-chip__pct">{pct(flow.share[s])}</span>
        </button>
      ))}
    </div>
  );
}

function Detail({ stream }: { stream: StreamId | null }) {
  const ex = stream ? examples(stream) : [];
  return (
    <div className="river-detail card">
      <AnimatePresence mode="wait" initial={false}>
        {stream ? (
          <motion.div
            key={stream}
            className="river-detail__inner"
            style={{ '--c': STREAM[stream].color } as CSSProperties}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="river-detail__eyebrow"><span className="dot" /> Stream</div>
            <h3 className="river-detail__title">{STREAM[stream].label}</h3>
            <p className="river-detail__blurb">{STREAM[stream].blurb}</p>
            <dl className="river-detail__stats">
              <div><dt>Share of the river</dt><dd>{pct(flow.share[stream])}</dd></div>
              <div><dt>Strongest</dt><dd>c. {roundYear(flow.peak[stream])}</dd></div>
              <div><dt>Words here</dt><dd>{(data.wordsByStream.get(stream) ?? []).length}</dd></div>
            </dl>
            {ex.length > 0 && (
              <div className="river-detail__words">
                {ex.map((w) => <WordLink key={w.id} word={w.id} />)}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="intro"
            className="river-detail__inner river-detail__inner--intro"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="river-detail__eyebrow">How to read the river</div>
            <h3 className="river-detail__title">{flow.streams.length} streams, <em>one</em> river</h3>
            <ul className="river-detail__how">
              <li><span className="river-how river-how--width" aria-hidden="true" />Width shows how many new words a source was sending at the time.</li>
              <li><span className="river-how river-how--glint" aria-hidden="true" />Each glint is a word, placed at the year it was first recorded. Hover to meet it; click to read its story.</li>
              <li><span className="river-how river-how--pin" aria-hidden="true" />Pins mark the moments that changed the flow.</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function A11yFallback() {
  return (
    <div className="sr-only">
      <h3>The streams of English, from largest to smallest</h3>
      <ul>
        {[...flow.streams].sort((a, b) => flow.share[b] - flow.share[a]).map((s) => {
          const ex = examples(s, 5);
          return (
            <li key={s}>
              {STREAM[s].label}: about {pct(flow.share[s])} of new words, strongest around {roundYear(flow.peak[s])}. {STREAM[s].blurb}{' '}
              {ex.length > 0 && <>Examples: {ex.map((w, i) => <span key={w.id}>{i > 0 && ', '}<a href={href.word(w.id)}>{w.word}</a></span>)}.</>}
            </li>
          );
        })}
      </ul>
      <h3>Moments that changed the flow</h3>
      <ol>
        {data.events.map((e, i) => <li key={i}>{formatYear(e.year)}: {e.title}. {e.blurb}</li>)}
      </ol>
    </div>
  );
}
