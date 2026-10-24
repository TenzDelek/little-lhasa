// Shared helpers for the animals: ground / perch heights, collision-aware stepping, positional sound,
// rooftop perches found at runtime from the building colliders (seated on the real parapet / roof edge by
// batched, time-sliced top-surface queries over the rendered town), spots the default camera can see, and
// optional spots exported by other modules (loaded with import.meta.glob so this folder compiles whether or
// not they exist yet).
import { Box3, Vector3, type Mesh, type Object3D } from 'three';
import { collision, type Collider, type BoxCollider } from '../../core/collision';
import { game } from '../../core/game';
import { clamp } from '../../core/math';
import { sfx, type SfxName } from '../../audio/sfx';
import { groundY, walkable, roadQuery } from '../../world/terrain';
import { G } from '../../game/store';

// ---- optional spots from other modules ---------------------------------------------------------------------
type XZY = { x: number; z: number; y?: number; yaw?: number };
const spotMods = import.meta.glob('../../world/*/spots.ts', { eager: true }) as Record<string, Record<string, unknown>>;
const npcMods = import.meta.glob('../npcs/spots.ts', { eager: true }) as Record<string, Record<string, unknown>>;

/** Look up an exported spot, e.g. optSpot('hillside', 'PUPPY_NOOK'). */
export function optSpot(module: string, name: string, key?: string): XZY | undefined {
  const m = spotMods[`../../world/${module}/spots.ts`] ?? (module === 'npcs' ? npcMods['../npcs/spots.ts'] : undefined);
  const v = m?.[name] as Record<string, unknown> | undefined;
  const o = (key ? v?.[key] : v) as XZY | undefined;
  return o && typeof o.x === 'number' && typeof o.z === 'number' ? o : undefined;
}

// ---- time of day ---------------------------------------------------------------------------------------------
export const isNight = () => G().night;

// ---- positional sound ----------------------------------------------------------------------------------------
/** Play a sound at a world position: volume falls off with distance from the boy, panned by the camera. */
export function sfxAt(name: SfxName, x: number, z: number, vol = 1, range = 22) {
  const p = game.player.pos;
  const dx = x - p.x, dz = z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return;
  const v = vol * clamp(1 - d / range) ** 1.4;
  if (v < 0.03) return;
  // camera right vector (iso: camera looks along (-sin az, -cos az))
  const az = game.cam.mode === 'iso' ? game.cam.azimuth : game.cam.yaw;
  const fx = -Math.sin(az), fz = -Math.cos(az);
  const rx = -fz, rz = fx;
  const pan = d > 0.01 ? clamp(((dx * rx + dz * rz) / d) * 0.8, -0.8, 0.8) : 0;
  sfx(name, { volume: v, pan });
}

// ---- ground ------------------------------------------------------------------------------------------------------
/** Height an animal of radius r stands at (ground, or a low collider top it can step onto). */
export function floorAt(x: number, z: number, feetY: number, r = 0.15, stepUp = 0.42) {
  return collision.supportY(x, z, r, feetY, stepUp);
}

/** True if a body (radius r, height h) at (x, y, z) overlaps any solid collider (`dynamics` = false: the
 *  static town only, not people and animals passing by). */
export function blocked(x: number, y: number, z: number, r: number, h: number, dynamics = true) {
  const p = { x, z };
  return collision.resolve(p, r, y, h, 0.05, dynamics);
}

export interface Walker {
  pos: Vector3;
  vy: number;
  grounded: boolean;
  r: number;
  h: number;
  stepUp: number;
  /** Own dynamic collider (parked while this walker resolves, so it does not push itself). */
  dyn?: { x: number; z: number };
}

const _p = { x: 0, z: 0 };

/**
 * Move a walker by (dx, dz) with collisions against the town (walls, stalls, other dynamic bodies) and the
 * diorama rim, then settle it on the floor / apply gravity. Returns the fraction of the move achieved.
 */
