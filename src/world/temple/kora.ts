// The Lingkhor kora around the Tsuglagkhang: prayer-wheel shelters on the inner (right-hand, clockwise)
// side, a mani lhakhang with one big wheel, mani-stone piles, little whitewashed chortens, carved and
// painted boulders, a juniper burner, a sitting place with khatas on its railing, flag poles carrying lungta
// over and beside the path and down the hillside, and bushes and rocks along the way.
import { IcosahedronGeometry } from 'three';
import type { V3 } from '../../core/geom';
import { PAL } from '../../core/palette';
import { pick, range, type Rng } from '../../core/math';
import { roadFrame, roadLength } from '../layout';
import { groundY, roadQuery } from '../terrain';
import { bench, railing, railingColliders } from '../../kit/street';
import { flagFan } from '../../kit/street';
import type { Acc } from './acc';
import { KORA, STAIRS, insideEnclosure } from './site';
import { INK, WHITEWASH, chorten, jitter, shade } from './util';
import { lampCup } from './lampHouse';

const HALF = KORA.width / 2;
let koraWheelN = 0;
const KLEN = roadLength(KORA);

interface Spot { x: number; z: number; y: number; yaw: number; tx: number; tz: number; nx: number; nz: number }

/** Point at arc length s, `lat` metres to the right (+, toward the court) of the centre line. */
function at(s: number, lat: number): Spot {
  const f = roadFrame(KORA, ((s % KLEN) + KLEN) % KLEN);
  const x = f.x + f.nx * lat, z = f.z + f.nz * lat;
  return { x, z, y: groundY(x, z), yaw: f.yaw, tx: f.tx, tz: f.tz, nx: f.nx, nz: f.nz };
}

/** Occupancy of big kora features, so scatter (bushes / rocks) keeps clear of them. */
const busy: { x: number; z: number; r: number }[] = [];
const free = (x: number, z: number, r: number) => busy.every((b) => Math.hypot(b.x - x, b.z - z) > b.r + r);
const claim = (x: number, z: number, r: number) => busy.push({ x, z, r });

/** True if anything within `rad` of (x, z) is inside the enclosure (wall, deck). */
function nearWall(x: number, z: number, rad: number) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (insideEnclosure(x + Math.cos(a) * rad, z + Math.sin(a) * rad)) return true;
  }
  return insideEnclosure(x, z);
}

/** Lowest ground in a small footprint. */
function minGround(x: number, z: number, rad: number) {
  let m = Infinity;
  for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad], [rad, rad], [-rad, -rad], [rad, -rad], [-rad, rad]]) m = Math.min(m, groundY(x + dx, z + dz));
  return m;
}

export function buildKora(acc: Acc) {
  busy.length = 0;
  koraWheelN = 0;
  for (const s of STAIRS) {
    claim((s.foot[0] + s.top[0]) / 2, (s.foot[1] + s.top[1]) / 2, Math.hypot(s.foot[0] - s.top[0], s.foot[1] - s.top[1]) / 2 + 1.4);
  }
  // prayer-wheel shelters on the inner side (east, south, west legs)
  shelter(acc, 38.5, 1, 5);
  shelter(acc, 73.5, 2, 5);
  shelter(acc, 124.5, 3, 5);
  maniLhakhang(acc, 97.5);
  sittingPlace(acc, 87.0);
  juniperBurner(acc, 80.6);
  // mani-stone piles and little chortens, all on the inner (right-hand) side so a pilgrim walking clockwise
  // passes them on the right; spots are chosen where the strip between path and enclosure is wide enough
  // and clear of the shelters, the burner and the stairways
  const r = acc.r;
  for (const [s, lat] of [[27, 2.4], [48.5, 2.6], [67.8, 2.2], [89.5, 2.3], [139, 2.4], [147.5, 2.3], [166.5, 2.2]] as const) maniPile(acc, s, lat, r);
  for (const [s, lat] of [[31, 2.8], [52, 2.8], [92.5, 2.6], [102.6, 2.4], [143.5, 2.6]] as const) koraChorten(acc, s, lat);
  // carved / painted boulders
  for (const [s, lat, k] of [[53, -3.0, 0], [111, -3.1, 1], [137, -3.2, 2], [16, -3.0, 1]] as const) carvedRock(acc, s, lat, k);
  koraFlags(acc, r);
  scatter(acc, r);
}

