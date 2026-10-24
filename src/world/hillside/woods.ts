// Forest placement for the whole town: deodar, chir pine, oak and rhododendron trees with bushes, ferns and
// rocks underneath. Seeded jittered-grid candidates + Poisson-style spacing, filtered by the town plan:
//   - only inside the diorama (worldMask > 0.6), never on roads / plazas
//   - asphalt roads: more than 9 m from the edge (behind the building rows); lanes ≥ 2 m (other modules'
//     buildings along Market Lane are cleared by the collider sweep in Woodland.tsx); the kora path ≥ 2.5 m
//     (the Lingkhor is a forest walk)
//   - outside the main-square box, outside the temple enclosure (+4 m) and everything inside the kora loop
//   - clear of hillside footprints (buildings, tea shop, viewpoint…)
//   - no trees (shrubs only) in the ±35° view cone north of the Dhauladhar viewpoint
//   - no tree crowns over Tashi's yard behind the momo stall, seen from the default iso camera (dropped after
//     planning, so the rest of the forest stays the same)
// Density is highest along the kora and on steep ground, patchy elsewhere (low-frequency noise clearings).
// Trees on the kora's outer side are marked `koraOuter`: once the temple module has registered its kora
// features (flag poles, chortens, mani piles…), Woodland.tsx keeps them ≥ 4.5 m clear and out from under
// the lungta fans that run down the hillside.
import { ROADS, SPOTS } from '../layout';
import { groundY, worldMask } from '../terrain';
import { fbm2, hash2, rng, smooth } from '../../core/math';
import { ENCLOSURE } from '../temple/site';
import { COURT, KORA, VIEWPOINT, kindDist, obbDist, rectDist, roadDist, type OBB } from './util';
import type { PlantedTree } from './ctx';
import { treeVariants, type TreeKind } from './trees';

export interface TreeInstance {
  kind: TreeKind;
  x: number; y: number; z: number;
  yaw: number;
  scale: number;
  /** Per-instance brightness / hue tint (multiplies the vertex colours). */
  tint: [number, number, number];
  /** Wind phase. */
  phase: number;
  /** Planted deliberately by a builder: never culled by the collider sweep. */
  fixed?: boolean;
  /** Close to the kora on its outer side: kept clear of the temple's kora features at runtime. */
  koraOuter?: boolean;
}

const TREE_KINDS: TreeKind[] = ['deodar', 'deodarMid', 'sapling', 'pine', 'oak', 'rhodo', 'pineB', 'oakB', 'rhodoB'];
/** Second model of a species (picked per position, so the plan itself stays the same). */
const VARIANT_B: Partial<Record<TreeKind, TreeKind>> = { pine: 'pineB', oak: 'oakB', rhodo: 'rhodoB' };
export const isTree = (k: TreeKind) => TREE_KINDS.includes(k);

/** Min spacing between tree trunks by kind (m, scale 1). */
const SPACING: Record<string, number> = { deodar: 3.6, deodarMid: 3.1, sapling: 2.0, pine: 3.3, oak: 3.8, rhodo: 2.8 };

