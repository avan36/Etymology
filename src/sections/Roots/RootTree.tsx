import { useMemo, useState, useId } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cluster, hierarchy, type HierarchyPointNode } from 'd3-hierarchy';
import { linkHorizontal } from 'd3-shape';
import type { Root } from '../../data';
import { formatYear, langColor, langName, wordColor } from '../../data';
import { href } from '../../lib/router';
import { WordLink } from '../../ui/WordLink';
import { displayForm, type FNode } from './tree';

type HNode = HierarchyPointNode<FNode>;
interface Placed {
  n: HNode;
  key: string;
  x: number;
  y: number;
  color: string;
  label: 'full' | 'form' | 'none';
  side: 'up' | 'down';
  /** Index among leaves (for the bloom stagger). */
  li: number;
}

const ROOT_COLOR = '#8b8172';
const link = linkHorizontal<{ source: [number, number]; target: [number, number] }, [number, number]>();
const EASE_DRAW = [0.45, 0, 0.15, 1] as const;

function rowFor(n: number) {
  if (n <= 3) return 104;
  if (n <= 6) return 58;
  if (n <= 12) return 46;
  if (n <= 20) return 38;
  return 33;
}

/** Horizontal dendrogram: the root on the left, the English words in a column on the right. */
export default function RootTree({ root, tree, width, play, reduced }: { root: Root; tree: FNode; width: number; play: boolean; reduced: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState<string | null>(null);

  const L = useMemo(() => {
    const n = Math.max(1, tree.leaves);
    const rowH = rowFor(n);
    const h = hierarchy(tree, (d) => (d.word ? undefined : d.children));
    const laid = cluster<FNode>().nodeSize([rowH, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.32))(h);
    const all = laid.descendants();
    let minX = Infinity;
    let maxX = -Infinity;
    let maxD = 0;
    for (const d of all) {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      if (!d.data.word) maxD = Math.max(maxD, d.depth);
    }
    const padT = 50;
    const padB = 26;
    const minH = 340;
    let H = padT + (maxX - minX) + padB;
    const shift = H < minH ? (minH - H) / 2 : 0;
    H = Math.max(H, minH);
    const leafW = Math.min(200, Math.max(132, width * 0.2));
    const rootX = Math.min(150, Math.max(104, width * 0.13));
    const leafX = width - leafW;
    const colW = (leafX - rootX) / (maxD + 1);
    let li = 0;
    const placed: Placed[] = all.map((d) => ({
      n: d,
      key: d.data.key,
      x: d.data.word ? leafX : rootX + d.depth * colW,
      y: padT + shift + d.x - minX,
      color: d.data.word ? wordColor(d.data.word) : d.depth === 0 ? ROOT_COLOR : langColor(d.data.lang),
      label: 'full',
      side: 'up',
      li: d.data.word ? li++ : 0,
    }));
    const byKey = new Map(placed.map((p) => [p.key, p]));
    // Labels sit up-left of a node when its parent is below (the incoming branch arrives from
    // below-left, so that corner is free) and down-left when the parent is above. Within a
    // column, a label falls back to one line, then to hover-only, if it would collide.
    const FULL = 31;
    const ONE = 18;
    const GAP = 7;
    const cols = new Map<number, Placed[]>();
    for (const p of placed) {
      if (p.n.data.word || p.n.depth === 0) continue;
      const par = byKey.get(p.n.parent!.data.key)!;
      p.side = par.y < p.y - 0.5 ? 'down' : 'up';
      const c = cols.get(p.n.depth) ?? [];
      c.push(p);
      cols.set(p.n.depth, c);
    }
    for (const c of cols.values()) {
      const taken: [number, number][] = [];
      const free = (a: number, b: number, self: Placed) =>
        a >= 2 && b <= H - 2 && c.every((q) => q === self || b <= q.y - 7 || a >= q.y + 7) && taken.every(([x, y]) => b <= x || a >= y);
      const order = [...c].sort((a, b) => b.n.data.leaves - a.n.data.leaves || a.n.depth - b.n.depth);
      for (const p of order) {
        p.label = 'none';
        const sides: ('up' | 'down')[] = p.side === 'up' ? ['up', 'down'] : ['down', 'up'];
        outer: for (const [mode, h] of [['full', FULL], ['form', ONE]] as const) {
          for (const side of sides) {
            const a = side === 'up' ? p.y - GAP - h : p.y + GAP;
            const b = a + h;
            if (free(a, b, p)) {
              p.label = mode;
              p.side = side;
              taken.push([a, b]);
              break outer;
            }
          }
        }
      }
    }
    return { placed, byKey, H, colW, leafX, rootX, n, maxD };
  }, [tree, width]);

  // The lineage of whatever is hovered: its ancestors, plus (for inner nodes) everything below.
  const lit = useMemo(() => {
    if (!hover) return null;
    const p = L.byKey.get(hover);
    if (!p) return null;
    const s = new Set<string>();
    p.n.ancestors().forEach((a) => s.add(a.data.key));
    p.n.descendants().forEach((d) => s.add(d.data.key));
    return s;
  }, [hover, L]);

  const step = reduced ? 0 : 0.17;
  const dur = reduced ? 0 : 0.62;
  const on = (k: string) => !lit || lit.has(k);
  const hovered = hover ? L.byKey.get(hover) : undefined;
  const width2 = (leaves: number) => 1.1 + 3.4 * Math.sqrt(leaves / L.n);

  return (
    <div className={`rt-tree${lit ? ' is-tracing' : ''}`} style={{ height: L.H }} onMouseLeave={() => setHover(null)}>
      <svg className="rt-svg" width={width} height={L.H} viewBox={`0 0 ${width} ${L.H}`} aria-hidden="true">
        <defs>
          {L.placed.map((p) => {
            const par = p.n.parent && L.byKey.get(p.n.parent.data.key);
            if (!par || par.color === p.color) return null;
            return (
              <linearGradient key={p.key} id={`${uid}g${idx(p.key)}`} gradientUnits="userSpaceOnUse" x1={par.x} y1={par.y} x2={p.x} y2={p.y}>
                <stop offset="0%" stopColor={par.color} />
                <stop offset="100%" stopColor={p.color} />
              </linearGradient>
            );
          })}
        </defs>
        <g className="rt-links">
          {L.placed.map((p) => {
            const par = p.n.parent && L.byKey.get(p.n.parent.data.key);
            if (!par) return null;
            const stroke = par.color === p.color ? p.color : `url(#${uid}g${idx(p.key)})`;
            const d = link({ source: [par.x, par.y], target: [p.x, p.y] }) ?? '';
            const delay = par.n.depth * step;
            return (
              <motion.path
                key={p.key}
                d={d}
                className={`rt-link${on(p.key) ? '' : ' is-dim'}${lit?.has(p.key) ? ' is-lit' : ''}`}
                stroke={stroke}
                strokeWidth={width2(p.n.data.word ? 1 : p.n.data.leaves)}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={play ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                transition={{ pathLength: { delay, duration: dur * (p.n.data.word ? 1.15 : 1), ease: EASE_DRAW }, opacity: { delay, duration: reduced ? 0 : 0.15 } }}
              />
            );
          })}
        </g>
        <g className="rt-dots">
          {L.placed.map((p) => {
            const isRoot = p.n.depth === 0;
            const delay = isRoot ? 0 : (p.n.depth - (p.n.data.word ? 0 : 0.35)) * step + dur * 0.75 + (p.n.data.word ? p.li * (reduced ? 0 : 0.012) : 0);
            return (
              <motion.g key={p.key} className={`rt-dot${on(p.key) ? '' : ' is-dim'}`} style={{ transformOrigin: `${p.x}px ${p.y}px` }} initial={{ scale: 0, opacity: 0 }} animate={play ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : { delay, type: 'spring', stiffness: 420, damping: 22 }}>
                {isRoot ? (
                  <>
                    <circle className="rt-root-halo" cx={p.x} cy={p.y} r={17} />
                    <circle className="rt-root-ring" cx={p.x} cy={p.y} r={11} />
                    <circle className="rt-root-core" cx={p.x} cy={p.y} r={6.5} />
                  </>
                ) : (
                  <circle className={p.n.data.word ? 'rt-leafdot' : 'rt-node'} cx={p.x} cy={p.y} r={p.n.data.word ? 3.6 : 4.6} fill={p.color} />
                )}
              </motion.g>
            );
          })}
        </g>
      </svg>

      <div className="rt-labels">
        {L.placed.map((p) => {
          if (p.n.depth === 0) {
            return (
              <div key={p.key} className="rt-rootlabel" style={{ left: p.x - 24, top: p.y }}>
                <motion.div initial={{ opacity: 0, x: 10 }} animate={play ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }} transition={{ duration: reduced ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}>
                  <span className="rt-rootlabel__lang mono">{langName(root.lang) === 'Proto-Indo-European' ? 'PIE root' : langName(root.lang)}</span>
                  <span className="rt-rootlabel__form old">{root.form}</span>
                </motion.div>
              </div>
            );
          }
          const delay = (p.n.depth - (p.n.data.word ? 0 : 0.35)) * step + dur * 0.8 + (p.n.data.word ? p.li * (reduced ? 0 : 0.014) : 0);
          const w = p.n.data.word;
          if (w) {
            return (
              <div key={p.key} className={`rt-leaf${on(p.key) ? '' : ' is-dim'}${hover === p.key ? ' is-hover' : ''}`} style={{ left: p.x + 11, top: p.y, maxWidth: width - p.x - 12 }} onMouseEnter={() => setHover(p.key)} onFocus={() => setHover(p.key)} onBlur={() => setHover(null)}>
                <motion.span className="rt-leaf__in" initial={{ opacity: 0, x: -8 }} animate={play ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }} transition={{ delay, duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}>
                  <WordLink word={w.id} className="rt-leaf__w" />
                  {typeof w.first === 'number' && <span className="rt-leaf__y mono">{formatYear(w.first)}</span>}
                </motion.span>
              </div>
            );
          }
          if (p.label === 'none') {
            return <a key={p.key} className="rt-hit" href={href.lang(p.n.data.lang)} aria-label={`${langName(p.n.data.lang)}: ${p.n.data.forms.map((f) => f.form).join(', ')}`} style={{ left: p.x, top: p.y }} onMouseEnter={() => setHover(p.key)} onFocus={() => setHover(p.key)} onBlur={() => setHover(null)} />;
          }
          const fs = p.n.data.forms;
          const shown = fs.slice(0, 1).map((f) => displayForm(f.form));
          const more = fs.length - shown.length;
          return (
            <a key={p.key} className={`rt-label rt-label--${p.label} rt-label--${p.side}${on(p.key) ? '' : ' is-dim'}`} href={href.lang(p.n.data.lang)} style={{ left: p.x + 9, top: p.y, maxWidth: L.colW - 14 }} onMouseEnter={() => setHover(p.key)} onFocus={() => setHover(p.key)} onBlur={() => setHover(null)}>
              <motion.span className="rt-label__in" initial={{ opacity: 0, x: 8 }} animate={play ? { opacity: 1, x: 0 } : { opacity: 0, x: 8 }} transition={{ delay, duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}>
                {p.label === 'full' && <span className="rt-label__lang mono">{langName(p.n.data.lang)}</span>}
                <span className="rt-label__form old">
                  <span className="rt-label__txt">
                    {shown.map((df, i) => (
                      <span key={i} className={df.native ? 'rt-translit' : undefined}>
                        {i > 0 && <span className="rt-label__sep"> · </span>}
                        {df.label}
                      </span>
                    ))}
                  </span>
                  {more > 0 && <span className="rt-label__more mono">+{more}</span>}
                </span>
              </motion.span>
            </a>
          );
        })}
      </div>

      <AnimatePresence>{hovered && hovered.n.depth > 0 && <Tip key={hovered.key} p={hovered} width={width} H={L.H} reduced={reduced} />}</AnimatePresence>
    </div>
  );
}

/** Small stable hash so gradient ids are unique per link. */
function idx(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function Tip({ p, width, H, reduced }: { p: Placed; width: number; H: number; reduced: boolean }) {
  const w = p.n.data.word;
  const cardW = Math.min(268, width - 24);
  let left: number;
  let top: number;
  if (w) {
    left = p.x - 18 - cardW;
    if (left < 8) left = Math.max(8, Math.min(width - cardW - 8, p.x - cardW / 2));
    top = Math.max(4, Math.min(H - 150, p.y - 52));
  } else {
    left = Math.max(8, Math.min(width - cardW - 8, p.x - cardW / 2));
    top = p.y + 16;
    if (top > H - 120) top = Math.max(4, p.y - 150);
  }
  const via = p.n.parent && p.n.parent.depth > 0 ? p.n.parent.data.lang : undefined;
  return (
    <motion.div
      className="rt-tip card"
      role="tooltip"
      style={{ left, top, width: cardW, '--c': p.color } as React.CSSProperties}
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
    >
      {w ? (
        <>
          <div className="rt-tip__head">
            <span className="rt-tip__word">{w.word}</span>
            {w.pos && <span className="rt-tip__pos">{w.pos}</span>}
          </div>
          <p className="rt-tip__gloss">{w.gloss}</p>
          <div className="rt-tip__meta mono">
            <span className="dot" />
            {typeof w.first === 'number' && <>first recorded {formatYear(w.first, w.first < 1500)}</>}
          </div>
          <div className="rt-tip__via">
            from <b>{langName(w.origin === 'en' && via ? via : w.origin)}</b>
            {w.origin === 'en' && ' · coined in English'}
          </div>
        </>
      ) : (
        <>
          <div className="rt-tip__lang mono">
            <span className="dot" />
            {langName(p.n.data.lang)}
          </div>
          <ul className="rt-tip__forms">
            {p.n.data.forms.slice(0, 5).map((f) => {
              const df = displayForm(f.form);
              return (
                <li key={f.form}>
                  <span className="old">{df.native ?? df.label}</span>
                  {df.native && <span className="rt-tip__tr"> {df.label}</span>}
                  {f.meaning && <span className="rt-tip__mean"> “{f.meaning}”</span>}
                </li>
              );
            })}
            {p.n.data.forms.length > 5 && <li className="muted">+{p.n.data.forms.length - 5} more forms</li>}
          </ul>
          <div className="rt-tip__meta mono">
            {p.n.data.leaves} English {p.n.data.leaves === 1 ? 'word' : 'words'} came through here
          </div>
        </>
      )}
    </motion.div>
  );
}
