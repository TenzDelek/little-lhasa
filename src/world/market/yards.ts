// The open yards behind Tashi's momo stall and Dolma's laphing table. Nothing tall may stand there (it is
// the view corridor from the default camera, see sight.ts), so the yards carry low, lived-in things that read
// from above: a dry-stone boundary wall, firewood, a washing slab, sacks of flour, a clothes line, a plastic
// table with stools where customers eat. Built in each stall's counter frame (front = +z = the road, local +x
// runs along the road); every item sits on the ground under it.
import { PAL } from '../../core/palette';
import { pick, range, rng, type Rng } from '../../core/math';
import { groundY } from '../terrain';
import { type Ctx, inFrame } from './ctx';
import { STALLS, type StallFrame } from './spots';
import { localBox, toWorld } from './util';
import { crate, laundry, plant, sack, stool } from './items';

const STONE = [0x8c8678, 0x7d776a, 0x9a9384, 0x857f72] as const;

/** Reserve a local rectangle of a stall frame so no building or back house lands on the yard. */
function reserve(c: Ctx, f: StallFrame, x0: number, x1: number, z0: number, z1: number) {
  const [x, z] = toWorld(f, (x0 + x1) / 2, (z0 + z1) / 2);
  c.footprints.push({ x, z, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, yaw: f.yaw });
}

/** Ground height in the stall frame (relative to the stall floor y). */
const gy = (f: StallFrame, y: number, lx: number, lz: number) => {
  const [x, z] = toWorld(f, lx, lz);
  return groundY(x, z) - y;
};

/** Dry-stone wall from x0 to x1 at z (local), height h, coursed stones with a flat capping. */
function stoneWall(c: Ctx, f: StallFrame, y: number, x0: number, x1: number, z: number, h: number, r: Rng) {
  const P = c.props;
  const g0 = Math.min(gy(f, y, x0, z), gy(f, y, x1, z));
  const g1 = Math.max(gy(f, y, x0, z), gy(f, y, x1, z));
  P.box(x1 - x0, h + (g1 - g0) + 0.3, 0.34, [(x0 + x1) / 2, g0 - 0.3 + (h + g1 - g0 + 0.3) / 2, z], STONE[0]);
  // a few proud stones so it reads as stone, not concrete
  for (let x = x0 + 0.15; x < x1 - 0.1; x += range(r, 0.28, 0.42)) {
    const k = Math.floor(r() * 3);
    P.box(range(r, 0.2, 0.34), 0.13, 0.03, [x, g1 + 0.1 + k * 0.15, z + 0.17], pick(r, STONE));
    P.box(range(r, 0.2, 0.34), 0.13, 0.03, [x + 0.1, g1 + 0.12 + ((k + 1) % 3) * 0.15, z - 0.17], pick(r, STONE));
  }
  P.box(x1 - x0 + 0.04, 0.06, 0.4, [(x0 + x1) / 2, g1 + h + 0.03, z], 0x6f6a5e);
  c.colliders.push(localBox(f, (x0 + x1) / 2, z, x1 - x0, 0.36, y + g0 - 0.3, y + g1 + h + 0.06, 'wall'));
}

/** Plastic table with stools around it (customers eating). */
function plasticTable(c: Ctx, f: StallFrame, y: number, x: number, z: number, col: number, stoolCols: number[]) {
  const P = c.props;
  const g = gy(f, y, x, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.04, 0.68, 0.04, [x + sx * 0.26, g + 0.34, z + sz * 0.26], col);
  P.box(0.64, 0.04, 0.64, [x, g + 0.7, z], col);
  // two steel plates of momos and a cup on the table
  P.cyl(0.1, 0.09, 0.02, [x - 0.12, g + 0.72, z + 0.05], 0xc8ccd0, 10);
  for (let i = 0; i < 4; i++) P.box(0.045, 0.035, 0.045, [x - 0.15 + (i % 2) * 0.06, g + 0.75, z + 0.02 + (i >> 1) * 0.06], 0xf2ead8);
  P.cyl(0.035, 0.03, 0.07, [x + 0.15, g + 0.72, z - 0.1], 0xeeeae0, 6);
  const seats: Array<[number, number]> = [[-0.52, 0.05], [0.52, -0.05], [0.04, 0.52]];
  seats.forEach(([sx, sz], i) => {
    const gg = gy(f, y, x + sx, z + sz);
    stool(P, x + sx, gg, z + sz, stoolCols[i % stoolCols.length]);
  });
  c.colliders.push(localBox(f, x, z, 0.66, 0.66, y + g - 0.3, y + g + 0.73, 'table'));
}

