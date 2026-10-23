// Parts: a tiny "kitbash" builder. Add boxes / cylinders / wedges with flat vertex colours (and optional
// glow), under a transform stack, then merge everything into one (or a few chunked) meshes.
// Pattern (Gorshey style): build each object out of many small coloured primitives, merge per area so a
// whole block of buildings is one draw call.
//
//   const p = new Parts();
//   p.group([x, y, z], rotY, () => {
//     p.box(4, 3, 3, [0, 1.5, 0], PAL.wallCream);            // centre-positioned box
//     p.slab(-2, 3, -1.5, 2, 3.15, 1.5, PAL.concrete);        // min/max box
//     p.box(0.6, 0.8, 0.05, [1, 1.8, 1.53], PAL.glass, { emit: PAL.windowLit, emitNight: true });
//   });
//   scene.add(...p.toMeshes(partsMaterial({ occlude: true })));
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4,
  Mesh, Quaternion, Vector3, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { partsMaterial } from './materials';

export type V3 = readonly [number, number, number];

export interface PartOpts {
  /** Full Euler rotation (radians) of this primitive about its own centre/base. */
  rot?: V3;
  /** Glow colour (sRGB hex). */
  emit?: number;
  /** Glow intensity multiplier (default 1). */
  emitIntensity?: number;
  /** Glow only at night (windows, lamps). Default false. */
  emitNight?: boolean;
}

interface Item { geo: BufferGeometry; cx: number; cz: number }

const _c = new Color();
const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3(1, 1, 1);
const _p = new Vector3();

function prep(geo: BufferGeometry, hex: number, o?: PartOpts): BufferGeometry {
  const g = geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  _c.setHex(hex);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const em = new Float32Array(n * 4);
  if (o?.emit !== undefined) {
    _c.setHex(o.emit).multiplyScalar(o.emitIntensity ?? 1);
    const mode = o.emitNight ? 2 : 1;
    for (let i = 0; i < n; i++) { em[i * 4] = _c.r; em[i * 4 + 1] = _c.g; em[i * 4 + 2] = _c.b; em[i * 4 + 3] = mode; }
  }
  g.setAttribute('emit', new Float32BufferAttribute(em, 4));
  if (!g.index) {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new BufferAttribute(idx, 1));
  }
  return g;
}

/** Triangular prism: base w (x) by d (z), apex height h, ridge along z. Origin at base centre. */
export function prismGeometry(w: number, h: number, d: number, apexX = 0): BufferGeometry {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const P = [
    [x0, 0, z1], [x1, 0, z1], [apexX, h, z1], // front tri
    [x1, 0, z0], [x0, 0, z0], [apexX, h, z0], // back tri
  ];
  const tris: number[][] = [
    [0, 1, 2], [3, 4, 5],
    [1, 3, 5], [1, 5, 2], // right slope
    [4, 0, 2], [4, 2, 5], // left slope
    [4, 3, 1], [4, 1, 0], // bottom
  ];
  const pos: number[] = [];
  for (const t of tris) for (const i of t) pos.push(...P[i]);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Frustum/tapered box: bottom w0 x d0, top w1 x d1, height h. Origin at base centre. */
export function taperGeometry(w0: number, d0: number, w1: number, d1: number, h: number): BufferGeometry {
  const g = new BoxGeometry(1, h, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? w1 : w0));
    p.setZ(i, p.getZ(i) * (top ? d1 : d0));
    p.setY(i, p.getY(i) + h / 2);
  }
  g.computeVertexNormals();
  return g;
}

export class Parts {
  private items: Item[] = [];
  private stack: Matrix4[] = [new Matrix4()];

  get size() { return this.items.length; }
  get matrix() { return this.stack[this.stack.length - 1]; }

  /** Run fn with an extra transform (translate, then rotate about y, then optional scale). */
  group(pos: V3, rotY: number, fn: () => void, scale = 1) {
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(0, rotY, 0)), _s.set(scale, scale, scale));
    this.stack.push(this.matrix.clone().multiply(_m));
    try { fn(); } finally { this.stack.pop(); }
  }
  /** Same as group() with a full Euler rotation. */
  groupEuler(pos: V3, rot: V3, fn: () => void) {
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(1, 1, 1));
    this.stack.push(this.matrix.clone().multiply(_m));
    try { fn(); } finally { this.stack.pop(); }
  }

  /** Add any geometry (it is consumed). `local` places it relative to the current group. */
  add(geo: BufferGeometry, color: number, at: V3 = [0, 0, 0], o?: PartOpts) {
    const g = prep(geo, color, o);
    _m.compose(_p.set(at[0], at[1], at[2]), _q.setFromEuler(_e.set(o?.rot?.[0] ?? 0, o?.rot?.[1] ?? 0, o?.rot?.[2] ?? 0)), _s.set(1, 1, 1));
    g.applyMatrix4(this.matrix.clone().multiply(_m));
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    this.items.push({ geo: g, cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2 });
    return this;
  }

  /** Box of size w x h x d centred at `c`. */
  box(w: number, h: number, d: number, c: V3, color: number, o?: PartOpts) {
    return this.add(new BoxGeometry(w, h, d), color, c, o);
  }
  /** Axis-aligned box from min corner to max corner (in group space). */
  slab(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, o?: PartOpts) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    return this.box(w, h, d, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color, o);
  }
  /** Cylinder standing on `base` (radius top / bottom, height h). */
  cyl(rTop: number, rBot: number, h: number, base: V3, color: number, segs = 8, o?: PartOpts) {
    const g = new CylinderGeometry(rTop, rBot, h, segs, 1);
    g.translate(0, h / 2, 0);
    return this.add(g, color, base, o);
  }
  /** Cone standing on `base`. */
  cone(r: number, h: number, base: V3, color: number, segs = 8, o?: PartOpts) {
    return this.cyl(0, r, h, base, color, segs, o);
  }
  /** Gable / wedge: triangular prism on `base`, ridge along local z. */
  prism(w: number, h: number, d: number, base: V3, color: number, o?: PartOpts) {
    return this.add(prismGeometry(w, h, d), color, base, o);
  }
  /** Tapered box (e.g. chorten tiers, temple walls that lean in). */
  taper(w0: number, d0: number, w1: number, d1: number, h: number, base: V3, color: number, o?: PartOpts) {
    return this.add(taperGeometry(w0, d0, w1, d1, h), color, base, o);
  }

  /** Merge everything into a single geometry (in the space Parts was built in). */
  merge(): BufferGeometry {
    if (!this.items.length) return new BufferGeometry();
    const g = mergeGeometries(this.items.map((i) => i.geo), false)!;
    g.computeBoundingSphere();
    return g;
  }

  /** One mesh with everything. */
  toMesh(material: Material = partsMaterial(), shadows = true): Mesh {
    const m = new Mesh(this.merge(), material);
    m.castShadow = shadows; m.receiveShadow = true;
    return m;
  }

  /** Several meshes, one per `chunk`-metre square of the xz plane (better culling for big areas). */
  toMeshes(material: Material = partsMaterial(), chunk = 24, shadows = true): Mesh[] {
    const groups = new Map<string, BufferGeometry[]>();
    for (const it of this.items) {
      const k = `${Math.floor(it.cx / chunk)},${Math.floor(it.cz / chunk)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(it.geo);
    }
    const out: Mesh[] = [];
    for (const list of groups.values()) {
      const g = mergeGeometries(list, false)!;
      g.computeBoundingSphere();
      const m = new Mesh(g, material);
      m.castShadow = shadows; m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }
}
