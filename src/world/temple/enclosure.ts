// The courtyard platform: a flagstone deck that widens the court out to a masonry retaining wall with a
// whitewashed, maroon-capped parapet; the north boundary wall either side of the gate; and three stairways
// that climb from the kora up to the deck.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { V3 } from '../../core/geom';
import { PAL } from '../../core/palette';
import { groundY } from '../terrain';
import { steps } from '../../kit/street';
import type { Acc } from './acc';
import { CY, ENCLOSURE, GATE, RX0, RX1, RZ0, RZ1, STAIRS, insideEnclosure, spanAt } from './site';
import { jitter, shade, WHITEWASH } from './util';

const WALL_T = 0.6;      // retaining wall thickness
const PARAPET_H = 0.85;  // parapet height above the deck
const PARAPET_T = 0.42;
const NORTH_H = 1.35;    // boundary wall height on the north side
const STONES = [PAL.rock, 0x9a958a, 0x8a8478, 0x7f7a70, 0xa29c90, PAL.stoneStep] as const;

/** Stair openings in parametric form for wall cutting. */
function stairCut(ax: number, az: number, bx: number, bz: number) {
  // returns [t0, t1] ranges along edge a→b covered by stair openings (with 0.25 m margin)
  const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const cuts: [number, number][] = [];
  for (const s of STAIRS) {
    const [tx, tz] = s.top;
    const along = (tx - ax) * ux + (tz - az) * uz;
    const perp = Math.abs((tx - ax) * uz - (tz - az) * ux);
    if (perp < 0.3 && along > 0 && along < L) cuts.push([along - s.w / 2 - 0.25, along + s.w / 2 + 0.25]);
  }
  return cuts;
}

export function buildEnclosure(acc: Acc) {
  buildDeck(acc);
  const P = ENCLOSURE;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
    // the closing edge (6.4 → 11.6 on z = 92.6) is the gate opening
    if (az === GATE.z && bz === GATE.z && Math.min(ax, bx) >= GATE.x0 - 0.01 && Math.max(ax, bx) <= GATE.x1 + 0.01) continue;
    const north = az === GATE.z && bz === GATE.z;
    const L = Math.hypot(bx - ax, bz - az);
    const cuts = stairCut(ax, az, bx, bz);
    // split into runs between cuts
    let t = 0;
    const runs: [number, number][] = [];
    for (const [c0, c1] of cuts.sort((a, b) => a[0] - b[0])) { if (c0 > t) runs.push([t, c0]); t = c1; }
    if (t < L) runs.push([t, L]);
    for (const [t0, t1] of runs) wallRun(acc, ax, az, bx, bz, t0, t1, north, i);
    // stair-head posts
    for (const [c0, c1] of cuts) for (const tt of [c0, c1]) {
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      const [nx, nz] = inward(ax, az, bx, bz);
      const x = ax + ux * tt + nx * 0.25, z = az + uz * tt + nz * 0.25;
      postCap(acc, x, z, Math.atan2(ux, uz));
    }
  }
  for (const s of STAIRS) stairway(acc, s.foot, s.top, s.w);
}

