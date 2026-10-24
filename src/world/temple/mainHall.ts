// The Tsuglagkhang main hall: ochre two-storey hall on a stone plinth, a deep verandah of maroon pillars
// with painted capitals, pema-kara frieze and painted eaves under the roof, black trapezoid windows, a white
// door curtain with a blue endless knot, and on the roof a gilded pavilion, the Dharma wheel with two deer
// and golden victory banners.
import type { Parts } from '../../core/geom';
import { PAL } from '../../core/palette';
import type { Acc } from './acc';
import { CY, MAIN } from './site';
import {
  BEAM_COLORS, EAVE_COLORS, INK, WHITEWASH, lbox, mixHex, paintRow, pemaFrieze, rafterEnds, shade, tibDoor,
  tibPillar, tibWindow, tiledRoof, type Frame,
} from './util';

export const OCHRE = mixHex(mixHex(PAL.templeYellow, PAL.wallOchre, 0.4), 0xb8a888, 0.28);
const OCHRE_DARK = shade(OCHRE, -0.12);

// heights above the courtyard (y = CY)
const PL = 1.0;        // plinth top / verandah floor
const G1 = 5.0;        // top of ground storey (= floor of upper storey)
const G2 = 8.4;        // top of upper storey walls
const FR = 9.0;        // top of the pema frieze
const ROOF = 9.6;      // roof slab top
const PAR_H = 0.45;    // roof parapet

/** Group a wall face: run fn with the face plane at local z = 0 facing outward. */
function face(p: Parts, x: number, z: number, yaw: number, fn: () => void) { p.group([x, 0, z], yaw, fn); }

