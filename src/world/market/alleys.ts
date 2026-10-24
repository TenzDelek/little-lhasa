// Narrow side alleys between the shops: a flight of steps climbing away from the road to a small landing
// that dead-ends at a back door (Tibetan door curtain with an endless knot), potted plants, a broom, and
// prayer flags strung across overhead.
import { PAL } from '../../core/palette';
import { pick, rng } from '../../core/math';
import { roadFrame, type Road } from '../layout';
import { groundY } from '../terrain';
import { type Ctx, inFrame, wpos } from './ctx';
import { localBox, roadsideFrame, toWorld, rod } from './util';
import { plant } from './items';

export interface AlleySpec { road: Road; side: 1 | -1; s: number; /** Gap between the neighbours. */ gap: number; seed: number; depth?: number }

export function alley(c: Ctx, a: AlleySpec) {
  const r = rng(a.seed);
  const f0 = roadsideFrame(a.road, a.s, a.side, 0.6);
  const f = { x: f0.x, z: f0.z, yaw: f0.yaw };
  const y = roadFrame(a.road, a.s).y + 0.05;
  const w = a.gap - 0.1;
  const hw = w / 2;
  const depth = a.depth ?? 6.4;
  const nSteps = 6, rise = 0.18, run = 0.5;
  const top = nSteps * rise;
  const landing0 = -nSteps * run; // landing starts here (local z, negative = away from the road)
  const back = -depth;
  const stone = PAL.stoneStep, wall = pick(r, [PAL.wallCream, PAL.wallWhite, PAL.wallSky, PAL.wallMint, PAL.wallPink]);
  const gy = Math.min(groundY(f.x, f.z), y) - 0.6;
  {
    const [cx, cz] = toWorld(f, 0, -depth / 2);
    c.footprints.push({ x: cx, z: cz, hw: hw + 0.05, hd: depth / 2 + 0.3, yaw: f.yaw });
  }
  inFrame(c, f, y, () => {
    const P = c.props, B = c.bld;
    // steps (each a block down to below ground)
    for (let i = 0; i < nSteps; i++) {
      const z1 = -i * run, z0 = z1 - run, sy = (i + 1) * rise;
      P.slab(-hw + 0.12, gy - y, z0, hw - 0.12, sy, z1, i % 2 ? stone : 0x938d80);
      P.slab(-hw + 0.12, sy - 0.02, z1 - 0.06, hw - 0.12, sy + 0.005, z1, PAL.curb);
    }
    // landing
    P.slab(-hw + 0.12, gy - y, back + 0.15, hw - 0.12, top, landing0, PAL.pavingDark);
    // stepped cheek walls, pipe railings following the flight and the landing
    for (const sx of [-1, 1]) {
      for (let i = 0; i < nSteps; i++) P.slab(sx * hw - 0.06, gy - y, -(i + 1) * run, sx * hw + 0.06, (i + 1) * rise + 0.12, -i * run, PAL.concreteDark);
      P.slab(sx * hw - 0.06, gy - y, back, sx * hw + 0.06, top + 0.12, landing0, PAL.concreteDark);
      const rx = sx * (hw - 0.05);
      rod(B, [rx, 0.95, -0.15], [rx, top + 0.95, landing0], 0.05, PAL.railing);
      rod(B, [rx, 0.5, -0.15], [rx, top + 0.5, landing0], 0.035, PAL.railing);
      B.box(0.05, 0.05, landing0 - back - 0.2, [rx, top + 0.95, (landing0 + back + 0.2) / 2], PAL.railing);
      B.box(0.035, 0.035, landing0 - back - 0.2, [rx, top + 0.5, (landing0 + back + 0.2) / 2], PAL.railing);
      for (let k = 0; k <= nSteps; k += 2) B.box(0.05, 0.95, 0.05, [rx, k * rise + 0.475 + 0.06, -Math.max(0.15, k * run)], PAL.railing);
      for (let z = landing0 - 1.0; z > back + 0.3; z -= 1.1) B.box(0.05, 0.95, 0.05, [rx, top + 0.475, z], PAL.railing);
    }
    // the back wall with a door and a door curtain (white with a blue endless knot)
    B.slab(-hw - 0.06, gy - y, back - 0.25, hw + 0.06, top + 3.0, back + 0.15, wall);
    B.box(1.0, 2.05, 0.06, [0, top + 1.03, back + 0.17], PAL.woodDoor);
    B.box(1.16, 0.12, 0.1, [0, top + 2.1, back + 0.18], PAL.templeRed);
    B.box(0.9, 1.7, 0.03, [0, top + 1.1, back + 0.22], 0xf3efe6);
    B.box(0.3, 0.3, 0.035, [0, top + 1.2, back + 0.23], 0x2f63b8, { rot: [0, 0, Math.PI / 4] });
    B.box(0.16, 0.16, 0.04, [0, top + 1.2, back + 0.235], 0xf3efe6, { rot: [0, 0, Math.PI / 4] });
    B.box(0.9, 0.12, 0.035, [0, top + 1.9, back + 0.23], 0x2f63b8);
    // a bulb over the door
    B.box(0.08, 0.1, 0.08, [0, top + 2.35, back + 0.3], 0xfff0c0, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.4 });
    // pots, a broom, a gas cylinder by the door
    plant(P, -hw + 0.32, top, back + 0.5, r);
    plant(P, hw - 0.32, top, back + 0.5, r, true);
    P.box(0.03, 1.0, 0.03, [hw - 0.2, top + 0.5, back + 0.9], 0xc8a060, { rot: [0.15, 0, 0] });
    P.box(0.18, 0.2, 0.06, [hw - 0.2, top + 0.08, back + 0.95], 0xb8a070);
  });
  // colliders: each step, the landing, side walls, back wall
  for (let i = 0; i < nSteps; i++) {
    const z1 = -i * run, z0 = z1 - run;
    c.colliders.push(localBox(f, 0, (z0 + z1) / 2, w - 0.24, run, gy, y + (i + 1) * rise, 'step'));
  }
  c.colliders.push(localBox(f, 0, (back + 0.15 + landing0) / 2, w - 0.24, landing0 - back - 0.15, gy, y + top, 'landing'));
  for (const sx of [-1, 1]) c.colliders.push(localBox(f, sx * hw, back / 2, 0.14, -back, gy, y + top + 1.0, 'wall'));
  c.colliders.push(localBox(f, 0, back - 0.05, w + 0.12, 0.4, gy, y + top + 3, 'wall'));
  for (const [lx, lz] of [[-hw + 0.32, back + 0.5], [hw - 0.32, back + 0.5]]) c.colliders.push(localBox(f, lx, lz, 0.32, 0.32, y + top, y + top + 0.5, 'plant'));
  const bulb = wpos(f, y, [0, top + 2.35, back + 0.3]);
  c.lamps.push({ x: bulb[0], y: bulb[1], z: bulb[2], color: PAL.lampWarm, intensity: 3, distance: 5 });
  // lungta across the alley
  const p0 = wpos(f, y, [-hw + 0.05, top + 3.2, -1.2]);
  const p1 = wpos(f, y, [hw - 0.05, top + 2.9, back + 1.2]);
  c.flags.push({ a: p0, b: p1, sag: 0.25, seed: a.seed, age: 0.4 });
  const p2 = wpos(f, y, [hw - 0.05, top + 3.4, -0.6]);
  const p3 = wpos(f, y, [-hw + 0.05, top + 3.1, -3.4]);
  c.flags.push({ a: p2, b: p3, sag: 0.2, seed: a.seed + 5, age: 0.7 });
}
