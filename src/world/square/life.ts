// Life on the square: the bus shelter, a chai stall for the taxi drivers, a fruit-and-juice cart, a
// shoe-shine kit, the public tap, a tiny general store, benches, lamp posts, potted marigolds, parked
// Enfields and scooters, and the electric poles with their tangle of wires.
import { CylinderGeometry, type Object3D } from 'three';
import type { Parts, V3 } from '../../core/geom';
import type { BoxInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import { PAL } from '../../core/palette';
import { rng, pick } from '../../core/math';
import { groundY } from '../terrain';
import { makeSign, type SignSpec } from '../../kit/sign';
import { streetLamp, bench, bin, pottedPlant, motorbike, scooter, powerPole, wire, lpgCylinders, crateStack, stringLights, signpost } from '../../kit/street';
import type { Decals } from './decals';
import { SHELTER, CHAI, JUICE, SHOESHINE, TAP, KIOSK, BENCHES, LAMP_POSTS, MANI, CHORTEN, LOTS } from './plan';

const PI = Math.PI;
export interface LifeCtx { p: Parts; big: Parts; d: Decals; signs: Object3D[] }
export interface LifeBuild { colliders: BoxInit[]; lamps: Lamp[]; tree?: V3; timetable?: V3 }

type At = { x: number; z: number; yaw: number };
const toWorld = (at: At, y0: number, l: V3): V3 => {
  const cs = Math.cos(at.yaw), sn = Math.sin(at.yaw);
  return [at.x + l[0] * cs + l[2] * sn, y0 + l[1], at.z - l[0] * sn + l[2] * cs];
};
function box(at: At, y0: number, lx: number, lz: number, w: number, d: number, h: number, tag: string): BoxInit {
  const c = toWorld(at, y0, [lx, 0, lz]);
  return { x: c[0], z: c[2], w, d, rot: at.yaw, y0: y0 - 0.1, y1: y0 + h, tag };
}
function sign(ctx: LifeCtx, at: At, y0: number, spec: SignSpec, l: V3, yaw = 0) {
  const m = makeSign(spec);
  const w = toWorld(at, y0, l);
  m.position.set(w[0], w[1], w[2]);
  m.rotation.y = at.yaw + yaw;
  m.updateMatrixWorld();
  ctx.signs.push(m);
}

// ---- bus shelter ----------------------------------------------------------------------------------------
function busShelter(ctx: LifeCtx, out: LifeBuild) {
  const { big: p, d } = ctx;
  const at = SHELTER, y0 = groundY(at.x, at.z);
  const hw = at.w / 2, hd = at.d / 2, H = 2.45;
  p.group([at.x, y0, at.z], at.yaw, () => {
    p.slab(-hw - 0.1, -0.15, -hd - 0.1, hw + 0.1, 0.1, hd + 0.05, PAL.concrete);
    p.slab(-hw - 0.1, 0.06, hd - 0.02, hw + 0.1, 0.1, hd + 0.05, PAL.curb);
    // back wall with posters and a concrete bench, posts, sloping tin roof
    p.slab(-hw, 0.1, -hd, hw, 1.25, -hd + 0.14, PAL.concrete);
    p.slab(-hw - 0.02, 1.25, -hd - 0.02, hw + 0.02, 1.31, -hd + 0.16, PAL.concreteDark);
    p.slab(-hw, 0.1, -hd, hw, 0.32, -hd + 0.15, PAL.wallYellow);
    d.quad(p.matrix, [-0.95, 0.78, -hd + 0.145], 0.36, 0.45, 'poster1');
    d.quad(p.matrix, [-0.45, 0.8, -hd + 0.145], 0.3, 0.4, 'poster2');
    d.quad(p.matrix, [0.9, 0.82, -hd + 0.145], 0.32, 0.32, 'poster3');
    d.quad(p.matrix, [0.45, 0.76, -hd + 0.145], 0.3, 0.38, 'poster2', 0, { flip: false });
    for (let i = 0; i < 3; i++) p.box(0.5, 0.02, 0.36, [-0.8 + i * 0.8, 0.5, -hd + 0.36], PAL.concrete);
    p.slab(-hw + 0.1, 0.1, -hd + 0.14, hw - 0.1, 0.46, -hd + 0.56, PAL.concreteDark);
    p.slab(-hw + 0.06, 0.46, -hd + 0.12, hw - 0.06, 0.52, -hd + 0.6, PAL.concrete);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const top = sz < 0 ? H : H + 0.25;
      p.box(0.14, top, 0.14, [sx * (hw - 0.07), top / 2 + 0.05, sz * (hd - 0.1)], PAL.wallCream);
      p.box(0.16, 0.18, 0.16, [sx * (hw - 0.07), 0.14, sz * (hd - 0.1)], PAL.concreteDark);
    }
    p.group([0, H + 0.18, 0], 0, () => {
      p.box(at.w + 0.5, 0.06, at.d + 0.6, [0, 0, 0.05], PAL.roofBlue, { rot: [0.16, 0, 0] });
      for (let i = 0; i < 14; i++) p.box(0.03, 0.02, at.d + 0.62, [-hw - 0.2 + i * 0.27, 0.04, 0.05], 0x2b4c72, { rot: [0.16, 0, 0] });
    });
    p.box(at.w + 0.5, 0.36, 0.05, [0, H + 0.12, hd + 0.33], PAL.roofBlue);
    // tube light under the roof
    p.box(1.1, 0.05, 0.06, [0, H + 0.02, 0.1], PAL.lampCool, { emit: PAL.lampCool, emitNight: true, emitIntensity: 2.2 });
    p.box(1.2, 0.04, 0.08, [0, H + 0.06, 0.1], PAL.concreteDark);
  });
  sign(ctx, at, y0, { text: 'BUS STAND', bg: PAL.roofBlue, fg: PAL.templeWhite, depth: 0.05 }, [0, H + 0.14, hd + 0.38]);
  ctx.big.group([at.x, y0, at.z], at.yaw, () => d.quad(ctx.big.matrix, [0, 1.12, -hd + 0.146], 1.6, 0.18, 'busHindi'));
  out.colliders.push(box(at, y0, 0, -hd + 0.07, at.w, 0.16, 1.31, 'shelter-wall'));
  out.colliders.push(box(at, y0, 0, -hd + 0.36, at.w - 0.2, 0.46, 0.52, 'shelter-bench'));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.colliders.push(box(at, y0, sx * (hw - 0.07), sz * (hd - 0.1), 0.16, 0.16, H, 'shelter-post'));
  out.colliders.push({ ...box(at, y0, 0, 0.05, at.w + 0.5, at.d + 0.6, H + 0.3, 'shelter-roof'), y0: y0 + H + 0.05 });
  const lp = toWorld(at, y0, [0, H - 0.2, 0.2]);
  out.lamps.push({ x: lp[0], y: lp[1], z: lp[2], color: PAL.lampCool, intensity: 3, distance: 6 });
  out.colliders.push(bin(ctx.p, at.x + 0.35, y0, at.z + hw + 0.45, PAL.roofGreen, { kind: 'drum' }));
  // timetable board on the south front post
  p.group([at.x, y0, at.z], at.yaw, () => {
    p.box(0.04, 0.8, 0.62, [-hw - 0.02, 1.5, hd - 0.4], PAL.concreteDark);
    d.quad(p.matrix, [-hw - 0.045, 1.5, hd - 0.4], 0.56, 0.76, 'timetable', -PI / 2);
  });
  out.timetable = toWorld(at, y0, [-hw - 0.3, 1.2, hd - 0.4]);
}

