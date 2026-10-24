// Small goods and furniture for shop fronts and stalls, built from Parts primitives in the LOCAL space of
// whatever group the caller has open (front = +z, ground = y 0). One art pixel ≈ 4.4 cm, so most details
// are 1–3 px: bead strings, book spines, bowl rims.
import { CylinderGeometry } from 'three';
import type { Parts, V3 } from '../../core/geom';
import { PAL } from '../../core/palette';
import { pick, range, type Rng } from '../../core/math';
import { hangBoxFrom, PLASTIC, TEXTILES } from './util';

const HALF_PI = Math.PI / 2;

// ---- thangka ------------------------------------------------------------------------------------------------
const THANGKA_BG = [0x2f5a3e, 0x283a6a, 0x9a5a2a, 0x23202a, 0x3a5a7a] as const;
const DEITY = [0x3f9a5a, 0xeeeae0, 0x2f5fb0, 0xd4a640, 0xc8502e] as const; // Green Tara, White Tara, Medicine Buddha, Shakyamuni, red Amitabha
const BROCADE = [0x2a3f78, 0x8a2222, 0xb08a2a, 0x2f5a3e] as const;

/**
 * A thangka scroll flat against a wall: brocade mount, painted panel, yellow silk cover rolled at the top,
 * red ribbons. `c` = centre of the painting at the wall surface; it projects toward +z.
 * design: 0 deity, 1 mandala, 2 wheel of life.
 */
