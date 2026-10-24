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
const key = (i: number, j: number) => i * 73856093 ^ j * 19349663;

/** Closest point on a collider to (px, pz) in xz, and whether p is inside. */
function closest(c: Collider, px: number, pz: number) {
  if (c.kind === 'circle') {
    const dx = px - c.x, dz = pz - c.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    return { cx: c.x + (dx / d) * c.r, cz: c.z + (dz / d) * c.r, inside: d < c.r, nx: dx / d, nz: dz / d, depth: c.r - d };
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
  return { cx: c.x + wx, cz: c.z + wz, inside, nx, nz, depth };
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
    const seen = new Set<Collider>();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.grid.get(key(i, j));
      if (!list) continue;
      for (const c of list) if (!seen.has(c)) { seen.add(c); out.push(c); }
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
   * (feetY + stepUp, feetY + h). Mutates p.x / p.z. Returns true if anything was hit.
   */
  resolve(p: { x: number; z: number }, r: number, feetY: number, h: number, stepUp: number): boolean {
    let hit = false;
    const lo = feetY + stepUp, hi = feetY + h;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const near = this.query(p.x, p.z, r + 0.5, _q);
      for (const c of near) {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        const k = closest(c, p.x, p.z);
        const pen = k.inside ? k.depth + r : r + k.depth; // depth is negative distance when outside
        if (pen > 0) { p.x += k.nx * pen; p.z += k.nz * pen; moved = hit = true; }
      }
      for (const c of this.dynamic) {
        if (c.y1 <= lo || c.y0 >= hi) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1e-6;
        const pen = r + c.r - d;
        if (pen > 0) { p.x += (dx / d) * pen; p.z += (dz / d) * pen; moved = hit = true; }
      }
      if (!moved) break;
    }
    return hit;
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

  /** Segment test for camera collision: returns the fraction [0, 1] along a→b of the first hit. */
  segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, pad = 0.2): number {
    let best = 1;
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5) + 1;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      if (y < groundY(x, z) + pad) return Math.max(0, (s - 1) / steps);
      for (const c of this.query(x, z, pad, _q)) {
        if (y < c.y0 - pad || y > c.y1 + pad) continue;
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
export const collision = new CollisionWorld();

/** True if a point can be walked to (inside the town rim). */
export const inBounds = walkable;
