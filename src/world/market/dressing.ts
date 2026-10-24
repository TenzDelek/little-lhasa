// Shop-front dressing: what spills out of each shop onto its forecourt and hangs off its façade. Called
// inside inFrame() at the building's floor level: front wall at local z = d/2, outward = +z, the forecourt
// runs from z = d/2 to z = d/2 + fd. The middle ~1.5 m in front of the door is kept clear.
import { PAL } from '../../core/palette';
import { makeSign, signSize, type SignSpec } from '../../kit/sign';
import { pick, range, type Rng } from '../../core/math';
import type { BoxInit } from '../../core/collision';
import { type Ctx } from './ctx';
import { localBox, type Frame, TEXTILES, hangBoxFrom } from './util';
import {
  bowlTable, cafeSet, chair, crate, handWheels, malaRow, menuBoard, plant, sack, shawlRail, shawlStack,
  snackStrip, steamerStack, thangka, umbrella, laundry, bottle,
} from './items';

export type ShopKind =
  | 'handicraft' | 'shawl' | 'cafe' | 'bakery' | 'germanBakery' | 'momo' | 'chemist' | 'travel' | 'cyber'
  | 'tailor' | 'general' | 'guesthouse' | 'house' | 'books' | 'thangka';

export interface Dress {
  kind: ShopKind;
  w: number; d: number;
  /** Forecourt depth in front of the façade (m). */
  fd: number;
  /** Building frame + floor y (for colliders / world points). */
  f: Frame; y: number;
  floorH: number;
  floors: number;
  /** World y of the roof top. */
  top: number;
  roof: string;
  r: Rng;
  /** Sign to hang on the café balcony railing (the kit was told not to draw it). */
  sign?: SignSpec | null;
}

const HALF_PI = Math.PI / 2;
const FORECOURT = [PAL.concrete, PAL.pavingDark, 0xa08a7a, PAL.slateLight, PAL.paving, 0x9a8f80] as const;

/** Push a collider for a local box (lx, lz centre; w x d; local y0..y1). */
function col(c: Ctx, D: Dress, lx: number, lz: number, w: number, d: number, y0: number, y1: number, tag = 'market') {
  const b: BoxInit = localBox(D.f, lx, lz, w, d, D.y + y0, D.y + y1, tag);
  c.colliders.push(b);
}

/** Concrete / tiled forecourt in front of a shop, with a step down to the pavement. */
export function forecourt(c: Ctx, D: Dress) {
  const { w, d, fd, r } = D;
  const z0 = d / 2;
  if (fd < 0.3) return;
  const colr = pick(r, FORECOURT);
  const zs = z0 + fd - 0.26; // the step down to the pavement sits inside the forecourt depth
  c.props.slab(-w / 2, -1.4, z0 - 0.05, w / 2, 0, zs, colr);
  c.props.slab(-w / 2, -1.4, zs - 0.1, w / 2, 0.012, zs, PAL.curb); // nosing
  c.props.slab(-w / 2 + 0.05, -1.4, zs, w / 2 - 0.05, -0.2, z0 + fd, PAL.concreteDark); // step
  if (r() < 0.5) for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.6) c.props.box(0.02, 0.006, fd - 0.4, [x, 0.003, z0 + (fd - 0.26) / 2], PAL.concreteStain);
  col(c, D, 0, (z0 - 0.05 + zs) / 2, w, zs - z0 + 0.05, -1.4, 0, 'forecourt');
  col(c, D, 0, (zs + z0 + fd) / 2, w - 0.1, z0 + fd - zs, -1.4, -0.2, 'step');
}

/** Thangkas hung on the façade (x positions), at height y. */
function wallThangkas(c: Ctx, D: Dress, xs: number[], y: number, size = 1) {
  for (const x of xs) thangka(c.props, [x, y, D.d / 2 + 0.01], 0.46 * size, 0.7 * size, Math.floor(D.r() * 3), D.r);
}

