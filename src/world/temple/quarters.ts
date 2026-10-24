// Monks' quarters (Namgyal monastery dormitories): plain 2–3 storey blocks along the west and south edges of
// the courtyard, with open corridor balconies in front of rows of maroon doors, maroon railings with robes
// drying on them, small Tibetan windows on the back, and black water tanks on the roof.
import { PAL } from '../../core/palette';
import type { Parts } from '../../core/geom';
import type { Acc } from './acc';
import { CY } from './site';
import { INK, WHITEWASH, lbox, mixHex, shade, tibWindow, tiledRoof, type Frame } from './util';
import { pick } from '../../core/math';

const FH = 2.8;
const CREAM = mixHex(PAL.wallCream, PAL.templeYellow, 0.35);
const ROBES = [PAL.monkMaroon, PAL.monkMaroonDark, PAL.monkYellow, PAL.monkMaroon, 0xa8322e] as const;

interface Block { x: number; z: number; yaw: number; w: number; d: number; floors: number; wall?: number; seed: number }

export const BLOCKS: Block[] = [
  // west edge, facing east
  { x: -11.7, z: 101.3, yaw: Math.PI / 2, w: 6.2, d: 3.8, floors: 3, seed: 1 },
  { x: -11.7, z: 120.2, yaw: Math.PI / 2, w: 12.4, d: 3.8, floors: 3, seed: 2 },
  // south edge, facing north (on the deck, backs to the parapet)
  { x: -2.4, z: 129.2, yaw: Math.PI, w: 11.0, d: 3.6, floors: 2, seed: 3, wall: mixHex(PAL.wallCream, PAL.wallOchre, 0.4) },
  { x: 22.0, z: 129.2, yaw: Math.PI, w: 8.8, d: 3.6, floors: 2, seed: 4 },
];

export function buildQuarters(acc: Acc) {
  for (const b of BLOCKS) block(acc, b);
}

