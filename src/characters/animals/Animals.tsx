// The animals of McLeod Ganj: street dogs, Pema's puppy, cows, macaques and langurs, pigeons and crows.
// Each species lives in its own component; the four-legged ones share the quadruped kit (quad.ts /
// species.ts: one skinned draw call each), the birds are instanced (Birds.tsx). Debug lineup: ?zoo=1.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { collision } from '../../core/collision';
import { Zoo, zooOn } from './Zoo';
import { openToward, TO_CAM } from './nav';
import { Dogs } from './Dogs';
import { Puppy } from './Puppy';
import { Cows } from './Cows';
import { Monkeys } from './Monkeys';
import { Birds } from './Birds';
import { PeopleZoo, peopleZooOn } from '../PeopleZoo';

export function Animals() {
  // test hooks: window.__scene / __camera (for the screenshot scripts in shots/animals)
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    Object.assign(window, {
      __scene: scene, __camera: camera,
      __animalsDebug: {
        /** Collider tags (count, height range) within r of (x, z). */
        tags: (x = 0, z = 0, r = 1e9) => {
          const out: Record<string, [number, number, number]> = {};
          for (const c of collision.list()) {
            if (Math.hypot(c.x - x, c.z - z) > r) continue;
            const k = c.tag ?? '?';
            const o = (out[k] ??= [0, 1e9, -1e9]);
            o[0]++; o[1] = Math.min(o[1], +(c.y1 - c.y0).toFixed(1)); o[2] = Math.max(o[2], +(c.y1 - c.y0).toFixed(1));
          }
          return out;
        },
        /** Can the default camera see (x, y, z)? (no collider in the way) */
        seen: (x: number, y: number, z: number) => openToward(x, y + 0.3, z, TO_CAM[0], TO_CAM[1], TO_CAM[2], 18),
      },
    });
  }, [scene, camera]);
  return (
    <>
      <Dogs />
      <Puppy />
      <Cows />
      <Monkeys />
      <Birds />
      {zooOn && <Zoo />}
      {peopleZooOn && <PeopleZoo />}
    </>
  );
}
