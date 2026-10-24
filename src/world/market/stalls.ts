// The three food stalls: Tashi's momo stall and the balep cart on Temple Road, Dolma's laphing table on
// Jogiwara Road. Each is built in its counter frame (spots.ts): customer side = local +z, vendor stands
// behind the counter at local −z (kept free of colliders), interactable in front of the counter.
import { PAL } from '../../core/palette';
import { pick, range, rng } from '../../core/math';
import { groundY } from '../terrain';
import { ITEMS } from '../layout';
import { buy } from '../../game/quests';
import { makeSign } from '../../kit/sign';
import { type Ctx, inFrame, wpos } from './ctx';
import { STALLS, VENDOR_BACK, type StallFrame } from './spots';
import { localBox, rod, hangBoxFrom } from './util';
import { bottle, gasCylinder, momoPlate, steamerStack, stool, umbrella } from './items';

const HALF_PI = Math.PI / 2;

/** Floor height for a stall: the ground under its counter (stalls stand on the graded verge). */
const floorAt = (f: StallFrame) => groundY(f.x, f.z);

function sign(c: Ctx, f: StallFrame, y: number, l: [number, number, number], text: string, bod: string, bg: number, fg: number, w?: number) {
  const m = makeSign({ text, bod, bg, fg, w, glow: true });
  const p = wpos(f, y, l);
  m.position.set(p[0], p[1], p[2]);
  m.rotation.y = f.yaw;
  c.meshes.push(m);
}