export function thangka(p: Parts, c: V3, w: number, h: number, design: number, r: Rng) {
  const [x, y, z] = c;
  const brocade = pick(r, BROCADE);
  p.box(w + 0.12, 0.035, 0.04, [x, y + h / 2 + 0.02, z + 0.03], PAL.woodDoor); // top dowel
  p.box(w + 0.16, 0.04, 0.045, [x, y - h / 2 - 0.02, z + 0.03], PAL.woodDoor); // bottom dowel
  p.box(0.04, 0.05, 0.05, [x - w / 2 - 0.1, y - h / 2 - 0.02, z + 0.03], PAL.templeRed);
  p.box(0.04, 0.05, 0.05, [x + w / 2 + 0.1, y - h / 2 - 0.02, z + 0.03], PAL.templeRed);
  p.box(w, h, 0.02, [x, y, z + 0.01], brocade);
  p.box(w * 0.8, h * 0.74, 0.026, [x, y - h * 0.02, z + 0.013], 0xa83030);
  p.box(w * 0.72, h * 0.64, 0.03, [x, y - h * 0.02, z + 0.015], 0xd9b04a);
  const pw = w * 0.66, ph = h * 0.58, py = y - h * 0.02, fz = z + 0.035;
  const bg = design === 1 ? pick(r, [0x23202a, 0x283a6a]) : pick(r, THANGKA_BG);
  p.box(pw, ph, 0.032, [x, py, z + 0.016], bg);
  if (design === 0) {
    const body = pick(r, DEITY);
    p.cyl(pw * 0.36, pw * 0.36, 0.01, [x, py + ph * 0.08, fz], 0xe0902a, 10, { rot: [HALF_PI, 0, 0] }); // aura
    p.cyl(pw * 0.17, pw * 0.17, 0.012, [x, py + ph * 0.24, fz + 0.002], 0xf1c232, 8, { rot: [HALF_PI, 0, 0] }); // halo
    p.taper(pw * 0.42, 0.01, pw * 0.2, 0.01, ph * 0.34, [x, py - ph * 0.22, fz + 0.006], body);
    p.box(pw * 0.14, pw * 0.14, 0.01, [x, py + ph * 0.24, fz + 0.008], body); // head
    p.box(pw * 0.5, ph * 0.08, 0.01, [x, py - ph * 0.17, fz + 0.01], 0xb8322b); // robe across the lap
    p.box(pw * 0.62, ph * 0.08, 0.01, [x, py - ph * 0.33, fz + 0.006], 0xd88a9a); // lotus
    p.box(pw * 0.9, ph * 0.06, 0.01, [x, py - ph * 0.43, fz + 0.004], 0x4f8a4a); // ground / leaves
  } else if (design === 1) {
    const q = pw * 0.36;
    // four quarters of the palace: east white, south yellow, west red, north green
    p.box(q, q, 0.01, [x - q / 2, py + q / 2, fz], 0xeeeae0);
    p.box(q, q, 0.01, [x + q / 2, py + q / 2, fz], 0x3f8a4a);
    p.box(q, q, 0.01, [x - q / 2, py - q / 2, fz], 0xe0b02a);
    p.box(q, q, 0.01, [x + q / 2, py - q / 2, fz], 0xc8322b);
    p.cyl(pw * 0.48, pw * 0.48, 0.008, [x, py, fz - 0.002], 0xe07a2e, 12, { rot: [HALF_PI, 0, 0] }); // fire ring
    p.cyl(q * 0.55, q * 0.55, 0.012, [x, py, fz + 0.004], 0x2f63b8, 10, { rot: [HALF_PI, 0, 0] });
    p.box(q * 0.3, q * 0.3, 0.014, [x, py, fz + 0.01], 0xf1c232);
  } else {
    p.cyl(pw * 0.44, pw * 0.44, 0.01, [x, py, fz], 0x5a2a22, 12, { rot: [HALF_PI, 0, 0] }); // Yama's grip
    p.cyl(pw * 0.36, pw * 0.36, 0.012, [x, py, fz + 0.002], 0xc89a4a, 12, { rot: [HALF_PI, 0, 0] }); // twelve links
    p.cyl(pw * 0.27, pw * 0.27, 0.014, [x, py, fz + 0.004], 0x3a6a9a, 10, { rot: [HALF_PI, 0, 0] }); // six realms
    p.cyl(pw * 0.1, pw * 0.1, 0.016, [x, py, fz + 0.006], 0x2a2a2a, 8, { rot: [HALF_PI, 0, 0] });
    p.box(pw * 0.16, ph * 0.12, 0.012, [x, py + ph * 0.42, fz], 0x8a2a22); // Yama's head
  }
  // yellow silk cover, rolled up, and the two red ribbons
  p.box(w * 0.86, 0.07, 0.06, [x, y + h / 2 - 0.05, z + 0.06], 0xe8c040);
  p.box(0.025, h * 0.55, 0.012, [x - w * 0.22, y + h * 0.2, z + 0.06], 0xb8322b);
  p.box(0.025, h * 0.55, 0.012, [x + w * 0.22, y + h * 0.2, z + 0.06], 0xb8322b);
}

// ---- handicrafts ----------------------------------------------------------------------------------------
const BRASS = [PAL.gold, PAL.goldDeep, PAL.khorloCopper, 0xc0a060] as const;

/** Singing bowl standing on y (radius ~r). */
export function singingBowl(p: Parts, x: number, y: number, z: number, rad: number, color: number) {
  p.cyl(rad, rad * 0.68, rad * 0.62, [x, y, z], color, 8);
  p.cyl(rad * 0.82, rad * 0.82, 0.006, [x, y + rad * 0.62, z], 0x3a2a1a, 8); // dark inside
}