/** Side zones (left/right of the door) available for displays. */
function sides(D: Dress): Array<{ x0: number; x1: number; cx: number; sgn: number }> {
  const out: Array<{ x0: number; x1: number; cx: number; sgn: number }> = [];
  const half = D.w / 2 - 0.25, door = 0.85;
  if (half - door > 0.5) {
    out.push({ x0: -half, x1: -door, cx: -(half + door) / 2, sgn: -1 });
    out.push({ x0: door, x1: half, cx: (half + door) / 2, sgn: 1 });
  }
  return out;
}

export function dressShop(c: Ctx, D: Dress) {
  const { kind, d, r } = D;
  const fd = D.fd - 0.28; // usable flat depth (the step down to the pavement takes the rest)
  const z0 = d / 2;
  const S = sides(D);
  const deep = fd >= 0.45;
  const zc = z0 + Math.min(fd, 0.5) / 2 + 0.03; // centre of a display hugging the wall

  switch (kind) {
    case 'handicraft': {
      for (const s of S) {
        if (s.sgn < 0) {
          if (deep) {
            const tw = Math.min(1.2, s.x1 - s.x0), td = Math.min(0.45, fd - 0.05);
            bowlTable(c.props, s.cx, zc, tw, td, r);
            col(c, D, s.cx, zc, tw, td, 0, 0.78);
          } else wallThangkas(c, D, [s.cx], 1.45, 0.9);
        } else {
          malaRow(c.hang, s.x0 + 0.05, s.x1 - 0.05, 2.25, z0 + 0.14, r);
          c.props.box(s.x1 - s.x0 + 0.1, 0.03, 0.03, [s.cx, 2.27, z0 + 0.14], 0x3a3a3a);
          for (const sx of [s.x0, s.x1]) c.props.box(0.03, 0.03, 0.16, [sx, 2.27, z0 + 0.07], 0x3a3a3a);
          if (deep) {
            c.props.box(0.5, 0.45, 0.4, [s.cx, 0.225, zc], PAL.woodDoor);
            handWheels(c.props, s.cx, 0.45, zc, 4, r);
            col(c, D, s.cx, zc, 0.5, 0.4, 0, 0.5);
          }
        }
      }
      break;
    }
    case 'shawl': {
      for (const s of S) {
        shawlRail(c.props, c.hang, s.x0 + 0.1, s.x1 - 0.05, 2.3, z0 + 0.2, r);
        for (const sx of [s.x0, s.x1]) c.props.box(0.03, 0.03, 0.22, [sx, 2.32, z0 + 0.1], 0x3a3a3a);
        if (deep && s.sgn > 0 && fd > 0.7) {
          const tz = z0 + fd - 0.22;
          c.props.box(0.6, 0.6, 0.4, [s.cx, 0.3, tz], PAL.woodTrim);
          shawlStack(c.props, s.cx, 0.6, tz, 5, r);
          col(c, D, s.cx, tz, 0.6, 0.4, 0, 0.9);
        }
      }
      break;
    }
    case 'cafe': case 'momo': {
      const mz = z0 + Math.max(0.2, Math.min(fd - 0.18, 0.42));
      if (S[0]) menuBoard(c.props, S[0].cx, mz, 0.2, r);
      if (S[0]) col(c, D, S[0].cx, mz, 0.5, 0.35, 0, 0.8);
      if (kind === 'momo' && S[1]) {
        const sx = S[1].cx;
        c.props.box(0.5, 0.55, 0.5, [sx, 0.275, zc], 0x3a3a3a);
        const top = steamerStack(c.props, sx, 0.55, zc, 3);
        c.steam.push({ ...wposL(D, top), n: 5, size: 0.9 });
        col(c, D, sx, zc, 0.55, 0.5, 0, 1.2);
      } else if (S[1] && fd >= 0.85) {
        cafeSet(c.props, S[1].cx, 0, z0 + fd / 2 + 0.02, r);
        col(c, D, S[1].cx, z0 + fd / 2 + 0.02, 0.7, 0.7, 0, 0.75);
      } else if (S[1]) plant(c.props, S[1].x1 - 0.2, 0, zc, r, true);
      if (kind === 'cafe') cafeBalcony(c, D);
      break;
    }
    case 'bakery': case 'germanBakery': {
      const s = S[0] ?? { cx: -D.w / 4, x0: -D.w / 2, x1: 0, sgn: -1 };
      const cw = Math.min(1.3, s.x1 - s.x0);
      const cd = Math.max(0.3, Math.min(0.5, fd - 0.06));
      const cz = z0 + cd / 2 + 0.03;
      c.props.box(cw, 0.8, cd, [s.cx, 0.4, cz], PAL.woodTrim);
      c.props.box(cw - 0.08, 0.5, 0.02, [s.cx, 0.45, cz + cd / 2 + 0.005], PAL.glassDay, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.8 });
      // cakes and breads on top under a glass hood (frame only)
      for (let i = 0; i < 4; i++) {
        const bx = s.cx - cw / 2 + 0.18 + i * ((cw - 0.36) / 3);
        const kindB = i % 3;
        if (kindB === 0) { c.props.cyl(0.11, 0.11, 0.08, [bx, 0.8, cz], pick(r, [0x5a3422, 0xeee0c8, 0xe0a0b0]), 8); c.props.cyl(0.11, 0.11, 0.015, [bx, 0.88, cz], 0xf4f0e6, 8); }
        else if (kindB === 1) for (let k = 0; k < 3; k++) c.props.box(0.1, 0.05, 0.07, [bx + (k - 1) * 0.04, 0.83, cz + (k - 1) * 0.06], 0xc8904a, { rot: [0, 0.4, 0] });
        else c.props.cyl(0.08, 0.09, 0.06, [bx, 0.8, cz], 0xb07a3a, 6);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.props.box(0.02, 0.32, 0.02, [s.cx + sx * (cw / 2 - 0.02), 0.96, cz + sz * (cd / 2 - 0.02)], 0xd8dcdc);
      c.props.box(cw, 0.02, cd, [s.cx, 1.12, cz], 0xb9d0dc);
      col(c, D, s.cx, cz, cw, cd, 0, 1.13);
      if (S[1]) {
        const mz = z0 + Math.max(0.2, Math.min(fd - 0.18, 0.42));
        menuBoard(c.props, S[1].cx, mz, -0.25, r);
        col(c, D, S[1].cx, mz, 0.5, 0.35, 0, 0.8);
      }
      if (kind === 'germanBakery') cafeBalcony(c, D);
      break;
    }
    case 'chemist': {
      // projecting light box with the green cross
      const sx = D.w / 2 - 0.35;
      c.bld.box(0.08, 0.06, 0.5, [sx, 2.75, z0 + 0.25], 0x3a3a3a);
      c.bld.box(0.14, 0.62, 0.62, [sx, 2.75, z0 + 0.55], 0xeeeae0);
      for (const side of [-1, 1]) {
        c.bld.box(0.02, 0.44, 0.14, [sx + side * 0.075, 2.75, z0 + 0.55], 0x2faa55, { emit: 0x3fdf6a, emitIntensity: 0.55 });
        c.bld.box(0.02, 0.14, 0.44, [sx + side * 0.075, 2.75, z0 + 0.55], 0x2faa55, { emit: 0x3fdf6a, emitIntensity: 0.55 });
      }
      if (S[0] && deep) {
        c.props.box(0.9, 1.1, 0.35, [S[0].cx, 0.55, zc], 0xd8dcdc);
        c.props.box(0.8, 0.9, 0.02, [S[0].cx, 0.62, zc + 0.18], PAL.glassDay, { emit: 0xdfe8ff, emitNight: true, emitIntensity: 0.6 });
        for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) c.props.box(0.1, 0.12, 0.08, [S[0].cx - 0.32 + i * 0.16, 0.3 + k * 0.3, zc + 0.08], pick(r, [0xeeeae0, 0x3a6a9a, 0xc8322b, 0x5f8a2a, 0xe0b02a]));
        col(c, D, S[0].cx, zc, 0.9, 0.35, 0, 1.1);
      }
      break;
    }
    case 'travel': {
      for (const s of S) {
        // poster boards: snow peaks
        const px = s.cx, bg = s.sgn < 0 ? 0x2f5f8a : 0x3d6a4a;
        c.props.box(0.7, 0.95, 0.04, [px, 1.45, z0 + 0.03], bg);
        c.props.prism(0.6, 0.38, 0.02, [px - 0.05, 1.12, z0 + 0.06], PAL.mountain);
        c.props.prism(0.3, 0.18, 0.025, [px - 0.05, 1.32, z0 + 0.065], PAL.snow);
        c.props.prism(0.4, 0.26, 0.02, [px + 0.18, 1.12, z0 + 0.07], PAL.mountainDark);
        c.props.box(0.5, 0.08, 0.02, [px, 1.8, z0 + 0.06], 0xf1c232);
        c.props.box(0.36, 0.05, 0.02, [px, 1.68, z0 + 0.06], 0xf4f6fa);
      }
      if (S[1] && deep) {
        c.props.box(0.4, 1.0, 0.25, [S[1].cx, 0.5, zc + 0.05], 0x3a3a3a);
        for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) c.props.box(0.1, 0.14, 0.02, [S[1].cx - 0.12 + i * 0.12, 0.45 + k * 0.2, zc + 0.19], pick(r, [0x8fb4cf, 0xf4f6fa, 0xe0b02a, 0x5f8a2a]));
        col(c, D, S[1].cx, zc + 0.05, 0.4, 0.25, 0, 1.0);
      }
      break;
    }
    case 'cyber': {
      if (S[0]) {
        const sx = S[0].cx;
        c.props.box(0.9, 0.04, 0.45, [sx, 0.74, zc], PAL.woodTrim);
        for (const lx of [-0.4, 0.4]) c.props.box(0.04, 0.74, 0.4, [sx + lx, 0.37, zc], PAL.woodTrim);
        c.props.box(0.36, 0.3, 0.3, [sx, 0.93, zc - 0.02], 0xd8d0b8); // CRT
        c.props.box(0.28, 0.2, 0.01, [sx, 0.95, zc + 0.135], 0x2a4a6a, { emit: 0x6fa8dc, emitIntensity: 0.6 });
        c.props.box(0.36, 0.02, 0.12, [sx, 0.77, zc + 0.15], 0xd8d0b8);
        col(c, D, sx, zc, 0.9, 0.45, 0, 1.1);
      }
      if (S[1]) plant(c.props, S[1].x1 - 0.2, 0, zc, r);
      break;
    }
    case 'tailor': {
      if (S[0] && deep) {
        const sx = S[0].cx;
        sewingMachine(c, sx, zc);
        col(c, D, sx, zc, 0.85, 0.45, 0, 1.0);
      }
      if (S[1]) {
        // dress form with a half-sewn chuba, and bolts of cloth on a shelf
        const sx = S[1].cx;
        c.props.box(0.04, 0.9, 0.04, [sx - 0.2, 0.45, zc], 0x3a3a3a);
        c.props.taper(0.34, 0.24, 0.28, 0.2, 0.55, [sx - 0.2, 0.9, zc], pick(r, [PAL.chubaMaroon, PAL.chubaNavy, PAL.chubaBrown, PAL.blouseSky]));
        c.props.box(0.12, 0.08, 0.08, [sx - 0.2, 1.49, zc], 0xd8d0c0);
        c.props.box(0.5, 0.04, 0.3, [sx + 0.25, 1.2, z0 + 0.15], PAL.woodTrim);
        for (let i = 0; i < 4; i++) c.props.cyl(0.055, 0.055, 0.42, [sx + 0.04, 1.27 + (i % 2) * 0.1, z0 + 0.1 + (i >> 1) * 0.11], pick(r, TEXTILES), 6, { rot: [0, 0, HALF_PI] });
        col(c, D, sx - 0.2, zc, 0.4, 0.3, 0, 1.5);
      }
      break;
    }
    case 'general': {
      for (const s of S) {
        for (let k = 0; k < 3; k++) snackStrip(c.hang, s.x0 + 0.15 + k * ((s.x1 - s.x0 - 0.3) / 2), 2.3, z0 + 0.1, 5, r);
        c.props.box(s.x1 - s.x0, 0.03, 0.03, [s.cx, 2.32, z0 + 0.1], 0x3a3a3a);
        if (deep) {
          const n = Math.max(1, Math.floor((s.x1 - s.x0) / 0.55));
          for (let i = 0; i < n; i++) {
            const x = s.x0 + 0.28 + i * 0.55;
            if (i % 2 === 0) { c.props.box(0.5, 0.35, 0.4, [x, 0.175, zc], 0x7a5a36); crate(c.props, x, 0.35, zc, r); }
            else sack(c.props, x, 0, zc, r);
          }
          col(c, D, s.cx, zc, s.x1 - s.x0, 0.45, 0, 0.7);
        }
      }
      if (deep && S[1]) {
        // red cooler with bottles
        const x = S[1].x1 - 0.3;
        c.props.box(0.5, 0.85, 0.45, [x, 0.425, zc - 0.02], 0xa83a2e);
        c.props.box(0.42, 0.06, 0.4, [x, 0.88, zc - 0.02], 0xe8e4da);
        for (let i = 0; i < 3; i++) bottle(c.props, x - 0.14 + i * 0.14, 0.91, zc - 0.02, pick(r, [0x4f86a8, 0xe0b02a, 0x2a2a2a]), 0.2);
      }
      break;
    }
    case 'guesthouse': case 'house': {
      for (const s of S) if (r() < 0.75) plant(c.props, s.sgn < 0 ? s.x1 - 0.25 : s.x0 + 0.25, 0, z0 + 0.3, r, r() < 0.4);
      if (kind === 'house' && fd > 0.5 && r() < 0.5 && S[0]) {
        // a bicycle leaning on the wall
        const x = S[0].cx;
        for (const bx of [-0.42, 0.42]) c.props.cyl(0.3, 0.3, 0.03, [x + bx, 0.3, z0 + 0.25], 0x2a2a2a, 10, { rot: [HALF_PI, 0, 0] });
        c.props.box(0.86, 0.04, 0.04, [x, 0.42, z0 + 0.27], pick(r, [0x2f5f8a, 0xa83a2e, 0x2a2a2a]), { rot: [0, 0, 0.2] });
        c.props.box(0.04, 0.4, 0.04, [x - 0.1, 0.62, z0 + 0.27], 0x2a2a2a);
        c.props.box(0.2, 0.05, 0.08, [x - 0.1, 0.84, z0 + 0.27], 0x2a2a2a);
        col(c, D, x, z0 + 0.27, 1.4, 0.2, 0, 0.9);
      }
      break;
    }
    default: break;
  }
}

