// Shared helpers for the temple builders: local frames, colour tweaks and the recurring Tibetan
// architectural details (trapezoid window surrounds, painted beams, pema-kara frieze, rafter ends, chortens).
// Every detail helper works in the current Parts group space with the wall face on the z = 0 plane, facing +z.
import type { Parts, V3 } from '../../core/geom';
import type { BoxInit } from '../../core/collision';
import { PAL } from '../../core/palette';
import { rng, type Rng } from '../../core/math';

// ---- colour ------------------------------------------------------------------------------------------------
export function shade(hex: number, k: number) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
export function mixHex(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export const jitter = (r: Rng, hex: number, amt = 0.06) => shade(hex, (r() - 0.5) * 2 * amt);

export const INK = 0x1d1a1a;      // black window surrounds
export const WHITEWASH = PAL.templeWhite;
export const LIME = 0xe8e2d2;     // older whitewash
export const SOOT = 0x3a3330;

// ---- flat roofs -------------------------------------------------------------------------------------------
// Red-oxide tiled roof decks (the usual waterproof finish on flat roofs in Dharamshala). Warm terracotta with
// pale 1-px grout lines on a ~0.6 m grid, so a roof never reads like the grey courtyard flagstones — not even
// through the see-through cut when the boy walks behind a building.
export const ROOF_TILE = 0x92503f;
const ROOF_TILE_DARK = 0x804537;
const ROOF_TILE_LIGHT = 0x9f5c47;
const ROOF_GROUT = 0xb08068;
const ROOF_STAIN = 0x6c3c31;

/**
 * Tiled roof deck over the rectangle [x0, x1] × [z0, z1] of the current group, surface (tile tops) at y.
 * `stains` dark rain-water patches are dropped at random spots (deterministic per seed).
 */
export function tiledRoof(p: Parts, x0: number, z0: number, x1: number, z1: number, y: number, seed = 1, o: { tile?: number; stains?: number; base?: number } = {}) {
  const r = rng(seed);
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const base = o.base ?? 0.06;
  p.box(w, base, d, [cx, y - base / 2, cz], ROOF_TILE);
  const T = o.tile ?? 0.72;
  const nx = Math.max(1, Math.round(w / T)), nz = Math.max(1, Math.round(d / T));
  const tw = w / nx, td = d / nz;
  // a scatter of tiles a shade off (re-laid / weathered)
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const k = r();
    if (k > 0.24) continue;
    p.box(tw - 0.045, 0.012, td - 0.045, [x0 + tw * (i + 0.5), y + 0.006, z0 + td * (j + 0.5)], k < 0.15 ? ROOF_TILE_DARK : ROOF_TILE_LIGHT);
  }
  // grout lines
  for (let i = 1; i < nx; i++) p.box(0.045, 0.016, d, [x0 + tw * i, y + 0.008, cz], ROOF_GROUT);
  for (let j = 1; j < nz; j++) p.box(w, 0.016, 0.045, [cx, y + 0.008, z0 + td * j], ROOF_GROUT);
  // rain stains: dark blotches made of two overlapping slabs
  for (let s = 0; s < (o.stains ?? 0); s++) {
    const sw = 0.8 + r() * 1.4, sd = 0.6 + r() * 1.1;
    const sx = x0 + sw / 2 + r() * Math.max(0, w - sw), sz = z0 + sd / 2 + r() * Math.max(0, d - sd);
    p.box(sw, 0.02, sd, [sx, y + 0.01, sz], ROOF_STAIN);
    p.box(sw * 0.6, 0.022, sd * 1.25, [sx + (r() - 0.5) * sw * 0.4, y + 0.011, sz], mixHex(ROOF_STAIN, ROOF_TILE, 0.45));
  }
}

// ---- frames -----------------------------------------------------------------------------------------------
export interface Frame { x: number; z: number; yaw: number; y: number }
/** World xz of a local point in a frame (yaw about y, same convention as Object3D.rotation.y). */
export function toWorld(f: Frame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}
/** Collider for a local-frame box (centre lx, lz; size w x d; heights relative to frame y). */
export function lbox(f: Frame, lx: number, lz: number, w: number, d: number, y0: number, y1: number, tag = 'temple'): BoxInit {
  const [x, z] = toWorld(f, lx, lz);
  return { x, z, w, d, rot: f.yaw, y0: f.y + y0, y1: f.y + y1, tag };
}

// ---- painted details --------------------------------------------------------------------------------------
/** A row of painted blocks along x (painted beams, eaves). */
export function paintRow(p: Parts, x0: number, x1: number, y: number, z: number, h: number, d: number, colors: readonly number[], cell = 0.18, gap = 0) {
  const n = Math.max(1, Math.round((x1 - x0) / cell));
  const cw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) p.box(cw - gap, h, d, [x0 + cw * (i + 0.5), y, z], colors[i % colors.length]);
}

