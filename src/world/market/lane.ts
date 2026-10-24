// Market Lane: a narrow paved lane between Jogiwara Road and Temple Road, lined both sides with tarp-roofed
// stalls (malas, prayer flags, scarves, woollens, incense, toys, khatas, jewellery) backed by small
// buildings, with festival string lights zig-zagging overhead. The aisle between the counters stays
// ≥ 2.4 m wide.
import { PAL, ROOFS } from '../../core/palette';
import { pick, range, rng, type Rng } from '../../core/math';
import { roadFrame } from '../layout';
import type { V3 } from '../../core/geom';
import { type Ctx, inFrame, wpos } from './ctx';
import { LANE, LANE_STALLS, localBox, rectOK, roadsideFrame, catenary, hangBoxFrom, TARPS, TEXTILES, PLASTIC, type Frame } from './util';
import { malaRow, shawlStack, singingBowl, snackStrip } from './items';
import { scarf } from './dressing';

const HALF_PI = Math.PI / 2;
const LUNGTA = PAL.lungta;

type StallType = 'malas' | 'flags' | 'scarves' | 'woollens' | 'incense' | 'toys' | 'khata' | 'jewellery';
const ORDER: StallType[][] = [
  ['flags', 'malas', 'scarves', 'incense', 'toys', 'khata', 'woollens', 'jewellery', 'scarves'],
  ['khata', 'woollens', 'jewellery', 'flags', 'scarves', 'malas', 'toys', 'incense', 'malas'],
];

export interface LaneResult {
  /** Front-post tops for the string lights, per side, ordered along the lane. */
  posts: { s: number; p: V3 }[][];
}

