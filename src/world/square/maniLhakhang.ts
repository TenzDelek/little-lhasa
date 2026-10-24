// Mani Lhakhang: the little prayer-wheel shrine on the square. A whitewashed Tibetan chapel on a stone
// plinth: dark pema frieze with gilded mirrors, painted rafter ends, black trapezoid window surrounds with
// shambu valances, a gilded pagoda lantern and ganjira finial, victory banners on the roof corners and the
// dharma wheel with two deer over the door. Inside, the great mani wheel (≈1.6 m) turns on a lotus seat;
// outside, a ring of 20 small wheels at hand height lines the walls for the kora walk around it.
//
// Static geometry goes into Parts; the wheels are built separately (they spin) — see ManiLhakhang.tsx.
import { BufferGeometry, CylinderGeometry } from 'three';
import { Parts, type V3 } from '../../core/geom';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import { PAL } from '../../core/palette';
import type { Decals } from './decals';

const PI = Math.PI;
/** Plinth top (walking level) above the ground. */
export const PL = 0.24;
const OUT = 2.2;      // outer wall face (half width)
const IN = 1.85;      // inner wall face
const WT = 4.3;       // wall top
const DOOR = 1.0;     // half width of the doorway
const DOOR_H = 2.6;   // doorway height above the plinth
/** Small wheels: distance of the drum axis from the centre, drum bottom height, drum radius / height. */
export const SW = { axis: OUT + 0.21, base: PL + 0.64, r: 0.15, h: 0.46 };
/** Great wheel: drum bottom (above the ground) and size. */
export const GW = { base: PL + 0.32, r: 0.8, h: 2.0 };

const RAFTER = [PAL.templeBlue, PAL.templeGreen, PAL.templeRed, PAL.templeYellow];

export interface ManiBuild {
  colliders: BoxInit[];
  /** The great wheel (drum + lotus seat). */
  circles: CircleInit[];
  lamps: Lamp[];
  /** Small wheel slots (world): drum bottom centre and the facing yaw of their wall. */
  slots: { x: number; y: number; z: number; yaw: number }[];
  /** Great wheel drum-bottom centre (world). */
  great: { x: number; y: number; z: number };
  /** Bell position of the great wheel (world), for the bell sfx pan — and the finial top for flag lines. */
  finial: V3;
  /** Roof corners (gyaltsen tops) for flag lines. */
  corners: V3[];
}

/** One Tibetan window on a wall face at local z = face (facing +z), centred at x = 0. */
function tibetanWindow(p: Parts, face: number, y0: number) {
  const z = face;
  // black trapezoid surround, wider at the bottom
  p.taper(1.2, 0.04, 0.92, 0.04, 1.1, [0, y0 - 0.12, z + 0.02], PAL.hair);
  // red frame and dark lattice glass
  p.box(0.72, 0.78, 0.05, [0, y0 + 0.42, z + 0.05], PAL.templeRed);
  p.box(0.56, 0.62, 0.05, [0, y0 + 0.42, z + 0.07], PAL.glass, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.55 });
  p.box(0.03, 0.62, 0.02, [0, y0 + 0.42, z + 0.1], PAL.templeYellow);
  p.box(0.56, 0.03, 0.02, [0, y0 + 0.5, z + 0.1], PAL.templeYellow);
  // lintel: beam + a row of painted block ends
  p.box(1.08, 0.08, 0.12, [0, y0 + 0.86, z + 0.06], PAL.templeMaroon);
  for (let i = 0; i < 7; i++) p.box(0.09, 0.07, 0.16, [-0.45 + i * 0.15, y0 + 0.95, z + 0.08], RAFTER[i % 4]);
  p.box(1.18, 0.05, 0.2, [0, y0 + 1.01, z + 0.1], PAL.templeMaroon);
  // shambu: white pleated valance under the lintel with a red hem
  p.box(0.86, 0.11, 0.03, [0, y0 + 0.76, z + 0.11], PAL.templeWhite);
  p.box(0.86, 0.025, 0.035, [0, y0 + 0.705, z + 0.11], PAL.templeRed);
  for (let i = 0; i < 4; i++) p.box(0.02, 0.1, 0.035, [-0.3 + i * 0.2, y0 + 0.76, z + 0.12], i % 2 ? PAL.templeBlue : PAL.templeGreen);
}

