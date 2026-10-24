// Street furniture kit: lamp posts, electric poles + sagging wires, benches, bins, railings, steps, potted
// plants, signposts, parked scooters / Royal Enfields, LPG cylinders, crates, bollards, milestones and
// string lights. Each function adds geometry to a Parts (world space) and returns what the caller must
// register (colliders, lamps, extra meshes).
//
// API CONTRACT — keep signatures stable; only add optional parameters.
//
//   const p = new Parts();
//   const { lamp, collider } = streetLamp(p, x, groundY(x, z), z, yaw);   // yaw: the arm points along (sin, cos)
//   const A = powerPole(p, ...), B = powerPole(p, ...);  wire(p, A.top, B.top, 0.6, 3);
//   // later: p.toMeshes(partsMaterial()), collision.addBox(collider), lamps.add(lamp)
//
// Exports (all world space, all seeded so the town looks the same every load):
//   streetLamp(kind 'arm'|'solar'|'old') · powerPole(kind 'concrete'|'wood'|'rail') · wire · stringLights
//   bench(kind 'wood'|'concrete') · bin(kind 'drum'|'twin'|'box') · railing · railingColliders · steps
//   pottedPlant(kind, pot) · signpost · bollard · milestone · lpgCylinders · crateStack · scooter · motorbike
// Helpers: sagAt() / sagTangent() (parabolic catenary), beam() (a box between two points), seedOf(x, z),
// srng(seed) (scrambled seeded PRNG), WIRE_SPACING (cable spacing = pole insulator spacing),
// flagChain() / flagFan() (FlagLine[] builders for <PrayerFlags>).
import { BoxGeometry, Matrix4, Vector3, type Mesh } from 'three';
import type { Parts, PartOpts, V3 } from '../core/geom';
import type { BoxInit } from '../core/collision';
import type { Lamp } from '../core/lamps';
import { PAL } from '../core/palette';
import { clamp, hash2, pick, rng, type Rng } from '../core/math';
import { makeSign, type SignSpec } from './sign';
import type { FlagLine } from './flags';
import { groundY } from '../world/terrain';

// ---- local colours (muted, sit inside PAL's range) --------------------------------------------------
const C = {
  galv: 0x9aa1a6, galvDark: 0x737a80, metal: 0x3a3e42, metalDark: 0x26282b, rubber: 0x1f1e20,
  chrome: 0xc4c8cb, ceramic: 0xe6e3dc, ceramicBrown: 0x7a4a32, cable: 0x1c1c1f, tar: 0x3b3122,
  rust: 0x5a3b2a, whitewash: 0xe9e4d8, solar: 0x27324a, solarFrame: 0xaab0b4, lens: 0xf2ecd8,
  tail: 0xb0302a, plate: 0xe8e4d8, ledHead: 0x4a4f54, soil: 0x4a3a2a, oldGreen: 0x3f6f55,
  terracotta: 0xb4603c, terracottaDark: 0x94502f, leaf: 0x4f7a32, leafLight: 0x6f9a3a, leafDark: 0x3a5a26,
};

// ---- helpers -------------------------------------------------------------------------------------
const _d = new Vector3(), _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _up = new Vector3();
const _m4 = new Matrix4();

/** Seeded PRNG with the seed scrambled first, so consecutive seeds (1, 2, 3…) give unrelated sequences. */
export const srng = (seed: number) => rng(Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995);

/** Stable seed from a position (so street furniture varies but never changes between loads). */
export const seedOf = (x: number, z: number) => Math.floor(hash2(x * 0.731 + 11.3, z * 1.137 - 5.1) * 2147483646) + 1;

/** Point on a sagging line from a to b at t ∈ [0, 1] (parabolic catenary, `sag` m at mid-span). */
export function sagAt(a: V3, b: V3, sag: number, t: number, out: Vector3 = new Vector3()): Vector3 {
  return out.set(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t),
    a[2] + (b[2] - a[2]) * t,
  );
}
/** Unit tangent of the sagging line at t. */
export function sagTangent(a: V3, b: V3, sag: number, t: number, out: Vector3 = new Vector3()): Vector3 {
  return out.set(b[0] - a[0], b[1] - a[1] - 4 * sag * (1 - 2 * t), b[2] - a[2]).normalize();
}

/**
 * A box of section w (side) x h (up) stretched from p0 to p1, in the current Parts group space.
 * Use for pipes, cables, arms, planks that are not axis aligned.
 */
export function beam(parts: Parts, p0: V3 | Vector3, p1: V3 | Vector3, w: number, color: number, o?: PartOpts & { h?: number }) {
  const ax = 'x' in p0 ? p0.x : p0[0], ay = 'x' in p0 ? p0.y : p0[1], az = 'x' in p0 ? p0.z : p0[2];
  const bx = 'x' in p1 ? p1.x : p1[0], by = 'x' in p1 ? p1.y : p1[1], bz = 'x' in p1 ? p1.z : p1[2];
  _d.set(bx - ax, by - ay, bz - az);
  const L = _d.length();
  if (L < 1e-4) return;
  _z.copy(_d).divideScalar(L);
  _up.set(0, 1, 0);
  if (Math.abs(_z.y) > 0.97) _up.set(1, 0, 0);
  _x.crossVectors(_up, _z).normalize();
  _y.crossVectors(_z, _x).normalize();
  const g = new BoxGeometry(w, o?.h ?? w, L);
  _m4.makeBasis(_x, _y, _z).setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  g.applyMatrix4(_m4);
  parts.add(g, color, [0, 0, 0], o ? { emit: o.emit, emitIntensity: o.emitIntensity, emitNight: o.emitNight } : undefined);
}

/** Polyline cable through points (thin dark boxes). */
function polyline(parts: Parts, pts: Vector3[], w: number, color: number) {
  for (let i = 1; i < pts.length; i++) beam(parts, pts[i - 1], pts[i], w, color);
}

/** World position of a local offset (lx, ly, lz) around (x, y, z) rotated by yaw. */
function local(x: number, y: number, z: number, yaw: number, lx: number, ly: number, lz: number): V3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
}

const jitter = (r: Rng, hex: number, amt = 0.06) => {
  // brighten / darken an sRGB hex a little (keeps the palette, breaks repetition)
  const k = 1 + (r() - 0.5) * 2 * amt;
  const R = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const G = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const B = Math.min(255, Math.round((hex & 255) * k));
  return (R << 16) | (G << 8) | B;
};

/** Wheel with its axle along local x, centred at (cx, cy, cz) in the current group. */
function wheel(p: Parts, r: number, wd: number, cx: number, cy: number, cz: number, tyre: number, rim: number, hub?: number) {
  p.cyl(r, r, wd, [cx + wd / 2, cy, cz], tyre, 10, { rot: [0, 0, Math.PI / 2] });
  p.cyl(r * 0.68, r * 0.68, wd + 0.012, [cx + wd / 2 + 0.006, cy, cz], rim, 10, { rot: [0, 0, Math.PI / 2] });
  if (hub !== undefined) p.cyl(r * 0.25, r * 0.25, wd + 0.03, [cx + wd / 2 + 0.015, cy, cz], hub, 6, { rot: [0, 0, Math.PI / 2] });
}

/** Wire-spoked wheel: dark tyre, a 1-px chrome rim, see-through spokes (dark grey), chrome hub. */
function spokedWheel(p: Parts, r: number, wd: number, cy: number, cz: number) {
  const rot: V3 = [0, 0, Math.PI / 2];
  p.cyl(r, r, wd, [wd / 2, cy, cz], C.rubber, 12, { rot });
  p.cyl(r * 0.8, r * 0.8, wd + 0.01, [wd / 2 + 0.005, cy, cz], 0x8a8d90, 12, { rot });
  p.cyl(r * 0.66, r * 0.66, wd + 0.02, [wd / 2 + 0.01, cy, cz], 0x45484c, 12, { rot });
  p.cyl(r * 0.2, r * 0.2, wd + 0.06, [wd / 2 + 0.03, cy, cz], C.chrome, 6, { rot });
}

// ---- street lamp -----------------------------------------------------------------------------------
export type LampKind = 'arm' | 'solar' | 'old';

