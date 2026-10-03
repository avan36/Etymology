/** A pill-shaped language picker over a native <select> (keyboard, screen-reader and phone friendly). */
import { LOOKUP_LANGS } from '../word/langs';
import { lookupLangName, setLookupLang, useLookupLang } from './lang';
import { GlobeIcon } from './icons';

export function LangPicker({ className = '' }: { className?: string }) {
  const lang = useLookupLang();
  return (
    <label className={`lp${lang !== 'auto' ? ' is-set' : ''} ${className}`} title="Language to look words up in">
      <GlobeIcon size={15} className="lp__icon" />
      <span className="lp__name">{lookupLangName(lang)}</span>
      <span className="lp__code" aria-hidden>{lang === 'auto' ? 'Any' : lang.toUpperCase()}</span>
      <svg className="lp__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
        <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        className="lp__select"
        value={lang}
        onChange={(e) => setLookupLang(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="Look words up in"
      >
        <option value="auto">Any language (English first)</option>
        {LOOKUP_LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.name}</option>
        ))}
      </select>
    </label>
  );
}