// ---- shelters ------------------------------------------------------------------------------------------
function shelter(acc: Acc, s: number, idx: number, n: number) {
  const B = acc.big;
  const len = n * 0.72 + 0.6;
  const c = at(s, HALF + 1.15);         // wheel line, just off the path edge
  const back = at(s, HALF + 2.0);       // back wall line
  const yaw = Math.atan2(-c.nx, -c.nz);  // shelter front faces the path (local +z = toward the path)
  const base = minGround(back.x, back.z, len / 2 + 0.3);
  const fy = Math.max(c.y, groundY(c.x, c.z));
  claim(c.x, c.z, len / 2 + 1.2);
  // local frame: origin on the wheel line, +z toward the path, x along the path
  const gx = c.x, gz = c.z;
  B.group([gx, 0, gz], yaw, () => {
    // stone plinth from the slope up to the path level
    B.box(len + 0.4, fy + 0.15 - (base - 0.3), 1.7, [0, (fy + 0.15 + base - 0.3) / 2, -0.55], PAL.stoneStep);
    // back wall
    B.box(len + 0.3, 1.2, 0.3, [0, fy + 0.15 + 0.6, -0.95], WHITEWASH);
    B.box(len + 0.36, 0.1, 0.36, [0, fy + 0.15 + 1.25, -0.95], PAL.templeMaroon);
    // end posts + roof
    for (const sx of [-1, 1]) {
      B.box(0.16, 2.35, 0.16, [sx * (len / 2 + 0.05), fy + 0.15 + 1.17, -0.95], PAL.templeMaroon);
      B.box(0.14, 2.1, 0.14, [sx * (len / 2 + 0.05), fy + 0.15 + 1.05, 0.45], PAL.templeMaroon);
    }
    B.box(len + 0.3, 0.14, 0.14, [0, fy + 0.15 + 2.12, 0.45], PAL.templeRed);
    B.groupEuler([0, fy + 0.15 + 2.32, -0.25], [-0.17, 0, 0], () => {
      B.box(len + 0.7, 0.05, 2.0, [0, 0, 0], idx % 2 ? PAL.roofRed : PAL.roofGreen);
      for (let x = -len / 2 - 0.3; x <= len / 2 + 0.3; x += 0.3) B.box(0.05, 0.04, 2.0, [x, 0.03, 0], shade(idx % 2 ? PAL.roofRed : PAL.roofGreen, 0.14));
    });
    // wheel rails + pins
    for (const y of [0.42, 1.24]) B.box(len, 0.07, 0.3, [0, fy + 0.15 + y, 0], PAL.templeMaroon);
    // little painted valance on the front beam (lungta order)
    for (let i = 0; i < Math.round((len + 0.3) / 0.3); i++) B.box(0.26, 0.18, 0.03, [-len / 2 - 0.15 + 0.15 + i * 0.3, fy + 0.15 + 1.96, 0.53], PAL.lungta[i % 5]);
  });
  // wheels
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + 0.3 + 0.36 + i * 0.72;
    const wx = gx + lx * Math.cos(yaw), wz = gz - lx * Math.sin(yaw);
    acc.wheels.push({ id: `kora-wheel-${++koraWheelN}`, group: 'kora', x: wx, y: fy + 0.15 + 0.83, z: wz, scale: 1.12, use: [wx + c.nx * -0.9, fy, wz + c.nz * -0.9] });
  }
  // colliders: plinth (top standable, it is the path level), back wall, wheel row
  acc.box({ x: gx + c.nx * 0.55, z: gz + c.nz * 0.55, w: len + 0.4, d: 1.7, rot: yaw, y0: base - 0.3, y1: fy + 0.15, tag: 'shelter' });
  acc.box({ x: gx + c.nx * 0.95, z: gz + c.nz * 0.95, w: len + 0.3, d: 0.3, rot: yaw, y0: base - 0.3, y1: fy + 1.45, tag: 'shelter' });
  acc.box({ x: gx, z: gz, w: len, d: 0.55, rot: yaw, y0: fy, y1: fy + 1.32, tag: 'wheels' });
  // a bulb
  acc.lamps.push({ x: gx + c.nx * -0.2, y: fy + 2.0, z: gz + c.nz * -0.2, color: PAL.lampWarm, intensity: 2.5, distance: 6 });
  B.box(0.12, 0.12, 0.12, [gx - c.nx * -0.1, fy + 2.05, gz - c.nz * -0.1], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.4 });
}