// ---- kora loop: everything inside belongs to the temple ---------------------------------------------------
const LOOP = KORA.pts;
function insideKora(x: number, z: number) {
  let inside = false;
  for (let i = 0, j = LOOP.length - 1; i < LOOP.length; j = i++) {
    const [xi, zi] = LOOP[i], [xj, zj] = LOOP[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const ASPHALT = ROADS.filter((r) => r.kind === 'road');

/** Distance from (x, z) to the temple enclosure polygon (0 inside). */
function enclosureDist(x: number, z: number): number {
  let inside = false, best = Infinity;
  const P = ENCLOSURE;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    if ((bz > z) !== (az > z) && x < ((ax - bx) * (z - bz)) / (az - bz) + bx) inside = !inside;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return inside ? 0 : best;
}

/** The view north from the Dhauladhar viewpoint: apex a little behind the plaza centre, ±35° about −z. */
export const VIEW_CONE = { x: 30, z: -81.5, tan: Math.tan((35 * Math.PI) / 180) };
/** Inside the viewpoint's view cone (no trees there, so the chase camera sees the snow range)? */
export function inViewCone(x: number, z: number, pad = 0): boolean {
  const dz = VIEW_CONE.z - z;
  if (dz <= 0) return false;
  return Math.abs(x - VIEW_CONE.x) - pad < dz * VIEW_CONE.tan;
}

// ---- open yards that must read from the default iso camera ---------------------------------------------
/** Tashi's yard behind the momo stall (market/yards.ts momoYard: counter-frame local x −2.65..4.15, z −4.6..0;
 *  local +x runs along the road, +z faces the road). */
const YARDS: { o: OBB; y: number }[] = (() => {
  const f = SPOTS.momoStall, c = Math.cos(f.ry), s = Math.sin(f.ry), lx = 0.75, lz = -2.3;
  const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
  return [{ o: { x, z, hw: 3.4, hd: 2.3, yaw: f.ry }, y: groundY(x, z) }];
})();
/** Default iso camera: azimuth π/4 (south-east of the boy), 36° up. */
const ISO_VX = Math.SQRT1_2, ISO_VZ = Math.SQRT1_2, ISO_TAN = Math.tan((36 * Math.PI) / 180);
const CONIFER: ReadonlySet<TreeKind> = new Set(['deodar', 'deodarMid', 'sapling']);

/**
 * Does a tree's crown hide one of the YARDS from the default camera? A crown point h above the yard lands on
 * the yard's ground plane h / tan 36° back from the trunk, away from the camera; the crown hides the yard where
 * that image overlaps it by more than a little (conifers taper toward the leader, broadleaf crowns sit high).
 */
function hidesYard(it: TreeInstance): boolean {
  const v = treeVariants()[it.kind];
  const cone = CONIFER.has(it.kind);
  const h0 = (cone ? v.sway0 : v.h * 0.55) * it.scale, h1 = v.h * it.scale, R = v.canopyR * it.scale;
  for (const { o, y } of YARDS) {
    if (Math.hypot(it.x - o.x, it.z - o.z) > 30) continue;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, hgt = it.y + h0 + (h1 - h0) * t - y;
      if (hgt <= 0) continue;
      const back = hgt / ISO_TAN;
      const r = cone ? R * (1 - 0.7 * t) : R * (t < 0.85 ? 1 : 0.7);
      if (obbDist(o, it.x - ISO_VX * back, it.z - ISO_VZ * back) < r - 0.25) return true;
    }
  }
  return false;
}

/** Can something stand at (x, z)? `roadGap` = clearance from asphalt edges. */
function allowed(x: number, z: number, foot: OBB[], footPad: number, roadGap = 9): boolean {
  if (worldMask(x, z) < 0.6) return false;
  if (x > -24 && x < 25 && z > -21 && z < 21) return false;
  const [cx0, cz0, cx1, cz1] = COURT.rect;
  if (x > cx0 - 4 && x < cx1 + 4 && z > cz0 - 4 && z < cz1 + 4) return false;
  if (insideKora(x, z) || enclosureDist(x, z) < 4) return false;
  if (rectDist(VIEWPOINT.rect, x, z) < 1.2) return false;
  for (const r of ASPHALT) if (roadDist(r, x, z).edge < roadGap) return false;
  if (kindDist('lane', x, z) < Math.min(roadGap, 2)) return false;
  if (roadDist(KORA, x, z).edge < 2.5) return false;
  for (const f of foot) if (obbDist(f, x, z) < footPad) return false;
  return true;
}

/** Forest density 0..1 at (x, z) (already known to be allowed). */
function density(x: number, z: number): number {
  const kora = roadDist(KORA, x, z).edge;
  const e = 0.6;
  const gx = groundY(x + e, z) - groundY(x - e, z), gz = groundY(x, z + e) - groundY(x, z - e);
  const slope = Math.hypot(gx, gz) / (2 * e);
  let d = 0.42 + Math.min(0.35, slope * 1.4);
  if (kora < 16) d = Math.max(d, 0.95 - kora * 0.012);
  // clearings and thickets
  const n = fbm2(x * 0.045 + 7.3, z * 0.045 - 2.1, 3);
  d *= 0.35 + smooth(0.32, 0.62, n) * 0.9;
  // thinner toward the rim so the diorama edge stays readable
  d *= smooth(0.6, 0.95, worldMask(x, z));
  return Math.min(1, d);
}

/** Species for a tree at (x, z): zone mix with species clumping by noise. */
function species(x: number, z: number, u: number, v: number): TreeKind {
  const kora = roadDist(KORA, x, z).edge;
  const clump = fbm2(x * 0.07 - 3.3, z * 0.07 + 9.1, 2); // 0..1, groups species
  const w: Record<string, number> = { deodar: 3, deodarMid: 2, sapling: 0.7, pine: 1, oak: 1.5, rhodo: 1.2 };
  if (z < -40) { w.deodar = 4.5; w.deodarMid = 2.2; w.rhodo = 1.8; w.pine = 0.3; }
  else if (z < 20) { w.oak = 2; w.rhodo = 1.6; w.pine = 0.8; }
  else { w.pine = 3.2; w.deodar = 2.4; w.rhodo = 0.5; }
  if (kora < 16) { w.deodar += 1.5; w.pine += 1; }
  // clumping: pines like the low, open patches; rhododendrons and oaks gather together
  w.pine *= 0.5 + clump * 1.2;
  w.rhodo *= 1.5 - clump;
  w.oak *= 1.3 - clump * 0.5;
  if (v < 0.025) return 'sapling';
  const keys = Object.keys(w) as TreeKind[];
  const tot = keys.reduce((a, k) => a + w[k], 0);
  let acc = u * tot;
  for (const k of keys) { acc -= w[k]; if (acc <= 0) return k; }
  return 'deodar';
}

class Hash {
  private m = new Map<number, { x: number; z: number; r: number }[]>();
  private cell: number;
  constructor(cell = 4) { this.cell = cell; }
  private k(i: number, j: number) { return i * 92821 + j; }
  add(x: number, z: number, r: number) {
    const k = this.k(Math.floor(x / this.cell), Math.floor(z / this.cell));
    if (!this.m.has(k)) this.m.set(k, []);
    this.m.get(k)!.push({ x, z, r });
  }
  /** True if any stored disc is closer than (its r + r) * f. */
  near(x: number, z: number, r: number, f = 1, reach = 1): boolean {
    const i0 = Math.floor(x / this.cell), j0 = Math.floor(z / this.cell);
    for (let i = i0 - reach; i <= i0 + reach; i++) for (let j = j0 - reach; j <= j0 + reach; j++) {
      const l = this.m.get(this.k(i, j));
      if (!l) continue;
      for (const q of l) if (Math.hypot(q.x - x, q.z - z) < (q.r + r) * f) return true;
    }
    return false;
  }
  nearest(x: number, z: number, reach = 1): number {
    const i0 = Math.floor(x / this.cell), j0 = Math.floor(z / this.cell);
    let best = Infinity;
    for (let i = i0 - reach; i <= i0 + reach; i++) for (let j = j0 - reach; j <= j0 + reach; j++) {
      const l = this.m.get(this.k(i, j));
      if (l) for (const q of l) best = Math.min(best, Math.hypot(q.x - x, q.z - z));
    }
    return best;
  }
}

function tintFor(kind: TreeKind, x: number, z: number, r: () => number): [number, number, number] {
  const b = 0.9 + r() * 0.18;
  const n = hash2(x * 0.13, z * 0.17);
  if (kind === 'deodar' || kind === 'deodarMid' || kind === 'sapling') {
    // some deodars bluer, some warmer
    const blue = n < 0.4 ? 0.06 : 0;
    return [b * (1 - blue), b, b * (1 + blue * 1.5)];
  }
  if (kind === 'pine' || kind === 'pineB') return [b * (1 + (n - 0.5) * 0.12), b, b * 0.94];
  if (kind === 'rock' || kind === 'rockFlat') { const g = 0.88 + r() * 0.2; return [g, g, g * (0.97 + r() * 0.06)]; }
  return [b * (1 + (n - 0.5) * 0.1), b, b];
}

export interface ForestPlan { items: TreeInstance[]; counts: Record<string, number> }

/** Plan the whole forest. `foot` = hillside footprints to keep clear of; `planted` = fixed trees. */
export function planForest(foot: OBB[], planted: PlantedTree[], clearings: OBB[] = []): ForestPlan {
  const items: TreeInstance[] = [];
  const trunks = new Hash(4);
  const small = new Hash(3);
  const r = rng(90210);
  const yOf = (x: number, z: number) => groundY(x, z) - 0.05;

  const push = (k0: TreeKind, x: number, z: number, scale: number, yaw = r() * Math.PI * 2, fixed = false) => {
    const kB = VARIANT_B[k0];
    const kind = kB && hash2(x * 0.71 + 3.1, z * 1.37 - 0.4) < 0.45 ? kB : k0;
    const outer = isTree(kind) && !fixed && !insideKora(x, z) && roadDist(KORA, x, z).edge < 12;
    items.push({ kind, x, y: yOf(x, z), z, yaw, scale, tint: tintFor(kind, x, z, r), phase: r() * 6.283, fixed, koraOuter: outer || undefined });
  };

  // 0. fixed trees requested by the builders (shrine tree, gaps between houses…)
  for (const t of planted) {
    const kind: TreeKind = t.kind === 'bush' ? 'bush' : t.kind;
    if (isTree(kind) && inViewCone(t.x, t.z)) continue; // the view north stays open
    const s = t.scale ?? 1;
    push(kind, t.x, t.z, s, t.yaw ?? r() * Math.PI * 2, true);
    if (isTree(kind)) trunks.add(t.x, t.z, (SPACING[kind] ?? 3) * s * 0.5);
    else small.add(t.x, t.z, 0.5);
  }

  // 1. trees: jittered grid, shuffled, Poisson spacing
  const cands: [number, number][] = [];
  const G = 1.7;
  for (let z = -112; z <= 160; z += G) for (let x = -72; x <= 125; x += G) {
    cands.push([x + (hash2(x * 1.3, z * 0.7) - 0.5) * G * 0.9, z + (hash2(x * 0.37, z * 1.9) - 0.5) * G * 0.9]);
  }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }

  for (const [x, z] of cands) {
    if (worldMask(x, z) < 0.6) continue;
    const u = r(), v = r(), acc = r();
    if (!allowed(x, z, foot, 2.2)) continue;
    if (clearings.some((o) => obbDist(o, x, z) < 1.5)) continue;
    const dens = density(x, z);
    if (acc > dens * 0.85) continue;
    const kind = species(x, z, u, v);
    if (inViewCone(x, z, SPACING[kind] * 0.6)) continue;
    const scale = kind === 'sapling' ? 0.8 + r() * 0.5 : 0.82 + r() * 0.36;
    const rad = SPACING[kind] * scale * 0.5;
    // denser along the kora: spacing factor < 1
    const tight = roadDist(KORA, x, z).edge < 14 ? 0.8 : 1;
    if (trunks.near(x, z, rad, tight)) continue;
    trunks.add(x, z, rad);
    push(kind, x, z, scale);
  }

  // 2. understory: bushes at forest edges and under trees, ferns in the shade, rocks scattered
  const U = 1.9;
  for (let z = -112; z <= 160; z += U) for (let x = -72; x <= 125; x += U) {
    const jx = x + (hash2(x * 2.1, z * 0.3) - 0.5) * U, jz = z + (hash2(x * 0.9, z * 2.7) - 0.5) * U;
    if (worldMask(jx, jz) < 0.65) continue;
    const roll = r();
    if (roll > 0.36) continue;
    if (!allowed(jx, jz, foot, 0.9)) continue;
    const tdist = trunks.nearest(jx, jz, 1);
    if (tdist < 0.9) continue;
    if (small.near(jx, jz, 0.55, 1)) continue;
    const shade = tdist < 3.2;
    const kora = roadDist(KORA, jx, jz).edge < 8;
    const k = r();
    let kind: TreeKind;
    if (k < 0.1) kind = r() < 0.6 ? 'rock' : 'rockFlat';
    else if (shade || kora) kind = k < 0.55 ? 'fern' : k < 0.85 ? 'bush' : 'bushDry';
    else kind = k < 0.25 ? 'fern' : k < 0.75 ? 'bush' : 'bushDry';
    // thin out the open ground a little more than the woods
    if (!shade && !kora && r() < 0.35) continue;
    small.add(jx, jz, kind === 'fern' ? 0.4 : 0.6);
    const sc = kind === 'rock' ? 0.7 + r() * 0.9 : kind === 'rockFlat' ? 0.8 + r() * 0.6 : 0.75 + r() * 0.5;
    push(kind, jx, jz, sc);
  }

  // 3. crowns that would hide the market's open yards from the default camera go (after planning, so the
  //    rest of the forest and its understory stay exactly as they were)
  const kept = items.filter((it) => it.fixed || !isTree(it.kind) || !hidesYard(it));

  const counts: Record<string, number> = {};
  for (const it of kept) counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  return { items: kept, counts };
}
