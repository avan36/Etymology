import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useRoute } from './lib/router';
import TopNav from './components/TopNav';
import Footer from './components/Footer';
import Hero from './sections/Hero/Hero';
import River from './sections/River/River';
import Roots from './sections/Roots/Roots';
import Languages from './sections/Languages/Languages';
import Trends from './sections/Trends/Trends';
import Lost from './sections/Lost/Lost';
import WordSheet from './word/WordSheet';
import SearchPalette from './search/SearchPalette';

const SECTION_FOR: Record<string, string> = { root: 'roots', lang: 'languages' };

export default function App() {
  const route = useRoute();

  // Section links (#/river, #/root/…, #/lang/…) scroll their section into view.
  const target = route.kind === 'section' ? route.id : SECTION_FOR[route.kind];
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [target, route.kind === 'root' || route.kind === 'lang' ? route.id : '']);

  return (
    <>
      <TopNav />
      <main>
        <Hero />
        <River />
        <Roots />
        <Languages />
        <Trends />
        <Lost />
      </main>
      <Footer />
      <AnimatePresence>{route.kind === 'word' && <WordSheet key={`${route.word}/${route.lang ?? ''}`} word={route.word} lang={route.lang} />}</AnimatePresence>
      <SearchPalette />
    </>
  );
}