// ---- chai stall -------------------------------------------------------------------------------------------
function chaiStall(ctx: LifeCtx, out: LifeBuild) {
  const { p, d } = ctx;
  const at = CHAI, y0 = groundY(at.x, at.z);
  const r = rng(91);
  p.group([at.x, y0, at.z], at.yaw, () => {
    // counter: blue-painted plank front, wooden top
    p.slab(-0.85, 0, 0.0, 0.85, 0.92, 0.5, PAL.shutterBlue);
    for (let i = 0; i < 5; i++) p.box(0.02, 0.86, 0.01, [-0.68 + i * 0.34, 0.45, 0.505], 0x2b4c6a);
    p.slab(-0.9, 0.92, -0.05, 0.9, 0.97, 0.55, PAL.woodTrim);
    // back table, posts, tin roof
    p.slab(-0.85, 0, -0.6, 0.85, 0.75, -0.25, PAL.woodDoor);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.06, 2.25, 0.06, [sx * 0.88, 1.12, sz > 0 ? 0.52 : -0.62], PAL.woodDoor);
    p.box(2.1, 0.05, 1.6, [0, 2.28, -0.03], PAL.roofRust, { rot: [-0.12, 0, 0] });
    for (let i = 0; i < 8; i++) p.box(0.03, 0.02, 1.62, [-0.95 + i * 0.27, 2.31, -0.03], 0x6a3a20, { rot: [-0.12, 0, 0] });
    // two-burner stove, the big kettle, a pan of chai on the boil, glasses on a tray
    p.box(0.6, 0.1, 0.35, [-0.45, 1.02, 0.2], PAL.waterTank);
    p.cyl(0.17, 0.2, 0.3, [-0.6, 1.07, 0.2], 0xb8bcbf, 10);
    p.cyl(0.07, 0.17, 0.08, [-0.6, 1.37, 0.2], 0xb8bcbf, 10);
    p.box(0.05, 0.05, 0.22, [-0.6, 1.25, 0.38], 0xa8acaf, { rot: [-0.7, 0, 0] });
    p.box(0.24, 0.03, 0.03, [-0.6, 1.5, 0.2], PAL.waterTank);
    p.cyl(0.14, 0.14, 0.12, [-0.3, 1.07, 0.2], 0x9a9ea2, 10);
    p.cyl(0.13, 0.13, 0.01, [-0.3, 1.18, 0.2], 0xb07a4a, 10);
    p.box(0.3, 0.02, 0.03, [-0.06, 1.15, 0.2], PAL.waterTank);
    p.box(0.42, 0.02, 0.26, [0.3, 0.98, 0.28], 0xb8bcbf);
    for (let i = 0; i < 6; i++) p.cyl(0.03, 0.025, 0.08, [0.16 + (i % 3) * 0.12, 0.99, 0.2 + Math.floor(i / 3) * 0.14], i % 2 ? 0xc8a070 : 0xd8d4c4, 6);
    // glass jars of biscuits and rusk with coloured lids
    for (let i = 0; i < 4; i++) {
      p.cyl(0.08, 0.08, 0.2, [0.18 + i * 0.18, 0.75, -0.42], 0xa8c0c8, 8);
      p.cyl(0.085, 0.085, 0.04, [0.18 + i * 0.18, 0.95, -0.42], [PAL.roofRed, PAL.wallYellow, PAL.roofGreen, PAL.roofBlue][i], 8);
      p.cyl(0.07, 0.07, 0.12, [0.18 + i * 0.18, 0.78, -0.42], [0xd8b070, 0xc89050, 0xe0c080, 0xb8804a][i], 8);
    }
    // hanging bulb and a string of snack packets
    p.box(0.01, 0.3, 0.01, [0.1, 2.05, 0.0], PAL.hair);
    p.box(0.07, 0.09, 0.07, [0.1, 1.86, 0.0], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 2 });
    p.box(1.6, 0.02, 0.02, [0, 1.98, 0.5], PAL.hair);
    for (let i = 0; i < 9; i++) p.box(0.12, 0.2, 0.02, [-0.7 + i * 0.17, 1.86, 0.5], pick(r, [0xd83a2a, 0x2f8a4a, 0xf1c232, 0x2f63b8, 0xe07a2e]));
    // milk can, gas cylinder, a stool
    p.cyl(0.14, 0.16, 0.45, [0.6, 0, -0.85], 0xb8bcbf, 10);
    p.cyl(0.07, 0.14, 0.1, [0.6, 0.45, -0.85], 0xb8bcbf, 10);
    p.cyl(0.18, 0.15, 0.03, [-0.6, 0.42, 0.95], PAL.roofRed, 8);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.03, 0.42, 0.03, [-0.6 + sx * 0.1, 0.21, 0.95 + sz * 0.1], PAL.roofRed);
  });
  out.colliders.push(lpgCylinders(p, at.x - 0.55, y0, at.z - 0.85, 2, 5));
  sign(ctx, at, y0, { text: 'CHAI', bg: PAL.roofRed, fg: PAL.templeYellow, depth: 0.05 }, [0, 2.48, 0.74]);
  p.group([at.x, y0, at.z], at.yaw, () => d.quad(p.matrix, [0.55, 0.62, 0.51], 0.36, 0.2, 'chaiHindi'));
  out.colliders.push(box(at, y0, 0, -0.05, 1.86, 1.2, 0.97, 'stall'));
  out.colliders.push({ ...box(at, y0, 0, -0.03, 2.1, 1.6, 2.36, 'stall-roof'), y0: y0 + 2.18 });
  const lp = toWorld(at, y0, [0.1, 1.8, 0.1]);
  out.lamps.push({ x: lp[0], y: lp[1], z: lp[2], color: PAL.lampWarm, intensity: 2.5, distance: 5 });
}

