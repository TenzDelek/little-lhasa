// Road edges in 3D: low concrete kerbs along the asphalt roads (some stretches painted yellow / black or
// white / black, as near Indian temples and junctions), concrete slabs bridging the open drains in front of
// doorways, and — where the land beside a road falls away or rises steeply — retaining walls with blue /
// yellow pipe railings and colliders so the boy cannot walk off a drop.
import { Parts } from '../../core/geom';
import type { BoxInit } from '../../core/collision';
import { PAL } from '../../core/palette';
import { hash2, rng } from '../../core/math';
import { ROADS, roadLength, roadFrame, type Road } from '../layout';
import { groundY } from '../terrain';
import { railing } from '../../kit/street';
import { sampleFields, type FieldSample } from './fields';

const KERB_W = 0.18, KERB_H = 0.1;

/** Offset polyline of a road (mitred corners): side +1 = right of the walking direction. */
function offsetLine(road: Road, d: number, side: number): { x: number; z: number; y: number }[] {
  const P = road.pts, n = P.length;
  const out: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const nrm = (a: number, b: number) => {
      const dx = P[b][0] - P[a][0], dz = P[b][1] - P[a][1], L = Math.hypot(dx, dz);
      return [-dz / L, dx / L];
    };
    let nx: number, nz: number;
    if (i === 0) [nx, nz] = nrm(0, 1);
    else if (i === n - 1) [nx, nz] = nrm(n - 2, n - 1);
    else {
      const [ax, az] = nrm(i - 1, i), [bx, bz] = nrm(i, i + 1);
      const mx = ax + bx, mz = az + bz, ml = Math.hypot(mx, mz);
      const cosHalf = (mx / ml) * ax + (mz / ml) * az;
      nx = (mx / ml) / cosHalf; nz = (mz / ml) / cosHalf;
    }
    out.push({ x: P[i][0] + nx * d * side, z: P[i][1] + nz * d * side, y: road.ys[i] });
  }
  return out;
}

/** Walk a polyline in pieces of ~len metres: calls fn(ax, az, ay, bx, bz, by, sMid). */
function pieces(line: { x: number; z: number; y: number }[], len: number, fn: (a: number[], b: number[], s: number) => void) {
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const A = line[i - 1], B = line[i];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    const n = Math.max(1, Math.round(L / len));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      fn([A.x + (B.x - A.x) * t0, A.z + (B.z - A.z) * t0, A.y + (B.y - A.y) * t0],
        [A.x + (B.x - A.x) * t1, A.z + (B.z - A.z) * t1, A.y + (B.y - A.y) * t1], s + L * (t0 + t1) / 2);
    }
    s += L;
  }
}

/** A box spanning a → b (xz), w wide, from y0 up h, pitched to follow the slope. */
function spanBox(p: Parts, a: number[], b: number[], w: number, h: number, ya: number, yb: number, color: number, gap = 0.02) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 0.05) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(yb - ya, L);
  const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, cy = (ya + yb) / 2;
  p.group([cx, cy, cz], yaw, () => p.box(w, h, Math.max(0.02, L - gap), [0, h / 2, 0], color, { rot: [pitch, 0, 0] }));
}

export interface EdgeBuild { parts: Parts; colliders: BoxInit[]; stats: { kerbs: number; slabs: number; railings: number; walls: number } }

