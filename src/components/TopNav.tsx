/**
 * Slim, translucent top bar: wordmark, section links with an active indicator that follows the
 * section in view, search (⌘K) and the theme toggle. Hides on scroll down, returns on scroll up,
 * and sits transparently over the hero.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { href } from '../lib/router';
import { setTheme, useTheme } from '../lib/theme';
import { openSearch, useSearchOpen } from '../search/bus';
import { isApple } from '../search/recent';
import { SearchIcon } from '../search/icons';
import './nav.css';

const LINKS = [
  { id: 'river', label: 'River' },
  { id: 'roots', label: 'Roots' },
  { id: 'languages', label: 'Languages' },
  { id: 'trends', label: 'Trends' },
  { id: 'lost', label: 'Lost words' },
];

function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    let io: IntersectionObserver | null = null;
    const attach = () => {
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) seen.set(e.target.id, e.isIntersecting);
          const hit = LINKS.find((l) => seen.get(l.id));
          setActive(hit ? hit.id : null);
        },
        { rootMargin: '-38% 0px -58% 0px' },
      );
      for (const l of LINKS) {
        const el = document.getElementById(l.id);
        if (el) io.observe(el);
      }
    };
    attach();
    // Sections may mount late (lazy content); re-attach once things settle.
    const t = window.setTimeout(attach, 1200);
    return () => { window.clearTimeout(t); io?.disconnect(); };
  }, []);
  return active;
}

function useScrollState(locked: boolean) {
  const [hidden, setHidden] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const last = useRef(0);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const d = y - last.current;
        setAtTop(y < 12);
        if (lockedRef.current || y < 140) setHidden(false);
        else if (d > 6) setHidden(true);
        else if (d < -6) setHidden(false);
        if (Math.abs(d) > 6) last.current = y;
      });
    };
    last.current = window.scrollY;
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return { hidden: hidden && !locked, atTop };
}

/** Is the hero's own wordmark on screen? Then the bar's wordmark steps aside. */
function useHeroMarkVisible(): boolean {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const el = document.getElementById('hero-mark');
    if (!el) { setVis(false); return; }
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return vis;
}

function scrollToId(e: React.MouseEvent, id: string, h: string) {
  // Re-clicking the link of the current hash wouldn't fire hashchange: scroll ourselves.
  if (window.location.hash === h) {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export default function TopNav() {
  const reduce = useReducedMotion();
  const active = useActiveSection();
  const [menu, setMenu] = useState(false);
  const searchOpen = useSearchOpen();
  const { hidden, atTop } = useScrollState(menu || searchOpen);
  const markVisible = useHeroMarkVisible();
  const theme = useTheme();
  const apple = typeof navigator !== 'undefined' && isApple();

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const solid = !atTop || menu;

  return (
    <>
      <header className={`nav${solid ? ' is-solid' : ''}${hidden ? ' is-hidden' : ''}${menu ? ' is-menu' : ''}`}>
        <div className="nav__bar">
          <a
            className={`nav__mark${markVisible && !menu ? ' is-tucked' : ''}`}
            href={href.section('top')}
            onClick={(e) => { scrollToId(e, 'top', href.section('top')); setMenu(false); }}
            aria-label="Etymon — back to top"
          >
            Etym<span className="nav__mark-o">o</span>n
          </a>

          <nav className="nav__links" aria-label="Sections">
            {LINKS.map((l) => {
              const h = href.section(l.id);
              const on = active === l.id;
              return (
                <a key={l.id} href={h} className={`nav__link${on ? ' is-on' : ''}`} aria-current={on ? 'location' : undefined} onClick={(e) => scrollToId(e, l.id, h)}>
                  {on && <motion.span className="nav__pill" layoutId="nav-pill" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span className="nav__link-txt">{l.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="nav__tools">
            <button type="button" className="nav__search" onClick={() => { setMenu(false); openSearch(); }} aria-label="Search (⌘K)" aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}>
              <SearchIcon size={16} />
              <span className="nav__search-txt">Search</span>
              <span className="nav__keys" aria-hidden><kbd>{apple ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd></span>
            </button>
            <ThemeToggle dark={theme === 'dark'} onToggle={toggleTheme} />
            <button
              type="button"
              className="nav__burger"
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-controls="nav-sheet"
              aria-label={menu ? 'Close menu' : 'Open menu'}
            >
              <span className="nav__burger-l" />
              <span className="nav__burger-l" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menu && (
          <>
            <motion.div
              className="nav-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenu(false)}
            />
            <motion.nav
              id="nav-sheet"
              className="nav-sheet"
              aria-label="Sections"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <ol className="nav-sheet__list">
                {LINKS.map((l, i) => (
                  <motion.li
                    key={l.id}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 + i * 0.045, type: 'spring', stiffness: 300, damping: 26 }}
                  >
                    <a
                      href={href.section(l.id)}
                      className={`nav-sheet__link${active === l.id ? ' is-on' : ''}`}
                      onClick={(e) => { scrollToId(e, l.id, href.section(l.id)); setMenu(false); }}
                    >
                      <span className="nav-sheet__num">{String(i + 1).padStart(2, '0')}</span>
                      <span>{l.label}</span>
                    </a>
                  </motion.li>
                ))}
              </ol>
              <button type="button" className="nav-sheet__search" onClick={() => { setMenu(false); openSearch(); }}>
                <SearchIcon size={18} />
                <span>Search any word</span>
              </button>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/** Sun ↔ moon: the core grows and a shadow disc slides in to carve the crescent; rays fold away. */
function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 22 };
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <button
      type="button"
      className="nav__theme"
      onClick={onToggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <mask id="nav-moon-mask">
            <rect x="0" y="0" width="24" height="24" fill="#fff" />
            <motion.circle r="7.5" fill="#000" initial={false} animate={dark ? { cx: 16.5, cy: 7.5 } : { cx: 30, cy: -4 }} transition={spring} />
          </mask>
        </defs>
        <motion.circle
          cx="12"
          cy="12"
          fill="currentColor"
          mask="url(#nav-moon-mask)"
          initial={false}
          animate={{ r: dark ? 8.5 : 4.6 }}
          transition={spring}
        />
        <motion.g
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={false}
          animate={dark ? { opacity: 0, rotate: -60, scale: 0.5 } : { opacity: 1, rotate: 0, scale: 1 }}
          transition={spring}
        >
          {rays.map((a) => (
            <line key={a} x1="12" y1="2.6" x2="12" y2="4.6" transform={`rotate(${a} 12 12)`} />
          ))}
        </motion.g>
      </svg>
    </button>
  );
}
