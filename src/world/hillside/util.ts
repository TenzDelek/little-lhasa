// Hillside helpers: road distances, road-side frames, local → world transforms, footprint (OBB) tests and a
// few small geometry helpers shared by the Bhagsu Road / Dharamkot Road builders, the viewpoint and the forest.
import { Matrix4, type BufferGeometry } from 'three';
import { PLAZAS, ROADS, roadById, roadFrame, type Road } from '../layout';
import { corrugated } from '../../kit/building';
import type { Parts, V3, PartOpts } from '../../core/geom';
import type { BoxInit } from '../../core/collision';
import { clamp, type Rng } from '../../core/math';

export const BHAGSU = roadById('bhagsu-road');
export const DHARAMKOT = roadById('dharamkot-road');
export const KORA = roadById('kora-path');
export const VIEWPOINT = PLAZAS.find((p) => p.id === 'viewpoint')!;
export const COURT = PLAZAS.find((p) => p.id === 'temple-court')!;

/** Square territory (main-square rect expanded by 9 m): never build in it. */
export const SQUARE_BOX = [-22, -19, 23, 19] as const;

export interface RoadDist { centre: number; edge: number; s: number; lateral: number }

/** Distance from (x, z) to one road: centre-line distance, edge distance, arc length, signed lateral. */
export function roadDist(road: Road, x: number, z: number): RoadDist {
  let best: RoadDist | null = null;
  let acc = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (L * L));
    const cx = ax + dx * t, cz = az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (!best || d < best.centre) {
      best = { centre: d, edge: d - road.width / 2, s: acc + L * t, lateral: ((x - cx) * -dz + (z - cz) * dx) / L };
    }
    acc += L;
  }
  return best!;
}

/** Edge distance to the nearest road of a kind ('road' = asphalt roads, 'lane', 'path'). */
export function kindDist(kind: Road['kind'], x: number, z: number): number {
  let best = Infinity;
  for (const r of ROADS) if (r.kind === kind) best = Math.min(best, roadDist(r, x, z).edge);
  return best;
}

/** Signed distance to a rect (negative inside). */
export function rectDist(rect: readonly [number, number, number, number], x: number, z: number) {
  const [x0, z0, x1, z1] = rect;
  const qx = Math.max(x0 - x, 0, x - x1), qz = Math.max(z0 - z, 0, z - z1);
  const out = Math.hypot(qx, qz);
  if (out > 0) return out;
  return -Math.min(x - x0, x1 - x, z - z0, z1 - z);
}

/** A frame in the xz plane: position + yaw (front faces local +z). */
export interface Frame { x: number; z: number; yaw: number }

/** Local (lx, lz) in a frame → world [x, z]. */
export function toWorld(f: Frame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

/** Collider for a local box (centre lx, lz; size w x d) inside a frame. */
export function localBox(f: Frame, lx: number, lz: number, w: number, d: number, y0: number, y1: number, tag?: string, rot = 0): BoxInit {
  const [x, z] = toWorld(f, lx, lz);
  return { x, z, w, d, rot: f.yaw + rot, y0, y1, tag };
}

/**
 * Frame facing a road from arc length s on `side` (+1 right / −1 left of the walking direction), its origin
 * `edgeOff` metres outside the road edge. Local +z points back at the road, local +x runs along the road.
 */
export function roadsideFrame(road: Road, s: number, side: 1 | -1, edgeOff: number) {
  const f = roadFrame(road, s);
  const off = road.width / 2 + edgeOff;
  return {
    x: f.x + f.nx * off * side, z: f.z + f.nz * off * side,
    yaw: Math.atan2(-f.nx * side, -f.nz * side),
    roadY: f.y,
  };
}

// ---- footprints -------------------------------------------------------------------------------------------
/** Oriented rectangle in xz, for overlap tests between placed footprints. */
export interface OBB { x: number; z: number; hw: number; hd: number; yaw: number }

export function obbOverlap(a: OBB, b: OBB, pad = 0.05): boolean {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  for (const ang of axes) {
    const ax = Math.sin(ang), az = Math.cos(ang);
    const proj = (o: OBB) => {
      const c = o.x * ax + o.z * az;
      const ux = Math.cos(o.yaw), uz = -Math.sin(o.yaw);
      const vx = Math.sin(o.yaw), vz = Math.cos(o.yaw);
      const r = Math.abs(ux * ax + uz * az) * (o.hw + pad) + Math.abs(vx * ax + vz * az) * (o.hd + pad);
      return [c - r, c + r];
    };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

/** Distance from a point to an OBB (0 inside). */
export function obbDist(o: OBB, x: number, z: number): number {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = Math.max(Math.abs(lx) - o.hw, 0), qz = Math.max(Math.abs(lz) - o.hd, 0);
  return Math.hypot(qx, qz);
}

// ---- geometry helpers -------------------------------------------------------------------------------------
/** Thin box from a to b (space of the current Parts group) — rods, poles, planks, ropes. */
export function rod(p: Parts, a: V3, b: V3, t: number, color: number, o?: PartOpts, h = t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return p;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  p.groupEuler([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [0, yaw, 0], () => {
    p.box(t, h, L, [0, 0, 0], color, { ...o, rot: [-pitch, 0, 0] });
  });
  return p;
}

const ch8 = (h: number, s: number) => (h >> s) & 255;
/** Multiply an sRGB hex by k (clamped). */
export function shadeHex(h: number, k: number) {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f(ch8(h, 16)) << 16) | (f(ch8(h, 8)) << 8) | f(ch8(h, 0));
}
/** Mix two sRGB hex colours. */
export function mixHex(a: number, b: number, t: number) {
  const m = (s: number) => Math.round(ch8(a, s) + (ch8(b, s) - ch8(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
/** Slight random brightness variation of a colour. */
export const jit = (r: Rng, h: number, amt = 0.08) => shadeHex(h, 1 + (r() - 0.5) * 2 * amt);

const TO_WALL = new Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
/** Corrugated tin wall in the local yz plane facing +x, ribs vertical: z ∈ [z0, z1], y ∈ [y0, y1]. */
export function tinWall(z0: number, z1: number, y0: number, y1: number, period = 0.13, amp = 0.03): BufferGeometry {
  return corrugated(z0, z1, () => [y0, y1], period, amp).applyMatrix4(TO_WALL);
}
