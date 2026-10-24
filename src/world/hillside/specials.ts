// Hillside landmarks that are not plain kit buildings: the stepped lane between houses, the overlook at the
// end of Bhagsu Road, the little Hindu shrine on Dharamkot Road and the school with its yard.
import type { Road } from '../layout';
import { roadFrame, roadLength } from '../layout';
import { groundY } from '../terrain';
import { PAL } from '../../core/palette';
import { rng } from '../../core/math';
import type { V3 } from '../../core/geom';
import { bench, pottedPlant, railing, steps, streetLamp, flagChain } from '../../kit/street';
import { makeSign } from '../../kit/sign';
import { type Ctx, footprint, inFrame, wpos } from './ctx';
import { BHAGSU, DHARAMKOT, jit, localBox, roadsideFrame, rod, toWorld } from './util';
import { placeBuilding } from './rows';

const STONE = [PAL.rock, PAL.rockDark, PAL.stoneStep, PAL.slateLight, 0x9a9488] as const;

/** Rubble-stone retaining face (front = +z) on a box x0..x1 at z, from y0 up to y1 (local frame). */
function stoneFace(c: Ctx, x0: number, x1: number, z: number, y0: number, y1: number, seed: number) {
  const r = rng(seed);
  const P = c.bld;
  P.slab(x0, y0, z - 0.3, x1, y1, z, PAL.stoneStep);
  const rows = Math.max(1, Math.round((y1 - y0) / 0.26));
  for (let j = 0; j < rows; j++) {
    let x = x0 + (j % 2 ? 0.15 : 0);
    while (x < x1 - 0.1) {
      const w = 0.32 + r() * 0.3;
      const xa = x, xb = Math.min(x1, x + w);
      const ya = y0 + ((y1 - y0) * j) / rows + 0.02, yb = y0 + ((y1 - y0) * (j + 1)) / rows - 0.02;
      if (r() < 0.55) P.slab(xa + 0.02, ya, z - 0.02, xb - 0.02, yb, z + 0.02, jit(r, STONE[Math.floor(r() * STONE.length)], 0.06));
      x += w;
    }
  }
  P.slab(x0 - 0.03, y1 - 0.06, z - 0.33, x1 + 0.03, y1 + 0.04, z + 0.04, PAL.concrete); // coping
}

// ---- stepped lane: steps up from the road between two houses, a landing, a few steps down behind ------------
export function stairLane(c: Ctx, road: Road, side: 1 | -1, s: number, w: number) {
  const f = roadsideFrame(road, s, side, 0);
  const y0 = f.roadY + 0.02;
  const rise = 1.02;
  const run = 2.7;
  const bot = toWorld(f, 0, -0.6), top = toWorld(f, 0, -0.6 - run);
  c.colliders.push(...steps(c.props, [bot[0], y0, bot[1]], [top[0], y0 + rise, top[1]], w, PAL.stoneStep, { wallColor: PAL.concrete }));
  // landing, then a short flight down to the ground behind
  const lz0 = -0.6 - run, lz1 = lz0 - 1.8;
  const ly = y0 + rise;
  inFrame(c, f, 0, () => {
    c.props.slab(-w / 2 - 0.22, groundY(f.x, f.z) - 0.4, lz1, w / 2 + 0.22, ly, lz0 + 0.02, PAL.stoneStep);
    c.props.slab(-w / 2 - 0.22, ly - 0.03, lz1, w / 2 + 0.22, ly + 0.01, lz0 + 0.02, PAL.curb);
  });
  c.colliders.push(localBox(f, 0, (lz0 + lz1) / 2, w + 0.44, lz0 - lz1, y0 - 0.5, ly, 'landing'));
  const backA = toWorld(f, 0, lz1), backB = toWorld(f, 0, lz1 - 2.2);
  const gy = groundY(backB[0], backB[1]);
  if (ly - gy > 0.25) c.colliders.push(...steps(c.props, [backB[0], gy, backB[1]], [backA[0], ly, backA[1]], w, PAL.stoneStep, { walls: false }));
  // railing on the landing's sides, a little roadside niche with a butter lamp, flags over the lane
  for (const sx of [-w / 2 - 0.12, w / 2 + 0.12]) {
    const a = toWorld(f, sx, lz0), b = toWorld(f, sx, lz1);
    c.colliders.push(railing(c.props, [a[0], ly, a[1]], [b[0], ly, b[1]], 0.85, PAL.railingYellow));
  }
  const n = toWorld(f, w / 2 + 0.3, -0.6 - run * 0.5);
  footprint(c, f, 0, (-0.6 + lz1 - 2.2) / 2, w + 0.6, 0.6 - lz1 + 2.2);
  void n;
}

