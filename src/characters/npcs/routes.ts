// Walking routes for the townsfolk. A route is a polyline (usually a closed loop) resampled every STEP
// metres. Walkers move along it by arc length and add their own lateral offset (pairs, side-steps).
//
// Lanes keep LEFT (as traffic does in India): walking "forward" along a road (its point order) people use
// the left pavement band, walking back they use the other one. A road loop = forward lane + crossing at the
// far end + return lane + a short link through the square.
//
// Other modules' colliders (stalls, lamp posts, parked taxis, steps) are not known when the routes are
// built, so avoid() re-checks every sample against the static colliders whenever they change and bends the
// route sideways round anything solid, and records the height of steppable things (kerbs, steps, platforms).
import { roadFrame, roadLength, type Road, type XZ } from '../../world/layout';
import { groundY } from '../../world/terrain';
import { collision, type Collider } from '../../core/collision';
import { clamp } from '../../core/math';

export const STEP = 0.25;

export interface Route {
  id: string;
  loop: boolean;
  /** Number of samples and total length. */
  n: number;
  len: number;
  /** Base points and unit tangents (walking direction). */
  bx: Float32Array; bz: Float32Array; tx: Float32Array; tz: Float32Array;
  /** Avoidance shift along the right normal (m) and steppable height above the ground (m). */
  off: Float32Array; lift: Float32Array;
  /** Which side (+1 right of the walking direction, −1 left) is "inward" (toward the road centre). 0 = both. */
  inward: number;
  /** Maximum avoidance shift toward the inward / outward side. */
  maxIn: number; maxOut: number;
  /** Body radius used when checking colliders (narrow walkways use less). */
  probeR: number;
  /** How far walkers may side-step (for Tenzin / each other) toward the inward and the outward side. */
  sideIn: number; sideOut: number;
  /** Samples still blocked after avoidance (debug). */
  blocked: number;
}

export interface RoutePoint { x: number; z: number; y: number; tx: number; tz: number; nx: number; nz: number }

// ---- building ------------------------------------------------------------------------------------------

/** Dense centre-line points of a road between arc lengths s0 and s1 (s1 < s0 walks it backwards). */
function roadPts(road: Road, s0: number, s1: number, step = 0.5): XZ[] {
  const out: XZ[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const f = roadFrame(road, s0 + ((s1 - s0) * i) / n);
    out.push([f.x, f.z]);
  }
  return out;
}

/** Offset a dense polyline sideways (+ = right of its direction) with smoothed normals. */
export function offsetPts(pts: readonly XZ[], off: number, win = 4): XZ[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - win)], b = pts[Math.min(n - 1, i + win)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    // right of the walking direction: (−tz, tx)
    return [p[0] + (-dz / L) * off, p[1] + (dx / L) * off] as XZ;
  });
}

/**
 * Keep-left lane along a road between arc lengths s0 → s1 (either direction), `edgeIn` metres inside the kerb.
 * Walking forward the left band is road-normal −; walking backwards it is road-normal +.
 */
export function lane(road: Road, s0: number, s1: number, edgeIn = 0.7): XZ[] {
  const o = road.width / 2 - edgeIn;
  const c = roadPts(road, s0, s1);
  // left of this walking direction = −right
  return offsetPts(c, -o);
}

/** Arc length helpers. */
export const roadLen = (road: Road) => roadLength(road);

/** Resample a polyline uniformly and wrap it as a Route. */
export interface RouteOpts { inward?: number; maxIn?: number; maxOut?: number; probeR?: number; sideIn?: number; sideOut?: number }

export function makeRoute(id: string, pts: readonly XZ[], loop: boolean, o: RouteOpts = {}): Route {
  const P = loop ? [...pts, pts[0]] : [...pts];
  // cumulative arc
  const acc = [0];
  for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = acc[acc.length - 1];
  const n = Math.max(2, Math.floor(total / STEP) + (loop ? 0 : 1));
  const bx = new Float32Array(n), bz = new Float32Array(n);
  let k = 1;
  for (let i = 0; i < n; i++) {
    const s = Math.min(total, i * STEP);
    while (k < P.length - 1 && acc[k] < s) k++;
    const L = acc[k] - acc[k - 1] || 1e-6, t = clamp((s - acc[k - 1]) / L);
    bx[i] = P[k - 1][0] + (P[k][0] - P[k - 1][0]) * t;
    bz[i] = P[k - 1][1] + (P[k][1] - P[k - 1][1]) * t;
  }
  const tx = new Float32Array(n), tz = new Float32Array(n);
  const W = 4;
  for (let i = 0; i < n; i++) {
    const ia = loop ? (i - W + n) % n : Math.max(0, i - W), ib = loop ? (i + W) % n : Math.min(n - 1, i + W);
    const dx = bx[ib] - bx[ia], dz = bz[ib] - bz[ia], L = Math.hypot(dx, dz) || 1;
    tx[i] = dx / L; tz[i] = dz / L;
  }
  return {
    id, loop, n, len: loop ? n * STEP : (n - 1) * STEP, bx, bz, tx, tz,
    off: new Float32Array(n), lift: new Float32Array(n),
    inward: o.inward ?? 0, maxIn: o.maxIn ?? 1.4, maxOut: o.maxOut ?? 1.0, probeR: o.probeR ?? 0.32,
    sideIn: o.sideIn ?? 0.9, sideOut: o.sideOut ?? 0.45, blocked: 0,
  };
}