/**
 * Street lamp post (≈4.5–5 m) with a bulb that glows at night. The arm reaches toward local +z (yaw).
 * kind: 'arm' galvanised pole + curved arm + LED/sodium head, 'solar' straight pole with a tilted solar panel
 * (cool-white LED), 'old' green-painted pole with a bent-pipe arm and sodium cobra head. Default: seeded.
 * Returns the lamp (under the head) and the post collider.
 */
export function streetLamp(
  parts: Parts, x: number, y: number, z: number, yaw: number, kind?: LampKind, seed?: number,
): { lamp: Lamp; collider: BoxInit } {
  const r = srng(seed ?? seedOf(x, z));
  const roll = r();
  const k: LampKind = kind ?? (roll < 0.5 ? 'arm' : roll < 0.75 ? 'solar' : 'old');
  let headZ = 1.2, headY = 4.6, color: number = PAL.lampSodium, H = 4.6, intensity = 7; // warm light reads darker

  parts.group([x, y, z], yaw, () => {
    // concrete footing, a little sunk into the ground
    parts.slab(-0.17, -0.2, -0.17, 0.17, 0.2, 0.17, jitter(r, PAL.concreteDark));
    parts.slab(-0.11, 0.2, -0.11, 0.11, 0.24, 0.11, C.metal); // base flange

    if (k === 'arm') {
      H = 4.7;
      const pole = r() < 0.65 ? C.galv : C.oldGreen;
      parts.cyl(0.042, 0.068, H, [0, 0.22, 0], pole, 6);
      // black / yellow warning bands at the bottom on some
      if (r() < 0.5) for (let i = 0; i < 3; i++) parts.cyl(0.072, 0.072, 0.16, [0, 0.36 + i * 0.32, 0], C.metalDark, 6);
      // curved arm
      const top = 0.22 + H;
      const a: Vector3[] = [
        new Vector3(0, top - 0.35, 0), new Vector3(0, top - 0.02, 0.12), new Vector3(0, top + 0.2, 0.42),
        new Vector3(0, top + 0.3, 0.8), new Vector3(0, top + 0.3, 1.1),
      ];
      polyline(parts, a, 0.05, pole);
      const led = r() < 0.55;
      color = led ? PAL.lampWarm : PAL.lampSodium;
      headZ = 1.22; headY = top + 0.3;
      parts.box(0.22, 0.08, 0.52, [0, headY, headZ], led ? C.ledHead : pole, { rot: [-0.06, 0, 0], emit: color, emitIntensity: 0.3, emitNight: true });
      parts.box(0.19, 0.07, 0.4, [0, headY - 0.065, headZ + 0.02], color, { emit: color, emitIntensity: 2.4, emitNight: true });
      // a poster / sticker on the pole (1 px of paper)
      if (r() < 0.35) parts.box(0.16, 0.22, 0.02, [0, 1.7, 0.07], pick(r, [PAL.wallYellow, PAL.wallWhite, PAL.wallPink]));
    } else if (k === 'solar') {
      H = 4.3;
      intensity = 5;
      parts.cyl(0.045, 0.062, H, [0, 0.22, 0], C.galv, 6);
      const top = 0.22 + H;
      // battery box clamped to the pole
      parts.box(0.26, 0.4, 0.15, [0, 3.0, -0.12], C.galvDark);
      parts.box(0.27, 0.04, 0.16, [0, 3.22, -0.12], C.metal);
      // tilted panel on a bracket (faces the southern sky)
      beam(parts, [0, top - 0.05, 0], [0, top + 0.18, 0], 0.05, C.galvDark);
      parts.box(0.78, 0.03, 0.56, [0, top + 0.2, 0], C.solarFrame, { rot: [0.42, 0, 0] });
      parts.box(0.72, 0.035, 0.5, [0, top + 0.215, 0], C.solar, { rot: [0.42, 0, 0] });
      // short arm + LED head
      beam(parts, [0, top - 0.55, 0], [0, top - 0.42, 0.62], 0.045, C.galv);
      headZ = 0.72; headY = top - 0.42;
      color = PAL.lampCool;
      parts.box(0.18, 0.06, 0.34, [0, headY, headZ], C.ledHead, { emit: color, emitIntensity: 0.25, emitNight: true });
      parts.box(0.16, 0.06, 0.28, [0, headY - 0.05, headZ], color, { emit: color, emitIntensity: 2.2, emitNight: true });
    } else {
      H = 4.2;
      parts.cyl(0.055, 0.08, H, [0, 0.22, 0], C.oldGreen, 6);
      // paint chips / rust
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2, hy = 0.6 + r() * 3.2;
        parts.box(0.05, 0.05 + r() * 0.08, 0.02, [Math.sin(a) * 0.07, hy, Math.cos(a) * 0.07], pick(r, [C.rust, PAL.concrete]), { rot: [0, a, 0] });
      }
      parts.box(0.18, 0.26, 0.12, [0, 2.6, -0.09], C.oldGreen); // junction box
      const top = 0.22 + H;
      polyline(parts, [new Vector3(0, top - 0.1, 0), new Vector3(0, top + 0.3, 0.28), new Vector3(0, top + 0.42, 0.85)], 0.06, C.oldGreen);
      headZ = 1.02; headY = top + 0.42;
      color = PAL.lampSodium;
      parts.taper(0.2, 0.42, 0.14, 0.32, 0.13, [0, headY - 0.06, headZ], C.oldGreen, { emit: color, emitIntensity: 0.25, emitNight: true });
      parts.box(0.18, 0.08, 0.34, [0, headY - 0.1, headZ], color, { emit: color, emitIntensity: 2.6, emitNight: true });
    }
  });

  const L = local(x, y, z, yaw, 0, headY - 0.35, headZ);
  return {
    lamp: { x: L[0], y: L[1], z: L[2], color, intensity, distance: 10 },
    collider: { x, z, w: 0.3, d: 0.3, rot: yaw, y0: y - 0.2, y1: y + H + 0.3, tag: 'lamp' },
  };
}

// ---- power pole + wires ----------------------------------------------------------------------------
/** Horizontal spacing of parallel cables (matches the pole's insulators). */
export const WIRE_SPACING = 0.45;

export type PoleKind = 'concrete' | 'wood' | 'rail';

/**
 * Electric pole (≈6.6–7.4 m). Wires run along local z (yaw); the crossbar with three insulators is along
 * local x, so wire(parts, A.top, B.top, sag, 3) lands one cable on each insulator.
 * Seeded extras: a pole transformer, cable coils, a junction box, a danger plate, whitewashed foot.
 * Returns: `top` (centre insulator tip, wire attach point), `tips` (the three insulators),
 * `low` (centre of the lower LT crossbar), and the collider.
 */