/**
 * Small mani lhakhang with one big wheel, open toward the path. It stands on the inner (right-hand) side so a
 * pilgrim walking clockwise passes it on the right; its open front is turned toward the oncoming pilgrims.
 */
function maniLhakhang(acc: Acc, s: number, side = 1) {
  const B = acc.big;
  const c = at(s, side * (HALF + 2.1));
  // front: toward the path, turned to greet the pilgrims coming along it (and the default camera)
  let fx = -side * c.nx - 0.7 * c.tx, fz = -side * c.nz - 0.7 * c.tz;
  const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
  const yaw = Math.atan2(fx, fz);
  const base = minGround(c.x, c.z, 1.8);
  const path = at(s, 0).y;
  const fy = Math.max(path, groundY(c.x, c.z)) + 0.26; // one low step up (≤ 0.4 so the boy steps in)
  claim(c.x, c.z, 2.4);
  const W = 2.6, D = 2.4, H = 2.7;
  B.group([c.x, 0, c.z], yaw, () => {
    B.box(W + 0.3, fy - (base - 0.3), D + 0.3, [0, (fy + base - 0.3) / 2, 0], PAL.stoneStep);
    // three walls (open front), whitewashed, maroon frieze, flat roof with a gilded finial
    B.box(W, H, 0.25, [0, fy + H / 2, -D / 2 + 0.125], WHITEWASH);
    for (const sx of [-1, 1]) B.box(0.25, H, D, [sx * (W / 2 - 0.125), fy + H / 2, 0], WHITEWASH);
    B.box(W + 0.1, 0.4, D + 0.1, [0, fy + H + 0.2, 0], PAL.pema);
    B.box(W + 0.4, 0.12, D + 0.4, [0, fy + H + 0.46, 0], shade(PAL.templeMaroon, -0.3));
    B.box(W + 0.1, 0.06, 0.4, [0, fy + H - 0.05, D / 2 - 0.2], PAL.templeRed);
    B.box(0.6, 0.3, 0.6, [0, fy + H + 0.67, 0], PAL.templeRed);
    B.cone(0.42, 0.45, [0, fy + H + 0.82, 0], PAL.gold, 4);
    B.cyl(0.05, 0.08, 0.3, [0, fy + H + 1.25, 0], PAL.gold, 6);
    // painted lintel over the opening
    for (let i = 0; i < 8; i++) B.box(0.26, 0.14, 0.04, [-W / 2 + 0.3 + i * 0.29, fy + H - 0.24, D / 2], [PAL.templeBlue, PAL.templeGreen, PAL.templeYellow, PAL.templeRed][i % 4]);
    // axle frame for the big wheel
    B.box(0.1, H - 0.2, 0.1, [0, fy + (H - 0.2) / 2, -0.15 - 0.62], INK);
    B.box(0.5, 0.08, 0.9, [0, fy + 2.15, -0.25], PAL.templeMaroon);
    B.box(0.5, 0.12, 0.5, [0, fy + 0.06, -0.15], PAL.templeMaroon);
  });
  acc.wheels.push({ id: `kora-wheel-${++koraWheelN}`, group: 'kora', x: c.x - Math.sin(yaw) * 0.15, y: fy + 1.12, z: c.z - Math.cos(yaw) * 0.15, scale: 2.5, use: [c.x + fx * 1.4, fy, c.z + fz * 1.4] });
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const toW = (lx: number, lz: number) => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs] as const;
  const [bx, bz] = toW(0, -D / 2 + 0.125);
  acc.box({ x: bx, z: bz, w: W, d: 0.25, rot: yaw, y0: base - 0.3, y1: fy + H + 0.5, tag: 'building' });
  for (const sx of [-1, 1]) {
    const [wx, wz] = toW(sx * (W / 2 - 0.125), 0);
    acc.box({ x: wx, z: wz, w: 0.25, d: D, rot: yaw, y0: base - 0.3, y1: fy + H + 0.5, tag: 'building' });
  }
  acc.box({ x: c.x, z: c.z, w: W + 0.3, d: D + 0.3, rot: yaw, y0: base - 0.3, y1: fy, tag: 'plinth' });
  acc.circles.push({ x: c.x + Math.sin(yaw) * -0.15, z: c.z + Math.cos(yaw) * -0.15, r: 0.62, y0: fy, y1: fy + 2.2 });
  acc.lamps.push({ x: c.x + fx * 0.6, y: fy + 2.2, z: c.z + fz * 0.6, color: PAL.lampWarm, intensity: 3, distance: 6 });
}