export function buildMainHall(acc: Acc) {
  const cx = (MAIN.x0 + MAIN.x1) / 2, cz = (MAIN.zFront + MAIN.zBack) / 2;
  const f: Frame = { x: cx, z: cz, yaw: Math.PI, y: CY };
  const halfD = (MAIN.zBack - MAIN.zFront) / 2;        // 9.15
  const halfW = (MAIN.x1 - MAIN.x0) / 2;               // 7
  const bodyFront = cz - MAIN.bodyZ0;                  // local z of the ground-storey front wall (4.95)
  const pillarZ = cz - MAIN.pillarZ;                   // 8.35
  const upFront = pillarZ + 0.3;                       // upper storey front face (8.65)
  const back = -halfD + 0.3;                           // back wall (local)
  const gW = halfW - 0.5;                              // ground storey half width (6.5)
  const uW = halfW - 0.2;                              // upper storey half width (6.8)
  const B = acc.big, S = acc.small;

  B.group([f.x, f.y, f.z], f.yaw, () => {
    // ---- plinth with a moulded top edge and a dark base course
    B.box(halfW * 2, PL, halfD * 2, [0, PL / 2, 0], PAL.stoneStep);
    B.box(halfW * 2 + 0.12, 0.12, halfD * 2 + 0.12, [0, PL - 0.06, 0], shade(PAL.stoneStep, 0.12));
    B.box(halfW * 2 + 0.1, 0.18, halfD * 2 + 0.1, [0, 0.09, 0], PAL.concreteDark);
    // verandah floor: polished stone slabs
    for (let i = 0; i < 12; i++) B.box(1.12, 0.02, halfD - bodyFront - 0.1, [-gW + 0.56 + i * 1.08, PL + 0.01, (halfD + bodyFront) / 2], i % 2 ? 0xb3ab9c : 0xa8a092);

    // ---- ground storey
    B.box(gW * 2, G1 - PL, bodyFront - back, [0, (PL + G1) / 2, (bodyFront + back) / 2], OCHRE);
    // maroon dado on the verandah wall + stone skirting all round
    B.box(gW * 2 - 0.02, 0.9, 0.05, [0, PL + 0.45, bodyFront + 0.02], PAL.templeMaroon);
    B.box(gW * 2 + 0.06, 0.22, bodyFront - back + 0.06, [0, PL + 0.11, (bodyFront + back) / 2], shade(PAL.stoneStep, -0.1));

    // ---- upper storey (spans the verandah, carried on the pillars)
    B.box(uW * 2, G2 - G1, upFront - back + 0.1, [0, (G1 + G2) / 2, (upFront + back - 0.1) / 2], OCHRE);
    // floor band between storeys (white with a maroon line)
    B.box(uW * 2 + 0.04, 0.22, upFront - back + 0.14, [0, G1 + 0.11, (upFront + back - 0.1) / 2], WHITEWASH);
    B.box(uW * 2 + 0.06, 0.06, upFront - back + 0.16, [0, G1 + 0.25, (upFront + back - 0.1) / 2], PAL.templeMaroon);
    // verandah ceiling: painted underside (blue with red joists) — seen from low cameras
    B.box(uW * 2 - 0.2, 0.06, upFront - bodyFront - 0.1, [0, G1 - 0.03, (upFront + bodyFront) / 2], PAL.templeBlue);
    for (let i = 0; i < 9; i++) B.box(0.12, 0.1, upFront - bodyFront - 0.1, [-uW + 0.8 + i * 1.6, G1 - 0.08, (upFront + bodyFront) / 2], PAL.templeRed);
  });

  // ---- facades
  B.group([f.x, f.y, f.z], f.yaw, () => {
    // front (verandah) wall of the ground storey
    face(B, 0, bodyFront, 0, () => {
      B.group([0, PL, 0], 0, () => {
        tibDoor(B, 0, 2.2, 3.0, { curtain: true });
        tibDoor(B, -3.3, 1.1, 2.4);
        tibDoor(B, 3.3, 1.1, 2.4);
      });
      tibWindow(B, -5.3, PL + 2.4, 0.9, 1.2, { lit: true });
      tibWindow(B, 5.3, PL + 2.4, 0.9, 1.2, { lit: true });
      // guardian-king murals beside the main door
      for (const sx of [-1, 1]) mural(B, sx * 1.98, PL + 0.95, sx < 0 ? 0 : 2);
    });
    // upper storey front: five big windows over the verandah
    face(B, 0, upFront, 0, () => {
      for (const x of [-5, -2.5, 2.5, 5]) tibWindow(B, x, G1 + 1.7, 1.1, 1.35, { lit: true });
      tibWindow(B, 0, G1 + 1.75, 1.7, 1.5, { lit: true, bars: 3 });
      // painted eave band under the frieze
      paintRow(B, -uW, uW, G2 - 0.12, 0.06, 0.2, 0.12, EAVE_COLORS, 0.24, 0.03);
      pemaFrieze(B, -uW - 0.1, uW + 0.1, G2, FR, 0);
      rafterEnds(B, -uW, uW, FR + 0.08, 0.1, 0.12, [PAL.templeBlue, PAL.templeGreen], 0.28);
    });
    // back
    face(B, 0, back - 0.1, Math.PI, () => {
      for (const x of [-4.2, 0, 4.2]) tibWindow(B, x, PL + 2.4, 0.9, 1.2, {});
      for (const x of [-4.8, -1.6, 1.6, 4.8]) tibWindow(B, x, G1 + 1.7, 1.0, 1.3, { lit: x > 0 });
      paintRow(B, -uW, uW, G2 - 0.12, 0.06, 0.2, 0.12, EAVE_COLORS, 0.24, 0.03);
      pemaFrieze(B, -uW - 0.1, uW + 0.1, G2, FR, 0);
      rafterEnds(B, -uW, uW, FR + 0.08, 0.1, 0.12, [PAL.templeBlue, PAL.templeGreen], 0.28);
    });
    // sides
    for (const sx of [-1, 1]) {
      const len = upFront - back + 0.1;
      const mid = (upFront + back - 0.1) / 2;
      // ground storey side wall face (at x = ±gW)
      face(B, sx * gW, 0, sx * Math.PI / 2, () => {
        for (const z of [2.6, -1.4, -5.4]) tibWindow(B, -sx * z, PL + 2.4, 0.9, 1.2, { lit: z < 0 });
      });
      face(B, sx * uW, 0, sx * Math.PI / 2, () => {
        for (const z of [6.6, 2.6, -1.4, -5.4]) tibWindow(B, -sx * z, G1 + 1.7, 1.0, 1.3, { lit: (z > 0) === (sx > 0) });
        paintRow(B, -sx * mid - len / 2, -sx * mid + len / 2, G2 - 0.12, 0.06, 0.2, 0.12, EAVE_COLORS, 0.24, 0.03);
        pemaFrieze(B, -sx * mid - len / 2 - 0.1, -sx * mid + len / 2 + 0.1, G2, FR, 0);
        rafterEnds(B, -sx * mid - len / 2, -sx * mid + len / 2, FR + 0.08, 0.1, 0.12, [PAL.templeBlue, PAL.templeGreen], 0.28);
      });
    }

    // ---- frieze box (behind the frieze faces), cornice, attic band and roof parapet
    const len = upFront - back + 0.1, mid = (upFront + back - 0.1) / 2;
    B.box(uW * 2, FR - G2, len, [0, (G2 + FR) / 2, mid], PAL.pema);
    B.box(uW * 2, ROOF - FR, len, [0, (FR + ROOF) / 2, mid], OCHRE_DARK);
    B.box(uW * 2 + 0.7, 0.16, len + 0.7, [0, FR + 0.28, mid], shade(PAL.templeMaroon, -0.3));
    B.box(uW * 2 + 0.6, 0.06, len + 0.6, [0, FR + 0.39, mid], WHITEWASH);
    // roof deck (red-oxide tiles, rain stains) inside a low maroon parapet, outer faces flush with the walls
    tiledRoof(B, -uW + 0.05, mid - len / 2 + 0.05, uW - 0.05, mid + len / 2 - 0.05, ROOF + 0.06, 31, { stains: 5 });
    // water tanks on a stand and a stair hut at the back corners
    for (const x of [4.4, 5.6]) {
      B.box(1.0, 0.4, 1.0, [x, ROOF + 0.2, back + 1.1], PAL.concreteDark);
      B.cyl(0.46, 0.46, 1.0, [x, ROOF + 0.4, back + 1.1], PAL.waterTank, 10);
      B.cyl(0.2, 0.22, 0.08, [x, ROOF + 1.4, back + 1.1], PAL.waterTank, 8);
    }
    B.box(2.2, 2.1, 1.9, [-uW + 1.6, ROOF + 1.05, back + 1.4], OCHRE);
    B.box(2.4, 0.12, 2.1, [-uW + 1.6, ROOF + 2.16, back + 1.4], PAL.templeMaroon);
    B.box(0.8, 1.8, 0.05, [-uW + 1.6, ROOF + 0.9, back + 2.36], PAL.templeRed);
    // rain spouts through the parapet
    for (const x of [-4, 0, 4]) for (const sz of [-1, 1]) B.box(0.12, 0.1, 0.5, [x, ROOF + 0.12, mid + sz * (len / 2 + 0.05)], 0x5a5650);
    for (const sx of [-1, 1]) B.box(0.3, PAR_H, len, [sx * (uW - 0.15), ROOF + PAR_H / 2, mid], PAL.templeMaroon);
    for (const sz of [-1, 1]) B.box(uW * 2 - 0.6, PAR_H, 0.3, [0, ROOF + PAR_H / 2, mid + sz * (len / 2 - 0.15)], PAL.templeMaroon);
    for (const sx of [-1, 1]) B.box(0.34, 0.06, len + 0.04, [sx * (uW - 0.15), ROOF + PAR_H + 0.03, mid], WHITEWASH);
    for (const sz of [-1, 1]) B.box(uW * 2 + 0.04, 0.06, 0.34, [0, ROOF + PAR_H + 0.03, mid + sz * (len / 2 - 0.15)], WHITEWASH);

    // ---- verandah: pillars, beam, painted bracket band
    const pxs = [-6.4, -4.6, -2.8, -1.1, 1.1, 2.8, 4.6, 6.4];
    for (const x of pxs) tibPillar(B, x, pillarZ, PL, G1 - PL - 0.3, { size: 0.36, bracket: 1.25 });
    B.box(uW * 2, 0.3, 0.42, [0, G1 - 0.15, pillarZ], PAL.templeRed);
    paintRow(B, -uW, uW, G1 - 0.1, pillarZ + 0.2, 0.12, 0.05, BEAM_COLORS, 0.3, 0.02);
    paintRow(B, -uW, uW, G1 - 0.23, pillarZ + 0.2, 0.06, 0.05, [PAL.templeYellow, PAL.templeRed], 0.12);
    // little rafter ends over the beam
    rafterEnds(B, -uW, uW, G1 + 0.36, upFront, 0.1, [PAL.templeGreen, PAL.templeBlue, PAL.templeRed], 0.22);

    // ---- front steps (wide flight up to the verandah)
    const n = 6, run = (MAIN.zFront - MAIN.stairsZ0) / n;
    for (let i = 0; i < n; i++) {
      const top = (PL * (i + 1)) / n;
      const z0 = halfD + run * (n - i - 1), z1 = z0 + run;
      B.box(7.0, top, z1 - z0 + 0.02, [0, top / 2, (z0 + z1) / 2], i % 2 ? PAL.stoneStep : shade(PAL.stoneStep, 0.06));
      B.box(7.0, 0.03, 0.06, [0, top - 0.015, z1 - 0.02], shade(PAL.stoneStep, 0.2));
    }
    // step cheeks with brass offering bowls
    for (const sx of [-1, 1]) {
      B.box(0.5, PL + 0.25, run * n + 0.1, [sx * 3.75, (PL + 0.25) / 2, halfD + (run * n) / 2], WHITEWASH);
      B.box(0.56, 0.1, run * n + 0.16, [sx * 3.75, PL + 0.3, halfD + (run * n) / 2], PAL.templeMaroon);
      B.cyl(0.2, 0.12, 0.18, [sx * 3.75, PL + 0.35, halfD + run * n - 0.3], PAL.khorloCopper, 8);
    }
  });

  // ---- roof crown: gilded pavilion, Dharma wheel with deer, victory banners
  const len = upFront - back + 0.1, mid = (upFront + back - 0.1) / 2;
  B.group([f.x, f.y, f.z], f.yaw, () => {
    roofPavilion(B, 0, ROOF, mid - 0.8);
    // raised clerestory (skylight lantern over the assembly hall) between the pavilion and the front
    const cz0 = 2.4, cz1 = 6.2, cw = 2.8, ch = 1.15;
    B.box(cw * 2, ch, cz1 - cz0, [0, ROOF + ch / 2, (cz0 + cz1) / 2], OCHRE);
    tiledRoof(B, -cw + 0.05, cz0 + 0.05, cw - 0.05, cz1 - 0.05, ROOF + ch + 0.08, 32, { base: 0.08 });
    for (const sx of [-1, 1]) B.box(0.18, 0.16, cz1 - cz0 + 0.3, [sx * (cw + 0.06), ROOF + ch + 0.08, (cz0 + cz1) / 2], PAL.templeMaroon);
    for (const sz of [cz0, cz1]) B.box(cw * 2 + 0.3, 0.16, 0.18, [0, ROOF + ch + 0.08, sz], PAL.templeMaroon);
    gyaltsen(B, 0, ROOF + ch + 0.16, (cz0 + cz1) / 2, 0.7);
    B.box(cw * 2 + 0.04, 0.24, cz1 - cz0 + 0.04, [0, ROOF + ch - 0.15, (cz0 + cz1) / 2], PAL.pema);
    for (let i = 0; i < 6; i++) {
      const x = -cw + 0.5 + i * ((cw * 2 - 1.0) / 5);
      B.box(0.5, 0.5, 0.06, [x, ROOF + 0.48, cz1 + 0.02], INK);
      B.box(0.38, 0.4, 0.06, [x, ROOF + 0.48, cz1 + 0.04], PAL.glass, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.7 });
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const z = cz0 + 0.6 + i * 1.25;
      B.box(0.06, 0.5, 0.5, [sx * (cw + 0.02), ROOF + 0.48, z], INK);
      B.box(0.06, 0.4, 0.38, [sx * (cw + 0.04), ROOF + 0.48, z], PAL.glass, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.7 });
    }
    dharmaWheel(B, 0, ROOF + PAR_H + 0.06, upFront - 0.15, 0.8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gyaltsen(B, sx * (uW - 0.15), ROOF + PAR_H + 0.06, mid + sz * (len / 2 - 0.15), 1.25);
  });

  // ---- verandah props (not occluding): prostration boards, potted plants, a donation box
  S.group([f.x, f.y, f.z], f.yaw, () => {
    for (const x of [-5.4, -3.7, 3.7, 5.4]) {
      S.box(0.7, 0.1, 1.9, [x, PL + 0.05, (bodyFront + pillarZ) / 2 + 0.1], PAL.woodTrim);
      S.box(0.6, 0.04, 0.5, [x, PL + 0.12, (bodyFront + pillarZ) / 2 + 0.75], PAL.templeRed);
    }
    // a row of seven brass water-offering bowls on a low red table by the door
    S.box(1.5, 0.4, 0.36, [1.95, PL + 0.2, bodyFront + 0.3], PAL.templeRed);
    for (let i = 0; i < 7; i++) S.cyl(0.07, 0.05, 0.06, [1.4 + i * 0.18, PL + 0.4, bodyFront + 0.3], PAL.khorloCopper, 6);
    S.box(0.5, 0.7, 0.4, [-1.9, PL + 0.35, bodyFront + 0.35], PAL.woodDoor);
    S.box(0.52, 0.06, 0.42, [-1.9, PL + 0.72, bodyFront + 0.35], PAL.gold);
  });

  // ---- colliders
  acc.box(lbox(f, 0, 0, halfW * 2, halfD * 2, -0.5, PL, 'temple'));
  acc.box(lbox(f, 0, (bodyFront + back) / 2, gW * 2, bodyFront - back, PL, ROOF + PAR_H, 'temple'));
  acc.box(lbox(f, 0, (upFront + bodyFront) / 2, uW * 2, upFront - bodyFront, G1 - 0.3, ROOF + PAR_H, 'temple'));
  for (const x of [-6.4, -4.6, -2.8, -1.1, 1.1, 2.8, 4.6, 6.4]) acc.box(lbox(f, x, pillarZ, 0.42, 0.42, PL, G1, 'pillar'));
  {
    const n = 6, run = (MAIN.zFront - MAIN.stairsZ0) / n;
    for (let i = 0; i < n; i++) {
      const top = (PL * (i + 1)) / n;
      const z0 = halfD + run * (n - i - 1);
      acc.box(lbox(f, 0, z0 + run / 2, 7.0, run, -0.3, top, 'step'));
    }
    for (const sx of [-1, 1]) acc.box(lbox(f, sx * 3.75, halfD + (run * n) / 2, 0.5, run * n + 0.1, -0.2, PL + 0.35, 'temple'));
  }
  // night lights on the verandah
  for (const x of [-4, 0, 4]) {
    const lx = cx - x, lz = cz - (pillarZ - 1.2);
    acc.lamps.push({ x: lx, y: CY + G1 - 0.6, z: lz, color: PAL.lampWarm, intensity: 5, distance: 9 });
  }
  B.group([f.x, f.y, f.z], f.yaw, () => {
    for (const x of [-4, 0, 4]) {
      B.box(0.03, 0.4, 0.03, [x, G1 - 0.4, pillarZ - 1.2], INK);
      B.box(0.2, 0.2, 0.2, [x, G1 - 0.7, pillarZ - 1.2], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.4 });
    }
  });
}

