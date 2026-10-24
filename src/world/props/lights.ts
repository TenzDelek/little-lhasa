// Street lamps every ~16–20 m, alternating sides, along the four asphalt roads. Each lamp looks for a free
// spot on the edge strip near its nominal position (between shops, clear of stalls, railings and balconies);
// where a whole frontage is built up it is bolted to the façade on a bracket arm instead, as in the bazaar.
import { Vector3 } from 'three';
import type { Parts, V3 } from '../../core/geom';
import type { Lamp } from '../../core/lamps';
import { PAL } from '../../core/palette';
import { pick } from '../../core/math';
import { streetLamp, bin, beam, srng, type LampKind } from '../../kit/street';
import { type PCtx, count, mark, solid } from './ctx';
import { STREETS, edgePt, freeRange, postPt, propPt, stripOK, type EdgePt } from './plan';

const KINDS: Record<string, readonly LampKind[]> = {
  'temple-road': ['arm', 'old', 'arm'],
  'jogiwara-road': ['old', 'arm', 'old'],
  'bhagsu-road': ['solar', 'arm', 'solar'],
  'dharamkot-road': ['solar', 'old', 'arm'],
};
/** Points the lamp search may use: own strip (kerb or verge, never a drain), free of foreign solids, not
 *  right under a balcony. */
function lampSpot(c: PCtx, road: EdgePt['road'], s: number, side: 1 | -1, s0: number, s1: number) {
  for (let k = 0; k <= 14; k++) {
    const d = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.7;
    const ss = s + d;
    if (ss < s0 || ss > s1) continue;
    const p = postPt(road, ss, side);
    if (!stripOK(p, p.off)) continue;
    if (c.obs.blocked(p.x, p.z, 0.32, p.y + 0.05, p.y + 4.9)) continue;
    if (c.obs.structureDist(p.x, p.z, 1.5, 2.5) < 0.9) continue; // balconies / chajjas hang ~0.7 m out
    // keep the arm and head clear too
    const hx = p.x - p.ox * 1.1, hz = p.z - p.oz * 1.1;
    if (c.obs.blocked(hx, hz, 0.3, p.y + 4.0, p.y + 5.6)) continue;
    return p;
  }
  return null;
}

/**
 * Wall-bracket lamp: a steel plate on the façade, a pipe arm out over the kerb and a sodium cobra head.
 * `at` is on the wall (world), the arm points along yaw. Returns the lamp.
 */
export function bracketLamp(p: Parts, at: V3, yaw: number, arm: number, seed: number): Lamp {
  const r = srng(seed);
  const col = pick(r, [0x3f6f55, 0x3a3e42, 0x737a80]);
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  const [x, y, z] = at;
  const head = new Vector3(x + sx * arm, y + 0.32, z + sz * arm);
  p.group([x, y, z], yaw, () => {
    p.box(0.22, 0.32, 0.04, [0, 0, 0.02], 0x2f3236); // wall plate
    p.box(0.05, 0.05, 0.05, [0, -0.1, 0.06], 0x2f3236);
  });
  beam(p, [x + sx * 0.04, y - 0.1, z + sz * 0.04], [x + sx * arm * 0.45, y + 0.1, z + sz * arm * 0.45], 0.035, col); // strut
  beam(p, [x + sx * 0.04, y + 0.08, z + sz * 0.04], [x + sx * arm * 0.7, y + 0.3, z + sz * arm * 0.7], 0.05, col);
  beam(p, [x + sx * arm * 0.7, y + 0.3, z + sz * arm * 0.7], [head.x, head.y, head.z], 0.05, col);
  p.group([head.x, head.y, head.z], yaw, () => {
    p.taper(0.2, 0.4, 0.14, 0.3, 0.12, [0, -0.05, 0.1], col, { emit: PAL.lampSodium, emitIntensity: 0.25, emitNight: true });
    p.box(0.17, 0.07, 0.32, [0, -0.09, 0.1], PAL.lampSodium, { emit: PAL.lampSodium, emitIntensity: 2.6, emitNight: true });
  });
  // supply cable down the wall
  beam(p, [x - sz * 0.08, y + 0.1, z + sx * 0.08], [x - sz * 0.1, y - 1.6, z + sx * 0.1], 0.025, 0x1c1c1f);
  return { x: head.x + sx * 0.1, y: head.y - 0.4, z: head.z + sz * 0.1, color: PAL.lampSodium, intensity: 6, distance: 9 };
}

export function buildLights(c: PCtx) {
  for (const road of STREETS) {
    const [s0, s1] = freeRange(road);
    const r = srng(road.id.length * 977 + Math.round(road.pts[0][0] * 13));
    const kinds = KINDS[road.id] ?? ['arm'];
    let side: 1 | -1 = r() < 0.5 ? 1 : -1;
    let i = 0;
    for (let s = s0 + 3 + r() * 3; s < s1 - 1; s += 16 + r() * 4, side = side === 1 ? -1 : 1, i++) {
      let p = lampSpot(c, road, s, side, s0, s1);
      if (!p) {
        // bolt it to the façade on this side (or the other) instead
        let done = false;
        for (const sd of [side, -side as 1 | -1]) {
          const q = edgePt(road, s, sd, 0.5);
          const f = c.obs.facade(q.x, q.z, 2.2, q.roadY, 5.4);
          if (!f) continue;
          const y = q.roadY + 4.5;
          if (f.top < y + 0.8) continue;
          // arm reaches from the wall to ~0.6 m over the road edge
          const reach = Math.hypot(f.x - q.x, f.z - q.z) + 0.5 + 0.6;
          const L = bracketLamp(c.tall, [f.x, y, f.z], q.yawIn, Math.min(2.2, reach), 9100 + i * 7 + road.width * 3);
          c.lamps.push(L);
          count(c, 'bracketLamps');
          mark(c, 'bracket:' + road.id, f.x, f.z);
          done = true;
          break;
        }
        if (!done) p = lampSpot(c, road, s, side === 1 ? -1 : 1, s0, s1);
        if (!p) continue;
      }
      const kind = kinds[i % kinds.length];
      // on the kerb the concrete footing sinks into it (only the base flange shows)
      const { lamp, collider } = streetLamp(c.tall, p.x, p.kerb ? p.y - 0.12 : p.y, p.z, p.yawIn, kind, 7000 + i * 31 + Math.round(s * 7));
      solid(c, collider);
      c.lamps.push(lamp);
      count(c, 'lamps');
      mark(c, 'lamp:' + road.id + (p.kerb ? ':kerb' : ''), p.x, p.z);

      // a bin beside every few lamps (on the strip, a step further along)
      if (i % 3 === 1) {
        for (const d of [1.1, -1.1, 1.8, -1.8]) {
          const q = propPt(road, p.s + d, p.side, 0.5);
          if (!stripOK(q, q.off) || c.obs.blocked(q.x, q.z, 0.55, q.y, q.y + 1)) continue;
          if (c.obs.structureDist(q.x, q.z, 1, 2) < 0.15) continue;
          const twin = i % 2 === 0 && c.obs.structureDist(q.x, q.z, 1.5, 2) > 1.2;
          solid(c, bin(c.small, q.x, q.y, q.z, PAL.roofGreen, { kind: twin ? 'twin' : 'drum', yaw: q.yawIn, seed: 300 + i }));
          count(c, 'bins');
          break;
        }
      }
    }
  }
}