/** Outer-side sitting place over the valley: a stone terrace, two benches, a railing hung with khatas. */
function sittingPlace(acc: Acc, s: number) {
  const S = acc.small, F = acc.fine;
  const c = at(s, -(HALF + 2.0));
  const yaw = Math.atan2(-c.nx, -c.nz); // benches look away from the path (out over the valley)
  const path = at(s, 0).y;
  const base = minGround(c.x, c.z, 2.2);
  claim(c.x, c.z, 2.8);
  const W = 4.4, D = 2.4, top = path + 0.3;
  S.group([c.x, 0, c.z], yaw, () => {
    S.box(W, top - (base - 0.3), D, [0, (top + base - 0.3) / 2, 0], shade(PAL.stoneStep, -0.06));
    for (let i = 0; i < 6; i++) S.box(0.7, 0.03, D - 0.1, [-W / 2 + 0.4 + i * 0.72, top + 0.01, 0], i % 2 ? PAL.paving : shade(PAL.paving, 0.06));
  });
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const toW = (lx: number, lz: number): [number, number] => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
  for (const lx of [-1.0, 1.0]) {
    const [bx, bz] = toW(lx, -0.2);
    acc.box(bench(S, bx, top, bz, yaw, PAL.woodTrim, { seed: 9 + lx }));
  }
  // railing along the outer edge, with khatas (white scarves) knotted on it
  const [ax, az] = toW(-W / 2 + 0.1, D / 2 - 0.1), [bx2, bz2] = toW(W / 2 - 0.1, D / 2 - 0.1);
  const a: V3 = [ax, top, az], b: V3 = [bx2, top, bz2];
  railing(S, a, b, 1.0, PAL.railing);
  acc.boxes(railingColliders(a, b, 1.0));
  for (const lx of [-W / 2 + 0.1, W / 2 - 0.1]) {
    const [rx, rz] = toW(lx, 0);
    const [r2x, r2z] = toW(lx, D / 2 - 0.1);
    railing(S, [rx, top, rz], [r2x, top, r2z], 1.0, PAL.railing);
    acc.boxes(railingColliders([rx, top, rz], [r2x, top, r2z], 1.0));
  }
  for (let i = 0; i < 9; i++) {
    const lx = -W / 2 + 0.4 + i * 0.47;
    const [kx, kz] = toW(lx, D / 2 - 0.08);
    F.groupEuler([kx, top + 0.8, kz], [0.12, yaw, (i % 3 - 1) * 0.12], () => {
      F.box(0.12, 0.05, 0.08, [0, 0.18, 0], 0xf6f3ea); // knot
      F.box(0.1, 0.5, 0.02, [0.02, -0.08, 0.02], i % 4 ? 0xf6f3ea : 0xefe6c8);
    });
  }
  acc.box({ x: c.x, z: c.z, w: W, d: D, rot: yaw, y0: base - 0.3, y1: top, tag: 'terrace' });
  // a pole with flags fanned out over the valley at one end
  const [px, pz] = toW(-W / 2 - 0.3, D / 2 - 0.2);
  flagPole(acc, px, pz, 4.6, true);
}