/** Mural panel of a guardian figure: coloured body, face, halo — chunky at pixel scale. */
function mural(p: Parts, x: number, y: number, kind: number, w = 0.72) {
  const bodies = [PAL.templeGreen, PAL.templeWhite, PAL.templeRed, PAL.templeYellow];
  const h = 2.2;
  p.box(w + 0.1, h + 0.1, 0.03, [x, y + h / 2, 0.02], PAL.templeRed);
  p.box(w, h, 0.04, [x, y + h / 2, 0.03], 0x2f5a6a); // dark teal background
  p.box(w * 0.5, w * 0.5, 0.04, [x, y + h * 0.78, 0.04], PAL.gold); // halo
  p.box(w * 0.26, w * 0.26, 0.04, [x, y + h * 0.78, 0.05], kind === 1 ? 0xf1ede4 : PAL.skinLight);
  p.box(w * 0.62, h * 0.42, 0.04, [x, y + h * 0.45, 0.05], bodies[kind]);
  p.box(w * 0.7, 0.08, 0.04, [x, y + h * 0.55, 0.06], PAL.gold);
  p.box(w * 0.18, h * 0.22, 0.04, [x - w * 0.18, y + h * 0.13, 0.05], bodies[(kind + 2) % 4]);
  p.box(w * 0.18, h * 0.22, 0.04, [x + w * 0.18, y + h * 0.13, 0.05], bodies[(kind + 2) % 4]);
  // emblem held (lute / sword / stupa / banner)
  p.box(0.06, h * 0.4, 0.04, [x + w * 0.32, y + h * 0.55, 0.07], [PAL.gold, PAL.templeBlue, PAL.gold, PAL.templeRed][kind]);
  p.box(w * 0.94, 0.12, 0.04, [x, y + 0.06, 0.05], 0x5a7a3a);
}

