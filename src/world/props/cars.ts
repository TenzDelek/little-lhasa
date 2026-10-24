// Small cars and a water tanker for the roadside bays: Maruti Alto (tiny hatchback), Maruti Swift (the
// rounder hatch), Maruti Omni (the boxy van) and a Tata 407–style water tanker with a blue tank. Flat Parts
// colours in the same language as the square's taxis: an extruded side profile, a glass greenhouse with body
// pillars, wheels proud of the body, 1-px plates / handles / wipers, road dust along the sills.
// All builders draw in the current Parts group space with the nose toward local +z, standing on y = 0,
// and return the footprint (length, width, height) for the caller's collider.
import { CylinderGeometry, ExtrudeGeometry, Shape, Vector2 } from 'three';
import type { Parts, PartOpts } from '../../core/geom';
import { PAL } from '../../core/palette';
import { pick } from '../../core/math';
import { beam, srng } from '../../kit/street';

const PI = Math.PI;
const K = {
  glass: 0x26323c, glassHi: 0x4a5c6c, rubber: 0x1e1d1d, hub: 0x9a9da0, hubDark: 0x5a5d60, black: 0x242325,
  grille: 0x2e3032, chrome: 0xcfd3d6, head: 0xe9e4d4, tail: 0xa8261f, amber: 0xd98a2a, plate: 0xe8e4d8,
  ink: 0x2a2a2e, dust: 0xa89c84, mud: 0x7a6a52, wiper: 0x1a1a1c,
};
export const CAR_COLS = [0xebe8e0, 0xc4c6c4, 0x9a2a26, 0x2f4f7a, 0x6f7378, 0xd8cdb4, 0x3f5a46] as const;

export interface CarDims { L: number; W: number; H: number }

/** Side profile (z, y pairs, nose at +z) extruded across `width`, centred on x. */
function profile(p: Parts, pts: [number, number][], width: number, color: number, o?: PartOpts) {
  const shape = new Shape(pts.map(([z, y]) => new Vector2(z, y)));
  const g = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.rotateY(-PI / 2);
  g.translate(width / 2, 0, 0);
  p.add(g, color, [0, 0, 0], o);
}

/** Wheel with its axle along x at (x, y, z): tyre, hub, hub-cap. */
function wheel(p: Parts, x: number, y: number, z: number, r: number, w: number, hub: number = K.hub) {
  p.add(new CylinderGeometry(r, r, w, 12), K.rubber, [x, y, z], { rot: [0, 0, PI / 2] });
  p.add(new CylinderGeometry(r * 0.56, r * 0.56, w + 0.02, 8), hub, [x, y, z], { rot: [0, 0, PI / 2] });
  p.add(new CylinderGeometry(r * 0.2, r * 0.2, w + 0.04, 6), K.hubDark, [x, y, z], { rot: [0, 0, PI / 2] });
}

/** Himachal plate: white with a row of 1-px dark characters. */
function plate(p: Parts, z: number, y: number, back: boolean, w = 0.42) {
  const dz = back ? -0.012 : 0.012;
  p.box(w, 0.11, 0.02, [0, y, z], K.plate);
  for (let i = 0; i < 6; i++) p.box(0.035, 0.05, 0.01, [-w / 2 + 0.06 + i * ((w - 0.12) / 5), y, z + dz], K.ink);
}

/** Head / tail lamps, indicators. */
function lamps(p: Parts, hw: number, zf: number, zr: number, yf: number, yr: number, inset = 0.16) {
  for (const s of [-1, 1]) {
    p.box(0.24, 0.1, 0.04, [s * (hw - inset), yf, zf], K.head);
    p.box(0.07, 0.06, 0.04, [s * (hw - 0.05), yf - 0.01, zf - 0.01], K.amber);
    p.box(0.16, 0.14, 0.04, [s * (hw - 0.12), yr, zr], K.tail);
    p.box(0.06, 0.06, 0.042, [s * (hw - 0.12), yr - 0.1, zr], K.amber);
  }
}

/** Door mirrors on stalks. */
function mirrors(p: Parts, hw: number, y: number, z: number, col: number) {
  for (const s of [-1, 1]) {
    p.box(0.09, 0.03, 0.05, [s * (hw + 0.04), y - 0.02, z], K.black);
    p.box(0.05, 0.1, 0.13, [s * (hw + 0.1), y + 0.03, z], col);
  }
}

