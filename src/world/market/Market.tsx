// The market streets of McLeod Ganj: Temple Road and Jogiwara Road lined with shops, cafés and guesthouses,
// Market Lane's tarp stalls under festival lights, Tashi's momo stall, the balep cart and Dolma's laphing
// table, the book shop and the thangka shop. Everything is built once (build.ts) and merged into a handful
// of meshes; this component mounts them and registers colliders, lamps and interactables.
import { useEffect, useMemo } from 'react';
import type { Mesh } from 'three';
import { collision } from '../../core/collision';
import { lamps } from '../../core/lamps';
import { interactions } from '../../core/interact';
import { PrayerFlags, Darchor } from '../../kit/flags';
import { buildMarket } from './build';

export function Market() {
  const M = useMemo(() => buildMarket(), []);
  // dev handle for debugging scripts (stats, footprints, shop list)
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __market: unknown }).__market = M; }, [M]);

  useEffect(() => {
    const offs: Array<() => void> = [];
    for (const b of M.colliders) offs.push(collision.addBox(b));
    for (const ci of M.circles) offs.push(collision.addCircle(ci));
    for (const l of M.lamps) offs.push(lamps.add(l));
    for (const i of M.interact) offs.push(interactions.add(i));
    return () => { for (const o of offs) o(); };
  }, [M]);

  useEffect(() => () => {
    for (const m of M.meshes) {
      const g = (m as Mesh).geometry;
      if (g) g.dispose();
    }
  }, [M]);

  return (
    <>
      {M.meshes.map((m, i) => <primitive key={i} object={m} />)}
      {M.flags.length > 0 && <PrayerFlags lines={M.flags} />}
      {M.darchor.length > 0 && <Darchor poles={M.darchor} />}
    </>
  );
}