function block(acc: Acc, b: Block) {
  const r = acc.r, B = acc.big, S = acc.small;
  const f: Frame = { x: b.x, z: b.z, yaw: b.yaw, y: CY };
  const W = b.w, D = b.d, H = b.floors * FH;
  const corr = 1.25;                  // corridor depth (front)
  const roomD = D - corr;
  const wall = b.wall ?? CREAM;
  const zBack = -D / 2, zRoom = zBack + roomD, zFront = D / 2;
  B.group([f.x, f.y, f.z], f.yaw, () => {
    B.box(W + 0.2, 0.3, D + 0.2, [0, 0.15, 0], PAL.concreteDark);
    // rooms block
    B.box(W, H, roomD, [0, 0.3 + H / 2, zBack + roomD / 2], wall);
    // end walls run to the front (corridor ends)
    for (const sx of [-1, 1]) B.box(0.25, H, corr, [sx * (W / 2 - 0.125), 0.3 + H / 2, zRoom + corr / 2], wall);
    // floor slabs (balconies) with maroon edge band, roof slab with parapet
    for (let fl = 1; fl <= b.floors; fl++) {
      const y = 0.3 + fl * FH;
      B.box(W + 0.1, 0.18, D + 0.1, [0, y - 0.09, 0], fl === b.floors ? shade(wall, -0.1) : wall);
      B.box(W + 0.12, 0.08, 0.1, [0, y - 0.12, zFront + 0.02], PAL.templeMaroon);
    }
    B.box(W + 0.1, 0.5, 0.14, [0, 0.3 + H + 0.25, zFront - 0.02], wall);
    B.box(W + 0.1, 0.5, 0.14, [0, 0.3 + H + 0.25, zBack + 0.02], wall);
    for (const sx of [-1, 1]) B.box(0.14, 0.5, D, [sx * (W / 2 - 0.02), 0.3 + H + 0.25, 0], wall);
    for (const sz of [-1, 1]) B.box(W + 0.16, 0.08, 0.2, [0, 0.3 + H + 0.54, sz * (D / 2 - 0.05)], PAL.templeMaroon);
    for (const sx of [-1, 1]) B.box(0.2, 0.08, D + 0.16, [sx * (W / 2 - 0.02), 0.3 + H + 0.54, 0], PAL.templeMaroon);
    // roof surface: red-oxide tiles with rain stains
    tiledRoof(B, -W / 2 + 0.1, -D / 2 + 0.1, W / 2 - 0.1, D / 2 - 0.1, 0.3 + H + 0.05, 40 + b.seed, { stains: Math.floor(W / 4), base: 0.05 });
    // pilasters at the corridor front, every ~3 m
    const nb = Math.max(2, Math.round(W / 3));
    for (let i = 0; i <= nb; i++) {
      const x = -W / 2 + 0.12 + ((W - 0.24) * i) / nb;
      B.box(0.24, H, 0.24, [x, 0.3 + H / 2, zFront - 0.12], wall);
    }
    // per floor: doors + windows on the corridor wall, railing with drying robes
    for (let fl = 0; fl < b.floors; fl++) {
      const y0 = 0.3 + fl * FH;
      const nDoors = Math.max(2, Math.floor(W / 2.1));
      for (let i = 0; i < nDoors; i++) {
        const x = -W / 2 + (W * (i + 0.5)) / nDoors;
        B.group([x - 0.45, y0, zRoom], 0, () => door(B));
        B.group([x + 0.45, y0, zRoom], 0, () => tibWindow(B, 0, 1.45, 0.5, 0.65, { lit: r() < 0.55, shambu: r() < 0.6, bars: 1 }));
      }
      if (fl > 0) {
        // railing: posts + two rails, maroon; robes and a towel or two hung over it
        B.box(W - 0.3, 0.06, 0.06, [0, y0 + 0.95, zFront - 0.05], PAL.templeMaroon);
        B.box(W - 0.3, 0.05, 0.05, [0, y0 + 0.5, zFront - 0.05], PAL.templeMaroon);
        for (let x = -W / 2 + 0.3; x <= W / 2 - 0.3; x += 0.6) B.box(0.04, 0.95, 0.04, [x, y0 + 0.47, zFront - 0.05], shade(PAL.templeMaroon, 0.1));
        let x = -W / 2 + 0.6 + r() * 1.2;
        while (x < W / 2 - 0.8) {
          const len = 0.6 + r() * 0.7, c = pick(r, ROBES);
          B.box(len, 0.62, 0.05, [x + len / 2, y0 + 0.66, zFront], c);
          B.box(len, 0.25, 0.05, [x + len / 2, y0 + 1.05, zFront - 0.08], shade(c, -0.15));
          x += len + 0.4 + r() * 1.6;
        }
      } else {
        // ground floor: a low maroon dado on the corridor wall and a bench
        B.box(W - 0.6, 0.7, 0.04, [0, y0 + 0.35, zRoom + 0.02], PAL.templeMaroon);
      }
      // single bulb per floor (night)
      B.box(0.12, 0.12, 0.12, [0, y0 + FH - 0.35, zRoom + 0.4], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.3 });
    }
    // back + end wall windows
    for (let fl = 0; fl < b.floors; fl++) {
      const y = 0.3 + fl * FH + 1.5;
      B.group([0, 0, zBack], Math.PI, () => {
        const n = Math.max(2, Math.floor(W / 2.0));
        for (let i = 0; i < n; i++) tibWindow(B, -W / 2 + (W * (i + 0.5)) / n, y, 0.55, 0.75, { lit: r() < 0.4, bars: 1 });
      });
      for (const sx of [-1, 1]) B.group([sx * W / 2, 0, (zBack + zRoom) / 2], sx * Math.PI / 2, () => tibWindow(B, 0, y, 0.5, 0.7, { lit: r() < 0.3, bars: 1, shambu: false }));
    }
    // plinth band and floor bands on the back
    B.box(W + 0.02, 0.1, 0.04, [0, 0.3 + FH, zBack - 0.02], PAL.templeMaroon);
    // roof: water tanks, a dish, a little stair hut
    const ry = 0.3 + H;
    for (let i = 0; i < Math.max(1, Math.floor(W / 5)); i++) {
      const x = -W / 2 + 1.2 + i * 3.2 + r() * 0.6;
      B.box(0.9, 0.18, 0.9, [x, ry + 0.09, zBack + 0.8], PAL.concreteDark);
      B.cyl(0.42, 0.42, 0.9, [x, ry + 0.18, zBack + 0.8], PAL.waterTank, 10);
      B.cyl(0.18, 0.2, 0.08, [x, ry + 1.08, zBack + 0.8], PAL.waterTank, 8);
    }
    if (b.seed % 2) {
      B.box(0.05, 0.6, 0.05, [W / 2 - 0.8, ry + 0.3, zBack + 0.6], PAL.concreteDark);
      B.groupEuler([W / 2 - 0.8, ry + 0.75, zBack + 0.6], [0.6, 0.5, 0], () => B.cyl(0.32, 0.3, 0.06, [0, 0, 0], PAL.dish, 10));
    }
    B.box(1.8, 2.0, 1.6, [-W / 2 + 1.1, ry + 1.0, zBack + 0.9], shade(wall, -0.05));
    B.box(2.0, 0.1, 1.8, [-W / 2 + 1.1, ry + 2.05, zBack + 0.9], PAL.roofGreen);
    B.box(0.7, 1.7, 0.05, [-W / 2 + 1.1, ry + 0.85, zBack + 1.72], PAL.shutterGreen);
  });
  // corridor front: potted plants on the ground floor
  S.group([f.x, f.y, f.z], f.yaw, () => {
    for (let x = -W / 2 + 0.8; x < W / 2 - 0.5; x += 1.7 + r() * 1.2) pot(S, x, 0.3, zFront - 0.35, r() < 0.5);
  });
  // colliders: rooms + corridor ends + upper floors over the corridor
  acc.box(lbox(f, 0, (zBack + zRoom) / 2, W, roomD, -0.5, 0.3 + H + 0.6, 'building'));
  for (const sx of [-1, 1]) acc.box(lbox(f, sx * (W / 2 - 0.125), zRoom + corr / 2, 0.25, corr, -0.5, 0.3 + H + 0.6, 'building'));
  acc.box(lbox(f, 0, zRoom + corr / 2, W, corr, 0.3 + FH - 0.2, 0.3 + H + 0.6, 'building'));
  acc.box(lbox(f, 0, 0, W + 0.2, D + 0.2, -0.5, 0.3, 'plinth'));
  // a warm bulb light per block
  const [lx, lz] = [b.x + Math.sin(b.yaw) * (D / 2 + 0.6), b.z + Math.cos(b.yaw) * (D / 2 + 0.6)];
  acc.lamps.push({ x: lx, y: CY + 2.6, z: lz, color: PAL.lampWarm, intensity: 3.5, distance: 8 });
}