/** Unit normal pointing into the enclosure for edge a→b. */
function inward(ax: number, az: number, bx: number, bz: number): [number, number] {
  const L = Math.hypot(bx - ax, bz - az);
  let nx = -(bz - az) / L, nz = (bx - ax) / L;
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;
  if (!insideEnclosure(mx + nx * 0.5, mz + nz * 0.5)) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

function wallRun(acc: Acc, ax: number, az: number, bx: number, bz: number, t0: number, t1: number, north: boolean, edge: number) {
  const r = acc.r;
  const L = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / L, uz = (bz - az) / L;
  const [nx, nz] = inward(ax, az, bx, bz);
  const yaw = Math.atan2(nx, nz); // local +z = inward, local x along -edge... use group frame below
  const len = t1 - t0;
  if (len < 0.2) return;
  const mid = (t0 + t1) / 2;
  const cx = ax + ux * mid, cz = az + uz * mid;
  // local frame: origin on the outer face at mid-run, local +z inward, local x along the edge
  // (x axis of a yaw-rotated group is (cos yaw, -sin yaw) in world)
  const lxSign = Math.sign(ux * Math.cos(yaw) - uz * Math.sin(yaw)) || 1;
  const big = acc.big;

  // ---- retaining wall (below deck level), in ~1.5 m columns
  const cols = Math.max(1, Math.round(len / 1.5));
  const cw = len / cols;
  let minBottom = CY;
  const bottoms: number[] = [];
  for (let c = 0; c < cols; c++) {
    let lo = Infinity;
    for (let k = 0; k <= 4; k++) {
      const tt = t0 + cw * (c + k / 4);
      const x = ax + ux * tt, z = az + uz * tt;
      lo = Math.min(lo, groundY(x, z), groundY(x - nx * 0.5, z - nz * 0.5));
    }
    bottoms.push(lo - 0.25);
    minBottom = Math.min(minBottom, lo - 0.25);
  }
  big.group([cx, 0, cz], yaw, () => {
    for (let c = 0; c < cols; c++) {
      const bot = bottoms[c];
      if (CY - bot < 0.12) continue;
      const x0 = (-len / 2 + cw * c) * lxSign, x1 = (-len / 2 + cw * (c + 1)) * lxSign;
      const xc = (x0 + x1) / 2, w = Math.abs(x1 - x0) + 0.01;
      // mortar core
      big.box(w, CY - bot, WALL_T - 0.04, [xc, (CY + bot) / 2, 0.04 + (WALL_T - 0.04) / 2], 0x6a655c);
    }
    // facing stones in courses from the top down, staggered
    const course = 0.42;
    const rows = Math.ceil((CY - minBottom) / course);
    for (let row = 0; row < rows; row++) {
      const yTop = CY - row * course, yBot = yTop - course;
      let s = row % 2 ? -0.35 : 0;
      while (s < len) {
        const bl = 0.55 + r() * 0.5;
        const s0 = Math.max(0, s), s1 = Math.min(len, s + bl);
        s += bl;
        if (s1 - s0 < 0.12) continue;
        const col = Math.min(cols - 1, Math.floor(((s0 + s1) / 2) / cw));
        if (yTop <= bottoms[col] + 0.05) continue;
        const yb = Math.max(yBot, bottoms[col]);
        const lx0 = (-len / 2 + s0) * lxSign, lx1 = (-len / 2 + s1) * lxSign;
        const color = jitter(r, STONES[Math.floor(r() * STONES.length)], 0.05);
        big.box(Math.abs(lx1 - lx0) - 0.045, yTop - yb - 0.045, 0.08, [(lx0 + lx1) / 2, (yTop + yb) / 2, 0.035], color);
      }
    }
    // weep holes + moss streaks
    for (let c = 0; c < cols; c++) {
      const bot = bottoms[c];
      if (CY - bot < 0.9) continue;
      const xc = (-len / 2 + cw * (c + 0.5)) * lxSign;
      big.box(0.1, 0.1, 0.06, [xc, bot + 0.55, -0.005], 0x24221f);
      if (r() < 0.6) big.box(0.08, Math.min(0.9, CY - bot - 0.6), 0.03, [xc + 0.02, bot + 0.1 + Math.min(0.9, CY - bot - 0.6) / 2, -0.02], shade(PAL.moss, -0.15));
    }
    // ---- parapet / boundary wall above deck level
    const H = north ? NORTH_H : PARAPET_H;
    const T = north ? 0.36 : PARAPET_T;
    const plaster = edge % 2 ? WHITEWASH : 0xf0ebe0;
    big.box(len, H - 0.14, T, [0, CY + (H - 0.14) / 2, T / 2], plaster);
    // maroon cap band, and a thin dark drip line under it
    big.box(len + 0.02, 0.14, T + 0.06, [0, CY + H - 0.07, T / 2], PAL.templeMaroon);
    big.box(len, 0.03, T + 0.02, [0, CY + H - 0.155, T / 2], shade(PAL.templeMaroon, -0.35));
    // grime at the foot of the plaster
    big.box(len, 0.12, T + 0.01, [0, CY + 0.06, T / 2], 0xb8b2a3);
    if (north) {
      // a row of little gold-rimmed mani plaques along the outside face
      const n = Math.floor(len / 2.4);
      for (let i = 0; i < n; i++) {
        const lx = (-len / 2 + (i + 0.5) * (len / n)) * lxSign;
        big.box(0.52, 0.34, 0.04, [lx, CY + 0.75, -0.01], PAL.gold);
        big.box(0.44, 0.26, 0.04, [lx, CY + 0.75, -0.025], PAL.templeMaroon);
        big.box(0.3, 0.05, 0.04, [lx, CY + 0.78, -0.04], PAL.gold);
        big.box(0.22, 0.04, 0.04, [lx, CY + 0.7, -0.04], PAL.gold);
      }
    }
  });
  const H = north ? NORTH_H : PARAPET_H, T = north ? 0.36 : PARAPET_T;
  acc.box({ x: cx + nx * T / 2, z: cz + nz * T / 2, w: len, d: T, rot: yaw, y0: Math.min(CY, minBottom), y1: CY + H, tag: 'wall' });
}

function postCap(acc: Acc, x: number, z: number, yaw: number) {
  const p = acc.big;
  p.group([x, CY, z], yaw, () => {
    p.box(0.55, 1.1, 0.55, [0, 0.55, 0], WHITEWASH);
    p.box(0.62, 0.14, 0.62, [0, 1.12, 0], PAL.templeMaroon);
    p.cyl(0.1, 0.16, 0.16, [0, 1.19, 0], PAL.gold, 6);
    p.cone(0.1, 0.18, [0, 1.35, 0], PAL.gold, 6);
  });
  // khatas knotted round the post, tails hanging down the outer face
  acc.fine.group([x, CY, z], yaw, () => {
    acc.fine.box(0.6, 0.06, 0.6, [0, 0.98, 0], 0xf6f3ea);
    acc.fine.groupEuler([0.32, 0.72, -0.12], [0, 0, 0.08], () => acc.fine.box(0.03, 0.5, 0.12, [0, 0, 0], 0xf6f3ea));
    acc.fine.groupEuler([0.31, 0.68, 0.1], [0, 0, -0.06], () => acc.fine.box(0.03, 0.42, 0.11, [0, 0, 0], 0xece4cc));
  });
  acc.box({ x, z, w: 0.55, d: 0.55, rot: yaw, y0: CY - 0.5, y1: CY + 1.2, tag: 'wall' });
}

function stairway(acc: Acc, foot: readonly [number, number], top: readonly [number, number], w: number) {
  const ay = groundY(foot[0], foot[1]);
  const a: V3 = [foot[0], ay, foot[1]];
  const b: V3 = [top[0], CY, top[1]];
  // lowest ground under the flight → solid base so nothing floats
  let lo = ay;
  for (let k = 0; k <= 8; k++) {
    const t = k / 8, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    lo = Math.min(lo, groundY(x, z));
  }
  acc.boxes(steps(acc.small, a, b, w, PAL.stoneStep, { walls: false, base: lo - 0.3 }));
  // solid stone under the flight (the kit's steps stop 0.3 m under the foot height)
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const ux = dx / L, uz = dz / L, rx = uz, rz = -ux;
  const n = Math.max(4, Math.round(L / 0.6));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + dx * t, z = a[2] + dz * t;
    const g = Math.min(groundY(x, z), groundY(x + rx * w / 2, z + rz * w / 2), groundY(x - rx * w / 2, z - rz * w / 2));
    const stepTop = a[1] + (b[1] - a[1]) * Math.min(1, (i + 1) / n);
    // cheek walls (balustrades) either side: stepped whitewashed fill under a continuous sloped band
    for (const side of [-1, 1]) {
      const cx = x + rx * side * (w / 2 + 0.17), cz = z + rz * side * (w / 2 + 0.17);
      const gy = Math.min(groundY(cx, cz), g) - 0.2;
      const slopeY = a[1] + (b[1] - a[1]) * t;
      const topY = slopeY + 0.62;
      acc.big.group([cx, 0, cz], yaw, () => acc.big.box(0.32, stepTop + 0.3 - gy, L / n + 0.01, [0, (stepTop + 0.3 + gy) / 2, 0], WHITEWASH));
      acc.box({ x: cx, z: cz, w: 0.32, d: L / n, rot: yaw, y0: gy, y1: topY, tag: 'wall' });
    }
  }
  // continuous sloped balustrade band + maroon coping along each side
  const pitch = Math.atan2(b[1] - a[1], L);
  const span = Math.hypot(L, b[1] - a[1]);
  for (const side of [-1, 1]) {
    const mx = (a[0] + b[0]) / 2 + rx * side * (w / 2 + 0.17), mz = (a[2] + b[2]) / 2 + rz * side * (w / 2 + 0.17);
    const my = (a[1] + b[1]) / 2;
    acc.big.group([mx, 0, mz], yaw, () => {
      acc.big.groupEuler([0, my + 0.42, 0], [-pitch, 0, 0], () => {
        acc.big.box(0.32, 0.46, span + 0.1, [0, 0, 0], 0xf0ebe0);
        acc.big.box(0.4, 0.1, span + 0.16, [0, 0.27, 0], PAL.templeMaroon);
      });
    });
  }
}

