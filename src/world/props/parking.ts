// Roadside parking bays along Bhagsu Road and the lower Jogiwara Road: rows of Activa-style scooters and the
// odd Royal Enfield backed in at an angle with their rear wheels against the kerb, a few small Marutis parked
// parallel, and a blue water tanker delivering to a house (its hose snakes over the kerb to the door).
//
// Every bay keeps at least 2/3 of the road clear: its depth from the road edge is ≤ width / 3, and the
// opposite side is left free over the same stretch. Bays avoid other modules' solids, steps and the quest
// spots (tea shop, puppy nook, shops), and every vehicle registers a collider.
import { Vector3 } from 'three';
import type { Parts, V3 } from '../../core/geom';
import { SPOTS, roadFrame, type Road } from '../layout';
import { groundY } from '../terrain';
import { motorbike, scooter, srng } from '../../kit/street';
import { alto, omni, swift, tanker, type CarDims } from './cars';
import { type PCtx, count, mark, solid } from './ctx';
import { BHAGSU, JOGIWARA, edgePt, freeRange, onZebra, territoryOK } from './plan';
import { beam } from '../../kit/street';

type Kind = 'scooter' | 'enfield' | 'alto' | 'swift' | 'omni' | 'tanker';
interface Group { road: Road; s: number; side: 1 | -1; items: Kind[] }

const BIKE: Record<'scooter' | 'enfield', { L: number; W: number; H: number; theta: number; pitch: number }> = {
  scooter: { L: 1.72, W: 0.64, H: 1.05, theta: 1.0, pitch: 0.8 },
  enfield: { L: 2.12, W: 0.8, H: 1.1, theta: 0.62, pitch: 1.0 },
};
const CAR_LEN: Record<'alto' | 'swift' | 'omni' | 'tanker', number> = { alto: 3.44, swift: 3.86, omni: 3.37, tanker: 5.3 };
const CAR_W: Record<'alto' | 'swift' | 'omni' | 'tanker', number> = { alto: 1.48, swift: 1.64, omni: 1.4, tanker: 1.86 };

/** Places nobody should have to squeeze past a parked car to reach. */
export const KEEP: { x: number; z: number; r: number }[] = [
  { ...SPOTS.teaShop, r: 5.5 }, { ...SPOTS.puppyHideout, r: 4.5 }, { ...SPOTS.thangkaShop, r: 4 },
  { ...SPOTS.laphingStall, r: 4 }, { ...SPOTS.bookShop, r: 4 },
];

const S: Group[] = [];
function plan(): Group[] {
  if (S.length) return S;
  const B = BHAGSU, J = JOGIWARA;
  // (Bhagsu Road s ≈ 14–29 is under a stray zebra band of the Dharamkot crossing; bends at 18, 38, 59;
  //  Jogiwara bends at 19.7, 38.7, 57.1)
  S.push(
    { road: B, s: 30.5, side: -1, items: ['scooter', 'scooter', 'enfield', 'scooter'] },
    { road: B, s: 39.6, side: 1, items: ['alto'] },
    { road: B, s: 45.2, side: 1, items: ['tanker'] },
    { road: B, s: 53, side: 1, items: ['scooter', 'scooter', 'scooter'] },
    { road: B, s: 60.5, side: -1, items: ['enfield', 'scooter', 'scooter'] },
    { road: B, s: 65.5, side: 1, items: ['swift'] },
    { road: B, s: 71, side: -1, items: ['omni'] },
    { road: B, s: 76, side: 1, items: ['scooter', 'enfield', 'scooter'] },
    { road: J, s: 45.5, side: -1, items: ['scooter', 'scooter', 'scooter'] },
    { road: J, s: 51.2, side: 1, items: ['alto'] },
    { road: J, s: 59, side: -1, items: ['enfield', 'scooter', 'scooter'] },
    { road: J, s: 64, side: 1, items: ['scooter', 'scooter'] },
    { road: J, s: 69.5, side: -1, items: ['omni'] },
  );
  return S;
}

interface Slot { kind: Kind; s: number; inset: number; rel: number; L: number; W: number; H: number }