/** Tashi's yard: customers' table beside the steamers, the family's back yard behind the stall. */
export function momoYard(c: Ctx) {
  const f = STALLS.momo;
  const y = groundY(f.x, f.z);
  const r = rng(915);
  const P = c.props;
  reserve(c, f, -2.65, 1.45, -4.6, -1.6);
  reserve(c, f, 2.55, 4.15, -1.25, 0.15);
  inFrame(c, f, y, () => {
    // customers' table and red stools on the south side, past the steamers
    plasticTable(c, f, y, 3.35, -0.55, 0xe6e3dc, [0xb83a2e, 0xb83a2e, 0x3a5aa0]);
    // the boundary wall at the back of the yard, open at the south end (the family's way in)
    stoneWall(c, f, y, -2.55, 1.3, -4.35, 0.55, r);
    // firewood stacked against the wall (for the big pot of thukpa)
    {
      const g = gy(f, y, -1.5, -3.95);
      for (let k = 0; k < 3; k++) for (let i = 0; i < 6 - k; i++) {
        P.cyl(0.07, 0.07, 1.3, [-1.5, g + 0.07 + k * 0.13, -3.95 + (i - (5 - k) / 2) * 0.14 * 0.5], pick(r, [0x8a6a44, 0x7a5a36, 0x9a7a50]), 6, { rot: [0, 0, Math.PI / 2] });
      }
      c.colliders.push(localBox(f, -1.5, -3.95, 1.3, 0.5, y + g - 0.2, y + g + 0.4, 'wood'));
    }
    // washing slab with a tap, a bucket and plates drying
    {
      const g = gy(f, y, 1.25, -2.75);
      P.box(1.0, 0.12, 0.7, [1.25, g + 0.06, -2.75], PAL.concrete);
      P.box(0.05, 0.75, 0.05, [1.6, g + 0.45, -3.05], 0x6a6a6a);
      P.box(0.16, 0.04, 0.04, [1.53, g + 0.8, -3.05], 0x8a8a8a);
      P.cyl(0.15, 0.12, 0.26, [1.0, g + 0.12, -2.65], 0x2f6fc0, 8);
      for (let i = 0; i < 5; i++) P.cyl(0.1, 0.09, 0.015, [1.4, g + 0.13 + i * 0.016, -2.6], 0xc8ccd0, 10);
      P.cyl(0.24, 0.2, 0.22, [0.85, g + 0.12, -3.0], 0xb8bcc0, 10); // the big thukpa pot, scrubbed
    }
    // flour sacks and crates of onions and cabbage by the back table
    sack(P, -0.75, gy(f, y, -0.75, -2.3), -2.3, r);
    sack(P, -0.35, gy(f, y, -0.35, -2.45), -2.45, r);
    crate(P, -2.05, gy(f, y, -2.05, -2.4), -2.4, r, 0xc89a6a);
    crate(P, -2.05, gy(f, y, -2.05, -2.4) + 0.25, -2.4, r, 0x8ab05a);
    // clothes line (aprons and dish towels) between two poles
    {
      const ga = gy(f, y, -2.4, -3.3), gb = gy(f, y, 0.3, -3.65);
      P.box(0.05, 1.85, 0.05, [-2.4, ga + 0.92, -3.3], 0x8a7a5a);
      P.box(0.05, 1.85, 0.05, [0.3, gb + 0.92, -3.65], 0x8a7a5a);
      laundry(P, c.hang, [-2.4, ga + 1.78, -3.3], [0.3, gb + 1.78, -3.65], r);
    }
    plant(P, -2.25, gy(f, y, -2.25, -3.95), -3.95, r, true);
    plant(P, 0.9, gy(f, y, 0.9, -3.95), -3.95, r);
  });
  c.colliders.push(localBox(f, -2.4, -3.3, 0.1, 0.1, y - 0.5, y + 1.9, 'pole'), localBox(f, 0.3, -3.65, 0.1, 0.1, y - 0.5, y + 1.9, 'pole'));
}

