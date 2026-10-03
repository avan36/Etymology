import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { data, langColor } from '../../data';
import { href, useRoute } from '../../lib/router';
import { STREAM } from '../../lib/streams';
import Pour from './Pour';
import LangTree, { buildForest, type LNode } from './LangTree';
import LangDetail from './LangDetail';
import { replaceHash, useReduced, useWidth } from './hooks';
import './languages.css';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Chapter 3 — where English vocabulary comes from, and the family English belongs to. */
export default function Languages() {
  const route = useRoute();
  const reduced = useReduced();
  const forest = useMemo(buildForest, []);
  const [treeBox, treeW] = useWidth<HTMLDivElement>();

  const routeId = route.kind === 'lang' && data.lang.has(route.id) ? route.id : undefined;
  const fallback = data.lang.has('la') ? 'la' : data.languages[0]?.id;
  const [sel, setSel] = useState<string | undefined>(() => routeId ?? fallback);
  useEffect(() => {
    if (routeId) setSel(routeId);
  }, [routeId]);
  const detailRef = useRef<HTMLDivElement>(null);
  const select = (id: string) => {
    setSel(id);
    replaceHash(href.lang(id));
    // Stacked layout: bring the panel into view if it is off-screen below.
    const el = detailRef.current;
    if (el && window.innerWidth < 1120) {
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.75) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  };
  const lang = sel ? data.lang.get(sel) : undefined;

  const rise = {
    hide: reduced ? { opacity: 1 } : { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.8, ease: EASE } },
  };

  return (
    <section id="languages" className="section lg" aria-labelledby="languages-title">
      <div className="page">
        <motion.header className="section__head" initial="hide" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={{ show: { transition: { staggerChildren: reduced ? 0 : 0.09 } } }}>
          <motion.div className="section__eyebrow" variants={rise}>Chapter 3 · The ancestors</motion.div>
          <motion.h2 id="languages-title" className="section__title" variants={rise}>
            English is a <em>borrower</em>
          </motion.h2>
          <motion.p className="section__lede" variants={rise}>
            Only about a quarter of the dictionary was inherited from Old English. The rest came from Latin and French, from Greek and Norse — and from almost every language English has ever met.
          </motion.p>
        </motion.header>

        <Pour reduced={reduced} />

        <div className="lg-family">
          <motion.div className="lg-family__head" initial={reduced ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.7, ease: EASE }}>
            <h3 className="lg-h3">The family tree</h3>
            <p className="lg-cap">
              By birth, English is Germanic. Through Proto-Indo-European it is a cousin of Latin, Greek, Persian and Sanskrit — the very languages it later borrowed from. Hover or tap a language to trace its line to English.
            </p>
          </motion.div>

          <div className="lg-family__grid">
            <div className="lg-family__tree" ref={treeBox}>
              {forest.main && treeW > 0 && <LangTree main={forest.main} width={treeW} selected={sel} onSelect={select} reduced={reduced} />}
              {treeW > 0 && treeW < 600 && <div className="lg-pan-hint mono">Swipe to explore · tap a language</div>}
            </div>
            <div className="lg-family__detail" ref={detailRef}>{lang && <LangDetail lang={lang} onSelect={select} reduced={reduced} />}</div>
            {forest.others.length > 0 && (
              <div className="lg-family__beyond">
                <Beyond trees={forest.others} selected={sel} onSelect={select} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Languages outside English's family: other families (with their members) and lone lenders. */
function Beyond({ trees, selected, onSelect }: { trees: LNode[]; selected?: string; onSelect: (id: string) => void }) {
  const families = trees.filter((t) => t.children.length);
  const loners = trees.filter((t) => !t.children.length);
  const byStream = new Map<string, LNode[]>();
  for (const t of loners) {
    const a = byStream.get(t.lang.stream) ?? [];
    a.push(t);
    byStream.set(t.lang.stream, a);
  }
  const flat = (t: LNode, depth = 0): { n: LNode; depth: number }[] => [{ n: t, depth }, ...t.children.flatMap((c) => flat(c, depth + 1))];
  const chip = (n: LNode, depth = 0) => (
    <a
      key={n.lang.id}
      href={href.lang(n.lang.id)}
      className={`lg-bchip${selected === n.lang.id ? ' is-on' : ''}${depth ? ' is-child' : ''}`}
      style={{ '--c': langColor(n.lang.id) } as React.CSSProperties}
      onClick={(e) => {
        e.preventDefault();
        onSelect(n.lang.id);
      }}
    >
      <span className="dot" />
      {n.lang.name}
    </a>
  );
  return (
    <div className="lg-beyond">
      <div className="lg-beyond__title mono">Beyond the family · lenders with no shared ancestor</div>
      <div className="lg-beyond__groups">
        {families.map((t) => (
          <div key={t.lang.id} className="lg-beyond__g">
            <div className="lg-beyond__gl">{/^Proto-/.test(t.lang.name) ? `${t.lang.name.replace(/^Proto-/, '')} family` : t.lang.name}</div>
            <div className="lg-beyond__chips">{flat(t).map(({ n, depth }) => chip(n, depth))}</div>
          </div>
        ))}
        {[...byStream.entries()].map(([s, ts]) => (
          <div key={s} className="lg-beyond__g">
            <div className="lg-beyond__gl">{STREAM[s as keyof typeof STREAM]?.label ?? s}</div>
            <div className="lg-beyond__chips">{ts.sort((a, b) => a.lang.name.localeCompare(b.lang.name)).map((t) => chip(t))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
