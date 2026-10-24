// Kalachakra temple: a smaller whitewashed hall facing east across the courtyard, with a two-pillar porch,
// pema frieze, gilded roof canopy, Dharma wheel and deer and corner victory banners.
import { PAL } from '../../core/palette';
import type { Acc } from './acc';
import { CY, KALA } from './site';
import {
  BEAM_COLORS, EAVE_COLORS, lbox, paintRow, pemaFrieze, rafterEnds, shade, tibDoor, tibPillar, tibWindow,
  type Frame,
} from './util';
import { dharmaWheel, gyaltsen } from './mainHall';

export function buildKalachakra(acc: Acc) {
  const cx = (KALA.x0 + KALA.x1) / 2, cz = (KALA.z0 + KALA.z1) / 2;
  // local frame: +z = east (front), local x = world -z
  const f: Frame = { x: cx, z: cz, yaw: Math.PI / 2, y: CY };
  const W = (KALA.z1 - KALA.z0) / 2;   // half width (3.6)
  const D = (KALA.x1 - KALA.x0) / 2;   // half depth (3.0)
  const PL = KALA.plinth;
  const porch = 1.7;                   // porch depth (front part of the plinth)
  const bodyF = D - porch;             // body front wall (local z)
  // heights relative to the plinth top
  const H = 4.6;                       // wall top
  const FR = H + 0.5;                  // frieze top
  const ROOF = FR + 0.35;              // roof slab
  const B = acc.big, S = acc.small;
  const wall = 0xf1ece0;

  B.group([f.x, f.y, f.z], f.yaw, () => {
    // plinth + steps
    B.box(W * 2, PL, D * 2, [0, PL / 2, 0], PAL.stoneStep);
    B.box(W * 2 + 0.1, 0.1, D * 2 + 0.1, [0, PL - 0.05, 0], shade(PAL.stoneStep, 0.12));
    for (let i = 0; i < 3; i++) {
      const top = (PL * (i + 1)) / 3, z0 = D + 0.38 * (2 - i);
      B.box(3.2, top, 0.4, [0, top / 2, z0 + 0.19], i % 2 ? PAL.stoneStep : shade(PAL.stoneStep, 0.06));
    }
    // body
    B.box(W * 2 - 0.4, H, bodyF + D - 0.2, [0, PL + H / 2, (bodyF - D + 0.2) / 2], wall);
    B.box(W * 2 - 0.36, 0.5, bodyF + D - 0.16, [0, PL + 0.25, (bodyF - D + 0.2) / 2], shade(PAL.stoneStep, -0.08));
    // porch roof over the pillars (upper band continues forward)
    B.box(W * 2 - 0.2, FR - H + 0.9, porch + 0.1, [0, PL + (H - 0.9 + FR) / 2, D - porch / 2 + 0.05], wall);
    for (const x of [-1.4, 1.4]) tibPillar(B, x, D - 0.3, PL, H - 1.2, { size: 0.32, bracket: 1.0 });
    B.box(W * 2 - 0.2, 0.3, 0.36, [0, PL + H - 1.05, D - 0.3], PAL.templeRed);
    paintRow(B, -W + 0.1, W - 0.1, PL + H - 1.0, D - 0.1, 0.12, 0.04, BEAM_COLORS, 0.3, 0.02);
    // frieze ring, cornice, roof parapet
    const len = D * 2 - 0.2;
    B.box(W * 2 - 0.2, FR - H, D * 2 - 0.2, [0, PL + (H + FR) / 2, 0], PAL.pema);
    B.box(W * 2 - 0.2, ROOF - FR, D * 2 - 0.2, [0, PL + (FR + ROOF) / 2, 0], shade(wall, -0.06));
    B.box(W * 2 + 0.4, 0.14, D * 2 + 0.4, [0, PL + FR + 0.12, 0], shade(PAL.templeMaroon, -0.3));
    for (const sx of [-1, 1]) B.box(0.26, 0.4, len, [sx * (W - 0.23), PL + ROOF + 0.2, 0], PAL.templeMaroon);
    for (const sz of [-1, 1]) B.box(W * 2 - 0.2, 0.4, 0.26, [0, PL + ROOF + 0.2, sz * (D - 0.23)], PAL.templeMaroon);
    B.box(W * 2 - 0.6, 0.05, D * 2 - 0.6, [0, PL + ROOF + 0.02, 0], 0x8f8a80);
  });

  // facades (face plane at z=0 in a sub-group)
  B.group([f.x, f.y, f.z], f.yaw, () => {
    B.group([0, PL, bodyF], 0, () => {
      tibDoor(B, 0, 1.6, 2.6, { curtain: true });
      tibWindow(B, -2.3, 2.2, 0.8, 1.1, { lit: true });
      tibWindow(B, 2.3, 2.2, 0.8, 1.1, { lit: true });
    });
    B.group([0, PL, D - 0.1], 0, () => {
      tibWindow(B, 0, H - 0.25, 1.4, 0.6, { lit: true, bars: 3, shambu: false });
      paintRow(B, -W + 0.1, W - 0.1, H + 0.0 - 0.05, 0.02, 0.16, 0.1, EAVE_COLORS, 0.22, 0.03);
      pemaFrieze(B, -W + 0.1, W - 0.1, H + 0.0, FR, 0);
      rafterEnds(B, -W + 0.1, W - 0.1, FR + 0.06, 0.08, 0.1, [PAL.templeBlue, PAL.templeGreen], 0.24);
    });
    // back & sides
    B.group([0, PL, -D + 0.2], Math.PI, () => {
      for (const x of [-1.8, 1.8]) tibWindow(B, x, 2.4, 0.8, 1.1, {});
      pemaFrieze(B, -W + 0.1, W - 0.1, H, FR, -0.1);
      paintRow(B, -W + 0.1, W - 0.1, H - 0.05, -0.08, 0.16, 0.1, EAVE_COLORS, 0.22, 0.03);
    });
    for (const sx of [-1, 1]) {
      B.group([sx * (W - 0.2), PL, 0], sx * Math.PI / 2, () => {
        tibWindow(B, sx * 0.4, 2.4, 0.8, 1.1, { lit: sx > 0 });
        pemaFrieze(B, -D, D, H, FR, -0.1);
        paintRow(B, -D, D, H - 0.05, -0.08, 0.16, 0.1, EAVE_COLORS, 0.22, 0.03);
      });
    }
    // roof crown: small gilded canopy, wheel + deer over the door, banners on the corners
    const ry = PL + ROOF + 0.05;
    B.box(2.6, 1.0, 2.2, [0, ry + 0.5, -0.6], PAL.templeRed);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.16, 1.0, 0.16, [sx * 1.3, ry + 0.5, -0.6 + sz * 1.1], PAL.gold);
    B.box(3.4, 0.08, 3.0, [0, ry + 1.04, -0.6], PAL.goldDeep);
    B.taper(3.2, 2.8, 0.9, 0.4, 0.8, [0, ry + 1.08, -0.6], PAL.gold);
    B.cyl(0.08, 0.16, 0.3, [0, ry + 1.88, -0.6], PAL.gold, 6);
    B.cone(0.08, 0.3, [0, ry + 2.18, -0.6], PAL.gold, 6);
    dharmaWheel(B, 0, ry + 0.35, D - 0.25, 0.55);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gyaltsen(B, sx * (W - 0.23), ry + 0.35, sz * (D - 0.23), 0.95);
  });

  // porch props
  S.group([f.x, f.y, f.z], f.yaw, () => {
    for (const x of [-2.6, 2.6]) {
      S.cyl(0.2, 0.16, 0.32, [x, PL, D - 0.5], PAL.wallTerracotta, 7);
      S.box(0.34, 0.34, 0.34, [x, PL + 0.5, D - 0.5], PAL.grass);
      S.box(0.18, 0.12, 0.18, [x + 0.06, PL + 0.72, D - 0.45], PAL.rhodo);
    }
  });

  // colliders
  acc.box(lbox(f, 0, 0, W * 2, D * 2, -0.5, PL, 'temple'));
  acc.box(lbox(f, 0, (bodyF - D + 0.2) / 2, W * 2 - 0.4, bodyF + D - 0.2, PL, PL + ROOF + 0.4, 'temple'));
  acc.box(lbox(f, 0, D - porch / 2, W * 2 - 0.2, porch, PL + H - 1.2, PL + ROOF + 0.4, 'temple'));
  for (const x of [-1.4, 1.4]) acc.box(lbox(f, x, D - 0.3, 0.36, 0.36, PL, PL + H, 'pillar'));
  for (let i = 0; i < 3; i++) acc.box(lbox(f, 0, D + 0.38 * (2 - i) + 0.19, 3.2, 0.4, -0.3, (PL * (i + 1)) / 3, 'step'));
  for (const x of [-2.6, 2.6]) acc.box(lbox(f, x, D - 0.5, 0.4, 0.4, PL, PL + 0.8, 'plant'));
  // porch light
  const [lx, lz] = [cx + (D - 0.9), cz];
  acc.lamps.push({ x: lx, y: CY + PL + H - 1.4, z: lz, color: PAL.lampWarm, intensity: 4, distance: 7 });
  B.group([f.x, f.y, f.z], f.yaw, () => B.box(0.18, 0.18, 0.18, [0, PL + H - 1.5, D - 0.9], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.4 }));
}