// ---- fruit & juice cart ------------------------------------------------------------------------------------
function juiceCart(ctx: LifeCtx, out: LifeBuild) {
  const { p } = ctx;
  const at = JUICE, y0 = groundY(at.x, at.z);
  p.group([at.x, y0, at.z], at.yaw, () => {
    for (const sx of [-0.62, 0.62]) for (const sz of [-0.32, 0.32]) {
      p.add(new CylinderGeometry(0.22, 0.22, 0.04, 10), PAL.hair, [sx, 0.22, sz], { rot: [0, 0, PI / 2] });
      p.add(new CylinderGeometry(0.06, 0.06, 0.06, 6), 0x9a9ea2, [sx, 0.22, sz], { rot: [0, 0, PI / 2] });
    }
    p.slab(-0.82, 0.42, -0.42, 0.82, 0.72, 0.42, PAL.roofGreen);
    p.slab(-0.84, 0.72, -0.44, 0.84, 0.76, 0.44, PAL.woodTrim);
    p.slab(-0.84, 0.42, 0.42, 0.84, 0.5, 0.45, PAL.templeYellow);
    // glass case on the back half, fruit pyramids in front
    p.slab(-0.8, 0.76, -0.42, 0.2, 1.18, -0.05, 0x8fb0b8);
    p.slab(-0.82, 1.18, -0.44, 0.22, 1.21, -0.03, PAL.woodTrim);
    for (let i = 0; i < 5; i++) p.box(0.14, 0.12, 0.14, [-0.68 + i * 0.2, 0.84, -0.24], [0xd8c050, 0xc04a3a, 0xe8a040, 0x6a2a3a, 0x9ab040][i]);
    const pile = (cx: number, cz: number, c: number, c2: number) => {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.box(0.09, 0.08, 0.09, [cx - 0.1 + i * 0.1, 0.8, cz - 0.05 + j * 0.1], (i + j) % 2 ? c : c2);
      for (let i = 0; i < 2; i++) p.box(0.09, 0.08, 0.09, [cx - 0.05 + i * 0.1, 0.88, cz], c);
      p.box(0.09, 0.08, 0.09, [cx, 0.96, cz], c2);
    };
    pile(-0.55, 0.22, 0xe8862a, 0xd87420); // oranges
    pile(-0.18, 0.22, 0xb8322b, 0xa02a2a); // apples
    pile(0.18, 0.22, 0x7a1f2b, 0x902a30);  // pomegranates
    pile(0.55, 0.22, 0x9ab040, 0x84a038);  // mosambi
    // juicer, glasses, a bunch of bananas hanging from the umbrella pole
    p.box(0.22, 0.3, 0.22, [0.55, 0.91, -0.22], 0xb8bcbf);
    p.box(0.04, 0.22, 0.04, [0.55, 1.15, -0.1], 0x6f767c, { rot: [0.6, 0, 0] });
    for (let i = 0; i < 3; i++) p.cyl(0.03, 0.025, 0.1, [0.3 + i * 0.08, 0.76, -0.3], 0xe0a050, 6);
    p.box(0.035, 1.6, 0.035, [0.75, 1.5, 0.3], PAL.hair);
    for (let i = 0; i < 4; i++) p.box(0.04, 0.16, 0.04, [0.72 + (i % 2) * 0.06, 1.55 - i * 0.03, 0.26 + Math.floor(i / 2) * 0.06], 0xe8c040, { rot: [0, 0, 0.3] });
    // the striped sun umbrella
    for (let i = 0; i < 8; i++) {
      const g = new CylinderGeometry(0, 1.05, 0.32, 1, 1, false, (i / 8) * PI * 2, PI / 4);
      p.add(g, i % 2 ? PAL.templeYellow : 0xc8322b, [0.75, 2.25, 0.3]);
    }
  });
  out.colliders.push(box(at, y0, 0, 0, 1.7, 0.92, 1.0, 'cart'));
  sign(ctx, at, y0, { text: 'FRESH JUICE', bg: PAL.roofGreen, fg: PAL.templeWhite, glow: false, depth: 0.03 }, [0, 0.6, 0.47]);
  out.colliders.push(bin(ctx.p, at.x + 1.3, y0, at.z - 0.2, PAL.roofBlue, { kind: 'drum' }));
}