/** One stall in its lane-edge frame (origin on the lane edge, +z into the lane). */
function stall(c: Ctx, f: Frame, y: number, w: number, type: StallType, r: Rng, postTops: { s: number; p: V3 }[], s: number, first: boolean) {
  const P = c.props, B = c.bld, H = c.hang;
  const tarp = pick(r, TARPS);
  const wallC = pick(r, [...ROOFS, 0x8a8f94, 0x6f767c]);
  const hw = w / 2;
  inFrame(c, f, y, () => {
    // back wall of painted tin with ribs
    B.box(w, 2.55, 0.05, [0, 1.275, -1.85], wallC);
    for (let x = -hw + 0.15; x < hw; x += 0.3) B.box(0.03, 2.5, 0.02, [x, 1.25, -1.82], 0x2a2a2a);
    // counter
    const cc = pick(r, [PAL.woodTrim, PAL.woodDoor, 0x5d7a8a, 0x8a6a4a]);
    P.box(w - 0.12, 0.76, 0.58, [0, 0.38, 0.04], cc);
    P.box(w - 0.08, 0.025, 0.62, [0, 0.77, 0.04], pick(r, [0x8a2222, 0x2a3f78, 0xc9a24a, 0x3d6a4a, 0xe6dcc4]));
    // posts: tall front pipes (string lights hang from them), shorter back posts
    for (const sx of [-1, 1]) {
      B.box(0.05, 3.25, 0.05, [sx * (hw - 0.04), 1.625, 0.42], 0x4a4a4a);
      B.box(0.05, 2.62, 0.05, [sx * (hw - 0.04), 1.31, -1.78], 0x4a4a4a);
    }
    // sloping tarp roof with a rolled front edge
    const z0 = -1.98, z1 = 0.82, y0 = 2.66, y1 = 2.3;
    const L = Math.hypot(z1 - z0, y0 - y1), slope = Math.atan2(y0 - y1, z1 - z0);
    B.box(w + 0.06, 0.03, L, [0, (y0 + y1) / 2, (z0 + z1) / 2], tarp, { rot: [slope, 0, 0] });
    B.cyl(0.04, 0.04, w + 0.06, [-hw - 0.03, y1 - 0.02, z1], tarp, 6, { rot: [0, 0, -HALF_PI] });
    // side cloth (divider to the next stall); the first stall of a run also closes its open end
    B.box(0.025, 1.4, 1.5, [hw, 1.85, -1.05], pick(r, TARPS));
    if (first) {
      B.box(0.025, 1.9, 1.75, [-hw, 1.4, -0.95], pick(r, TARPS));
      B.box(0.03, 0.06, 1.9, [-hw, 2.38, -0.9], 0x3a3a3a);
      // printed bands on the plastic sheet so the lane mouth is not a blank panel
      for (const by of [0.72, 0.84, 2.05]) B.box(0.035, by === 0.84 ? 0.03 : 0.07, 1.75, [-hw, by, -0.95], by === 2.05 ? PAL.templeYellow : 0xe6e3dc);
    }
    // hanging rail under the tarp front + a bare bulb
    P.box(w - 0.1, 0.025, 0.025, [0, 2.2, 0.32], 0x3a3a3a);
    B.box(0.015, 0.25, 0.015, [0.1, 2.22, -0.3], 0x2a2a2a);
    B.box(0.07, 0.09, 0.07, [0.1, 2.06, -0.3], 0xfff0c0, { emit: PAL.stringLight, emitNight: true, emitIntensity: 1.5 });

    const top = 0.785;
    switch (type) {
      case 'malas': {
        for (let i = 0; i < Math.floor((w - 0.3) / 0.45); i++) {
          const x = -hw + 0.35 + i * 0.45;
          P.box(0.4, 0.04, 0.26, [x, top + 0.02, -0.02], 0x4a3020);
          for (let k = 0; k < 4; k++) P.box(0.34, 0.025, 0.04, [x, top + 0.05, -0.12 + k * 0.065], pick(r, [0x8a5a33, 0xb03a2a, 0x2fb2a6, 0xe8dcc0, 0x2a2420]));
        }
        malaRow(H, -hw + 0.15, hw - 0.15, 2.18, 0.32, r);
        malaRow(H, -hw + 0.2, hw - 0.2, 2.0, -1.76, r);
        break;
      }
      case 'flags': {
        for (let i = 0; i < Math.floor((w - 0.3) / 0.3); i++) {
          const x = -hw + 0.3 + i * 0.3;
          for (let k = 0; k < 4; k++) P.box(0.24, 0.035, 0.2, [x, top + 0.02 + k * 0.035, 0.0], LUNGTA[(i + k) % 5]);
        }
        // vertical strings of flags hanging at the front
        for (let i = 0; i < Math.floor((w - 0.2) / 0.32); i++) {
          const x = -hw + 0.25 + i * 0.32;
          for (let k = 0; k < 6; k++) hangBoxFrom(H, 2.18, 0.2, 0.18, 0.012, [x, 2.06 - k * 0.2, 0.33], LUNGTA[k % 5]);
        }
        // a grid of flags pinned to the back wall
        for (let row = 0; row < 3; row++) for (let i = 0; i < Math.floor(w / 0.26); i++) {
          P.box(0.22, 0.2, 0.01, [-hw + 0.15 + i * 0.26, 1.2 + row * 0.3, -1.81], LUNGTA[(i + row) % 5]);
        }
        break;
      }
      case 'scarves': {
        for (let i = 0; i < Math.floor((w - 0.2) / 0.2); i++) scarf(c, -hw + 0.18 + i * 0.2, 2.18, 0.31 + (i % 2) * 0.03, pick(r, TEXTILES), pick(r, TEXTILES), 0.17, range(r, 0.8, 1.15));
        shawlStack(P, -hw + 0.4, top, -0.05, 4, r);
        shawlStack(P, hw - 0.45, top, -0.05, 3, r);
        for (let i = 0; i < Math.floor((w - 0.2) / 0.24); i++) scarf(c, -hw + 0.2 + i * 0.24, 2.1, -1.75, pick(r, TEXTILES), pick(r, TEXTILES), 0.2, 1.1);
        break;
      }
      case 'woollens': {
        // socks in pairs
        for (let i = 0; i < Math.floor((w - 0.2) / 0.16); i++) {
          const x = -hw + 0.18 + i * 0.16, col = pick(r, [0x7a2a3a, 0x8a8a86, 0x38446e, 0xc8a040, 0xe6dcc4, 0x3d6a4a]);
          hangBoxFrom(H, 2.18, 0.07, 0.24, 0.03, [x, 2.05, 0.33], col);
          hangBoxFrom(H, 2.18, 0.1, 0.06, 0.03, [x + 0.02, 1.92, 0.33], col);
          hangBoxFrom(H, 2.18, 0.07, 0.05, 0.032, [x, 2.15, 0.33], 0xeeeae0);
        }
        // woollen caps on the counter
        for (let i = 0; i < Math.floor((w - 0.3) / 0.22); i++) for (let k = 0; k < 2; k++) {
          const x = -hw + 0.3 + i * 0.22, z = -0.12 + k * 0.22, col = pick(r, TEXTILES);
          P.cyl(0.06, 0.09, 0.1, [x, top, z], col, 7);
          P.box(0.04, 0.04, 0.04, [x, top + 0.11, z], pick(r, TEXTILES));
        }
        for (let i = 0; i < Math.floor((w - 0.2) / 0.3); i++) hangBoxFrom(H, 2.0, 0.22, 0.4, 0.02, [-hw + 0.25 + i * 0.3, 1.8, -1.76], pick(r, TEXTILES));
        break;
      }
      case 'incense': {
        for (let i = 0; i < Math.floor((w - 0.3) / 0.28); i++) {
          const x = -hw + 0.3 + i * 0.28;
          P.box(0.24, 0.1, 0.2, [x, top + 0.05, -0.05], 0x8a6a3a);
          const wrap = pick(r, [0xc8322b, 0xe0b02a, 0x2f8a4a, 0x2f63b8, 0xe07a2e]);
          for (let k = 0; k < 4; k++) {
            P.box(0.035, 0.32, 0.035, [x - 0.07 + k * 0.045, top + 0.25, -0.05], 0x6a4a2a);
            P.box(0.04, 0.05, 0.04, [x - 0.07 + k * 0.045, top + 0.2, -0.05], wrap);
          }
        }
        // an incense dish with a lit stick, smoke curling up
        P.cyl(0.07, 0.06, 0.03, [hw - 0.25, top, 0.18], PAL.khorloCopper, 8);
        P.box(0.012, 0.22, 0.012, [hw - 0.25, top + 0.13, 0.18], 0x6a3a22, { rot: [0.25, 0, 0] });
        const sp = wpos(f, y, [hw - 0.25, top + 0.25, 0.21]);
        c.steam.push({ x: sp[0], y: sp[1], z: sp[2], n: 3, size: 0.3, rise: 0.7 });
        for (let i = 0; i < Math.floor((w - 0.2) / 0.22); i++) snackStrip(H, -hw + 0.2 + i * 0.22, 2.18, 0.33, 3, r);
        for (let k = 0; k < 3; k++) P.box(w - 0.3, 0.03, 0.22, [0, 0.9 + k * 0.4, -1.7], PAL.woodTrim);
        for (let k = 0; k < 3; k++) for (let i = 0; i < Math.floor((w - 0.4) / 0.14); i++) P.box(0.1, 0.16, 0.12, [-hw + 0.3 + i * 0.14, 1.0 + k * 0.4, -1.7], pick(r, [0xc8322b, 0xe0b02a, 0x2f8a4a, 0x2f63b8, 0xe07a2e, 0x8a5a33]));
        break;
      }
      case 'toys': {
        for (let i = 0; i < 12; i++) {
          const x = range(r, -hw + 0.2, hw - 0.2), z = range(r, -0.18, 0.25), col = pick(r, PLASTIC);
          const k = r();
          if (k < 0.35) P.cyl(0.06, 0.06, 0.12, [x, top, z], col, 8);
          else if (k < 0.7) {
            P.box(0.18, 0.06, 0.09, [x, top + 0.05, z], col);
            P.box(0.09, 0.05, 0.08, [x - 0.02, top + 0.1, z], col);
            for (const wx of [-0.06, 0.06]) for (const wz of [-0.045, 0.045]) P.box(0.04, 0.04, 0.02, [x + wx, top + 0.02, z + wz], 0x2a2a2a);
          } else {
            P.box(0.08, 0.16, 0.06, [x, top + 0.08, z], col);
            P.box(0.06, 0.06, 0.06, [x, top + 0.19, z], PAL.skinLight);
          }
        }
        // bunches of balloons and kites
        for (let i = 0; i < Math.floor((w - 0.2) / 0.25); i++) {
          const x = -hw + 0.2 + i * 0.25;
          hangBoxFrom(H, 2.18, 0.012, 0.25, 0.012, [x, 2.05, 0.33], 0xeeeae0);
          hangBoxFrom(H, 2.18, 0.15, 0.17, 0.15, [x, 1.86, 0.33], pick(r, PLASTIC));
        }
        for (let i = 0; i < Math.floor(w / 0.6); i++) P.box(0.38, 0.38, 0.01, [-hw + 0.35 + i * 0.6, 1.8, -1.81], pick(r, PLASTIC), { rot: [0, 0, Math.PI / 4] });
        break;
      }
      case 'khata': {
        for (let i = 0; i < Math.floor((w - 0.2) / 0.22); i++) scarf(c, -hw + 0.18 + i * 0.22, 2.18, 0.32, i % 3 ? 0xf4f0e2 : 0xece4c8, 0xe6dcc4, 0.19, range(r, 1.0, 1.3));
        for (let i = 0; i < Math.floor((w - 0.3) / 0.3); i++) for (let k = 0; k < 5; k++) P.box(0.24, 0.03, 0.16, [-hw + 0.3 + i * 0.3, top + 0.015 + k * 0.03, -0.1], 0xf4f0e2);
        for (let i = 0; i < 6; i++) P.cyl(0.035, 0.025, 0.06, [-hw + 0.3 + i * 0.12, top, 0.2], PAL.gold, 6);
        break;
      }
      case 'jewellery': {
        for (let i = 0; i < Math.floor((w - 0.3) / 0.45); i++) {
          const x = -hw + 0.35 + i * 0.45;
          P.box(0.4, 0.05, 0.3, [x, top + 0.025, 0.0], 0x2a2a4a);
          for (let k = 0; k < 10; k++) P.box(0.04, 0.02, 0.04, [x - 0.15 + (k % 5) * 0.075, top + 0.06, -0.08 + Math.floor(k / 5) * 0.14], pick(r, [0x2fb2a6, 0xd2523c, 0xc8c8c8, PAL.gold, 0x2fb2a6]));
        }
        singingBowl(P, hw - 0.25, top, 0.15, 0.09, PAL.gold);
        singingBowl(P, hw - 0.45, top, 0.18, 0.07, PAL.khorloCopper);
        malaRow(H, -hw + 0.15, hw - 0.15, 2.18, 0.32, r);
        break;
      }
    }
  });
  // colliders: the counter (standable) and the stall behind it
  c.colliders.push(localBox(f, 0, 0.04, w - 0.08, 0.62, y - 0.5, y + 0.78, 'stall'));
  c.colliders.push(localBox(f, 0, -1.07, w, 1.6, y - 0.5, y + 2.45, 'stall'));
  for (const sx of [-1, 1]) postTops.push({ s: s + 0, p: wpos(f, y, [sx * (w / 2 - 0.04), 3.22, 0.42]) });
}

