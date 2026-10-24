// Small street furniture beside the asphalt roads: green direction boards ('BHAGSUNAG 2', 'DHARAMKOT 3',
// 'TEMPLE RD'), a yellow 'SPEED BREAKER' board, white-and-yellow milestones, benches, red LPG cylinders and
// bottle crates against shop and house fronts, clusters of potted plants by the doors, and little roadside
// shrines (a few rounded stones smeared with orange sindoor, a trident with a red cloth, marigolds, a diya).
//
// Ground props stand just behind the kerb, or behind the open drain where there is one — never in it.
import { PAL } from '../../core/palette';
import { pick } from '../../core/math';
import type { Road } from '../layout';
import { groundY } from '../terrain';
import { bench, bin, crateStack, lpgCylinders, milestone, pottedPlant, signpost, srng } from '../../kit/street';
import { signSize, type SignSpec } from '../../kit/sign';
import { type PCtx, count, mark, solid } from './ctx';
import { KEEP } from './parking';
import {
  BHAGSU, DHARAMKOT, JOGIWARA, TEMPLE_RD, edgePt, freeRange, hasDrain, inDrain, postPt, propPt, stripOK,
  territoryOK,
} from './plan';

const GREEN = 0x2f7a4c, WHITE = 0xf3efe6, SIGN_YELLOW = 0xe8bf3a, INK = 0x23202a;
const SINDOOR = 0xd8551c, SINDOOR_DARK = 0xb5401a;

/** Search ±range along the road for the first s where test(s) succeeds. */
function near<T>(s: number, range: number, step: number, test: (s: number) => T | null): T | null {
  for (let k = 0; k <= Math.ceil(range / step) * 2; k++) {
    const v = test(s + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step);
    if (v) return v;
  }
  return null;
}

// ---- signs -----------------------------------------------------------------------------------------------
interface SignPlan { road: Road; s: number; side: 1 | -1; spec: SignSpec; face: 'back' | 'fwd' }

function placeSign(c: PCtx, P0: SignPlan) {
  const { w: bw } = signSize(P0.spec);
  let P = P0;
  const hw = Math.max(0.25, bw / 2 - 0.15) + 0.08; // post half-spread (+ footing)
  const tryAt = (s: number) => {
    const p = postPt(P.road, s, P.side);
    // on the kerb in front of a drain the board runs along it; on the verge it is turned a little toward
    // the traffic it is meant for, set back so both posts stay off the road
    const twist = p.kerb ? 0 : 0.2;
    const q = p.kerb ? p : edgePt(P.road, s, P.side, 0.32 + Math.sin(twist) * hw);
    if (!stripOK(q, q === p ? p.off : 0.3)) return null;
    const along = P.face === 'back' ? Math.atan2(-q.tx, -q.tz) : Math.atan2(q.tx, q.tz);
    const yaw = q.yawIn + Math.sign(angleTo(q.yawIn, along)) * twist;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const y = p.kerb ? q.y : groundY(q.x, q.z);
    if (!keepClear(q.x, q.z, 1)) return null;
    for (const t of [-hw, 0, hw]) {
      const x = q.x + cs * t, z = q.z - sn * t;
      if (!territoryOK(x, z) || c.obs.blocked(x, z, 0.1, y + 0.05, y + 3)) return null;
      if (c.obs.structureDist(x, z, 1, 2) < 0.12) return null;
      if (edgeOf(P.road, x, z) < (p.kerb ? 0.0 : 0.15)) return null;
      if (inDrain(P.road, x, z, 0.1)) return null;
    }
    // headroom for the board (balconies, awnings)
    if (c.obs.blocked(q.x, q.z, hw, y + 1.9, y + 3.0)) return null;
    const S = signpost(c.tall, q.x, y, q.z, yaw, P.spec);
    solid(c, S.collider);
    if (S.sign) c.signs.push(S.sign);
    mark(c, 'sign:' + P.spec.text, q.x, q.z);
    return true;
  };
  const done = near(P.s, 6, 0.5, tryAt);
  let ok = !!done;
  if (!ok) {
    // the other side of the road will do
    P = { ...P0, side: P0.side === 1 ? -1 : 1 };
    ok = !!near(P.s, 8, 0.5, (s) => tryAt(s));
  }
  count(c, ok ? 'signs' : 'signMissed:' + P.spec.text + '@' + P.road.id);
}