export function powerPole(
  parts: Parts, x: number, y: number, z: number, yaw = 0, kind?: PoleKind, seed?: number,
): { top: V3; collider: BoxInit; tips: V3[]; low: V3 } {
  const r = srng(seed ?? seedOf(x, z));
  const roll = r();
  const k: PoleKind = kind ?? (roll < 0.6 ? 'concrete' : roll < 0.85 ? 'wood' : 'rail');
  const H = k === 'concrete' ? 7.3 : k === 'wood' ? 6.7 : 7.0;
  const barY = H - 0.32, lowY = H - 1.35;

  parts.group([x, y, z], yaw, () => {
    if (k === 'concrete') {
      parts.cyl(0.2, 0.22, 0.14, [0, -0.04, 0], PAL.concreteDark, 6); // collar
      parts.taper(0.22, 0.15, 0.12, 0.1, H + 0.2, [0, -0.2, 0], jitter(r, PAL.concrete, 0.04));
      // PSC pole holes: 1-px dark dots up the wide faces
      for (let hy = 1.2; hy < H - 0.6; hy += 0.62) {
        const d = 0.15 + (0.1 - 0.15) * ((hy + 0.2) / (H + 0.2));
        parts.box(0.04, 0.05, 0.01, [0, hy, d / 2 + 0.004], PAL.concreteStain);
        parts.box(0.04, 0.05, 0.01, [0, hy, -d / 2 - 0.004], PAL.concreteStain);
      }
      if (r() < 0.45) parts.taper(0.235, 0.165, 0.22, 0.155, 1.1, [0, -0.02, 0], C.whitewash);
    } else if (k === 'wood') {
      parts.cyl(0.085, 0.115, H + 0.2, [0, -0.2, 0], C.tar, 7);
      if (r() < 0.5) parts.cyl(0.12, 0.122, 0.9, [0, 0, 0], C.whitewash, 7);
    } else {
      // old rail section (I-beam) on a concrete collar
      parts.cyl(0.18, 0.2, 0.25, [0, -0.1, 0], PAL.concreteDark, 6);
      parts.box(0.035, H, 0.13, [0, H / 2, 0], C.rust);
      parts.box(0.14, H, 0.03, [0, H / 2, 0.065], C.rust);
      parts.box(0.14, H, 0.03, [0, H / 2, -0.065], C.rust);
    }
    const bar = k === 'wood' ? 0x5a4a32 : C.metal;
    const ins = r() < 0.7 ? C.ceramic : C.ceramicBrown;
    // main crossbar (angle iron) + braces
    parts.box(1.7, 0.06, 0.07, [0, barY, 0.1], bar);
    beam(parts, [-0.5, barY - 0.03, 0.1], [0, barY - 0.45, 0.1], 0.04, bar);
    beam(parts, [0.5, barY - 0.03, 0.1], [0, barY - 0.45, 0.1], 0.04, bar);
    for (const ix of [-WIRE_SPACING, 0, WIRE_SPACING]) {
      parts.cyl(0.035, 0.05, 0.13, [ix, barY + 0.03, 0.1], ins, 6);
      parts.cyl(0.04, 0.04, 0.02, [ix, barY + 0.1, 0.1], ins, 6);
    }
    // lower LT crossbar with shackle insulators
    parts.box(1.1, 0.05, 0.06, [0, lowY, -0.1], bar);
    for (const ix of [-0.42, -0.15, 0.15, 0.42]) parts.cyl(0.035, 0.035, 0.08, [ix, lowY + 0.025, -0.1], ins, 6);

    // cable coils: the slack loops that every pole in town wears
    if (r() < 0.65) {
      const cy = 4.4 + r() * 1.1;
      for (let loop = 0; loop < 2; loop++) {
        const R = 0.2 + loop * 0.07, n = 8, y0 = cy - loop * 0.18;
        const pts: Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          pts.push(new Vector3(Math.cos(a) * R, y0 + Math.sin(a * 2 + loop) * 0.05 - (Math.sin(a) > 0 ? 0.08 : 0), Math.sin(a) * R));
        }
        polyline(parts, pts, 0.03, C.cable);
      }
      // drop cables to a box / down the pole
      const dx = (r() - 0.5) * 0.12;
      polyline(parts, [new Vector3(0.16, lowY, -0.12), new Vector3(0.14 + dx, cy - 0.3, 0.09), new Vector3(0.12, 2.7, 0.1)], 0.03, C.cable);
    }
    // junction / meter box
    if (r() < 0.35) {
      parts.box(0.24, 0.32, 0.12, [0, 2.5, 0.14], pick(r, [C.galvDark, 0x6f7f72, PAL.concreteDark]));
      parts.box(0.2, 0.03, 0.13, [0, 2.68, 0.14], C.metal);
    }
    // danger plate (white with a red mark)
    if (r() < 0.5) {
      parts.box(0.17, 0.13, 0.02, [0, 2.15, 0.1], C.plate);
      parts.box(0.05, 0.06, 0.022, [0, 2.15, 0.1], PAL.sashRed);
    }
    // pole-mounted transformer
    if (k !== 'wood' && r() < 0.22) {
      const tx = 0.42;
      parts.box(0.06, 0.06, 0.6, [0.22, 3.15, 0], C.metal);
      parts.box(0.5, 0.72, 0.44, [tx, 3.55, 0], 0x6f7f72);
      parts.box(0.54, 0.06, 0.48, [tx, 3.94, 0], 0x5f6d61);
      for (const fz of [-0.14, 0, 0.14]) {
        parts.cyl(0.03, 0.03, 0.16, [tx, 3.97, fz], C.ceramic, 6);
        beam(parts, [tx, 4.12, fz], [fz * 3, barY - 0.02, 0.1], 0.025, C.cable);
      }
      // cooling fins (1-px lines)
      for (let i = 0; i < 3; i++) parts.box(0.02, 0.6, 0.46, [tx - 0.17 + i * 0.17, 3.52, 0], 0x5f6d61);
    }
  });

  const tips = [-WIRE_SPACING, 0, WIRE_SPACING].map((ix) => local(x, y, z, yaw, ix, barY + 0.12, 0.1));
  return {
    top: tips[1],
    tips,
    low: local(x, y, z, yaw, 0, lowY + 0.06, -0.1),
    collider: { x, z, w: 0.32, d: 0.32, rot: yaw, y0: y - 0.2, y1: y + H, tag: 'pole' },
  };
}

/**
 * Sagging cable(s) between two points (thin dark boxes along a catenary). `count` parallel cables are
 * offset sideways (horizontally, perpendicular to the span) by `spacing`, each with a slightly different sag.
 */
export function wire(parts: Parts, a: V3, b: V3, sag = 0.5, count = 1, color: number = C.cable, spacing = WIRE_SPACING, thick = 0.035) {
  const dx = b[0] - a[0], dz = b[2] - a[2], Lh = Math.hypot(dx, dz) || 1;
  const px = -dz / Lh, pz = dx / Lh; // horizontal perpendicular
  const span = Math.hypot(dx, b[1] - a[1], dz);
  const n = Math.max(4, Math.min(40, Math.ceil(span / 0.8)));
  const r = srng(seedOf(a[0] + b[0], a[2] - b[2]));
  const p0 = new Vector3(), p1 = new Vector3();
  for (let c = 0; c < count; c++) {
    const off = (c - (count - 1) / 2) * spacing;
    const A: V3 = [a[0] + px * off, a[1], a[2] + pz * off], B: V3 = [b[0] + px * off, b[1], b[2] + pz * off];
    const s = sag * (0.9 + r() * 0.25);
    sagAt(A, B, s, 0, p0);
    for (let i = 1; i <= n; i++) {
      sagAt(A, B, s, i / n, p1);
      beam(parts, p0, p1, thick, color);
      p0.copy(p1);
    }
  }
}

/**
 * Festival / café string lights: a cable with small bulbs that glow at night. Returns a few weak lamps
 * (one every ~6 m) to register with lamps.add. colors: bulb colours cycled (default warm white).
 */
export function stringLights(
  parts: Parts, a: V3, b: V3, sag = 0.3, opts: { colors?: readonly number[]; spacing?: number; lampEvery?: number } = {},
): Lamp[] {
  const colors = opts.colors ?? [PAL.stringLight];
  const spacing = opts.spacing ?? 0.32;
  wire(parts, a, b, sag, 1, C.cable, 0, 0.03);
  const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.floor(span / spacing));
  const p = new Vector3();
  for (let i = 1; i < n; i++) {
    sagAt(a, b, sag, i / n, p);
    const c = colors[i % colors.length];
    parts.box(0.05, 0.07, 0.05, [p.x, p.y - 0.05, p.z], c, { emit: c, emitIntensity: 1.6, emitNight: true });
  }
  const out: Lamp[] = [];
  const every = opts.lampEvery ?? 6;
  const m = Math.max(1, Math.round(span / every));
  for (let i = 0; i < m; i++) {
    sagAt(a, b, sag, (i + 0.5) / m, p);
    out.push({ x: p.x, y: p.y - 0.25, z: p.z, color: colors.length > 1 ? PAL.stringLight : colors[0], intensity: 2, distance: 5 });
  }
  return out;
}

// ---- seating, bins ---------------------------------------------------------------------------------
export type BenchKind = 'wood' | 'concrete';
const STONE_COLS = new Set<number>([PAL.concrete, PAL.concreteDark, PAL.stoneStep, PAL.curb, PAL.paving, PAL.pavingDark, PAL.wallWhite, PAL.templeWhite, PAL.wallGrey, PAL.rock, C.whitewash]);