// ---- shoe-shine kit ------------------------------------------------------------------------------------------
function shoeShine(ctx: LifeCtx, out: LifeBuild) {
  const { p } = ctx;
  const at = SHOESHINE, y0 = groundY(at.x, at.z);
  p.group([at.x, y0, at.z], at.yaw, () => {
    p.box(0.9, 0.02, 0.7, [0, 0.01, 0.05], 0x7a2a2e);
    p.box(0.86, 0.022, 0.03, [0, 0.012, 0.38], PAL.templeYellow);
    p.slab(-0.22, 0, -0.16, 0.22, 0.28, 0.16, PAL.woodDoor);
    p.box(0.2, 0.06, 0.3, [0, 0.33, 0], PAL.woodTrim, { rot: [0.25, 0, 0] }); // foot rest
    p.box(0.46, 0.04, 0.02, [0, 0.2, 0.17], PAL.templeYellow);
    for (let i = 0; i < 3; i++) p.cyl(0.045, 0.045, 0.035, [-0.32 + i * 0.1, 0.02, 0.3], [PAL.hair, 0x6a3f24, 0x8a2a2a][i], 8);
    p.box(0.16, 0.05, 0.06, [0.3, 0.05, 0.25], PAL.hair);
    p.box(0.16, 0.03, 0.06, [0.3, 0.09, 0.25], 0xb88a5a);
    p.box(0.14, 0.04, 0.05, [0.32, 0.04, 0.1], 0x6a3f24);
    p.box(0.22, 0.02, 0.12, [-0.3, 0.035, -0.15], 0xd8d0b8); // rag
    p.slab(-0.12, 0, -0.62, 0.12, 0.25, -0.38, 0x3d5f86); // little stool
    p.box(0.6, 0.012, 0.25, [0, 0.02, 0.62], PAL.concreteStain); // polish stain
  });
  out.colliders.push(box(at, y0, 0, 0, 0.46, 0.34, 0.36, 'shoeshine'));
}

