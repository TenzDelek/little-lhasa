// Vehicles parked on the square: a red-and-cream HRTC (Himachal Roadways) bus and the white hill taxis —
// Toyota Innova, Tata Sumo with a tarp-covered roof rack, a Maruti Omni van. Flat-coloured Parts with
// extruded side profiles, wheels slightly proud of the body, 1-px plates / wipers / sun strips. Headlights
// glow at night. Every vehicle registers box colliders (roofs are standable).
import { CylinderGeometry, ExtrudeGeometry, Shape, Vector2, type Object3D } from 'three';
import type { Parts, V3, PartOpts } from '../../core/geom';
import type { BoxInit } from '../../core/collision';
import { PAL } from '../../core/palette';
import { rng } from '../../core/math';
import { makeSign, type SignSpec } from '../../kit/sign';
import type { Decals } from './decals';
import type { VehicleSpot } from './plan';

const PI = Math.PI;
const C = {
  white: 0xebe8e0, whiteShade: 0xd8d4ca, silver: 0xc4c6c4, glass: 0x26323c, glassHi: 0x46586a,
  rubber: 0x1e1d1d, hub: 0x8a8d90, chrome: 0xcfd3d6, black: 0x242325, grille: 0x2e3032,
  head: 0xf3efe0, tail: 0xb4231e, amber: 0xe08a22, dust: 0xb5a98f, mud: 0x8a7a60,
  hrtcRed: 0xb52a2a, hrtcRedDark: 0x8e1f20, cream: 0xf1ead2, tarpBlue: 0x2f5f9a, sack: 0xc2a77a, trunk: 0x3a3f46,
  taxi: 0xf1c232,
};

export interface VehicleCtx { p: Parts; d: Decals; signs: Object3D[] }
export interface VehicleBuild { colliders: BoxInit[] }

/** Side profile (z, y pairs, nose at +z) extruded across the width, centred on x. */
function profile(p: Parts, pts: [number, number][], width: number, color: number, o?: PartOpts) {
  const shape = new Shape(pts.map(([z, y]) => new Vector2(z, y)));
  const g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.rotateY(-PI / 2);
  g.translate(width / 2, 0, 0);
  p.add(g, color, [0, 0, 0], o);
}

/** Wheel with its axle along x, centred at (x, y, z). */
function wheel(p: Parts, x: number, y: number, z: number, r: number, w: number, hubC = C.hub) {
  p.add(new CylinderGeometry(r, r, w, 12), C.rubber, [x, y, z], { rot: [0, 0, PI / 2] });
  p.add(new CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8), hubC, [x, y, z], { rot: [0, 0, PI / 2] });
  p.add(new CylinderGeometry(r * 0.18, r * 0.18, w + 0.04, 6), C.black, [x, y, z], { rot: [0, 0, PI / 2] });
}

/** A kit sign mesh placed in the vehicle's frame (local position, facing local yaw). */
function sign(ctx: VehicleCtx, at: VehicleSpot, y0: number, spec: SignSpec, l: V3, yaw: number) {
  const m = makeSign(spec);
  const cs = Math.cos(at.yaw), sn = Math.sin(at.yaw);
  m.position.set(at.x + l[0] * cs + l[2] * sn, y0 + l[1], at.z - l[0] * sn + l[2] * cs);
  m.rotation.y = at.yaw + yaw;
  m.updateMatrixWorld();
  ctx.signs.push(m);
  return m;
}

function colliderBox(at: VehicleSpot, y0: number, lz: number, w: number, d: number, top: number, tag = 'vehicle'): BoxInit {
  const cs = Math.cos(at.yaw), sn = Math.sin(at.yaw);
  return { x: at.x + lz * sn, z: at.z + lz * cs, w, d, rot: at.yaw, y0, y1: y0 + top, tag };
}