/** Clear of the quest spots (tea shop, puppy nook, shops)? */
const keepClear = (x: number, z: number, pad = 0) => KEEP.every((k) => Math.hypot(k.x - x, k.z - z) > k.r + pad);

/** Signed smallest angle from a to b. */
const angleTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** Distance from (x, z) to the edge of `road` (negative on it). */
function edgeOf(road: Road, x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best - road.width / 2;
}

export function buildSigns(c: PCtx) {
  const [b0] = freeRange(BHAGSU), [d0, d1] = freeRange(DHARAMKOT), [t0] = freeRange(TEMPLE_RD);
  const dir = (text: string): SignSpec => ({ text, bg: GREEN, fg: WHITE, glow: false, border: false, frame: 0xd8d4ca, h: 0.4 });
  const plans: SignPlan[] = [
    // direction boards just past the square, on the left (keep-left) side, readable for people leaving it
    { road: BHAGSU, s: b0 + 3, side: -1, spec: dir('BHAGSUNAG 2'), face: 'back' },
    { road: DHARAMKOT, s: d0 + 2.5, side: -1, spec: dir('DHARAMKOT 3'), face: 'back' },
    { road: TEMPLE_RD, s: t0 + 1.5, side: -1, spec: dir('TEMPLE RD'), face: 'back' },
    // and one coming back into town
    { road: BHAGSU, s: 68, side: 1, spec: dir('MCLEOD GANJ 1'), face: 'fwd' },
    // speed breaker ahead (Dharamkot Road climbs past Amala's house; Bhagsu Road past the tea shop)
    { road: DHARAMKOT, s: (d0 + d1) / 2 - 7, side: 1, spec: { text: 'SPEED BREAKER', bg: SIGN_YELLOW, fg: INK, glow: false, border: true, frame: 0x6f7378, h: 0.44 }, face: 'back' },
    { road: BHAGSU, s: 33, side: 1, spec: { text: 'SPEED BREAKER', bg: SIGN_YELLOW, fg: INK, glow: false, border: true, frame: 0x6f7378, h: 0.44 }, face: 'back' },
  ];
  for (const P of plans) placeSign(c, P);

  // milestones (white with a yellow cap): Bhagsu Road and Dharamkot Road, facing the road
  const ms: [Road, number, 1 | -1, number][] = [[BHAGSU, 52, 1, PAL.templeYellow], [DHARAMKOT, d1 - 12, -1, PAL.templeYellow], [JOGIWARA, 74, 1, 0x3f7a4c]];
  for (const [road, s, side] of ms) {
    const ok = near(s, 6, 0.5, (ss) => {
      const q = propPt(road, ss, side, 0.24);
      if (!stripOK(q, q.off) || c.obs.blocked(q.x, q.z, 0.34, q.y, q.y + 0.8)) return null;
      if (c.obs.structureDist(q.x, q.z, 1, 1.5) < 0.2) return null;
      solid(c, milestone(c.small, q.x, q.y - 0.02, q.z, q.yawIn));
      mark(c, 'milestone', q.x, q.z);
      // a fist-sized stone or two and a tuft of grass at its foot
      c.small.box(0.12, 0.07, 0.1, [q.x + q.tx * 0.32, q.y + 0.02, q.z + q.tz * 0.32], PAL.rockDark, { rot: [0, 0.6, 0] });
      c.small.box(0.14, 0.08, 0.05, [q.x - q.tx * 0.3, q.y + 0.03, q.z - q.tz * 0.3], PAL.grass, { rot: [0.2, 0.3, 0] });
      return true;
    });
    count(c, ok ? 'milestones' : 'milestoneMissed@' + road.id);
  }
}