export function marketLane(c: Ctx): LaneResult {
  const posts: { s: number; p: V3 }[][] = [[], []];
  for (const side of [1, -1] as const) {
    const r = rng(side > 0 ? 4401 : 4407);
    const order = ORDER[side > 0 ? 0 : 1];
    // lay out the stall widths first so the run's open end can be closed with a side cloth
    const widths: number[] = [];
    for (let s = LANE_STALLS[0]; ;) {
      const w = range(r, 2.05, 2.55);
      if (s + w > LANE_STALLS[1]) break;
      widths.push(w);
      s += w + 0.02;
    }
    let s = LANE_STALLS[0];
    widths.forEach((w, i) => {
      const mid = s + w / 2;
      s += w + 0.02;
      const f = roadsideFrame(LANE, mid, side, 0);
      const ok = rectOK(LANE, { x: f.x, z: f.z, yaw: f.yaw }, w, 1.0, { otherRoad: 1.4 }, 0, -1.3) &&
        rectOK(LANE, { x: f.x, z: f.z, yaw: f.yaw }, w, 0.1, { otherRoad: 1.6 }, 0, -0.6);
      if (!ok) return;
      const y = roadFrame(LANE, mid).y;
      // local +x runs toward smaller s on the right-hand side, larger s on the left-hand side
      const closeEnd = side < 0 ? i === 0 : i === widths.length - 1;
      stall(c, f, y, w, order[i % order.length], r, posts[side > 0 ? 0 : 1], mid, closeEnd);
      c.footprints.push({ x: (f.x + Math.sin(f.yaw) * -0.7), z: f.z + Math.cos(f.yaw) * -0.7, hw: w / 2, hd: 1.2, yaw: f.yaw });
    });
  }
  stringLights(c, posts);
  return { posts };
}