// ---- the overlook at the end of Bhagsu Road -----------------------------------------------------------------
export function overlook(c: Ctx) {
  const L = roadLength(BHAGSU);
  const s0 = 69.4, s1 = L - 0.2, sm = (s0 + s1) / 2, W = s1 - s0;
  const f = roadsideFrame(BHAGSU, sm, 1, 0);
  const y = f.roadY + 0.05;
  const D = 4.6; // deck depth from the road edge
  const r = rng(707);
  // deck: paved, raised over the falling ground on a rubble-stone wall; edge from 0.5 (props strip) out
  inFrame(c, f, y, () => {
    c.props.slab(-W / 2, -1.2, -D, W / 2, 0, -0.5, PAL.stoneStep);
    c.props.slab(-W / 2 + 0.05, -0.02, -D + 0.05, W / 2 - 0.05, 0.02, -0.55, PAL.paving);
    for (let i = 0; i < 18; i++) {
      const x = -W / 2 + 0.4 + r() * (W - 0.8), z = -0.9 - r() * (D - 1.2);
      c.props.box(0.5 + r() * 0.4, 0.01, 0.4 + r() * 0.3, [x, 0.022, z], r() < 0.5 ? PAL.pavingDark : PAL.curb);
    }
  });
  // rubble face on the outer side and both ends (down to the ground)
  inFrame(c, f, y, () => {
    c.bld.group([0, 0, -D], Math.PI, () => stoneFace(c, -W / 2, W / 2, 0, -1.2, 0, 711));
    c.bld.group([-W / 2, 0, -D / 2 - 0.25], -Math.PI / 2, () => stoneFace(c, -D / 2 + 0.25, D / 2 - 0.25, 0, -1.2, 0, 712));
    c.bld.group([W / 2, 0, -D / 2 - 0.25], Math.PI / 2, () => stoneFace(c, -D / 2 + 0.25, D / 2 - 0.25, 0, -1.2, 0, 713));
  });
  c.colliders.push(localBox(f, 0, -(D + 0.5) / 2, W, D - 0.5, y - 1.5, y, 'deck'));
  // railings: outer edge and both ends
  const P = (lx: number, lz: number): V3 => { const [x, z] = toWorld(f, lx, lz); return [x, y, z]; };
  const corners = [P(-W / 2 + 0.08, -0.7), P(-W / 2 + 0.08, -D + 0.1), P(W / 2 - 0.08, -D + 0.1), P(W / 2 - 0.08, -0.7)];
  for (let i = 0; i < 3; i++) c.colliders.push(railing(c.props, corners[i], corners[i + 1], 1.0, PAL.railing));
  // benches facing the valley (south), a lamp post, potted marigolds, prayer flags across the deck
  for (const bx of [-W / 4, W / 4]) {
    const [x, z] = toWorld(f, bx, -2.6);
    c.colliders.push(bench(c.props, x, y, z, f.yaw + Math.PI, 0x8b5a33, { back: true, len: 1.7 }));
  }
  {
    const [x, z] = toWorld(f, 0, -D + 0.45);
    const L2 = streetLamp(c.props, x, y, z, f.yaw, 'old', 77);
    c.colliders.push(L2.collider); c.lamps.push(L2.lamp);
  }
  for (const [px, pz, k] of [[-W / 2 + 0.4, -D + 0.45, 1], [W / 2 - 0.4, -D + 0.45, 2], [-W / 2 + 0.4, -1.0, 3], [W / 2 - 0.4, -1.0, 4]] as const) {
    const [x, z] = toWorld(f, px, pz);
    c.colliders.push(pottedPlant(c.props, x, y, z, 900 + k, 'marigold', 'terracotta'));
  }
  // flag poles at the two outer corners, a string of lungta between them and down to the road-side corners
  const poleTop = (lx: number, lz: number): V3 => { const [x, z] = toWorld(f, lx, lz); return [x, y + 3.6, z]; };
  for (const lx of [-W / 2 + 0.25, W / 2 - 0.25]) {
    const [x, z] = toWorld(f, lx, -D + 0.25);
    rod(c.props, [x, y, z], [x, y + 3.7, z], 0.07, PAL.barkLight);
    c.circles.push({ x, z, r: 0.08, y0: y, y1: y + 3.7, tag: 'pole' });
  }
  const A = poleTop(-W / 2 + 0.25, -D + 0.25), B = poleTop(W / 2 - 0.25, -D + 0.25);
  c.flags.push(...flagChain([A, B], { age: 0.35, seed: 31, sagFrac: 0.09 }));
  const up = (p: V3, k: number): V3 => [p[0], p[1] + k, p[2]];
  c.flags.push(...flagChain([A, up(corners[0], 1.1)], { age: 0.5, seed: 32 }));
  c.flags.push(...flagChain([B, up(corners[3], 1.1)], { age: 0.5, seed: 33 }));
  // a hand-painted board: BHAGSU 2 KM
  const sg = makeSign({ text: 'BHAGSU 2 KM', bg: PAL.wallWhite, fg: PAL.roofRed, glow: false, h: 0.32 });
  const sp = wpos(f, y, [W / 2 - 1.4, 1.25, -D + 0.18]);
  sg.position.set(sp[0], sp[1], sp[2]); sg.rotation.y = f.yaw;
  c.meshes.push(sg);
  {
    const [x, z] = toWorld(f, W / 2 - 1.4, -D + 0.12);
    rod(c.props, [x, y, z], [x, y + 1.1, z], 0.06, PAL.concreteDark);
  }
  footprint(c, f, 0, -D / 2, W + 0.6, D + 0.4);
  // keep the view down the valley open: no trees in front of the deck, rhododendrons at its ends
  {
    const [cx, cz] = toWorld(f, 0, -D - 7);
    c.clearings.push({ x: cx, z: cz, hw: W / 2 + 3, hd: 7, yaw: f.yaw });
    const [ax, az] = toWorld(f, -W / 2 - 1.4, -D + 0.6);
    c.trees.push({ x: ax, z: az, kind: 'rhodo', scale: 0.95 });
    const [bx2, bz2] = toWorld(f, W / 2 + 1.2, -D - 0.2);
    c.trees.push({ x: bx2, z: bz2, kind: 'rhodo', scale: 0.85 });
    const [ux, uz] = toWorld(f, -1.5, -D - 1.6);
    c.trees.push({ x: ux, z: uz, kind: 'bush', scale: 1.1 });
  }
}

