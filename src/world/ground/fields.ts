// Ground fields: everything the ground painter needs to know about the town plan, baked once at load into
// two small linear-filtered textures over WORLD_BOUNDS (0.5 m texels). The shader turns these smooth
// distance fields into crisp, art-pixel-sharp road edges, kerbs, drains, paving borders and the dithered rim.
//
//   fieldA (rgba16f): r = distance from the nearest ASPHALT road edge (m, negative on the road)
//                     g = distance from the nearest LANE / PATH edge (market lane, kora)
//                     b = distance from the nearest PLAZA edge (main square, temple court, viewpoint)
//                     a = worldMask (1 inside the diorama, 0 outside)
//   fieldB (rgba8):   r = asphalt "centreness" (0 at the edge, 1 on the centre line) — worn centre
//                     g = open drain present beside the asphalt here (1; 0.3 = rural, no kerb)
//                     b = footpath (goat path) strength (1 on the path, 0 off it)
//                     a = built-up frontage (market + hillside frontage, square edges): packed earth, no grass
//
// The same numbers are available on the CPU through sampleFields() (bilinear, like the GPU).
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat, UnsignedByteType, ClampToEdgeWrapping } from 'three';
import { ROADS, PLAZAS, WORLD_BOUNDS, roadLength, roadFrame, type Road } from '../layout';
import { groundY, worldMask } from '../terrain';
import { clamp, hash2, smooth } from '../../core/math';

export const RES = 0.5;
const B = WORLD_BOUNDS;
export const FW = Math.round((B.x1 - B.x0) / RES) + 1;
export const FH = Math.round((B.z1 - B.z0) / RES) + 1;

/** Roads drawn as asphalt; the two that run off the map get a painted extension into the rim. */
const ASPHALT = ROADS.filter((r) => r.kind === 'road');
const LANES = ROADS.filter((r) => r.kind !== 'road');
const EXTEND: Record<string, number> = { 'jogiwara-road': 42, 'bhagsu-road': 40 };

interface Seg { ax: number; az: number; bx: number; bz: number; hw: number; s0: number; L: number; road: Road; ext: boolean }
function segsOf(roads: readonly Road[], extend: boolean): Seg[] {
  const out: Seg[] = [];
  for (const road of roads) {
    let s = 0;
    for (let i = 1; i < road.pts.length; i++) {
      const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      out.push({ ax, az, bx, bz, hw: road.width / 2, s0: s, L, road, ext: false });
      s += L;
    }
    const e = extend ? EXTEND[road.id] : 0;
    if (e) {
      const n = road.pts.length;
      const [ax, az] = road.pts[n - 2], [bx, bz] = road.pts[n - 1];
      const L = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      // gentle bend so the extension does not look ruled
      const cx = bx + tx * e * 0.5, cz = bz + tz * e * 0.5;
      const dx = bx + tx * e + tz * e * 0.18, dz = bz + tz * e - tx * e * 0.18;
      out.push({ ax: bx, az: bz, bx: cx, bz: cz, hw: road.width / 2, s0: s, L: e * 0.5, road, ext: true });
      out.push({ ax: cx, az: cz, bx: dx, bz: dz, hw: road.width / 2 - 0.3, s0: s + e * 0.5, L: Math.hypot(dx - cx, dz - cz), road, ext: true });
    }
  }
  return out;
}
const SEG_A = segsOf(ASPHALT, true);
const SEG_L = segsOf(LANES, false);

interface Near { edge: number; centre: number; hw: number; s: number; lat: number; seg: Seg | null }
function nearest(segs: Seg[], x: number, z: number, out: Near): Near {
  out.edge = 1e9; out.seg = null;
  for (const g of segs) {
    const dx = g.bx - g.ax, dz = g.bz - g.az;
    let t = ((x - g.ax) * dx + (z - g.az) * dz) / (g.L * g.L);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = g.ax + dx * t, cz = g.az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    const e = d - g.hw;
    if (e < out.edge) {
      out.edge = e; out.centre = d; out.hw = g.hw; out.s = g.s0 + g.L * t; out.seg = g;
      out.lat = ((x - cx) * -dz + (z - cz) * dx) / g.L;
    }
  }
  return out;
}

