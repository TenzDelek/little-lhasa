// Street-dressing plan helpers: which stretches of road edge belong to this module, frames on the edge strip,
// and a snapshot of every OTHER module's colliders (taken a few frames after load) so lamps, poles and parked
// bikes slot into the gaps between shops, stalls and railings instead of clipping through them.
//
// Territory (see the brief): the road-edge strip (road edge → +0.5 m) of the four asphalt roads outside the
// plazas and outside the square / temple / market-lane areas, the air above 4.5 m over those roads, and
// parking bays on the road surface along the kerb.
import { PLAZAS, ROADS, roadById, roadFrame, roadLength, type Road } from '../layout';
import { groundY, plazaQuery } from '../terrain';
import { collision, type BoxCollider, type Collider } from '../../core/collision';
import type { BoxInit, CircleInit } from '../../core/collision';
import { clamp } from '../../core/math';
import type { V3 } from '../../core/geom';
import { sampleFields, type FieldSample } from '../ground/fields';

export const STREETS = ROADS.filter((r) => r.kind === 'road');
export const TEMPLE_RD = roadById('temple-road');
export const JOGIWARA = roadById('jogiwara-road');
export const BHAGSU = roadById('bhagsu-road');
export const DHARAMKOT = roadById('dharamkot-road');
const LANE = roadById('market-lane');
const KORA = roadById('kora-path');

/** Main-square rect expanded by 9 m (square builder's territory). */
const SQUARE_T = [-22, -19, 23, 19] as const;
/** Temple court expanded by 3 m (temple builder's territory). */
const TEMPLE_T = [-13, 90, 30, 130] as const;

export const inRect = (r: readonly [number, number, number, number], x: number, z: number, pad = 0) =>
  x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;

/** Edge distance (negative on the surface), arc length and signed lateral offset to one road. */
export function roadDist(road: Road, x: number, z: number) {
  let edge = Infinity, s = 0, lateral = 0, acc = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (L * L));
    const cx = ax + dx * t, cz = az + dz * t;
    const e = Math.hypot(x - cx, z - cz) - road.width / 2;
    if (e < edge) { edge = e; s = acc + L * t; lateral = ((x - cx) * -dz + (z - cz) * dx) / L; }
    acc += L;
  }
  return { edge, s, lateral };
}

/** True where this module may put things on the ground (not someone else's plaza / court / lane / kora). */
export function territoryOK(x: number, z: number, pad = 0): boolean {
  if (inRect(SQUARE_T, x, z, pad)) return false;
  if (inRect(TEMPLE_T, x, z, pad)) return false;
  for (const p of PLAZAS) if (inRect(p.rect, x, z, 1 + pad)) return false;
  if (roadDist(LANE, x, z).edge < 0.9 + pad) return false;
  if (roadDist(KORA, x, z).edge < 4 - KORA.width / 2 + 1 + pad) return false;
  return true;
}

/** Distance from (x, z) to the nearest edge of any road other than `own` (negative = on it). */
export function otherRoadEdge(own: Road, x: number, z: number) {
  let best = Infinity;
  for (const r of ROADS) if (r !== own) best = Math.min(best, roadDist(r, x, z).edge);
  return best;
}

export interface EdgePt {
  road: Road; s: number; side: 1 | -1;
  x: number; z: number;
  /** Ground height here. */
  y: number;
  /** Road surface height at the centre line. */
  roadY: number;
  /** Unit tangent (walking direction) and OUTWARD normal (away from the road). */
  tx: number; tz: number; ox: number; oz: number;
  /** Yaw that faces the road centre (local +z → toward the road). */
  yawIn: number;
  /** Yaw along the road. */
  yawAlong: number;
}

/** A point `off` metres outside the road edge (negative = onto the road surface). */
export function edgePt(road: Road, s: number, side: 1 | -1, off: number): EdgePt {
  const f = roadFrame(road, s);
  const ox = f.nx * side, oz = f.nz * side;
  const d = road.width / 2 + off;
  const x = f.x + ox * d, z = f.z + oz * d;
  return {
    road, s, side, x, z, y: groundY(x, z), roadY: f.y, tx: f.tx, tz: f.tz, ox, oz,
    yawIn: Math.atan2(-ox, -oz), yawAlong: f.yaw,
  };
}

/** Ground placement OK on the strip: own territory, really beside this road (bends), clear of other roads. */
export function stripOK(p: EdgePt, off: number, pad = 0.3): boolean {
  if (!territoryOK(p.x, p.z)) return false;
  const own = roadDist(p.road, p.x, p.z).edge;
  if (off >= 0 && own < off - 0.08) return false; // inner side of a bend: the point fell back onto the road
  if (otherRoadEdge(p.road, p.x, p.z) < pad) return false;
  return true;
}