function wposL(D: Dress, l: readonly [number, number, number]) {
  const c = Math.cos(D.f.yaw), s = Math.sin(D.f.yaw);
  return { x: D.f.x + l[0] * c + l[2] * s, y: D.y + l[1], z: D.f.z - l[0] * s + l[2] * c };
}

function sewingMachine(c: Ctx, x: number, z: number) {
  const p = c.props;
  p.box(0.8, 0.04, 0.42, [x, 0.74, z], PAL.woodTrim);
  for (const sx of [-1, 1]) {
    p.box(0.04, 0.72, 0.36, [x + sx * 0.36, 0.36, z], 0x2a2a2a);
    p.box(0.04, 0.1, 0.36, [x + sx * 0.36, 0.05, z], 0x1d1a1a);
  }
  p.box(0.5, 0.03, 0.22, [x, 0.08, z + 0.02], 0x2a2a2a, { rot: [0.2, 0, 0] }); // treadle
  p.box(0.36, 0.06, 0.16, [x, 0.79, z], 0x1d1a1a);
  p.box(0.07, 0.2, 0.1, [x + 0.14, 0.92, z], 0x1d1a1a);
  p.box(0.32, 0.07, 0.09, [x, 1.03, z], 0x1d1a1a);
  p.box(0.06, 0.12, 0.06, [x - 0.15, 0.95, z], 0x1d1a1a);
  p.cyl(0.07, 0.07, 0.025, [x + 0.2, 0.97, z], 0x8a8a8a, 8, { rot: [0, 0, HALF_PI] });
  p.box(0.12, 0.012, 0.02, [x, 1.03, z + 0.047], PAL.gold);
  p.box(0.3, 0.015, 0.25, [x - 0.2, 0.77, z + 0.05], 0x2f63b8); // cloth under the needle
}

