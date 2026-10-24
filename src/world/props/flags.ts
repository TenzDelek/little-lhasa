// Lungta strung high across the roads (6–9 m): dense over Temple Road and the upper Jogiwara Road, a few over
// Bhagsu and Dharamkot Road, tied to rooftops / façades, power poles or slim bamboo flag poles; and long lines
// running down the hillside off Dharamkot Road from tall poles at the road edge to trees and stone cairns
// below. Some strings are brand new, many sun-bleached, a few in tatters.
import type { V3 } from '../../core/geom';
import { PAL } from '../../core/palette';
import { pick } from '../../core/math';
import { groundY, worldMask, roadQuery } from '../terrain';
import { srng, beam } from '../../kit/street';
import type { FlagLine } from '../../kit/flags';
import { type PCtx, count, solidCircle } from './ctx';
import { DHARAMKOT, JOGIWARA, TEMPLE_RD, BHAGSU, edgePt, freeRange, stripOK, territoryOK, type EdgePt } from './plan';
import { safeSag } from './power';
import type { Road } from '../layout';

/** Age: a third new, a third faded, a third old and tattered. */
const ageOf = (r: () => number) => { const k = r(); return k < 0.32 ? r() * 0.18 : k < 0.68 ? 0.3 + r() * 0.3 : 0.65 + r() * 0.35; };

/**
 * Slim bamboo / timber flag pole (7.5–9.5 m) on the edge strip: lashed joints, a khata at head height, a
 * rag tuft at the top. Returns the tie point near the top.
 */
export function flagPole(c: PCtx, p: EdgePt, H: number, seed: number): V3 {
  const r = srng(seed);
  const bamboo = r() < 0.6;
  const col = bamboo ? pick(r, [0xb59a62, 0xa88c58, 0x9c8452]) : pick(r, [PAL.barkLight, 0x7a6a52]);
  const { x, y, z } = p;
  const lean = (r() - 0.5) * 0.05, lean2 = (r() - 0.5) * 0.05;
  c.tall.groupEuler([x, y, z], [lean, 0, lean2], () => {
    c.tall.box(0.26, 0.22, 0.26, [0, 0.05, 0], PAL.rockDark, { rot: [0, r() * 3, 0] }); // stones round the foot
    c.tall.box(0.2, 0.16, 0.2, [0.12, 0.06, -0.08], PAL.rock, { rot: [0.2, r() * 3, 0.1] });
    c.tall.cyl(0.035, 0.055, H, [0, -0.2, 0], col, 6);
    if (bamboo) for (let k = 1; k < H / 1.4; k++) c.tall.cyl(0.058 - k * 0.002, 0.058 - k * 0.002, 0.04, [0, k * 1.4, 0], 0x7a6a42, 6);
    // khata tied at head height
    c.tall.cyl(0.062, 0.062, 0.08, [0, 1.75, 0], 0xf2efe6, 6);
    c.tall.box(0.06, 0.4, 0.012, [0.05, 1.52, 0.03], 0xeeeae0, { rot: [0.1, 0.5, 0.08] });
    // rag tuft + little finial
    c.tall.box(0.12, 0.18, 0.02, [0.07, H - 0.35, 0], pick(r, PAL.lungta), { rot: [0, r() * 3, 0.2] });
    c.tall.cone(0.04, 0.16, [0, H - 0.2, 0], PAL.gold, 5);
  });
  solidCircle(c, { x, z, r: 0.12, y0: y - 0.2, y1: y + H, tag: 'flagpole' });
  c.anchors.push({ x, z, y, top: y + H - 0.4, kind: 'flagpole', road: p.road.id, s: p.s });
  count(c, 'flagPoles');
  return [x + lean2 * -H * 0.5, y + H - 0.45, z + lean * H * 0.5];
}

function flagPoleSpot(c: PCtx, road: Road, s: number, side: 1 | -1): EdgePt | null {
  for (let k = 0; k <= 8; k++) {
    const ss = s + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
    const p = edgePt(road, ss, side, 0.3);
    if (!stripOK(p, 0.3)) continue;
    if (c.obs.blocked(p.x, p.z, 0.28, p.y, p.y + 9)) continue;
    if (c.obs.structureDist(p.x, p.z, 1.5, 2.5) < 0.85) continue;
    return p;
  }
  return null;
}