/** A run of the wheel gallery on a wall face (local z = OUT, facing +z) between x0..x1. */
function wheelGallery(p: Parts, x0: number, x1: number) {
  const z = OUT;
  // red painted panel behind the drums with yellow pinstripes
  p.slab(x0 - 0.05, PL + 0.5, z, x1 + 0.05, PL + 1.62, z + 0.025, PAL.templeRed);
  p.slab(x0 - 0.05, PL + 1.62, z, x1 + 0.05, PL + 1.66, z + 0.03, PAL.templeYellow);
  p.slab(x0 - 0.05, PL + 0.46, z, x1 + 0.05, PL + 0.5, z + 0.03, PAL.templeYellow);
  // bottom and top rails (maroon-painted timber) with brackets
  p.slab(x0, PL + 0.55, z, x1, PL + 0.63, z + 0.44, PAL.templeMaroon);
  p.slab(x0, PL + 1.42, z, x1, PL + 1.5, z + 0.44, PAL.templeMaroon);
  for (const bx of [x0 + 0.06, x1 - 0.06]) {
    p.slab(bx - 0.04, PL + 0.3, z, bx + 0.04, PL + 0.55, z + 0.3, PAL.woodDoor);
    p.slab(bx - 0.04, PL + 0.63, z + 0.36, bx + 0.04, PL + 1.42, z + 0.44, PAL.templeMaroon);
  }
  // little hood over the row: sloping board + yellow fascia + rafter dots
  p.group([0, PL + 1.86, z + 0.3], 0, () => {
    p.box(x1 - x0 + 0.2, 0.06, 0.66, [(x0 + x1) / 2, 0, 0], PAL.templeMaroon, { rot: [0.32, 0, 0] });
  });
  p.slab(x0 - 0.1, PL + 1.69, z + 0.6, x1 + 0.1, PL + 1.77, z + 0.65, PAL.templeYellow);
  for (let x = x0; x <= x1 + 1e-6; x += 0.22) p.box(0.06, 0.05, 0.08, [x, PL + 1.79, z + 0.58], RAFTER[Math.round((x - x0) / 0.22) % 4]);
}