/**
 * Bench (≈1.6 m) facing yaw (sitters look toward local +z). Wooden planks (in `color`) on cast-iron legs, or
 * a concrete bench with a donor plaque (opts.kind 'concrete', or pass a stone / concrete colour such as
 * PAL.concrete or PAL.templeWhite as `color`). Returns its collider (seat is standable).
 */
export function bench(
  parts: Parts, x: number, y: number, z: number, yaw: number, color: number = PAL.woodTrim,
  opts: { kind?: BenchKind; back?: boolean; len?: number; seed?: number } = {},
): BoxInit {
  const r = srng(opts.seed ?? seedOf(x, z));
  // a stone / concrete colour picks the concrete bench (in that colour) unless kind says otherwise
  const stoneCol = STONE_COLS.has(color);
  const kind = opts.kind ?? (stoneCol ? 'concrete' : 'wood');
  const len = opts.len ?? 1.6;
  const back = opts.back ?? true;
  parts.group([x, y, z], yaw, () => {
    if (kind === 'wood') {
      const iron = r() < 0.6 ? C.metalDark : C.oldGreen;
      for (const sx of [-len / 2 + 0.18, len / 2 - 0.18]) {
        parts.box(0.06, 0.42, 0.06, [sx, 0.21, 0.17], iron);
        parts.box(0.06, back ? 0.86 : 0.42, 0.06, [sx, back ? 0.43 : 0.21, -0.18], iron);
        parts.box(0.06, 0.05, 0.44, [sx, 0.4, 0], iron);
        parts.box(0.06, 0.04, 0.42, [sx, 0.1, 0], iron);
      }
      for (let i = 0; i < 3; i++) parts.box(len, 0.04, 0.12, [0, 0.44, -0.14 + i * 0.14], jitter(r, color, 0.08));
      if (back) for (let i = 0; i < 2; i++) parts.box(len, 0.09, 0.03, [0, 0.62 + i * 0.15, -0.21], jitter(r, color, 0.08), { rot: [-0.12, 0, 0] });
    } else {
      const legC = PAL.concreteDark, top = stoneCol ? color : r() < 0.5 ? PAL.concrete : C.whitewash;
      for (const sx of [-len / 2 + 0.2, len / 2 - 0.2]) parts.box(0.16, 0.4, 0.38, [sx, 0.2, 0], legC);
      parts.box(len, 0.07, 0.46, [0, 0.435, 0], top);
      if (back) {
        parts.box(len, 0.36, 0.07, [0, 0.66, -0.2], top);
        parts.box(len + 0.04, 0.04, 0.09, [0, 0.86, -0.2], legC);
        // donor plaque: a few 1-px dashes ("donated by ...")
        for (let i = 0; i < 4; i++) parts.box(0.12 + r() * 0.1, 0.03, 0.01, [-0.4 + i * 0.27, 0.68, -0.163], PAL.slate);
      }
      // a little paint wear
      parts.box(0.2 + r() * 0.3, 0.012, 0.3, [(r() - 0.5) * len * 0.6, 0.472, 0], PAL.concreteStain);
    }
  });
  return { x, z, w: len, d: 0.5, rot: yaw, y0: y, y1: y + 0.46, tag: 'bench' };
}

export type BinKind = 'drum' | 'twin' | 'box';

/**
 * Municipal dustbin. 'drum' (default): green drum bin with a yellow "USE ME" band; 'twin': green + blue
 * wet/dry bins hung on a pipe frame; 'box': square concrete bin. Returns collider.
 */
export function bin(
  parts: Parts, x: number, y: number, z: number, color: number = PAL.roofGreen,
  opts: { kind?: BinKind; yaw?: number; seed?: number } = {},
): BoxInit {
  const r = srng(opts.seed ?? seedOf(x, z));
  const kind = opts.kind ?? 'drum';
  const yaw = opts.yaw ?? 0;
  if (kind === 'drum') {
    parts.group([x, y, z], yaw, () => {
      parts.cyl(0.21, 0.23, 0.06, [0, 0, 0], PAL.concreteDark, 10); // small plinth
      parts.cyl(0.235, 0.205, 0.78, [0, 0.06, 0], color, 10);
      parts.cyl(0.245, 0.245, 0.05, [0, 0.81, 0], jitter(r, color, 0.15), 10); // rim
      parts.cyl(0.2, 0.2, 0.02, [0, 0.8, 0], PAL.drain, 10); // dark mouth
      // "USE ME" band: a yellow ring with 1-px dark letters on the front faces
      parts.cyl(0.228, 0.226, 0.12, [0, 0.46, 0], PAL.wallYellow, 10);
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        parts.group([0, 0, 0], a, () => {
          for (let i = 0; i < 3; i++) parts.box(0.05, 0.05, 0.01, [-0.08 + i * 0.08, 0.52, 0.226], PAL.slate);
        });
      }
      // a bit of rubbish peeking out
      if (r() < 0.6) parts.box(0.1, 0.06, 0.08, [0.05, 0.84, -0.04], pick(r, [PAL.wallWhite, PAL.wallSky, PAL.blousePink]), { rot: [0.3, r() * 3, 0.2] });
    });
    return { x, z, w: 0.48, d: 0.48, y0: y, y1: y + 0.86, tag: 'bin' };
  }
  if (kind === 'twin') {
    parts.group([x, y, z], yaw, () => {
      for (const sx of [-0.52, 0.52]) parts.cyl(0.025, 0.03, 0.95, [sx, 0, 0], C.galv, 6);
      parts.box(1.08, 0.04, 0.04, [0, 0.82, 0], C.galv);
      const cols = [color, PAL.roofBlue];
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? -0.24 : 0.24;
        parts.taper(0.32, 0.3, 0.38, 0.34, 0.46, [sx, 0.3, 0], cols[i]);
        parts.box(0.4, 0.04, 0.36, [sx, 0.77, 0], jitter(r, cols[i], 0.15));
        parts.box(0.34, 0.02, 0.3, [sx, 0.785, 0], PAL.drain);
        parts.box(0.14, 0.1, 0.01, [sx, 0.55, 0.17], PAL.wallWhite); // little label
      }
    });
    return { x, z, w: 1.12, d: 0.42, rot: yaw, y0: y, y1: y + 0.86, tag: 'bin' };
  }
  parts.group([x, y, z], yaw, () => {
    parts.box(0.6, 0.6, 0.6, [0, 0.3, 0], PAL.concrete);
    parts.box(0.48, 0.02, 0.48, [0, 0.6, 0], PAL.drain);
    parts.box(0.62, 0.1, 0.62, [0, 0.05, 0], PAL.concreteDark);
    parts.box(0.4, 0.1, 0.01, [0, 0.42, 0.305], color);
  });
  return { x, z, w: 0.62, d: 0.62, rot: yaw, y0: y, y1: y + 0.6, tag: 'bin' };
}

// ---- railings and steps ----------------------------------------------------------------------------
/**
 * Pipe railing from a to b (top rail at height h, mid rail, posts every ≤1.5 m). Works on slopes: a and b
 * may be at different heights (rails follow the slope, posts stay vertical). Returns its collider.
 * Use railingColliders() for long steep runs (per-segment boxes that follow the slope).
 */
export function railing(parts: Parts, a: V3, b: V3, h = 1.0, color: number = PAL.railing): BoxInit {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const n = Math.max(1, Math.ceil(L / 1.5));
  const r = srng(seedOf(a[0] + b[2], a[2] + b[0]));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = a[0] + dx * t, pz = a[2] + dz * t, py = a[1] + (b[1] - a[1]) * t;
    const end = i === 0 || i === n;
    parts.box(end ? 0.065 : 0.05, h + 0.12, end ? 0.065 : 0.05, [px, py + (h - 0.12) / 2, pz], color);
    parts.box(0.1, 0.03, 0.1, [px, py + 0.015, pz], C.metalDark);
  }
  const lift = (p: V3, k: number): V3 => [p[0], p[1] + k, p[2]];
  beam(parts, lift(a, h), lift(b, h), 0.055, color);
  beam(parts, lift(a, h * 0.5), lift(b, h * 0.5), 0.045, color);
  // paint chips: 1-px rust flecks on the top rail
  for (let i = 0; i < Math.floor(L / 2); i++) {
    const t = r();
    parts.box(0.06, 0.06, 0.06, [a[0] + dx * t, a[1] + (b[1] - a[1]) * t + h, a[2] + dz * t], C.rust);
  }
  const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
  return { x: cx, z: cz, w: 0.12, d: L, rot: yaw, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) + h, tag: 'railing' };
}