function door(p: Parts) {
  p.taper(1.15, 0.03, 0.95, 0.03, 2.15, [0, 0, 0.015], INK);
  p.box(0.82, 1.95, 0.05, [0, 0.975, 0.04], PAL.templeMaroon);
  p.box(0.3, 0.3, 0.06, [0, 1.5, 0.045], WHITEWASH); // little white door curtain panel
  p.box(0.9, 0.08, 0.14, [0, 2.0, 0.07], PAL.templeRed);
}

export function pot(p: Parts, x: number, y: number, z: number, flowers: boolean) {
  p.cyl(0.17, 0.12, 0.28, [x, y, z], PAL.wallTerracotta, 7);
  p.cyl(0.18, 0.18, 0.04, [x, y + 0.28, z], shade(PAL.wallTerracotta, -0.15), 7);
  p.box(0.32, 0.26, 0.32, [x, y + 0.42, z], flowers ? PAL.grassDeep : PAL.grass);
  if (flowers) {
    p.box(0.12, 0.1, 0.12, [x - 0.07, y + 0.58, z + 0.05], 0xe98a2a); // marigolds
    p.box(0.1, 0.1, 0.1, [x + 0.08, y + 0.56, z - 0.06], 0xe9b52a);
  } else p.box(0.16, 0.2, 0.16, [x + 0.03, y + 0.62, z], PAL.grassLight);
}