// ---- HRTC bus ------------------------------------------------------------------------------------------------
export function buildBus(ctx: VehicleCtx, at: VehicleSpot, y0: number): VehicleBuild {
  const { p, d } = ctx;
  const L = 10.4, W = 2.5, hl = L / 2, hw = W / 2;
  const r = rng(at.seed * 31 + 7);
  p.group([at.x, y0, at.z], at.yaw, () => {
    // chassis shadow block and wheels (front axle single, rear dual)
    p.slab(-hw + 0.25, 0.32, -hl + 0.6, hw - 0.25, 0.62, hl - 0.6, C.black);
    for (const s of [-1, 1]) {
      wheel(p, s * (hw - 0.14), 0.5, 3.35, 0.5, 0.3);
      wheel(p, s * (hw - 0.14), 0.5, -2.55, 0.5, 0.34);
      p.slab(s > 0 ? hw - 0.02 : -hw - 0.04, 0.95, 2.7, s > 0 ? hw + 0.04 : -hw + 0.02, 1.08, 4.0, C.black); // arches
      p.slab(s > 0 ? hw - 0.02 : -hw - 0.04, 0.95, -3.25, s > 0 ? hw + 0.04 : -hw + 0.02, 1.08, -1.85, C.black);
    }
    // body: red lower, cream band, window band, cream upper with a red pinstripe, white roof
    p.slab(-hw, 0.62, -hl, hw, 1.4, hl, C.hrtcRed);
    p.slab(-hw - 0.01, 0.62, -hl - 0.01, hw + 0.01, 0.72, hl + 0.01, C.hrtcRedDark);
    p.slab(-hw - 0.012, 1.34, -hl - 0.012, hw + 0.012, 1.42, hl + 0.012, C.cream);
    p.slab(-hw, 1.4, -hl, hw, 2.96, hl, C.cream);
    p.slab(-hw - 0.012, 2.56, -hl - 0.012, hw + 0.012, 2.64, hl + 0.012, C.hrtcRed);
    p.slab(-hw + 0.06, 2.96, -hl + 0.06, hw - 0.06, 3.06, hl - 0.06, C.white);
    // mud on the skirts (it climbs from the plains every day)
    p.slab(-hw - 0.015, 0.62, -hl - 0.015, hw + 0.015, 0.8, hl + 0.015, C.mud);
    for (let i = 0; i < 9; i++) p.box(0.02, 0.04 + r() * 0.06, 0.25 + r() * 0.5, [(r() < 0.5 ? -1 : 1) * (hw + 0.016), 0.79 + r() * 0.02, -4.6 + i * 1.15], C.dust);
    // side windows with cream pillars; the door is on the left (east, +x) near the front
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.006);
      p.box(0.02, 0.92, L - 0.9, [x, 1.93, -0.15], C.glass);
      for (let i = 0; i <= 9; i++) {
        const z = -4.6 + i * 0.98;
        if (s > 0 && z > 3.1 && z < 4.6) continue;
        p.box(0.03, 0.94, 0.12, [s * (hw + 0.012), 1.93, z], C.cream);
        p.box(0.025, 0.03, 0.85, [s * (hw + 0.016), 1.88, z + 0.49], C.chrome); // sliding sash rail
      }
    }
    // door (left / east side): glazed folding leaves + step
    p.box(0.04, 1.95, 0.92, [hw + 0.02, 1.4, 3.85], C.hrtcRedDark);
    p.box(0.05, 0.9, 0.38, [hw + 0.035, 1.9, 3.62], C.glassHi);
    p.box(0.05, 0.9, 0.38, [hw + 0.035, 1.9, 4.08], C.glassHi);
    p.box(0.05, 1.7, 0.04, [hw + 0.04, 1.45, 3.85], C.black);
    p.slab(hw - 0.1, 0.45, 3.4, hw + 0.15, 0.55, 4.3, C.chrome);
    // front face: windscreen (two panes), destination board, grille, lamps, bumper, plate
    const zf = hl + 0.01;
    p.box(1.12, 1.02, 0.03, [-0.58, 1.95, zf], C.glass);
    p.box(1.12, 1.02, 0.03, [0.58, 1.95, zf], C.glass);
    p.box(0.06, 1.04, 0.04, [0, 1.95, zf + 0.005], C.black);
    p.box(0.02, 0.6, 0.02, [-0.6, 1.72, zf + 0.025], C.black, { rot: [0, 0, 0.6] }); // wipers
    p.box(0.02, 0.6, 0.02, [0.55, 1.72, zf + 0.025], C.black, { rot: [0, 0, 0.6] });
    p.box(2.3, 0.08, 0.03, [0, 2.42, zf + 0.01], 0x2f6f55); // tinted sun strip
    p.box(2.0, 0.36, 0.05, [0, 2.72, zf + 0.01], C.black);
    p.box(1.3, 0.4, 0.06, [0, 1.0, zf + 0.01], C.grille);
    for (let i = 0; i < 4; i++) p.box(1.24, 0.03, 0.02, [0, 0.86 + i * 0.09, zf + 0.04], C.chrome);
    for (const s of [-1, 1]) {
      p.box(0.24, 0.2, 0.04, [s * 0.95, 1.0, zf + 0.01], C.chrome);
      p.box(0.18, 0.15, 0.03, [s * 0.95, 1.0, zf + 0.035], C.head, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.8 });
      p.box(0.12, 0.08, 0.03, [s * 1.15, 1.25, zf + 0.02], C.amber, { emit: C.amber, emitNight: true, emitIntensity: 0.5 });
      p.box(0.06, 0.32, 0.06, [s * (hw + 0.1), 2.05, hl - 0.25], C.black); // mirror arm + head
      p.box(0.12, 0.28, 0.05, [s * (hw + 0.16), 1.85, hl - 0.15], C.black);
    }
    p.slab(-hw - 0.03, 0.5, hl - 0.05, hw + 0.03, 0.72, hl + 0.12, C.black);
    d.quad(p.matrix, [0, 0.62, hl + 0.125], 0.5, 0.12, 'plate0');
    d.quad(p.matrix, [0, 1.3, zf + 0.03], 0.34, 0.15, 'busNo');
    // rear: window, ladder to the roof carrier, tail lamps, plate, HRTC lettering
    const zb = -hl - 0.01;
    p.box(1.9, 0.75, 0.03, [0, 2.05, zb], C.glass);
    for (const s of [-1, 1]) {
      p.box(0.14, 0.32, 0.03, [s * 1.0, 1.0, zb - 0.01], C.tail, { emit: C.tail, emitNight: true, emitIntensity: 0.6 });
      p.box(0.12, 0.1, 0.03, [s * 1.0, 1.25, zb - 0.01], C.amber);
    }
    for (const lx of [-0.95, -0.6]) p.box(0.04, 2.5, 0.04, [lx, 1.9, zb - 0.12], C.chrome);
    for (let i = 0; i < 8; i++) p.box(0.38, 0.03, 0.03, [-0.775, 0.85 + i * 0.3, zb - 0.12], C.chrome);
    p.slab(-hw - 0.03, 0.5, -hl - 0.12, hw + 0.03, 0.72, -hl + 0.05, C.black);
    d.quad(p.matrix, [0.35, 0.62, -hl - 0.125], 0.5, 0.12, 'plate1', PI);
    d.quad(p.matrix, [0, 1.62, zb - 0.02], 0.62, 0.26, 'hrtcLogo', PI);
    // roof carrier: rails on posts and the day's luggage
    for (const s of [-1, 1]) {
      p.slab(s * (hw - 0.12) - 0.025, 3.28, -4.4, s * (hw - 0.12) + 0.025, 3.32, 3.6, C.chrome);
      for (let i = 0; i <= 8; i++) p.box(0.04, 0.26, 0.04, [s * (hw - 0.12), 3.18, -4.4 + i * 1.0], C.chrome);
    }
    p.slab(-hw + 0.12, 3.28, -4.42, hw - 0.12, 3.32, -4.38, C.chrome);
    p.slab(-hw + 0.12, 3.28, 3.58, hw - 0.12, 3.32, 3.62, C.chrome);
    p.box(1.6, 0.45, 1.4, [0.1, 3.28, -3.3], C.tarpBlue, { rot: [0, 0.05, 0] });
    for (let i = 0; i < 3; i++) p.box(1.64, 0.03, 0.03, [0.1, 3.5, -3.8 + i * 0.5], 0xd9c9a6);
    p.box(0.7, 0.4, 0.5, [-0.4, 3.26, -1.9], C.sack);
    p.box(0.55, 0.36, 0.45, [0.5, 3.24, -1.7], C.sack, { rot: [0, 0.4, 0] });
    p.box(0.9, 0.42, 0.5, [0.1, 3.27, -0.8], C.trunk);
    p.box(0.92, 0.04, 0.52, [0.1, 3.49, -0.8], C.chrome);
    p.add(new CylinderGeometry(0.2, 0.2, 1.4, 8), 0xb84a3a, [-0.3, 3.27, 0.5], { rot: [0, 0, PI / 2] }); // rolled bedding
    p.add(new CylinderGeometry(0.17, 0.17, 1.2, 8), 0x5f7a52, [0.4, 3.24, 1.2], { rot: [0, 0.3, PI / 2] });
  });
  // lettering (kit signs: pixel font) + Hindi line (decal)
  for (const s of [-1, 1]) {
    sign(ctx, at, y0, { text: 'HIMACHAL ROADWAYS', bg: C.hrtcRed, fg: C.cream, glow: false, depth: 0.02, frame: C.hrtcRed, border: false }, [s * (hw + 0.012), 1.0, -0.6], s * PI / 2);
  }
  p.group([at.x, y0, at.z], at.yaw, () => {
    for (const s of [-1, 1]) d.quad(p.matrix, [s * (hw + 0.014), 2.8, s > 0 ? -1.0 : -0.4], 3.2, 0.3, 'hrtcHindi', s * PI / 2);
  });
  sign(ctx, at, y0, { text: 'DHARAMSHALA', bg: 0x1d1a1a, fg: 0xffa040, glow: true, depth: 0.03, border: false }, [0, 2.72, hl + 0.045], 0);
  return { colliders: [colliderBox(at, y0, 0, W, L, 3.06, 'bus')] };
}

