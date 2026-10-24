// Butter-lamp house (chökhang for lamp offerings) by the gate: a small soot-stained whitewashed house with a
// glazed front, three stepped tiers of brass lamps inside, and a stone offering shelf outside where Tenzin
// can light lamps (the flames themselves are ButterLamps.tsx).
import type { Parts } from '../../core/geom';
import { PAL } from '../../core/palette';
import type { Acc } from './acc';
import { CY, LAMPHOUSE } from './site';
import { INK, SOOT, WHITEWASH, pemaFrieze, shade, tiledRoof } from './util';

const BRASS = 0xc89a3a;
const BRASS_DARK = 0x8a6424;

/** Brass butter-lamp cup with the rim at `top` (base sits 0.11 m lower). */
export function lampCup(p: Parts, x: number, top: number, z: number, s = 1) {
  p.cyl(0.035 * s, 0.05 * s, 0.03 * s, [x, top - 0.11 * s, z], BRASS_DARK, 6);
  p.cyl(0.02 * s, 0.02 * s, 0.04 * s, [x, top - 0.08 * s, z], BRASS, 5);
  p.cyl(0.065 * s, 0.03 * s, 0.04 * s, [x, top - 0.04 * s, z], BRASS, 7);
  p.cyl(0.055 * s, 0.055 * s, 0.006, [x, top - 0.006, z], 0xf3dc9a, 7); // butter surface
}

