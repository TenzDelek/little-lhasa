// Market-street helpers: road distances, local→world transforms, footprint tests (so the two building
// rows, Market Lane and the neighbouring territories never overlap), and a few small geometry helpers.
import { BoxGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { PLAZAS, ROADS, roadById, roadFrame, type Road } from '../layout';
import type { Parts, V3, PartOpts } from '../../core/geom';
import type { BoxInit } from '../../core/collision';

export const TEMPLE = roadById('temple-road');
export const JOG = roadById('jogiwara-road');
export const LANE = roadById('market-lane');
export const KORA = roadById('kora-path');

/** Arc-length range of Market Lane that carries stalls (both sides). */
export const LANE_STALLS: readonly [number, number] = [6.0, 21.4];

export interface RoadDist { centre: number; edge: number; s: number; lateral: number }

/** Distance from (x, z) to one road: centre-line distance, edge distance, arc length, signed lateral. */
export function roadDist(road: Road, x: number, z: number): RoadDist {
  let best: RoadDist | null = null;
  let acc = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const cx = ax + dx * t, cz = az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (!best || d < best.centre) {
      best = { centre: d, edge: d - road.width / 2, s: acc + L * t, lateral: ((x - cx) * -dz + (z - cz) * dx) / L };
    }
    acc += L;
  }
  return best!;
}

/** A frame in the xz plane: position + yaw (front faces local +z). */
export interface Frame { x: number; z: number; yaw: number }