// ---- taxis ---------------------------------------------------------------------------------------------------
function taxiBoard(ctx: VehicleCtx, at: VehicleSpot, y0: number, roof: number, z: number) {
  ctx.p.group([at.x, y0, at.z], at.yaw, () => {
    ctx.p.box(0.06, 0.08, 0.06, [-0.2, roof + 0.04, z], C.black);
    ctx.p.box(0.06, 0.08, 0.06, [0.2, roof + 0.04, z], C.black);
    ctx.p.box(0.62, 0.05, 0.14, [0, roof + 0.08, z], C.black);
  });
  // board lettered on both faces
  sign(ctx, at, y0, { text: 'TAXI', bg: C.taxi, fg: 0x1d1a1a, glow: true, depth: 0.05, border: false }, [0, roof + 0.25, z + 0.026], 0);
  sign(ctx, at, y0, { text: 'TAXI', bg: C.taxi, fg: 0x1d1a1a, glow: true, depth: 0.05, border: false }, [0, roof + 0.25, z - 0.026], PI);
}

function lights(p: Parts, hw: number, zf: number, zb: number, y: number, ty: number, round = false) {
  for (const s of [-1, 1]) {
    p.box(round ? 0.2 : 0.3, round ? 0.17 : 0.12, 0.04, [s * (hw - 0.26), y, zf], C.head, { emit: PAL.lampCool, emitNight: true, emitIntensity: 1.6 });
    p.box(0.08, 0.06, 0.04, [s * (hw - 0.08), y - 0.02, zf - 0.01], C.amber);
    p.box(0.1, 0.24, 0.04, [s * (hw - 0.1), ty, zb], C.tail, { emit: C.tail, emitNight: true, emitIntensity: 0.5 });
  }
}

