// Terrain height and zones, derived from the town plan (world/layout.ts).
//
//   groundY(x, z)      ground height (m). Roads and plazas are graded to their profiles; between them the
//                      hillside follows a southward tilt with gentle hills further from the streets.
//   worldMask(x, z)    1 inside the diorama, 0 outside (the rim dissolves through the Bayer dither).
//   roadQuery(x, z)    nearest road: distance from its EDGE (negative = on the road), the road, its height.
//   plazaQuery(x, z)   nearest plaza: signed distance from its edge (negative = inside).
//
// groundY is baked into a 1 m grid at load and sampled bilinearly, so it is cheap to call every frame.
import { ROADS, PLAZAS, WORLD_BOUNDS, type Road, type Plaza } from './layout';
import { fbm2, lerp, smooth, clamp } from '../core/math';

interface Seg { ax: number; az: number; bx: number; bz: number; ya: number; yb: number; hw: number; road: Road; s0: number; L: number }

const SEGS: Seg[] = [];
for (const road of ROADS) {
  let s = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    SEGS.push({ ax, az, bx, bz, ya: road.ys[i - 1], yb: road.ys[i], hw: road.width / 2, road, s0: s, L });
    s += L;
  }
}

export interface RoadHit {
  /** Distance from the road's edge (negative on the road surface). */
  edge: number;
  /** Distance from the centre line. */
  centre: number;
  road: Road;
  /** Road surface height at the nearest centre-line point. */
  y: number;
  /** Arc length along the road of the nearest point. */
  s: number;
  /** Signed lateral offset: + to the right of the walking direction. */
  lateral: number;
}

export function roadQuery(x: number, z: number): RoadHit {
  let best: RoadHit | null = null;
  for (const g of SEGS) {
    const dx = g.bx - g.ax, dz = g.bz - g.az;
    const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / (g.L * g.L));
    const cx = g.ax + dx * t, cz = g.az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    const edge = d - g.hw;
    if (!best || edge < best.edge) {
      // right of walking direction = (−dz, dx) / L
      const lateral = ((x - cx) * -dz + (z - cz) * dx) / g.L;
      best = { edge, centre: d, road: g.road, y: lerp(g.ya, g.yb, t), s: g.s0 + g.L * t, lateral };
    }
  }
  return best!;
}

export interface PlazaHit { edge: number; plaza: Plaza }
export function plazaQuery(x: number, z: number): PlazaHit {
  let best: PlazaHit | null = null;
  for (const p of PLAZAS) {
    const [x0, z0, x1, z1] = p.rect;
    const qx = Math.max(x0 - x, 0, x - x1), qz = Math.max(z0 - z, 0, z - z1);
    const outside = Math.hypot(qx, qz);
    const inside = Math.min(Math.min(x - x0, x1 - x), Math.min(z - z0, z1 - z));
    const edge = outside > 0 ? outside : -inside;
    if (!best || edge < best.edge) best = { edge, plaza: p };
  }
  return best!;
}

function rawHeight(x: number, z: number) {
  const base = -0.085 * z + 0.02 * x;
  let wsum = 0, ysum = 0, wmax = 0, near = Infinity;
  for (const g of SEGS) {
    const dx = g.bx - g.ax, dz = g.bz - g.az;
    const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / (g.L * g.L));
    const d = Math.hypot(x - g.ax - dx * t, z - g.az - dz * t) - g.hw;
    near = Math.min(near, d);
    const w = 1 - smooth(1.2, 15, d);
    if (w <= 0) continue;
    const ww = w * w / (0.25 + Math.max(0, d));
    wsum += ww; ysum += ww * lerp(g.ya, g.yb, t); wmax = Math.max(wmax, w);
  }
  for (const p of PLAZAS) {
    const [x0, z0, x1, z1] = p.rect;
    const qx = Math.max(x0 - x, 0, x - x1), qz = Math.max(z0 - z, 0, z - z1);
    const d = Math.hypot(qx, qz);
    near = Math.min(near, d);
    const w = 1 - smooth(0.6, 9, d);
    if (w <= 0) continue;
    const ww = (w * w * 6) / (0.25 + d);
    wsum += ww; ysum += ww * p.y; wmax = Math.max(wmax, w);
  }
  const hills = (fbm2(x * 0.03 + 3.1, z * 0.03 - 7.7, 4) - 0.5) * 9 * smooth(5, 30, near);
  const off = base + hills;
  if (wsum <= 0) return off;
  return lerp(off, ysum / wsum, wmax);
}

// ---- 1 m bake ------------------------------------------------------------------------------------------
const B = WORLD_BOUNDS;
const GX = Math.ceil(B.x1 - B.x0) + 1, GZ = Math.ceil(B.z1 - B.z0) + 1;
const H = new Float32Array(GX * GZ);
for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) H[j * GX + i] = rawHeight(B.x0 + i, B.z0 + j);

/** Ground height at (x, z), bilinear over the 1 m bake. */
export function groundY(x: number, z: number): number {
  const fx = clamp(x - B.x0, 0, GX - 1.001), fz = clamp(z - B.z0, 0, GZ - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const a = H[j * GX + i], b = H[j * GX + i + 1], c = H[(j + 1) * GX + i], d = H[(j + 1) * GX + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Exact (unbaked) height, for build-time placement that must match road profiles to the centimetre. */
export const groundYExact = rawHeight;

/** Ground normal from central differences of groundY. */
export function groundNormal(x: number, z: number): [number, number, number] {
  const e = 0.5;
  const hx = groundY(x + e, z) - groundY(x - e, z);
  const hz = groundY(x, z + e) - groundY(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const L = Math.hypot(nx, ny, nz);
  return [nx / L, ny / L, nz / L];
}

// ---- diorama rim ---------------------------------------------------------------------------------------
const RIM = 22; // metres of countryside kept around the streets

/** Distance (m) from the nearest street / plaza edge, wobbled so the rim reads organic. */
export function rimDistance(x: number, z: number) {
  const r = roadQuery(x, z).edge;
  const p = plazaQuery(x, z).edge;
  const wob = (fbm2(x * 0.045 + 11.3, z * 0.045 - 4.7, 3) - 0.5) * 16;
  return Math.min(r, p) + wob;
}

/** 1 well inside the playable diorama, falling to 0 at the rim. */
export function worldMask(x: number, z: number) {
  return 1 - smooth(RIM - 4, RIM, rimDistance(x, z));
}

/** Walkable: inside the rim (the player controller keeps the boy here). */
export const walkable = (x: number, z: number) => rimDistance(x, z) < RIM - 4.5;