/** Per-segment railing colliders (≤ maxLen m each) that follow a slope. */
export function railingColliders(a: V3, b: V3, h = 1.0, maxLen = 2): BoxInit[] {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const n = Math.max(1, Math.ceil(L / maxLen));
  const out: BoxInit[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const y0 = a[1] + (b[1] - a[1]) * t0, y1 = a[1] + (b[1] - a[1]) * t1;
    out.push({
      x: a[0] + dx * tm, z: a[2] + dz * tm, w: 0.12, d: L / n, rot: yaw,
      y0: Math.min(y0, y1), y1: Math.max(y0, y1) + h, tag: 'railing',
    });
  }
  return out;
}

/**
 * Flight of stone / concrete steps climbing from a (bottom) to b (top), tread width w, with stepped side
 * walls (opts.walls, default true). Returns colliders: one per step (standable, ~0.17 m rise so the player
 * walks up) plus the side walls.
 */
export function steps(
  parts: Parts, a: V3, b: V3, w = 1.6, color: number = PAL.stoneStep,
  opts: { walls?: boolean; wallColor?: number; base?: number } = {},
): BoxInit[] {
  let lo = a, hi = b;
  if (b[1] < a[1]) { lo = b; hi = a; }
  const dx = hi[0] - lo[0], dz = hi[2] - lo[2], L = Math.hypot(dx, dz), rise = hi[1] - lo[1];
  const n = Math.max(1, Math.round(rise / 0.17));
  const yaw = Math.atan2(dx, dz);
  const tread = L / n, rh = rise / n;
  const base = opts.base ?? lo[1] - 0.3;
  const walls = opts.walls ?? true;
  const ww = 0.22, wallH = 0.5;
  const wallC = opts.wallColor ?? PAL.concrete;
  const r = srng(seedOf(lo[0] + hi[0], lo[2] + hi[2]));
  const out: BoxInit[] = [];
  parts.group([lo[0], 0, lo[2]], yaw, () => {
    for (let i = 0; i < n; i++) {
      const z0 = i * tread, top = lo[1] + rh * (i + 1);
      const c = jitter(r, color, 0.05);
      parts.slab(-w / 2, base, z0, w / 2, top - 0.035, z0 + tread, c);
      // tread slab with a 1-px nosing (lighter, overhangs the riser)
      parts.slab(-w / 2, top - 0.035, z0 - 0.025, w / 2, top, z0 + tread, jitter(r, PAL.curb, 0.04));
      if (r() < 0.25) parts.box(0.12 + r() * 0.2, 0.01, 0.06, [(r() - 0.5) * w * 0.7, top + 0.002, z0 + tread * 0.5], PAL.concreteStain);
      if (walls) {
        for (const sx of [-(w / 2 + ww / 2), w / 2 + ww / 2]) {
          parts.slab(sx - ww / 2, base, z0, sx + ww / 2, top + wallH, z0 + tread, wallC);
          parts.slab(sx - ww / 2 - 0.02, top + wallH, z0 - 0.02, sx + ww / 2 + 0.02, top + wallH + 0.05, z0 + tread, PAL.concreteDark);
        }
      }
    }
  });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const toW = (lx: number, lz: number) => [lo[0] + lx * c + lz * s, lo[2] - lx * s + lz * c] as const;
  for (let i = 0; i < n; i++) {
    const zc = (i + 0.5) * tread, top = lo[1] + rh * (i + 1);
    const [cx, cz] = toW(0, zc);
    out.push({ x: cx, z: cz, w, d: tread + 0.01, rot: yaw, y0: base, y1: top, tag: 'step' });
    if (walls) for (const sx of [-(w / 2 + ww / 2), w / 2 + ww / 2]) {
      const [wx, wz] = toW(sx, zc);
      out.push({ x: wx, z: wz, w: ww, d: tread + 0.01, rot: yaw, y0: base, y1: top + wallH + 0.05, tag: 'wall' });
    }
  }
  return out;
}

// ---- potted plants ---------------------------------------------------------------------------------
export type PlantKind = 'marigold' | 'geranium' | 'succulent' | 'aloe' | 'jade' | 'pothos' | 'cactus';
export type PotKind = 'terracotta' | 'tin' | 'bottle' | 'planter';

/**
 * Potted plant: marigolds, geraniums, succulents, aloe, jade, trailing money plant or a cactus, in a
 * terracotta pot, an old paint / ghee tin, a cut plastic can or a whitewashed planter (seeded).
 * Returns collider.
 */