/** First-floor balcony with café seating (concrete slab, painted railing, tables, plants). */
export function cafeBalcony(c: Ctx, D: Dress) {
  const { w, d, fd, r, floorH } = D;
  const proj = Math.min(1.25, fd - 0.05);
  if (proj < 0.7 || D.floors < 2) return;
  const z0 = d / 2, y = floorH;
  const bw = Math.min(w - 0.4, 4.6);
  const rail = pick(r, [PAL.railing, 0xeeeae0, PAL.templeRed, PAL.roofGreen, 0x6a3f24]);
  c.bld.slab(-bw / 2, y - 0.14, z0, bw / 2, y, z0 + proj, PAL.concrete);
  c.bld.slab(-bw / 2, y - 0.2, z0 + proj - 0.08, bw / 2, y - 0.14, z0 + proj, PAL.concreteDark);
  // railing: posts, top rail, a lower rail, and a painted board at the bottom
  for (let x = -bw / 2 + 0.03; x <= bw / 2; x += bw / Math.max(2, Math.round(bw / 0.6))) c.bld.box(0.04, 0.9, 0.04, [x, y + 0.45, z0 + proj - 0.04], rail);
  c.bld.box(bw, 0.05, 0.06, [0, y + 0.92, z0 + proj - 0.04], rail);
  c.bld.box(bw, 0.03, 0.03, [0, y + 0.5, z0 + proj - 0.04], rail);
  for (const sx of [-1, 1]) {
    c.bld.box(0.05, 0.05, proj, [sx * (bw / 2 - 0.025), y + 0.92, z0 + proj / 2], rail);
    c.bld.box(0.04, 0.9, 0.04, [sx * (bw / 2 - 0.02), y + 0.45, z0 + 0.04], rail);
  }
  // tables and chairs
  const n = Math.max(1, Math.floor(bw / 1.5));
  const cc = pick(r, [0xe8e4da, 0x3f7a4c, 0xa83a2e]);
  for (let i = 0; i < n; i++) {
    const x = -bw / 2 + (i + 0.5) * (bw / n);
    c.props.cyl(0.26, 0.26, 0.04, [x, y + 0.68, z0 + proj / 2 + 0.05], 0xe6e3dc, 8);
    c.props.box(0.04, 0.68, 0.04, [x, y + 0.34, z0 + proj / 2 + 0.05], 0x3a3a3a);
    c.props.cyl(0.04, 0.035, 0.07, [x + 0.06, y + 0.72, z0 + proj / 2], 0xeeeae0, 6);
    for (const sx of [-1, 1]) c.props.group([x + sx * 0.45, y, z0 + proj / 2 + 0.05], sx > 0 ? -HALF_PI : HALF_PI, () => chair(c.props, cc));
  }
  if (r() < 0.7) plant(c.props, bw / 2 - 0.22, y, z0 + proj - 0.25, r);
  if (D.sign) {
    const m = makeSign({ ...D.sign, w: Math.min(bw - 0.3, Math.max(1.6, D.sign.w ?? 0)), h: D.sign.bod ? 0.62 : 0.46 });
    const p = wposL(D, [0, y + 0.42, z0 + proj + 0.035]);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = D.f.yaw;
    c.meshes.push(m);
  }
  // a string of small prayer flags along the railing
  if (r() < 0.6) {
    const a = wposL(D, [-bw / 2, y + 0.95, z0 + proj - 0.04]);
    const b = wposL(D, [bw / 2, y + 0.95, z0 + proj - 0.04]);
    c.flags.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], sag: 0.12, size: 0.16, spacing: 0.22, seed: Math.floor(r() * 999) });
  }
}