// ---- Tashi's momo stall -----------------------------------------------------------------------------------
export function momoStall(c: Ctx) {
  const f = STALLS.momo;
  const y = floorAt(f);
  const P = c.props, B = c.bld;
  const back = VENDOR_BACK.momo;
  inFrame(c, f, y, () => {
    // counter: painted plank front, steel top
    P.box(1.9, 0.86, 0.55, [0, 0.43, 0], PAL.woodTrim);
    P.box(1.92, 0.5, 0.02, [0, 0.5, 0.285], 0x8fb4cf);
    P.box(1.92, 0.08, 0.025, [0, 0.8, 0.29], PAL.templeRed);
    P.box(1.96, 0.04, 0.6, [0, 0.88, 0], 0xb8bcc0);
    // on the counter: plates of momos, sauces, a stack of plates, spoons
    momoPlate(P, -0.55, 0.9, 0.08);
    momoPlate(P, -0.25, 0.9, 0.1, 5);
    for (let i = 0; i < 5; i++) P.cyl(0.1, 0.09, 0.018, [0.18, 0.9 + i * 0.02, 0.05], 0xeeeae0, 10);
    bottle(P, 0.45, 0.9, 0.16, 0xb8281e);
    bottle(P, 0.53, 0.9, 0.12, 0xb8281e);
    bottle(P, 0.6, 0.9, 0.18, 0x3a2418);
    P.cyl(0.07, 0.06, 0.06, [0.72, 0.9, 0.0], 0xc0c4c8, 8); // bowl of chilli paste
    P.cyl(0.06, 0.06, 0.008, [0.72, 0.96, 0.0], 0xa8281e, 8);
    P.box(0.3, 0.03, 0.2, [-0.85, 0.915, -0.05], 0xc0c4c8); // tray
    for (let i = 0; i < 8; i++) P.box(0.05, 0.04, 0.05, [-0.95 + (i % 4) * 0.065, 0.95, -0.1 + Math.floor(i / 4) * 0.08], 0xf2ead8);

    // gas stove on a stand, LPG cylinder, steamer tower
    P.box(0.55, 0.62, 0.5, [1.3, 0.31, -0.05], 0x3a3a3a);
    P.box(0.5, 0.04, 0.45, [1.3, 0.64, -0.05], 0x2a2a2a);
    gasCylinder(P, 1.32, 0, 0.45);
    rod(P, [1.32, 0.66, 0.45], [1.3, 0.6, 0.15], 0.025, 0xc8a040);
    const top = steamerStack(P, 1.3, 0.66, -0.05, 4, 0.23);
    c.steam.push(at(f, y, top, 7, 1.15, 1.0));
    c.steam.push(at(f, y, [1.3 + 0.2, 0.9, -0.05 + 0.1], 3, 0.6, 0.6)); // leaking seam
    // back table: dough board, filling bowl, second steamer, big pot
    const bz = -back - 0.68;
    P.box(1.7, 0.78, 0.45, [0, 0.39, bz], PAL.woodDoor);
    P.box(1.72, 0.03, 0.47, [0, 0.79, bz], 0xd8d0c0);
    P.box(0.5, 0.03, 0.32, [-0.45, 0.82, bz], 0xc8a878); // dough board
    for (let i = 0; i < 6; i++) P.box(0.045, 0.035, 0.045, [-0.62 + (i % 3) * 0.09, 0.85, bz - 0.06 + Math.floor(i / 3) * 0.12], 0xf2ead8);
    P.cyl(0.16, 0.12, 0.12, [0.15, 0.81, bz], 0xc0c4c8, 8);
    P.cyl(0.14, 0.14, 0.01, [0.15, 0.92, bz], 0x8a6a4a, 8); // filling
    const top2 = steamerStack(P, 0.62, 0.81, bz, 2, 0.2);
    c.steam.push(at(f, y, top2, 5, 0.9, 0.85));
    P.cyl(0.2, 0.18, 0.3, [1.32, 0, bz - 0.05], 0x5a5a5a, 8); // water drum
    // tarp roof on bamboo poles (slopes down toward the customer)
    const poles: Array<[number, number, number]> = [[-1.2, 0.36, 2.15], [1.62, 0.36, 2.15], [-1.2, bz - 0.28, 2.5], [1.62, bz - 0.28, 2.5]];
    for (const [px, pz, ph] of poles) B.box(0.06, ph, 0.06, [px, ph / 2, pz], 0x9a8a5a);
    const z0 = bz - 0.4, z1 = 0.95, y0 = 2.55, y1 = 2.13;
    const L = Math.hypot(z1 - z0, y0 - y1), slope = Math.atan2(y0 - y1, z1 - z0);
    B.box(3.05, 0.035, L, [0.21, (y0 + y1) / 2, (z0 + z1) / 2], 0x3d6a9a, { rot: [slope, 0, 0] });
    B.cyl(0.045, 0.045, 3.05, [0.21 - 1.525, y1 - 0.02, z1], 0x34598a, 6, { rot: [0, 0, -HALF_PI] });
    // a bare bulb under the tarp
    B.box(0.02, 0.3, 0.02, [0.3, 2.05, 0.0], 0x2a2a2a);
    B.box(0.08, 0.1, 0.08, [0.3, 1.86, 0.0], 0xfff0c0, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.6 });
    // a little tin of chillies hanging, and a towel
    hangBoxFrom(c.hang, 2.1, 0.3, 0.42, 0.02, [-0.9, 1.89, 0.6], 0xeeeae0);
    hangBoxFrom(c.hang, 2.1, 0.3, 0.05, 0.025, [-0.9, 1.75, 0.6], 0xb8322b);

    // customer bench beside the counter, facing the road
    P.box(1.5, 0.06, 0.38, [-2.05, 0.45, 0.2], PAL.woodTrim);
    for (const sx of [-0.65, 0.65]) P.box(0.06, 0.45, 0.32, [-2.05 + sx, 0.225, 0.2], PAL.woodDoor);
  });
  sign(c, f, y, [0.2, 2.25, 0.98], 'MOMO', 'མོག་མོག', PAL.templeRed, PAL.templeYellow);

  c.colliders.push(
    localBox(f, 0, 0, 1.96, 0.6, y - 0.5, y + 0.9, 'stall'),
    localBox(f, 1.3, 0.05, 0.6, 0.85, y - 0.5, y + 1.25, 'stall'),
    localBox(f, 0.2, -back - 0.68, 2.6, 0.5, y - 0.5, y + 0.85, 'stall'),
    localBox(f, -2.05, 0.2, 1.5, 0.38, y - 0.5, y + 0.48, 'bench'),
    localBox(f, -1.2, 0.36, 0.1, 0.1, y, y + 2.15, 'pole'),
    localBox(f, -1.2, -back - 0.96, 0.1, 0.1, y, y + 2.5, 'pole'),
  );
  const lp = wpos(f, y, [0.3, 1.86, 0]);
  c.lamps.push({ x: lp[0], y: lp[1], z: lp[2], color: PAL.lampWarm, intensity: 5, distance: 7 });

  const ip = wpos(f, y, [0, 0.95, 0.75]);
  c.interact.push({
    id: 'market-momo', pos: ip, radius: 1.6, label: 'Buy momos (₹60)', priority: 1,
    onInteract: () => { buy(ITEMS.momo, 60, 'Tashi', 'Steaming hot! Careful, the chilli is strong.'); },
  });
}

function at(f: StallFrame, y: number, l: readonly [number, number, number], n: number, size: number, rise: number) {
  const p = wpos(f, y, l);
  return { x: p[0], y: p[1], z: p[2], n, size, rise };
}