// ---- kerb and open drains (painted by the ground module) ----------------------------------------------------
/** The kerb runs from the road edge to +0.18 m; its top is 0.10 m above groundY. */
export const KERB_OFF = 0.09, KERB_TOP = 0.1;
/** Open drains run +0.20..+0.56 m from the asphalt edge where sampleFields().drain > 0.5. */
export const DRAIN_OUT = 0.6;
const _fs = {} as FieldSample;

/** Is there an open drain beside this road at arc length s on this side? */
export function hasDrain(road: Road, s: number, side: 1 | -1): boolean {
  const f = roadFrame(road, s);
  const d = road.width / 2 + 0.38;
  return sampleFields(f.x + f.nx * side * d, f.z + f.nz * side * d, _fs).drain > 0.5;
}

/** Does (x, z) fall into the open drain beside `road` (with `pad` m of margin)? */
export function inDrain(road: Road, x: number, z: number, pad = 0.04): boolean {
  const e = roadDist(road, x, z).edge;
  if (e < 0.2 - pad || e > 0.56 + pad) return false;
  return sampleFields(x, z, _fs).drain > 0.5;
}

/**
 * Where a post (lamp, pole, flag pole, signpost) stands on the edge strip: on the kerb where a drain runs
 * behind it (y = kerb top, `kerb` true), otherwise 0.3 m out on the verge (y = ground).
 */
export function postPt(road: Road, s: number, side: 1 | -1): EdgePt & { kerb: boolean; off: number } {
  if (hasDrain(road, s, side) || hasDrain(road, s - 0.3, side) || hasDrain(road, s + 0.3, side)) {
    const p = edgePt(road, s, side, KERB_OFF);
    return { ...p, y: groundY(p.x, p.z) + KERB_TOP, kerb: true, off: KERB_OFF };
  }
  return { ...edgePt(road, s, side, 0.3), kerb: false, off: 0.3 };
}

/**
 * Centre of a ground prop of depth `depth` (across the road) beside the road: just behind the kerb, or
 * behind the drain where there is one (never in it).
 */
export function propPt(road: Road, s: number, side: 1 | -1, depth: number, extra = 0): EdgePt & { off: number } {
  const drain = hasDrain(road, s, side) || hasDrain(road, s - 0.5, side) || hasDrain(road, s + 0.5, side);
  const off = (drain ? DRAIN_OUT : 0.2) + depth / 2 + extra;
  return { ...edgePt(road, s, side, off), off };
}

// ---- zebra crossings (painted by the ground where each road leaves the square) ---------------------------
/** Same construction as the ground painter: centre and unit tangent of each crossing. */
const CROSSINGS = ROADS.filter((r) => r.kind === 'road').map((r) => {
  let s = 0;
  while (s < 20 && plazaQuery(roadFrame(r, s).x, roadFrame(r, s).z).edge < 1.5) s += 0.25;
  const f = roadFrame(r, s + 1.5);
  return { x: f.x, z: f.z, tx: f.tx, tz: f.tz };
});
/**
 * Is (x, z) within `pad` of a painted zebra band? (The ground paints each crossing as a band ±1.15 m along its
 * road and unbounded across it, on any asphalt — so the Dharamkot Road crossing also shows up on Bhagsu Road.)
 */
export function onZebra(x: number, z: number, pad = 0.6): boolean {
  for (const c of CROSSINGS) if (Math.abs((x - c.x) * c.tx + (z - c.z) * c.tz) < 1.15 + pad) return true;
  return false;
}

/** Arc-length range [s0, s1] of a road whose centre is outside the square / temple / plaza areas. */
export function freeRange(road: Road): [number, number] {
  const L = roadLength(road);
  let s0 = 0, s1 = L;
  while (s0 < L) { const f = roadFrame(road, s0); if (territoryOK(f.x, f.z, 1.5)) break; s0 += 0.5; }
  while (s1 > s0) { const f = roadFrame(road, s1); if (territoryOK(f.x, f.z, 1.5)) break; s1 -= 0.5; }
  return [s0, s1];
}

// ---- other modules' colliders -----------------------------------------------------------------------------
function boxNearest(c: BoxCollider, x: number, z: number) {
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const hx = c.w / 2, hz = c.d / 2;
  const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz);
  const inside = Math.abs(lx) < hx && Math.abs(lz) < hz;
  const wx = qx * cs + qz * sn, wz = -qx * sn + qz * cs;
  return { d: inside ? -Math.min(hx - Math.abs(lx), hz - Math.abs(lz)) : Math.hypot(lx - qx, lz - qz), px: c.x + wx, pz: c.z + wz };
}

/** Signed xz distance from a point to a collider footprint (negative inside). */
export function colliderDist(c: Collider, x: number, z: number) {
  if (c.kind === 'circle') return Math.hypot(x - c.x, z - c.z) - c.r;
  return boxNearest(c, x, z).d;
}

export interface Facade {
  /** Attach point on the wall (world), pushed 4 cm out of the wall. */
  x: number; z: number;
  /** Wall top (collider top). */
  top: number;
  /** Base (floor level estimate). */
  base: number;
  /** Distance from the query point. */
  d: number;
  c: BoxCollider;
}