export function buildEdges(): EdgeBuild {
  const parts = new Parts();
  const colliders: BoxInit[] = [];
  const stats = { kerbs: 0, slabs: 0, railings: 0, walls: 0 };
  const f: FieldSample = sampleFields(0, 0);
  const r = rng(4242);

  for (const road of ROADS) {
    if (road.kind !== 'road') continue;
    const L = roadLength(road);
    const hw = road.width / 2;
    for (const side of [-1, 1]) {
      // ---- kerbs ----------------------------------------------------------------------------------
      const line = offsetLine(road, hw + KERB_W / 2, side);
      pieces(line, 1.0, (a, b, s) => {
        if (s < 0.6 || s > L - 1.2) return;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        sampleFields(mx, mz, f);
        if (f.plaza < 0.4 || f.lane < 0.4) return;
        // painted stretches: yellow/black near the square and the temple gate, a few others at random
        const sec = Math.floor(s / 14);
        const hsec = hash2(sec * 3.1 + side * 7.7, road.width * 5.3);
        const nearEnds = s < 10 || (road.id === 'temple-road' && s > L - 16);
        const paint = nearEnds || hsec > 0.82 ? 'yb' : hsec < 0.1 ? 'wb' : '';
        const ya = groundY(a[0], a[1]) - 0.04, yb = groundY(b[0], b[1]) - 0.04;
        if (!paint) {
          spanBox(parts, [a[0], a[1]], [b[0], b[1]], KERB_W, KERB_H + 0.04, ya, yb, r() < 0.12 ? PAL.concreteDark : PAL.curb, 0.03);
        } else {
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ym = (ya + yb) / 2;
          const c1 = paint === 'yb' ? PAL.railingYellow : PAL.wallWhite;
          spanBox(parts, [a[0], a[1]], m, KERB_W, KERB_H + 0.04, ya, ym, c1, 0.015);
          spanBox(parts, m, [b[0], b[1]], KERB_W, KERB_H + 0.04, ym, yb, 0x26262a, 0.015);
        }
        stats.kerbs++;
      });

      // ---- drain cover slabs (in front of doorways / crossings) -----------------------------------
      let next = 3 + r() * 4;
      for (let s = 3; s < L - 3; s += 0.5) {
        if (s < next) continue;
        const fr = roadFrame(road, s);
        const o = hw + 0.39;
        const x = fr.x + fr.nx * side * o, z = fr.z + fr.nz * side * o;
        sampleFields(x, z, f);
        if (f.drain < 0.6 || f.plaza < 0.8 || f.lane < 0.8) { next = s + 1; continue; }
        const y = groundY(x, z);
        const len = 0.55 + r() * 0.5;
        parts.group([x, y, z], fr.yaw, () => {
          parts.box(0.46, 0.08, len, [0, 0.0, 0], r() < 0.3 ? PAL.concreteDark : PAL.concrete);
        });
        stats.slabs++;
        next = s + 3.5 + r() * 6;
      }

      // ---- drops and steep rises: retaining walls + railings ---------------------------------------
      let run: { s: number; drop: number }[] = [];
      const flush = () => {
        if (run.length >= 3) buildRetaining(parts, colliders, road, side, run, stats);
        run = [];
      };
      for (let s = 2; s < L - 2; s += 1) {
        const fr = roadFrame(road, s);
        let lo = Infinity;
        for (const o of [1.5, 2.5, 3.5]) {
          const x = fr.x + fr.nx * side * (hw + o), z = fr.z + fr.nz * side * (hw + o);
          lo = Math.min(lo, groundY(x, z));
        }
        const x = fr.x + fr.nx * side * (hw + 0.6), z = fr.z + fr.nz * side * (hw + 0.6);
        sampleFields(x, z, f);
        const free = f.built < 0.3 && f.plaza > 1 && f.lane > 1;
        if (free && fr.y - lo > 1.2) run.push({ s, drop: fr.y - lo });
        else flush();
      }
      flush();
    }
  }
  for (const [id, s] of SPEED_BREAKERS) speedBreaker(parts, ROADS.find((r) => r.id === id)!, s);
  return { parts, colliders, stats };
}

/** Speed breakers (road id, arc length of the hump): Dharamkot Road below Amala's, Bhagsu Road by the tea shop. */
const SPEED_BREAKERS: readonly (readonly [string, number])[] = [['dharamkot-road', 31.4], ['bhagsu-road', 30]];

/**
 * A low painted hump across the asphalt (≤ 7 cm, no collider: the boy just walks over it): a trapezoid
 * section 0.6 m deep, striped yellow / black across the road, the paint worn on the wheel tracks.
 */
function speedBreaker(parts: Parts, road: Road, s: number) {
  const f = roadFrame(road, s);
  const span = road.width + 0.1;
  const n = Math.round(span / 0.42);
  const sw = span / n;
  const ahead = roadFrame(road, s + 0.3), behind = roadFrame(road, s - 0.3);
  const pitch = -Math.atan2(ahead.y - behind.y, 0.6);
  for (let i = 0; i < n; i++) {
    const lat = -span / 2 + sw * (i + 0.5);
    const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
    const y = groundY(x, z) - 0.012;
    const wheel = Math.abs(Math.abs(lat) - road.width * 0.25) < 0.45; // wheel tracks: scuffed paint
    const yellow = i % 2 === 0;
    const col = yellow ? (wheel ? 0xb59a3c : PAL.railingYellow) : wheel ? 0x3a3a3c : 0x26262a;
    parts.group([x, y, z], f.yaw, () => parts.taper(sw + 0.002, 0.64, sw + 0.002, 0.26, 0.075, [0, 0, 0], col, { rot: [pitch, 0, 0] }));
  }
}

/** Low concrete parapet + pipe railing along a run of drop-off, with a collider per railing span. */
function buildRetaining(parts: Parts, colliders: BoxInit[], road: Road, side: number, run: { s: number; drop: number }[], stats: EdgeBuild['stats']) {
  const hw = road.width / 2;
  const s0 = run[0].s, s1 = run[run.length - 1].s;
  const span = 2.0;
  const n = Math.max(1, Math.round((s1 - s0) / span));
  for (let i = 0; i < n; i++) {
    const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n;
    const A = roadFrame(road, sa), Bf = roadFrame(road, sb);
    const o = hw + 0.75;
    const a = [A.x + A.nx * side * o, A.z + A.nz * side * o], b = [Bf.x + Bf.nx * side * o, Bf.z + Bf.nz * side * o];
    const ya = groundY(a[0], a[1]), yb = groundY(b[0], b[1]);
    // dry-stone face + concrete cap
    spanBox(parts, a, b, 0.32, 0.38, ya - 0.3, yb - 0.3, PAL.rockDark, 0);
    spanBox(parts, a, b, 0.36, 0.08, ya + 0.08, yb + 0.08, PAL.concrete, 0);
    const col = i % 2 ? PAL.railingYellow : PAL.railing;
    colliders.push(railing(parts, [a[0], ya + 0.16, a[1]], [b[0], yb + 0.16, b[1]], 0.95, col));
    stats.railings++;
  }
  stats.walls++;
}