// ---- balep cart -------------------------------------------------------------------------------------------
export function balepCart(c: Ctx) {
  const f = STALLS.balep;
  const y = floorAt(f);
  const r = rng(733);
  const P = c.props, B = c.bld;
  inFrame(c, f, y, () => {
    // wooden cart body (painted blue, yellow trim) on two bicycle wheels and two legs
    P.box(1.5, 0.3, 0.72, [0, 0.72, 0], 0x3d5f86);
    P.box(1.52, 0.06, 0.74, [0, 0.89, 0], 0xd9b23a);
    P.box(1.5, 0.04, 0.72, [0, 0.57, 0], 0x2f4a6a);
    for (const sz of [-1, 1]) {
      P.cyl(0.3, 0.3, 0.05, [0.3, 0.3, sz * 0.42], 0x2a2a2a, 10, { rot: [HALF_PI, 0, 0] });
      P.cyl(0.08, 0.08, 0.06, [0.3, 0.3, sz * 0.43], 0x8a8a8a, 6, { rot: [HALF_PI, 0, 0] });
    }
    for (const sz of [-1, 1]) P.box(0.05, 0.57, 0.05, [-0.66, 0.285, sz * 0.3], 0x2a2a2a);
    rod(P, [-0.75, 0.72, -0.3], [-1.1, 0.82, -0.3], 0.04, 0x2a2a2a);
    rod(P, [-0.75, 0.72, 0.3], [-1.1, 0.82, 0.3], 0.04, 0x2a2a2a);
    // glass case (frame) with stacks of balep
    const ch = 0.42;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.03, ch, 0.03, [sx * 0.66, 0.92 + ch / 2, sz * 0.3], 0xd8dcdc);
    P.box(1.36, 0.025, 0.64, [0, 0.92 + ch, 0], 0xb9d0dc);
    for (const sz of [-1, 1]) P.box(1.32, 0.025, 0.025, [0, 0.92 + ch, sz * 0.3], 0xd8dcdc);
    for (let i = 0; i < 3; i++) {
      const bx = -0.42 + i * 0.42;
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) P.cyl(0.13, 0.13, 0.035, [bx + range(r, -0.015, 0.015), 0.93 + k * 0.036, range(r, -0.02, 0.02)], k % 2 ? 0xc8964a : 0xb8823a, 9);
    }
    // a pan on a small kerosene stove beside the cart, a stool for the seller
    P.box(0.3, 0.35, 0.3, [0.98, 0.175, -0.25], 0x3a3a3a);
    P.cyl(0.2, 0.17, 0.05, [0.98, 0.35, -0.25], 0x2a2a2a, 10);
    P.cyl(0.11, 0.11, 0.02, [0.98, 0.4, -0.25], 0xc8964a, 9);
    c.steam.push(at(f, y, [0.98, 0.42, -0.25], 3, 0.55, 0.55));
    stool(P, -0.55, 0, -1.05, 0x3a5aa0);
    // umbrella
    umbrella(B, 0.15, 0, -0.38, 0xb8503a, 2.35, 1.05);
    B.box(0.06, 0.1, 0.06, [0.15, 1.95, -0.32], 0xfff0c0, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.6 });
  });
  sign(c, f, y, [0, 0.72, 0.38], 'BALEP', 'བག་ལེབ', PAL.templeYellow, PAL.templeRed, 0.9);
  c.colliders.push(
    localBox(f, -0.1, 0, 1.75, 0.92, y - 0.5, y + 1.36, 'stall'),
    localBox(f, 0.98, -0.25, 0.32, 0.32, y - 0.5, y + 0.42, 'stall'),
  );
  const lp = wpos(f, y, [0.15, 1.95, -0.32]);
  c.lamps.push({ x: lp[0], y: lp[1], z: lp[2], color: PAL.lampWarm, intensity: 4, distance: 6 });
  const ip = wpos(f, y, [0, 0.95, 0.85]);
  c.interact.push({
    id: 'market-balep', pos: ip, radius: 1.6, label: 'Buy balep (₹20)', priority: 1,
    onInteract: () => { buy(ITEMS.balep, 20, 'Pasang', 'Fresh balep, still warm from the pan. Good with butter tea!'); },
  });
}