/** Rooftop café on a terrace roof: umbrellas, tables, flags. */
export function rooftopCafe(c: Ctx, D: Dress) {
  const { w, d, r } = D;
  const y = D.top - D.y;
  const cols = [0xb8322b, 0x2f5f8a, 0xc9a24a, 0x3f7a4c, 0xeeeae0];
  const n = Math.max(1, Math.floor((w - 1) / 2.2));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 1.1 + i * ((w - 2.2) / Math.max(1, n - 1 || 1));
    const z = d / 2 - 1.3;
    umbrella(c.bld, x, y, z, pick(r, cols), 2.0, 0.85);
    cafeSet(c.props, x, y, z + 0.05, r, true);
  }
  const back = wposL(D, [0, y, -d / 2 + 0.5]);
  const p0 = wposL(D, [-w / 2 + 0.15, y + 0.9, d / 2 - 0.15]);
  const p1 = wposL(D, [w / 2 - 0.15, y + 0.9, d / 2 - 0.15]);
  c.bld.box(0.06, 2.6, 0.06, [0, y + 1.3, -d / 2 + 0.5], 0x8a7a5a);
  c.flags.push({ a: [back.x, back.y + 2.55, back.z], b: [p0.x, p0.y, p0.z], seed: Math.floor(r() * 999), age: r() * 0.6 });
  c.flags.push({ a: [back.x, back.y + 2.55, back.z], b: [p1.x, p1.y, p1.z], seed: Math.floor(r() * 999), age: r() * 0.6 });
}