/**
 * Deck: flagstone terrace between the courtyard rectangle and the enclosure wall. Built from exact
 * trapezoids (visual base) plus a grid of slightly raised flagstones, and scanline box colliders.
 */
function buildDeck(acc: Acc) {
  const zs = new Set<number>([RZ0, RZ1]);
  for (const [, z] of ENCLOSURE) zs.add(z);
  // where the polygon boundary crosses the rect's x edges
  for (let i = 0; i < ENCLOSURE.length; i++) {
    const [ax, az] = ENCLOSURE[i], [bx, bz] = ENCLOSURE[(i + 1) % ENCLOSURE.length];
    for (const X of [RX0, RX1]) if ((ax - X) * (bx - X) < 0) zs.add(az + (bz - az) * (X - ax) / (bx - ax));
  }
  const Z = [...zs].sort((a, b) => a - b);
  const zMin = Math.min(...ENCLOSURE.map((p) => p[1])), zMax = Math.max(...ENCLOSURE.map((p) => p[1]));
  const pos: number[] = [];
  const quad = (x00: number, x01: number, za: number, x10: number, x11: number, zb: number) => {
    // corners: (x00, za) (x01, za) (x11, zb) (x10, zb); y = CY
    const y = CY + 0.004;
    pos.push(x00, y, za, x10, y, zb, x01, y, za, x01, y, za, x10, y, zb, x11, y, zb);
  };
  const ROW = 0.5;
  for (let k = 0; k < Z.length - 1; k++) {
    const za = Z[k], zb = Z[k + 1];
    if (za < zMin - 1e-6 || zb > zMax + 1e-6 || zb - za < 1e-4) continue;
    if (zb <= RZ0 + 1e-6) continue; // the thin strip north of the court (ground is already at deck level)
    const sa = spanAt(za + 1e-4)!, sb = spanAt(zb - 1e-4)!;
    const inRect = za >= RZ0 - 1e-6 && zb <= RZ1 + 1e-6;
    const parts: [number, number, number, number][] = [];
    if (inRect) {
      if (sa[0] < RX0 - 1e-3 || sb[0] < RX0 - 1e-3) parts.push([sa[0], RX0, sb[0], RX0]);
      if (sa[1] > RX1 + 1e-3 || sb[1] > RX1 + 1e-3) parts.push([RX1, sa[1], RX1, sb[1]]);
    } else parts.push([sa[0], sa[1], sb[0], sb[1]]);
    for (const [a0, a1, b0, b1] of parts) {
      if (a1 - a0 < 0.01 && b1 - b0 < 0.01) continue;
      quad(a0, a1, za, b0, b1, zb);
      // colliders: sub-rows so slanted edges are followed closely
      const slanted = Math.abs(a0 - b0) > 0.05 || Math.abs(a1 - b1) > 0.05;
      const rows = slanted ? Math.max(1, Math.ceil((zb - za) / ROW)) : 1;
      for (let j = 0; j < rows; j++) {
        const t0 = j / rows, t1 = (j + 1) / rows;
        const x0 = Math.max(a0 + (b0 - a0) * t0, a0 + (b0 - a0) * t1);
        const x1 = Math.min(a1 + (b1 - a1) * t0, a1 + (b1 - a1) * t1);
        if (x1 - x0 < 0.05) continue;
        const z0 = za + (zb - za) * t0, z1 = za + (zb - za) * t1;
        acc.box({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y0: CY - 4, y1: CY, tag: 'deck' });
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  acc.deck.add(g, 0x77736a);

  // flagstones on a 1.2 m grid wherever a whole stone fits on the deck
  const S = 1.2, r = acc.r;
  for (let z = Math.floor(zMin / S) * S; z < zMax; z += S) {
    for (let x = -16.8; x < 31; x += S) {
      const corners = [[x, z], [x + S, z], [x, z + S], [x + S, z + S]];
      if (!corners.every(([px, pz]) => insideEnclosure(px, pz))) continue;
      const inR = corners.some(([px, pz]) => px > RX0 + 1e-3 && px < RX1 - 1e-3 && pz > RZ0 + 1e-3 && pz < RZ1 - 1e-3);
      if (inR) continue;
      if (z + S <= RZ0 + 1e-3) continue;
      const c = jitter(r, r() < 0.15 ? PAL.pavingDark : PAL.paving, 0.07);
      acc.deck.box(S - 0.05, 0.03, S - 0.05, [x + S / 2, CY + 0.012, z + S / 2], c);
    }
  }
}