function juniperBurner(acc: Acc, s: number) {
  const S = acc.small;
  const c = at(s, HALF + 1.0);
  const y = minGround(c.x, c.z, 0.5);
  claim(c.x, c.z, 0.9);
  S.box(0.8, Math.max(0.3, c.y - y + 0.3), 0.8, [c.x, y + Math.max(0.3, c.y - y + 0.3) / 2 - 0.1, c.z], PAL.stoneStep);
  const top = Math.max(y + 0.2, c.y + 0.2);
  S.taper(0.7, 0.7, 0.5, 0.5, 0.7, [c.x, top, c.z], WHITEWASH);
  S.box(0.52, 0.06, 0.52, [c.x, top + 0.72, c.z], PAL.templeMaroon);
  S.box(0.3, 0.2, 0.06, [c.x - c.nx * -0.36, top + 0.3, c.z - c.nz * -0.36], 0xd2522a, { emit: 0xff6a20, emitIntensity: 1.1 });
  S.cyl(0.1, 0.14, 0.22, [c.x, top + 0.75, c.z], 0x4a4440, 6);
  acc.box({ x: c.x, z: c.z, w: 0.8, d: 0.8, y0: y - 0.3, y1: top + 0.95, tag: 'burner' });
  acc.smoke.push({ x: c.x, y: top + 0.97, z: c.z, n: 8, spread: 0.15, rise: 2.6, size: 0.18 });
}

// ---- mani stones, chortens, carved rocks ------------------------------------------------------------
const MANI_COLS = [PAL.templeBlue, PAL.templeGreen, PAL.templeRed, PAL.templeYellow, 0xf2efe6, PAL.turquoise] as const;
const STONE = [PAL.rock, PAL.rockDark, 0x9a958a, PAL.slateLight, 0x857f74] as const;

function maniPile(acc: Acc, s: number, lat: number, r: Rng) {
  const c = at(s, lat);
  if (!free(c.x, c.z, 0.9) || nearWall(c.x, c.z, 0.9)) return;
  claim(c.x, c.z, 1.0);
  const F = acc.small;
  const y0 = minGround(c.x, c.z, 0.7) - 0.05;
  // a low cairn of flat slabs, the top ones painted with mantras
  let y = y0;
  const layers = 5 + Math.floor(r() * 4);
  for (let l = 0; l < layers; l++) {
    const k = 1 - l / (layers + 1);
    const cnt = Math.max(1, Math.round(4 * k));
    for (let i = 0; i < cnt; i++) {
      const w = range(r, 0.3, 0.55) * (0.6 + k * 0.5), d = range(r, 0.22, 0.4) * (0.6 + k * 0.5), h = range(r, 0.06, 0.1);
      const ox = (r() - 0.5) * 0.9 * k, oz = (r() - 0.5) * 0.7 * k;
      const painted = l >= layers - 3 || r() < 0.25;
      F.groupEuler([c.x + ox, y + h / 2, c.z + oz], [(r() - 0.5) * 0.12, r() * 3.1, (r() - 0.5) * 0.12], () => {
        F.box(w, h, d, [0, 0, 0], jitter(r, pick(r, STONE), 0.05));
        if (painted) {
          F.box(w * 0.86, 0.012, d * 0.7, [0, h / 2 + 0.004, 0], pick(r, MANI_COLS));
          // a line of 1-px "letters"
          for (let j = 0; j < 4; j++) F.box(0.04, 0.014, 0.03, [-w * 0.3 + j * w * 0.2, h / 2 + 0.01, 0], 0xf6f3ea);
        }
      });
    }
    y += 0.075;
  }
  // upright carved mani slabs leaning on the cairn
  for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
    const a = r() * Math.PI * 2;
    F.groupEuler([c.x + Math.sin(a) * 0.5, y0 + 0.22, c.z + Math.cos(a) * 0.5], [-0.25, a, 0], () => {
      F.box(0.42, 0.46, 0.07, [0, 0, 0], jitter(r, PAL.slate, 0.06));
      F.box(0.34, 0.08, 0.02, [0, 0.12, 0.04], pick(r, MANI_COLS));
      F.box(0.34, 0.08, 0.02, [0, 0.0, 0.04], pick(r, MANI_COLS));
      F.box(0.34, 0.08, 0.02, [0, -0.12, 0.04], pick(r, MANI_COLS));
    });
  }
  // a butter-lamp cup and a khata on top
  lampCup(acc.fine, c.x, y + 0.1, c.z, 0.9);
  acc.fine.box(0.1, 0.03, 0.5, [c.x + 0.12, y + 0.02, c.z], 0xf6f3ea);
  acc.circles.push({ x: c.x, z: c.z, r: 0.6, y0: y0 - 0.2, y1: y });
}