/** Rooftop prayer flags on an ordinary roof: a bamboo pole at the back, lines to the front corners. */
export function roofFlags(c: Ctx, D: Dress, onTin: boolean) {
  const { w, d, r } = D;
  const y = D.top - D.y;
  const pz = -d / 2 + 0.6;
  const h = range(r, 1.8, 2.8);
  c.bld.box(0.07, h + (onTin ? 0.6 : 0), 0.07, [range(r, -w / 4, w / 4), y + h / 2 - (onTin ? 0.3 : 0), pz], 0x8a7a5a);
  const top = wposL(D, [0, y + h - 0.05, pz]);
  const age = r() * 0.8;
  for (const sx of [-1, 1]) {
    if (r() < 0.25) continue;
    const e = wposL(D, [sx * (w / 2 - 0.1), y + (onTin ? 0.2 : 0.95), d / 2 - 0.1]);
    c.flags.push({ a: [top.x, top.y, top.z], b: [e.x, e.y, e.z], seed: Math.floor(r() * 9999), age });
  }
}

/**
 * Something drying in the sun on a flat roof, on a woven bamboo mat just behind the front parapet: red
 * chillies, cubes of chhurpi (dried yak cheese) or apricots. Low enough to stay under the parapet.
 */
export function roofDrying(c: Ctx, D: Dress) {
  const { w, d, r, floors, floorH } = D;
  if (w < 3.6 || d < 3.2) return;
  const y = floors * floorH + 0.03;
  const mw = Math.min(1.5, w - 2.4), md = 0.9;
  const x = range(r, -(w / 2 - 1.2 - mw / 2), w / 2 - 1.2 - mw / 2), z = d / 2 - 0.45 - 0.5 - md / 2;
  c.props.box(mw, 0.02, md, [x, y + 0.01, z], 0xb89a5a);
  for (let k = -md / 2 + 0.1; k < md / 2; k += 0.18) c.props.box(mw, 0.022, 0.025, [x, y + 0.012, z + k], 0x9a7e46);
  const what = r();
  const cols = what < 0.5 ? [0xb8281e, 0xc8302a, 0x9a2018] : what < 0.8 ? [0xeee6d2, 0xe2d8c0] : [0xe08a2a, 0xd0782a];
  const n = Math.round(mw * md * 26);
  for (let i = 0; i < n; i++) {
    const long = what < 0.5;
    c.props.box(long ? 0.1 : 0.06, 0.035, long ? 0.035 : 0.06, [x + range(r, -mw / 2 + 0.06, mw / 2 - 0.06), y + 0.04, z + range(r, -md / 2 + 0.06, md / 2 - 0.06)], pick(r, cols), { rot: [0, r() * 3, 0] });
  }
}