/** Square rafter ends sticking out of a wall along x. */
export function rafterEnds(p: Parts, x0: number, x1: number, y: number, z: number, size: number, colors: readonly number[], pitch = size * 2) {
  const n = Math.max(1, Math.floor((x1 - x0) / pitch));
  const off = (x1 - x0 - (n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) p.box(size, size, size * 1.6, [x0 + off + i * pitch, y, z + size * 0.8], colors[i % colors.length]);
}

/** Pema-kara frieze: dark twig band with thin white borders and gold mirror discs. */
export function pemaFrieze(p: Parts, x0: number, x1: number, y0: number, y1: number, z: number, discEvery = 1.3) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  p.box(w, y1 - y0, 0.14, [cx, (y0 + y1) / 2, z + 0.07], PAL.pema);
  p.box(w + 0.04, 0.05, 0.18, [cx, y0 + 0.025, z + 0.09], WHITEWASH);
  p.box(w + 0.04, 0.05, 0.18, [cx, y1 - 0.025, z + 0.09], WHITEWASH);
  const n = Math.max(1, Math.floor(w / discEvery));
  const step = w / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + step * (i + 0.5);
    p.box(0.2, 0.2, 0.04, [x, (y0 + y1) / 2, z + 0.16], PAL.gold);
    p.box(0.1, 0.1, 0.03, [x, (y0 + y1) / 2, z + 0.19], PAL.goldDeep);
  }
}

export const EAVE_COLORS = [PAL.templeBlue, PAL.templeGreen, PAL.templeRed, PAL.templeYellow] as const;
export const BEAM_COLORS = [PAL.templeGreen, PAL.templeBlue, PAL.templeRed, PAL.templeYellow, PAL.templeBlue, PAL.templeGreen] as const;

/**
 * Tibetan window centred at (x, y) on the wall plane z = 0: black trapezoid surround, red frame, glazing
 * (lit at night), a stack of painted lintel boards and a little striped shambu valance.
 */
export function tibWindow(p: Parts, x: number, y: number, w: number, h: number, o: { lit?: boolean; frame?: number; shambu?: boolean; bars?: number } = {}) {
  const frame = o.frame ?? PAL.templeRed;
  // black surround (wider at the bottom)
  p.taper(w + 0.62, 0.04, w + 0.3, 0.04, h + 0.42, [x, y - h / 2 - 0.26, 0.02], INK);
  p.box(w, h, 0.07, [x, y, 0.06], frame);
  p.box(w - 0.12, h - 0.12, 0.08, [x, y, 0.07], o.lit ? 0x3a3f4a : PAL.glass, o.lit ? { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.9 } : undefined);
  const bars = o.bars ?? (w > 0.9 ? 2 : 1);
  for (let i = 1; i <= bars; i++) p.box(0.04, h - 0.1, 0.1, [x - w / 2 + (w * i) / (bars + 1), y, 0.08], frame);
  p.box(w - 0.1, 0.04, 0.1, [x, y + h * 0.18, 0.08], frame);
  // lintel: three stepped boards, the middle one a row of tiny painted rafter ends
  const ly = y + h / 2;
  p.box(w + 0.36, 0.07, 0.12, [x, ly + 0.035, 0.07], PAL.templeRed);
  paintRow(p, x - (w + 0.4) / 2, x + (w + 0.4) / 2, ly + 0.11, 0.1, 0.08, 0.18, [PAL.templeBlue, PAL.templeGreen, PAL.templeYellow], 0.1, 0.02);
  p.box(w + 0.5, 0.07, 0.24, [x, ly + 0.185, 0.12], PAL.templeRed);
  if (o.shambu !== false) {
    // shambu: short pleated valance hanging under the lintel
    p.box(w + 0.06, 0.1, 0.04, [x, ly - 0.05, 0.16], WHITEWASH);
    paintRow(p, x - (w + 0.06) / 2, x + (w + 0.06) / 2, ly - 0.13, 0.16, 0.07, 0.04, [PAL.templeRed, PAL.templeBlue, PAL.templeYellow, PAL.templeGreen], 0.09);
  }
}