/** Lay a group out along the kerb from arc length s0 (side, road): slots with lateral inset and relative yaw. */
function layout(road: Road, side: 1 | -1, s0: number, items: Kind[], r: () => number): { slots: Slot[]; len: number; depth: number } {
  const maxDepth = road.width / 3 - 0.03;
  const dir = side === -1 ? 1 : -1; // keep left: noses point the way the traffic on this side flows
  const slots: Slot[] = [];
  let s = s0, depth = 0;
  for (const k of items) {
    if (k === 'scooter' || k === 'enfield') {
      const b = BIKE[k];
      // steepest angle (≤ preferred) whose footprint stays inside the bay depth
      let th = b.theta + (r() - 0.5) * 0.12;
      for (let it = 0; it < 12 && b.L * Math.sin(th) + b.W * Math.cos(th) + 0.06 > maxDepth; it++) th -= 0.06;
      const d = b.L * Math.sin(th) + b.W * Math.cos(th) + 0.06;
      const along = b.W / Math.sin(th) * 0.86 + 0.1;
      s += along / 2;
      // forward (local road frame: x = inward when side = +1 … see build) → relative yaw
      slots.push({ kind: k, s, inset: d / 2, rel: Math.atan2(side * Math.sin(th) * 1, dir * Math.cos(th)), L: b.L, W: b.W, H: b.H });
      s += along / 2;
      depth = Math.max(depth, d);
    } else {
      const L = CAR_LEN[k], W = CAR_W[k];
      s += 0.35 + L / 2;
      slots.push({ kind: k, s, inset: W / 2 + 0.1, rel: dir === 1 ? 0 : Math.PI, L, W, H: 1.6 });
      s += L / 2 + 0.35;
      depth = Math.max(depth, W + 0.1);
    }
  }
  return { slots, len: s - s0, depth };
}

/** World pose of a slot: centre, road yaw, slope pitch. */
function pose(road: Road, side: 1 | -1, sl: Slot) {
  const f = roadFrame(road, sl.s);
  const d = road.width / 2 - sl.inset;
  const x = f.x + f.nx * side * d, z = f.z + f.nz * side * d;
  const a = roadFrame(road, sl.s - 1), b = roadFrame(road, sl.s + 1);
  const k = (b.y - a.y) / 2;
  return { x, z, y: groundY(x, z), yaw: f.yaw, pitch: -Math.atan(k), wyaw: f.yaw + sl.rel };
}

/** Circles covering a rotated rectangle (for the obstacle test). */
function footprint(x: number, z: number, yaw: number, L: number, W: number) {
  const n = Math.max(1, Math.round(L / W));
  const out: [number, number, number][] = [];
  const sx = Math.sin(yaw), sz = Math.cos(yaw);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (L - W);
    out.push([x + sx * t, z + sz * t, W / 2]);
  }
  return out;
}

const taken: { road: Road; side: number; a: number; b: number }[] = [];

function fits(c: PCtx, road: Road, side: 1 | -1, s0: number, s1: number, lim: [number, number], lay: ReturnType<typeof layout>): boolean {
  if (s0 < lim[0] || s1 > lim[1]) return false;
  // not across a bend of the centre line (the kerb-side slots would bunch up / fan out there)
  let acc = 0;
  for (let i = 1; i < road.pts.length - 1; i++) {
    acc += Math.hypot(road.pts[i][0] - road.pts[i - 1][0], road.pts[i][1] - road.pts[i - 1][1]);
    if (acc > s0 - 1.2 && acc < s1 + 1.2) return false;
  }
  // the opposite side of this stretch stays free (≥ 2/3 of the width clear), and bays don't overlap
  for (const t of taken) {
    if (t.road !== road) continue;
    if (t.a < s1 + 1.2 && t.b > s0 - 1.2) return false;
  }
  for (let s = s0; s <= s1; s += 0.5) {
    const e = edgePt(road, s, side, 0.4);
    if (!territoryOK(e.x, e.z)) return false;
    const m = edgePt(road, s, side, -1);
    if (onZebra(m.x, m.z)) return false;
    for (const K of KEEP) if (Math.hypot(K.x - e.x, K.z - e.z) < K.r) return false;
    // keep steps / gates / doorways onto the road clear
    for (const tg of ['step', 'stairs', 'gate']) if (c.obs.tagged(e.x, e.z, 1.4, tg).length) return false;
    // anything of another module's standing on the far side's road edge here?
    const o = edgePt(road, s, side === 1 ? -1 : 1, -0.5);
    if (c.obs.blocked(o.x, o.z, 0.4, o.y + 0.1, o.y + 1.6)) return false;
  }
  for (const sl of lay.slots) {
    const P = pose(road, side, sl);
    for (const [x, z, rr] of footprint(P.x, P.z, P.wyaw, sl.L, sl.W)) {
      if (c.obs.blocked(x, z, rr * 0.95, P.y + 0.15, P.y + sl.H)) return false;
    }
  }
  return true;
}

