// Street dressing across the town: street lamps, electric poles and the tangle of cables, prayer flags strung
// high across the roads and down the hillside, vinyl banners over Temple Road, parked scooters / Enfields /
// small cars / a water tanker in roadside bays, road signs, milestones, benches, bins, LPG cylinders, crates,
// potted plants and little roadside shrines.
//
// Everything is placed on the road-edge strip (road edge → +0.5 m), in parking bays along the kerb, or overhead
// (> 4.5 m). Placement dodges the other modules' solids, so the build waits a few frames after mount until
// their colliders are registered (collision.version stops changing), then builds once.
import { useEffect, useState } from 'react';
import type { Mesh } from 'three';
import { collision } from '../../core/collision';
import { lamps } from '../../core/lamps';
import { PrayerFlags } from '../../kit/flags';
import { buildProps, type PropsBuild } from './build';

declare global {
  interface Window { __props?: PropsBuild['stats']; __propsMarks?: PropsBuild['marks'] }
}

export function Props() {
  const [B, setB] = useState<PropsBuild | null>(null);

  // build once the rest of the town has registered its colliders
  useEffect(() => {
    let raf = 0, frames = 0, still = 0, ver = -1;
    const tick = () => {
      frames++;
      if (collision.version === ver) still++; else { still = 0; ver = collision.version; }
      if ((frames >= 4 && still >= 2) || frames > 90) {
        const b = buildProps();
        window.__props = b.stats;
        window.__propsMarks = b.marks;
        setB(b);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!B) return;
    const offs: Array<() => void> = [];
    for (const b of B.boxes) offs.push(collision.addBox(b));
    for (const ci of B.circles) offs.push(collision.addCircle(ci));
    for (const l of B.lamps) offs.push(lamps.add(l));
    return () => { for (const o of offs) o(); };
  }, [B]);

  // dispose on a real unmount (deferred so StrictMode's simulated unmount + re-mount keeps the meshes)
  useEffect(() => {
    if (!B) return;
    const t = pending.get(B);
    if (t) { clearTimeout(t); pending.delete(B); }
    return () => {
      pending.set(B, setTimeout(() => {
        pending.delete(B);
        for (const m of B.meshes) (m as Mesh).geometry?.dispose();
      }, 0));
    };
  }, [B]);

  if (!B) return null;
  return (
    <group name="props">
      {B.meshes.map((m, i) => <primitive key={i} object={m} />)}
      {B.flags.length > 0 && <PrayerFlags lines={B.flags} />}
    </group>
  );
}

const pending = new WeakMap<object, ReturnType<typeof setTimeout>>();
