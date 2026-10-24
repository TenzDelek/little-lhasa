// Collision world for a 2.5D town: every collider is a vertical prism (rotated box or circle) spanning
// [y0, y1]. The player is a vertical cylinder. Things lower than the step height are stepped onto; tops of
// colliders are standable (jump onto walls, benches, steps, low roofs). Ground comes from terrain.groundY.
//
//   const off = collision.addBox({ x, z, w: 4, d: 3, rot: ry, y0: baseY, y1: baseY + 6, tag: 'building' });
//   // ...later: off()  (remove)
//
// Static colliders go in a spatial hash. Dynamic ones (NPCs, animals) are objects whose x/z the owner
// mutates every frame (addDynamic); they only block, they are never stood on.
import { groundY, walkable } from '../world/terrain';

export interface BoxCollider {
  kind: 'box';
  /** Centre in xz. */
  x: number; z: number;
  /** Full width (local x) and depth (local z). */
  w: number; d: number;
  /** Rotation about y (radians), same convention as Object3D.rotation.y. */
  rot: number;
  /** Bottom and top heights. */
  y0: number; y1: number;
  tag?: string;
}
export interface CircleCollider {
  kind: 'circle';
  x: number; z: number; r: number;
  y0: number; y1: number;
  tag?: string;
}
export type Collider = BoxCollider | CircleCollider;
export type BoxInit = Omit<BoxCollider, 'kind' | 'rot'> & { rot?: number };
export type CircleInit = Omit<CircleCollider, 'kind'>;

const CELL = 8;
// unique per cell for |i|, |j| < 4096 (cells are 8 m, so ±32 km): no unrelated cells share a bucket
const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

/** Result of closest(): one shared scratch object (no per-call allocation) — read it before the next call. */
const _hit = { cx: 0, cz: 0, inside: false, nx: 0, nz: 0, depth: 0 };
const setHit = (cx: number, cz: number, inside: boolean, nx: number, nz: number, depth: number) => {
  _hit.cx = cx; _hit.cz = cz; _hit.inside = inside; _hit.nx = nx; _hit.nz = nz; _hit.depth = depth;
  return _hit;
};

/** Closest point on a collider to (px, pz) in xz, and whether p is inside. Returns the shared `_hit`. */
function closest(c: Collider, px: number, pz: number) {
  if (c.kind === 'circle') {
    let dx = px - c.x, dz = pz - c.z;
    if (dx * dx + dz * dz < 1e-12) { dx = 1e-6; dz = 0; } // dead centre: pick a side rather than a zero push
    const d = Math.hypot(dx, dz);
    return setHit(c.x + (dx / d) * c.r, c.z + (dz / d) * c.r, d < c.r, dx / d, dz / d, c.r - d);
  }
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  // world → local: rotate by −rot about y
  const dx = px - c.x, dz = pz - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const hx = c.w / 2, hz = c.d / 2;
  const inside = Math.abs(lx) < hx && Math.abs(lz) < hz;
  let qx: number, qz: number, nlx = 0, nlz = 0, depth = 0;
  if (inside) {
    // push out through the nearest face
    const ex = hx - Math.abs(lx), ez = hz - Math.abs(lz);
    if (ex < ez) { qx = Math.sign(lx) * hx; qz = lz; nlx = Math.sign(lx) || 1; depth = ex; }
    else { qx = lx; qz = Math.sign(lz) * hz; nlz = Math.sign(lz) || 1; depth = ez; }
  } else {
    qx = Math.max(-hx, Math.min(hx, lx)); qz = Math.max(-hz, Math.min(hz, lz));
    const ox = lx - qx, oz = lz - qz, L = Math.hypot(ox, oz) || 1e-6;
    nlx = ox / L; nlz = oz / L; depth = -L;
  }
  // local → world: rotate by +rot
  const wx = qx * cs + qz * sn, wz = -qx * sn + qz * cs;
  const nx = nlx * cs + nlz * sn, nz = -nlx * sn + nlz * cs;
  return setHit(c.x + wx, c.z + wz, inside, nx, nz, depth);
}