export function buildMani(p: Parts, d: Decals, at: { x: number; y: number; z: number; yaw: number }): ManiBuild {
  const cs = Math.cos(at.yaw), sn = Math.sin(at.yaw);
  const W = (lx: number, ly: number, lz: number): V3 => [at.x + lx * cs + lz * sn, at.y + ly, at.z - lx * sn + lz * cs];
  const slots: ManiBuild['slots'] = [];
  const corners: V3[] = [];

  p.group([at.x, at.y, at.z], at.yaw, () => {
    // ---- plinth with flagstones ---------------------------------------------------------------------
    p.slab(-3.6, -0.5, -3.6, 3.6, PL - 0.02, 3.6, PAL.rockDark);
    p.slab(-3.64, PL - 0.08, -3.64, 3.64, PL - 0.01, 3.64, PAL.curb);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = -3.6 + i * 0.9, z = -3.6 + j * 0.9;
      if (Math.abs(x + 0.45) < OUT && Math.abs(z + 0.45) < OUT) continue;
      p.slab(x + 0.02, PL - 0.02, z + 0.02, x + 0.88, PL, z + 0.88, (i + j * 3) % 4 === 0 ? PAL.pavingDark : PAL.paving);
    }
    p.slab(-1.5, -0.2, 3.6, 1.5, PL * 0.5, 4.0, PAL.stoneStep); // half step at the door

    // ---- walls ------------------------------------------------------------------------------------------
    const white = PAL.templeWhite;
    p.slab(-OUT, PL, -OUT, OUT, WT, -IN, white);
    p.slab(-OUT, PL, -IN, -IN, WT, IN, white);
    p.slab(IN, PL, -IN, OUT, WT, IN, white);
    p.slab(-OUT, PL, IN, -DOOR, WT, OUT, white);
    p.slab(DOOR, PL, IN, OUT, WT, OUT, white);
    p.slab(-DOOR, PL + DOOR_H, IN, DOOR, WT, OUT, white);
    // stone skirting and the red/pema frieze band on all four faces
    for (let k = 0; k < 4; k++) p.group([0, 0, 0], (k * PI) / 2, () => {
      p.slab(-OUT - 0.03, PL, OUT - 0.1, OUT + 0.03, PL + 0.28, OUT + 0.03, PAL.rockDark);
      p.slab(-OUT - 0.03, 3.55, OUT - 0.1, OUT + 0.03, 3.63, OUT + 0.03, PAL.templeRed);
      p.slab(-OUT - 0.06, 3.63, OUT - 0.1, OUT + 0.06, 4.12, OUT + 0.06, PAL.pema);
      for (let i = 0; i < 6; i++) p.box(0.16, 0.16, 0.03, [-1.82 + i * 0.728, 3.88, OUT + 0.075], PAL.gold);
      p.slab(-OUT - 0.06, 4.12, OUT - 0.1, OUT + 0.06, 4.2, OUT + 0.06, white);
      // painted rafter ends under the roof slab
      for (let i = 0; i < 22; i++) p.box(0.09, 0.08, 0.2, [-2.1 + i * 0.2, 4.25, OUT + 0.1], RAFTER[i % 4]);
      // roof slab edge (maroon) + parapet (white with a dark cap)
      p.slab(-OUT - 0.25, 4.3, OUT - 0.2, OUT + 0.25, 4.42, OUT + 0.25, PAL.templeMaroon);
      p.slab(-OUT - 0.2, 4.42, OUT, OUT + 0.2, 4.72, OUT + 0.2, white);
      p.slab(-OUT - 0.22, 4.72, OUT - 0.02, OUT + 0.22, 4.78, OUT + 0.22, PAL.pema);
    });
    p.slab(-OUT, 4.3, -OUT, OUT, 4.4, OUT, PAL.concreteDark); // roof deck
    // interior: maroon lining, wooden floor, dark ceiling, a cross beam carrying the great wheel's axle
    p.slab(-IN, PL, -IN, IN, PL + 0.03, IN, PAL.woodDoor);
    p.slab(-IN, PL, -IN, IN, 4.0, -IN + 0.02, PAL.templeMaroon);
    p.slab(-IN, PL, -IN, -IN + 0.02, 4.0, IN, PAL.templeMaroon);
    p.slab(IN - 0.02, PL, -IN, IN, 4.0, IN, PAL.templeMaroon);
    p.slab(-IN, PL, IN - 0.02, -DOOR, 4.0, IN, PAL.templeMaroon);
    p.slab(DOOR, PL, IN - 0.02, IN, 4.0, IN, PAL.templeMaroon);
    p.slab(-IN, 1.9, -IN + 0.02, IN, 2.0, -IN + 0.05, PAL.templeYellow);
    p.slab(-IN, 4.0, -IN, IN, 4.3, IN, PAL.woodDoor);
    p.slab(-IN, 3.78, -0.09, IN, 4.0, 0.09, PAL.templeRed);
    p.box(0.1, 4.0 - (GW.base + GW.h + 0.4), 0.1, [0, (4.0 + GW.base + GW.h + 0.4) / 2, 0], PAL.khorloGold);
    // lotus seat of the great wheel
    p.cyl(0.98, 1.02, 0.14, [0, PL, 0], PAL.stoneStep, 16);
    p.cyl(0.9, 0.96, GW.base - PL - 0.14, [0, PL + 0.14, 0], PAL.goldDeep, 16);
    for (let i = 0; i < 16; i++) p.group([0, PL + 0.16, 0], (i / 16) * PI * 2, () => {
      p.box(0.26, 0.12, 0.05, [0, 0.06, 0.95], i % 2 ? PAL.khorloGold : PAL.templeRed, { rot: [-0.35, 0, 0] });
    });
    // the bell the great wheel's striker rings, hanging from the beam
    p.box(0.02, 3.78 - (GW.base + GW.h + 0.32), 0.02, [0.98, (3.78 + GW.base + GW.h + 0.32) / 2, 0], PAL.hair);
    p.cyl(0.05, 0.1, 0.16, [0.98, GW.base + GW.h + 0.16, 0], PAL.khorloGold, 8);
    // butter-lamp shelf on the back wall + thangkas on the side walls
    p.slab(-1.2, PL + 0.78, -IN + 0.02, 1.2, PL + 0.84, -IN + 0.32, PAL.woodTrim);
    p.slab(-1.2, PL, -IN + 0.02, -1.14, PL + 0.78, -IN + 0.3, PAL.woodDoor);
    p.slab(1.14, PL, -IN + 0.02, 1.2, PL + 0.78, -IN + 0.3, PAL.woodDoor);
    for (let i = 0; i < 7; i++) {
      const x = -0.96 + i * 0.32;
      p.cyl(0.05, 0.035, 0.08, [x, PL + 0.84, -IN + 0.17], PAL.khorloGold, 6);
      p.box(0.035, 0.07, 0.035, [x, PL + 0.96, -IN + 0.17], PAL.butterFlame, { emit: PAL.butterFlame, emitIntensity: 1.6 });
    }
    // framed portrait above the lamps, a khata draped over the frame
    p.box(0.42, 0.52, 0.04, [0, PL + 1.3, -IN + 0.04], PAL.gold);
    p.box(0.32, 0.42, 0.05, [0, PL + 1.3, -IN + 0.04], 0x6e4a3a);
    p.box(0.12, 0.14, 0.055, [0, PL + 1.38, -IN + 0.04], PAL.skinLight);
    p.box(0.2, 0.16, 0.055, [0, PL + 1.2, -IN + 0.04], PAL.monkMaroon);
    p.box(0.5, 0.05, 0.07, [0, PL + 1.57, -IN + 0.06], PAL.templeWhite);
    p.box(0.06, 0.4, 0.03, [-0.24, PL + 1.38, -IN + 0.08], PAL.templeWhite);
    p.box(0.06, 0.34, 0.03, [0.24, PL + 1.4, -IN + 0.08], PAL.templeWhite);
    d.quad(p.matrix, [-IN + 0.03, PL + 2.2, -0.2], 0.62, 0.93, 'thangka', PI / 2);
    d.quad(p.matrix, [IN - 0.03, PL + 2.2, 0.2], 0.62, 0.93, 'thangka', -PI / 2);
    d.quad(p.matrix, [0, PL + 2.25, -IN + 0.03], 0.62, 0.93, 'thangka', 0);
    // khatas draped on the beam
    for (const x of [-0.5, 0.45]) p.box(0.12, 0.7, 0.02, [x, 3.42, 0.1], PAL.templeWhite, { rot: [0, 0, x * 0.2] });

    // ---- front: doorway, door leaves folded open, lintel, shambu, mantra plaque -------------------------
    const z = OUT;
    for (const s of [-1, 1]) {
      // black trapezoid surround leaning in
      p.box(0.24, DOOR_H + 0.25, 0.03, [s * (DOOR + 0.17), PL + (DOOR_H + 0.25) / 2, z + 0.015], PAL.hair, { rot: [0, 0, s * 0.045] });
      // red jamb pillar and inner reveal
      p.slab(s > 0 ? DOOR - 0.02 : -DOOR - 0.1, PL, z - 0.02, s > 0 ? DOOR + 0.1 : -DOOR + 0.02, PL + DOOR_H, z + 0.08, PAL.templeRed);
      p.slab(s > 0 ? DOOR : -DOOR - 0.01, PL, IN, s > 0 ? DOOR + 0.01 : -DOOR, PL + DOOR_H, OUT, PAL.templeRed);
      // door leaf folded open against the inner wall
      p.group([s * DOOR, PL, IN - 0.04], s * -1.75, () => {
        p.slab(s > 0 ? -0.86 : 0, 0, -0.04, s > 0 ? 0 : 0.86, DOOR_H - 0.05, 0, PAL.templeRed);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) p.box(0.04, 0.04, 0.02, [s * -(0.2 + c * 0.24), 0.45 + r * 0.55, 0.01], PAL.gold);
      });
    }
    p.slab(-DOOR - 0.3, PL + DOOR_H, z, DOOR + 0.3, PL + DOOR_H + 0.1, z + 0.08, PAL.templeRed);
    for (let i = 0; i < 16; i++) p.box(0.1, 0.08, 0.13, [-1.2 + i * 0.16, PL + DOOR_H + 0.15, z + 0.06], RAFTER[i % 4]);
    p.slab(-DOOR - 0.36, PL + DOOR_H + 0.19, z, DOOR + 0.36, PL + DOOR_H + 0.27, z + 0.12, PAL.templeYellow);
    p.slab(-DOOR - 0.42, PL + DOOR_H + 0.27, z, DOOR + 0.42, PL + DOOR_H + 0.35, z + 0.16, PAL.templeMaroon);
    // shambu valance inside the top of the doorway
    p.slab(-DOOR, PL + DOOR_H - 0.26, z - 0.06, DOOR, PL + DOOR_H, z - 0.02, PAL.templeWhite);
    p.slab(-DOOR, PL + DOOR_H - 0.29, z - 0.06, DOOR, PL + DOOR_H - 0.26, z - 0.02, PAL.templeRed);
    for (let i = 0; i < 7; i++) p.box(0.025, 0.24, 0.045, [-0.84 + i * 0.28, PL + DOOR_H - 0.13, z - 0.03], [PAL.templeBlue, PAL.templeGreen, PAL.templeRed][i % 3]);
    d.quad(p.matrix, [0, 3.36, z + 0.012], 1.7, 0.26, 'mantraPlaque');
    // brass lantern on a bracket beside the door
    p.box(0.04, 0.04, 0.3, [1.55, 3.42, z + 0.15], PAL.hair);
    p.box(0.02, 0.12, 0.02, [1.55, 3.34, z + 0.29], PAL.hair);
    p.box(0.16, 0.05, 0.16, [1.55, 3.27, z + 0.29], PAL.goldDeep);
    p.box(0.12, 0.18, 0.12, [1.55, 3.15, z + 0.29], PAL.butter, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 2.2 });
    p.box(0.16, 0.04, 0.16, [1.55, 3.04, z + 0.29], PAL.goldDeep);
    // shoes left at the threshold and a donation box beside the door
    p.box(0.1, 0.06, 0.22, [-0.45, PL + 0.03, z + 0.55], PAL.bootBlack, { rot: [0, 0.2, 0] });
    p.box(0.1, 0.06, 0.22, [-0.31, PL + 0.03, z + 0.6], PAL.bootBlack, { rot: [0, 0.1, 0] });
    p.box(0.09, 0.06, 0.19, [0.52, PL + 0.03, z + 0.5], PAL.bootRed, { rot: [0, -0.3, 0] });
    p.box(0.09, 0.06, 0.19, [0.64, PL + 0.03, z + 0.52], PAL.bootRed, { rot: [0, -0.2, 0] });

    // ---- windows on the three other faces, wheel galleries on all four -------------------------------------
    for (let k = 1; k < 4; k++) p.group([0, 0, 0], (k * PI) / 2, () => tibetanWindow(p, OUT, 2.25));
    for (let k = 0; k < 4; k++) {
      const yaw = (k * PI) / 2;
      p.group([0, 0, 0], yaw, () => {
        if (k === 0) { wheelGallery(p, -2.0, -1.3); wheelGallery(p, 1.3, 2.0); }
        else wheelGallery(p, -1.98, 1.98);
      });
      const xs = k === 0 ? [-1.65, 1.65] : [-1.65, -0.99, -0.33, 0.33, 0.99, 1.65];
      for (const x of xs) {
        // local slot on face k: rotate (x, SW.axis) by yaw
        const lx = x * Math.cos(yaw) + SW.axis * Math.sin(yaw), lz = -x * Math.sin(yaw) + SW.axis * Math.cos(yaw);
        const w = W(lx, SW.base, lz);
        slots.push({ x: w[0], y: w[1], z: w[2], yaw: at.yaw + yaw });
      }
    }
    // khatas tied on the front wheel frames
    p.box(0.1, 0.5, 0.02, [-1.95, PL + 1.2, OUT + 0.46], PAL.templeWhite, { rot: [0, 0, 0.1] });
    p.box(0.1, 0.42, 0.02, [1.95, PL + 1.24, OUT + 0.46], PAL.templeWhite, { rot: [0, 0, -0.12] });

    // ---- roof: lantern, gilded pagoda roof, ganjira, victory banners, dharma wheel ---------------------
    const LT = 4.4, LH = 0.95;
    p.slab(-1.0, LT, -1.0, 1.0, LT + LH, 1.0, white);
    p.slab(-1.04, LT + LH - 0.32, -1.04, 1.04, LT + LH - 0.06, 1.04, PAL.pema);
    for (let k = 0; k < 4; k++) p.group([0, 0, 0], (k * PI) / 2, () => {
      for (let i = 0; i < 3; i++) p.box(0.1, 0.1, 0.02, [-0.6 + i * 0.6, LT + LH - 0.19, 1.05], PAL.gold);
      for (let i = 0; i < 10; i++) p.box(0.08, 0.07, 0.16, [-0.9 + i * 0.2, LT + LH - 0.02, 1.02], RAFTER[i % 4]);
      p.taper(0.5, 0.03, 0.38, 0.03, 0.42, [0, LT + 0.12, 1.01], PAL.hair);
      p.box(0.28, 0.3, 0.03, [0, LT + 0.32, 1.03], PAL.templeRed, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.4 });
    });
    const RT = LT + LH + 0.02;
    p.add(new CylinderGeometry(0, 1.9, 0.8, 4, 1).translate(0, 0.4, 0), PAL.gold, [0, RT, 0], { rot: [0, PI / 4, 0] });
    p.add(new CylinderGeometry(1.92, 1.92, 0.06, 4, 1).translate(0, 0.03, 0), PAL.goldDeep, [0, RT - 0.04, 0], { rot: [0, PI / 4, 0] });
    for (let k = 0; k < 4; k++) p.group([0, RT, 0], (k * PI) / 2 + PI / 4, () => {
      p.box(0.08, 0.08, 0.34, [0, 0.1, 1.86], PAL.gold, { rot: [-0.6, 0, 0] }); // upturned corner
      p.cyl(0.015, 0.015, 0.16, [0, -0.2, 1.84], PAL.hair, 4);
      p.cyl(0.03, 0.05, 0.08, [0, -0.28, 1.84], PAL.khorloGold, 6); // little bell
    });
    // ganjira finial
    const FT = RT + 0.8;
    p.cyl(0.1, 0.14, 0.12, [0, FT - 0.04, 0], PAL.goldDeep, 8);
    p.cyl(0.2, 0.1, 0.22, [0, FT + 0.08, 0], PAL.gold, 8);
    p.cyl(0.12, 0.2, 0.16, [0, FT + 0.3, 0], PAL.gold, 8);
    p.cyl(0.08, 0.12, 0.1, [0, FT + 0.46, 0], PAL.goldDeep, 8);
    p.cyl(0.13, 0.08, 0.14, [0, FT + 0.56, 0], PAL.gold, 8);
    p.cone(0.09, 0.32, [0, FT + 0.7, 0], PAL.gold, 6);
    // gyaltsen (victory banners) on the parapet corners
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * (OUT + 0.08), zz = sz * (OUT + 0.08);
      p.cyl(0.03, 0.03, 0.18, [x, 4.78, zz], PAL.hair, 5);
      p.cyl(0.14, 0.14, 0.5, [x, 4.94, zz], PAL.gold, 8);
      p.cyl(0.15, 0.15, 0.1, [x, 5.1, zz], PAL.hair, 8);
      p.cyl(0.16, 0.16, 0.05, [x, 5.44, zz], PAL.goldDeep, 8);
      p.cone(0.11, 0.22, [x, 5.49, zz], PAL.gold, 6);
      corners.push(W(x, 5.6, zz));
    }
    // dharma wheel flanked by two deer on the front parapet
    p.box(0.5, 0.1, 0.2, [0, 4.83, OUT + 0.08], PAL.goldDeep);
    p.add(new CylinderGeometry(0.28, 0.28, 0.06, 12), PAL.gold, [0, 5.18, OUT + 0.1], { rot: [PI / 2, 0, 0] });
    p.add(new CylinderGeometry(0.2, 0.2, 0.07, 12), PAL.goldDeep, [0, 5.18, OUT + 0.1], { rot: [PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++) p.box(0.4, 0.03, 0.08, [0, 5.18, OUT + 0.1], PAL.gold, { rot: [0, 0, (i * PI) / 4] });
    p.add(new CylinderGeometry(0.06, 0.06, 0.09, 8), PAL.khorloGold, [0, 5.18, OUT + 0.1], { rot: [PI / 2, 0, 0] });
    for (const s of [-1, 1]) p.group([s * 0.48, 4.78, OUT + 0.1], s * PI / 2 + PI, () => {
      p.box(0.14, 0.13, 0.28, [0, 0.07, 0], PAL.gold);          // lying body
      p.box(0.08, 0.16, 0.08, [0, 0.2, 0.12], PAL.gold);        // neck
      p.box(0.07, 0.07, 0.12, [0, 0.29, 0.17], PAL.goldDeep);   // head
      p.box(0.12, 0.03, 0.02, [0, 0.34, 0.13], PAL.gold);       // ears
    });
  });

  const colliders: BoxInit[] = [];
  const box = (lx: number, lz: number, w: number, dd: number, y0: number, y1: number, tag: string) => {
    const c = W(lx, 0, lz);
    colliders.push({ x: c[0], z: c[2], w, d: dd, rot: at.yaw, y0: at.y + y0, y1: at.y + y1, tag });
  };
  const R = OUT + 0.44; // wheel rail outer edge
  box(0, 0, 7.2, 7.2, -0.5, PL, 'mani-plinth');
  box(0, -(IN + R) / 2, 2 * R, R - IN, PL, 4.78, 'mani');
  box(-(IN + R) / 2, 0, R - IN, 2 * IN, PL, 4.78, 'mani');
  box((IN + R) / 2, 0, R - IN, 2 * IN, PL, 4.78, 'mani');
  box(-(DOOR + R) / 2, (IN + R) / 2, R - DOOR, R - IN, PL, 4.78, 'mani');
  box((DOOR + R) / 2, (IN + R) / 2, R - DOOR, R - IN, PL, 4.78, 'mani');
  box(0, (IN + OUT) / 2, 2 * DOOR, OUT - IN, PL + DOOR_H, 4.78, 'mani-lintel');
  box(0, -IN + 0.17, 2.4, 0.34, PL, PL + 0.84, 'mani-shelf');
  const g = W(0, GW.base, 0);
  const great = { x: g[0], y: g[1], z: g[2] };
  const circles: CircleInit[] = [
    { x: great.x, z: great.z, r: 0.99, y0: at.y + PL, y1: at.y + GW.base, tag: 'mani-seat' },
    { x: great.x, z: great.z, r: GW.r + 0.06, y0: at.y + GW.base, y1: at.y + 3.78, tag: 'mani-wheel' },
  ];
  const lamps: Lamp[] = [
    { ...xyz(W(0, PL + 1.6, 0.6)), color: PAL.butter, intensity: 3.2, distance: 5.5, day: true, flicker: 0.35 },
    { ...xyz(W(1.55, 3.0, OUT + 0.7)), color: PAL.lampWarm, intensity: 4, distance: 7 },
  ];
  return { colliders, circles, lamps, slots, great, finial: W(0, FT_TOP, 0), corners };
}
const FT_TOP = 4.4 + 0.95 + 0.02 + 0.8 + 0.9;
const xyz = (v: V3) => ({ x: v[0], y: v[1], z: v[2] });