/** Dolma's corner: a bench for customers, plastic crates, a parked bicycle and pots on a low wall. (Her
 *  neighbour to the north reaches local x ≈ −1.8; everything here stays east of it.) */
export function laphingYard(c: Ctx) {
  const f = STALLS.laphing;
  const y = groundY(f.x, f.z);
  const r = rng(916);
  const P = c.props;
  reserve(c, f, -1.65, 2.75, -3.0, -1.6);
  reserve(c, f, 1.85, 3.15, -0.35, 0.15);
  inFrame(c, f, y, () => {
    // low wall at the back with a row of pots on it
    stoneWall(c, f, y, -1.6, 2.7, -2.75, 0.5, r);
    for (let x = -1.3; x < 2.5; x += 0.62) plant(P, x, Math.max(gy(f, y, -1.6, -2.75), gy(f, y, 2.7, -2.75)) + 0.56, -2.75, r);
    // stacked plastic crates of laphing bowls and a crate of cucumbers
    {
      const g = gy(f, y, 1.3, -1.55);
      for (let k = 0; k < 3; k++) {
        const col = pick(r, [0x2f6fc0, 0xd8402e, 0x3f9a4a]);
        P.box(0.46, 0.26, 0.34, [1.3, g + 0.13 + k * 0.27, -1.55], col);
        P.box(0.4, 0.2, 0.28, [1.3, g + 0.14 + k * 0.27, -1.55], 0x2a2a2a);
      }
      crate(P, 1.85, g, -1.5, r, 0x5f9a3a);
      c.colliders.push(localBox(f, 1.5, -1.55, 0.95, 0.4, y + g - 0.2, y + g + 0.8, 'crates'));
    }
    // a bicycle leaning on the wall
    {
      const bx0 = -0.3, g = gy(f, y, bx0, -2.32);
      for (const bx of [-0.42, 0.42]) P.cyl(0.3, 0.3, 0.03, [bx0 + bx, g + 0.3, -2.32], 0x2a2a2a, 10, { rot: [Math.PI / 2, 0, 0] });
      P.box(0.86, 0.04, 0.04, [bx0, g + 0.42, -2.34], 0x2f5f8a, { rot: [0, 0, 0.2] });
      P.box(0.04, 0.4, 0.04, [bx0 - 0.1, g + 0.62, -2.34], 0x2a2a2a);
      P.box(0.2, 0.05, 0.08, [bx0 - 0.1, g + 0.84, -2.34], 0x2a2a2a);
      P.box(0.04, 0.04, 0.42, [bx0 + 0.38, g + 0.82, -2.34], 0x8a8a8a);
      c.colliders.push(localBox(f, bx0, -2.32, 1.4, 0.2, y + g - 0.2, y + g + 0.9, 'bike'));
    }
    // a bench for customers on the south side, facing the road
    {
      const g = gy(f, y, 2.5, -0.1);
      P.box(1.2, 0.06, 0.38, [2.5, g + 0.44, -0.1], PAL.woodTrim);
      for (const sx of [-0.45, 0.45]) P.box(0.06, 0.44, 0.32, [2.5 + sx, g + 0.22, -0.1], PAL.woodDoor);
      c.colliders.push(localBox(f, 2.5, -0.1, 1.2, 0.38, y + g - 0.2, y + g + 0.47, 'bench'));
    }
  });
}