/** Laundry line across part of an upper floor (brackets + clothes on the sway Parts). */
export function upperLaundry(c: Ctx, D: Dress) {
  const { w, d, r, floorH, floors } = D;
  if (floors < 2) return;
  const k = 1 + Math.floor(r() * (floors - 1));
  const y = k * floorH + 1.95;
  const x0 = -w / 2 + 0.35, x1 = Math.min(w / 2 - 0.35, x0 + range(r, 1.6, 3));
  const z = d / 2 + 0.32;
  for (const x of [x0, x1]) c.props.box(0.03, 0.03, 0.34, [x, y + 0.01, d / 2 + 0.16], 0x3a3a3a);
  laundry(c.props, c.hang, [x0, y, z], [x1, y, z], r);
}

const BLADE: Partial<Record<ShopKind, string[]>> = {
  cafe: ['WIFI', 'CAFE', 'TEA'], travel: ['TREK', 'TAXI', 'BUS TICKET'], cyber: ['XEROX', 'STD ISD', 'WIFI'],
  general: ['STD ISD', 'MILK'], handicraft: ['TIBETAN', 'ANTIQUE'], shawl: ['YAK WOOL'], guesthouse: ['ROOMS', 'HOT WATER'],
  momo: ['THUKPA', 'TEA'], tailor: ['CHUBA'], bakery: ['CAKES'], germanBakery: ['CAKES'],
};
const BLADE_COL: Array<[number, number]> = [
  [0xf1c232, 0x23202a], [0x2f5f8a, 0xf3efe6], [PAL.templeRed, PAL.templeYellow], [0xeeeae0, 0x6a2630], [0x2f8a4a, 0xf3efe6], [0x23202a, 0x7adf8a],
];