/** One small prayer wheel, origin at the drum's bottom centre: red drum, gold rims, six gilded syllables. */
export function smallWheelGeometry(): BufferGeometry {
  const p = new Parts();
  const { r, h } = SW;
  p.cyl(0.012, 0.012, 0.1, [0, -0.08, 0], PAL.hair, 4);
  p.cyl(r + 0.012, r + 0.012, 0.05, [0, 0, 0], PAL.khorloGold, 10);
  p.cyl(r, r, h - 0.08, [0, 0.04, 0], PAL.khorloBody, 10);
  p.cyl(r + 0.012, r + 0.012, 0.05, [0, h - 0.05, 0], PAL.khorloGold, 10);
  p.cyl(0.06, r, 0.05, [0, h, 0], PAL.khorloCopper, 10);
  p.cyl(0.012, 0.012, 0.12, [0, h + 0.04, 0], PAL.hair, 4);
  for (let i = 0; i < 6; i++) p.group([0, 0, 0], (i / 6) * PI * 2, () => {
    p.box(0.075, 0.17, 0.02, [0, h * 0.5, r + 0.003], PAL.khorloGold);
    p.box(0.02, 0.06, 0.02, [0.06, h * 0.5, r * 0.93], PAL.templeYellow);
  });
  // a darker grip stripe so the spin reads even from far away
  p.box(0.03, h - 0.12, 0.02, [0, h / 2, -r - 0.004], PAL.templeMaroon);
  return p.merge();
}