// ---- public water tap --------------------------------------------------------------------------------------
function waterTap(ctx: LifeCtx, out: LifeBuild) {
  const { p, d } = ctx;
  const at = TAP, y0 = groundY(at.x, at.z);
  p.group([at.x, y0, at.z], at.yaw, () => {
    p.slab(-0.38, -0.1, -0.1, 0.38, 0.22, 0.42, PAL.concrete);
    p.slab(-0.3, 0.12, -0.02, 0.3, 0.23, 0.34, PAL.drain);
    p.slab(-0.15, 0, -0.2, 0.15, 0.95, 0.0, PAL.concrete);
    p.slab(-0.17, 0.95, -0.22, 0.17, 1.0, 0.02, PAL.concreteDark);
    p.box(0.05, 0.05, 0.16, [0, 0.78, 0.07], PAL.gold);
    p.box(0.04, 0.08, 0.04, [0, 0.72, 0.14], PAL.gold);
    p.box(0.1, 0.02, 0.02, [0, 0.83, 0.07], PAL.goldDeep);
    p.box(0.03, 0.18, 0.03, [0, 0.55, 0.14], PAL.waterLight, { emit: PAL.waterLight, emitIntensity: 0.15 });
    p.box(0.9, 0.012, 0.7, [0.2, 0.005, 0.7], PAL.water); // puddle
    p.cyl(0.15, 0.12, 0.3, [0.52, 0, 0.45], 0xb8bcbf, 10);
    p.cyl(0.13, 0.11, 0.28, [-0.55, 0, 0.35], PAL.roofBlue, 10);
    p.box(0.2, 0.02, 0.02, [-0.55, 0.32, 0.35], PAL.roofBlue);
  });
  ctx.p.group([at.x, y0, at.z], at.yaw, () => d.quad(ctx.p.matrix, [0, 0.4, 0.425], 0.36, 0.14, 'tapNote'));
  out.colliders.push(box(at, y0, 0, 0.16, 0.76, 0.52, 0.22, 'tap-basin'));
  out.colliders.push(box(at, y0, 0, -0.1, 0.34, 0.24, 1.0, 'tap'));
}

