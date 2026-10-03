import { useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { cluster, hierarchy, type HierarchyPointNode } from 'd3-hierarchy';
import { linkRadial } from 'd3-shape';
import type { Language } from '../../data';
import { data, formatYear, langColor } from '../../data';
import { href } from '../../lib/router';
import { ancestry, pathToEnglish, period, relationText, streamOrder } from './model';

export interface LNode {
  lang: Language;
  children: LNode[];
  size: number;
}

/** Every language tree in the data (by `parent` links), the one containing English first. */
export function buildForest(): { main?: LNode; others: LNode[] } {
  const kids = new Map<string, Language[]>();
  const tops: Language[] = [];
  for (const l of data.languages) {
    if (l.parent && data.lang.has(l.parent) && l.parent !== l.id) {
      const a = kids.get(l.parent) ?? [];
      a.push(l);
      kids.set(l.parent, a);
    } else tops.push(l);
  }
  const seen = new Set<string>();
  const make = (l: Language): LNode => {
    seen.add(l.id);
    const children = (kids.get(l.id) ?? []).filter((k) => !seen.has(k.id)).map(make);
    children.sort((a, b) => streamOrder(a.lang.stream) - streamOrder(b.lang.stream) || b.size - a.size || a.lang.name.localeCompare(b.lang.name));
    return { lang: l, children, size: 1 + children.reduce((s, c) => s + c.size, 0) };
  };
  const forest = tops.map(make);
  const enTop = ancestry('en').at(-1);
  const main = forest.find((t) => t.lang.id === enTop) ?? [...forest].sort((a, b) => b.size - a.size)[0];
  return { main, others: forest.filter((t) => t !== main) };
}

type P = HierarchyPointNode<LNode>;
const radial = linkRadial<{ source: [number, number]; target: [number, number] }, [number, number]>();
const xy = (a: number, r: number): [number, number] => [r * Math.sin(a), -r * Math.cos(a)];

/** A radial family tree of the languages English is related to, with English pointing east. */
export default function LangTree({ main, width, selected, onSelect, reduced }: { main: LNode; width: number; selected?: string; onSelect: (id: string) => void; reduced: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.25 });

  const L = useMemo(() => {
    // On phones the wheel is drawn larger than the screen and can be panned sideways.
    const pan = width < 600;
    const S = pan ? 640 : Math.min(width, 860);
    const small = pan;
    const fs = small ? 10.5 : 12;
    const h = hierarchy(main, (d) => (d.children.length ? d.children : undefined));
    const leaves = h.leaves();
    const longest = Math.max(...leaves.map((l) => l.data.lang.name.length));
    const margin = Math.min(longest * fs * 0.56 + (small ? 12 : 18), S * 0.24);
    const R = S / 2 - margin;
    const laid = cluster<LNode>().size([2 * Math.PI, R]).separation((a, b) => (a.parent === b.parent ? 1 : 1.7))(h);
    const maxD = Math.max(1, h.height);
    // Inner generations get more room near the centre, where the labels are.
    const ring = (depth: number) => Math.pow(depth / maxD, 0.62) * R * 0.93;
    laid.each((d) => {
      d.y = d.children ? ring(d.depth) : R;
    });
    const en = laid.find((d) => d.data.lang.id === 'en');
    const rot = en ? Math.PI / 2 - en.x : 0;
    laid.each((d) => {
      d.x = (((d.x + rot) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    });
    const nodes = laid.descendants();
    const enLine = new Set(ancestry('en'));

    // Horizontal labels for inner nodes, greedily placed where they don't collide.
    const lfs = small ? 10.5 : 11.5;
    const boxes: [number, number, number, number][] = nodes.map((d) => {
      const [x, y] = xy(d.x, d.y);
      return [x - 5, y - 5, x + 5, y + 5];
    });
    const rootW = main.lang.name.length * (small ? 11 : 14) * 0.52;
    const rootY = small ? 20 : 26;
    const placedBoxes: [number, number, number, number][] = [[-rootW / 2, rootY - (small ? 11 : 14), rootW / 2, rootY + 4]];
    const hit = (b: [number, number, number, number], self: number) =>
      boxes.some((o, i) => i !== self && b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) || placedBoxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const inner = nodes.map((d, i) => ({ d, i })).filter(({ d }) => d.children);
    // English's own line first (outermost stage first, so the crowded end gets first pick), then
    // the rest from the centre outwards.
    inner.sort((a, b) => {
      const ea = enLine.has(a.d.data.lang.id);
      const eb = enLine.has(b.d.data.lang.id);
      if (ea !== eb) return ea ? -1 : 1;
      if (ea) return b.d.depth - a.d.depth;
      return a.d.depth - b.d.depth || b.d.data.size - a.d.data.size;
    });
    const labels = new Map<string, { x: number; y: number; anchor: 'middle' | 'start' | 'end' }>();
    type Box = [number, number, number, number];
    type Cand = { x: number; y: number; anchor: 'middle' | 'start' | 'end'; b: Box };
    for (const { d, i } of inner) {
      const [x, y] = xy(d.x, d.y);
      const w = d.data.lang.name.length * lfs * 0.56 + 4;
      const hgt = lfs + 3;
      const off = 10;
      const row = (dy: number, anchor: Cand['anchor']): Cand => {
        const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x - 6 : x + 6 - w;
        const top = dy < 0 ? y - off - hgt + 2 : y + off - 1;
        const tx = anchor === 'middle' ? x : anchor === 'start' ? x - 6 : x + 6;
        return { x: tx, y: dy < 0 ? y - off : y + off + lfs - 3, anchor, b: [x0, top, x0 + w, top + hgt] };
      };
      const cands: Cand[] = [
        row(-1, 'middle'),
        row(1, 'middle'),
        row(-1, 'end'),
        row(-1, 'start'),
        row(1, 'end'),
        row(1, 'start'),
        { x: x + 10, y: y + lfs * 0.35, anchor: 'start', b: [x + 8, y - hgt / 2, x + 10 + w, y + hgt / 2] },
        { x: x - 10, y: y + lfs * 0.35, anchor: 'end', b: [x - 10 - w, y - hgt / 2, x - 8, y + hgt / 2] },
      ];
      const ok = cands.find((c) => Math.hypot((c.b[0] + c.b[2]) / 2, (c.b[1] + c.b[3]) / 2) + w / 2 < R + 4 && !hit(c.b, i));
      if (ok) {
        labels.set(d.data.lang.id, ok);
        placedBoxes.push(ok.b);
      }
    }
    return { S, R, fs, lfs, small, pan, nodes, labels, maxD, enLine, ring, rootY };
  }, [main, width]);

  const focus = hover ?? null;
  const lit = useMemo(() => (focus ? new Set(pathToEnglish(focus)) : null), [focus]);
  const half = L.S / 2;
  const step = reduced ? 0 : 0.2;
  const hovered = hover ? L.nodes.find((n) => n.data.lang.id === hover) : undefined;

  const panRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = panRef.current;
    if (el && L.pan) el.scrollLeft = el.scrollWidth - el.clientWidth;
  }, [L.pan, L.S]);

  const pick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    onSelect(id);
  };

  return (
    <div className={L.pan ? 'lg-pan' : 'lg-nopan'} ref={panRef}>
    <div className={`lg-tree${lit ? ' is-tracing' : ''}`} ref={ref} style={{ width: L.S, height: L.S }} onMouseLeave={() => setHover(null)}>
      <svg width={L.S} height={L.S} viewBox={`${-half} ${-half} ${L.S} ${L.S}`} className="lg-tree__svg" role="group" aria-label="Family tree of the languages related to English">
        <defs>
          {L.nodes.map((d) => {
            if (!d.parent) return null;
            const a = xy(d.parent.x, d.parent.y);
            const b = xy(d.x, d.y);
            return (
              <linearGradient key={d.data.lang.id} id={`${uid}-${d.data.lang.id}`} gradientUnits="userSpaceOnUse" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}>
                <stop offset="0" stopColor={langColor(d.parent.data.lang.id)} />
                <stop offset="1" stopColor={langColor(d.data.lang.id)} />
              </linearGradient>
            );
          })}
        </defs>
        <g className="lg-rings" aria-hidden="true">
          {Array.from({ length: Math.max(0, L.maxD - 1) }, (_, i) => (
            <motion.circle key={i} r={L.ring(i + 1)} initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ delay: reduced ? 0 : 0.1 + i * 0.08, duration: 0.8 }} />
          ))}
          <motion.circle r={L.R} className="lg-rings__outer" initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ delay: reduced ? 0 : 0.5, duration: 0.8 }} />
        </g>
        <g className="lg-links" aria-hidden="true">
          {L.nodes.map((d) => {
            if (!d.parent) return null;
            const id = d.data.lang.id;
            const onPath = lit ? lit.has(id) && lit.has(d.parent.data.lang.id) : false;
            const enPath = L.enLine.has(id) && L.enLine.has(d.parent.data.lang.id);
            const dd = radial({ source: [d.parent.x, d.parent.y], target: [d.x, d.y] }) ?? '';
            return (
              <g key={id}>
                <motion.path
                  d={dd}
                  className={`lg-link${enPath ? ' is-en' : ''}${lit && !onPath ? ' is-dim' : ''}${onPath ? ' is-lit' : ''}`}
                  stroke={`url(#${uid}-${id})`}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: seen ? 1 : 0 }}
                  transition={{ delay: (d.depth - 1) * step, duration: reduced ? 0 : 0.7, ease: [0.45, 0, 0.2, 1] }}
                />
                {(onPath || (enPath && !lit)) && <path d={dd} className="lg-flow" />}
              </g>
            );
          })}
        </g>
        <g className="lg-nodes">
          {L.nodes.map((d) => {
            const id = d.data.lang.id;
            const [x, y] = xy(d.x, d.y);
            const isEn = id === 'en';
            const dim = lit && !lit.has(id);
            const leaf = !d.children;
            const deg = (d.x * 180) / Math.PI - 90;
            const flip = d.x > Math.PI;
            const lab = L.labels.get(id);
            const delay = reduced ? 0 : d.depth * step + 0.45;
            return (
              <a
                key={id}
                href={href.lang(id)}
                className={`lg-node${dim ? ' is-dim' : ''}${selected === id ? ' is-sel' : ''}${isEn ? ' is-en' : ''}${leaf ? ' is-leaf' : ''}`}
                onClick={(e) => pick(e, id)}
                onMouseEnter={() => setHover(id)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
                aria-label={`${d.data.lang.name}${selected === id ? ' (selected)' : ''}`}
                style={{ '--c': langColor(id) } as React.CSSProperties}
              >
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ delay, duration: reduced ? 0 : 0.5 }}>
                  <circle cx={x} cy={y} r={leaf ? 13 : 11} className="lg-node__hit" />
                  {selected === id && <circle cx={x} cy={y} r={isEn ? 12 : 8.5} className="lg-node__sel" />}
                  {isEn && <circle cx={x} cy={y} r={12} className="lg-node__pulse" />}
                  <circle cx={x} cy={y} r={isEn ? 6.5 : d.depth === 0 ? 6 : leaf ? 3.4 : 4.2} className="lg-node__dot" fill={langColor(id)} />
                  {leaf ? (
                    <text className="lg-leaflabel" transform={`rotate(${deg}) translate(${d.y + (isEn ? 16 : 9)},0)${flip ? ' rotate(180)' : ''}`} textAnchor={flip ? 'end' : 'start'} dy="0.34em" style={{ fontSize: isEn ? L.fs * 1.9 : L.fs }}>
                      {d.data.lang.name}
                    </text>
                  ) : d.depth === 0 ? (
                    <text className="lg-rootlabel" x={0} y={L.rootY} textAnchor="middle" style={{ fontSize: L.small ? 12 : 14 }}>
                      {d.data.lang.name}
                    </text>
                  ) : (
                    lab && (
                      <text className="lg-innerlabel" x={lab.x} y={lab.y} textAnchor={lab.anchor} style={{ fontSize: L.lfs }}>
                        {d.data.lang.name}
                      </text>
                    )
                  )}
                </motion.g>
              </a>
            );
          })}
        </g>
      </svg>
      <AnimatePresence>{hovered && <TreeTip key={hovered.data.lang.id} d={hovered} half={half} S={L.S} reduced={reduced} />}</AnimatePresence>
    </div>
    </div>
  );
}

function TreeTip({ d, half, S, reduced }: { d: P; half: number; S: number; reduced: boolean }) {
  const [x, y] = xy(d.x, d.y);
  const l = d.data.lang;
  const n = data.wordsByOrigin.get(l.id)?.length ?? 0;
  const w = Math.min(250, S - 16);
  const px = half + x;
  const py = half + y;
  const left = Math.max(8, Math.min(S - w - 8, px - w / 2));
  const below = py < S * 0.42;
  const per = period(l, formatYear);
  return (
    <motion.div
      className="lg-tip card"
      role="tooltip"
      style={{ left, top: below ? py + 18 : undefined, bottom: below ? undefined : S - py + 18, width: w, '--c': langColor(l.id) } as React.CSSProperties}
      initial={{ opacity: 0, y: below ? -4 : 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 36 }}
    >
      <div className="lg-tip__name">
        <span className="dot" />
        {l.name}
      </div>
      {per && <div className="lg-tip__per mono">{per}</div>}
      <p className="lg-tip__rel">{relationText(l.id)}</p>
      <div className="lg-tip__meta mono">{n ? `${n} ${n === 1 ? 'word' : 'words'} · click to open` : 'click to open'}</div>
    </motion.div>
  );
}