/** Gilded pavilion on the roof: red walls, gold windows, hip roof with upturned corners and a ganjira finial. */
function roofPavilion(p: Parts, x: number, y: number, z: number) {
  const W = 5.2, D = 4.4, H = 2.0;
  p.group([x, y, z], 0, () => {
    p.box(W + 0.4, 0.2, D + 0.4, [0, 0.1, 0], PAL.templeMaroon);
    p.box(W, H, D, [0, 0.2 + H / 2, 0], PAL.templeRed);
    // corner pillars and gold window lattices
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.24, H, 0.24, [sx * W / 2, 0.2 + H / 2, sz * D / 2], PAL.gold);
    for (const [fx, fz, yaw, len] of [[0, D / 2, 0, W], [0, -D / 2, Math.PI, W], [W / 2, 0, Math.PI / 2, D], [-W / 2, 0, -Math.PI / 2, D]] as const) {
      p.group([fx, 0, fz], yaw, () => {
        const n = Math.floor(len / 1.2);
        for (let i = 0; i < n; i++) {
          const wx = -len / 2 + (i + 0.5) * (len / n);
          p.box(0.6, 0.9, 0.06, [wx, 0.2 + H * 0.55, 0.03], PAL.gold);
          p.box(0.46, 0.76, 0.06, [wx, 0.2 + H * 0.55, 0.05], 0x5a2a20, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.6 });
          p.box(0.04, 0.76, 0.08, [wx, 0.2 + H * 0.55, 0.06], PAL.gold);
        }
        paintRow(p, -len / 2, len / 2, 0.2 + H - 0.12, 0.05, 0.18, 0.08, EAVE_COLORS, 0.2, 0.03);
      });
    }
    // roof: eave slab, two-step hip, ridge, upturned corners, finial
    const ey = 0.2 + H;
    p.box(W + 1.6, 0.12, D + 1.6, [0, ey + 0.06, 0], PAL.goldDeep);
    p.taper(W + 1.4, D + 1.4, W * 0.55, D * 0.4, 0.9, [0, ey + 0.12, 0], PAL.gold);
    p.taper(W * 0.55, D * 0.4, W * 0.36, 0.2, 0.75, [0, ey + 1.02, 0], PAL.gold);
    p.box(W * 0.4, 0.14, 0.26, [0, ey + 1.8, 0], PAL.goldDeep);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.groupEuler([sx * (W / 2 + 0.75), ey + 0.2, sz * (D / 2 + 0.75)], [sz * -0.5, 0, sx * 0.5], () => p.box(0.16, 0.36, 0.16, [0, 0.12, 0], PAL.gold));
    }
    // ganjira finial
    const fy = ey + 1.86;
    p.cyl(0.22, 0.3, 0.16, [0, fy, 0], PAL.goldDeep, 8);
    p.cyl(0.3, 0.16, 0.42, [0, fy + 0.16, 0], PAL.gold, 8);
    p.cyl(0.12, 0.3, 0.2, [0, fy + 0.58, 0], PAL.gold, 8);
    p.cyl(0.14, 0.1, 0.12, [0, fy + 0.78, 0], PAL.goldDeep, 8);
    p.cone(0.12, 0.5, [0, fy + 0.9, 0], PAL.gold, 6);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gyaltsen(p, sx * (W / 2 + 0.55), ey + 0.12, sz * (D / 2 + 0.55), 0.6);
  });
}