/** Table of singing bowls, dorje bells and butter-lamp cups. Centre at (x, z) on y = 0. */
export function bowlTable(p: Parts, x: number, z: number, w: number, d: number, r: Rng) {
  const h = 0.7;
  p.box(w, 0.05, d, [x, h - 0.025, z], PAL.woodTrim);
  p.box(w + 0.06, 0.02, d + 0.06, [x, h + 0.005, z], 0x8a2222); // red cloth
  p.box(w + 0.06, 0.16, 0.012, [x, h - 0.07, z + d / 2 + 0.03], 0x8a2222); // cloth drop
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.05, h - 0.05, 0.05, [x + sx * (w / 2 - 0.05), (h - 0.05) / 2, z + sz * (d / 2 - 0.05)], PAL.woodDoor);
  const nx = Math.max(2, Math.floor(w / 0.24)), nz = Math.max(1, Math.floor(d / 0.22));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const bx = x - w / 2 + (i + 0.5) * (w / nx), bz = z - d / 2 + (j + 0.5) * (d / nz);
    const kind = r();
    if (kind < 0.62) {
      const rad = range(r, 0.07, 0.11);
      singingBowl(p, bx, h + 0.012, bz, rad, pick(r, BRASS));
      if (r() < 0.35) singingBowl(p, bx, h + 0.012 + rad * 0.5, bz, rad * 0.7, pick(r, BRASS));
    } else if (kind < 0.8) {
      // dorje bell
      p.cyl(0.035, 0.06, 0.1, [bx, h + 0.012, bz], PAL.gold, 6);
      p.box(0.02, 0.07, 0.02, [bx, h + 0.15, bz], PAL.goldDeep);
    } else {
      // butter-lamp cups
      for (let k = 0; k < 3; k++) p.cyl(0.035, 0.025, 0.06, [bx - 0.06 + k * 0.06, h + 0.012, bz], PAL.gold, 6);
    }
  }
}

/** Hand prayer wheels standing in a wooden block. */
export function handWheels(p: Parts, x: number, y: number, z: number, n: number, r: Rng) {
  p.box(0.12 * n + 0.06, 0.08, 0.12, [x, y + 0.04, z], PAL.woodDoor);
  for (let i = 0; i < n; i++) {
    const wx = x - (0.12 * (n - 1)) / 2 + i * 0.12;
    p.box(0.022, 0.2, 0.022, [wx, y + 0.18, z], 0x5a3a24);
    p.cyl(0.045, 0.045, 0.085, [wx, y + 0.28, z], pick(r, [PAL.khorloCopper, PAL.gold, 0xc8c8c8, 0xb83a2a]), 8);
    p.box(0.02, 0.03, 0.02, [wx, y + 0.38, z], PAL.goldDeep);
  }
}

const MALA = [0x8a5a33, 0xb03a2a, 0x2fb2a6, 0xe8dcc0, 0x2a2420, 0x6a3a22, 0xd2523c] as const;

/** A row of malas hanging from a hook rail at local hookY, along x from x0 to x1 at depth z. */
export function malaRow(hang: Parts, x0: number, x1: number, hookY: number, z: number, r: Rng) {
  for (let x = x0; x <= x1 + 1e-6; x += 0.07) {
    const c = pick(r, MALA);
    const L = range(r, 0.3, 0.5);
    hangBoxFrom(hang, hookY, 0.032, L, 0.032, [x, hookY - L / 2, z], c);
    hangBoxFrom(hang, hookY, 0.04, 0.07, 0.04, [x, hookY - L - 0.035, z], pick(r, [0xc8322b, 0xf1c232, 0x2f8a4a, 0xb03a2a]));
  }
}

/** A hanging shawl (with woven band and fringe), hook at local hookY. */
export function shawl(hang: Parts, x: number, hookY: number, z: number, w: number, h: number, color: number, band: number, rot = 0) {
  hangBoxFrom(hang, hookY, w, h, 0.03, [x, hookY - h / 2, z], color, { rot: [0, rot, 0] });
  hangBoxFrom(hang, hookY, w + 0.005, 0.07, 0.036, [x, hookY - h + 0.16, z], band, { rot: [0, rot, 0] });
  hangBoxFrom(hang, hookY, w * 0.92, 0.07, 0.02, [x, hookY - h - 0.03, z], band, { rot: [0, rot, 0] });
}

/** Rail of shawls along x (x0..x1) hanging at depth z, hook at hookY. */
export function shawlRail(p: Parts, hang: Parts, x0: number, x1: number, hookY: number, z: number, r: Rng, rail = true) {
  if (rail) p.box(x1 - x0 + 0.2, 0.035, 0.035, [(x0 + x1) / 2, hookY + 0.02, z], 0x3a3a3a);
  const n = Math.max(1, Math.round((x1 - x0) / 0.36));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0);
    const c = pick(r, TEXTILES);
    shawl(hang, x, hookY, z + (i % 2) * 0.03, range(r, 0.3, 0.36), range(r, 0.8, 1.2), c, pick(r, TEXTILES));
  }
}