/** Tibetan door: black trapezoid surround, red leaves with gold studs, painted lintel. */
export function tibDoor(p: Parts, x: number, w: number, h: number, o: { curtain?: boolean } = {}) {
  p.taper(w + 0.7, 0.04, w + 0.36, 0.04, h + 0.3, [x, 0, 0.02], INK);
  if (o.curtain) {
    // white door curtain with a blue endless knot and a red/blue border band
    p.box(w, h, 0.06, [x, h / 2, 0.06], WHITEWASH);
    p.box(w, 0.16, 0.08, [x, h - 0.08, 0.07], PAL.templeBlue);
    p.box(w, 0.1, 0.08, [x, 0.12, 0.07], PAL.templeRed);
    endlessKnot(p, x, h * 0.52, 0.09, Math.min(w, h) * 0.42, PAL.templeBlue);
  } else {
    p.box(w, h, 0.06, [x, h / 2, 0.05], PAL.templeRed);
    p.box(0.04, h, 0.08, [x, h / 2, 0.06], PAL.templeMaroon);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) p.box(0.05, 0.05, 0.05, [x + sx * w * 0.25, h * (0.2 + i * 0.2), 0.09], PAL.gold);
  }
  p.box(w + 0.5, 0.08, 0.16, [x, h + 0.04, 0.08], PAL.templeRed);
  paintRow(p, x - (w + 0.6) / 2, x + (w + 0.6) / 2, h + 0.13, 0.12, 0.1, 0.2, [PAL.templeBlue, PAL.templeGreen, PAL.templeYellow, PAL.templeRed], 0.12, 0.025);
  p.box(w + 0.7, 0.08, 0.3, [x, h + 0.22, 0.15], PAL.templeRed);
}

/** Endless knot (palbeu) drawn with thin bars on the z = z plane, centred at (x, y), size s. */
export function endlessKnot(p: Parts, x: number, y: number, z: number, s: number, color: number) {
  const t = Math.max(0.035, s * 0.09);
  p.groupEuler([x, y, z], [0, 0, Math.PI / 4], () => {
    for (let i = -1; i <= 1; i++) {
      p.box(s, t, 0.03, [0, i * s * 0.32, 0], color);
      p.box(t, s, 0.03, [i * s * 0.32, 0, 0], color);
    }
    // corner loops
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      p.box(t * 2.4, t * 2.4, 0.03, [sx * s * 0.56, sy * s * 0.56, 0], color);
    }
  });
}

/** Square pillar with stone base, maroon shaft and a layered painted capital + bracket (local, base at y0). */
export function tibPillar(p: Parts, x: number, z: number, y0: number, h: number, o: { size?: number; bracket?: number; yaw?: number } = {}) {
  const s = o.size ?? 0.34;
  const br = o.bracket ?? 1.1;
  p.group([x, y0, z], o.yaw ?? 0, () => {
    p.box(s + 0.14, 0.16, s + 0.14, [0, 0.08, 0], PAL.stoneStep);
    p.box(s, h - 0.62, s, [0, 0.16 + (h - 0.78) / 2, 0], PAL.templeMaroon);
    // painted band near the top of the shaft
    p.box(s + 0.02, 0.1, s + 0.02, [0, h - 0.7, 0], PAL.templeGreen);
    p.box(s + 0.02, 0.06, s + 0.02, [0, h - 0.62, 0], PAL.templeYellow);
    // capital: stacked boxes widening upward
    p.box(s + 0.06, 0.12, s + 0.06, [0, h - 0.53, 0], PAL.templeBlue);
    p.box(s + 0.12, 0.1, s + 0.12, [0, h - 0.42, 0], PAL.templeRed);
    // bracket (sha-dung): long painted block along local x
    p.box(br, 0.18, s + 0.08, [0, h - 0.28, 0], PAL.templeRed);
    p.box(br * 0.8, 0.07, s + 0.1, [0, h - 0.28, 0], PAL.templeGreen);
    p.box(br + 0.1, 0.1, s + 0.12, [0, h - 0.14, 0], PAL.templeBlue);
    p.box(0.1, 0.1, s + 0.14, [0, h - 0.28, 0], PAL.gold);
  });
}