/** Golden Dharma wheel on a lotus, flanked by two kneeling deer, facing local +z. */
export function dharmaWheel(p: Parts, x: number, y: number, z: number, r: number) {
  p.group([x, y, z], 0, () => {
    // lotus pedestal
    p.taper(r * 0.9, r * 0.5, r * 1.3, r * 0.6, r * 0.3, [0, 0, 0], PAL.goldDeep);
    p.box(r * 1.4, r * 0.08, r * 0.62, [0, r * 0.34, 0], PAL.gold);
    const cy = r * 0.38 + r;
    // rim: 16 tangential segments
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      p.groupEuler([Math.sin(a) * r * 0.9, cy + Math.cos(a) * r * 0.9, 0], [0, 0, -a], () => p.box(r * 0.38, r * 0.16, r * 0.2, [0, 0, 0], PAL.gold));
    }
    // 8 spokes with knobs on the rim
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      p.groupEuler([Math.sin(a) * r * 0.45, cy + Math.cos(a) * r * 0.45, 0], [0, 0, -a], () => p.box(r * 0.07, r * 0.8, r * 0.08, [0, 0, 0], PAL.goldDeep));
      p.box(r * 0.14, r * 0.14, r * 0.14, [Math.sin(a) * r * 1.05, cy + Math.cos(a) * r * 1.05, 0], PAL.gold);
    }
    // hub with the three-swirl joy wheel
    p.box(r * 0.36, r * 0.36, r * 0.24, [0, cy, 0], PAL.gold);
    p.box(r * 0.12, r * 0.12, r * 0.04, [-r * 0.07, cy + r * 0.05, r * 0.13], PAL.templeBlue);
    p.box(r * 0.12, r * 0.12, r * 0.04, [r * 0.07, cy + r * 0.05, r * 0.13], PAL.templeRed);
    p.box(r * 0.12, r * 0.12, r * 0.04, [0, cy - r * 0.07, r * 0.13], PAL.templeYellow);
    // deer
    for (const sx of [-1, 1]) deer(p, sx * r * 1.55, 0, 0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, r * 0.95);
  });
}

