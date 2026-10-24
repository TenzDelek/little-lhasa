// The hillside town and its forests: Bhagsu Road (guesthouses, hotels, cafés, the tea shop and the lost
// puppy's nook, the overlook at the end), Dharamkot Road (family houses, the school, a small Hindu shrine,
// shortcut steps, Amala's house), the Dhauladhar viewpoint, and the deodar / chir pine / oak / rhododendron
// forests around the whole town. Everything is built once (build.ts) and merged; this component mounts the
// meshes and registers colliders, lamps and interactables.
import { useEffect, useMemo } from 'react';
import type { Mesh } from 'three';
import { collision } from '../../core/collision';
import { lamps } from '../../core/lamps';
import { interactions } from '../../core/interact';
import { PrayerFlags, Darchor } from '../../kit/flags';
import { buildHillside } from './build';
import { Forest } from './Woodland';

export function Hillside() {
  const H = useMemo(() => buildHillside(), []);
  useEffect(() => { (window as unknown as { __hillside: unknown }).__hillside = H; }, [H]);

  useEffect(() => {
    const offs: Array<() => void> = [];
    for (const b of H.colliders) offs.push(collision.addBox(b));
    for (const ci of H.circles) offs.push(collision.addCircle(ci));
    for (const l of H.lamps) offs.push(lamps.add(l));
    for (const i of H.interact) offs.push(interactions.add(i));
    return () => { for (const o of offs) o(); };
  }, [H]);

  useEffect(() => () => {
    for (const m of H.meshes) {
      const g = (m as Mesh).geometry;
      if (g) g.dispose();
    }
  }, [H]);

  return (
    <group name="hillside">
      {H.meshes.map((m, i) => <primitive key={i} object={m} />)}
      {H.flags.length > 0 && <PrayerFlags lines={H.flags} />}
      {H.darchor.length > 0 && <Darchor poles={H.darchor} />}
      <Forest items={H.trees} />
    </group>
  );
}