export function pottedPlant(parts: Parts, x: number, y: number, z: number, seed = 1, kind?: PlantKind, pot?: PotKind): BoxInit {
  const r = srng(seed * 7919 + 13);
  const kinds: PlantKind[] = ['marigold', 'geranium', 'succulent', 'aloe', 'jade', 'pothos', 'cactus', 'marigold', 'geranium', 'marigold', 'geranium', 'succulent', 'pothos'];
  const plant = kind ?? pick(r, kinds);
  const pr = r();
  const potK: PotKind = pot ?? (pr < 0.5 ? 'terracotta' : pr < 0.75 ? 'tin' : pr < 0.88 ? 'bottle' : 'planter');
  let top = 0.26, rad = 0.15;
  parts.group([x, y, z], r() * Math.PI * 2, () => {
    if (potK === 'terracotta') {
      const s = 0.8 + r() * 0.45;
      top = 0.26 * s; rad = 0.16 * s;
      parts.cyl(0.15 * s, 0.11 * s, 0.22 * s, [0, 0, 0], jitter(r, C.terracotta, 0.07), 8);
      parts.cyl(0.165 * s, 0.165 * s, 0.045 * s, [0, 0.215 * s, 0], C.terracottaDark, 8);
    } else if (potK === 'tin') {
      top = 0.28; rad = 0.13;
      parts.cyl(0.12, 0.12, 0.28, [0, 0, 0], C.galv, 10);
      parts.cyl(0.123, 0.123, 0.12, [0, 0.08, 0], pick(r, [PAL.shutterBlue, PAL.roofRed, PAL.templeYellow, PAL.wallWhite, PAL.templeGreen]), 10);
      parts.box(0.06, 0.04, 0.01, [0, 0.14, 0.123], PAL.wallWhite); // label mark
      parts.cyl(0.125, 0.125, 0.02, [0, 0.27, 0], C.galvDark, 10);
    } else if (potK === 'bottle') {
      top = 0.2; rad = 0.1;
      parts.cyl(0.095, 0.095, 0.2, [0, 0, 0], pick(r, [0x9cc3cf, 0xb9d6c4, 0xd8d4c8]), 8);
      parts.cyl(0.097, 0.097, 0.05, [0, 0.08, 0], pick(r, [PAL.shutterBlue, PAL.roofRed, PAL.wallWhite]), 8);
    } else {
      top = 0.32; rad = 0.2;
      parts.box(0.4, 0.3, 0.4, [0, 0.15, 0], C.whitewash);
      parts.box(0.44, 0.04, 0.44, [0, 0.32, 0], PAL.concrete);
      parts.box(0.41, 0.06, 0.41, [0, 0.03, 0], PAL.concreteStain);
    }
    parts.cyl(rad * 0.85, rad * 0.85, 0.02, [0, top - 0.025, 0], C.soil, 8);
    const T = top;
    switch (plant) {
      case 'marigold': {
        parts.box(rad * 2, 0.14, rad * 1.8, [0, T + 0.06, 0], C.leaf, { rot: [0, 0.4, 0] });
        parts.box(rad * 1.4, 0.12, rad * 1.4, [0.02, T + 0.16, -0.01], C.leafDark, { rot: [0, 0.9, 0] });
        const n = 6 + Math.floor(r() * 4);
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2, d = r() * rad * 0.95;
          parts.box(0.075, 0.06, 0.075, [Math.cos(a) * d, T + 0.18 + r() * 0.08, Math.sin(a) * d], pick(r, [0xe0801e, 0xe8a82a, 0xc8641c]));
        }
        break;
      }
      case 'geranium': {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + r(), d = rad * 0.5;
          beam(parts, [0, T, 0], [Math.cos(a) * d, T + 0.18 + r() * 0.08, Math.sin(a) * d], 0.03, C.leafDark);
        }
        parts.box(rad * 1.9, 0.12, rad * 1.9, [0, T + 0.1, 0], C.leafLight, { rot: [0, 0.6, 0] });
        const col = pick(r, [0xc23a3a, 0xd86a86, 0xd9826a]);
        for (let i = 0; i < 4; i++) {
          const a = r() * Math.PI * 2, d = r() * rad;
          parts.box(0.1, 0.07, 0.1, [Math.cos(a) * d, T + 0.24 + r() * 0.08, Math.sin(a) * d], jitter(r, col, 0.08));
        }
        break;
      }
      case 'succulent': {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          parts.groupEuler([Math.cos(a) * 0.03, T, Math.sin(a) * 0.03], [0, -a + Math.PI / 2, 0], () => {
            parts.taper(0.07, 0.03, 0.02, 0.01, 0.14, [0, 0, 0], i % 2 ? 0x7a9a6a : 0x6a8a62, { rot: [0.95, 0, 0] });
          });
        }
        parts.box(0.06, 0.06, 0.06, [0, T + 0.04, 0], 0x8aa878);
        break;
      }
      case 'aloe': {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + r() * 0.4;
          parts.groupEuler([0, T, 0], [0, -a, 0], () => {
            parts.taper(0.06, 0.025, 0.012, 0.01, 0.28 + r() * 0.12, [0, 0, 0.02], i % 3 ? 0x6f8f4a : 0x5f7f44, { rot: [0.35 + r() * 0.3, 0, 0] });
          });
        }
        break;
      }
      case 'jade': {
        beam(parts, [0, T, 0], [0.03, T + 0.18, 0], 0.04, PAL.barkLight);
        for (let i = 0; i < 9; i++) {
          const a = r() * Math.PI * 2, d = 0.04 + r() * rad * 0.9;
          parts.box(0.07, 0.04, 0.07, [Math.cos(a) * d, T + 0.12 + r() * 0.16, Math.sin(a) * d], pick(r, [0x5f8a4a, 0x4f7a42, 0x7a9a5a]), { rot: [0, r() * 3, 0.3] });
        }
        break;
      }
      case 'pothos': {
        parts.box(rad * 1.6, 0.1, rad * 1.6, [0, T + 0.04, 0], C.leaf, { rot: [0, 0.5, 0] });
        for (let i = 0; i < 4; i++) {
          const a = r() * Math.PI * 2, d = rad + 0.02, hang = 0.12 + r() * 0.25;
          const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
          beam(parts, [sx * 0.8, T + 0.04, sz * 0.8], [sx, T - hang, sz], 0.025, C.leafDark);
          for (let k = 0; k < 3; k++) {
            const f = (k + 1) / 3;
            parts.box(0.07, 0.06, 0.03, [sx * (0.85 + 0.15 * f), T + 0.04 - hang * f, sz * (0.85 + 0.15 * f)], k % 2 ? C.leafLight : 0xa8c25a, { rot: [0, -a, 0] });
          }
        }
        break;
      }
      default: { // cactus
        parts.cyl(0.055, 0.06, 0.3, [0, T, 0], 0x5a7a3a, 6);
        beam(parts, [0.04, T + 0.12, 0], [0.11, T + 0.14, 0], 0.05, 0x5a7a3a);
        parts.cyl(0.03, 0.035, 0.1, [0.11, T + 0.12, 0], 0x5a7a3a, 6);
        if (r() < 0.6) parts.box(0.05, 0.04, 0.05, [0, T + 0.31, 0], pick(r, [0xd86a86, 0xe8b02a]));
      }
    }
  });
  return { x, z, w: rad * 2 + 0.04, d: rad * 2 + 0.04, y0: y, y1: y + top, tag: 'plant' };
}

// ---- signposts, bollards, milestones ----------------------------------------------------------------
/**
 * Signpost on two galvanised posts. With a SignSpec (or plain text) the board is a makeSign() mesh the
 * caller must add to the scene (`sign`); without one, a green road-sign board with a white border is drawn
 * in Parts. The board faces local +z (yaw).
 */
export function signpost(
  parts: Parts, x: number, y: number, z: number, yaw: number, spec?: SignSpec | string,
): { collider: BoxInit; sign: Mesh | null } {
  let sign: Mesh | null = null;
  let bw = 1.1, bh = 0.6;
  const boardY = 2.1;
  if (spec) {
    const s: SignSpec = typeof spec === 'string' ? { text: spec, bg: PAL.roofGreen, fg: PAL.wallWhite, glow: false } : spec;
    sign = makeSign(s);
    sign.geometry.computeBoundingBox();
    const bb = sign.geometry.boundingBox!;
    bw = bb.max.x - bb.min.x; bh = bb.max.y - bb.min.y;
    const p = local(x, y, z, yaw, 0, boardY + bh / 2, 0.05);
    sign.position.set(p[0], p[1], p[2]);
    sign.rotation.y = yaw;
    sign.updateMatrixWorld();
  }
  const half = Math.max(0.25, bw / 2 - 0.15);
  parts.group([x, y, z], yaw, () => {
    for (const sx of [-half, half]) {
      parts.cyl(0.03, 0.035, boardY + bh + 0.05, [sx, -0.1, 0], C.galv, 6);
      parts.box(0.12, 0.08, 0.12, [sx, 0.02, 0], PAL.concreteDark);
    }
    if (!spec) {
      parts.box(bw + 0.06, bh + 0.06, 0.03, [0, boardY + bh / 2, 0.015], PAL.wallWhite);
      parts.box(bw, bh, 0.035, [0, boardY + bh / 2, 0.0475], PAL.roofGreen);
      for (let i = 0; i < 2; i++) parts.box(bw * (0.5 + i * 0.2), 0.045, 0.012, [0, boardY + bh * (0.66 - i * 0.32), 0.07], PAL.wallWhite);
    } else {
      parts.box(bw * 0.9, 0.04, 0.03, [0, boardY, 0.02], C.galvDark); // back brace
      parts.box(bw * 0.9, 0.04, 0.03, [0, boardY + bh, 0.02], C.galvDark);
    }
  });
  return { collider: { x, z, w: half * 2 + 0.1, d: 0.12, rot: yaw, y0: y, y1: y + boardY + bh, tag: 'sign' }, sign };
}

/** Concrete bollard with black / yellow bands. Returns collider. */
export function bollard(parts: Parts, x: number, y: number, z: number, color: number = PAL.wallYellow): BoxInit {
  parts.cyl(0.1, 0.12, 0.72, [x, y - 0.05, z], PAL.concrete, 8);
  parts.cyl(0.103, 0.103, 0.1, [x, y + 0.45, z], color, 8);
  parts.cyl(0.108, 0.108, 0.1, [x, y + 0.25, z], C.metalDark, 8);
  parts.cyl(0.07, 0.1, 0.06, [x, y + 0.67, z], PAL.concrete, 8);
  return { x, z, w: 0.24, d: 0.24, y0: y, y1: y + 0.73, tag: 'bollard' };
}

