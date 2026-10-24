// The chai dhaba on Bhagsu Road (north side): a tiny plank-and-tin shack with a lean-to roof weighed down by
// stones and an old tyre, a counter with the big aluminium kettle on a gas ring, glass biscuit jars and a
// stack of cutting-chai glasses, shelves of snack packets, a bare bulb, benches and plastic stools for
// customers on the west side. East of it, the gap behind the shack is the lost puppy's nook: a cardboard
// box on its side, gunny sacks, a wooden crate, an old tyre — reachable from the road through a clear
// 2 m wide passage.
import { PAL } from '../../core/palette';
import { rng } from '../../core/math';
import { groundY } from '../terrain';
import { G } from '../../game/store';
import { sfx } from '../../audio/sfx';
import { makeSign } from '../../kit/sign';
import { bench, bin, lpgCylinders } from '../../kit/street';
import { corrugated } from '../../kit/building';
import { type Ctx, footprint, inFrame, wpos } from './ctx';
import { localBox, jit, rod, tinWall, toWorld, roadsideFrame, BHAGSU } from './util';
import { NOOK, NOOK_FRAME, PUPPY_NOOK, TEA, TEA_FRAME } from './spots';

const WOOD = [0x7a5a3a, 0x8b5a33, 0x6a4a30, 0x5d7a8a, 0x7a6a52] as const;
const JUTE = 0xa08a5a, JUTE_D = 0x86704a;
const ALU = 0xb8bcbf, ALU_D = 0x8a8f93;

