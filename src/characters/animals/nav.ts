// Shared helpers for the animals: ground / perch heights, collision-aware stepping, positional sound,
// rooftop perches found at runtime from the building colliders, and optional spots exported by other
// modules (loaded with import.meta.glob so this folder compiles whether or not they exist yet).
import { Raycaster, Vector3, type Mesh, type Object3D } from 'three';
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

/** True if a body (radius r, height h) at (x, y, z) overlaps any solid collider. */
export function blocked(x: number, y: number, z: number, r: number, h: number) {
  const p = { x, z };
  return collision.resolve(p, r, y, h, 0.05);
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

// ---- real rooftop heights ------------------------------------------------------------------------------------
// Building colliders stop at the roof floor; parapets and tin roofs rise above it. To seat a monkey on the
// parapet / roof slope we cast a ray down onto the rendered town geometry (static, non-skinned meshes only).
const _ray = new Raycaster();
const _down = new Vector3(0, -1, 0);
const _o = new Vector3();
let probeScene: Object3D | null = null;
let probeList: Mesh[] = [];
let probeVersion = -1;
const probeCache = new Map<number, number>();

export function setProbeScene(scene: Object3D) { probeScene = scene; probeVersion = -1; }

function refreshProbeList() {
  if (!probeScene || probeVersion === collision.version) return;
  probeVersion = collision.version;
  probeCache.clear();
  probeList = [];
  probeScene.traverse((o) => {
    const m = o as Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean };
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || !m.visible) return;
    const g = m.geometry;
    if (!g?.attributes?.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    // skip the terrain / grass blankets: huge and never what a monkey sits on
    if (g.boundingSphere!.radius > 70) return;
    probeList.push(m);
  });
}

/**
 * Height of the highest rendered surface at (x, z) within [approxY − 0.3, approxY + rise] (the parapet
 * top or tin roof over a building collider whose top is approxY). Falls back to approxY.
 */
export function topAt(x: number, z: number, approxY: number, rise = 2.6): number {
  refreshProbeList();
  if (!probeList.length) return approxY;
  const key = Math.round(x * 5) * 100003 + Math.round(z * 5) * 7 + Math.round(approxY);
  const hit = probeCache.get(key);
  if (hit !== undefined) return hit;
  _ray.set(_o.set(x, approxY + rise + 0.05, z), _down);
  _ray.near = 0; _ray.far = rise + 0.4;
  const hits = _ray.intersectObjects(probeList, false);
  let y = approxY;
  for (const h of hits) { if (h.point.y >= approxY - 0.3) { y = Math.max(approxY, h.point.y); break; } }
  probeCache.set(key, y);
  return y;
}

const _dir = new Vector3();
/** True if rendered geometry blocks the line from (x, y, z) toward direction (dx, dy, dz) within `far` metres. */
export function blockedToward(x: number, y: number, z: number, dx: number, dy: number, dz: number, far = 22): boolean {
  refreshProbeList();
  if (!probeList.length) return false;
  _ray.set(_o.set(x, y, z), _dir.set(dx, dy, dz).normalize());
  _ray.near = 0.45; _ray.far = far;
  return _ray.intersectObjects(probeList, false).length > 0;
}