function mirrors(p: Parts, hw: number, y: number, z: number) {
  for (const s of [-1, 1]) p.box(0.14, 0.1, 0.06, [s * (hw + 0.07), y, z], C.black);
}

/** Toyota Innova–style MPV. */
export function buildInnova(ctx: VehicleCtx, at: VehicleSpot, y0: number): VehicleBuild {
  const { p, d } = ctx;
  const L = 4.6, W = 1.8, hl = L / 2, hw = W / 2;
  const body = at.seed % 2 ? C.white : 0xe2e0d8;
  p.group([at.x, y0, at.z], at.yaw, () => {
    for (const s of [-1, 1]) for (const z of [1.45, -1.35]) wheel(p, s * (hw - 0.06), 0.33, z, 0.33, 0.22);
    profile(p, [[-hl, 0.36], [hl - 0.06, 0.36], [hl, 0.56], [hl - 0.04, 0.84], [1.2, 1.02], [0.85, 1.06], [-hl + 0.02, 1.08], [-hl - 0.02, 0.6]], W, body);
    profile(p, [[0.85, 1.04], [0.0, 1.7], [-2.12, 1.72], [-2.26, 1.04]], W - 0.1, C.glass);
    p.box(W - 0.08, 0.07, 2.18, [0, 1.74, -1.06], body);
    for (const z of [-0.45, -1.35]) p.box(W - 0.07, 0.66, 0.1, [0, 1.38, z], body);
    p.box(W - 0.07, 0.68, 0.1, [0, 1.38, -2.18], body);
    for (const s of [-1, 1]) p.box(0.07, 0.07, 1.05, [s * (hw - 0.07), 1.37, 0.43], body, { rot: [0.68, 0, 0] });
    p.box(W - 0.2, 0.06, 0.03, [0, 1.635, 0.13], 0x2f63b8, { rot: [0.68, 0, 0] }); // sun strip
    // black cladding over the arches, mud, door seams, handles
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.005);
      for (const z of [1.45, -1.35]) p.box(0.02, 0.1, 0.86, [x, 0.72, z], C.black);
      p.box(0.025, 0.1, L - 0.3, [x, 0.42, 0], C.dust);
      p.box(0.02, 0.6, 0.02, [x, 0.75, 0.42], C.whiteShade);
      p.box(0.02, 0.6, 0.02, [x, 0.75, -0.6], C.whiteShade);
      p.box(0.03, 0.03, 0.12, [x, 0.95, 0.2], C.chrome);
      p.box(0.03, 0.03, 0.12, [x, 0.95, -0.85], C.chrome);
    }
    // nose and tail
    p.box(0.9, 0.18, 0.04, [0, 0.78, hl + 0.0], C.grille);
    p.box(0.95, 0.03, 0.05, [0, 0.82, hl + 0.01], C.chrome);
    p.slab(-hw, 0.36, hl - 0.1, hw, 0.52, hl + 0.06, C.silver);
    p.slab(-hw, 0.36, -hl - 0.06, hw, 0.52, -hl + 0.1, C.silver);
    lights(p, hw, hl - 0.02, -hl + 0.0, 0.84, 1.0);
    mirrors(p, hw, 1.12, 0.72);
    d.quad(p.matrix, [0, 0.45, hl + 0.065], 0.44, 0.1, 'plate' + (at.seed % 5));
    d.quad(p.matrix, [0, 0.62, -hl - 0.025], 0.44, 0.1, 'plate' + ((at.seed + 2) % 5), PI);
  });
  taxiBoard(ctx, at, y0, 1.78, -0.5);
  return { colliders: [colliderBox(at, y0, 1.55, W, 1.5, 1.05), colliderBox(at, y0, -0.7, W, 3.2, 1.78)] };
}

