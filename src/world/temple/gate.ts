// The temple gate where Temple Road arrives: two maroon pillars on stone bases, painted brackets and beam,
// a name board, a little gilded roof with a ganjira finial, snow lions and two hanging lanterns.
import { PAL } from '../../core/palette';
import { makeSign } from '../../kit/sign';
import type { Acc } from './acc';
import { CY, GATE } from './site';
import { BEAM_COLORS, EAVE_COLORS, INK, WHITEWASH, paintRow, rafterEnds, snowLion, tibPillar } from './util';

export function buildGate(acc: Acc) {
  const B = acc.big;
  const gx = GATE.x, gz = GATE.z;
  const half = (GATE.x1 - GATE.x0) / 2;     // 2.6
  const px = half - 0.3;                     // pillar centre offset
  const H = 3.7;                             // pillar top (bracket top)
  const beamY = H;                           // beam bottom
  B.group([gx, CY, gz], 0, () => {
    // threshold and pillar bases
    B.box(half * 2, 0.06, 0.7, [0, 0.03, 0], PAL.stoneStep);
    for (const sx of [-1, 1]) {
      B.box(0.86, 0.5, 0.86, [sx * px, 0.25, 0], PAL.stoneStep);
      B.box(0.92, 0.08, 0.92, [sx * px, 0.5, 0], WHITEWASH);
      tibPillar(B, sx * px, 0, 0.54, H - 0.54, { size: 0.5, bracket: 1.6 });
      // gate posts merge into the boundary wall: whitewashed pier behind each pillar
      B.box(0.5, 1.6, 0.5, [sx * (half + 0.15), 0.8, 0.18], WHITEWASH);
      B.box(0.56, 0.12, 0.56, [sx * (half + 0.15), 1.66, 0.18], PAL.templeMaroon);
    }
    // main beam: red core with painted bands on both faces
    const bw = half * 2 + 1.4;
    B.box(bw, 0.42, 0.5, [0, beamY + 0.21, 0], PAL.templeRed);
    for (const sz of [-1, 1]) {
      paintRow(B, -bw / 2, bw / 2, beamY + 0.31, sz * 0.26, 0.14, 0.04, BEAM_COLORS, 0.34, 0.03);
      paintRow(B, -bw / 2, bw / 2, beamY + 0.1, sz * 0.26, 0.08, 0.04, [PAL.templeYellow, PAL.templeRed, PAL.templeBlue], 0.12);
    }
    // second beam + rafter ends both sides
    B.box(bw + 0.3, 0.16, 0.7, [0, beamY + 0.5, 0], PAL.templeMaroon);
    for (const sz of [-1, 1]) B.group([0, 0, 0], sz > 0 ? 0 : Math.PI, () => rafterEnds(B, -bw / 2 - 0.1, bw / 2 + 0.1, beamY + 0.68, 0.36, 0.12, [PAL.templeGreen, PAL.templeBlue, PAL.templeRed], 0.26));
    B.box(bw + 0.5, 0.12, 1.1, [0, beamY + 0.82, 0], PAL.templeRed);
    // gilded roof: eave slab, hip, ridge with upturned ends, finial
    const ry = beamY + 0.88;
    B.box(bw + 1.2, 0.1, 2.3, [0, ry + 0.05, 0], PAL.goldDeep);
    B.taper(bw + 1.0, 2.1, bw * 0.6, 0.35, 0.9, [0, ry + 0.1, 0], PAL.gold);
    B.box(bw * 0.66, 0.16, 0.3, [0, ry + 1.06, 0], PAL.goldDeep);
    for (const sx of [-1, 1]) {
      B.groupEuler([sx * bw * 0.33, ry + 1.1, 0], [0, 0, sx * -0.6], () => B.box(0.14, 0.4, 0.16, [0, 0.16, 0], PAL.gold));
      for (const sz of [-1, 1]) B.groupEuler([sx * (bw / 2 + 0.55), ry + 0.12, sz * 1.1], [sz * -0.6, 0, sx * 0.6], () => B.box(0.12, 0.3, 0.12, [0, 0.1, 0], PAL.gold));
    }
    const fy = ry + 1.14;
    B.cyl(0.16, 0.22, 0.12, [0, fy, 0], PAL.goldDeep, 8);
    B.cyl(0.22, 0.12, 0.32, [0, fy + 0.12, 0], PAL.gold, 8);
    B.cyl(0.09, 0.22, 0.16, [0, fy + 0.44, 0], PAL.gold, 8);
    B.cone(0.09, 0.4, [0, fy + 0.6, 0], PAL.gold, 6);
    // painted eave fascia under the gilded roof
    for (const sz of [-1, 1]) paintRow(B, -bw / 2 - 0.5, bw / 2 + 0.5, ry + 0.02, sz * 1.15, 0.06, 0.04, EAVE_COLORS, 0.2, 0.02);
    // lanterns hanging from the beam ends
    for (const sx of [-1, 1]) {
      const lx = sx * (half + 0.45);
      B.box(0.02, 0.36, 0.02, [lx, beamY - 0.18, -0.1], INK);
      B.box(0.26, 0.34, 0.26, [lx, beamY - 0.52, -0.1], PAL.templeRed, { emit: 0xff7040, emitNight: true, emitIntensity: 1.2 });
      B.box(0.3, 0.05, 0.3, [lx, beamY - 0.33, -0.1], PAL.gold);
      B.box(0.3, 0.05, 0.3, [lx, beamY - 0.71, -0.1], PAL.gold);
      B.box(0.04, 0.12, 0.04, [lx, beamY - 0.8, -0.1], PAL.gold);
    }
  });

  // name boards hanging under the beam: 'TSUGLAGKHANG' facing the road (north), 'NAMGYAL' facing the court
  const by = CY + beamY - 0.44;
  const board = makeSign({ text: 'TSUGLAGKHANG', bod: 'གཙུག་ལག་ཁང་།', bg: PAL.templeMaroon, fg: PAL.gold, w: 3.0, h: 0.72 });
  board.position.set(gx, by, gz - 0.04);
  board.rotation.y = Math.PI;
  acc.meshes.push(board);
  const board2 = makeSign({ text: 'NAMGYAL', bod: 'རྣམ་རྒྱལ།', bg: PAL.templeBlue, fg: PAL.gold, w: 3.0, h: 0.72 });
  board2.position.set(gx, by, gz + 0.04);
  acc.meshes.push(board2);
  // gold frame round the boards and two hanging rods
  B.box(3.16, 0.06, 0.16, [gx, by + 0.39, gz], PAL.gold);
  B.box(3.16, 0.06, 0.16, [gx, by - 0.39, gz], PAL.gold);
  for (const sx of [-1, 1]) {
    B.box(0.06, 0.84, 0.16, [gx + sx * 1.55, by, gz], PAL.gold);
    B.box(0.04, beamY - (by - CY) - 0.36, 0.04, [gx + sx * 1.2, (CY + beamY + by + 0.36) / 2, gz], INK);
  }

  // snow lions on plinths flanking the gate (outside, facing the road)
  for (const sx of [-1, 1]) snowLion(acc.big, [gx + sx * (half + 0.95), CY, gz - 0.62], Math.PI, 0.82);

  // colliders
  for (const sx of [-1, 1]) {
    acc.box({ x: gx + sx * px, z: gz, w: 0.86, d: 0.86, y0: CY - 0.3, y1: CY + H + 0.5, tag: 'gate' });
    acc.box({ x: gx + sx * (half + 0.15), z: gz + 0.18, w: 0.5, d: 0.5, y0: CY - 0.3, y1: CY + 1.7, tag: 'gate' });
    acc.box({ x: gx + sx * (half + 0.95), z: gz - 0.62, w: 0.6, d: 0.85, y0: CY - 0.3, y1: CY + 1.4, tag: 'statue' });
  }
  acc.lamps.push({ x: gx - half - 0.45, y: CY + beamY - 0.5, z: gz - 0.4, color: 0xff9a50, intensity: 4, distance: 7 });
  acc.lamps.push({ x: gx + half + 0.45, y: CY + beamY - 0.5, z: gz - 0.4, color: 0xff9a50, intensity: 4, distance: 7 });
}
