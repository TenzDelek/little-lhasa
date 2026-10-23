// Street furniture kit: lamp posts, electric poles + sagging wires, benches, bins, railings, steps, potted
// plants, signposts. Each function adds geometry to a Parts (world space) and returns what the caller must
// register (colliders, lamps).
//
// API CONTRACT — keep signatures stable; only add optional parameters.
import type { Parts, V3 } from '../core/geom';
import type { BoxInit } from '../core/collision';
import type { Lamp } from '../core/lamps';
import { PAL } from '../core/palette';

/** Street lamp post (≈4.5 m) with a bulb that glows at night. Returns the lamp and the post collider. */
export function streetLamp(parts: Parts, x: number, y: number, z: number, yaw: number): { lamp: Lamp; collider: BoxInit } {
  // PLACEHOLDER (replaced by the flags/street kit builder)
  parts.box(0.12, 4.5, 0.12, [x, y + 2.25, z], PAL.railing);
  parts.box(0.3, 0.15, 0.3, [x, y + 4.5, z], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true });
  void yaw;
  return {
    lamp: { x, y: y + 4.3, z, color: PAL.lampWarm, intensity: 6, distance: 10 },
    collider: { x, z, w: 0.2, d: 0.2, y0: y, y1: y + 4.5, tag: 'lamp' },
  };
}

/** Wooden / concrete electric pole (≈7 m). Returns the wire attachment point at the top and its collider. */
export function powerPole(parts: Parts, x: number, y: number, z: number, yaw = 0): { top: V3; collider: BoxInit } {
  // PLACEHOLDER
  parts.box(0.2, 7, 0.2, [x, y + 3.5, z], PAL.concreteDark);
  void yaw;
  return { top: [x, y + 6.8, z], collider: { x, z, w: 0.25, d: 0.25, y0: y, y1: y + 7, tag: 'pole' } };
}

/** Sagging cable(s) between two points (thin dark boxes along a catenary). */
export function wire(parts: Parts, a: V3, b: V3, sag = 0.5, count = 1) {
  // PLACEHOLDER
  void parts; void a; void b; void sag; void count;
}

/** Bench (≈1.6 m) facing yaw. Returns its collider (seat is standable). */
export function bench(parts: Parts, x: number, y: number, z: number, yaw: number, color: number = PAL.woodTrim): BoxInit {
  parts.group([x, y, z], yaw, () => { parts.box(1.6, 0.45, 0.45, [0, 0.225, 0], color); });
  return { x, z, w: 1.6, d: 0.45, rot: yaw, y0: y, y1: y + 0.45, tag: 'bench' };
}

/** Dustbin. Returns collider. */
export function bin(parts: Parts, x: number, y: number, z: number, color: number = PAL.roofGreen): BoxInit {
  parts.cyl(0.22, 0.2, 0.75, [x, y, z], color, 8);
  return { x, z, w: 0.44, d: 0.44, y0: y, y1: y + 0.75, tag: 'bin' };
}

/** Railing (pipe rail on posts) from a to b at height h. Returns its collider. */
export function railing(parts: Parts, a: V3, b: V3, h = 1.0, color: number = PAL.railing): BoxInit {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, cy = Math.min(a[1], b[1]);
  parts.group([cx, cy, cz], yaw, () => { parts.box(0.06, h, L, [0, h / 2, 0], color); });
  return { x: cx, z: cz, w: 0.12, d: L, rot: yaw, y0: cy, y1: cy + h, tag: 'railing' };
}

/** Flight of steps climbing from a (bottom) to b (top), width w. Returns colliders (one per step). */
export function steps(parts: Parts, a: V3, b: V3, w = 1.6, color: number = PAL.stoneStep): BoxInit[] {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), rise = b[1] - a[1];
  const n = Math.max(1, Math.round(Math.abs(rise) / 0.18));
  const yaw = Math.atan2(dx, dz);
  const out: BoxInit[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + dx * t, z = a[2] + dz * t, top = a[1] + rise * ((i + 1) / n);
    parts.group([x, 0, z], yaw, () => { parts.box(w, top - (a[1] - 0.3), L / n + 0.02, [0, (top + a[1] - 0.3) / 2, 0], color); });
    out.push({ x, z, w, d: L / n, rot: yaw, y0: a[1] - 0.3, y1: top, tag: 'step' });
  }
  return out;
}

/** Potted plant (marigold / geranium / bamboo). Returns collider. */
export function pottedPlant(parts: Parts, x: number, y: number, z: number, seed = 1): BoxInit {
  parts.cyl(0.18, 0.14, 0.3, [x, y, z], PAL.wallTerracotta, 6);
  parts.box(0.3, 0.3, 0.3, [x, y + 0.45, z], seed % 2 ? PAL.grass : PAL.rhodo);
  return { x, z, w: 0.36, d: 0.36, y0: y, y1: y + 0.6, tag: 'plant' };
}