/** Side details: dust along the sill, door seams, handles, wheel-arch shadows. */
function sides(p: Parts, hw: number, L: number, sill: number, seams: number[], handleY: number, arches: number[], ar: number, col: number) {
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.004);
    p.box(0.02, 0.08, L - 0.5, [x, sill + 0.04, 0], K.dust);
    for (const z of seams) p.box(0.02, handleY - sill + 0.2, 0.02, [x, (handleY + sill) / 2 + 0.06, z], shade(col, 0.82));
    for (const z of seams.slice(1)) p.box(0.03, 0.025, 0.1, [x, handleY, z + 0.14], K.black);
    for (const z of arches) p.box(0.02, 0.05, ar * 2.1, [x, ar * 2 + 0.04, z], K.black);
  }
}

/** Darker / lighter shade of an sRGB hex. */
export function shade(hex: number, k: number) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

// ---- Maruti Alto 800 ----------------------------------------------------------------------------------------
export function alto(p: Parts, seed: number, color?: number): CarDims {
  const r = srng(seed);
  const L = 3.44, W = 1.48, hl = L / 2, hw = W / 2;
  const body = color ?? pick(r, CAR_COLS);
  for (const s of [-1, 1]) for (const z of [1.16, -1.18]) wheel(p, s * (hw - 0.07), 0.27, z, 0.27, 0.16);
  profile(p, [[-hl, 0.3], [hl - 0.06, 0.3], [hl, 0.44], [hl - 0.03, 0.7], [hl - 0.62, 0.84], [-hl + 0.06, 0.88], [-hl, 0.64]], W, body);
  // greenhouse: steep screen, short roof, near-vertical hatch
  profile(p, [[hl - 0.64, 0.84], [hl - 1.32, 1.4], [-hl + 0.3, 1.42], [-hl + 0.07, 0.88]], W - 0.14, K.glass);
  p.box(W - 0.12, 0.06, 2.1, [0, 1.43, -0.33], body);
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.075);
    beam(p, [x, 0.86, hl - 0.66], [x, 1.42, hl - 1.34], 0.07, body); // A pillar
    p.box(0.07, 0.56, 0.1, [x, 1.13, -0.18], body); // B pillar
    beam(p, [x, 0.9, -hl + 0.1], [x, 1.42, -hl + 0.34], 0.1, body); // C pillar
    p.box(0.02, 0.3, 0.02, [s * (hw - 0.06), 1.12, 0.46], K.glassHi); // quarter-light divider
  }
  p.box(W - 0.28, 0.04, 0.02, [0, 1.2, -hl + 0.08], K.wiper, { rot: [0.3, 0.4, 0] }); // rear wiper
  sides(p, hw, L, 0.3, [0.58, -0.22], 0.78, [1.16, -1.18], 0.27, body);
  // nose: grille slot, bumper; tail: bumper, lamps, plates
  p.box(0.6, 0.06, 0.03, [0, 0.62, hl - 0.02], K.grille);
  p.slab(-hw, 0.28, hl - 0.1, hw, 0.44, hl + 0.03, shade(body, 0.85));
  p.slab(-hw, 0.28, -hl - 0.03, hw, 0.44, -hl + 0.1, shade(body, 0.85));
  lamps(p, hw, hl - 0.04, -hl + 0.01, 0.62, 0.72);
  mirrors(p, hw, 0.92, hl - 0.72, body);
  for (const s of [-1, 1]) p.box(0.32, 0.015, 0.02, [s * 0.22, 0.87, hl - 0.66], K.wiper, { rot: [0, s * 0.25, 0] });
  plate(p, hl + 0.04, 0.38, false, 0.36);
  plate(p, -hl - 0.04, 0.55, true, 0.36);
  return { L, W, H: 1.46 };
}