// ---- Dolma's laphing table -------------------------------------------------------------------------------
export function laphingStall(c: Ctx) {
  const f = STALLS.laphing;
  const y = floorAt(f);
  const r = rng(877);
  const P = c.props, B = c.bld;
  inFrame(c, f, y, () => {
    // folding table with a blue plastic cloth
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.04, 0.74, 0.04, [sx * 0.6, 0.37, sz * 0.28], 0x8a8a8a);
    P.box(1.34, 0.03, 0.68, [0, 0.755, 0], 0x5a7ab0);
    P.box(1.36, 0.16, 0.012, [0, 0.69, 0.345], 0x5a7ab0);
    P.box(1.36, 0.02, 0.014, [0, 0.62, 0.35], 0xeeeae0);
    // the big plate of yellow laphing sheets, a tray of cut laphing, bowls of chilli and garlic water
    P.cyl(0.3, 0.29, 0.025, [-0.3, 0.77, -0.02], 0xc0c4c8, 12);
    for (let k = 0; k < 5; k++) P.cyl(0.25, 0.25, 0.014, [-0.3 + range(r, -0.03, 0.03), 0.795 + k * 0.015, -0.02 + range(r, -0.03, 0.03)], k % 2 ? 0xe8d070 : 0xdcc060, 12);
    P.box(0.38, 0.03, 0.26, [0.25, 0.785, -0.08], 0xc0c4c8);
    for (let i = 0; i < 10; i++) P.box(0.06, 0.035, 0.05, [0.12 + (i % 5) * 0.065, 0.815, -0.15 + Math.floor(i / 5) * 0.11], 0xe8d070, { rot: [0, r(), 0] });
    for (let i = 0; i < 3; i++) {
      const bx = 0.12 + i * 0.16;
      P.cyl(0.06, 0.045, 0.05, [bx, 0.77, 0.2], pick(r, [0xe59ab0, 0x9cc6e8, 0x7fa77f]), 8);
      P.cyl(0.05, 0.05, 0.006, [bx, 0.815, 0.2], 0xe8d070, 8);
    }
    P.cyl(0.07, 0.06, 0.07, [0.55, 0.77, 0.08], 0xc0c4c8, 8);
    P.cyl(0.06, 0.06, 0.008, [0.55, 0.835, 0.08], 0xb03a22, 8); // chilli
    P.cyl(0.06, 0.06, 0.12, [-0.58, 0.77, 0.18], 0xd8e0d0, 8); // garlic water jar
    bottle(P, -0.5, 0.77, -0.22, 0x3a2418, 0.18); // soy
    for (let i = 0; i < 4; i++) P.cyl(0.075, 0.06, 0.02, [0.5, 0.77 + i * 0.022, -0.2], 0xe59ab0, 8); // stacked plastic plates
    // blue water drum and bucket behind, a cooler box
    P.cyl(0.25, 0.25, 0.75, [-0.8, 0, -1.4], 0x2f5fa0, 10);
    P.cyl(0.26, 0.26, 0.04, [-0.8, 0.75, -1.4], 0x2a4a80, 10);
    P.cyl(0.16, 0.13, 0.28, [0.75, 0, -1.3], 0xd8402e, 8);
    P.box(0.55, 0.38, 0.38, [0.15, 0.19, -1.5], 0xeeeae0);
    P.box(0.57, 0.06, 0.4, [0.15, 0.4, -1.5], 0x3a6a9a);
    // plastic stools for customers (to the sides, the front stays open)
    stool(P, -1.0, 0, 0.25, 0xb83a2e);
    stool(P, -1.05, 0, -0.3, 0x3a5aa0);
    stool(P, 1.0, 0, 0.3, 0xb83a2e);
    // big umbrella
    umbrella(B, -0.62, 0, -0.58, 0x4a6aa0, 2.3, 1.3);
    B.box(0.06, 0.1, 0.06, [-0.62, 1.95, -0.52], 0xfff0c0, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.6 });
  });
  sign(c, f, y, [0, 0.62, 0.37], 'LAPHING', 'ལ་ཕིང', 0xe8d070, PAL.templeRed, 1.1);
  c.colliders.push(
    localBox(f, 0, 0, 1.36, 0.7, y - 0.5, y + 0.8, 'stall'),
    localBox(f, -0.8, -1.4, 0.52, 0.52, y - 0.5, y + 0.77, 'stall'),
    localBox(f, 0.4, -1.45, 1.1, 0.5, y - 0.5, y + 0.43, 'stall'),
    localBox(f, -0.62, -0.58, 0.08, 0.08, y, y + 2.3, 'pole'),
    localBox(f, -1.0, 0.25, 0.32, 0.32, y - 0.5, y + 0.43, 'stool'),
    localBox(f, -1.05, -0.3, 0.32, 0.32, y - 0.5, y + 0.43, 'stool'),
    localBox(f, 1.0, 0.3, 0.32, 0.32, y - 0.5, y + 0.43, 'stool'),
  );
  const lp = wpos(f, y, [-0.62, 1.95, -0.52]);
  c.lamps.push({ x: lp[0], y: lp[1], z: lp[2], color: PAL.lampWarm, intensity: 4, distance: 6 });
  const ip = wpos(f, y, [0, 0.85, 0.9]);
  c.interact.push({
    id: 'market-laphing', pos: ip, radius: 1.6, label: 'Buy laphing (₹40)', priority: 1,
    onInteract: () => { buy(ITEMS.laphing, 40, 'Dolma', 'Cold laphing with extra chilli! If your eyes water, it is a good one.'); },
  });
}