export function buildParking(c: PCtx) {
  taken.length = 0;
  const lims = new Map<Road, [number, number]>();
  const lim = (road: Road): [number, number] => {
    if (!lims.has(road)) {
      const [a, b] = freeRange(road);
      lims.set(road, road === JOGIWARA ? [Math.max(a, 44), b - 1.5] : [a + 2, b - 2]);
    }
    return lims.get(road)!;
  };
  plan().forEach((g, gi) => {
    const r = srng(5150 + gi * 37);
    let placed = false;
    for (const side of [g.side, g.side === 1 ? -1 : 1] as const) {
      for (let k = 0; k <= 14 && !placed; k++) {
        const s0 = g.s + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
        const lay = layout(g.road, side, s0, g.items, srng(9000 + gi * 13));
        if (!fits(c, g.road, side, s0, s0 + lay.len, lim(g.road), lay)) continue;
        taken.push({ road: g.road, side, a: s0, b: s0 + lay.len });
        lay.slots.forEach((sl, i) => drawSlot(c, g.road, side, sl, 600 + gi * 17 + i * 5, r));
        count(c, 'bays');
        placed = true;
      }
      if (placed) break;
    }
  });
}

function drawSlot(c: PCtx, road: Road, side: 1 | -1, sl: Slot, seed: number, r: () => number) {
  const P = pose(road, side, sl);
  // tall vehicles dissolve in front of the boy; bikes stay solid
  const p: Parts = sl.kind === 'tanker' || sl.kind === 'omni' ? c.tall : c.small;
  let dims: CarDims = { L: sl.L, W: sl.W, H: sl.H };
  p.group([P.x, P.y, P.z], P.yaw, () => p.groupEuler([0, 0, 0], [P.pitch, 0, 0], () => p.group([0, 0, 0], sl.rel, () => {
    switch (sl.kind) {
      case 'scooter': scooter(p, 0, 0, 0, 0, seed); break;
      case 'enfield': motorbike(p, 0, 0, 0, 0, seed); break;
      case 'alto': dims = alto(p, seed); break;
      case 'swift': dims = swift(p, seed); break;
      case 'omni': dims = omni(p, seed); break;
      case 'tanker': dims = tanker(p, seed); break;
    }
    // a helmet hung on a mirror / left on the seat now and then
    if ((sl.kind === 'scooter' || sl.kind === 'enfield') && r() < 0.3) {
      const col = [0x2a2a2e, 0xc8322b, 0xeeeae0, 0x2f5f9a][Math.floor(r() * 4)];
      p.cyl(0.13, 0.15, 0.16, [0, sl.kind === 'scooter' ? 0.84 : 0.99, -0.42], col, 8);
      p.box(0.18, 0.05, 0.04, [0, sl.kind === 'scooter' ? 0.9 : 1.05, -0.28], 0x26323c);
    }
  })));
  solid(c, { x: P.x, z: P.z, w: dims.W, d: dims.L, rot: P.wyaw, y0: P.y, y1: P.y + dims.H, tag: 'vehicle' });
  count(c, sl.kind);
  mark(c, sl.kind, P.x, P.z);
  if (sl.kind === 'tanker') hose(c, road, side, sl, P);
}

/** The tanker's delivery hose: from the rear valve down to the road, over the kerb, to the nearest door. */
function hose(c: PCtx, road: Road, side: 1 | -1, sl: Slot, P: ReturnType<typeof pose>) {
  const rear = sl.s + (sl.rel === 0 ? -1 : 1) * (sl.L / 2 - 0.3);
  const f = roadFrame(road, rear);
  const out = c.obs.facade(f.x + f.nx * side * (road.width / 2 + 0.6), f.z + f.nz * side * (road.width / 2 + 0.6), 4.5, f.y, 2.5);
  if (!out) return;
  const sx = Math.sin(P.wyaw), sz = Math.cos(P.wyaw), lx = Math.cos(P.wyaw), lz = -Math.sin(P.wyaw);
  const vz = -sl.L / 2 - 0.15, vx = 0.45;
  const valve: V3 = [P.x + sx * vz + lx * vx, P.y + 0.95, P.z + sz * vz + lz * vx];
  const pts: V3[] = [valve];
  const g0: V3 = [valve[0] - sx * 0.25, P.y + 0.05, valve[2] - sz * 0.25];
  pts.push(g0);
  const end: V3 = [out.x, groundY(out.x, out.z) + 0.06, out.z];
  const n = 7;
  const v = new Vector3();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    v.set(g0[0] + (end[0] - g0[0]) * t, 0, g0[2] + (end[2] - g0[2]) * t);
    const wig = Math.sin(t * 7.0) * 0.18 * (1 - t);
    v.x += lx * wig; v.z += lz * wig;
    // lift over the kerb (it sits 0.10 m proud just behind the road edge)
    const e = Math.abs(roadDistLat(road, v.x, v.z));
    const y = groundY(v.x, v.z) + 0.05 + (e > road.width / 2 - 0.05 && e < road.width / 2 + 0.25 ? 0.1 : 0);
    pts.push([v.x, y, v.z]);
  }
  for (let i = 1; i < pts.length; i++) beam(c.small, pts[i - 1], pts[i], 0.06, 0x2a2a2e);
  count(c, 'hoses');
}

/** Distance of (x, z) from a road's centre line (unsigned, nearest segment). */
function roadDistLat(road: Road, x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