/**
 * Snapshot of every collider registered by other modules (taken before this module adds its own), plus a
 * running list of what this module has already placed, for overlap tests.
 */
export class Obstacles {
  readonly foreign: Collider[];
  private mine: { x: number; z: number; r: number; y0: number; y1: number }[] = [];
  private _q: Collider[] = [];

  constructor() { this.foreign = collision.list(); }

  private near(x: number, z: number, r: number): Collider[] {
    // collision.query only contains foreign colliders while we plan (ours are registered afterwards)
    return collision.query(x, z, r, this._q);
  }

  /** True if a circle (x, z, r) spanning [y0, y1] touches any foreign collider or anything placed here. */
  blocked(x: number, z: number, r: number, y0: number, y1: number): boolean {
    for (const c of this.near(x, z, r + 0.5)) {
      if (c.y1 <= y0 + 1e-3 || c.y0 >= y1) continue;
      if (colliderDist(c, x, z) < r) return true;
    }
    for (const m of this.mine) {
      if (m.y1 <= y0 || m.y0 >= y1) continue;
      if (Math.hypot(m.x - x, m.z - z) < r + m.r) return true;
    }
    return false;
  }

  /**
   * Floor height at (x, z): the ground, or the top of a low standable solid (plinth, step, kerb slab) under
   * the circle, when it is at most `step` above the ground.
   */
  floorAt(x: number, z: number, r: number, ground: number, step = 0.45): number {
    let y = ground;
    for (const c of this.near(x, z, r + 0.5)) {
      if (c.y1 <= y || c.y1 > ground + step || c.y0 > ground + 0.05) continue;
      if (colliderDist(c, x, z) < r * 0.5) y = c.y1;
    }
    return y;
  }

  /** Distance from (x, z) to the nearest tall solid (building / big wall) footprint, ≤ maxD (else Infinity). */
  structureDist(x: number, z: number, maxD = 3, minTop = 3): number {
    let best = Infinity;
    for (const c of this.near(x, z, maxD + 0.5)) {
      if (!isStructure(c, minTop)) continue;
      const d = colliderDist(c, x, z);
      if (d < best) best = d;
    }
    return best <= maxD ? best : Infinity;
  }

  /** Nearest building façade to (x, z) within maxD whose top is at least `minTop` above `refY`. */
  facade(x: number, z: number, maxD: number, refY: number, minTop: number): Facade | null {
    let best: Facade | null = null;
    for (const c of this.near(x, z, maxD + 0.5)) {
      if (c.kind !== 'box' || !isStructure(c, 2) || c.y1 < refY + minTop) continue;
      const n = boxNearest(c, x, z);
      if (n.d < 0 || n.d > maxD) continue;
      if (!best || n.d < best.d) {
        const L = Math.hypot(x - n.px, z - n.pz) || 1;
        best = { x: n.px + ((x - n.px) / L) * 0.04, z: n.pz + ((z - n.pz) / L) * 0.04, top: c.y1, base: Math.max(c.y0 + 2, refY - 1), d: n.d, c };
      }
    }
    return best;
  }

  /** Foreign circle colliders with a tag (e.g. trees) inside radius R. */
  circles(x: number, z: number, R: number, tag: string) {
    const out: { x: number; z: number; r: number; y1: number }[] = [];
    for (const c of this.near(x, z, R)) if (c.kind === 'circle' && c.tag === tag && Math.hypot(c.x - x, c.z - z) < R) out.push(c);
    return out;
  }

  /** Foreign colliders with a tag inside radius R. */
  tagged(x: number, z: number, R: number, tag: string) {
    return this.near(x, z, R).filter((c) => c.tag === tag && Math.hypot(c.x - x, c.z - z) < R);
  }

  /** Record something this module placed (circle approximation). */
  claim(x: number, z: number, r: number, y0: number, y1: number) { this.mine.push({ x, z, r, y0, y1 }); }
  claimBox(b: BoxInit) { this.mine.push({ x: b.x, z: b.z, r: Math.max(b.w, b.d) / 2, y0: b.y0, y1: b.y1 }); }
  claimCircle(c: CircleInit) { this.mine.push({ x: c.x, z: c.z, r: c.r, y0: c.y0, y1: c.y1 }); }
}

/** Tall, solid things you could nail a cable to. */
export function isStructure(c: Collider, minH: number): boolean {
  if (c.kind !== 'box') return false;
  if (c.tag === 'building' || c.tag === 'wall' || c.tag === 'shelter' || c.tag === 'gate') return c.y1 - (c.y0 + (c.tag === 'building' ? 2 : 0)) >= minH;
  return c.w >= 1.5 && c.d >= 1.5 && c.y1 - c.y0 >= minH + 1;
}

/** Distance between two V3s in xz. */
export const dxz = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