// ---- sampling ------------------------------------------------------------------------------------------

/** Wrap / clamp an arc length onto the route. */
export function wrapS(r: Route, s: number) {
  if (r.loop) { s %= r.len; return s < 0 ? s + r.len : s; }
  return clamp(s, 0, r.len);
}

/** Position on a route at arc length s, `lateral` metres to the right of the walking direction. */
export function sample(r: Route, s: number, lateral: number, out: RoutePoint): RoutePoint {
  s = wrapS(r, s);
  const f = s / STEP;
  let i = Math.floor(f);
  const t = f - i;
  if (i >= r.n) i = r.loop ? 0 : r.n - 1;
  const j = r.loop ? (i + 1) % r.n : Math.min(r.n - 1, i + 1);
  const tx = r.tx[i] + (r.tx[j] - r.tx[i]) * t, tz = r.tz[i] + (r.tz[j] - r.tz[i]) * t;
  const L = Math.hypot(tx, tz) || 1;
  out.tx = tx / L; out.tz = tz / L;
  out.nx = -out.tz; out.nz = out.tx;
  const off = r.off[i] + (r.off[j] - r.off[i]) * t + lateral;
  out.x = r.bx[i] + (r.bx[j] - r.bx[i]) * t + out.nx * off;
  out.z = r.bz[i] + (r.bz[j] - r.bz[i]) * t + out.nz * off;
  out.y = groundY(out.x, out.z) + r.lift[i] + (r.lift[j] - r.lift[i]) * t;
  return out;
}

// ---- collider checks -----------------------------------------------------------------------------------

const _cands: Collider[] = [];

/** Signed distance from (px, pz) to a collider footprint (negative inside). */
export function footDist(c: Collider, px: number, pz: number): number {
  if (c.kind === 'circle') return Math.hypot(px - c.x, pz - c.z) - c.r;
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const dx = px - c.x, dz = pz - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const qx = Math.abs(lx) - c.w / 2, qz = Math.abs(lz) - c.d / 2;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
}

/** Is a person-sized circle at (x, z) blocked by a static collider? Also returns the steppable lift. */
export function probe(x: number, z: number, r = 0.32): { blocked: boolean; lift: number } {
  const g = groundY(x, z);
  let lift = 0, blocked = false;
  for (const c of collision.query(x, z, r + 0.2, _cands)) {
    if (c.tag === 'npc-ignore') continue;
    const d = footDist(c, x, z);
    if (c.y1 <= g + 0.42) { if (c.y1 > g + lift && d < r * 0.5) lift = c.y1 - g; continue; }
    if (c.y0 >= g + 1.75 + lift) continue; // overhead (awning, arch)
    if (d < r) { blocked = true; break; }
  }
  return { blocked, lift };
}

/** Re-bend a route round static colliders and record step heights. */
export function avoid(r: Route) {
  const raw = new Float32Array(r.n);
  const tries: number[] = [];
  const inw = r.inward || 1;
  const step = Math.min(0.25, Math.max(r.maxIn, r.maxOut) / 4);
  for (let d = step; d <= Math.max(r.maxIn, r.maxOut) + 1e-6; d += step) {
    if (d <= r.maxIn) tries.push(d * inw);
    if (d <= r.maxOut) tries.push(-d * inw);
  }
  r.blocked = 0;
  for (let i = 0; i < r.n; i++) {
    const nx = -r.tz[i], nz = r.tx[i];
    if (!probe(r.bx[i], r.bz[i], r.probeR).blocked) continue;
    let found = false;
    for (const sft of tries) {
      if (!probe(r.bx[i] + nx * sft, r.bz[i] + nz * sft, r.probeR).blocked) { raw[i] = sft; found = true; break; }
    }
    if (!found) r.blocked++;
  }
  // dilate (start veering ~1.5 m early) then blur
  const R = 6, n = r.n;
  const idx = (i: number) => (r.loop ? ((i % n) + n) % n : clamp(i, 0, n - 1));
  const dil = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = -R; k <= R; k++) {
      const v = raw[idx(i + k)];
      if (Math.abs(v) > Math.abs(best)) best = v;
    }
    dil[i] = best;
  }
  const B = 4;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -B; k <= B; k++) s += dil[idx(i + k)];
    r.off[i] = s / (2 * B + 1);
    // keep the full shift where it is actually needed
    if (Math.abs(raw[i]) > Math.abs(r.off[i])) r.off[i] = raw[i];
  }
  for (let i = 0; i < n; i++) {
    const nx = -r.tz[i], nz = r.tx[i];
    r.lift[i] = probe(r.bx[i] + nx * r.off[i], r.bz[i] + nz * r.off[i], r.probeR).lift;
  }
}
