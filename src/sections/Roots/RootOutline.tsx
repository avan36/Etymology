import { motion } from 'framer-motion';
import type { Root } from '../../data';
import { formatYear, langColor, langName, wordColor } from '../../data';
import { href } from '../../lib/router';
import { WordLink } from '../../ui/WordLink';
import { displayForm, type FNode } from './tree';

const ROOT_COLOR = '#8b8172';

/**
 * The family as an outline, for narrow screens: each language a row hanging off its parent with a
 * curved elbow, and the English words flowing as a wrapped list under the language they came from.
 */
export default function RootOutline({ root, tree, play, reduced }: { root: Root; tree: FNode; play: boolean; reduced: boolean }) {
  let order = 0;
  const appear = () => {
    const i = order++;
    return {
      initial: { opacity: 0, x: -10 },
      animate: play ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 },
      transition: { delay: reduced ? 0 : 0.08 + i * 0.05, duration: reduced ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] as const },
    };
  };

  const leavesOf = (n: FNode) => n.children.filter((c) => c.word);
  const innerOf = (n: FNode) => n.children.filter((c) => !c.word);

  const leaves = (n: FNode) => {
    const ls = leavesOf(n);
    if (!ls.length) return null;
    return (
      <motion.div className="ro-leaves" {...appear()}>
        {ls.map((l) => (
          <span key={l.key} className="ro-leaf" style={{ '--c': wordColor(l.word!) } as React.CSSProperties}>
            <WordLink word={l.word!.id} />
            {typeof l.word!.first === 'number' && <span className="ro-leaf__y mono">{formatYear(l.word!.first)}</span>}
          </span>
        ))}
      </motion.div>
    );
  };

  const node = (n: FNode, parentColor: string) => {
    const c = langColor(n.lang);
    const f = n.forms[0];
    const df = f ? displayForm(f.form) : { label: '' };
    const inner = innerOf(n);
    const hasLeaves = leavesOf(n).length > 0;
    return (
      <li key={n.key} className={`ro-node${inner.length ? ' has-kids' : ''}${hasLeaves ? ' has-leaves' : ''}`} style={{ '--pc': parentColor, '--c': c } as React.CSSProperties}>
        <motion.a className="ro-label" href={href.lang(n.lang)} {...appear()}>
          <span className="ro-dot" />
          <span className="ro-lang mono">{langName(n.lang)}</span>
          <span className="ro-form old">
            {df.label}
            {n.forms.length > 1 && <span className="ro-more mono"> +{n.forms.length - 1}</span>}
          </span>
        </motion.a>
        <div className="ro-body">
          {leaves(n)}
          {inner.length > 0 && (
            <ul className="ro-kids">
              {inner.map((k) => node(k, c))}
            </ul>
          )}
        </div>
      </li>
    );
  };

  const inner = innerOf(tree);
  return (
    <div className="ro">
      <motion.div className="ro-root" {...appear()}>
        <span className="ro-root__seed" />
        <span className="ro-root__form old">{root.form}</span>
        <span className="ro-root__mean">{root.meaning}</span>
      </motion.div>
      <div className="ro-body ro-body--root" style={{ '--c': ROOT_COLOR } as React.CSSProperties}>
        {leaves(tree)}
        {inner.length > 0 && (
          <ul className="ro-kids">
            {inner.map((k) => node(k, ROOT_COLOR))}
          </ul>
        )}
      </div>
    </div>
  );
}