// ---- benches -------------------------------------------------------------------------------------------
export function buildBenches(c: PCtx) {
  const r = srng(3131), rb = srng(3232);
  const want: [Road, number][] = [
    [BHAGSU, 26], [BHAGSU, 40], [BHAGSU, 64], [BHAGSU, 78],
    [DHARAMKOT, 20], [DHARAMKOT, 44], [DHARAMKOT, 56],
    [JOGIWARA, 70],
  ];
  for (const [road, s] of want) {
    const ok = near(s, 6, 0.5, (ss) => {
      for (const side of [r() < 0.5 ? 1 : -1, 0] as const) {
        const sd: 1 | -1 = side === 0 ? -1 : side;
        const q = propPt(road, ss, sd, 0.52);
        if (!stripOK(q, q.off) || !keepClear(q.x, q.z)) continue;
        if (c.obs.blocked(q.x, q.z, 0.9, q.y - 0.3, q.y + 1.2)) continue;
        if (c.obs.tagged(q.x, q.z, 2.2, 'door').length) continue; // not across somebody's doorway
        // level ground only (no bench teetering on a slope)
        const gy = [groundY(q.x + q.tx * 0.8, q.z + q.tz * 0.8), groundY(q.x - q.tx * 0.8, q.z - q.tz * 0.8)];
        if (Math.abs(gy[0] - gy[1]) > 0.18) continue;
        const y = Math.min(...gy, q.y);
        const kind = r() < 0.5 ? 'concrete' : 'wood';
        mark(c, 'bench', q.x, q.z);
        solid(c, bench(c.small, q.x, y, q.z, q.yawIn, kind === 'wood' ? pick(r, [PAL.woodTrim, 0x3f6f55, 0x2f5f8a]) : PAL.concrete, { kind, seed: 77 + Math.round(ss * 3) }));
        // a dustbin at one end of every other bench
        if (rb() < 0.6) {
          for (const d of [1.25, -1.25]) {
            const b = propPt(road, ss + d, sd, 0.5);
            const by = groundY(b.x, b.z);
            if (!stripOK(b, b.off) || c.obs.blocked(b.x, b.z, 0.3, by + 0.05, by + 1)) continue;
            solid(c, bin(c.small, b.x, by, b.z, PAL.roofGreen, { kind: 'drum', yaw: b.yawIn, seed: 410 + Math.round(ss) }));
            count(c, 'bins');
            break;
          }
        }
        return true;
      }
      return null;
    });
    count(c, ok ? 'benches' : 'benchesMissed');
  }
}

// ---- doorsteps: LPG cylinders, crates, potted plants against the fronts ---------------------------------------
interface Foot { x: number; z: number; y: number; yaw: number; ox: number; oz: number; tx: number; tz: number }

/** A spot at the foot of a façade near the road (within ~1.7 m of the edge), `depth` m deep, `half` m wide. */
function wallFoot(c: PCtx, road: Road, s: number, side: 1 | -1, depth: number, half: number): Foot | null {
  const q = edgePt(road, s, side, 0.6);
  const f = c.obs.facade(q.x, q.z, 1.6, q.roadY, 2.4);
  if (!f) return null;
  let ox = q.x - f.x, oz = q.z - f.z;
  const L = Math.hypot(ox, oz);
  if (L < 1e-3) return null;
  ox /= L; oz /= L;
  const x = f.x + ox * (depth / 2 + 0.03), z = f.z + oz * (depth / 2 + 0.03);
  const e = edgeOf(road, x, z);
  const minE = (hasDrain(road, s, side) ? 0.6 : 0.2) + depth / 2;
  if (e < minE || e > 1.9) return null;
  if (!territoryOK(x, z) || !keepClear(x, z)) return null;
  // never in front of a door (the building kit buries a 'door' marker in the wall)
  if (c.obs.tagged(x, z, Math.hypot(0.65 + half, 0.55), 'door').length) return null;
  // stand on a plinth / step in front of the wall when there is one
  const tx = -oz, tz = ox;
  const y = c.obs.floorAt(x, z, depth * 0.45, groundY(x, z));
  // (radii stay under the gap to the wall, or the wall itself would count as an obstacle)
  if (c.obs.blocked(x, z, depth * 0.45, y + 0.05, y + 1.2)) return null;
  for (const t of [-half, half]) {
    if (c.obs.blocked(x + tx * t, z + tz * t, depth * 0.45, y + 0.05, y + 1.2)) return null;
    if (Math.abs(c.obs.floorAt(x + tx * t, z + tz * t, 0.1, groundY(x + tx * t, z + tz * t)) - y) > 0.08) return null;
  }
  // and nothing standing right in front of it
  if (c.obs.blocked(x + ox * (depth / 2 + 0.25), z + oz * (depth / 2 + 0.25), 0.22, y + 0.05, y + 1.2)) return null;
  return { x, z, y, yaw: Math.atan2(ox, oz), ox, oz, tx, tz };
}