// ---- small Hindu shrine (mandir) on Dharamkot Road -----------------------------------------------------------
export function shrine(c: Ctx, s: number, side: 1 | -1) {
  const f = roadsideFrame(DHARAMKOT, s, side, 1.6);
  const gy = groundY(f.x, f.z);
  const y = Math.max(gy, f.roadY) + 0.05;
  const saffron = 0xd9772e, saffronD = 0xb85e24, red = 0xb83a2a, white = PAL.templeWhite;
  // local: front faces the road (+z); the shrine sits at z = -1.3 behind a small forecourt
  inFrame(c, f, y, () => {
    const B = c.bld, P = c.props;
    // plinth with two steps
    P.slab(-1.25, -0.6, -2.7, 1.25, 0.42, -0.2, white);
    P.slab(-1.27, 0.36, -2.72, 1.27, 0.44, -0.18, saffron);
    P.slab(-0.6, -0.4, -0.2, 0.6, 0.14, 0.12, white);
    P.slab(-0.6, -0.4, -0.2, 0.6, 0.28, -0.04, white);
    // sanctum
    B.slab(-0.8, 0.44, -2.4, 0.8, 1.95, -0.85, saffron);
    B.slab(-0.84, 1.95, -2.44, 0.84, 2.07, -0.81, white);
    B.slab(-0.84, 0.44, -0.86, 0.84, 0.56, -0.8, red);
    // doorway with a black stone lingam on its base, garlands, a brass bell
    B.slab(-0.32, 0.44, -0.84, 0.32, 1.5, -0.8, 0x2a1a14);
    P.cyl(0.13, 0.15, 0.08, [0, 0.46, -1.35], 0x3a3634, 8);
    P.cyl(0.06, 0.07, 0.2, [0, 0.54, -1.35], 0x1d1a1a, 8);
    P.box(0.06, 0.06, 0.06, [0, 0.64, -1.29], 0xe0801e);
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      P.box(0.08, 0.08, 0.06, [-0.36 + t * 0.72, 1.58 - Math.sin(t * Math.PI) * 0.14, -0.77], i % 2 ? 0xe8a82a : 0xe0801e);
    }
    P.cyl(0.07, 0.09, 0.12, [0.48, 1.42, -0.62], PAL.gold, 6);
    rod(P, [0.48, 1.54, -0.62], [0.48, 1.82, -0.62], 0.015, 0x3a3634);
    // shikhara: stacked tapering tiers, amalaka ring, gilded kalash, saffron pennant
    B.taper(1.5, 1.4, 1.1, 1.0, 0.7, [0, 2.07, -1.62], saffron);
    B.taper(1.1, 1.0, 0.75, 0.68, 0.6, [0, 2.77, -1.62], saffronD);
    B.taper(0.75, 0.68, 0.36, 0.34, 0.6, [0, 3.37, -1.62], saffron);
    B.cyl(0.3, 0.3, 0.12, [0, 3.97, -1.62], white, 10);
    B.cyl(0.12, 0.2, 0.22, [0, 4.09, -1.62], PAL.gold, 8);
    B.cone(0.08, 0.22, [0, 4.31, -1.62], PAL.goldDeep, 6);
    rod(P, [0.16, 3.97, -1.62], [0.16, 5.1, -1.62], 0.03, 0x5a3e28);
    P.box(0.02, 0.32, 0.5, [0.16, 4.92, -1.36], saffron, { rot: [0, 0, 0] });
    // trishul by the steps
    rod(P, [-0.95, 0.44, -0.4], [-0.95, 2.0, -0.4], 0.04, 0x3a3634);
    for (const dx of [-0.12, 0, 0.12]) rod(P, [-0.95 + dx, 1.85, -0.4], [-0.95 + dx * 1.2, 2.15, -0.4], 0.03, 0x4a4a4c);
    rod(P, [-1.07, 1.86, -0.4], [-0.83, 1.86, -0.4], 0.03, 0x4a4a4c);
    // offerings: little clay lamps and a marigold heap on the step
    for (let i = 0; i < 3; i++) P.box(0.07, 0.04, 0.07, [-0.3 + i * 0.3, 0.3, 0.02], 0xb4603c, { emit: PAL.butterFlame, emitNight: true, emitIntensity: 1.5 });
    P.box(0.22, 0.08, 0.16, [0.3, 0.31, -0.12], 0xe0801e);
  });
  c.colliders.push(localBox(f, 0, -1.45, 2.5, 2.5, y - 0.6, y + 0.44, 'plinth'));
  c.colliders.push(localBox(f, 0, -1.62, 1.6, 1.55, y + 0.44, y + 4.3, 'shrine'));
  c.colliders.push(localBox(f, 0, -0.05, 1.2, 0.3, y - 0.4, y + 0.28, 'step'));
  footprint(c, f, 0, -1.4, 3.0, 3.2);
  const [lx, lz] = toWorld(f, 0, -0.5);
  c.lamps.push({ x: lx, y: y + 1.0, z: lz, color: PAL.butterFlame, intensity: 2.5, distance: 5, flicker: 0.4 });
  // a big tree shading it (peepal-like broadleaf), and a bush
  const [tx, tz] = toWorld(f, 1.4, -3.9);
  c.trees.push({ x: tx, z: tz, kind: 'oak', scale: 1.2 });
  const [bx, bz] = toWorld(f, -1.9, -2.2);
  c.trees.push({ x: bx, z: bz, kind: 'bush', scale: 1.0 });
}