// ---- tiny general store -------------------------------------------------------------------------------------
function kiosk(ctx: LifeCtx, out: LifeBuild) {
  const { big: p, d } = ctx;
  const at = KIOSK, y0 = groundY(at.x, at.z);
  const r = rng(23);
  const W = 1.5, D = 1.15, H = 2.2;
  p.group([at.x, y0, at.z], at.yaw, () => {
    p.slab(-W / 2 - 0.05, -0.1, -D / 2 - 0.05, W / 2 + 0.05, 0.25, D / 2 + 0.05, PAL.concrete);
    p.slab(-W / 2, 0.25, -D / 2, W / 2, H, -D / 2 + 0.08, PAL.wallMint);
    p.slab(-W / 2, 0.25, -D / 2, -W / 2 + 0.08, H, D / 2, PAL.wallMint);
    p.slab(W / 2 - 0.08, 0.25, -D / 2, W / 2, H, D / 2, PAL.wallMint);
    p.slab(-W / 2, 0.25, D / 2 - 0.08, W / 2, 0.95, D / 2, PAL.shutterGreen);
    p.slab(-W / 2 - 0.02, 0.95, D / 2 - 0.12, W / 2 + 0.02, 1.0, D / 2 + 0.12, PAL.woodTrim);
    p.slab(-W / 2, H - 0.3, D / 2 - 0.08, W / 2, H, D / 2, PAL.wallMint);
    p.box(W + 0.4, 0.05, D + 0.6, [0, H + 0.06, 0.15], PAL.roofGreen, { rot: [-0.1, 0, 0] });
    p.slab(-W / 2 + 0.08, 0.25, -D / 2 + 0.08, W / 2 - 0.08, H - 0.3, D / 2 - 0.08, 0x3a3430);
    // shelves of packets, bottles and tins
    for (let s = 0; s < 3; s++) {
      p.slab(-W / 2 + 0.1, 1.1 + s * 0.28, -D / 2 + 0.1, W / 2 - 0.1, 1.13 + s * 0.28, -D / 2 + 0.38, PAL.woodTrim);
      for (let i = 0; i < 9; i++) p.box(0.1, 0.16 + r() * 0.06, 0.12, [-0.58 + i * 0.145, 1.21 + s * 0.28, -D / 2 + 0.24], pick(r, [0xd83a2a, 0x2f8a4a, 0xf1c232, 0x2f63b8, 0xe07a2e, 0xeeeae0, 0x6a3a8a]));
    }
    // chips packets hanging in strips across the opening
    for (let k = 0; k < 6; k++) for (let j = 0; j < 4; j++) {
      p.box(0.12, 0.14, 0.02, [-0.6 + k * 0.24, 1.78 - j * 0.16, D / 2 + 0.02], pick(r, [0xd83a2a, 0x2f8a4a, 0xf1c232, 0x2f63b8, 0xe07a2e]));
    }
    p.box(W, 0.02, 0.02, [0, 1.88, D / 2 + 0.03], PAL.hair);
    // cold-drink fridge outside
    p.slab(W / 2 + 0.08, 0, -0.3, W / 2 + 0.68, 1.4, 0.3, 0xc8322b);
    p.slab(W / 2 + 0.12, 0.6, 0.3, W / 2 + 0.64, 1.3, 0.32, 0x8fb0b8, { emit: 0xdfe8ff, emitNight: true, emitIntensity: 0.5 });
    for (let s = 0; s < 3; s++) for (let i = 0; i < 4; i++) p.box(0.06, 0.16, 0.02, [W / 2 + 0.2 + i * 0.12, 0.72 + s * 0.2, 0.33], pick(r, [0x3a1a14, 0xe07a2e, 0x2f8a4a, 0xd8d0c0]));
    p.box(0.07, 0.07, 0.07, [0, H - 0.4, 0.2], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 2 });
  });
  p.group([at.x, y0, at.z], at.yaw, () => d.quad(p.matrix, [W / 2 + 0.38, 1.2, 0.305], 0.5, 0.1, 'kioskDrink', 0));
  sign(ctx, at, y0, { text: 'STORE', bod: 'ཚོང་ཁང་', bg: PAL.templeYellow, fg: PAL.templeMaroon, depth: 0.04 }, [0, H - 0.12, D / 2 + 0.05]);
  out.colliders.push(box(at, y0, 0, 0, W, D, H + 0.1, 'kiosk'));
  out.colliders.push(box(at, y0, W / 2 + 0.38, 0, 0.62, 0.62, 1.4, 'fridge'));
  const lp = toWorld(at, y0, [0, H - 0.5, 0.5]);
  out.lamps.push({ x: lp[0], y: lp[1], z: lp[2], color: PAL.lampWarm, intensity: 2, distance: 4.5 });
}

// ---- old deodar on a whitewashed chabutra in the south-east corner -----------------------------------------
export const TREE = { x: 12.6, z: 16.6 };
function deodarCorner(ctx: LifeCtx, out: LifeBuild): V3 {
  const { big: p } = ctx;
  const { x, z } = TREE, y0 = groundY(x, z);
  const r = rng(808);
  p.group([x, y0, z], 0.4, () => {
    // chabutra: round whitewashed platform with an ochre band and a stone rim
    p.cyl(1.4, 1.45, 0.5, [0, -0.25, 0], PAL.wallWhite, 12);
    p.cyl(1.46, 1.48, 0.12, [0, -0.05, 0], PAL.wallOchre, 12);
    p.cyl(1.5, 1.5, 0.07, [0, 0.25, 0], PAL.stoneStep, 12);
    p.cyl(0.95, 0.95, 0.02, [0, 0.31, 0], PAL.earthDark, 10);
    // trunk with khatas and a red thread tied round it
    p.cyl(0.24, 0.34, 2.4, [0, 0.3, 0], PAL.bark, 7);
    p.cyl(0.26, 0.26, 0.06, [0, 1.25, 0], PAL.templeRed, 7);
    for (let i = 0; i < 3; i++) p.box(0.1, 0.55, 0.03, [Math.cos(i * 2.1) * 0.27, 1.0, Math.sin(i * 2.1) * 0.27], PAL.templeWhite, { rot: [0, -i * 2.1, 0.12] });
    // drooping tiers, dark below and lit on top
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const ty = 1.9 + i * 0.9, rr = 1.9 - i * 0.27, rot = r() * 2;
      p.cone(rr, 0.85, [0, ty, 0], i % 2 ? PAL.deodarDark : PAL.deodar, 8, { rot: [0, rot, 0] });
      p.cone(rr * 0.82, 0.75, [0, ty + 0.22, 0], PAL.deodarLight, 8, { rot: [0, rot + 0.3, 0] });
      for (let k = 0; k < 4; k++) {
        const a = rot + k * 1.57 + r() * 0.5;
        p.box(0.5, 0.18, 0.4, [Math.sin(a) * rr * 0.92, ty + 0.12, Math.cos(a) * rr * 0.92], PAL.deodar, { rot: [0, a, -0.25] });
      }
    }
    p.cone(0.32, 1.1, [0, 1.9 + tiers * 0.9, 0], PAL.deodarLight, 6);
    // a few marigold pots and an incense stick holder on the platform
    p.cyl(0.07, 0.06, 0.1, [0.75, 0.32, 0.5], PAL.khorloCopper, 6);
    for (let i = 0; i < 3; i++) p.box(0.012, 0.25, 0.012, [0.72 + i * 0.03, 0.5, 0.5], PAL.earthDark);
  });
  out.colliders.push({ x, z, w: 2.9, d: 2.9, rot: 0.4 + PI / 8, y0: y0 - 0.3, y1: y0 + 0.32, tag: 'chabutra' });
  out.colliders.push({ x, z, w: 0.6, d: 0.6, rot: 0, y0: y0 + 0.3, y1: y0 + 9, tag: 'tree' });
  return [x, y0 + 3.6, z];
}