/** Folded shawls stacked on a table. */
export function shawlStack(p: Parts, x: number, y: number, z: number, n: number, r: Rng) {
  for (let i = 0; i < n; i++) p.box(0.42, 0.06, 0.32, [x + range(r, -0.02, 0.02), y + 0.03 + i * 0.06, z], pick(r, TEXTILES));
}

// ---- books ----------------------------------------------------------------------------------------------
const SPINES = [0x8a2222, 0x2a3f78, 0x2f5a3e, 0xd9b04a, 0xe6dcc4, 0x5a2a4a, 0x23202a, 0xc8622e, 0x3a6a9a, 0x7a7a3a, 0xb8322b] as const;

/** Open bookcase facing +z: frame w x h x d centred at (x, z), shelves full of spines. */
export function bookcase(p: Parts, x: number, z: number, w: number, h: number, d: number, r: Rng, color: number = PAL.woodTrim) {
  p.box(w, h, 0.03, [x, h / 2, z - d / 2 + 0.015], 0x4a3020); // back
  p.box(0.04, h, d, [x - w / 2 + 0.02, h / 2, z], color);
  p.box(0.04, h, d, [x + w / 2 - 0.02, h / 2, z], color);
  p.box(w, 0.04, d, [x, h - 0.02, z], color);
  const shelves = Math.max(2, Math.floor((h - 0.1) / 0.32));
  for (let k = 0; k < shelves; k++) {
    const sy = 0.08 + k * ((h - 0.1) / shelves);
    p.box(w - 0.06, 0.03, d - 0.02, [x, sy, z], color);
    let bx = x - w / 2 + 0.05;
    while (bx < x + w / 2 - 0.08) {
      const t = range(r, 0.035, 0.065);
      const bh = range(r, 0.17, 0.25);
      if (r() < 0.08) { bx += t; continue; }
      p.box(t, bh, d - 0.08, [bx + t / 2, sy + 0.015 + bh / 2, z + 0.01], pick(r, SPINES));
      bx += t + 0.004;
    }
  }
}

/** Slanted table with books lying face up. */
export function bookTable(p: Parts, x: number, z: number, w: number, d: number, r: Rng) {
  const h = 0.72;
  for (const sx of [-1, 1]) {
    p.box(0.05, h - 0.1, 0.05, [x + sx * (w / 2 - 0.05), (h - 0.1) / 2, z + d / 2 - 0.06], PAL.woodDoor);
    p.box(0.05, h + 0.06, 0.05, [x + sx * (w / 2 - 0.05), (h + 0.06) / 2, z - d / 2 + 0.06], PAL.woodDoor);
  }
  p.groupEuler([x, h, z], [-0.2, 0, 0], () => {
    p.box(w, 0.04, d, [0, 0, 0], PAL.woodTrim);
    const nx = Math.floor(w / 0.2), nz = Math.floor(d / 0.26);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const bx = -w / 2 + (i + 0.5) * (w / nx), bz = -d / 2 + (j + 0.5) * (d / nz);
      const stack = 1 + Math.floor(r() * 3);
      for (let k = 0; k < stack; k++) p.box(0.15, 0.03, 0.21, [bx, 0.035 + k * 0.03, bz], pick(r, SPINES));
    }
  });
}

/** Postcard / map spinner. */
export function cardSpinner(p: Parts, x: number, z: number, r: Rng) {
  p.cyl(0.2, 0.22, 0.04, [x, 0, z], 0x3a3a3a, 8);
  p.box(0.04, 1.5, 0.04, [x, 0.75, z], 0x3a3a3a);
  for (let k = 0; k < 4; k++) {
    const y = 0.75 + k * 0.18;
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2 + k * 0.3;
      p.box(0.11, 0.15, 0.01, [x + Math.sin(ang) * 0.1, y, z + Math.cos(ang) * 0.1], pick(r, [0x8fb4cf, 0xf4f6fa, 0xe0b02a, 0x5f8a2a, 0xc8322b]), { rot: [0, ang, 0] });
    }
  }
}