/** Tie point on one side of the road near s at height ~roadY + h, or null. */
function attach(c: PCtx, road: Road, s: number, side: 1 | -1, h: number): V3 | null {
  const q = edgePt(road, s, side, 0.5);
  const f = c.obs.facade(q.x, q.z, 2.6, q.roadY, 5.6);
  if (f) {
    const y = Math.min(f.top - 0.25, q.roadY + h);
    if (y >= q.roadY + 5.4) return [f.x, y, f.z];
  }
  let best: V3 | null = null, bd = 2.6;
  for (const a of c.anchors) {
    if (a.road !== road.id) continue;
    const d = Math.hypot(a.x - q.x, a.z - q.z);
    if (d > bd) continue;
    // on the right side of the road?
    if ((a.x - q.x) * q.ox + (a.z - q.z) * q.oz < -1.5) continue;
    bd = d;
    best = [a.x, a.kind === 'pole' ? a.y + 6.3 : a.top, a.z];
  }
  return best;
}

interface Zone { road: Road; a: number; b: number; step: [number, number]; h: [number, number]; poles: boolean; diag: number }

export function buildRoadFlags(c: PCtx) {
  const r = srng(6161);
  const [t0, t1] = freeRange(TEMPLE_RD), [j0, j1] = freeRange(JOGIWARA);
  const [b0, b1] = freeRange(BHAGSU), [d0, d1] = freeRange(DHARAMKOT);
  const zones: Zone[] = [
    { road: TEMPLE_RD, a: t0 + 1, b: t1 - 3, step: [3.0, 4.6], h: [6.2, 8.8], poles: true, diag: 5 },
    { road: JOGIWARA, a: j0 + 1, b: 46, step: [3.4, 5.2], h: [6.2, 8.6], poles: true, diag: 5 },
    { road: JOGIWARA, a: 50, b: j1 - 2, step: [9, 13], h: [6, 8], poles: false, diag: 3 },
    { road: BHAGSU, a: b0 + 2, b: b1 - 2, step: [9, 15], h: [6, 8], poles: false, diag: 4 },
    { road: DHARAMKOT, a: d0 + 2, b: d1 - 3, step: [8, 13], h: [6, 8.2], poles: true, diag: 4 },
  ];
  for (const zn of zones) {
    let lastPole = -99;
    for (let s = zn.a + r() * 2; s < zn.b; s += zn.step[0] + r() * (zn.step[1] - zn.step[0])) {
      const h = zn.h[0] + r() * (zn.h[1] - zn.h[0]);
      const sB = s + (r() - 0.5) * 2 * zn.diag;
      let A = attach(c, zn.road, s, -1, h + (r() - 0.5) * 0.8);
      let B = attach(c, zn.road, sB, 1, h + (r() - 0.5) * 0.8);
      if ((!A || !B) && zn.poles && s - lastPole > 7 && (A || B || r() < 0.5)) {
        // plant a bamboo pole on the bare side
        const side: 1 | -1 = !A ? -1 : 1;
        const p = flagPoleSpot(c, zn.road, side === -1 ? s : sB, side);
        if (p) {
          const top = flagPole(c, p, 7.6 + r() * 1.6, 777 + Math.round(p.x * 13 + p.z * 7));
          if (side === -1) A = top; else B = top;
          lastPole = s;
        }
      }
      if (!A || !B) continue;
      const span = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      if (span < 3 || span > 17) continue;
      const sag = safeSag(A, B, span * (0.05 + r() * 0.05), 5.0);
      if (sag < 0) continue;
      c.flags.push({ a: A, b: B, sag, age: ageOf(r), size: 0.21 + r() * 0.05, spacing: 0.27 + r() * 0.07, seed: Math.floor(r() * 1e6) });
      count(c, 'flagLines');
      // dense stretches: often a second string from the same tie point, fanning out
      if (zn.poles && r() < 0.35) {
        const s2 = sB + (r() < 0.5 ? -1 : 1) * (2 + r() * 3);
        const C2 = attach(c, zn.road, s2, 1, h - 0.6);
        if (C2) {
          const sp2 = Math.hypot(C2[0] - A[0], C2[2] - A[2]);
          const sg2 = safeSag(A, C2, sp2 * 0.07, 5.0);
          if (sp2 > 3 && sp2 < 17 && sg2 > 0) {
            c.flags.push({ a: A, b: C2, sag: sg2, age: ageOf(r), size: 0.22, seed: Math.floor(r() * 1e6) });
            count(c, 'flagLines');
          }
        }
      }
    }
  }
}