/** Local (lx, lz) in a frame → world [x, z]. */
export function toWorld(f: Frame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

/** Collider for a local box (centre lx, lz; size w x d) inside a frame. */
export function localBox(f: Frame, lx: number, lz: number, w: number, d: number, y0: number, y1: number, tag?: string): BoxInit {
  const [x, z] = toWorld(f, lx, lz);
  return { x, z, w, d, rot: f.yaw, y0, y1, tag };
}

/** Frame facing a road from arc length s on `side` at `edgeOff` metres outside its edge. */
export function roadsideFrame(road: Road, s: number, side: 1 | -1, edgeOff: number) {
  const f = roadFrame(road, s);
  const off = road.width / 2 + edgeOff;
  return {
    x: f.x + f.nx * off * side, z: f.z + f.nz * off * side,
    yaw: Math.atan2(-f.nx * side, -f.nz * side),
    roadY: f.y,
  };
}

// ---- footprint tests ------------------------------------------------------------------------------------
const MAIN = PLAZAS.find((p) => p.id === 'main-square')!;
const COURT = PLAZAS.find((p) => p.id === 'temple-court')!;

function rectDist(rect: readonly [number, number, number, number], x: number, z: number) {
  const [x0, z0, x1, z1] = rect;
  const qx = Math.max(x0 - x, 0, x - x1), qz = Math.max(z0 - z, 0, z - z1);
  const out = Math.hypot(qx, qz);
  if (out > 0) return out;
  return -Math.min(x - x0, x1 - x, z - z0, z1 - z);
}

export interface PointRule {
  /** Minimum edge distance from the market lane (stall zone) for buildings that face other roads. */
  laneReserve?: number;
  /** Margin for the Voronoi split between rows backing onto each other (≤ −50 disables it). */
  voronoi?: number;
  /** Minimum edge distance from any road the thing does not face. */
  otherRoad?: number;
}

/** Is (x, z) a legal spot for something that belongs to `own` road's frontage? */
export function pointOK(own: Road | null, x: number, z: number, rule: PointRule = {}): boolean {
  if (rectDist(MAIN.rect, x, z) < 3.5) return false;
  if (rectDist(COURT.rect, x, z) < 3.2) return false;
  const ownE = own ? roadDist(own, x, z).edge : Infinity;
  if (own && ownE < 0.4) return false;
  const vor = rule.voronoi ?? 0.25;
  for (const r of ROADS) {
    if (r === own) continue;
    const d = roadDist(r, x, z);
    if (r === KORA) { if (d.centre < 4.4) return false; continue; }
    if (r === LANE && own !== LANE) {
      // along the stalls keep the stall zone (and the lane's half of the block); at the two mouths the
      // road rows may run right up to the lane as corner buildings
      const stalls = d.s > LANE_STALLS[0] - 1.2 && d.s < LANE_STALLS[1] + 1.2;
      if (d.edge < (stalls ? rule.laneReserve ?? 2.3 : 0.6)) return false;
      continue;
    } else if (d.edge < (rule.otherRoad ?? 0.6)) return false;
    if (own && vor > -50 && d.edge < 14 && ownE > d.edge - vor) return false;
  }
  return true;
}

/** Sample a local rectangle (w x d centred at frame origin + (cx, cz)) against pointOK. */
export function rectOK(own: Road | null, f: Frame, w: number, d: number, rule?: PointRule, cx = 0, cz = 0): boolean {
  for (const i of [-0.5, -0.25, 0, 0.25, 0.5]) for (const j of [-0.5, -0.17, 0.17, 0.5]) {
    const [x, z] = toWorld(f, cx + i * w, cz + j * d);
    if (!pointOK(own, x, z, rule)) return false;
  }
  return true;
}

/** Oriented rectangle in xz, for overlap tests between placed footprints. */
export interface OBB { x: number; z: number; hw: number; hd: number; yaw: number }

export function obbOverlap(a: OBB, b: OBB, pad = 0.05): boolean {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  for (const ang of axes) {
    const ax = Math.sin(ang), az = Math.cos(ang);
    const proj = (o: OBB) => {
      const c = o.x * ax + o.z * az;
      const ux = Math.cos(o.yaw), uz = -Math.sin(o.yaw); // local x axis
      const vx = Math.sin(o.yaw), vz = Math.cos(o.yaw); // local z axis
      const r = Math.abs(ux * ax + uz * az) * (o.hw + pad) + Math.abs(vx * ax + vz * az) * (o.hd + pad);
      return [c - r, c + r];
    };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

// ---- geometry helpers -------------------------------------------------------------------------------------
const _v = new Vector3();

/**
 * Box for the swaying "hanging goods" Parts: writes a `hang` attribute (world y of the hanging point) so the
 * wind shader can swing it more the further below its hook it is. Every item in that Parts must use this.
 */
export function hangBox(p: Parts, w: number, h: number, d: number, c: V3, color: number, o?: PartOpts) {
  _v.set(c[0], c[1] + h / 2, c[2]).applyMatrix4(p.matrix);
  const g = new BoxGeometry(w, h, d);
  const n = g.attributes.position.count;
  g.setAttribute('hang', new Float32BufferAttribute(new Float32Array(n).fill(_v.y + 0.02), 1));
  return p.add(g, color, c, o);
}

/** Hanging point helper: same as hangBox but the hook height is given explicitly (local y). */
export function hangBoxFrom(p: Parts, hookY: number, w: number, h: number, d: number, c: V3, color: number, o?: PartOpts) {
  _v.set(c[0], hookY, c[2]).applyMatrix4(p.matrix);
  const g = new BoxGeometry(w, h, d);
  const n = g.attributes.position.count;
  g.setAttribute('hang', new Float32BufferAttribute(new Float32Array(n).fill(_v.y), 1));
  return p.add(g, color, c, o);
}

/** Thin box from a to b (local space of the current group) — rods, cables, poles. */
export function rod(p: Parts, a: V3, b: V3, t: number, color: number, o?: PartOpts) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return p;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  p.groupEuler([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [0, yaw, 0], () => {
    p.box(t, t, L, [0, 0, 0], color, { ...o, rot: [-pitch, 0, 0] });
  });
  return p;
}

/** Points along a sagging cable from a to b (parabola), n segments → n + 1 points. */
export function catenary(a: V3, b: V3, sag: number, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/** Muted tarp / plastic colours seen on McLeod Ganj stalls. */
export const TARPS = [0x3d6a9a, 0x4f7fae, 0xc0763a, 0x5d8a52, 0x8a3a36, 0xc9a24a, 0xbfc2bb, 0x6a5a8a] as const;

/** Rich but muted textile colours (shawls, scarves, socks). */
export const TEXTILES = [
  0x7a2a3a, 0xc8842e, 0x2f7a78, 0xe6dcc4, 0x8a8a86, 0x38446e, 0xc07080, 0x7a7a3a, 0x5a2a4a, 0xa83a2e,
  0x3d6a4a, 0xd9b84a, 0x9a5a3a, 0x4f6f9f,
] as const;

/** Bright-ish package / plastic colours (chips strips, toys). */
export const PLASTIC = [0xd8402e, 0x2f6fc0, 0xe0b02a, 0x3f9a4a, 0xe07a2e, 0xb04a9a, 0x2fa8b0, 0xeeeae0] as const;

/** Clamp an angle into a sensible yaw for colliders. */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