export function walk(w: Walker, dx: number, dz: number, dt: number, gravity = 22): number {
  const pos = w.pos;
  const x0 = pos.x, z0 = pos.z;
  const want = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(want / 0.1));
  let px = 0, pz = 0;
  if (w.dyn) { px = w.dyn.x; pz = w.dyn.z; w.dyn.x = 1e6; w.dyn.z = 1e6; }
  for (let i = 0; i < n; i++) {
    const ox = pos.x, oz = pos.z;
    _p.x = pos.x + dx / n; _p.z = pos.z + dz / n;
    collision.resolve(_p, w.r, pos.y, w.h, w.stepUp);
    if (!walkable(_p.x, _p.z)) {
      if (walkable(_p.x, oz)) _p.z = oz;
      else if (walkable(ox, _p.z)) _p.x = ox;
      else { _p.x = ox; _p.z = oz; }
    }
    pos.x = _p.x; pos.z = _p.z;
  }
  if (w.dyn) { w.dyn.x = px; w.dyn.z = pz; }
  // vertical
  const sup = floorAt(pos.x, pos.z, pos.y, w.r * 0.8, w.stepUp);
  w.vy -= gravity * dt;
  let ny = pos.y + w.vy * dt;
  if (w.grounded && w.vy <= 0 && sup < pos.y && pos.y - sup < 0.45) ny = sup;
  if (ny <= sup) { ny = sup; w.vy = Math.max(0, w.vy); w.grounded = true; }
  else w.grounded = ny - sup < 0.02;
  // never sink below the terrain
  const g = groundY(pos.x, pos.z);
  if (ny < g - 1) { ny = g; w.vy = 0; }
  pos.y = ny;
  return want > 1e-5 ? Math.hypot(pos.x - x0, pos.z - z0) / want : 1;
}

/** A free spot near (x, z) for a body of radius r (spiral search), or null. */
export function freeSpot(x: number, z: number, r: number, h = 0.5, maxR = 2.5): { x: number; y: number; z: number } | null {
  for (let ring = 0; ring <= 6; ring++) {
    const rad = (ring / 6) * maxR;
    const n = ring === 0 ? 1 : 8 + ring * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.7;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      if (!walkable(px, pz)) continue;
      const y = floorAt(px, pz, groundY(px, pz) + 0.1, r, 0.3);
      if (Math.abs(y - groundY(px, pz)) > 0.45) continue;
      if (!blocked(px, y, pz, r, h)) return { x: px, y, z: pz };
    }
  }
  return null;
}

// ---- seen from the default camera ---------------------------------------------------------------------------
/** Direction toward the default iso camera (south-east, ~36° up). */
export const TO_CAM = [0.6, 0.62, 0.6] as const;

/**
 * Like freeSpot, but the default camera must also see the spot (no collider between it and the south-east sky),
 * so a dog asleep on a pavement is not tucked behind a house. Closest such spot within maxR, or null.
 */
export function seenSpot(x: number, z: number, r: number, h = 0.5, maxR = 3.5): { x: number; y: number; z: number } | null {
  for (let ring = 0; ring <= 8; ring++) {
    const rad = (ring / 8) * maxR;
    const n = ring === 0 ? 1 : 8 + ring * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.7;
      const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      if (!walkable(px, pz) || roadQuery(px, pz).edge < -1.2) continue; // the gutter at most, not mid-road
      const g = groundY(px, pz);
      const y = floorAt(px, pz, g + 0.1, r, 0.3);
      if (Math.abs(y - g) > 0.45) continue;
      if (blocked(px, y, pz, r, h)) continue;
      if (!openToward(px, y + 0.3, pz, TO_CAM[0], TO_CAM[1], TO_CAM[2], 18)) continue;
      return { x: px, y, z: pz };
    }
  }
  return null;
}

// ---- rooftop / wall perches --------------------------------------------------------------------------------
export interface Perch {
  x: number; y: number; z: number;
  /** Facing (yaw) — out over the street. */
  yaw: number;
  /** Edge direction (unit xz) and how far the edge runs either side of (x, z). */
  ex: number; ez: number; half: number;
  /** Collider it belongs to (null = ground). */
  owner: Collider | null;
  /** Edge turned toward the default camera rather than the street. */
  view?: boolean;
}

const _list: Collider[] = [];
function insideOther(c: Collider, x: number, y: number, z: number) {
  for (const o of collision.query(x, z, 0.3, _list)) {
    if (o === c || o.y1 < y + 0.25 || o.y0 > y + 0.5) continue;
    if (o.kind === 'circle') { if (Math.hypot(x - o.x, z - o.z) < o.r + 0.2) return true; continue; }
    const cs = Math.cos(o.rot), sn = Math.sin(o.rot);
    const dx = x - o.x, dz = z - o.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (Math.abs(lx) < o.w / 2 + 0.2 && Math.abs(lz) < o.d / 2 + 0.2) return true;
  }
  return false;
}