/** Tata Sumo–style boxy SUV with a roof rack and a spare wheel on the back. */
export function buildSumo(ctx: VehicleCtx, at: VehicleSpot, y0: number): VehicleBuild {
  const { p, d } = ctx;
  const L = 4.3, W = 1.72, hl = L / 2, hw = W / 2;
  const r = rng(at.seed * 13 + 5);
  p.group([at.x, y0, at.z], at.yaw, () => {
    for (const s of [-1, 1]) for (const z of [1.35, -1.3]) wheel(p, s * (hw - 0.05), 0.36, z, 0.36, 0.24);
    profile(p, [[-hl, 0.42], [hl - 0.05, 0.42], [hl, 0.62], [hl - 0.02, 1.0], [1.35, 1.1], [-hl, 1.12]], W, C.white);
    profile(p, [[1.35, 1.08], [0.98, 1.8], [-2.08, 1.82], [-hl + 0.01, 1.08]], W - 0.1, C.glass);
    p.box(W - 0.06, 0.08, 3.08, [0, 1.84, -0.56], C.white);
    for (const z of [0.15, -0.95, -2.08]) p.box(W - 0.07, 0.74, 0.1, [0, 1.45, z], C.white);
    for (const s of [-1, 1]) p.box(0.07, 0.07, 0.82, [s * (hw - 0.07), 1.45, 1.17], C.white, { rot: [1.1, 0, 0] });
    p.box(W - 0.24, 0.07, 0.03, [0, 1.745, 1.035], 0xc8322b, { rot: [1.1, 0, 0] }); // sun strip
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.005);
      p.box(0.03, 0.06, L - 0.4, [x, 0.98, 0], 0x2f63b8); // blue pinstripe
      p.box(0.025, 0.14, L - 0.3, [x, 0.5, 0], C.mud);
      p.box(0.02, 0.62, 0.02, [x, 0.78, 0.6], C.whiteShade);
      p.box(0.02, 0.62, 0.02, [x, 0.78, -0.45], C.whiteShade);
      p.slab(s > 0 ? hw - 0.02 : -hw - 0.14, 0.38, -0.9, s > 0 ? hw + 0.14 : -hw + 0.02, 0.42, 0.9, C.black); // footboard
      for (const z of [1.35, -1.3]) p.box(0.03, 0.12, 0.84, [x, 0.8, z], C.black);
    }
    p.box(1.0, 0.3, 0.04, [0, 0.82, hl], C.grille);
    for (let i = 0; i < 3; i++) p.box(0.96, 0.025, 0.05, [0, 0.74 + i * 0.08, hl + 0.01], C.chrome);
    p.slab(-hw - 0.02, 0.42, hl - 0.08, hw + 0.02, 0.58, hl + 0.08, C.black);
    p.slab(-hw - 0.02, 0.42, -hl - 0.08, hw + 0.02, 0.58, -hl + 0.08, C.black);
    lights(p, hw, hl + 0.01, -hl - 0.01, 0.84, 0.95, true);
    mirrors(p, hw, 1.2, 1.15);
    // spare wheel on the tailgate
    p.add(new CylinderGeometry(0.34, 0.34, 0.22, 12), C.rubber, [0, 0.98, -hl - 0.12], { rot: [PI / 2, 0, 0] });
    p.add(new CylinderGeometry(0.28, 0.28, 0.24, 12), 0x2f5f9a, [0, 0.98, -hl - 0.12], { rot: [PI / 2, 0, 0] });
    // roof rack with a tarp-covered load lashed down
    for (const s of [-1, 1]) p.slab(s * (hw - 0.1) - 0.03, 1.94, -1.9, s * (hw - 0.1) + 0.03, 1.98, 0.7, C.black);
    for (let i = 0; i < 4; i++) p.slab(-hw + 0.1, 1.88, -1.85 + i * 0.83, hw - 0.1, 1.98, -1.8 + i * 0.83, C.black);
    p.box(1.3, 0.34, 1.6, [0, 2.15, -0.6], r() < 0.5 ? C.tarpBlue : 0x3f7a4c, { rot: [0, 0.04, 0] });
    for (let i = 0; i < 3; i++) p.box(1.34, 0.03, 0.03, [0, 2.3, -1.2 + i * 0.6], 0xd9c9a6);
    p.box(0.5, 0.3, 0.38, [0.3, 2.13, 0.45], 0x6a2630);
    d.quad(p.matrix, [0, 0.5, hl + 0.085], 0.44, 0.1, 'plate' + (at.seed % 5));
  });
  taxiBoard(ctx, at, y0, 1.98, 1.05);
  return { colliders: [colliderBox(at, y0, 1.6, W, 1.1, 1.12), colliderBox(at, y0, -0.55, W, 3.2, 1.98)] };
}