/** A small double-sided board on a bracket, sticking out from the façade so it reads along the street. */
export function bladeSign(c: Ctx, D: Dress) {
  const list = BLADE[D.kind];
  if (!list || D.fd < 0.55) return;
  const { r, w, d } = D;
  const text = pick(r, list);
  const [bg, fg] = pick(r, BLADE_COL);
  const sw = signSize({ text, h: 0.42 }).w;
  if (0.1 + sw > D.fd + 0.25) return; // keep it over the forecourt, clear of the kerb strip
  const sx = (r() < 0.5 ? -1 : 1) * (w / 2 - 0.3);
  const y = D.floorH + 0.55;
  c.bld.box(0.04, 0.04, sw + 0.15, [sx, y + 0.3, d / 2 + (sw + 0.15) / 2], 0x2a2a2a);
  c.bld.box(0.03, 0.3, 0.03, [sx, y + 0.15, d / 2 + 0.12], 0x2a2a2a);
  c.bld.box(0.03, 0.3, 0.03, [sx, y + 0.15, d / 2 + 0.08 + sw], 0x2a2a2a);
  // two boards back to back so the text reads from both directions along the street
  for (const k of [1, -1]) {
    const m = makeSign({ text, bg, fg, w: sw, h: 0.42, depth: 0.05 });
    const p = wposL(D, [sx + k * 0.03, y - 0.08, d / 2 + 0.1 + sw / 2]);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = D.f.yaw + k * Math.PI / 2;
    c.meshes.push(m);
  }
}

/** A hanging scarf / khata (helper for stalls). */
export function scarf(c: Ctx, x: number, hookY: number, z: number, color: number, fringe: number, w = 0.22, h = 0.9) {
  hangBoxFrom(c.hang, hookY, w, h, 0.025, [x, hookY - h / 2, z], color);
  hangBoxFrom(c.hang, hookY, w * 0.9, 0.05, 0.03, [x, hookY - h - 0.025, z], fringe);
}