/**
 * Perches along the edges of box colliders that pass `filter`: one per face that looks toward the nearest
 * road (monkeys sit facing the street), inset `inset` from the edge.
 */
export function roofPerches(filter: (c: BoxCollider) => boolean, inset = 0.28, minHalf = 0.6, view?: readonly [number, number]): Perch[] {
  const out: Perch[] = [];
  for (const c of collision.list()) {
    if (c.kind !== 'box' || !filter(c)) continue;
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    // local axes in world: x̂ = (cs, −sn), ẑ = (sn, cs); pick the face whose outside is nearest a road
    const faces = [
      { nx: sn, nz: cs, half: c.w / 2, off: c.d / 2, ex: cs, ez: -sn },     // +z (front)
      { nx: -sn, nz: -cs, half: c.w / 2, off: c.d / 2, ex: cs, ez: -sn },   // −z
      { nx: cs, nz: -sn, half: c.d / 2, off: c.w / 2, ex: sn, ez: cs },     // +x
      { nx: -cs, nz: sn, half: c.d / 2, off: c.w / 2, ex: sn, ez: cs },     // −x
    ];
    let best = faces[0], bestD = Infinity;
    for (const fc of faces) {
      const px = c.x + fc.nx * (fc.off + 1.5), pz = c.z + fc.nz * (fc.off + 1.5);
      const d = roadQuery(px, pz).edge;
      if (d < bestD) { bestD = d; best = fc; }
    }
    const picks = [best];
    // optionally also the face turned most toward the camera (sitting there, they are not hidden by the roof)
    if (view) {
      let vb = faces[0], vd = -Infinity;
      for (const fc of faces) { const d = fc.nx * view[0] + fc.nz * view[1]; if (d > vd) { vd = d; vb = fc; } }
      if (vb !== best) picks.push(vb);
    }
    for (const fc of picks) {
      if (fc.half < minHalf) continue;
      const ins = Math.min(inset, fc.off * 0.5);
      const x = c.x + fc.nx * (fc.off - ins), z = c.z + fc.nz * (fc.off - ins);
      const half = fc.half - Math.min(0.35, fc.half * 0.5);
      // drop perches whose edge is buried in a taller neighbour
      if (insideOther(c, x, c.y1, z)) continue;
      out.push({ x, y: c.y1, z, yaw: Math.atan2(fc.nx, fc.nz), ex: fc.ex, ez: fc.ez, half: Math.max(0.1, half), owner: c, view: fc !== best });
    }
  }
  return out;
}

/** Point on a perch edge at offset u (−half..half). */
export function perchPoint(p: Perch, u: number, out = new Vector3()) {
  const k = Math.max(-p.half, Math.min(p.half, u));
  return out.set(p.x + p.ex * k, p.y, p.z + p.ez * k);
}

export const hdist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Shared registry so dogs can bark at monkeys. */
export const animalsBus = {
  monkeys: [] as { pos: Vector3; leaping: boolean }[],
};

// ---- real rooftop heights (batched) --------------------------------------------------------------------------
// Building colliders stop at the roof floor; parapets and tin roofs rise above it. To seat a monkey or a crow on
// the parapet / roof slope we need the highest RENDERED surface over a point. Raycasting the merged town meshes
// costs ~5 ms per ray (600k triangles, no BVH), so instead queries are queued (requestTop) and answered in one
// pass over the triangles, time-sliced across frames (pumpTops, ~1.5 ms a frame): O(triangles + queries) for the
// whole batch instead of O(triangles) per query. Answers are cached by position.

/**
 * "Highest rendered surface at (x, z) within [lo, hi]". Once done: hit = something was found there, and
 * y = max(approximate height, that surface).
 */
export interface TopQuery { x: number; z: number; lo: number; hi: number; y: number; best: number; hit: boolean; done: boolean }