const BULBS = [PAL.stringLight, 0xff6a5a, 0x7adf8a, 0x7aa8ff, 0xffd84a, PAL.stringLight] as const;

/** Festival lights zig-zagging between the front posts of opposite stalls. */
function stringLights(c: Ctx, posts: { s: number; p: V3 }[][]) {
  const A = posts[0].slice().sort((a, b) => a.s - b.s), B = posts[1].slice().sort((a, b) => a.s - b.s);
  // use every other post (one per stall) to keep the zig-zag readable
  const a = A.filter((_, i) => i % 2 === 0), b = B.filter((_, i) => i % 2 === 1);
  const seq: V3[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]) seq.push(a[i].p);
    if (b[i]) seq.push(b[i].p);
  }
  let k = 0;
  for (let i = 1; i < seq.length; i++) {
    const p0 = seq[i - 1], p1 = seq[i];
    const span = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    if (span > 7) continue;
    const pts = catenary(p0, p1, 0.32, Math.max(4, Math.round(span / 0.3)));
    for (let j = 1; j < pts.length; j++) {
      const q0 = pts[j - 1], q1 = pts[j];
      const dx = q1[0] - q0[0], dy = q1[1] - q0[1], dz = q1[2] - q0[2];
      const len = Math.hypot(dx, dy, dz);
      c.props.groupEuler([(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2, (q0[2] + q1[2]) / 2], [0, Math.atan2(dx, dz), 0], () => {
        c.props.box(0.014, 0.014, len, [0, 0, 0], 0x2a2a2a, { rot: [-Math.atan2(dy, Math.hypot(dx, dz)), 0, 0] });
      });
      const col = BULBS[k++ % BULBS.length];
      c.props.box(0.06, 0.07, 0.06, [q1[0], q1[1] - 0.05, q1[2]], col, { emit: col, emitNight: true, emitIntensity: 2.2 });
    }
  }
  // a few real lights along the lane
  for (const s of [6.5, 11.5, 16.5, 21]) {
    const f = roadFrame(LANE, s);
    c.lamps.push({ x: f.x, y: f.y + 2.7, z: f.z, color: PAL.stringLight, intensity: 6.5, distance: 8 });
  }
  // prayer flags across the lane, higher than the lights
  for (const s of [5.2, 13.4, 22]) {
    const f = roadFrame(LANE, s);
    const ax = f.x + f.nx * 2.2 - (f.nz) * 0.6, az = f.z + f.nz * 2.2 + f.nx * 0.6;
    const bx = f.x - f.nx * 2.2 + (f.nz) * 0.6, bz = f.z - f.nz * 2.2 - f.nx * 0.6;
    c.flags.push({ a: [ax, f.y + 3.9, az], b: [bx, f.y + 3.75, bz], sag: 0.35, seed: Math.round(s * 31) });
  }
}