// ---- small structures -------------------------------------------------------------------------------------
/** Whitewashed chorten (stupa), base centre at `at`, total height ≈ h. */
export function chorten(p: Parts, at: V3, h: number, yaw = 0, o: { body?: number; trim?: number } = {}) {
  const k = h / 1.8;
  const body = o.body ?? WHITEWASH, trim = o.trim ?? PAL.templeRed;
  p.group(at, yaw, () => {
    p.box(1.1 * k, 0.16 * k, 1.1 * k, [0, 0.08 * k, 0], PAL.stoneStep);
    p.box(0.94 * k, 0.24 * k, 0.94 * k, [0, 0.28 * k, 0], body);
    p.box(0.96 * k, 0.04 * k, 0.96 * k, [0, 0.41 * k, 0], trim);
    p.box(0.8 * k, 0.12 * k, 0.8 * k, [0, 0.49 * k, 0], body);
    p.box(0.68 * k, 0.1 * k, 0.68 * k, [0, 0.6 * k, 0], body);
    p.box(0.58 * k, 0.08 * k, 0.58 * k, [0, 0.69 * k, 0], body);
    // bumpa (dome)
    p.cyl(0.3 * k, 0.26 * k, 0.32 * k, [0, 0.73 * k, 0], body, 8);
    p.cyl(0.18 * k, 0.3 * k, 0.1 * k, [0, 1.05 * k, 0], body, 8);
    // niche
    p.box(0.16 * k, 0.2 * k, 0.04, [0, 0.88 * k, 0.29 * k], PAL.templeRed);
    p.box(0.08 * k, 0.12 * k, 0.04, [0, 0.87 * k, 0.3 * k], PAL.gold);
    // harmika
    p.box(0.24 * k, 0.12 * k, 0.24 * k, [0, 1.21 * k, 0], body);
    p.box(0.28 * k, 0.03 * k, 0.28 * k, [0, 1.28 * k, 0], trim);
    // spire of 13 rings + parasol + sun & moon
    p.cyl(0.05 * k, 0.11 * k, 0.32 * k, [0, 1.3 * k, 0], PAL.gold, 6);
    p.cyl(0.1 * k, 0.12 * k, 0.04 * k, [0, 1.62 * k, 0], PAL.goldDeep, 6);
    p.box(0.1 * k, 0.05 * k, 0.03 * k, [0, 1.69 * k, 0], PAL.gold);
    p.cone(0.04 * k, 0.1 * k, [0, 1.72 * k, 0], PAL.gold, 5);
  });
}

/** Snow lion statue on a plinth (white body, turquoise mane), facing +z of the group. */
export function snowLion(p: Parts, at: V3, yaw: number, s = 1) {
  const mane = PAL.turquoise, white = 0xf2efe8;
  p.group(at, yaw, () => {
    p.box(0.7 * s, 0.7 * s, 1.0 * s, [0, 0.35 * s, 0], PAL.stoneStep);
    p.box(0.76 * s, 0.08 * s, 1.06 * s, [0, 0.72 * s, 0], PAL.templeRed);
    const b = 0.76 * s;
    p.box(0.36 * s, 0.34 * s, 0.6 * s, [0, b + 0.17 * s, -0.1 * s], white); // body (sitting)
    p.box(0.4 * s, 0.4 * s, 0.3 * s, [0, b + 0.36 * s, 0.14 * s], mane);    // mane/chest
    p.box(0.3 * s, 0.26 * s, 0.24 * s, [0, b + 0.5 * s, 0.24 * s], white);  // head
    p.box(0.34 * s, 0.1 * s, 0.1 * s, [0, b + 0.66 * s, 0.2 * s], mane);
    p.box(0.08 * s, 0.05 * s, 0.03 * s, [-0.07 * s, b + 0.55 * s, 0.37 * s], INK); // eyes
    p.box(0.08 * s, 0.05 * s, 0.03 * s, [0.07 * s, b + 0.55 * s, 0.37 * s], INK);
    p.box(0.14 * s, 0.06 * s, 0.03 * s, [0, b + 0.43 * s, 0.37 * s], PAL.templeRed); // mouth
    p.box(0.1 * s, 0.26 * s, 0.1 * s, [-0.12 * s, b + 0.13 * s, 0.2 * s], white); // front legs
    p.box(0.1 * s, 0.26 * s, 0.1 * s, [0.12 * s, b + 0.13 * s, 0.2 * s], white);
    p.box(0.14 * s, 0.1 * s, 0.14 * s, [0.12 * s, b + 0.05 * s, 0.24 * s], mane); // paw on ball
    p.box(0.12 * s, 0.24 * s, 0.1 * s, [0, b + 0.34 * s, -0.4 * s], mane);     // tail tuft
  });
}

/** Thin dark wire / rope between two points (a chain of short boxes). */
export function rope(p: Parts, a: V3, b: V3, sag: number, color: number, thick = 0.025) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.6));
  let prev: V3 = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    const dx = cur[0] - prev[0], dy = cur[1] - prev[1], dz = cur[2] - prev[2];
    const L = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    p.groupEuler([(cur[0] + prev[0]) / 2, (cur[1] + prev[1]) / 2, (cur[2] + prev[2]) / 2], [0, yaw, 0], () => {
      p.groupEuler([0, 0, 0], [-pitch, 0, 0], () => p.box(thick, thick, L, [0, 0, 0], color));
    });
    prev = cur;
  }
}