export function buildDoorsteps(c: PCtx) {
  const r = srng(4747);
  const roads = [BHAGSU, DHARAMKOT, JOGIWARA, TEMPLE_RD];
  const want = { lpg: 6, crates: 6, plants: 9 };
  const got = { lpg: 0, crates: 0, plants: 0 };
  const used: { x: number; z: number }[] = [];
  const far = (x: number, z: number, d: number) => used.every((u) => Math.hypot(u.x - x, u.z - z) > d);
  for (const road of roads) {
    const [s0, s1] = freeRange(road);
    for (let s = s0 + 2 + r() * 3; s < s1 - 2; s += 1.5 + r() * 1.5) {
      const first: 1 | -1 = r() < 0.5 ? 1 : -1;
      const roll = r();
      // houses on Dharamkot / Bhagsu get plants; the shop roads get crates and gas
      const resi = road === DHARAMKOT || road === BHAGSU;
      const kind = roll < (resi ? 0.6 : 0.3) ? 'plants' : roll < 0.78 ? 'lpg' : 'crates';
      if (got[kind] >= want[kind]) continue;
      const depth = kind === 'plants' ? 0.42 : kind === 'lpg' ? 0.66 : 0.4;
      const half = kind === 'plants' ? 0.45 : kind === 'lpg' ? 0.36 : 0.5;
      const F = wallFoot(c, road, s, first, depth, half) ?? wallFoot(c, road, s, first === 1 ? -1 : 1, depth, half);
      if (!F || !far(F.x, F.z, 6)) continue;
      used.push({ x: F.x, z: F.z });
      const seed = 900 + got.lpg * 7 + got.crates * 13 + got.plants * 29 + Math.round(s);
      if (kind === 'lpg') {
        const n = 2 + Math.floor(r() * 4);
        solid(c, lpgCylinders(c.small, F.x, F.y, F.z, n, seed));
        // an empty one lying on its side now and then
        if (r() < 0.4) {
          const x = F.x + F.tx * 0.5, z = F.z + F.tz * 0.5;
          c.small.cyl(0.15, 0.15, 0.5, [x, F.y + 0.15, z], 0xa8322a, 10, { rot: [Math.PI / 2, F.yaw + Math.PI / 2, 0] });
          c.small.cyl(0.08, 0.08, 0.1, [x + F.tx * 0.3, F.y + 0.15, z + F.tz * 0.3], 0xa8322a, 8, { rot: [Math.PI / 2, F.yaw + Math.PI / 2, 0] });
          solid(c, { x, z, w: 0.62, d: 0.32, rot: F.yaw + Math.PI / 2, y0: F.y, y1: F.y + 0.3, tag: 'lpg' });
        }
      } else if (kind === 'crates') {
        solid(c, crateStack(c.small, F.x, F.y, F.z, F.yaw + (r() - 0.5) * 0.2, seed));
        if (r() < 0.5) {
          const x = F.x + F.tx * 0.62, z = F.z + F.tz * 0.62;
          if (!c.obs.blocked(x, z, 0.3, F.y + 0.05, F.y + 1)) solid(c, crateStack(c.small, x, F.y, z, F.yaw + (r() - 0.5) * 0.3, seed + 1));
        }
      } else {
        // a little crowd of pots along the wall, a tall one at the back, some raised on a brick
        const n = 3 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const t = (i / Math.max(1, n - 1) - 0.5) * half * 1.8 + (r() - 0.5) * 0.08;
          const back = i % 2 ? 0.08 : -0.06;
          const x = F.x + F.tx * t - F.ox * back, z = F.z + F.tz * t - F.oz * back;
          let y = groundY(x, z);
          if (r() < 0.25) { c.small.box(0.24, 0.1, 0.12, [x, y + 0.05, z], 0x9a4a32, { rot: [0, F.yaw, 0] }); y += 0.1; }
          pottedPlant(c.small, x, y, z, seed + i * 3);
        }
        solid(c, { x: F.x, z: F.z, w: half * 2 + 0.3, d: 0.42, rot: F.yaw, y0: F.y, y1: F.y + 0.45, tag: 'plant' });
      }
      got[kind]++;
      mark(c, kind, F.x, F.z);
      count(c, kind);
    }
  }
}