/** Indian road milestone (white stone, rounded top painted yellow — or green / orange). Faces yaw. */
export function milestone(parts: Parts, x: number, y: number, z: number, yaw: number, top: number = PAL.templeYellow): BoxInit {
  parts.group([x, y, z], yaw, () => {
    parts.box(0.44, 0.5, 0.18, [0, 0.2, 0], PAL.templeWhite);
    parts.cyl(0.22, 0.22, 0.18, [0, 0.45, -0.09], top, 10, { rot: [Math.PI / 2, 0, 0] });
    parts.box(0.44, 0.06, 0.181, [0, 0.42, 0], top);
    for (let i = 0; i < 2; i++) parts.box(0.22 - i * 0.08, 0.035, 0.01, [0, 0.3 - i * 0.1, 0.092], PAL.slate);
    parts.box(0.5, 0.06, 0.24, [0, -0.02, 0], PAL.concreteDark);
  });
  return { x, z, w: 0.46, d: 0.2, rot: yaw, y0: y, y1: y + 0.67, tag: 'milestone' };
}

// ---- gas, crates -------------------------------------------------------------------------------------
/** A huddle of n red LPG cylinders (one may be a blue commercial one). Returns collider. */
export function lpgCylinders(parts: Parts, x: number, y: number, z: number, n = 3, seed?: number): BoxInit {
  const r = srng(seed ?? seedOf(x, z));
  let ext = 0.18;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + r() * 0.5, d = i === 0 ? 0 : 0.3 + (i > 4 ? 0.22 : 0);
    const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
    ext = Math.max(ext, d + 0.18);
    const body = i === n - 1 && r() < 0.3 ? 0x3d5f86 : jitter(r, 0xb0342c, 0.06);
    parts.cyl(0.13, 0.13, 0.06, [cx, y, cz], PAL.drain, 10);
    parts.cyl(0.155, 0.15, 0.46, [cx, y + 0.06, cz], body, 10);
    parts.cyl(0.07, 0.155, 0.08, [cx, y + 0.52, cz], body, 10);
    parts.cyl(0.08, 0.08, 0.1, [cx, y + 0.58, cz], body, 8); // shroud
    parts.box(0.05, 0.06, 0.05, [cx, y + 0.62, cz], r() < 0.5 ? 0xc0a050 : C.metalDark);
    parts.cyl(0.157, 0.157, 0.02, [cx, y + 0.3, cz], PAL.wallWhite, 10); // stencil band
  }
  return { x, z, w: ext * 2, d: ext * 2, y0: y, y1: y + 0.66, tag: 'lpg' };
}

/** A stack of plastic bottle crates or wooden vegetable crates. Returns collider. */
export function crateStack(parts: Parts, x: number, y: number, z: number, yaw = 0, seed?: number): BoxInit {
  const r = srng(seed ?? seedOf(x, z));
  const veg = r() < 0.4;
  const cols = veg ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2);
  const W = veg ? 0.5 : 0.44, D = veg ? 0.36 : 0.32, Hh = veg ? 0.26 : 0.28;
  let maxH = 0;
  parts.group([x, y, z], yaw, () => {
    for (let c = 0; c < cols; c++) {
      const rows = veg ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 4);
      maxH = Math.max(maxH, rows * Hh);
      const cx = (c - (cols - 1) / 2) * (W + 0.03);
      for (let k = 0; k < rows; k++) {
        const yy = k * Hh, rot = (r() - 0.5) * 0.12;
        parts.group([cx, yy, (r() - 0.5) * 0.04], rot, () => {
          if (veg) {
            const wood = jitter(r, 0x9a7a4e, 0.08);
            for (let s = 0; s < 3; s++) parts.box(W, 0.06, D, [0, 0.04 + s * 0.09, 0], wood);
            parts.box(0.04, Hh, D, [-W / 2 + 0.02, Hh / 2, 0], jitter(r, 0x7a5a3a));
            parts.box(0.04, Hh, D, [W / 2 - 0.02, Hh / 2, 0], jitter(r, 0x7a5a3a));
            if (k === rows - 1) {
              const crop = pick(r, [0xb0606a, 0x9a7a4e, 0xc0402a, 0xe8e2c8, 0x6f9a3a]);
              for (let q = 0; q < 6; q++) parts.box(0.1, 0.08, 0.1, [(q % 3 - 1) * 0.14, Hh - 0.02 + (r() * 0.03), (Math.floor(q / 3) - 0.5) * 0.14], jitter(r, crop, 0.1));
            }
          } else {
            const col = pick(r, [0x3d5f86, 0xa33a2f, 0xd9b23a, 0x3f7a4c, 0x8a8a86]);
            parts.box(W, Hh - 0.01, D, [0, Hh / 2, 0], col);
            parts.box(W + 0.006, 0.035, D + 0.006, [0, Hh * 0.62, 0], jitter(r, col, 0.3)); // slot band
            parts.box(W - 0.06, 0.012, D - 0.06, [0, Hh - 0.004, 0], PAL.drain); // open top
          }
        });
      }
    }
  });
  return { x, z, w: cols * (W + 0.03), d: D + 0.04, rot: yaw, y0: y, y1: y + maxH, tag: 'crates' };
}

// ---- parked vehicles -------------------------------------------------------------------------------
const SCOOTER_COLS = [0xe4e1d8, 0xa8342c, 0x2a2a2e, 0x6f7378, 0x34466a, 0x6e2a30, 0xb7a6c9, 0xd9c9a6] as const;
const ENFIELD_COLS = [0x222224, 0x6a2228, 0x56603a, 0xb09a6a, 0x4c5258, 0x2f3f5a] as const;

/**
 * Parked Honda Activa–style scooter on its centre stand, front toward local +z (yaw). Returns collider.
 */
export function scooter(parts: Parts, x: number, y: number, z: number, yaw: number, seed?: number, color?: number): BoxInit {
  const r = srng(seed ?? seedOf(x, z));
  const body = color ?? pick(r, SCOOTER_COLS);
  const trim = C.metalDark;
  parts.group([x, y, z], yaw, () => {
    wheel(parts, 0.23, 0.09, 0, 0.23, 0.6, C.rubber, C.galvDark, C.chrome);
    wheel(parts, 0.23, 0.1, 0, 0.23, -0.55, C.rubber, C.galvDark, C.chrome);
    // rear cowl: narrow at the bottom, full under the seat; sloped front; lifted tail
    parts.taper(0.2, 0.5, 0.34, 0.64, 0.38, [0, 0.36, -0.48], body);
    parts.box(0.3, 0.3, 0.12, [0, 0.5, -0.15], body, { rot: [0.55, 0, 0] });
    parts.box(0.26, 0.12, 0.2, [0, 0.67, -0.86], body, { rot: [-0.3, 0, 0] });
    parts.box(0.345, 0.025, 0.56, [0, 0.58, -0.5], jitter(r, body, 0.25)); // side trim line
    parts.box(0.22, 0.12, 0.3, [0.06, 0.3, -0.52], trim); // engine / swing arm
    parts.box(0.07, 0.07, 0.36, [0.17, 0.27, -0.6], C.galvDark); // muffler
    // floorboard (rubber mat)
    parts.box(0.3, 0.06, 0.44, [0, 0.33, 0.1], trim);
    // leg shield / front apron (leans back toward the rider)
    parts.box(0.4, 0.64, 0.1, [0, 0.64, 0.38], body, { rot: [-0.2, 0, 0] });
    parts.box(0.28, 0.46, 0.04, [0, 0.6, 0.32], trim, { rot: [-0.2, 0, 0] }); // inner glovebox face
    // front fender + fork
    parts.box(0.14, 0.05, 0.34, [0, 0.5, 0.62], body, { rot: [0.15, 0, 0] });
    beam(parts, [0, 0.23, 0.6], [0, 0.92, 0.45], 0.055, trim);
    // handlebar cowl, headlamp, grips, short mirrors
    parts.box(0.3, 0.13, 0.22, [0, 1.0, 0.42], body);
    parts.box(0.16, 0.07, 0.03, [0, 0.99, 0.535], C.lens);
    parts.box(0.66, 0.04, 0.05, [0, 1.03, 0.38], trim);
    for (const sx of [-0.31, 0.31]) {
      parts.box(0.1, 0.045, 0.055, [sx, 1.03, 0.38], C.rubber);
      beam(parts, [sx * 0.75, 1.05, 0.4], [sx * 0.9, 1.19, 0.38], 0.02, C.metal);
      parts.box(0.1, 0.06, 0.03, [sx * 0.92, 1.21, 0.38], C.metalDark);
    }
    // seat, grab rail, tail light, number plate
    parts.box(0.29, 0.09, 0.68, [0, 0.79, -0.44], 0x2a2626);
    parts.box(0.3, 0.03, 0.16, [0, 0.82, -0.86], C.metal);
    parts.box(0.16, 0.05, 0.03, [0, 0.66, -0.97], C.tail, { emit: C.tail, emitIntensity: 0.4, emitNight: true });
    parts.box(0.15, 0.08, 0.02, [0, 0.52, -0.9], C.plate);
    // centre stand
    parts.box(0.26, 0.04, 0.04, [0, 0.03, -0.22], C.metal);
  });
  return { x, z, w: 0.62, d: 1.7, rot: yaw, y0: y, y1: y + 1.05, tag: 'vehicle' };
}