// ---- school on Dharamkot Road: boundary wall with a gate, a yard with a basketball hoop, the building -------------
export function school(c: Ctx, s0: number, s1: number, side: 1 | -1) {
  const sm = (s0 + s1) / 2, W = s1 - s0;
  const f = roadsideFrame(DHARAMKOT, sm, side, 0.65);
  const y = f.roadY + 0.04;
  const yard = 5.0;
  const gateW = 2.4, gateX = -W / 2 + 3.2;
  const r = rng(1201);
  const wallH = 0.95;
  inFrame(c, f, y, () => {
    const B = c.bld;
    // boundary wall along the road with a gap for the gate
    const seg = (x0: number, x1: number) => {
      B.slab(x0, -0.5, -0.2, x1, wallH, 0, PAL.wallCream);
      B.slab(x0 - 0.02, wallH, -0.22, x1 + 0.02, wallH + 0.06, 0.02, PAL.templeMaroon);
      for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.6) B.slab(x - 0.12, -0.5, -0.24, x + 0.12, wallH + 0.14, 0.04, PAL.wallCream);
    };
    seg(-W / 2, gateX - gateW / 2 - 0.3);
    seg(gateX + gateW / 2 + 0.3, W / 2);
    // side walls back to the building
    for (const sx of [-W / 2, W / 2]) B.slab(sx - 0.1, -0.5, -yard, sx + 0.1, wallH, 0, PAL.wallCream);
    // gate pillars + arch
    for (const sx of [gateX - gateW / 2 - 0.15, gateX + gateW / 2 + 0.15]) {
      B.slab(sx - 0.18, -0.5, -0.3, sx + 0.18, 2.5, 0.06, PAL.wallYellow);
      B.slab(sx - 0.22, 2.5, -0.34, sx + 0.22, 2.62, 0.1, PAL.templeMaroon);
    }
    B.slab(gateX - gateW / 2 - 0.3, 2.62, -0.2, gateX + gateW / 2 + 0.3, 2.74, -0.04, PAL.templeMaroon);
    // yard: a basketball hoop on a pole, a blackboard on the side wall, a bench
    const P = c.props;
    const hx = W / 2 - 1.6;
    rod(P, [hx, 0, -1.2], [hx, 2.9, -1.2], 0.1, PAL.railing);
    rod(P, [hx, 2.9, -1.2], [hx - 0.4, 3.05, -1.2], 0.08, PAL.railing);
    P.box(1.1, 0.75, 0.05, [hx - 0.45, 3.2, -1.2], PAL.wallWhite, { rot: [0, Math.PI / 2, 0] });
    P.box(0.5, 0.4, 0.06, [hx - 0.47, 3.12, -1.2], PAL.roofRed, { rot: [0, Math.PI / 2, 0] });
    P.cyl(0.24, 0.24, 0.03, [hx - 0.75, 2.95, -1.2], 0xe07a2e, 10);
    P.box(0.22, 0.22, 0.22, [hx - 2.2, 0.11, -2.4], 0xc8641c, { rot: [0.3, 0.5, 0] }); // a ball
    P.box(1.6, 1.0, 0.05, [-W / 2 + 0.15, 1.0, -2.6], 0x2f3a36, { rot: [0, Math.PI / 2, 0] });
    P.box(1.7, 0.08, 0.08, [-W / 2 + 0.2, 0.48, -2.6], 0x8b5a33, { rot: [0, Math.PI / 2, 0] });
    for (let i = 0; i < 5; i++) P.box(0.02, 0.04, 0.12 + r() * 0.3, [-W / 2 + 0.19, 1.25 - i * 0.12, -2.8 + r() * 0.3], PAL.wallWhite);
  });
  // gate sign on the arch
  const sg = makeSign({ text: 'SCHOOL', bod: 'སློབ་གྲྭ།', bg: PAL.templeMaroon, fg: PAL.templeYellow });
  const sp = wpos(f, y, [gateX, 3.15, 0.0]);
  sg.position.set(sp[0], sp[1], sp[2]); sg.rotation.y = f.yaw;
  c.meshes.push(sg);
  // wall colliders
  c.colliders.push(localBox(f, (-W / 2 + gateX - gateW / 2 - 0.3) / 2, -0.1, gateX - gateW / 2 - 0.3 + W / 2, 0.3, y - 0.5, y + wallH, 'wall'));
  c.colliders.push(localBox(f, (gateX + gateW / 2 + 0.3 + W / 2) / 2, -0.1, W / 2 - gateX - gateW / 2 - 0.3, 0.3, y - 0.5, y + wallH, 'wall'));
  for (const sx of [-W / 2, W / 2]) c.colliders.push(localBox(f, sx, -yard / 2, 0.24, yard, y - 0.5, y + wallH, 'wall'));
  for (const sx of [gateX - gateW / 2 - 0.15, gateX + gateW / 2 + 0.15]) c.colliders.push(localBox(f, sx, -0.12, 0.38, 0.4, y - 0.5, y + 2.74, 'pillar'));
  c.colliders.push(localBox(f, W / 2 - 1.6, -1.2, 0.16, 0.16, y, y + 3.0, 'pole'));
  {
    const [x, z] = toWorld(f, -W / 2 + 1.8, -1.0);
    c.colliders.push(bench(c.props, x, y, z, f.yaw + Math.PI / 2, PAL.roofGreen, { back: false, len: 1.6, seed: 5 }));
  }
  footprint(c, f, 0, -yard / 2, W, yard);
  // the school building behind the yard
  const p = placeBuilding(c, DHARAMKOT, side, sm, W - 0.4, {
    ground: 'house', floors: 2, seed: 1203, wall: PAL.wallCream, trim: PAL.templeMaroon, roof: 'tin', roofColor: PAL.roofGreen,
    tibetan: true, balconies: true, railing: PAL.wallYellow, sign: null, awning: null, clutter: 0.3, flags: true, litChance: 0.2,
  }, { setback: 0.65 + yard + 0.1, depth: 6.5, minDepth: 5, lift: false });
  return p;
}

/** Arc length of a road point nearest to the frame (debug helper for builders). */
export const frameAt = (road: Road, s: number) => roadFrame(road, s);
