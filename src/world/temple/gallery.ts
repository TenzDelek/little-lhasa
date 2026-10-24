// Prayer-wheel gallery along the east side of the courtyard: a long lean-to roof of green tin on maroon
// posts, a low whitewashed back wall, and a continuous row of red-and-gold wheels at hand height facing west.
import { PAL } from '../../core/palette';
import type { Acc } from './acc';
import { CY, GALLERY } from './site';
import { BEAM_COLORS, INK, WHITEWASH, paintRow, shade } from './util';

export const WHEEL_Y = 1.0; // wheel centre above the floor

export function buildGallery(acc: Acc) {
  const G = GALLERY, B = acc.big, S = acc.small;
  const xf = G.xFront, xb = G.xBack, xw = G.xWheel;
  const z0 = G.z0, z1 = G.z1, L = z1 - z0, zc = (z0 + z1) / 2;
  const n = 36;
  const pitch = (L - 1.2) / (n - 1);

  // ---- floor: a raised stone walkway strip with a kerb
  // a worn line of darker flags where the pilgrims walk, and a low kerb under the wheel frame
  for (let z = z0 + 0.3; z < z1 - 0.3; z += 1.4 + ((z * 7.31) % 1) * 1.2) S.box(0.9, 0.012, 0.6, [xw - 1.0, CY + 0.006, z], 0x8a8478);
  S.box(0.5, 0.1, L - 0.2, [xw + 0.05, CY + 0.05, zc], PAL.curb);

  // ---- back wall (low, so the wheels read from every side)
  B.box(0.36, 0.8, L, [xb - 0.2, CY + 0.4, zc], WHITEWASH);
  B.box(0.42, 0.1, L + 0.04, [xb - 0.2, CY + 0.85, zc], PAL.templeMaroon);
  B.box(0.37, 0.1, L, [xb - 0.2, CY + 0.12, zc], 0xb8b2a3);

  // ---- wheel frame: bottom and top rails, axle pins, little bay dividers
  const railW = 0.34;
  for (const y of [WHEEL_Y - 0.36, WHEEL_Y + 0.4]) {
    B.box(railW, 0.08, L - 0.4, [xw, CY + y, zc], PAL.templeMaroon);
    B.box(railW + 0.02, 0.025, L - 0.4, [xw, CY + y + 0.05, zc], PAL.gold);
  }
  B.box(0.1, WHEEL_Y - 0.36, L - 0.4, [xw + 0.05, CY + (WHEEL_Y - 0.36) / 2, zc], shade(PAL.templeMaroon, -0.2));
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.6 + i * pitch;
    B.box(0.03, 0.12, 0.03, [xw, CY + WHEEL_Y - 0.33, z], INK);
    B.box(0.03, 0.1, 0.03, [xw, CY + WHEEL_Y + 0.35, z], INK);
    acc.wheels.push({
      id: `temple-wheel-${i + 1}`, group: 'temple',
      x: xw, y: CY + WHEEL_Y, z, scale: 1,
      use: [xf + 0.6, CY, z],
    });
  }
  for (let k = 0; k <= 6; k++) {
    const z = z0 + 0.6 + (k * 6 - 0.5) * pitch;
    if (k === 0 || k === 6) continue;
    B.box(railW, 0.84, 0.06, [xw, CY + WHEEL_Y + 0.02, z], PAL.templeMaroon);
  }

  // ---- cantilevered lean-to roof: slim posts on the wheel line (between bays) and back posts, diagonal
  // struts, so the walking lane stays open and the wheels read from every camera angle
  const nb = 6, bay = (L - 1.2) / nb;
  const ef = xw - 0.8;                     // front eave line
  const hF = 2.55, hB = 3.1;
  for (let k = 0; k <= nb; k++) {
    const z = z0 + 0.6 + (k * 6 - 0.5) * pitch + (k === 0 ? -0.15 : k === nb ? 0.15 : 0);
    const zz = Math.min(z1 - 0.1, Math.max(z0 + 0.1, z));
    // post on the wheel line
    B.box(0.16, hF + 0.25, 0.16, [xw + 0.05, CY + (hF + 0.25) / 2, zz], PAL.templeMaroon);
    B.box(0.22, 0.1, 0.22, [xw + 0.05, CY + hF + 0.05, zz], PAL.templeBlue);
    // back post
    B.box(0.2, hB, 0.2, [xb - 0.2, CY + hB / 2, zz], PAL.templeMaroon);
    B.box(0.26, 0.1, 0.26, [xb - 0.2, CY + hB - 0.25, zz], PAL.templeBlue);
    acc.box({ x: xb - 0.2, z: zz, w: 0.24, d: 0.24, y0: CY, y1: CY + hB, tag: 'post' });
    // rafter beam from the back post over the wheel post to the front eave, plus a strut
    const rise = hB - hF, run = xb - 0.2 - ef;
    B.groupEuler([(xb - 0.2 + ef) / 2, CY + (hB + hF) / 2 + 0.05, zz], [0, 0, Math.atan2(rise, run)], () => B.box(Math.hypot(run, rise) + 0.2, 0.14, 0.12, [0, 0, 0], PAL.templeRed));
    B.groupEuler([xw - 0.35, CY + hF - 0.25, zz], [0, 0, -0.75], () => B.box(0.07, 0.7, 0.07, [0, 0, 0], PAL.templeMaroon));
  }
  // long beam on the wheel posts, painted toward the lane
  B.box(0.16, 0.2, L - 0.4, [xw + 0.05, CY + hF + 0.2, zc], PAL.templeRed);
  B.group([xw - 0.04, 0, zc], -Math.PI / 2, () => {
    paintRow(B, -L / 2 + 0.2, L / 2 - 0.2, CY + hF + 0.24, 0, 0.08, 0.03, BEAM_COLORS, 0.36, 0.03);
    paintRow(B, -L / 2 + 0.2, L / 2 - 0.2, CY + hF + 0.14, 0, 0.05, 0.03, [PAL.templeYellow, PAL.templeRed], 0.14);
  });
  B.box(0.18, 0.2, L + 0.3, [xb - 0.2, CY + hB + 0.1, zc], PAL.templeRed);
  // roof sheet (tilted) + corrugation ribs + ridge flashing
  const run = xb + 0.25 - ef, rise = hB - hF + 0.04;
  const slope = Math.atan2(rise, run);
  const rx = (xb + 0.25 + ef) / 2, ry = CY + (hF + hB) / 2 + 0.2;
  B.groupEuler([rx, ry, zc], [0, 0, slope], () => {
    const w = Math.hypot(run, rise) + 0.1;
    B.box(w, 0.06, L + 0.7, [0, 0, 0], PAL.roofGreen);
    for (let z = -L / 2 - 0.3; z <= L / 2 + 0.3; z += 0.32) B.box(w, 0.04, 0.06, [0, 0.04, z], shade(PAL.roofGreen, 0.14));
    B.box(0.16, 0.1, L + 0.72, [w / 2 - 0.06, 0.05, 0], shade(PAL.roofGreen, -0.25));
  });
  // fabric valance (lungta colours) along the front eave
  const lungta = PAL.lungta;
  B.group([ef + 0.04, 0, zc], -Math.PI / 2, () => paintRow(B, -L / 2 - 0.3, L / 2 + 0.3, CY + hF + 0.08, 0, 0.24, 0.03, [lungta[0], lungta[1], lungta[2], lungta[3], lungta[4]], 0.28, 0.02));
  // end boards
  for (const z of [z0 - 0.12, z1 + 0.12]) {
    B.box(xb - ef, 0.26, 0.06, [(xb + ef) / 2, CY + hF + 0.42, z], PAL.templeRed);
    B.group([(xb + ef) / 2, 0, z], z < zc ? Math.PI : 0, () => paintRow(B, -(xb - ef) / 2 + 0.1, (xb - ef) / 2 - 0.1, CY + hF + 0.42, 0.04, 0.12, 0.03, BEAM_COLORS, 0.3, 0.03));
  }

  // ---- night bulbs under the roof
  for (const k of [1, 3, 5]) {
    const z = z0 + 0.6 + k * bay;
    B.box(0.03, 0.2, 0.03, [xw - 0.3, CY + hF + 0.05, z], INK);
    B.box(0.14, 0.14, 0.14, [xw - 0.3, CY + hF - 0.1, z], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.5 });
    acc.lamps.push({ x: xw - 0.6, y: CY + hF - 0.4, z, color: PAL.lampWarm, intensity: 3.5, distance: 7 });
  }

  // ---- colliders: the wheel row + back wall (top standable), back posts
  acc.box({ x: xw + 0.1, z: zc, w: 0.7, d: L - 0.2, y0: CY, y1: CY + WHEEL_Y + 0.44, tag: 'wheels' });
  acc.box({ x: xb - 0.2, z: zc, w: 0.36, d: L, y0: CY, y1: CY + 0.9, tag: 'wall' });
}