const TCELL = 0.5;
const tkey = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
let probeScene: Object3D | null = null;
const tQueue: TopQuery[] = [];
const tCache = new Map<string, TopQuery>();
interface ProbeMesh { m: Mesh; pos: ArrayLike<number>; idx: ArrayLike<number> | null; tris: number; e: number[] | null }
interface TopJob { pts: TopQuery[]; grid: Map<number, TopQuery[]>; meshes: ProbeMesh[]; mi: number; ti: number; lo: number; hi: number }
let tJob: TopJob | null = null;

export function setProbeScene(scene: Object3D) { probeScene = scene; }

/** Queue (or fetch from the cache) a top-surface query over (x, z) for a collider top at approxY. */
export function requestTop(x: number, z: number, approxY: number, rise = 2.6): TopQuery {
  const key = `${Math.round(x * 20)},${Math.round(z * 20)},${Math.round(approxY * 20)},${Math.round(rise * 10)}`;
  let q = tCache.get(key);
  if (!q) {
    q = { x, z, lo: approxY - 0.3, hi: approxY + rise + 0.05, y: approxY, best: -Infinity, hit: false, done: false };
    tCache.set(key, q);
    tQueue.push(q);
  }
  return q;
}

/** Height a query reports right now: the answer when done, else the fallback. */
export const topOr = (q: TopQuery | undefined, fallback: number) => (q && q.done ? q.y : fallback);

const _box = new Box3();
function startJob(): TopJob | null {
  if (!probeScene || !tQueue.length) return null;
  const pts = tQueue.splice(0);
  const grid = new Map<number, TopQuery[]>();
  let lo = Infinity, hi = -Infinity;
  for (const q of pts) {
    const k = tkey(Math.floor(q.x / TCELL), Math.floor(q.z / TCELL));
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(q);
    lo = Math.min(lo, q.lo); hi = Math.max(hi, q.hi);
  }
  const meshes: ProbeMesh[] = [];
  probeScene.updateMatrixWorld();
  probeScene.traverse((o) => {
    const m = o as Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean };
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || !m.visible) return;
    const g = m.geometry;
    const pa = g?.attributes?.position;
    if (!pa || pa.itemSize !== 3 || (pa as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _box.copy(g.boundingBox!).applyMatrix4(m.matrixWorld);
    // skip the terrain / grass blankets (huge, never what anything perches on) and meshes nowhere near a query
    if (_box.max.x - _box.min.x > 140 || _box.max.z - _box.min.z > 140) return;
    if (_box.max.y < lo || _box.min.y > hi) return;
    let hit = false;
    for (const q of pts) {
      if (q.x >= _box.min.x && q.x <= _box.max.x && q.z >= _box.min.z && q.z <= _box.max.z && q.hi >= _box.min.y && q.lo <= _box.max.y) { hit = true; break; }
    }
    if (!hit) return;
    const e = m.matrixWorld.elements;
    const ident = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
    const idx = g.index ? g.index.array : null;
    meshes.push({ m, pos: pa.array, idx, tris: Math.floor((idx ? idx.length : pa.count) / 3), e: ident ? null : [...e] });
  });
  return { pts, grid, meshes, mi: 0, ti: 0, lo, hi };
}

const V = new Float32Array(9);
function triangle(job: TopJob) {
  const ax = V[0], ay = V[1], az = V[2], bx = V[3], by = V[4], bz = V[5], cx = V[6], cy = V[7], cz = V[8];
  if (Math.max(ay, by, cy) < job.lo || Math.min(ay, by, cy) > job.hi) return;
  const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(det) < 1e-7) return; // vertical face
  const x0 = Math.min(ax, bx, cx), x1 = Math.max(ax, bx, cx), z0 = Math.min(az, bz, cz), z1 = Math.max(az, bz, cz);
  const i0 = Math.floor(x0 / TCELL), i1 = Math.floor(x1 / TCELL), j0 = Math.floor(z0 / TCELL), j1 = Math.floor(z1 / TCELL);
  const test = (q: TopQuery) => {
    if (q.x < x0 || q.x > x1 || q.z < z0 || q.z > z1) return;
    const w1 = ((bz - cz) * (q.x - cx) + (cx - bx) * (q.z - cz)) / det;
    const w2 = ((cz - az) * (q.x - cx) + (ax - cx) * (q.z - cz)) / det;
    const w3 = 1 - w1 - w2;
    if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) return;
    const y = w1 * ay + w2 * by + w3 * cy;
    if (y >= q.lo && y <= q.hi && y > q.best) q.best = y;
  };
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > job.pts.length) { for (const q of job.pts) test(q); return; }
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const l = job.grid.get(tkey(i, j));
    if (l) for (const q of l) test(q);
  }
}