// ---- the rest: benches, lamp posts, pots, bikes, poles and wires --------------------------------------------
export function buildLife(ctx: LifeCtx): LifeBuild {
  const out: LifeBuild = { colliders: [], lamps: [] };
  busShelter(ctx, out);
  chaiStall(ctx, out);
  juiceCart(ctx, out);
  shoeShine(ctx, out);
  waterTap(ctx, out);
  kiosk(ctx, out);
  out.tree = deodarCorner(ctx, out);
  const { p } = ctx;

  BENCHES.forEach((b, i) => out.colliders.push(bench(p, b.x, groundY(b.x, b.z), b.z, b.yaw, PAL.woodTrim, { kind: i % 2 ? 'concrete' : 'wood', seed: 300 + i })));
  LAMP_POSTS.forEach((l, i) => {
    const { lamp, collider } = streetLamp(p, l.x, groundY(l.x, l.z), l.z, l.yaw, i % 3 === 1 ? 'old' : 'arm', 400 + i);
    out.colliders.push(collider);
    // the square is wide and its posts stand at the edges: they throw a little further than street lamps
    out.lamps.push({ ...lamp, intensity: lamp.intensity * 1.35, distance: 12 });
  });

  // potted plants: round the shrine plinth, by the chorten gate, along shop fronts
  const pots: [number, number, number][] = [];
  const mc = Math.cos(MANI.yaw), ms = Math.sin(MANI.yaw);
  // (outside the plinth, so the kora walk on it stays clear)
  for (const [lx, lz] of [[-3.95, 3.95], [3.95, 3.95], [-3.95, -3.95], [-1.8, 3.88], [1.8, 3.88], [2.3, 3.95]]) {
    pots.push([MANI.x + lx * mc + lz * ms, 0, MANI.z - lx * ms + lz * mc]);
  }
  const yd = CHORTEN.yard / 2;
  pots.push([CHORTEN.x - 1.2, 0, CHORTEN.z + yd + 0.3], [CHORTEN.x + 1.2, 0, CHORTEN.z + yd + 0.3], [CHORTEN.x + 1.55, 0, CHORTEN.z + yd + 0.3]);
  const r = rng(55);
  for (const l of LOTS) {
    if (r() < 0.35) continue;
    const cs = Math.cos(l.yaw), sn = Math.sin(l.yaw);
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const lx = (r() < 0.5 ? -1 : 1) * (l.w / 2 - 0.25 - i * 0.32), lz = l.d / 2 + 0.28;
      pots.push([l.x + lx * cs + lz * sn, 0, l.z - lx * sn + lz * cs]);
    }
  }
  pots.forEach(([x, dy, z], i) => out.colliders.push(pottedPlant(p, x, groundY(x, z) + dy, z, 700 + i)));

  // parked bikes: Enfields nose-in on the north-east pavement, scooters by the west shops
  const bikes: [number, number, number, 'e' | 's'][] = [
    [15.0, -9.5, PI + 0.35, 'e'], [16.0, -9.55, PI + 0.3, 'e'], [17.0, -9.5, PI + 0.4, 's'], [20.2, -9.55, PI + 0.3, 'e'], [21.1, -9.5, PI + 0.25, 's'],
    [-13.15, -6.6, -PI / 2 + 0.3, 's'], [-13.2, -5.8, -PI / 2 + 0.25, 's'], [-0.4, -9.3, PI + 0.5, 'e'],
  ];
  bikes.forEach(([x, z, yaw, k], i) => out.colliders.push((k === 'e' ? motorbike : scooter)(p, x, groundY(x, z), z, yaw, 500 + i)));
  out.colliders.push(crateStack(p, 10.0, groundY(10, -10.2), -10.2, 0.2, 31));
  // luggage waiting by the bus door: a tin trunk, a bedroll, a gunny sack and a striped bag
  {
    const x = 14.75, z = 9.9, y = groundY(x, z);
    p.group([x, y, z], 0.3, () => {
      p.box(0.7, 0.36, 0.42, [0, 0.18, 0], 0x3a3f46);
      p.box(0.72, 0.03, 0.44, [0, 0.37, 0], 0xc4c8cb);
      p.add(new CylinderGeometry(0.17, 0.17, 0.62, 8), 0x6a2630, [0, 0.55, 0.0], { rot: [0, 0, PI / 2] });
      p.box(0.05, 0.36, 0.05, [0.18, 0.55, 0], 0xd9c9a6);
      p.box(0.45, 0.5, 0.36, [0.05, 0.25, 0.55], 0xc2a77a, { rot: [0, 0.4, 0.06] });
      p.box(0.4, 0.3, 0.22, [-0.55, 0.15, 0.4], 0x2f63b8, { rot: [0, -0.3, 0] });
      for (let i = 0; i < 3; i++) p.box(0.41, 0.04, 0.23, [-0.55, 0.06 + i * 0.1, 0.4], i % 2 ? 0xc8322b : 0xf1c232, { rot: [0, -0.3, 0] });
    });
    out.colliders.push({ x, z: z + 0.2, w: 1.3, d: 1.1, rot: 0.3, y0: y, y1: y + 0.72, tag: 'luggage' });
  }

  // electric poles along the north side and the wires between them and down to the shops
  const pole = (x: number, z: number, yaw: number, seed: number) => {
    const P = powerPole(p, x, groundY(x, z), z, yaw, 'concrete', seed);
    out.colliders.push(P.collider);
    return P;
  };
  const P1 = pole(13.9, -10.25, PI / 2, 61), P2 = pole(-0.85, -10.3, PI / 2, 62), P3 = pole(-13.0, -10.25, PI / 2, 63);
  // (the span over the Dharamkot Road corridor is left to the props module)
  wire(p, P2.top, P3.top, 0.8, 3);
  wire(p, P2.low, P3.low, 0.6, 2, undefined, 0.3);
  wire(p, P1.top, [22.6, 7.6, -10.75], 0.5, 2);
  const drop = (P: { low: V3 }, x: number, y: number, z: number) => wire(p, P.low, [x, y, z], 0.25, 1);
  drop(P1, 10.2, 3.15, -10.75); drop(P1, 15.6, 4.4, -10.75); drop(P1, 18.4, 4.8, -10.75); // (N5 is one storey: into its parapet)
  drop(P2, -2.6, 4.5, -10.75); drop(P2, -4.8, 5.0, -10.75);
  drop(P3, -11.8, 4.7, -10.75); drop(P3, -14.0, 4.4, -9.0); drop(P3, -16.0, 5.2, -10.75);

  // café string lights (glow at night)
  const warm = [PAL.stringLight, 0xffb070, PAL.stringLight, 0xff8a6a, 0x9ad0ff];
  out.lamps.push(...stringLights(p, [-15.0, 3.35, -10.85], [-10.3, 3.25, -10.85], 0.25, { colors: warm }));
  out.lamps.push(...stringLights(p, [12.8, 3.3, -10.85], [17.4, 3.4, -10.85], 0.25, { colors: [PAL.stringLight] }));
  out.lamps.push(...stringLights(p, [16.25, 2.75, 1.95], [16.25, 2.7, 6.75], 0.2, { colors: warm }));
  out.lamps.push(...stringLights(p, [CHAI.x - 1.0, 2.35, CHAI.z + 0.75], [13.6, 4.2, -9.4], 0.35, { colors: warm, lampEvery: 10 }));
  // signpost to the temple at the head of Temple Road
  const sp = signpost(p, -0.7, groundY(-0.7, 8.8), 8.8, PI / 2 + 0.45, { text: 'TEMPLE', bod: 'གཙུག་ལག་ཁང་', bg: PAL.roofGreen, fg: PAL.templeWhite, glow: false });
  out.colliders.push(sp.collider);
  if (sp.sign) ctx.signs.push(sp.sign);
  return out;
}
