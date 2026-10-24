// Prayer-wheel gallery along the east side of the courtyard: a continuous row of red-and-gold wheels at hand
// height, sheltered by a narrow lean-to of green tin, with the walking lane on their EAST side. A pilgrim
// circling the main hall clockwise walks this lane southward, so the wheels (and the hall beyond them) stay on
// the right hand, as they must. The roof only overhangs the wheels and the near edge of the lane, so the row
// reads from the default camera (south-east) and the boy is never lost under it; a low whitewashed back wall
// faces the hall, low enough that the backs of the wheels show from the courtyard too.
import { PAL } from '../../core/palette';
import type { Acc } from './acc';
import { CY, GALLERY } from './site';
import { BEAM_COLORS, INK, WHITEWASH, paintRow, shade } from './util';

export const WHEEL_Y = 1.0; // wheel centre above the floor

// roof profile across the gallery (world x → height above the court): low at the back eave, high over the lane
const EAVE_BACK = 2.35, EAVE_FRONT = 2.85;
const backEaveX = () => GALLERY.xBack - 0.35;
const frontEaveX = () => GALLERY.xWheel + 0.95;
/** Underside of the roof (top of the beams / rafter seats) at world x. */
function roofLine(x: number) {
  const a = backEaveX(), b = frontEaveX();
  return CY + EAVE_BACK + ((x - a) / (b - a)) * (EAVE_FRONT - EAVE_BACK);
}

