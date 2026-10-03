import { data } from '../../data';
import type { Word } from '../../data';
import { T0, T1 } from './lostUtil';

const pct = (y: number) => `${(((Math.max(T0, Math.min(T1, y)) - T0) / (T1 - T0)) * 100).toFixed(2)}%`;

/** A word's life drawn on the whole timeline of English (450 → today), era by era. */
export default function Lifespan({ w, big = false }: { w: Word; big?: boolean }) {
  const end = w.died ?? T1;
  const fading = w.died === undefined || w.status === 'archaic';
  return (
    <span className={`lost-life ${big ? 'lost-life--big' : ''}`} aria-hidden="true">
      {big &&
        data.eras.slice(1).map((e) => (
          <i key={e.id} className="lost-life__era" style={{ left: pct(e.start) }} />
        ))}
      <span className="lost-life__span" style={{ left: pct(w.first), width: `calc(${pct(end)} - ${pct(w.first)})` }} />
      {fading && w.died !== undefined && (
        <span className="lost-life__after" style={{ left: pct(end), width: `calc(100% - ${pct(end)})` }} />
      )}
      <span className="lost-life__birth" style={{ left: pct(w.first) }} />
      {w.died !== undefined && <span className="lost-life__death" style={{ left: pct(end) }} />}
    </span>
  );
}
