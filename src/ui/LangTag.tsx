import { href } from '../lib/router';
import { langColor, langName } from '../data';

/** A small coloured pill naming a language; links to it in the Languages section. */
export function LangTag({ id, link = true }: { id: string; link?: boolean }) {
  const body = (
    <>
      <span className="dot" />
      {langName(id)}
    </>
  );
  const style = { '--c': langColor(id) } as React.CSSProperties;
  return link ? (
    <a className="chip" href={href.lang(id)} style={style}>{body}</a>
  ) : (
    <span className="chip" style={style}>{body}</span>
  );
}