export function buildGallery(acc: Acc) {
  const G = GALLERY, B = acc.big, S = acc.small, F = acc.fine;
  const xb = G.xBack, xw = G.xWheel;
  const z0 = G.z0, z1 = G.z1, L = z1 - z0, zc = (z0 + z1) / 2;
  const n = G.n, per = G.perBay, nb = Math.round(n / per);
  const pitch = (L - 1.2) / (n - 1);
  const wz = (i: number) => z0 + 0.6 + i * pitch;
  /** z of the k-th bay boundary (0..nb), between wheel groups. */
  const bayZ = (k: number) => (k === 0 ? z0 + 0.15 : k === nb ? z1 - 0.15 : wz(k * per - 0.5));
  const ea = backEaveX(), eb = frontEaveX();
  const slope = Math.atan2(EAVE_FRONT - EAVE_BACK, eb - ea);

  // ---- floor: a worn line of darker flags where the pilgrims walk, a low kerb under the wheel frame
  for (let z = z0 + 0.4; z < z1 - 0.5; z += 1.3 + ((z * 7.31) % 1) * 1.1) S.box(0.8, 0.012, 0.55, [xw + 0.95, CY + 0.006, z], 0x8a8478);
  S.box(0.6, 0.1, L - 0.1, [xw - 0.02, CY + 0.05, zc], PAL.curb);

  // ---- back wall (toward the hall): low, so the backs of the wheels still show above it
  const BW = 0.62;
  B.box(0.3, BW, L, [xb, CY + BW / 2, zc], WHITEWASH);
  B.box(0.36, 0.09, L + 0.04, [xb, CY + BW + 0.045, zc], PAL.templeMaroon);
  B.box(0.31, 0.1, L, [xb, CY + 0.1, zc], 0xb8b2a3);

  // ---- wheel frame: bottom and top rails, axle pins
  const railW = 0.3;
  for (const y of [WHEEL_Y - 0.36, WHEEL_Y + 0.4]) {
    B.box(railW, 0.08, L - 0.3, [xw, CY + y, zc], PAL.templeMaroon);
    // thin gold beading on the lane face only, so the gilded wheel caps read against dark maroon
    B.box(0.03, 0.03, L - 0.3, [xw + railW / 2 + 0.005, CY + y + 0.025, zc], PAL.gold);
  }
  B.box(0.12, WHEEL_Y - 0.36, L - 0.3, [xw, CY + (WHEEL_Y - 0.36) / 2, zc], shade(PAL.templeMaroon, -0.2));
  for (let i = 0; i < n; i++) {
    const z = wz(i);
    B.box(0.03, 0.12, 0.03, [xw, CY + WHEEL_Y - 0.33, z], INK);
    B.box(0.03, 0.1, 0.03, [xw, CY + WHEEL_Y + 0.35, z], INK);
    acc.wheels.push({
      id: `temple-wheel-${i + 1}`, group: 'temple',
      x: xw, y: CY + WHEEL_Y, z, scale: 1,
      use: [xw + 0.8, CY, z],
    });
  }

  // ---- posts between the bays (on the wheel line, they also divide the row), back posts, struts, rafters
  for (let k = 0; k <= nb; k++) {
    const z = bayZ(k);
    const hW = roofLine(xw) - CY, hBk = roofLine(xb) - CY;
    B.box(0.16, hW, 0.16, [xw, CY + hW / 2, z], PAL.templeMaroon);
    B.box(railW + 0.04, 0.06, 0.2, [xw, CY + WHEEL_Y + 0.47, z], PAL.gold);
    B.box(0.22, 0.1, 0.22, [xw, CY + hW - 0.3, z], PAL.templeBlue);
    B.box(0.2, 0.06, 0.2, [xw, CY + hW - 0.38, z], PAL.templeYellow);
    B.box(0.2, hBk, 0.2, [xb, CY + hBk / 2, z], PAL.templeMaroon);
    B.box(0.26, 0.1, 0.26, [xb, CY + hBk - 0.3, z], PAL.templeBlue);
    acc.box({ x: xb, z, w: 0.24, d: 0.24, y0: CY, y1: CY + hBk, tag: 'post' });
    // diagonal strut carrying the overhang toward the lane
    B.groupEuler([xw + 0.38, CY + hW - 0.3, z], [0, 0, -0.75], () => B.box(0.07, 0.75, 0.07, [0, 0, 0], PAL.templeMaroon));
    // rafter on the beams, out to both eaves
    B.groupEuler([(ea + eb) / 2, roofLine((ea + eb) / 2) + 0.07, z], [0, 0, slope], () => B.box((eb - ea + 0.1) / Math.cos(slope), 0.14, 0.12, [0, 0, 0], PAL.templeRed));
  }
  // beams on the post tops; the wheel-line beam is painted on its lane face
  {
    const yW = roofLine(xw), yB = roofLine(xb);
    B.box(0.16, 0.22, L + 0.1, [xw, yW - 0.11, zc], PAL.templeRed);
    B.box(0.18, 0.2, L + 0.1, [xb, yB - 0.1, zc], PAL.templeRed);
    B.group([xw + 0.09, 0, zc], Math.PI / 2, () => {
      paintRow(B, -L / 2, L / 2, yW - 0.07, 0, 0.08, 0.03, BEAM_COLORS, 0.36, 0.03);
      paintRow(B, -L / 2, L / 2, yW - 0.17, 0, 0.05, 0.03, [PAL.templeYellow, PAL.templeRed], 0.14);
    });
  }

  // ---- roof sheet (high side over the lane) + corrugation ribs + dark eave fascias
  {
    const sa = ea - 0.08, sb = eb + 0.08, mx = (sa + sb) / 2;
    B.groupEuler([mx, roofLine(mx) + 0.17, zc], [0, 0, slope], () => {
      const w = (sb - sa) / Math.cos(slope);
      B.box(w, 0.06, L + 0.7, [0, 0, 0], PAL.roofGreen);
      for (let z = -L / 2 - 0.3; z <= L / 2 + 0.3; z += 0.32) B.box(w, 0.04, 0.06, [0, 0.04, z], shade(PAL.roofGreen, 0.14));
      B.box(0.16, 0.1, L + 0.72, [w / 2 - 0.06, 0.05, 0], shade(PAL.roofGreen, -0.25));   // flashing on the high edge
      B.box(0.06, 0.16, L + 0.72, [w / 2 + 0.02, -0.04, 0], shade(PAL.roofGreen, -0.35));
      B.box(0.06, 0.12, L + 0.72, [-w / 2 - 0.02, -0.03, 0], shade(PAL.roofGreen, -0.35));
    });
  }
  // fabric valance (lungta order) under the lane-side eave, facing the lane
  const lungta = PAL.lungta;
  B.group([eb + 0.04, 0, zc], Math.PI / 2, () => paintRow(B, -L / 2 - 0.3, L / 2 + 0.3, roofLine(eb) + 0.03, 0, 0.2, 0.03, [lungta[0], lungta[1], lungta[2], lungta[3], lungta[4]], 0.28, 0.02));
  // end boards following the roof slope
  for (const z of [z0 - 0.1, z1 + 0.1]) {
    const mx = (ea + eb) / 2;
    B.groupEuler([mx, roofLine(mx) - 0.02, z], [0, 0, slope], () => {
      const w = (eb - ea + 0.1) / Math.cos(slope);
      B.box(w, 0.26, 0.06, [0, 0, 0], PAL.templeRed);
      paintRow(B, -w / 2 + 0.1, w / 2 - 0.1, 0, z < zc ? -0.04 : 0.04, 0.12, 0.03, BEAM_COLORS, 0.3, 0.03);
    });
  }
  // board over the north end of the row: OM MANI PADME HUM in six coloured syllables
  {
    const z = z0 - 0.16, x = xw + 0.15, y = roofLine(x) - 0.42;
    B.box(1.3, 0.3, 0.05, [x, y, z], PAL.templeMaroon);
    B.box(1.38, 0.04, 0.07, [x, y + 0.16, z], PAL.gold);
    B.box(1.38, 0.04, 0.07, [x, y - 0.16, z], PAL.gold);
    const cols = [0xf2efe6, PAL.templeGreen, PAL.templeYellow, PAL.templeBlue, PAL.templeRed, PAL.khorloGold];
    for (let i = 0; i < 6; i++) F.box(0.12, 0.14, 0.02, [x - 0.5 + i * 0.2, y, z - 0.035], cols[i]);
  }

  // ---- night bulbs under the lane-side eave
  for (const k of [1, 3, 5]) {
    const z = (bayZ(k - 1) + bayZ(k)) / 2;
    const x = xw + 0.65, by = roofLine(x);
    B.box(0.03, 0.22, 0.03, [x, by - 0.11, z], INK);
    B.box(0.14, 0.14, 0.14, [x, by - 0.29, z], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.5 });
    acc.lamps.push({ x: x + 0.2, y: by - 0.6, z, color: PAL.lampWarm, intensity: 3.5, distance: 7 });
  }

  // ---- colliders: the wheel row (posts included, top standable) and the back wall
  acc.box({ x: xw, z: zc, w: 0.6, d: L - 0.1, y0: CY, y1: CY + WHEEL_Y + 0.44, tag: 'wheels' });
  acc.box({ x: xb, z: zc, w: 0.3, d: L, y0: CY, y1: CY + BW + 0.09, tag: 'wall' });
}

/** Top of the gallery's k-th back post (0 = north end … 6 = south end), for flag lines. */
export function galleryPostTop(k: number): [number, number, number] {
  const G = GALLERY, nb = Math.round(G.n / G.perBay), pitch = (G.z1 - G.z0 - 1.2) / (G.n - 1);
  const z = k <= 0 ? G.z0 + 0.15 : k >= nb ? G.z1 - 0.15 : G.z0 + 0.6 + (k * G.perBay - 0.5) * pitch;
  return [G.xBack, roofLine(G.xBack) + 0.25, z];
}