/** Long strings down the hillside below Dharamkot Road: pole at the road edge → trees / cairns on the slope. */
export function buildHillFlags(c: PCtx) {
  const r = srng(9393);
  const road = DHARAMKOT;
  const [s0, s1] = freeRange(road);
  for (let s = s0 + 8; s < s1 - 6; s += 12 + r() * 6) {
    // downhill side: the side whose ground 9 m out is lower
    const L = edgePt(road, s, -1, 9), R = edgePt(road, s, 1, 9);
    const side: 1 | -1 = L.y < R.y ? -1 : 1;
    const p = flagPoleSpot(c, road, s, side);
    if (!p) continue;
    const top = flagPole(c, p, 8.4 + r() * 1.2, 4321 + Math.round(s * 11));
    const lines: FlagLine[] = [];
    // trees down the slope
    const trees = c.obs.circles(p.x, p.z, 22, 'hillside-tree').filter((t) => {
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      return d > 6 && (dx * p.ox + dz * p.oz) / d > 0.45 && t.y1 - groundY(t.x, t.z) > 2.5;
    });
    trees.sort(() => r() - 0.5);
    for (const t of trees.slice(0, 2)) {
      const b: V3 = [t.x - (t.x - p.x) * 0.03, t.y1 - 0.5, t.z - (t.z - p.z) * 0.03];
      const span = Math.hypot(b[0] - top[0], b[1] - top[1], b[2] - top[2]);
      lines.push({ a: top, b, sag: span * (0.04 + r() * 0.03), age: ageOf(r), size: 0.24, seed: Math.floor(r() * 1e6) });
    }
    // cairns on the open slope
    const want = 4 - lines.length;
    const base = Math.atan2(p.oz, p.ox);
    for (let k = 0, made = 0; k < 12 && made < want; k++) {
      const a = base + (r() - 0.5) * 1.9, d = 11 + r() * 9;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (worldMask(x, z) < 0.7 || !territoryOK(x, z, 1)) continue;
      if (roadQuery(x, z).edge < 2) continue;
      if (c.obs.blocked(x, z, 0.6, groundY(x, z) - 1, groundY(x, z) + 6)) continue;
      if (c.obs.structureDist(x, z, 2, 2) < 1.5) continue;
      const gy = groundY(x, z);
      const b: V3 = [x, gy + 0.35, z];
      const span = Math.hypot(b[0] - top[0], b[1] - top[1], b[2] - top[2]);
      lines.push({ a: top, b, sag: span * (0.03 + r() * 0.03), age: ageOf(r), size: 0.24, seed: Math.floor(r() * 1e6) });
      // small cairn + stake the string is tied to
      for (let q = 0; q < 4; q++) {
        const sz = 0.14 + r() * 0.12;
        c.small.box(sz, sz * 0.7, sz, [x + (r() - 0.5) * 0.3, gy + sz * 0.25, z + (r() - 0.5) * 0.3], pick(r, [PAL.rock, PAL.rockDark, PAL.templeWhite, PAL.slateLight]), { rot: [r() * 0.4, r() * 3, r() * 0.3] });
      }
      beam(c.small, [x, gy - 0.1, z], [x, gy + 0.45, z], 0.04, PAL.barkLight);
      made++;
    }
    if (lines.length) { c.flags.push(...lines); count(c, 'hillFlagLines', lines.length); }
  }
}