function koraChorten(acc: Acc, s: number, lat: number) {
  const c = at(s, lat);
  if (!free(c.x, c.z, 0.8) || nearWall(c.x, c.z, 0.95)) return;
  claim(c.x, c.z, 1.0);
  const y = minGround(c.x, c.z, 0.6);
  acc.small.box(1.2, 0.5, 1.2, [c.x, y + 0.05, c.z], PAL.stoneStep);
  const side = Math.sign(lat) || 1;
  chorten(acc.small, [c.x, y + 0.3, c.z], 1.7, Math.atan2(-c.nx * side, -c.nz * side)); // niche faces the path
  acc.box({ x: c.x, z: c.z, w: 1.1, d: 1.1, rot: c.yaw, y0: y - 0.3, y1: y + 2.0, tag: 'chorten' });
  // a fan of lungta from its spire to the ground, spread away from the path (never across it) and kept off
  // the enclosure wall
  const away = Math.atan2(c.nz * side, c.nx * side);
  for (const l of flagFan([c.x, y + 2.0, c.z], 4, 2.4, { a0: away - 1.25, a1: away + 1.25, age: 0.35, size: 0.18, spacing: 0.26, seed: Math.round(s * 10) })) {
    const [bx, , bz] = l.b;
    if (insideEnclosure(bx + c.nx * 0.7, bz + c.nz * 0.7) || roadQuery(bx, bz).edge < 0.3) continue;
    acc.flags.push(l);
  }
}