// ---- Maruti Swift ------------------------------------------------------------------------------------------
export function swift(p: Parts, seed: number, color?: number): CarDims {
  const r = srng(seed);
  const L = 3.86, W = 1.64, hl = L / 2, hw = W / 2;
  const body = color ?? pick(r, [0x9a2a26, 0xebe8e0, 0xc4c6c4, 0x2f4f7a, 0x3a3a3e, 0xb24a2a]);
  for (const s of [-1, 1]) for (const z of [1.24, -1.2]) wheel(p, s * (hw - 0.08), 0.3, z, 0.3, 0.18, 0x7a7d80);
  profile(p, [[-hl, 0.32], [hl - 0.06, 0.32], [hl, 0.5], [hl - 0.04, 0.72], [hl - 0.82, 0.92], [-hl + 0.12, 0.98], [-hl, 0.7]], W, body);
  // floating roof: blacked-out pillars, raked rear screen
  profile(p, [[hl - 0.84, 0.91], [hl - 1.6, 1.44], [-hl + 0.5, 1.47], [-hl + 0.12, 0.98]], W - 0.16, K.glass);
  p.box(W - 0.14, 0.07, 1.9, [0, 1.48, -0.42], body);
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.085);
    beam(p, [x, 0.93, hl - 0.86], [x, 1.46, hl - 1.62], 0.07, body);
    p.box(0.07, 0.5, 0.09, [x, 1.2, -0.25], K.black); // blacked B pillar
    beam(p, [x, 1.0, -hl + 0.16], [x, 1.46, -hl + 0.52], 0.12, body);
    p.box(0.02, 0.04, 2.0, [s * (hw + 0.004), 0.96, -0.2], shade(body, 1.15)); // shoulder crease
  }
  sides(p, hw, L, 0.32, [0.62, -0.3], 0.86, [1.24, -1.2], 0.3, body);
  // big trapezoid grille + fog lamps
  p.box(0.74, 0.18, 0.03, [0, 0.58, hl - 0.03], K.grille);
  p.box(0.76, 0.03, 0.035, [0, 0.66, hl - 0.025], K.chrome);
  p.slab(-hw, 0.3, hl - 0.12, hw, 0.48, hl + 0.02, body);
  p.slab(-hw, 0.3, -hl - 0.03, hw, 0.5, -hl + 0.12, body);
  for (const s of [-1, 1]) p.box(0.08, 0.05, 0.03, [s * (hw - 0.18), 0.38, hl + 0.02], K.glassHi);
  lamps(p, hw, hl - 0.06, -hl + 0.02, 0.7, 0.84, 0.18);
  mirrors(p, hw, 1.0, hl - 0.92, body);
  for (const s of [-1, 1]) p.box(0.38, 0.015, 0.02, [s * 0.25, 0.94, hl - 0.86], K.wiper, { rot: [0, s * 0.25, 0] });
  plate(p, hl + 0.03, 0.4, false);
  plate(p, -hl - 0.04, 0.62, true);
  return { L, W, H: 1.52 };
}

// ---- Maruti Omni van -----------------------------------------------------------------------------------------
export function omni(p: Parts, seed: number, color?: number): CarDims {
  const r = srng(seed);
  const L = 3.37, W = 1.4, hl = L / 2, hw = W / 2;
  const body = color ?? pick(r, [0xebe8e0, 0xebe8e0, 0xc4c6c4, 0x9a2a26, 0x6e2a30]);
  for (const s of [-1, 1]) for (const z of [1.08, -1.12]) wheel(p, s * (hw - 0.05), 0.25, z, 0.25, 0.16);
  profile(p, [[-hl, 0.28], [hl - 0.05, 0.28], [hl, 0.48], [hl - 0.02, 0.86], [hl - 0.22, 1.04], [hl - 0.4, 1.6], [-hl + 0.06, 1.62], [-hl, 1.1]], W, body);
  p.box(W - 0.16, 0.5, 0.03, [0, 1.3, hl - 0.28], K.glass, { rot: [-0.32, 0, 0] });
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.005);
    p.box(0.02, 0.42, 0.78, [x, 1.3, 0.86], K.glass);
    p.box(0.02, 0.42, 1.36, [x, 1.3, -0.66], K.glass);
    p.box(0.025, 0.03, 1.5, [x, 1.53, -0.55], K.black); // sliding-door rail
    p.box(0.02, 1.02, 0.02, [x, 0.84, 0.44], shade(body, 0.82));
    p.box(0.02, 1.02, 0.02, [x, 0.84, -0.3], shade(body, 0.82));
    p.box(0.025, 0.09, L - 0.3, [x, 0.34, 0], K.dust);
    p.box(0.03, 0.03, 0.1, [x, 0.95, 0.32], K.chrome);
  }
  p.box(W - 0.2, 0.42, 0.03, [0, 1.3, -hl], K.glass);
  p.box(0.7, 0.12, 0.04, [0, 0.72, hl], K.grille);
  p.slab(-hw, 0.28, hl - 0.08, hw, 0.42, hl + 0.06, K.black);
  p.slab(-hw, 0.28, -hl - 0.06, hw, 0.42, -hl + 0.08, K.black);
  lamps(p, hw, hl + 0.0, -hl - 0.01, 0.74, 0.8, 0.14);
  mirrors(p, hw, 1.05, hl - 0.3, body);
  // roof carrier with a bundle (many Omnis carry the family's luggage / gas cylinder)
  if (r() < 0.6) {
    for (const s of [-1, 1]) p.slab(s * (hw - 0.12) - 0.025, 1.62, -1.3, s * (hw - 0.12) + 0.025, 1.68, 0.9, K.black);
    for (let i = 0; i < 3; i++) p.slab(-hw + 0.1, 1.66, -1.2 + i * 1.0, hw - 0.1, 1.7, -1.15 + i * 1.0, K.black);
    if (r() < 0.6) p.box(0.8, 0.26, 0.9, [0.05, 1.83, -0.4], pick(r, [0x2f5f9a, 0x8a6a46, 0x3f7a4c]), { rot: [0, 0.06, 0] });
  }
  plate(p, hl + 0.07, 0.5, false, 0.36);
  plate(p, -hl - 0.07, 0.5, true, 0.36);
  return { L, W, H: 1.64 };
}