// ---- cafés ---------------------------------------------------------------------------------------------
const CHAIRS = [0xe8e4da, 0x3f7a4c, 0xa83a2e, 0x6a3f24] as const;

/** Small table with two chairs (on y). */
export function cafeSet(p: Parts, x: number, y: number, z: number, r: Rng, round = true, chairColor?: number) {
  const top = round ? 0.32 : 0.3;
  if (round) p.cyl(top, top, 0.04, [x, y + 0.7, z], pick(r, [0xe6e3dc, 0x6a3f24, 0x3f6f55]), 8);
  else p.box(0.62, 0.04, 0.62, [x, y + 0.72, z], PAL.woodTrim);
  p.box(0.05, 0.7, 0.05, [x, y + 0.35, z], 0x3a3a3a);
  p.cyl(0.17, 0.2, 0.03, [x, y, z], 0x3a3a3a, 6);
  // a cup of butter tea and a plate
  p.cyl(0.04, 0.035, 0.07, [x + 0.08, y + 0.74, z - 0.05], 0xeeeae0, 6);
  if (r() < 0.6) p.cyl(0.09, 0.09, 0.015, [x - 0.1, y + 0.74, z + 0.06], 0xf4f6fa, 8);
  const cc = chairColor ?? pick(r, CHAIRS);
  for (const sx of [-1, 1]) {
    p.group([x + sx * 0.52, y, z], sx > 0 ? -HALF_PI : HALF_PI, () => chair(p, cc));
  }
}

/** Plastic / wooden chair facing +z at the group origin. */
export function chair(p: Parts, color: number) {
  p.box(0.4, 0.05, 0.4, [0, 0.43, 0], color);
  p.box(0.4, 0.42, 0.05, [0, 0.66, -0.19], color, { rot: [-0.12, 0, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.04, 0.42, 0.04, [sx * 0.17, 0.21, sz * 0.17], color);
}

/** Folding A-frame menu board facing +z. */
export function menuBoard(p: Parts, x: number, z: number, yaw: number, r: Rng) {
  p.group([x, 0, z], yaw, () => {
    p.box(0.5, 0.75, 0.04, [0, 0.42, 0.12], PAL.woodTrim, { rot: [0.16, 0, 0] });
    p.box(0.42, 0.62, 0.02, [0, 0.43, 0.15], 0x2a3a34, { rot: [0.16, 0, 0] });
    for (let k = 0; k < 5; k++) {
      const lw = range(r, 0.16, 0.32);
      p.box(lw, 0.025, 0.01, [-0.17 + lw / 2, 0.66 - k * 0.1, 0.18 - k * 0.016], k === 0 ? 0xf1c232 : 0xe6e3dc, { rot: [0.16, 0, 0] });
    }
    p.box(0.5, 0.75, 0.04, [0, 0.42, -0.12], PAL.woodTrim, { rot: [-0.16, 0, 0] });
  });
}

/** Market / café umbrella standing at (x, y, z). */
export function umbrella(p: Parts, x: number, y: number, z: number, color: number, h = 2.15, rad = 0.95) {
  p.box(0.05, h, 0.05, [x, y + h / 2, z], 0x5a5a5a);
  p.cone(rad, 0.36, [x, y + h - 0.22, z], color, 8);
  p.cyl(rad * 1.0, rad * 1.02, 0.07, [x, y + h - 0.27, z], color, 8);
  p.box(0.06, 0.06, 0.06, [x, y + h + 0.14, z], 0x3a3a3a);
}

/** Market umbrella with alternating coloured panels (n wedges) and a matching valance. */
export function stripedUmbrella(p: Parts, x: number, y: number, z: number, cols: readonly number[], h = 2.3, rad = 1.3, n = 8) {
  p.box(0.05, h, 0.05, [x, y + h / 2, z], 0x5a5a5a);
  const L = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const col = cols[i % cols.length];
    const g = new CylinderGeometry(0, rad, 0.4, 1, 1, false, i * L, L);
    g.translate(0, 0.2, 0);
    p.add(g, col, [x, y + h - 0.24, z]);
    const v = new CylinderGeometry(rad, rad * 1.01, 0.1, 1, 1, true, i * L, L);
    v.translate(0, -0.05, 0);
    p.add(v, col, [x, y + h - 0.24, z]);
  }
  p.box(0.06, 0.08, 0.06, [x, y + h + 0.2, z], 0x3a3a3a);
}

// ---- food -------------------------------------------------------------------------------------------------
/** Stack of aluminium momo steamers (tiers) with a domed lid, standing on y. Returns the lid top (local). */
export function steamerStack(p: Parts, x: number, y: number, z: number, tiers: number, rad = 0.22): V3 {
  let yy = y;
  p.cyl(rad * 0.95, rad * 0.95, 0.1, [x, yy, z], 0x8f9398, 10); // water pot
  yy += 0.1;
  for (let i = 0; i < tiers; i++) {
    p.cyl(rad, rad, 0.12, [x, yy, z], i % 2 ? 0xc8ccd0 : 0xbcc0c4, 10);
    p.cyl(rad + 0.015, rad + 0.015, 0.025, [x, yy + 0.1, z], 0xa8acb0, 10);
    yy += 0.125;
  }
  p.cyl(rad * 0.55, rad + 0.01, 0.1, [x, yy, z], 0xd4d8dc, 10);
  p.box(0.06, 0.04, 0.06, [x, yy + 0.12, z], 0x2a2a2a);
  return [x, yy + 0.12, z];
}

/** Steel plate with a few momos. */
export function momoPlate(p: Parts, x: number, y: number, z: number, n = 6) {
  p.cyl(0.11, 0.1, 0.02, [x, y, z], 0xc8ccd0, 10);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.box(0.055, 0.045, 0.055, [x + Math.sin(a) * 0.055, y + 0.035, z + Math.cos(a) * 0.055], 0xf2ead8, { rot: [0, a, 0] });
  }
}

