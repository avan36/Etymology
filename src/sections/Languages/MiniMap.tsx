import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import { data, langColor } from '../../data';

// The coastline loads lazily (it's shared with the word sheet's journey map chunk).
let LAND: FeatureCollection<Geometry> | undefined;
let loading: Promise<FeatureCollection<Geometry>> | undefined;
function loadLand() {
  loading ??= import('world-atlas/land-110m.json').then((m) => {
    const topo = (m.default ?? m) as unknown as Topology<{ land: GeometryCollection }>;
    LAND = feature(topo, topo.objects.land) as unknown as FeatureCollection<Geometry>;
    return LAND;
  });
  return loading;
}
function useLand() {
  const [land, setLand] = useState(LAND);
  useEffect(() => {
    if (land) return;
    let live = true;
    loadLand().then((l) => live && setLand(l), () => {});
    return () => {
      live = false;
    };
  }, [land]);
  return land;
}

/** A small map: where a language was spoken, and the journey of its ancestors to get there. */
export default function MiniMap({ ids, width = 300, height = 150, reduced }: { ids: string[]; width?: number; height?: number; reduced: boolean }) {
  const land = useLand();
  const M = useMemo(() => {
    const pts = ids
      .map((id) => data.lang.get(id))
      .filter((l): l is NonNullable<typeof l> => !!l?.region)
      .map((l) => ({ id: l.id, at: l.region as [number, number] }));
    if (!pts.length) return null;
    const lons = pts.map((p) => p.at[0]);
    const lats = pts.map((p) => p.at[1]);
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2;
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2;
    const spanX = Math.max(46, Math.max(...lons) - Math.min(...lons) + 22);
    const spanY = Math.max(24, Math.max(...lats) - Math.min(...lats) + 14);
    const frame: GeoJSON.MultiPoint = {
      type: 'MultiPoint',
      coordinates: [
        [cx - spanX / 2, cy - spanY / 2],
        [cx + spanX / 2, cy + spanY / 2],
        [cx - spanX / 2, cy + spanY / 2],
        [cx + spanX / 2, cy - spanY / 2],
      ],
    };
    const proj = geoNaturalEarth1().rotate([-cx, 0]).fitExtent([[10, 10], [width - 10, height - 10]], frame);
    const path = geoPath(proj);
    const xy = pts.map((p) => ({ ...p, xy: proj(p.at) ?? [0, 0] }));
    // Journey: oldest ancestor → this language (ids arrive nearest-first).
    const journey = [...xy].reverse();
    const line: GeoJSON.LineString = { type: 'LineString', coordinates: journey.map((p) => p.at) };
    return { landD: land ? (path(land) ?? '') : '', lineD: journey.length > 1 ? (path(line) ?? '') : '', xy, here: xy[0] };
  }, [ids, width, height, land]);

  if (!M) return null;
  return (
    <svg className="lg-map" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <motion.path d={M.landD} className="lg-map__land" initial={{ opacity: 0 }} animate={{ opacity: M.landD ? 1 : 0 }} transition={{ duration: 0.5 }} />
      {M.lineD && <motion.path key={ids.join()} d={M.lineD} className="lg-map__line" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 1.2, ease: [0.45, 0, 0.2, 1], delay: 0.15 }} />}
      {M.xy.slice(1).map((p) => (
        <circle key={p.id} cx={p.xy[0]} cy={p.xy[1]} r={2.6} fill={langColor(p.id)} className="lg-map__anc" />
      ))}
      <circle cx={M.here.xy[0]} cy={M.here.xy[1]} r={11} fill={langColor(M.here.id)} className="lg-map__halo" />
      <circle cx={M.here.xy[0]} cy={M.here.xy[1]} r={4.5} fill={langColor(M.here.id)} className="lg-map__here" />
    </svg>
  );
}