export function teaShop(c: Ctx) {
  const f = TEA_FRAME;
  const r = rng(4711);
  const { w, d } = TEA;
  const y = Math.max(groundY(f.x, f.z), f.roadY) + 0.02;
  const hw = w / 2;
  const backH = 2.6, frontH = 2.25; // lean-to: high at the back, low over the counter

  inFrame(c, f, y, () => {
    const B = c.bld, P = c.props;
    // floor slab
    P.slab(-hw - 0.05, -0.4, -d - 0.05, hw + 0.05, 0.12, 0.08, PAL.concrete);
    P.slab(-hw + 0.1, 0.12, -d + 0.1, hw - 0.1, 0.125, -0.5, PAL.concreteStain);
    // posts
    for (const [px, pz, h] of [[-hw + 0.05, -0.05, frontH], [hw - 0.05, -0.05, frontH], [-hw + 0.05, -d + 0.05, backH], [hw - 0.05, -d + 0.05, backH]] as const) {
      B.box(0.1, h, 0.1, [px, 0.12 + h / 2, pz], 0x5a3e28);
    }
    // back wall: weathered vertical planks
    const nP = 7, pw = w / nP;
    for (let i = 0; i < nP; i++) B.box(pw - 0.02, backH - 0.1, 0.05, [-hw + pw * (i + 0.5), 0.12 + (backH - 0.1) / 2, -d + 0.03], jit(r, WOOD[i % WOOD.length], 0.08));
    // west wall: planks to counter height, open above (customers chat through it)
    for (let i = 0; i < 4; i++) B.box(0.05, 1.05, (d - 0.4) / 4 - 0.02, [-hw + 0.03, 0.12 + 0.525, -d + 0.2 + ((d - 0.4) / 4) * (i + 0.5)], jit(r, WOOD[(i + 2) % WOOD.length], 0.08));
    // east wall: rusty tin sheet, full height (hides the nook behind)
    B.add(tinWall(-d + 0.05, -0.05, 0.12, 0.12 + backH - 0.05), PAL.roofRust, [hw - 0.02, 0, 0]);
    B.box(0.03, backH - 0.2, d - 0.1, [hw - 0.06, 0.12 + (backH - 0.2) / 2, -d / 2], 0x6a4a30);
    // roof: corrugated tin sloping to the front, overhanging the counter; a blue patch, stones and a tyre on top
    const ov = 0.55;
    const run = d + ov + 0.1, drop = backH - frontH + 0.12;
    const pitch = Math.atan2(drop, run);
    B.groupEuler([0, 0.12 + backH + 0.02, -d - 0.05], [pitch, 0, 0], () => {
      B.add(corrugated(-hw - 0.15, hw + 0.15, () => [0, run / Math.cos(pitch)], 0.14, 0.035), PAL.roofRust, [0, 0, 0]);
      B.box(w + 0.3, 0.03, run / Math.cos(pitch), [0, -0.02, run / Math.cos(pitch) / 2], 0x5a4030);
      B.add(corrugated(-0.6, 0.3, () => [0.8, 1.9], 0.14, 0.035), PAL.roofBlue, [0, 0.012, 0]);
      for (const [sx, sz] of [[-1.2, 0.6], [0.9, 1.5], [-0.3, 2.4]] as const) B.box(0.26, 0.16, 0.22, [sx, 0.1, sz], PAL.rockDark, { rot: [0, sx, 0.1] });
      B.cyl(0.32, 0.32, 0.12, [1.2, 0.04, 0.7], 0x1d1a1a, 10);
      B.cyl(0.18, 0.18, 0.125, [1.2, 0.04, 0.7], 0x4a4a4c, 10);
    });
    // counter: plank front with a painted band, worktop
    const cz0 = -0.48;
    P.slab(-hw + 0.1, 0.12, cz0, hw - 0.6, 0.95, -0.02, 0x8b5a33);
    P.slab(-hw + 0.1, 0.5, -0.03, hw - 0.6, 0.62, -0.01, PAL.wallYellow);
    P.slab(-hw + 0.06, 0.95, cz0 - 0.02, hw - 0.56, 1.0, 0.04, 0x9a958a);
    // the big aluminium kettle on a gas ring, a milk pan, glasses, biscuit jars
    P.box(0.42, 0.12, 0.32, [-0.95, 1.06, -0.24], 0x2a2a2e);
    P.cyl(0.17, 0.2, 0.3, [-0.95, 1.12, -0.24], ALU, 8);
    P.cyl(0.06, 0.15, 0.1, [-0.95, 1.42, -0.24], ALU, 8);
    P.box(0.05, 0.05, 0.05, [-0.95, 1.53, -0.24], 0x2a2a2e);
    rod(P, [-0.8, 1.28, -0.24], [-0.62, 1.42, -0.24], 0.04, ALU_D);
    P.cyl(0.13, 0.13, 0.14, [-1.35, 1.0, -0.2], ALU_D, 8);
    for (let i = 0; i < 6; i++) P.cyl(0.035, 0.03, 0.09, [-0.35 + (i % 3) * 0.08, 1.0 + Math.floor(i / 3) * 0.09, -0.12], 0xd8d0b8, 6);
    const jarC = [0xc9883a, 0xe0b02a, 0xb05a3a, 0xd8c08a, 0xc84a5a];
    for (let i = 0; i < 5; i++) {
      const jx = 0.05 + i * 0.2;
      P.cyl(0.08, 0.08, 0.2, [jx, 1.0, -0.14], 0xcfe0e4, 8);
      P.cyl(0.07, 0.07, 0.14, [jx, 1.01, -0.14], jarC[i], 8);
      P.cyl(0.085, 0.085, 0.04, [jx, 1.2, -0.14], i % 2 ? PAL.roofRed : PAL.roofBlue, 8);
    }
    // shelves of snack packets and a calendar on the back wall
    for (let k = 0; k < 2; k++) {
      const sy = 1.35 + k * 0.42;
      P.slab(-hw + 0.15, sy, -d + 0.06, hw - 0.15, sy + 0.03, -d + 0.34, 0x6a4a30);
      for (let i = 0; i < 9; i++) P.box(0.16, 0.22, 0.1, [-hw + 0.3 + i * 0.32, sy + 0.14, -d + 0.2], [PAL.wallYellow, PAL.roofRed, PAL.roofBlue, 0xe07a2e, PAL.roofGreen][(i + k * 2) % 5]);
    }
    P.box(0.34, 0.46, 0.01, [1.15, 2.05, -d + 0.07], 0xeeeae0);
    P.box(0.28, 0.2, 0.012, [1.15, 2.15, -d + 0.075], PAL.templeRed);
    // strip of snack sachets hanging from the roof front
    for (let i = 0; i < 6; i++) P.box(0.1, 0.13, 0.01, [0.35 + i * 0.12, frontH - 0.12 - (i % 2) * 0.14, 0.06], [0xd8402e, 0xe0b02a, 0x2f6fc0][i % 3]);
    // bare bulb
    P.box(0.07, 0.1, 0.07, [-0.2, frontH - 0.12, -0.35], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 2.4 });
    rod(P, [-0.2, frontH - 0.06, -0.35], [-0.2, frontH + 0.1, -0.35], 0.015, 0x1c1c1f);
    // a blue water drum by the back corner, outside
    P.cyl(0.28, 0.28, 0.85, [-hw - 0.4, 0, -d + 0.4], 0x2f5f9a, 10);
    P.cyl(0.29, 0.29, 0.05, [-hw - 0.4, 0.86, -d + 0.4], 0x264e80, 10);
  });

  // signs: CHAI board on the roof front, GARAM CHAI on the counter
  const s1 = makeSign({ text: 'CHAI', bod: 'ཇ་ཁང་', bg: PAL.templeRed, fg: PAL.wallWhite });
  const p1 = wpos(f, y, [0.4, frontH + 0.62, 0.42]);
  s1.position.set(p1[0], p1[1], p1[2]); s1.rotation.y = f.yaw;
  const s2 = makeSign({ text: 'GARAM CHAI', bg: PAL.wallWhite, fg: PAL.roofRed, glow: false, h: 0.26 });
  const p2 = wpos(f, y, [-0.5, 0.78, 0.0]);
  s2.position.set(p2[0], p2[1], p2[2]); s2.rotation.y = f.yaw;
  c.meshes.push(s1, s2);
  // sign post holding the board
  inFrame(c, f, y, () => {
    rod(c.props, [0.4, frontH + 0.1, 0.36], [0.4, frontH + 0.4, 0.36], 0.05, 0x5a3e28);
  });

  // colliders: shack body (back part), counter, drum
  c.colliders.push(localBox(f, 0, -d / 2 - 0.25, w, d - 0.5, y - 0.5, y + backH, 'teashop'));
  c.colliders.push(localBox(f, -0.25, -0.25, w - 0.5, 0.5, y - 0.5, y + 1.0, 'counter'));
  c.colliders.push(localBox(f, -hw - 0.4, -d + 0.4, 0.6, 0.6, y - 0.3, y + 0.9, 'drum'));
  footprint(c, f, -0.2, -d / 2, w + 1.2, d + 0.3);
  const [lx, lz] = toWorld(f, -0.2, -0.85);
  c.lamps.push({ x: lx, y: y + frontH - 0.3, z: lz, color: PAL.lampWarm, intensity: 5, distance: 8 });

  // customers' corner west of the shack: a bench facing the road, plastic stools, a crate table
  const fw = roadsideFrame(BHAGSU, TEA.s - TEA.w / 2 - 1.25, -1, 0);
  const yw = groundY(fw.x, fw.z);
  {
    const [bx, bz] = toWorld(fw, 0, -1.55);
    c.colliders.push(bench(c.props, bx, groundY(bx, bz), bz, fw.yaw, 0x8b5a33, { back: true, len: 1.7, seed: 31 }));
    const stools: [number, number, number][] = [[-0.55, -0.55, PAL.roofRed], [0.6, -0.5, PAL.roofBlue]];
    for (const [sx, sz, col] of stools) {
      const [x, z] = toWorld(fw, sx, sz);
      const gy = groundY(x, z);
      c.props.cyl(0.17, 0.14, 0.42, [x, gy, z], col, 8);
      c.props.cyl(0.18, 0.18, 0.04, [x, gy + 0.42, z], col, 8);
      c.colliders.push({ x, z, w: 0.36, d: 0.36, y0: gy, y1: gy + 0.44, tag: 'stool' });
    }
    // wooden crate as a low table with two glasses
    const [tx, tz] = toWorld(fw, 0.05, -0.75);
    const ty = groundY(tx, tz);
    c.props.group([tx, ty, tz], fw.yaw + 0.2, () => {
      c.props.box(0.5, 0.34, 0.36, [0, 0.17, 0], 0x9a7a4e);
      c.props.box(0.52, 0.03, 0.38, [0, 0.355, 0], 0x7a5a3a);
      c.props.cyl(0.035, 0.03, 0.09, [-0.1, 0.37, 0.02], 0xd8b080, 6);
      c.props.cyl(0.035, 0.03, 0.09, [0.12, 0.37, -0.05], 0xd8b080, 6);
    });
    c.colliders.push({ x: tx, z: tz, w: 0.52, d: 0.38, rot: fw.yaw + 0.2, y0: ty, y1: ty + 0.37, tag: 'crate' });
    const [gx, gz] = toWorld(fw, -0.9, -2.3);
    c.colliders.push(bin(c.props, gx, groundY(gx, gz), gz, PAL.roofGreen, { seed: 9 }));
    footprint(c, fw, 0, -1.3, 2.4, 2.6);
    void yw;
  }

  // chai for ₹10
  const [ix, iz] = toWorld(f, -0.4, 0.55);
  c.interact.push({
    id: 'hillside-chai', pos: [ix, y, iz], radius: 1.6, label: 'Buy chai (₹10)', anim: 'give',
    onInteract: () => {
      if (!G().spend(10)) { sfx('deny'); return; }
      sfx('coin');
      G().say([
        { who: 'Chai-wallah', text: 'Garam chai! Cutting glass, extra ginger. Careful, hot hot!' },
        { who: 'Tenzin', text: 'Thuk-je-che! Mmm… sweet and spicy.' },
      ]);
    },
  });

  puppyNook(c);
}