function footprintRadius(c: Collider) {
  return c.kind === 'circle' ? c.r : Math.hypot(c.w, c.d) / 2;
}

class CollisionWorld {
  private grid = new Map<number, Collider[]>();
  private all = new Set<Collider>();
  private dynamic = new Set<CircleCollider>();
  /** Bumped whenever static colliders change (lets caches invalidate). */
  version = 0;

  add(c: Collider): () => void {
    const r = footprintRadius(c);
    const i0 = Math.floor((c.x - r) / CELL), i1 = Math.floor((c.x + r) / CELL);
    const j0 = Math.floor((c.z - r) / CELL), j1 = Math.floor((c.z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(c);
    }
    this.all.add(c);
    this.version++;
    return () => this.remove(c);
  }
  remove(c: Collider) {
    if (!this.all.delete(c)) return;
    for (const list of this.grid.values()) {
      const idx = list.indexOf(c);
      if (idx >= 0) list.splice(idx, 1);
    }
    this.version++;
  }
  addBox(b: BoxInit) { return this.add({ kind: 'box', rot: 0, ...b }); }
  addCircle(c: CircleInit) { return this.add({ kind: 'circle', ...c }); }

  /** Moving blockers (NPCs, animals, carts). Mutate the returned object's x / z / y0 / y1 each frame. */
  addDynamic(c: CircleInit): { collider: CircleCollider; remove: () => void } {
    const collider: CircleCollider = { kind: 'circle', ...c };
    this.dynamic.add(collider);
    return { collider, remove: () => { this.dynamic.delete(collider); } };
  }

  /** Static colliders whose footprint might touch a circle at (x, z) of radius r. */
  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    const single = i0 === i1 && j0 === j1;
    if (!single) _seen.clear();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.grid.get(key(i, j));
      if (!list) continue;
      if (single) { for (const c of list) out.push(c); continue; }
      for (const c of list) if (!_seen.has(c)) { _seen.add(c); out.push(c); }
    }
    return out;
  }

  /**
   * Height the cylinder can stand on at (x, z): the ground, or the highest collider top under the footprint
   * that is not above feetY + stepUp.
   */
  supportY(x: number, z: number, r: number, feetY: number, stepUp: number): number {
    let y = groundY(x, z);
    for (const c of this.query(x, z, r, _q)) {
      if (c.y1 > feetY + stepUp || c.y1 <= y) continue;
      const h = closest(c, x, z);
      if (h.inside || -h.depth < r * 0.7) y = c.y1;
    }
    return y;
  }

  /**
   * Push a cylinder (feet at feetY, height h) out of every collider whose vertical span overlaps
   * (feetY + stepUp, feetY + h). Mutates p.x / p.z. Returns true if anything was hit. `dynamics` = false
   * leaves the moving bodies out (static town only).
   */
  resolve(p: { x: number; z: number }, r: number, feetY: number, h: number, stepUp: number, dynamics = true): boolean {
    let hit = false;
    const lo = feetY + stepUp, hi = feetY + h;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const near = this.query(p.x, p.z, r + 0.5, _q);
      for (const c of near) {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        const k = closest(c, p.x, p.z);
        const pen = k.inside ? k.depth + r : r + k.depth; // depth is negative distance when outside
        if (pen > 0) { p.x += k.nx * pen; p.z += k.nz * pen; moved = hit = true; }
      }
      if (dynamics) for (const c of this.dynamic) {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        let dx = p.x - c.x, dz = p.z - c.z;
        if (dx * dx + dz * dz < 1e-12) { dx = 1e-6; dz = 0; }
        const d = Math.hypot(dx, dz);
        const pen = r + c.r - d;
        if (pen > 0) { p.x += (dx / d) * pen; p.z += (dz / d) * pen; moved = hit = true; }
      }
      if (!moved) break;
    }
    return hit;
  }

  /**
   * Deepest overlap (m) of a cylinder with any static collider spanning (feetY + stepUp, feetY + h); 0 when
   * free. Used after resolve() to spot a squeeze (a gap narrower than the cylinder, where pushes cancel out).
   */
  penetration(p: { x: number; z: number }, r: number, feetY: number, h: number, stepUp: number): number {
    const lo = feetY + stepUp, hi = feetY + h;
    let worst = 0;
    for (const c of this.query(p.x, p.z, r + 0.5, _q)) {
      if (c.y1 <= lo || c.y0 >= hi) continue;
      const k = closest(c, p.x, p.z);
      const pen = k.inside ? k.depth + r : r + k.depth;
      if (pen > worst) worst = pen;
    }
    return worst;
  }

  /**
   * Falling from fromY to toY: if a collider top the cylinder is sinking past (it starts to block during this
   * drop) leaves no room to stand beside it — the cylinder would end wedged in a gap narrower than itself, e.g.
   * between a stair landing and a house wall — return that top and write into `out` a position nudged onto its
   * edge so supportY() keeps it there. Returns -Infinity when the drop is clear.
   */
  squeezeTop(x: number, z: number, r: number, fromY: number, toY: number, h: number, stepUp: number, out: { x: number; z: number }): number {
    let top = -Infinity, best: Collider | null = null;
    for (const c of this.query(x, z, r + 0.5, _q2)) {
      // only things that begin to block during this drop (already-blocking ones were resolved sideways)
      if (c.y1 > fromY + stepUp || c.y1 <= toY + stepUp || c.y0 >= toY + h || c.y1 <= top) continue;
      const k = closest(c, x, z);
      if (k.inside || -k.depth < r) { top = c.y1; best = c; }
    }
    if (!best) return -Infinity;
    out.x = x; out.z = z;
    this.resolve(out, r, toY, h, stepUp);
    if (this.penetration(out, r, toY, h, stepUp) <= 0.03) return -Infinity; // room to fall beside it
    // land on its edge: move the centre to (just inside) the nearest point of its footprint
    const k = closest(best, x, z);
    if (k.inside) { out.x = x; out.z = z; }
    else { out.x = k.cx - k.nx * 0.03; out.z = k.cz - k.nz * 0.03; }
    return top;
  }

  /** Lowest collider bottom above `fromY` overlapping the circle (for head bumps); Infinity if none. */
  ceilingY(x: number, z: number, r: number, fromY: number): number {
    let y = Infinity;
    for (const c of this.query(x, z, r, _q)) {
      if (c.y0 < fromY) continue;
      const k = closest(c, x, z);
      if (k.inside || -k.depth < r) y = Math.min(y, c.y0);
    }
    return y;
  }

  /**
   * Segment test for camera collision: returns the fraction [0, 1] along a→b of the first hit (sampled every
   * 0.5 m). `minSize` (m, optional) lets thin things through: colliders whose footprint is narrower than that
   * in both directions (posts, poles, lamp standards) are ignored.
   */
  segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, pad = 0.2, minSize = 0): number {
    let best = 1;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5) + 1;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < groundY(x, z) + pad) return Math.max(0, (s - 1) / steps);
      for (const c of this.query(x, z, pad, _q)) {
        if (y < c.y0 - pad || y > c.y1 + pad) continue;
        if (minSize > 0 && (c.kind === 'circle' ? 2 * c.r : Math.max(c.w, c.d)) < minSize) continue;
        const k = closest(c, x, z);
        if (k.inside || -k.depth < pad) { best = Math.max(0, (s - 1) / steps); return best; }
      }
    }
    return best;
  }

  /** Debug: every static collider. */
  list() { return [...this.all]; }
  /** Read-only view of the moving blockers (NPCs, animals, the puppy) for steering around each other. */
  dynamics(): ReadonlySet<CircleCollider> { return this.dynamic; }
}

const _q: Collider[] = [];
const _q2: Collider[] = [];
/** query()'s de-duplication set, reused (queries never nest). */
const _seen = new Set<Collider>();
export const collision = new CollisionWorld();

/** True if a point can be walked to (inside the town rim). */
export const inBounds = walkable;