/**
 * Parked Royal Enfield (Bullet / Classic 350) leaning on its side stand, front toward local +z (yaw).
 * Returns collider.
 */
export function motorbike(parts: Parts, x: number, y: number, z: number, yaw: number, seed?: number, color?: number): BoxInit {
  const r = srng(seed ?? seedOf(x, z));
  const body = color ?? pick(r, ENFIELD_COLS);
  const seat = r() < 0.5 ? 0x5b3a26 : 0x2a2626;
  const stripe = r() < 0.5 ? PAL.gold : C.ceramic;
  parts.groupEuler([x, y, z], [0, yaw, 0.11], () => {
    spokedWheel(parts, 0.33, 0.1, 0.33, 0.7);
    spokedWheel(parts, 0.33, 0.11, 0.33, -0.68);
    // deep fenders
    parts.box(0.14, 0.05, 0.62, [0, 0.69, 0.66], body, { rot: [0.25, 0, 0] });
    parts.box(0.15, 0.05, 0.7, [0, 0.72, -0.72], body, { rot: [-0.18, 0, 0] });
    // frame + engine block with cooling fins
    beam(parts, [0, 0.84, 0.48], [0, 0.82, -0.5], 0.06, C.metalDark);
    beam(parts, [0, 0.84, 0.48], [0, 0.32, 0.18], 0.06, C.metalDark);
    parts.box(0.26, 0.3, 0.42, [0, 0.42, 0.02], 0x8f9296);
    parts.box(0.2, 0.26, 0.2, [0, 0.66, 0.12], 0x8f9296, { rot: [0.2, 0, 0] });
    for (let i = 0; i < 4; i++) parts.box(0.24, 0.02, 0.22, [0, 0.56 + i * 0.06, 0.12], C.metal, { rot: [0.2, 0, 0] });
    parts.box(0.06, 0.18, 0.3, [-0.15, 0.4, 0.0], 0x7a7d80); // primary cover
    // long chrome exhaust on the right
    beam(parts, [0.1, 0.52, 0.22], [0.18, 0.32, -0.1], 0.06, C.chrome);
    beam(parts, [0.18, 0.32, -0.1], [0.2, 0.36, -0.95], 0.08, C.chrome);
    // tank (two steps for a rounded silhouette) + pinstripe + badge
    parts.box(0.3, 0.2, 0.52, [0, 0.92, 0.22], body);
    parts.box(0.24, 0.07, 0.44, [0, 1.04, 0.2], body);
    parts.box(0.305, 0.025, 0.4, [0, 0.95, 0.22], stripe);
    parts.box(0.31, 0.06, 0.08, [0, 0.92, 0.3], C.chrome);
    // side toolbox + battery box
    parts.box(0.06, 0.2, 0.26, [-0.15, 0.72, -0.22], body);
    parts.box(0.06, 0.2, 0.26, [0.15, 0.72, -0.22], body);
    // sprung seat + pillion
    parts.box(0.26, 0.08, 0.3, [0, 0.95, -0.18], seat);
    parts.box(0.24, 0.07, 0.3, [0, 0.9, -0.52], seat);
    // forks, headlamp nacelle, handlebar
    for (const sx of [-0.09, 0.09]) beam(parts, [sx, 0.33, 0.72], [sx, 1.06, 0.52], 0.045, C.chrome);
    parts.box(0.24, 0.16, 0.16, [0, 1.06, 0.58], body);
    parts.cyl(0.095, 0.095, 0.08, [0, 1.06, 0.64], C.chrome, 10, { rot: [Math.PI / 2, 0, 0] });
    parts.box(0.12, 0.12, 0.02, [0, 1.06, 0.73], C.lens);
    for (const sx of [-0.15, 0.15]) parts.box(0.05, 0.05, 0.05, [sx, 1.0, 0.66], C.chrome);
    parts.box(0.8, 0.04, 0.05, [0, 1.17, 0.46], C.chrome);
    for (const sx of [-0.38, 0.38]) parts.box(0.11, 0.05, 0.055, [sx, 1.17, 0.46], C.rubber);
    beam(parts, [-0.3, 1.18, 0.47], [-0.36, 1.42, 0.44], 0.02, C.chrome);
    parts.cyl(0.05, 0.05, 0.02, [-0.36, 1.42, 0.44], C.chrome, 8, { rot: [Math.PI / 2, 0, 0] });
    // tail lamp + plate
    parts.box(0.1, 0.06, 0.05, [0, 0.82, -1.04], C.tail, { emit: C.tail, emitIntensity: 0.4, emitNight: true });
    parts.box(0.18, 0.1, 0.02, [0, 0.7, -1.05], C.plate);
  });
  // side stand
  const sp = local(x, y, z, yaw, -0.2, 0, 0.0);
  parts.box(0.04, 0.04, 0.04, [sp[0], y + 0.02, sp[2]], C.metal);
  return { x, z, w: 0.78, d: 2.1, rot: yaw, y0: y, y1: y + 1.1, tag: 'vehicle' };
}

// ---- prayer-flag line builders (data for <PrayerFlags lines>) ------------------------------------------
/**
 * Lungta strung through a chain of points (rooftop → pole → tree → rooftop…): one FlagLine per pair, sag
 * `sagFrac` of each span. Extra FlagLine fields (size, spacing, age) apply to every span; seeds vary.
 */
export function flagChain(points: readonly V3[], opts: Omit<FlagLine, 'a' | 'b' | 'sag'> & { sagFrac?: number } = {}): FlagLine[] {
  const out: FlagLine[] = [];
  const { sagFrac = 0.07, seed = 1, ...rest } = opts;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    out.push({ ...rest, a, b, sag: span * sagFrac, seed: seed * 131 + i });
  }
  return out;
}

/**
 * A fan of lungta radiating from one high point down to the ground (the classic hillside / chorten canopy):
 * `n` lines spread over the angle range [a0, a1] (radians, 0 = +x, π/2 = +z), each ending `radius` m away
 * (± jitter) at groundY + `endLift`. Feed the result to <PrayerFlags lines={...} />.
 */
export function flagFan(top: V3, n: number, radius: number, opts: {
  a0?: number; a1?: number; endLift?: number; age?: number; size?: number; spacing?: number; seed?: number;
} = {}): FlagLine[] {
  const { a0 = 0, a1 = Math.PI * 2, endLift = 0.3, age = 0.3, size, spacing, seed = 7 } = opts;
  const r = srng(seed);
  const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-3;
  const out: FlagLine[] = [];
  for (let i = 0; i < n; i++) {
    const t = full ? i / n : n === 1 ? 0.5 : i / (n - 1);
    const a = a0 + (a1 - a0) * t + (r() - 0.5) * 0.08;
    const R = radius * (0.85 + r() * 0.3);
    const x = top[0] + Math.cos(a) * R, z = top[2] + Math.sin(a) * R;
    const b: V3 = [x, groundY(x, z) + endLift, z];
    const span = Math.hypot(b[0] - top[0], b[1] - top[1], b[2] - top[2]);
    out.push({ a: top, b, sag: span * (0.03 + r() * 0.04), age: clamp(age + (r() - 0.5) * 0.4, 0, 1), size, spacing, seed: seed * 977 + i });
  }
  return out;
}