function plazaEdge(x: number, z: number) {
  let best = 1e9;
  for (const p of PLAZAS) {
    const [x0, z0, x1, z1] = p.rect;
    const qx = Math.max(x0 - x, 0, x - x1), qz = Math.max(z0 - z, 0, z - z1);
    const outside = Math.hypot(qx, qz);
    const inside = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    best = Math.min(best, outside > 0 ? outside : -inside);
  }
  return best;
}

// ---- goat paths: short trodden footpaths into the woods (visual only) --------------------------------
export const FOOTPATHS: readonly (readonly [number, number])[][] = [
  [[38, -7.5], [41, -16], [37, -24], [40, -33]],                 // Bhagsu Road, north side, up into the deodars
  [[66, -6.5], [70, 2], [77, 8]],                                // Bhagsu Road, south side, down the slope
  [[4.5, -22], [-6, -26], [-14, -33], [-18, -42]],               // west off Dharamkot Road
  [[18, -60], [26, -57], [33, -60]],                             // east off Dharamkot Road
  [[14, 140.5], [17, 150], [24, 157]],                           // off the kora, south into the forest
  [[-21.5, 114], [-30, 110], [-36, 102]],                        // off the kora, west
  [[-31.5, 72], [-40, 70], [-48, 64], [-55, 63]],                // west off Jogiwara Road, toward the woods
];
const PATH_SEGS: { ax: number; az: number; bx: number; bz: number }[] = [];
for (const p of FOOTPATHS) for (let i = 1; i < p.length; i++) PATH_SEGS.push({ ax: p[i - 1][0], az: p[i - 1][1], bx: p[i][0], bz: p[i][1] });
function pathDist(x: number, z: number) {
  let best = 1e9;
  for (const g of PATH_SEGS) {
    const dx = g.bx - g.ax, dz = g.bz - g.az;
    const t = clamp(((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(x - g.ax - dx * t, z - g.az - dz * t));
  }
  return best;
}

// ---- frontage (other builders' building zones: keep grass out, paint packed earth) ------------------
const MARKET_S: Record<string, [number, number]> = { 'temple-road': [9, 76], 'jogiwara-road': [8, 78] };
const SQUARE_T = [-22, -19, 23, 19] as const;

// ---- open drains: always on the uphill side of an asphalt road, on the downhill side in stretches ----
function drainAt(road: Road, s: number, side: number) {
  const L = roadLength(road);
  if (s < 2.5 || s > L - 2) return 0;
  const f = roadFrame(road, s);
  const o = road.width / 2 + 4;
  const up = groundY(f.x + f.nx * side * o, f.z + f.nz * side * o) - f.y;
  if (up > 0.15) return 1;
  const k = Math.floor(s / 9);
  return hash2(k * 3.7 + (side > 0 ? 11 : 0), road.width * 13.1) > 0.45 ? 1 : 0;
}

// ---- the bake ---------------------------------------------------------------------------------------
export const FA = new Float32Array(FW * FH * 4);
export const FB = new Float32Array(FW * FH * 4);
{
  const na: Near = { edge: 0, centre: 0, hw: 0, s: 0, lat: 0, seg: null };
  const nl: Near = { edge: 0, centre: 0, hw: 0, s: 0, lat: 0, seg: null };
  const drainCache = new Map<string, number>();
  for (let j = 0; j < FH; j++) {
    const z = B.z0 + j * RES;
    for (let i = 0; i < FW; i++) {
      const x = B.x0 + i * RES;
      const k = (j * FW + i) * 4;
      nearest(SEG_A, x, z, na);
      nearest(SEG_L, x, z, nl);
      const pe = plazaEdge(x, z);
      const dmin = Math.min(na.edge, nl.edge, pe);
      FA[k] = clamp(na.edge, -8, 40);
      FA[k + 1] = clamp(nl.edge, -8, 40);
      FA[k + 2] = clamp(pe, -20, 40);
      const bd = Math.min(x - B.x0, B.x1 - x, z - B.z0, B.z1 - z);
      FA[k + 3] = (dmin < 9 ? 1 : dmin > 34 ? 0 : worldMask(x, z)) * smooth(0.5, 6, bd);

      // asphalt centreness and drains
      FB[k] = clamp(1 - na.centre / na.hw);
      if (na.seg && na.edge > -1 && na.edge < 2 && !na.seg.ext) {
        const side = na.lat >= 0 ? 1 : -1;
        const sk = Math.round(na.s);
        const key = `${na.seg.road.id}|${sk}|${side}`;
        let dr = drainCache.get(key);
        if (dr === undefined) { dr = drainAt(na.seg.road, sk, side); drainCache.set(key, dr); }
        FB[k + 1] = dr;
      } else if (na.seg?.ext) FB[k + 1] = 0.3; // rural extension: no kerb, no drain
      // footpaths
      const pd = pathDist(x, z);
      FB[k + 2] = 1 - smooth(0.35, 1.05, pd);
      // built-up frontage
      let built = 0;
      if (na.seg && !na.seg.ext) {
        const ms = MARKET_S[na.seg.road.id];
        if (ms && na.s > ms[0] - 1 && na.s < ms[1] + 1 && na.edge > 0.3 && na.edge < 9) built = 1;
        if ((na.seg.road.id === 'bhagsu-road' || na.seg.road.id === 'dharamkot-road') && na.edge > 0.3) built = 1 - smooth(2.5, 5, na.edge + (hash2(Math.floor(na.s / 7), 5.3) - 0.5) * 3);
      }
      if (nl.seg?.road.id === 'market-lane' && nl.edge > 0.2 && nl.edge < 8.5) built = 1;
      if (x > SQUARE_T[0] && x < SQUARE_T[2] && z > SQUARE_T[1] && z < SQUARE_T[3] && pe > 0) built = Math.max(built, 0.8);
      FB[k + 3] = built;
    }
  }
}

function makeTextures() {
  const half = new Uint16Array(FA.length);
  for (let i = 0; i < FA.length; i++) half[i] = DataUtils.toHalfFloat(FA[i]);
  const a = new DataTexture(half, FW, FH, RGBAFormat, HalfFloatType);
  const bytes = new Uint8Array(FB.length);
  for (let i = 0; i < FB.length; i++) bytes[i] = Math.round(clamp(FB[i]) * 255);
  const b = new DataTexture(bytes, FW, FH, RGBAFormat, UnsignedByteType);
  for (const t of [a, b]) {
    t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.needsUpdate = true;
  }
  return { a, b };
}
let tex: ReturnType<typeof makeTextures> | null = null;
/** The two field textures (created on first use, shared by every ground material). */
export function fieldTextures() { return (tex ??= makeTextures()); }

export interface FieldSample { asphalt: number; lane: number; plaza: number; mask: number; centre: number; drain: number; path: number; built: number }
/** Bilinear CPU sample of both fields at (x, z), same as the GPU sees it. */
export function sampleFields(x: number, z: number, out: FieldSample = {} as FieldSample): FieldSample {
  const fx = clamp((x - B.x0) / RES, 0, FW - 1.001), fz = clamp((z - B.z0) / RES, 0, FH - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k00 = (j * FW + i) * 4, k10 = k00 + 4, k01 = k00 + FW * 4, k11 = k01 + 4;
  const bl = (A: Float32Array, c: number) =>
    (A[k00 + c] * (1 - u) + A[k10 + c] * u) * (1 - v) + (A[k01 + c] * (1 - u) + A[k11 + c] * u) * v;
  out.asphalt = bl(FA, 0); out.lane = bl(FA, 1); out.plaza = bl(FA, 2); out.mask = bl(FA, 3);
  out.centre = bl(FB, 0); out.drain = bl(FB, 1); out.path = bl(FB, 2); out.built = bl(FB, 3);
  return out;
}

/** Distance (m) to the nearest street surface of any kind (negative on it). */
export const streetEdge = (f: FieldSample) => Math.min(f.asphalt, f.lane, f.plaza);

/** Asphalt segments incl. the painted extensions (for kerbs etc.). */
export const ASPHALT_ROADS = ASPHALT;
export const UV = {
  /** World → field-texture uv: u = (x - x0) / RES + 0.5) / FW, same for v / z. */
  sx: 1 / (RES * FW), ox: (-B.x0 / RES + 0.5) / FW,
  sz: 1 / (RES * FH), oz: (-B.z0 / RES + 0.5) / FH,
};
