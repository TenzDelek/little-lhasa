// Terrain height and zones, derived from the town plan (world/layout.ts).
//
//   groundY(x, z)      ground height (m). Roads and plazas are graded to their profiles; between them the
//                      hillside follows a southward tilt with gentle hills further from the streets.
//   worldMask(x, z)    1 inside the diorama, 0 outside (the rim dissolves through the Bayer dither).
//   roadQuery(x, z)    nearest road: distance from its EDGE (negative = on the road), the road, its height.
//   plazaQuery(x, z)   nearest plaza: signed distance from its edge (negative = inside).
//
// groundY is baked into a 1 m grid at load and sampled bilinearly, so it is cheap to call every frame.
// The nearest-segment loops skip segments whose bounding box alone proves they cannot change the answer;
// the arithmetic on the segments that remain is unchanged, so every result is bit-identical to a full scan.
import { ROADS, PLAZAS, WORLD_BOUNDS, type Road, type Plaza } from './layout';
import { fbm2, lerp, smooth, clamp } from '../core/math';

interface Seg {
  ax: number; az: number; bx: number; bz: number; ya: number; yb: number; hw: number; road: Road; s0: number; L: number;
  /** b − a, and L² (the same doubles the queries used to compute inline). */
  dx: number; dz: number; L2: number;
  /** Bounding box of the centre line. */
  x0: number; z0: number; x1: number; z1: number;
}

/** Beyond this distance from a road's edge, rawHeight no longer feels it (blend fades out by 15 m, hills by 30 m). */
const HEIGHT_REACH = 30.01;

const SEGS: Seg[] = [];
for (const road of ROADS) {
  let s = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    SEGS.push({
      ax, az, bx, bz, ya: road.ys[i - 1], yb: road.ys[i], hw: road.width / 2, road, s0: s, L,
      dx: bx - ax, dz: bz - az, L2: L * L,
      x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz),
    });
    s += L;
  }
}
const NSEG = SEGS.length;
/** Per-query scratch: squared distance from the point to each segment's bounding box. */
const BOX2 = new Float64Array(NSEG);

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

// nearest-road scratch, written by nearestRoad()
let nI = 0, nEdge = 0, nD = 0, nT = 0, nLat = 0;

/** Exact edge distance of segment i from (x, z); fills the scratch when it beats (or ties earlier than) the best. */
function trySeg(i: number, x: number, z: number, first: boolean) {
  const g = SEGS[i];
  const t = clamp(((x - g.ax) * g.dx + (z - g.az) * g.dz) / g.L2);
  const cx = g.ax + g.dx * t, cz = g.az + g.dz * t;
  const d = Math.hypot(x - cx, z - cz);
  const edge = d - g.hw;
  // the full scan keeps the first segment with the smallest edge: an earlier index wins a tie
  if (first || edge < nEdge || (edge === nEdge && i < nI)) {
    nI = i; nEdge = edge; nD = d; nT = t;
    // right of walking direction = (−dz, dx) / L
    nLat = ((x - cx) * -g.dz + (z - cz) * g.dx) / g.L;
  }
}

/**
 * Nearest road segment to (x, z), same answer as scanning every segment in order. Seeds the search with the
 * segment whose bounding box is closest, then skips any segment whose box is already farther than the best edge.
 */
function nearestRoad(x: number, z: number) {
  let seed = 0, seedBox = Infinity;
  for (let i = 0; i < NSEG; i++) {
    const g = SEGS[i];
    const qx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0, qz = z < g.z0 ? g.z0 - z : z > g.z1 ? z - g.z1 : 0;
    const q2 = qx * qx + qz * qz;
    BOX2[i] = q2;
    if (q2 < seedBox) { seedBox = q2; seed = i; }
  }
  trySeg(seed, x, z, true);
  for (let i = 0; i < NSEG; i++) {
    if (i === seed) continue;
    const lim = nEdge + SEGS[i].hw + 1e-6; // its edge is at least √BOX2 − hw
    if (lim < 0 || BOX2[i] > lim * lim) continue;
    trySeg(i, x, z, false);
  }
}

export function roadQuery(x: number, z: number): RoadHit {
  nearestRoad(x, z);
  const g = SEGS[nI];
  return { edge: nEdge, centre: nD, road: g.road, y: lerp(g.ya, g.yb, nT), s: g.s0 + g.L * nT, lateral: nLat };
}

export interface PlazaHit { edge: number; plaza: Plaza }

let pI = 0;
/** Signed edge distance to the nearest plaza (negative inside); its index lands in pI. */
function nearestPlaza(x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < PLAZAS.length; i++) {
    const [x0, z0, x1, z1] = PLAZAS[i].rect;
    const qx = Math.max(x0 - x, 0, x - x1), qz = Math.max(z0 - z, 0, z - z1);
    const outside = Math.hypot(qx, qz);
    const inside = Math.min(Math.min(x - x0, x1 - x), Math.min(z - z0, z1 - z));
    const edge = outside > 0 ? outside : -inside;
    if (i === 0 || edge < best) { best = edge; pI = i; }
  }
  return best;
}

export function plazaQuery(x: number, z: number): PlazaHit {
  const edge = nearestPlaza(x, z);
  return { edge, plaza: PLAZAS[pI] };
}

function rawHeight(x: number, z: number) {
  const base = -0.085 * z + 0.02 * x;
  let wsum = 0, ysum = 0, wmax = 0, near = Infinity;
  for (const g of SEGS) {
    // more than HEIGHT_REACH from its edge a segment has w = 0 and cannot pull `near` under 30, where the
    // hill fade saturates: skipping it changes nothing
    const r = g.hw + HEIGHT_REACH;
    if (x < g.x0 - r || x > g.x1 + r || z < g.z0 - r || z > g.z1 + r) continue;
    const dx = g.dx, dz = g.dz;
    const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / g.L2);
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
  // within 5 m of a street the hills are scaled to zero: skip the noise there
  const hf = smooth(5, 30, near);
  const hills = hf > 0 ? (fbm2(x * 0.03 + 3.1, z * 0.03 - 7.7, 4) - 0.5) * 9 * hf : 0;
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
/** The rim wobble stays within ±WOB m. */
const WOB = 8;

/** Distance (m) from the nearest street / plaza edge, without the wobble. */
function streetDistance(x: number, z: number) {
  nearestRoad(x, z);
  return Math.min(nEdge, nearestPlaza(x, z));
}
const wobble = (x: number, z: number) => (fbm2(x * 0.045 + 11.3, z * 0.045 - 4.7, 3) - 0.5) * 16;

/** Distance (m) from the nearest street / plaza edge, wobbled so the rim reads organic. */
export function rimDistance(x: number, z: number) {
  return streetDistance(x, z) + wobble(x, z);
}

/** 1 well inside the playable diorama, falling to 0 at the rim. */
export function worldMask(x: number, z: number) {
  const m = streetDistance(x, z);
  // the wobble cannot carry these across the RIM − 4 … RIM band: the mask is exactly 1 / 0 without it
  if (m < RIM - 4 - WOB - 0.01) return 1;
  if (m > RIM + WOB + 0.01) return 0;
  return 1 - smooth(RIM - 4, RIM, m + wobble(x, z));
}

/** Walkable: inside the rim and ≥ 6 m inside WORLD_BOUNDS (the player controller keeps the boy here). */
export const walkable = (x: number, z: number) =>
  x > B.x0 + 6 && x < B.x1 - 6 && z > B.z0 + 6 && z < B.z1 - 6 && rimDistance(x, z) < RIM - 4.5;