/** Rotating part of the great wheel (origin at the drum's bottom centre). The mantra band is separate. */
export function greatWheelGeometry(): BufferGeometry {
  const p = new Parts();
  const { r, h } = GW;
  p.cyl(r, r, h, [0, 0, 0], PAL.khorloBody, 24);
  p.cyl(r + 0.04, r + 0.04, 0.14, [0, 0, 0], PAL.khorloGold, 24);
  p.cyl(r + 0.04, r + 0.04, 0.14, [0, h - 0.14, 0], PAL.khorloGold, 24);
  // lotus-petal bands (alternating gold / deep gold) and jewel dots
  for (let i = 0; i < 24; i++) p.group([0, 0, 0], (i / 24) * PI * 2, () => {
    const c = i % 2 ? PAL.khorloGold : PAL.goldDeep;
    p.box(0.17, 0.2, 0.03, [0, 0.27, r + 0.01], c);
    p.box(0.17, 0.2, 0.03, [0, h - 0.27, r + 0.01], c);
    p.box(0.05, 0.05, 0.03, [0.105, 0.4, r + 0.01], i % 3 === 0 ? PAL.templeBlue : PAL.templeGreen);
    p.box(0.05, 0.05, 0.03, [0.105, h - 0.4, r + 0.01], i % 3 === 0 ? PAL.templeGreen : PAL.templeBlue);
    p.box(0.015, h - 0.95, 0.02, [0.105, h / 2, r + 0.006], PAL.khorloGold);
  });
  // domed cap, top boss and the striker arm that rings the bell once a turn
  p.cyl(0.32, r + 0.02, 0.26, [0, h, 0], PAL.khorloGold, 24);
  p.cyl(0.12, 0.3, 0.12, [0, h + 0.26, 0], PAL.goldDeep, 12);
  p.box(0.6, 0.04, 0.04, [0.62, h + 0.16, 0], PAL.hair);
  // grip pegs round the bottom rim (pilgrims push these)
  for (let i = 0; i < 12; i++) p.group([0, 0, 0], (i / 12) * PI * 2, () => p.box(0.04, 0.05, 0.12, [0, 0.07, r + 0.08], PAL.woodTrim));
  return p.merge();
}