/** Maruti Omni van. */
export function buildOmni(ctx: VehicleCtx, at: VehicleSpot, y0: number): VehicleBuild {
  const { p, d } = ctx;
  const L = 3.4, W = 1.45, hl = L / 2, hw = W / 2;
  p.group([at.x, y0, at.z], at.yaw, () => {
    for (const s of [-1, 1]) for (const z of [1.08, -1.12]) wheel(p, s * (hw - 0.05), 0.25, z, 0.25, 0.17);
    profile(p, [[-hl, 0.3], [hl - 0.05, 0.3], [hl, 0.5], [hl - 0.02, 0.86], [1.5, 1.04], [1.32, 1.6], [-hl + 0.06, 1.62], [-hl, 1.1]], W, C.white);
    // windows: windscreen, side glass, rear glass
    p.box(W - 0.16, 0.5, 0.03, [0, 1.32, 1.43], C.glass, { rot: [-0.32, 0, 0] });
    p.box(W - 0.3, 0.05, 0.03, [0, 1.55, 1.36], 0xc8322b, { rot: [-0.32, 0, 0] });
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.005);
      p.box(0.02, 0.42, 0.8, [x, 1.3, 0.85], C.glass);
      p.box(0.02, 0.42, 1.4, [x, 1.3, -0.65], C.glass);
      p.box(0.025, 0.03, 1.5, [x, 1.53, -0.55], C.black); // sliding-door rail
      p.box(0.02, 1.05, 0.02, [x, 0.84, 0.44], C.whiteShade);
      p.box(0.02, 1.05, 0.02, [x, 0.84, -0.3], C.whiteShade);
      p.box(0.025, 0.1, L - 0.3, [x, 0.36, 0], C.dust);
      p.box(0.03, 0.03, 0.1, [x, 0.95, 0.32], C.chrome);
    }
    p.box(W - 0.2, 0.4, 0.03, [0, 1.3, -hl - 0.0], C.glass);
    p.box(0.7, 0.12, 0.04, [0, 0.72, hl], C.grille);
    p.slab(-hw, 0.3, hl - 0.08, hw, 0.44, hl + 0.06, C.black);
    p.slab(-hw, 0.3, -hl - 0.06, hw, 0.44, -hl + 0.08, C.black);
    lights(p, hw, hl + 0.0, -hl - 0.01, 0.74, 0.8, true);
    mirrors(p, hw, 1.05, 1.35);
    d.quad(p.matrix, [0, 0.52, hl + 0.025], 0.4, 0.1, 'plate' + (at.seed % 5));
    d.quad(p.matrix, [0, 0.52, -hl - 0.025], 0.4, 0.1, 'plate' + ((at.seed + 1) % 5), PI);
  });
  taxiBoard(ctx, at, y0, 1.62, 0.1);
  return { colliders: [colliderBox(at, y0, 0, W, L, 1.62)] };
}

export function buildVehicle(ctx: VehicleCtx, at: VehicleSpot, y0: number): VehicleBuild {
  switch (at.kind) {
    case 'bus': return buildBus(ctx, at, y0);
    case 'innova': return buildInnova(ctx, at, y0);
    case 'sumo': return buildSumo(ctx, at, y0);
    case 'omni': return buildOmni(ctx, at, y0);
  }
}