/** The gap east of the shack: a cardboard box (the puppy's den), gunny sacks, a crate, an old tyre. */
function puppyNook(c: Ctx) {
  const f = NOOK_FRAME;
  const r = rng(808);
  const P = c.props;
  const at = (lx: number, lz: number) => { const [x, z] = toWorld(f, lx, lz); return { x, z, y: groundY(x, z) }; };
  const back = NOOK.back;

  // cardboard box lying on its side, open toward the road, a scrap of old blanket inside
  {
    const b = at(-0.1, -back - 0.42);
    P.group([b.x, b.y, b.z], f.yaw + 0.15, () => {
      const W = 0.62, H = 0.46, D = 0.5, t = 0.025, col = 0xb8925a;
      P.box(W, t, D, [0, t / 2, 0], col);              // floor
      P.box(W, t, D, [0, H - t / 2, 0], 0xc4a068);     // top
      P.box(t, H, D, [-W / 2, H / 2, 0], col);          // sides
      P.box(t, H, D, [W / 2, H / 2, 0], col);
      P.box(W, H, t, [0, H / 2, -D / 2], 0xa8824e);     // back
      P.box(W * 0.9, 0.06, D * 0.7, [0, 0.05, -0.04], 0x8a3a3a); // blanket scrap
      P.box(0.2, 0.24, 0.02, [-W / 2 + 0.1, H + 0.08, D / 2 - 0.02], 0xc4a068, { rot: [0.5, 0, 0.2] }); // flap
      P.box(0.16, 0.08, 0.01, [0.12, 0.3, D / 2 + 0.002], 0x6a5a40); // printed arrow / text
    });
    c.colliders.push({ x: b.x, z: b.z, w: 0.66, d: 0.54, rot: f.yaw + 0.15, y0: b.y, y1: b.y + 0.46, tag: 'box' });
  }
  // gunny sacks piled against the shack's tin wall (west side of the gap)
  for (let i = 0; i < 4; i++) {
    const s = at(-1.45 + (i === 3 ? 0.2 : 0), -3.0 - i * 0.55 + (i === 3 ? 0.5 : 0));
    const yy = i === 3 ? 0.42 : 0;
    P.group([s.x, s.y + yy, s.z], f.yaw + (r() - 0.5) * 0.6, () => {
      P.taper(0.58, 0.42, 0.46, 0.34, 0.42, [0, 0, 0], i % 2 ? JUTE : JUTE_D);
      P.box(0.12, 0.08, 0.12, [0.18, 0.44, 0], JUTE_D, { rot: [0, 0.4, 0.3] });
      P.box(0.5, 0.02, 0.02, [0, 0.2, 0.21], 0x6a5a40);
    });
  }
  c.colliders.push(localBox(f, -1.45, -3.8, 0.7, 2.2, groundY(f.x, f.z) - 0.3, at(-1.45, -3.8).y + 0.85, 'sacks'));
  // wooden crate with empty bottles, and an old tyre leaning on it (east side)
  {
    const k = at(1.3, -back - 0.3);
    P.group([k.x, k.y, k.z], f.yaw - 0.25, () => {
      P.box(0.62, 0.42, 0.45, [0, 0.21, 0], 0x8a6a44);
      for (let i = 0; i < 3; i++) P.box(0.64, 0.05, 0.47, [0, 0.06 + i * 0.15, 0], 0x6a4a30);
      for (let i = 0; i < 4; i++) P.cyl(0.04, 0.04, 0.2, [-0.18 + i * 0.12, 0.42, 0.05], i % 2 ? 0x3a6a3a : 0x6a4a2a, 6);
      P.cyl(0.3, 0.3, 0.13, [0.02, 0.33, 0.32], 0x1d1a1a, 10, { rot: [Math.PI / 2 - 0.25, 0, 0] });
    });
    c.colliders.push({ x: k.x, z: k.z, w: 0.66, d: 0.6, rot: f.yaw - 0.25, y0: k.y, y1: k.y + 0.45, tag: 'crate' });
  }
  // a low dry-stone wall closing the back of the gap, weeds along it
  {
    const s0 = TEA.s + TEA.w / 2 + 0.05, s1 = NOOK.s1 - 0.1;
    const fa = roadsideFrame(BHAGSU, s0, -1, back + 1.0), fb = roadsideFrame(BHAGSU, s1, -1, back + 1.0);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = fa.x + (fb.x - fa.x) * t, z = fa.z + (fb.z - fa.z) * t;
      const gy = groundY(x, z);
      P.box(0.62, 0.32 + r() * 0.12, 0.42, [x, gy + 0.14, z], r() < 0.5 ? PAL.rock : PAL.rockDark, { rot: [0, f.yaw + (r() - 0.5) * 0.3, 0] });
      P.box(0.44, 0.24, 0.36, [x + (r() - 0.5) * 0.2, gy + 0.46, z], r() < 0.5 ? PAL.rock : PAL.slateLight, { rot: [0, f.yaw + r(), 0] });
      if (r() < 0.6) P.box(0.2, 0.22, 0.14, [x, gy + 0.68, z], PAL.grass, { rot: [0, r() * 3, 0] });
    }
    const mx = (fa.x + fb.x) / 2, mz = (fa.z + fb.z) / 2;
    c.colliders.push({ x: mx, z: mz, w: Math.hypot(fb.x - fa.x, fb.z - fa.z), d: 0.45, rot: fa.yaw + Math.PI / 2, y0: groundY(mx, mz) - 0.3, y1: groundY(mx, mz) + 0.6, tag: 'wall' });
  }
  // a broken red plastic chair and a few weeds by the road end of the passage
  {
    const ch = at(1.55, -1.6);
    P.group([ch.x, ch.y, ch.z], f.yaw + 2.2, () => {
      P.box(0.42, 0.04, 0.4, [0, 0.42, 0], PAL.roofRed);
      P.box(0.42, 0.4, 0.04, [0, 0.64, -0.2], PAL.roofRed, { rot: [-0.15, 0, 0] });
      for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17]] as const) P.box(0.04, 0.42, 0.04, [lx, 0.21, lz], PAL.roofRed);
      P.box(0.04, 0.2, 0.04, [0.2, 0.06, 0.25], PAL.roofRed, { rot: [1.2, 0, 0] }); // the broken leg on the ground
    });
    c.colliders.push({ x: ch.x, z: ch.z, w: 0.45, d: 0.45, y0: ch.y, y1: ch.y + 0.45, tag: 'chair' });
  }
  for (let i = 0; i < 6; i++) {
    const g = at((r() - 0.5) * 3, -1.2 - r() * 3.6);
    if (Math.abs(g.x - PUPPY_NOOK.x) + Math.abs(g.z - PUPPY_NOOK.z) < 0.8) continue;
    P.box(0.16, 0.16 + r() * 0.12, 0.12, [g.x, g.y + 0.06, g.z], r() < 0.5 ? PAL.grass : PAL.grassDry, { rot: [0, r() * 3, 0] });
  }
  // a couple of LPG cylinders stored by the shack's back corner
  {
    const l = at(-1.45, -back - 0.7);
    c.colliders.push(lpgCylinders(P, l.x, l.y, l.z, 2, 55));
  }
  footprint(c, f, 0, -back + 0.4, NOOK.s1 - NOOK.s0, 2.6);
}