/** Sauce bottle (chilli = red, soy = dark). */
export function bottle(p: Parts, x: number, y: number, z: number, color: number, h = 0.16) {
  p.cyl(0.032, 0.032, h * 0.75, [x, y, z], color, 6);
  p.cyl(0.014, 0.026, h * 0.25, [x, y + h * 0.75, z], color, 6);
  p.box(0.025, 0.025, 0.025, [x, y + h + 0.012, z], 0xeeeae0);
}

/** Red LPG cylinder standing on y. */
export function gasCylinder(p: Parts, x: number, y: number, z: number) {
  p.cyl(0.15, 0.15, 0.46, [x, y + 0.04, z], 0xa8302a, 8);
  p.cyl(0.15, 0.13, 0.04, [x, y, z], 0x3a3a3a, 8);
  p.cyl(0.08, 0.15, 0.08, [x, y + 0.5, z], 0xa8302a, 8);
  p.box(0.14, 0.08, 0.04, [x, y + 0.62, z], 0x6a6a6a); // collar
  p.box(0.05, 0.05, 0.05, [x, y + 0.62, z], 0x2a2a2a);
}

// ---- general store ---------------------------------------------------------------------------------------
/** Fruit / veg crate on y. */
export function crate(p: Parts, x: number, y: number, z: number, r: Rng, fruit?: number) {
  p.box(0.5, 0.24, 0.36, [x, y + 0.12, z], 0x9a7448);
  p.box(0.52, 0.04, 0.38, [x, y + 0.2, z], 0x7a5a36);
  const f = fruit ?? pick(r, [0xe08a2a, 0xb83a2a, 0xe8c84a, 0x6a9a3a, 0x8a3a5a]);
  p.box(0.44, 0.05, 0.3, [x, y + 0.245, z], f);
  for (let i = 0; i < 6; i++) p.box(0.07, 0.07, 0.07, [x + range(r, -0.18, 0.18), y + 0.29, z + range(r, -0.11, 0.11)], f, { rot: [0, r() * 3, 0] });
}