function deer(p: Parts, x: number, y: number, z: number, yaw: number, s: number) {
  const g = PAL.gold, d = PAL.goldDeep;
  p.group([x, y, z], yaw, () => {
    p.box(s * 0.5, s * 0.08, s * 0.7, [0, s * 0.04, 0], d);              // base
    p.box(s * 0.34, s * 0.3, s * 0.62, [0, s * 0.24, -0.04 * s], g);     // body (kneeling)
    p.box(s * 0.14, s * 0.38, s * 0.16, [0, s * 0.52, s * 0.2], g);      // neck
    p.box(s * 0.16, s * 0.16, s * 0.3, [0, s * 0.72, s * 0.3], g);       // head
    p.box(s * 0.05, s * 0.05, s * 0.03, [-0.05 * s, s * 0.75, s * 0.44], 0x3a2a12);
    p.box(s * 0.05, s * 0.05, s * 0.03, [0.05 * s, s * 0.75, s * 0.44], 0x3a2a12);
    p.box(s * 0.22, s * 0.06, s * 0.06, [0, s * 0.84, s * 0.22], d);     // ears
    p.box(s * 0.04, s * 0.22, s * 0.04, [-0.06 * s, s * 0.95, s * 0.2], d); // antlers
    p.box(s * 0.04, s * 0.22, s * 0.04, [0.06 * s, s * 0.95, s * 0.2], d);
    p.box(s * 0.16, s * 0.04, s * 0.04, [0, s * 1.02, s * 0.18], d);
    p.box(s * 0.36, s * 0.08, s * 0.14, [0, s * 0.1, s * 0.3], g);       // folded front legs
  });
}

/** Golden victory banner (gyaltsen): banded drum on a short pole with a parasol top. */
export function gyaltsen(p: Parts, x: number, y: number, z: number, h: number) {
  p.group([x, y, z], 0, () => {
    p.cyl(0.04 * h * 2, 0.06 * h * 2, h * 0.25, [0, 0, 0], PAL.goldDeep, 6);
    p.cyl(0.15 * h, 0.17 * h, h * 0.5, [0, h * 0.25, 0], PAL.gold, 8);
    p.cyl(0.19 * h, 0.19 * h, h * 0.06, [0, h * 0.35, 0], PAL.goldDeep, 8);
    p.cyl(0.19 * h, 0.19 * h, h * 0.06, [0, h * 0.55, 0], PAL.goldDeep, 8);
    p.cyl(0.08 * h, 0.2 * h, h * 0.12, [0, h * 0.75, 0], PAL.gold, 8);
    p.cone(0.07 * h, h * 0.2, [0, h * 0.87, 0], PAL.gold, 6);
  });
}