function carvedRock(acc: Acc, s: number, lat: number, kind: number) {
  const c = at(s, lat);
  if (!free(c.x, c.z, 1.2)) return;
  claim(c.x, c.z, 1.5);
  const B = acc.small, r = acc.r;
  const y = minGround(c.x, c.z, 0.9) - 0.2;
  const face = Math.atan2(-c.nx * Math.sign(lat), -c.nz * Math.sign(lat)); // painted face turned to the path
  B.group([c.x, y, c.z], face, () => {
    // boulder: overlapping faceted lumps, with a dressed flat face toward the path for the painting
    const lump = (r0: number, sx: number, sy: number, sz: number, at: V3, col: number, rot: V3) => {
      const g = new IcosahedronGeometry(r0, 0);
      g.scale(sx, sy, sz);
      B.add(g, col, at, { rot });
    };
    lump(1.05, 1.0, 0.85, 0.72, [0, 0.8, -0.15], jitter(r, PAL.rock, 0.04), [0, 0, 0]);
    lump(0.62, 1.1, 0.8, 1.0, [0.62, 1.35, -0.45], jitter(r, PAL.rockDark, 0.04), [0.4, 0.7, 0.2]);
    lump(0.55, 1.2, 0.7, 1.0, [-0.78, 0.35, 0.0], jitter(r, 0x9a958a, 0.04), [0.2, 1.1, 0.1]);
    lump(0.3, 1, 0.8, 1, [0.9, 0.2, 0.45], jitter(r, PAL.rockDark, 0.04), [0.5, 0.3, 0.4]);
    B.box(1.25, 1.05, 0.36, [0, 0.95, 0.42], jitter(r, 0x7a756c, 0.03));
    // lichen / moss specks
    for (let i = 0; i < 5; i++) B.box(0.12, 0.05, 0.12, [(r() - 0.5) * 1.4, 1.55 + r() * 0.15, (r() - 0.5) * 0.8], r() < 0.5 ? PAL.moss : 0xb7a95a);
    B.box(1.3, 1.1, 0.02, [0, 0.95, 0.6], 0x6f6a62);
    if (kind === 0) {
      // Buddha (Shakyamuni) in relief: green halo, gold body, red robe, blue hair, lotus seat
      B.box(0.8, 0.8, 0.04, [0, 1.05, 0.62], PAL.templeGreen);
      B.box(0.5, 0.5, 0.04, [0, 1.12, 0.64], PAL.templeBlue);
      B.box(0.22, 0.24, 0.04, [0, 1.25, 0.66], PAL.gold);
      B.box(0.12, 0.08, 0.04, [0, 1.38, 0.68], PAL.templeBlue);
      B.box(0.5, 0.36, 0.04, [0, 0.92, 0.66], PAL.templeRed);
      B.box(0.18, 0.12, 0.04, [0, 0.95, 0.68], PAL.gold);
      B.box(0.7, 0.12, 0.04, [0, 0.68, 0.66], 0xe0a3a0);
    } else if (kind === 1) {
      // OM MANI PADME HUM in six coloured syllables, two rows
      const cols = [0xf2efe6, PAL.templeGreen, PAL.templeYellow, PAL.templeBlue, PAL.templeRed, 0x2a2a2a];
      for (let i = 0; i < 6; i++) {
        B.box(0.16, 0.24, 0.04, [-0.45 + i * 0.18, 1.18, 0.62], cols[i]);
        B.box(0.18, 0.04, 0.04, [-0.45 + i * 0.18, 1.32, 0.63], cols[i]);
        B.box(0.12, 0.16, 0.04, [-0.45 + i * 0.18, 0.82, 0.62], cols[(i + 3) % 6]);
      }
    } else {
      // Green Tara: green body, white halo ring, lotus
      B.box(0.78, 0.86, 0.04, [0, 1.02, 0.62], 0xf2efe6);
      B.box(0.6, 0.7, 0.04, [0, 1.02, 0.64], PAL.templeBlue);
      B.box(0.26, 0.26, 0.04, [0, 1.22, 0.66], PAL.templeGreen);
      B.box(0.42, 0.34, 0.04, [0, 0.9, 0.66], PAL.templeGreen);
      B.box(0.1, 0.1, 0.04, [0.2, 1.0, 0.68], 0xe0a3a0);
      B.box(0.6, 0.1, 0.04, [0, 0.7, 0.66], PAL.templeRed);
    }
    // khatas draped over the top
    B.box(0.12, 0.04, 1.0, [0.2, 1.82, 0.0], 0xf6f3ea);
    B.box(0.12, 0.5, 0.03, [0.2, 1.58, 0.52], 0xf6f3ea);
  });
  acc.circles.push({ x: c.x, z: c.z, r: 1.0, y0: y - 0.2, y1: y + 1.8 });
  // a lamp cup at its foot
  lampCup(acc.fine, c.x - c.nx * Math.sign(lat) * -0.9, minGround(c.x, c.z, 0.2) + 0.11, c.z - c.nz * Math.sign(lat) * -0.9, 1);
}

// ---- prayer flags --------------------------------------------------------------------------------------
/** Wooden flag pole with a little white-and-gold top; returns the top point. */
function flagPole(acc: Acc, x: number, z: number, h: number, fan = false): V3 {
  const y = minGround(x, z, 0.15);
  const P = acc.small;
  P.cyl(0.055, 0.075, h, [x, y - 0.2, z], PAL.barkLight, 6);
  P.box(0.16, 0.12, 0.16, [x, y + h - 0.2, z], WHITEWASH);
  P.cone(0.07, 0.2, [x, y + h - 0.08, z], PAL.gold, 5);
  P.box(0.3, 0.28, 0.3, [x, y - 0.06, z], PAL.rockDark); // stones piled round the foot
  acc.box({ x, z, w: 0.3, d: 0.3, y0: y - 0.2, y1: y + h, tag: 'pole' });
  claim(x, z, 0.4);
  const top: V3 = [x, y + h - 0.3, z];
  if (fan) for (const l of flagFan(top, 5, 6.5, { a0: 0.25, a1: Math.PI - 0.25, age: 0.3, seed: Math.round(x * 13 + z) })) acc.flags.push(l);
  return top;
}