/** Grain sack (open top showing contents). */
export function sack(p: Parts, x: number, y: number, z: number, r: Rng) {
  p.taper(0.4, 0.34, 0.34, 0.3, 0.42, [x, y, z], 0xcdbb94);
  p.box(0.32, 0.04, 0.28, [x, y + 0.42, z], pick(r, [0xeeeae0, 0xc89a4a, 0xb8322b, 0x8a6a3a, 0xe0b02a]));
  p.box(0.4, 0.06, 0.35, [x, y + 0.36, z], 0xbfae86);
}

/** Vertical strip of snack packets hanging from hookY. */
export function snackStrip(hang: Parts, x: number, hookY: number, z: number, n: number, r: Rng) {
  const c = pick(r, PLASTIC);
  for (let i = 0; i < n; i++) {
    hangBoxFrom(hang, hookY, 0.15, 0.17, 0.035, [x, hookY - 0.1 - i * 0.19, z], i % 3 === 2 ? pick(r, PLASTIC) : c);
  }
}

/** Plastic stool on y. */
export function stool(p: Parts, x: number, y: number, z: number, color: number) {
  p.taper(0.32, 0.32, 0.26, 0.26, 0.4, [x, y, z], color);
  p.box(0.3, 0.035, 0.3, [x, y + 0.41, z], color);
  p.box(0.2, 0.3, 0.33, [x, y + 0.16, z], 0x2a2a2a); // hollow underside reads dark
}

/** Hanging clothes line: a cord from a to b (local) with garments (on the sway Parts). */
export function laundry(p: Parts, hang: Parts, a: V3, b: V3, r: Rng) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  p.group([a[0], a[1], a[2]], yaw, () => p.box(0.015, 0.015, L, [0, 0, L / 2], 0xd8d0c0));
  const n = Math.max(2, Math.floor(L / 0.45));
  hang.group([a[0], a[1], a[2]], yaw, () => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const kind = r();
      const c = pick(r, [...TEXTILES, 0xeeeae0, 0x2f63b8, 0xe59ab0]);
      if (kind < 0.4) hangBoxFrom(hang, 0, 0.03, 0.42, 0.34, [0, -0.21, L * t], c); // shirt
      else if (kind < 0.7) hangBoxFrom(hang, 0, 0.03, 0.62, 0.26, [0, -0.31, L * t], c); // trousers
      else hangBoxFrom(hang, 0, 0.03, 0.2, 0.2, [0, -0.1, L * t], c); // small things
    }
  });
}

/** Potted plant (geranium / marigold / tulsi) on y; returns nothing (caller adds a collider if needed). */
export function plant(p: Parts, x: number, y: number, z: number, r: Rng, big = false) {
  const s = big ? 1.4 : 1;
  const pot = pick(r, [PAL.wallTerracotta, 0x6a6a6a, 0x3f6f55, 0xd8d0c0]);
  p.cyl(0.13 * s, 0.1 * s, 0.24 * s, [x, y, z], pot, 6);
  p.box(0.3 * s, 0.22 * s, 0.3 * s, [x, y + 0.34 * s, z], pick(r, [PAL.grass, PAL.grassDeep, PAL.moss]), { rot: [0, r(), 0] });
  p.box(0.2 * s, 0.14 * s, 0.2 * s, [x + 0.04, y + 0.48 * s, z - 0.03], PAL.grassLight, { rot: [0, r(), 0] });
  const bloom = pick(r, [PAL.rhodo, 0xe07a2e, 0xf1c232, 0xe59ab0]);
  for (let i = 0; i < 3; i++) p.box(0.06 * s, 0.06 * s, 0.06 * s, [x + range(r, -0.12, 0.12) * s, y + (0.45 + r() * 0.12) * s, z + range(r, -0.12, 0.12) * s], bloom);
}