let pumpedAt = -1;
/**
 * Work on the queued top queries for up to `budgetMs` (once per frame, whoever calls first). Returns true
 * while there is work left.
 */
export function pumpTops(budgetMs = 1.5): boolean {
  if (pumpedAt === game.time) return !!tJob || tQueue.length > 0;
  pumpedAt = game.time;
  if (!tJob) tJob = startJob();
  const job = tJob;
  if (!job) return false;
  const t0 = performance.now();
  let n = 0;
  while (job.mi < job.meshes.length) {
    const pm = job.meshes[job.mi];
    const { pos, idx, e } = pm;
    while (job.ti < pm.tris) {
      const t = job.ti++;
      for (let k = 0; k < 3; k++) {
        const vi = (idx ? idx[t * 3 + k] : t * 3 + k) * 3;
        const x = pos[vi], y = pos[vi + 1], z = pos[vi + 2];
        if (e) {
          V[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          V[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          V[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        } else { V[k * 3] = x; V[k * 3 + 1] = y; V[k * 3 + 2] = z; }
      }
      triangle(job);
      if ((++n & 511) === 0 && performance.now() - t0 > budgetMs) return true;
    }
    job.mi++; job.ti = 0;
  }
  for (const q of job.pts) { q.hit = q.best > -Infinity; q.y = Math.max(q.y, q.best); q.done = true; }
  tJob = null;
  return tQueue.length > 0;
}

// ---- seats on roof edges ------------------------------------------------------------------------------------
// The collider face is often not where the roof edge is (upper floors overhang the recessed shop fronts,
// parapets sit on the outer line), so a seat probes a row of points across the edge, from 0.35 m inside to
// 0.85 m outside, and resolves to the highest surface of the unbroken run that starts on the roof: the parapet
// top or the real edge, never a wire beyond it.
export const EDGE_INSETS = [-0.35, -0.2, -0.05, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85];
export interface EdgeSeat { qs: TopQuery[]; y: number; off: number; ok: boolean }

/** Queue a seat at (x, z) on an edge whose outward normal is (nx, nz), for a collider top at approxY. */
export function edgeSeat(x: number, z: number, nx: number, nz: number, approxY: number): EdgeSeat {
  return { qs: EDGE_INSETS.map((o) => requestTop(x + nx * o, z + nz * o, approxY, 1.3)), y: approxY, off: 0, ok: false };
}

/** Resolve a seat once its queries are answered (ok = true; y and the outward offset off are final). */
export function resolveSeat(st: EdgeSeat): EdgeSeat {
  if (st.ok) return st;
  for (const q of st.qs) if (!q.done) return st;
  let bi = -1;
  for (let i = 0; i < st.qs.length; i++) {
    const q = st.qs[i];
    if (!q.hit) { if (bi >= 0) break; continue; } // the run ends at the first gap past the roof
    if (bi < 0 || q.y > st.qs[bi].y - 0.03) bi = i;   // higher, or as high and further out
  }
  st.y = bi >= 0 ? st.qs[bi].y : st.qs[0].y; st.off = bi >= 0 ? EDGE_INSETS[bi] : 0; st.ok = true;
  return st;
}

/** True if no collider blocks the line from (x, y, z) toward direction (dx, dy, dz) within `far` metres
 *  (posts and poles thinner than 0.35 m don't count: they never hide a dog or a monkey). */
export function openToward(x: number, y: number, z: number, dx: number, dy: number, dz: number, far = 22): boolean {
  const L = Math.hypot(dx, dy, dz) || 1;
  return collision.segment(x, y, z, x + (dx / L) * far, y + (dy / L) * far, z + (dz / L) * far, 0.05, 0.35) >= 0.999;
}

/** Debug: progress of the top-surface queries. */
export function topsStatus() {
  let done = 0;
  for (const q of tCache.values()) if (q.done) done++;
  return { queries: tCache.size, done, queued: tQueue.length, job: tJob ? `${tJob.mi}/${tJob.meshes.length}` : null };
}