function koraFlags(acc: Acc, r: Rng) {
  // poles on the outer side every ~9 m, lungta over the path to the inner side and fans down the hill
  let prev: V3 | null = null;
  for (let s = 4; s < KLEN - 3; s += 8.5 + r() * 2) {
    const o = at(s, -(HALF + 0.7 + r() * 0.6));
    if (roadQuery(o.x, o.z).edge < 0.25 || !free(o.x, o.z, 0.3)) { prev = null; continue; }
    const top = flagPole(acc, o.x, o.z, 4.2 + r() * 1.2);
    // over the path: to a pole on the inner side, or to the parapet if the wall is close
    const i = at(s + 1.5, HALF + 0.7 + r() * 0.5);
    if (insideEnclosure(i.x, i.z)) {
      // tie it to the parapet top
      acc.flags.push({ a: top, b: [i.x, -7.1, i.z], sag: 0.35, age: 0.3 + r() * 0.3, seed: Math.round(s * 7) });
    } else if (roadQuery(i.x, i.z).edge > 0.25 && free(i.x, i.z, 0.3)) {
      const t2 = flagPole(acc, i.x, i.z, 3.4 + r() * 0.8);
      acc.flags.push({ a: top, b: t2, sag: 0.3, age: 0.2 + r() * 0.4, seed: Math.round(s * 7) });
    }
    // beside the path: chain to the previous outer pole
    if (prev && Math.hypot(prev[0] - top[0], prev[2] - top[2]) < 13) acc.flags.push({ a: prev, b: top, sag: 0.45, age: 0.3 + r() * 0.4, seed: Math.round(s * 11) });
    // down the hillside: long lines fanning outward
    const out = Math.atan2(-o.nz, -o.nx);
    if (r() < 0.75) for (const l of flagFan(top, 2 + Math.floor(r() * 2), 7 + r() * 3, { a0: out - 0.6, a1: out + 0.6, age: 0.45, seed: Math.round(s * 17) })) acc.flags.push(l);
    prev = top;
  }
}

// ---- scatter: bushes and rocks along the corridor ---------------------------------------------------
function scatter(acc: Acc, r: Rng) {
  const P = acc.small;
  const greens = [PAL.grassDeep, PAL.moss, PAL.deodarLight, 0x5a7a34] as const;
  for (let s = 1; s < KLEN - 1; s += 1.6 + r() * 2.2) {
    const side = r() < 0.6 ? -1 : 1;
    const lat = side * (HALF + 0.5 + r() * 3.0);
    const p = at(s, lat);
    if (roadQuery(p.x, p.z).edge < 0.3 || insideEnclosure(p.x, p.z) || !free(p.x, p.z, 0.5)) continue;
    // keep clear of the enclosure wall (deck colliders end on its face)
    if (insideEnclosure(p.x + p.nx * 0.8, p.z + p.nz * 0.8) && side > 0) continue;
    const y = groundY(p.x, p.z);
    if (r() < 0.62) {
      // bush: 2–4 faceted clumps
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const g = new IcosahedronGeometry(0.28 + r() * 0.3, 0);
        g.scale(1, 0.75, 1);
        P.add(g, jitter(r, pick(r, greens), 0.07), [p.x + (r() - 0.5) * 0.7, y + 0.15 + r() * 0.2, p.z + (r() - 0.5) * 0.7], { rot: [r(), r() * 3, r()] });
      }
      if (r() < 0.3) P.box(0.1, 0.1, 0.1, [p.x, y + 0.5, p.z], r() < 0.5 ? PAL.rhodo : 0xe9b52a); // a flower
      claim(p.x, p.z, 0.6);
    } else {
      // rock
      const w = 0.3 + r() * 0.6;
      P.groupEuler([p.x, y + w * 0.2, p.z], [r() * 0.3, r() * 3, r() * 0.3], () => P.box(w, w * 0.6, w * 0.8, [0, 0, 0], jitter(r, pick(r, STONE), 0.05)));
      if (w > 0.6) acc.circles.push({ x: p.x, z: p.z, r: w * 0.4, y0: y - 0.2, y1: y + w * 0.45 });
      claim(p.x, p.z, w * 0.6);
    }
  }
}