// ---- roadside shrines ---------------------------------------------------------------------------------------
/** A few rounded stones on a little stone plinth, smeared with sindoor; trident, red cloth, marigolds, diya. */
function shrine(c: PCtx, x: number, y: number, z: number, yaw: number, seed: number) {
  const r = srng(seed);
  const p = c.small;
  p.group([x, y, z], yaw, () => {
    // dry-stone plinth with a whitewashed top
    p.box(0.7, 0.18, 0.5, [0, 0.04, 0], PAL.rockDark, { rot: [0, 0.05, 0] });
    p.box(0.66, 0.06, 0.46, [0, 0.16, 0], PAL.templeWhite);
    // the stones: one tall rounded (smeared orange), two smaller, one plain
    p.cyl(0.08, 0.11, 0.22, [0, 0.19, -0.06], SINDOOR, 7);
    p.cyl(0.04, 0.08, 0.06, [0, 0.41, -0.06], SINDOOR, 7);
    p.box(0.05, 0.03, 0.01, [0, 0.33, 0.04], 0xf3efe6); // 1-px silver eyes / tilak
    p.cyl(0.06, 0.08, 0.13, [-0.2, 0.19, 0.02], SINDOOR_DARK, 6);
    p.cyl(0.05, 0.07, 0.1, [0.19, 0.19, 0.04], SINDOOR, 6);
    p.box(0.1, 0.07, 0.09, [0.24, 0.22, -0.12], PAL.rock, { rot: [0.2, 0.7, 0.1] });
    // trident (trishul) planted behind, a red-and-gold cloth knotted to it, and a tiny bell
    p.box(0.025, 0.9, 0.025, [0.12, 0.6, -0.16], 0x3a3a3e);
    p.box(0.2, 0.025, 0.025, [0.12, 0.98, -0.16], 0x3a3a3e);
    for (const sx of [-0.09, 0, 0.09]) p.box(0.025, 0.12, 0.025, [0.12 + sx, 1.05, -0.16], 0x3a3a3e);
    p.box(0.1, 0.26, 0.012, [0.17, 0.78, -0.15], 0xb52a2a, { rot: [0.05, 0, 0.12] });
    p.box(0.1, 0.02, 0.014, [0.17, 0.66, -0.15], PAL.gold, { rot: [0.05, 0, 0.12] });
    p.cyl(0.03, 0.04, 0.05, [0.04, 0.84, -0.16], PAL.goldDeep, 6);
    // marigolds strewn on the plinth and a clay diya
    for (let i = 0; i < 6; i++) p.box(0.05, 0.04, 0.05, [(r() - 0.5) * 0.5, 0.2, 0.08 + (r() - 0.3) * 0.12], pick(r, [0xe0801e, 0xe8a82a, 0xc8641c]));
    p.cyl(0.05, 0.035, 0.03, [-0.08, 0.19, 0.15], 0x9a4a32, 6);
    p.box(0.015, 0.03, 0.015, [-0.08, 0.235, 0.15], PAL.butterFlame, { emit: PAL.butterFlame, emitIntensity: 1.5, emitNight: true });
    // incense sticks
    for (const sx of [0.08, 0.11]) p.box(0.01, 0.2, 0.01, [sx, 0.28, 0.16], 0x5a2a20, { rot: [0.15, 0, sx - 0.1] });
  });
  solid(c, { x, z, w: 0.72, d: 0.52, rot: yaw, y0: y, y1: y + 0.45, tag: 'shrine' });
}

export function buildShrines(c: PCtx) {
  const want: [Road, number][] = [[DHARAMKOT, 28], [DHARAMKOT, 62], [BHAGSU, 72], [JOGIWARA, 60]];
  want.forEach(([road, s], i) => {
    const ok = near(s, 14, 0.5, (ss) => {
      for (const [side, extra] of [[1, 0.05], [-1, 0.05], [1, 0.6], [-1, 0.6]] as const) {
        const q = propPt(road, ss, side, 0.55, extra);
        if (!stripOK(q, q.off)) continue;
        if (c.obs.blocked(q.x, q.z, 0.75, q.y - 0.2, q.y + 1.2)) continue;
        if (c.obs.structureDist(q.x, q.z, 1, 2) < 0.25) continue;
        // prefer the foot of a tree or a wall (shrines sit against something), but take open verge too
        const yaw = q.yawIn;
        shrine(c, q.x, groundY(q.x, q.z) - 0.04, q.z, yaw, 61 + i * 17);
        mark(c, 'shrine', q.x, q.z);
        return true;
      }
      return null;
    });
    count(c, ok ? 'shrines' : 'shrineMissed@' + road.id + s);
  });
}