// ---- Tata 407–style water tanker --------------------------------------------------------------------------------
/** Light truck carrying a blue water tank (municipal / private water supply). Nose toward +z. */
export function tanker(p: Parts, seed: number): CarDims {
  const r = srng(seed);
  const L = 5.3, W = 1.86, hl = L / 2, hw = W / 2;
  const cab = pick(r, [0xe9e4d8, 0xd9c9a6]);
  const stripe = 0x2f5f9a;
  const tank = 0x3a6aa0, tankDark = 0x2e5684;
  const cabZ0 = hl - 1.55; // cab rear wall
  // chassis + wheels (single front, dual rear)
  p.slab(-0.42, 0.42, -hl + 0.2, -0.3, 0.6, hl - 0.3, K.black);
  p.slab(0.3, 0.42, -hl + 0.2, 0.42, 0.6, hl - 0.3, K.black);
  for (const s of [-1, 1]) {
    wheel(p, s * (hw - 0.13), 0.37, hl - 0.85, 0.37, 0.22, 0xb8bcc0);
    wheel(p, s * (hw - 0.12), 0.37, -hl + 1.2, 0.37, 0.2, 0xb8bcc0);
    wheel(p, s * (hw - 0.34), 0.37, -hl + 1.2, 0.37, 0.18, 0xb8bcc0);
  }
  // cab: tall, flat-fronted
  p.slab(-hw, 0.62, cabZ0, hw, 1.12, hl - 0.06, cab);
  p.slab(-hw + 0.02, 1.12, cabZ0, hw - 0.02, 2.06, hl - 0.28, cab);
  p.box(W - 0.06, 0.08, 1.42, [0, 2.09, hl - 0.95], shade(cab, 0.92)); // roof
  p.box(W - 0.2, 0.56, 0.03, [0, 1.6, hl - 0.27], K.glass, { rot: [-0.08, 0, 0] }); // windscreen
  p.box(W - 0.1, 0.07, 0.16, [0, 1.97, hl - 0.24], stripe); // sun visor
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.01);
    p.box(0.03, 0.5, 0.62, [x, 1.62, hl - 0.66], K.glass); // door window
    p.box(0.02, 0.86, 0.02, [x + s * 0.01, 1.2, cabZ0 + 0.18], shade(cab, 0.8)); // door seam
    p.box(0.03, 0.03, 0.12, [x + s * 0.015, 1.22, cabZ0 + 0.35], K.black); // handle
    p.box(0.025, 0.12, 1.3, [x + s * 0.01, 0.98, hl - 0.85], stripe); // body stripe
    p.slab(s > 0 ? hw - 0.1 : -hw - 0.06, 0.66, hl - 1.2, s > 0 ? hw + 0.06 : -hw + 0.1, 0.7, hl - 0.6, K.black); // step
    // mirror on a long stalk
    beam(p, [x, 1.75, hl - 0.3], [s * (hw + 0.24), 1.75, hl - 0.28], 0.025, K.black);
    p.box(0.05, 0.28, 0.14, [s * (hw + 0.26), 1.72, hl - 0.28], K.black);
    // front mudguard
    p.box(0.26, 0.05, 0.85, [s * (hw - 0.13), 0.78, hl - 0.85], K.black);
  }
  // nose: grille, bumper, lamps, plate, the black-and-white "nazar" tassel hanging from the bumper
  p.box(1.0, 0.36, 0.03, [0, 0.9, hl - 0.04], K.grille);
  for (let i = 0; i < 4; i++) p.box(0.96, 0.025, 0.035, [0, 0.76 + i * 0.09, hl - 0.03], K.chrome);
  p.slab(-hw - 0.02, 0.44, hl - 0.12, hw + 0.02, 0.62, hl + 0.06, K.black);
  for (const s of [-1, 1]) {
    p.cyl(0.09, 0.09, 0.04, [s * (hw - 0.22), 0.9, hl - 0.05], K.head, 10, { rot: [PI / 2, 0, 0] });
    p.box(0.08, 0.06, 0.04, [s * (hw - 0.06), 0.88, hl - 0.05], K.amber);
  }
  plate(p, hl + 0.08, 0.53, false);
  p.box(0.04, 0.22, 0.03, [0.55, 0.32, hl + 0.06], K.ink);
  // tank: a long blue cylinder lying along the bed, two saddles, a manhole on top, a rear ladder
  const tz0 = -hl + 0.15, tz1 = cabZ0 - 0.12, tlen = tz1 - tz0, tr = 0.72, ty = 0.66 + tr;
  p.slab(-hw + 0.08, 0.6, tz0, hw - 0.08, 0.68, tz1, 0x4a4a4c); // flat bed
  p.add(new CylinderGeometry(tr, tr, tlen, 14), tank, [0, ty, (tz0 + tz1) / 2], { rot: [PI / 2, 0, 0] });
  for (const z of [tz0 + 0.02, tz1 - 0.02]) p.add(new CylinderGeometry(tr * 0.9, tr * 0.9, 0.06, 14), tankDark, [0, ty, z], { rot: [PI / 2, 0, 0] });
  for (const z of [tz0 + 0.5, tz1 - 0.5]) p.box(W - 0.2, 0.36, 0.12, [0, 0.82, z], K.black); // saddles
  for (const z of [tz0 + 0.5, tz1 - 0.5]) p.add(new CylinderGeometry(tr + 0.012, tr + 0.012, 0.06, 14), K.black, [0, ty, z], { rot: [PI / 2, 0, 0] }); // straps
  p.cyl(0.24, 0.26, 0.12, [0, ty + tr - 0.05, (tz0 + tz1) / 2 + 0.3], tankDark, 10); // manhole
  p.cyl(0.2, 0.2, 0.03, [0, ty + tr + 0.07, (tz0 + tz1) / 2 + 0.3], 0x8a8d90, 10);
  p.slab(-0.42, ty + tr - 0.04, tz0 + 0.3, -0.4, ty + tr + 0.22, tz1 - 0.3, 0xb8bcc0); // grab rail
  p.slab(0.4, ty + tr - 0.04, tz0 + 0.3, 0.42, ty + tr + 0.22, tz1 - 0.3, 0xb8bcc0);
  // stencilled lettering on both flanks: a 1-px white band and two words of white blocks
  for (const s of [-1, 1]) {
    const x = s * (tr + 0.006);
    p.box(0.02, 0.04, tlen - 0.5, [x, ty + 0.36, (tz0 + tz1) / 2], 0xf3efe6);
    let z = tz0 + 0.45;
    for (let i = 0; i < 12; i++) {
      if (i === 5) { z += 0.14; continue; }
      p.box(0.02, 0.16, 0.1, [x, ty + 0.06, z], 0xf3efe6);
      z += 0.15;
    }
    p.box(0.02, 0.04, tlen - 0.5, [x, ty - 0.22, (tz0 + tz1) / 2], 0xf3efe6);
  }
  // rear: ladder up the tank end, outlet valve with a coiled hose, tail lamps, mudflaps
  for (const sx of [-0.18, 0.18]) p.box(0.03, 1.5, 0.03, [sx, ty + 0.05, tz0 - 0.06], 0xb8bcc0);
  for (let i = 0; i < 5; i++) p.box(0.38, 0.025, 0.03, [0, ty - 0.6 + i * 0.3, tz0 - 0.06], 0xb8bcc0);
  p.cyl(0.07, 0.07, 0.3, [0.45, ty - 0.48, tz0 - 0.15], 0x8a8d90, 8, { rot: [PI / 2, 0, 0] });
  p.box(0.12, 0.06, 0.06, [0.45, ty - 0.36, tz0 - 0.2], PAL.sashRed); // valve wheel
  for (let k = 0; k < 2; k++) p.add(new CylinderGeometry(0.2 - k * 0.04, 0.2 - k * 0.04, 0.05, 10, 1, true), K.black, [0.45, 0.92 - k * 0.05, tz0 - 0.15], { rot: [PI / 2, 0, 0] });
  for (const s of [-1, 1]) {
    p.box(0.14, 0.1, 0.04, [s * (hw - 0.14), 0.58, -hl + 0.05], K.tail);
    p.box(0.28, 0.32, 0.02, [s * (hw - 0.22), 0.3, -hl + 0.62], K.black); // mudflap
  }
  p.slab(-hw, 0.46, -hl + 0.02, hw, 0.54, -hl + 0.1, 0xd9b23a); // painted rear bar
  plate(p, -hl - 0.0, 0.66, true);
  return { L, W, H: 2.14 };
}
