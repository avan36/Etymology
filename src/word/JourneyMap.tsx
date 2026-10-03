import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { geoDistance, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { SheetWord } from './model';
import { langInfo } from './langs';

type Land = GeoPermissibleObjects;
let landCache: Land | null = null;
let landPromise: Promise<Land> | null = null;
function loadLand(): Promise<Land> {
  if (landCache) return Promise.resolve(landCache);
  landPromise ??= import('world-atlas/land-110m.json').then((m) => {
    const topo = (m.default ?? m) as unknown as Topology<{ land: GeometryCollection }>;
    landCache = feature(topo, topo.objects.land) as unknown as Land;
    return landCache;
  });
  return landPromise;
}

interface Stop {
  lon: number;
  lat: number;
  langs: string[];
  color: string;
}

/** Consecutive stages that sit (almost) on the same spot collapse into one stop. */
function stopsFor(sw: SheetWord): Stop[] {
  const out: Stop[] = [];
  for (const st of sw.path) {
    const l = langInfo(st.lang);
    if (!l.region) continue;
    const [lon, lat] = l.region;
    const prev = out.at(-1);
    if (prev && Math.abs(prev.lon - lon) < 2.6 && Math.abs(prev.lat - lat) < 2.2) {
      if (!prev.langs.includes(l.name)) prev.langs.push(l.name);
      prev.color = l.color;
      continue;
    }
    out.push({ lon, lat, langs: [l.name], color: l.color });
  }
  return out;
}

const R_EARTH = 6371;

export function JourneyMap({ sw }: { sw: SheetWord }) {
  const stops = useMemo(() => stopsFor(sw), [sw]);
  if (stops.length < 2) return null;
  return <MapInner stops={stops} />;
}

function MapInner({ stops }: { stops: Stop[] }) {
  const reduce = !!useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [land, setLand] = useState<Land | null>(landCache);
  const inView = useInView(wrap, { once: true, amount: 0.3 });
  const gid = useMemo(() => `ws-m-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    let live = true;
    loadLand().then((l) => live && setLand(l)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const h = Math.round(Math.max(260, Math.min(460, w * 0.5)));

  const geo = useMemo(() => {
    if (!w) return null;
    const lons = stops.map((s) => s.lon);
    const lats = stops.map((s) => s.lat);
    let x0 = Math.min(...lons);
    let x1 = Math.max(...lons);
    let y0 = Math.min(...lats);
    let y1 = Math.max(...lats);
    const padX = Math.max(7, (x1 - x0) * 0.22);
    const padY = Math.max(5, (y1 - y0) * 0.3);
    x0 -= padX;
    x1 += padX;
    y0 -= padY;
    y1 += padY;
    // Never zoom in so far that the map loses its context.
    const minX = 34;
    const minY = 18;
    if (x1 - x0 < minX) {
      const c = (x0 + x1) / 2;
      x0 = c - minX / 2;
      x1 = c + minX / 2;
    }
    if (y1 - y0 < minY) {
      const c = (y0 + y1) / 2;
      y0 = c - minY / 2;
      y1 = c + minY / 2;
    }
    y0 = Math.max(-75, y0);
    y1 = Math.min(82, y1);
    const mid = (x0 + x1) / 2;
    const proj = geoNaturalEarth1().rotate([-mid, 0]);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 4; i++) {
      pts.push([x0 + ((x1 - x0) * i) / 4, y0], [x0 + ((x1 - x0) * i) / 4, y1]);
      pts.push([x0, y0 + ((y1 - y0) * i) / 4], [x1, y0 + ((y1 - y0) * i) / 4]);
    }
    const padPx = w < 520 ? 18 : 36;
    proj.fitExtent([[padPx, padPx + 8], [w - padPx, h - padPx]], { type: 'MultiPoint', coordinates: pts });
    const path = geoPath(proj);
    const P = stops.map((s) => proj([s.lon, s.lat]) ?? [0, 0]);
    // Arcs: quadratic curves bowing "north", height proportional to distance.
    const arcs = P.slice(1).map((b, i) => {
      const a = P[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const bow = Math.min(len * 0.32, 140);
      const c: [number, number] = [(a[0] + b[0]) / 2 + nx * bow, (a[1] + b[1]) / 2 + ny * bow];
      return { a, b, c, d: `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}` };
    });
    const route = arcs.length ? `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)} ${arcs.map((r) => `Q${r.c[0].toFixed(1)},${r.c[1].toFixed(1)} ${r.b[0].toFixed(1)},${r.b[1].toFixed(1)}`).join(' ')}` : '';
    const km = stops.slice(1).reduce((s, b, i) => s + geoDistance([stops[i].lon, stops[i].lat], [b.lon, b.lat]) * R_EARTH, 0);
    return { path, P, arcs, route, km, graticule: path(geoGraticule10()) ?? '' };
  }, [w, h, stops]);

  const landD = useMemo(() => (geo && land ? (geo.path(land) ?? '') : ''), [geo, land]);

  // Labels: to the right of the dot unless that runs off the edge; nudge down if they collide.
  const labels = useMemo(() => {
    if (!geo) return [];
    const placed: { x: number; y: number; w: number; anchor: 'start' | 'end' }[] = [];
    return stops.map((s, i) => {
      const [x, y] = geo.P[i];
      const text = s.langs.length > 2 ? `${s.langs[0]} → ${s.langs[s.langs.length - 1]}` : s.langs.join(' → ');
      const tw = text.length * 6.6 + 8;
      let anchor: 'start' | 'end' = x + 14 + tw > w - 8 ? 'end' : 'start';
      let lx = anchor === 'start' ? x + 14 : x - 14;
      let ly = y + 4;
      const box = () => (anchor === 'start' ? [lx, lx + tw] : [lx - tw, lx]);
      for (let tries = 0; tries < 6; tries++) {
        const [l0, l1] = box();
        const hit = placed.some((p) => {
          const [p0, p1] = p.anchor === 'start' ? [p.x, p.x + p.w] : [p.x - p.w, p.x];
          return l0 < p1 && l1 > p0 && Math.abs(p.y - ly) < 16;
        });
        if (!hit) break;
        if (tries === 0) {
          anchor = anchor === 'start' ? 'end' : 'start';
          lx = anchor === 'start' ? x + 14 : x - 14;
        } else ly += 16;
      }
      placed.push({ x: lx, y: ly, w: tw, anchor });
      return { x: lx, y: ly, anchor, text, color: s.color };
    });
  }, [geo, stops, w]);

  // Comet: a glowing head with a fading tail travelling the whole route, on a loop.
  const routeRef = useRef<SVGPathElement>(null);
  const cometRef = useRef<SVGGElement>(null);
  const DRAW_PER = 0.9;
  const drawTotal = reduce ? 0 : (stops.length - 1) * DRAW_PER * 0.75 + 0.4;
  useEffect(() => {
    if (reduce || !inView || !geo) return;
    const path = routeRef.current;
    const g = cometRef.current;
    if (!path || !g) return;
    const L = path.getTotalLength();
    if (!L) return;
    // Rendered tail-first so the head paints on top; index 0 = head.
    const circles = Array.from(g.querySelectorAll<SVGCircleElement>('circle.ws-map__tail')).reverse();
    const glow = g.querySelector<SVGCircleElement>('circle.ws-map__comet-glow');
    const N = circles.length;
    const travel = Math.max(2600, Math.min(6500, L * 9));
    const pause = 1400;
    const cum: number[] = [];
    {
      // Cumulative lengths of each arc, to colour the comet by the leg it is on.
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      let acc = 0;
      for (const a of geo.arcs) {
        tmp.setAttribute('d', a.d);
        acc += tmp.getTotalLength();
        cum.push(acc);
      }
    }
    let raf = 0;
    let t0 = 0;
    const startDelay = drawTotal * 1000 + 200;
    const frame = (now: number) => {
      if (!t0) t0 = now + startDelay;
      const e = now - t0;
      const cycle = travel + pause;
      const t = e < 0 ? -1 : (e % cycle) / travel;
      if (t < 0 || t > 1.25) {
        g.style.opacity = '0';
      } else {
        g.style.opacity = '1';
        const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
        const head = ease(t) * L;
        const leg = Math.max(0, cum.findIndex((c) => c >= head));
        g.style.color = stops[Math.min(stops.length - 1, leg + 1)].color;
        const fade = t > 1 ? Math.max(0, 1 - (t - 1) / 0.25) : 1;
        // Tail stretches with speed (eased), collapsing into the head as it arrives.
        const speed = t > 1 ? 0 : Math.min(1, 0.25 + 3 * Math.min(t, 1 - t));
        const gap = (L / 70) * Math.max(0.15, speed);
        for (let k = 0; k < N; k++) {
          const s = Math.max(0, head - k * gap);
          const p = path.getPointAtLength(s);
          const c = circles[k];
          c.setAttribute('cx', p.x.toFixed(1));
          c.setAttribute('cy', p.y.toFixed(1));
          c.setAttribute('opacity', (Math.pow(1 - k / N, 1.6) * fade * (k === 0 ? 1 : 0.8)).toFixed(3));
          if (k === 0 && glow) {
            glow.setAttribute('cx', p.x.toFixed(1));
            glow.setAttribute('cy', p.y.toFixed(1));
            glow.setAttribute('opacity', (0.55 * fade).toFixed(3));
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView, geo, drawTotal, stops]);

  const first = stops[0].langs[0];
  const last = stops[stops.length - 1].langs.at(-1);
  const km = geo ? Math.round(geo.km / 100) * 100 : 0;

  return (
    <section className="ws-sec ws-map-sec" aria-labelledby={`${gid}-t`}>
      <div className="ws-sec__head">
        <p className="ws-sec__eyebrow">The map</p>
        <h2 className="ws-sec__title" id={`${gid}-t`}>
          {km >= 200 ? (
            <>
              A <em>{km.toLocaleString('en-US')} km</em> journey
            </>
          ) : (
            <>Close to <em>home</em></>
          )}
        </h2>
        <p className="ws-sec__lede">
          From {first} to {last}, following where each language was spoken.
        </p>
      </div>
      <div ref={wrap} className="ws-map" style={{ height: h }}>
        {geo && (
          <svg width={w} height={h} role="img" aria-label={`Map of the word's route: ${stops.map((s) => s.langs.join(', ')).join(' → ')}`}>
            <defs>
              {geo.arcs.map((a, i) => (
                <linearGradient key={i} id={`${gid}-g${i}`} gradientUnits="userSpaceOnUse" x1={a.a[0]} y1={a.a[1]} x2={a.b[0]} y2={a.b[1]}>
                  <stop offset="0" stopColor={stops[i].color} />
                  <stop offset="1" stopColor={stops[i + 1].color} />
                </linearGradient>
              ))}
              <filter id={`${gid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <radialGradient id={`${gid}-vig`} cx="50%" cy="50%" r="75%">
                <stop offset="60%" stopColor="var(--paper-2)" stopOpacity="0" />
                <stop offset="100%" stopColor="var(--paper-2)" stopOpacity="0.9" />
              </radialGradient>
            </defs>
            <path d={geo.graticule} className="ws-map__grat" />
            <motion.path d={landD} className="ws-map__land" initial={{ opacity: 0 }} animate={{ opacity: landD ? 1 : 0 }} transition={{ duration: 0.8 }} />
            <rect width={w} height={h} fill={`url(#${gid}-vig)`} pointerEvents="none" />
            {geo.arcs.map((a, i) => (
              <g key={i}>
                <motion.path
                  d={a.d}
                  className="ws-map__arc-glow"
                  stroke={`url(#${gid}-g${i})`}
                  filter={`url(#${gid}-glow)`}
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={inView ? { pathLength: 1 } : undefined}
                  transition={{ delay: 0.3 + i * DRAW_PER * 0.75, duration: DRAW_PER, ease: [0.65, 0, 0.35, 1] }}
                />
                <motion.path
                  d={a.d}
                  className="ws-map__arc"
                  stroke={`url(#${gid}-g${i})`}
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={inView ? { pathLength: 1 } : undefined}
                  transition={{ delay: 0.3 + i * DRAW_PER * 0.75, duration: DRAW_PER, ease: [0.65, 0, 0.35, 1] }}
                />
              </g>
            ))}
            <path ref={routeRef} d={geo.route} fill="none" stroke="none" />
            {stops.map((s, i) => {
              const [x, y] = geo.P[i];
              const delay = reduce ? 0 : 0.3 + Math.max(0, i - 1) * DRAW_PER * 0.75 + (i ? DRAW_PER * 0.85 : 0);
              const lb = labels[i];
              return (
                <motion.g
                  key={i}
                  initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                  animate={inView ? { opacity: 1, scale: 1 } : undefined}
                  transition={{ delay, type: 'spring', stiffness: 300, damping: 18 }}
                  style={{ transformOrigin: `${x}px ${y}px`, color: s.color }}
                >
                  <circle cx={x} cy={y} r={i === stops.length - 1 ? 13 : 10} className="ws-map__halo" />
                  <circle cx={x} cy={y} r={i === stops.length - 1 ? 6 : 4.5} className="ws-map__dot" />
                  <text x={lb.x} y={lb.y} textAnchor={lb.anchor} className="ws-map__label">
                    <tspan className="ws-map__num">{i + 1}</tspan>
                    {'  '}
                    {lb.text}
                  </text>
                </motion.g>
              );
            })}
            {!reduce && (
              <g ref={cometRef} className="ws-map__comet" style={{ opacity: 0 }}>
                <circle className="ws-map__comet-glow" r={12} filter={`url(#${gid}-glow)`} />
                {Array.from({ length: 22 }, (_, i) => 21 - i).map((k) => (
                  <circle key={k} className={`ws-map__tail${k === 0 ? ' is-head' : ''}`} r={k === 0 ? 4 : Math.max(0.6, 3.4 * (1 - k / 22))} />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>
    </section>
  );
}