export function buildLampHouse(acc: Acc) {
  const L = LAMPHOUSE, B = acc.big, S = acc.small, F = acc.fine;
  const x0 = L.x0, x1 = L.x1, zf = L.z0, zb = L.z1;
  const cx = (x0 + x1) / 2, cz = (zf + zb) / 2, W = x1 - x0, D = zb - zf;
  const H = 2.9, PL = 0.25;

  // plinth & floor
  B.box(W + 0.3, PL, D + 0.3, [cx, CY + PL / 2, cz], PAL.stoneStep);
  // back + side walls (whitewash, blackened by soot near the top)
  B.box(W, H, 0.3, [cx, CY + PL + H / 2, zb - 0.15], WHITEWASH);
  for (const sx of [-1, 1]) B.box(0.3, H, D, [cx + sx * (W / 2 - 0.15), CY + PL + H / 2, cz], WHITEWASH);
  for (const sx of [-1, 1]) B.box(0.31, 0.5, D * 0.7, [cx + sx * (W / 2 - 0.15), CY + PL + H - 0.45, cz + D * 0.1], shade(SOOT, 0.55));
  B.box(W * 0.7, 0.6, 0.31, [cx + 0.2, CY + PL + H - 0.5, zb - 0.15], shade(SOOT, 0.55));
  // corner pilasters + front lintel above the glazing
  for (const sx of [-1, 1]) B.box(0.34, H, 0.34, [cx + sx * (W / 2 - 0.17), CY + PL + H / 2, zf + 0.17], WHITEWASH);
  B.box(W, 0.5, 0.3, [cx, CY + PL + H - 0.25, zf + 0.15], WHITEWASH);
  // pema frieze + roof slab + chimney hoods (soot)
  B.group([cx, 0, zf], Math.PI, () => pemaFrieze(B, -W / 2 - 0.05, W / 2 + 0.05, CY + PL + H - 0.42, CY + PL + H - 0.06, 0));
  B.box(W + 0.5, 0.14, D + 0.5, [cx, CY + PL + H + 0.07, cz], shade(PAL.templeMaroon, -0.3));
  tiledRoof(B, cx - W / 2 - 0.15, cz - D / 2 - 0.15, cx + W / 2 + 0.15, cz + D / 2 + 0.15, CY + PL + H + 0.2, 34, { base: 0.06, stains: 2, tile: 0.55 });
  for (const x of [cx - 1.2, cx + 1.2]) {
    B.box(0.6, 0.5, 0.6, [x, CY + PL + H + 0.45, cz + 0.3], SOOT);
    B.box(0.8, 0.08, 0.8, [x, CY + PL + H + 0.74, cz + 0.3], 0x2a2624);
    acc.smoke.push({ x, y: CY + PL + H + 0.62, z: cz + 0.3, n: 5, spread: 0.25, rise: 1.8, size: 0.14 });
  }

  // glazed front: grid of thin dark frames (the panes are open so the lamps inside read)
  const gy0 = CY + PL + 0.9, gy1 = CY + PL + H - 0.5;
  const fx0 = x0 + 0.34, fx1 = x1 - 0.34;
  B.box(fx1 - fx0, 0.9, 0.2, [cx, CY + PL + 0.45, zf + 0.12], WHITEWASH); // sill wall
  B.box(fx1 - fx0 + 0.02, 0.06, 0.26, [cx, gy0, zf + 0.12], PAL.templeMaroon);
  for (let i = 0; i <= 5; i++) {
    const x = fx0 + ((fx1 - fx0) * i) / 5;
    B.box(0.05, gy1 - gy0, 0.06, [x, (gy0 + gy1) / 2, zf + 0.06], INK);
  }
  for (const y of [gy0 + 0.04, (gy0 + gy1) / 2, gy1 - 0.03]) B.box(fx1 - fx0, 0.05, 0.06, [cx, y, zf + 0.06], INK);
  // faint glass glints
  for (let i = 0; i < 5; i++) {
    const x = fx0 + ((fx1 - fx0) * (i + 0.5)) / 5;
    F.groupEuler([x, (gy0 + gy1) / 2 + 0.2, zf + 0.05], [0, 0, 0.7], () => F.box(0.03, 0.4, 0.01, [0, 0, 0], 0xcfe0ea));
  }
  // interior: warm back wall (glows at night), stepped lamp tiers
  // (the walls inside are warmed by hundreds of flames: they glow at night so the glazing reads as a lantern)
  B.box(W - 0.6, H - 0.4, 0.04, [cx, CY + PL + (H - 0.4) / 2, zb - 0.32], 0x6b4a2a, { emit: 0xffa040, emitNight: true, emitIntensity: 1.1 });
  for (const sx of [-1, 1]) B.box(0.04, H - 0.5, D - 0.7, [cx + sx * (W / 2 - 0.32), CY + PL + (H - 0.5) / 2, cz + 0.1], 0x6b4a2a, { emit: 0xff9a40, emitNight: true, emitIntensity: 0.7 });
  B.box(W - 0.62, 0.04, D - 0.6, [cx, CY + PL + H - 0.52, cz + 0.05], 0x4a3424, { emit: 0xff9a40, emitNight: true, emitIntensity: 0.5 });
  const tiers = [{ y: 0.95, z: zf + 0.75 }, { y: 1.3, z: zf + 1.45 }, { y: 1.65, z: zf + 2.15 }, { y: 2.0, z: zf + 2.85 }];
  let id = 0;
  const r = acc.r;
  for (const [ti, t] of tiers.entries()) {
    B.box(W - 0.6, t.y, 0.7, [cx, CY + PL + t.y / 2, t.z], ti % 2 ? 0x5a4a3a : 0x4e4034, { emit: 0xff9a40, emitNight: true, emitIntensity: 0.28 });
    B.box(W - 0.6, 0.04, 0.72, [cx, CY + PL + t.y - 0.02, t.z], BRASS_DARK);
    const n = 11 - ti;
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.45 + ((W - 0.9) * (i + 0.5)) / n + (ti % 2 ? 0.1 : 0);
      const top = CY + PL + t.y + 0.11;
      lampCup(F, x, top, t.z - 0.12 + (i % 2) * 0.16, 1);
      if (r() < 0.62) acc.butterLamps.push({ id: `deco-lamp-${id++}`, x, y: top, z: t.z - 0.12 + (i % 2) * 0.16, interactive: false, lit: true });
    }
  }
  acc.lamps.push({ x: cx, y: CY + PL + 1.6, z: cz, color: PAL.butterFlame, intensity: 3.2, distance: 6, day: true, flicker: 0.2 });
  // the warm spill through the glazing onto the shelf and the flagstones in front (night)
  acc.lamps.push({ x: cx, y: CY + 1.5, z: zf - 1.5, color: PAL.butterFlame, intensity: 4.5, distance: 7, flicker: 0.15 });

  // outside offering shelf with 10 lamps under a small tin canopy
  const shelfZ = zf - 0.42, shelfTop = CY + 0.86;
  S.box(W - 0.4, 0.86, 0.5, [cx, CY + 0.43, shelfZ], PAL.stoneStep);
  S.box(W - 0.3, 0.06, 0.58, [cx, shelfTop - 0.03, shelfZ], shade(PAL.stoneStep, 0.15));
  S.box(W - 0.38, 0.04, 0.44, [cx, shelfTop + 0.01, shelfZ], BRASS_DARK); // brass tray
  const nShelf = 10;
  for (let i = 0; i < nShelf; i++) {
    const x = x0 + 0.5 + ((W - 1.0) * i) / (nShelf - 1);
    lampCup(F, x, shelfTop + 0.14, shelfZ, 1.15);
    acc.butterLamps.push({ id: `lamp-${i + 1}`, x, y: shelfTop + 0.14, z: shelfZ, interactive: true, lit: false });
  }
  // a few spare unlit lamps and a butter tin at the shelf ends
  S.cyl(0.12, 0.12, 0.22, [x0 + 0.35, shelfTop + 0.03, shelfZ], 0xb8b2a6, 8);
  S.cyl(0.13, 0.13, 0.03, [x0 + 0.35, shelfTop + 0.25, shelfZ], PAL.templeRed, 8);
  for (const dx of [0, 0.14]) lampCup(F, x1 - 0.35 - dx, shelfTop + 0.12, shelfZ + 0.1, 0.9);
  // narrow tin eave over the glazing, on two iron brackets
  B.box(W + 0.3, 0.05, 0.75, [cx, CY + PL + H + 0.02, zf - 0.32], PAL.roofRed);
  for (let z = -0.66; z <= 0.0; z += 0.22) B.box(W + 0.3, 0.03, 0.05, [cx, CY + PL + H + 0.06, zf + z], shade(PAL.roofRed, 0.15));
  for (const sx of [-1, 1]) B.groupEuler([cx + sx * (W / 2 - 0.1), CY + PL + H - 0.25, zf - 0.3], [0.8, 0, 0], () => B.box(0.05, 0.05, 0.75, [0, 0, 0], INK));
  // side door (west)
  B.group([x0, CY + PL, cz + 0.6], -Math.PI / 2, () => {
    B.box(0.9, 2.0, 0.06, [0, 1.0, 0.0], PAL.templeRed);
    B.box(1.1, 0.12, 0.1, [0, 2.06, 0.02], INK);
  });
  // small glazed windows on the back and the east side: warm lamp glow shows through at night
  const glowWindow = (x: number) => {
    B.taper(0.9, 0.04, 0.68, 0.04, 0.95, [x, 1.15, 0.02], INK);
    B.box(0.56, 0.62, 0.06, [x, 1.6, 0.05], 0x5a3a20, { emit: 0xffa040, emitNight: true, emitIntensity: 0.9 });
    B.box(0.04, 0.62, 0.08, [x, 1.6, 0.06], PAL.templeRed);
    B.box(0.72, 0.07, 0.12, [x, 1.95, 0.07], PAL.templeRed);
  };
  B.group([cx, CY + PL, zb], 0, () => { for (const x of [-1.2, 0, 1.2]) glowWindow(x); });
  B.group([x1, CY + PL, cz], Math.PI / 2, () => { for (const x of [-0.8, 0.8]) glowWindow(x); });
  // colliders
  acc.box({ x: cx, z: cz, w: W, d: D, y0: CY - 0.3, y1: CY + PL + H + 0.3, tag: 'building' });
  acc.box({ x: cx, z: shelfZ, w: W - 0.3, d: 0.58, y0: CY - 0.2, y1: shelfTop, tag: 'shelf' });
}
