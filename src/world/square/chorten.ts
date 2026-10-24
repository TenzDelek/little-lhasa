// The white chorten (stupa) on the square's north-east: a whitewashed enclosure with corner posts that
// carry lungta strings up to the spire; inside, the stepped lion-throne base, the four steps, the vase-shaped
// bumpa with a butter-lamp niche, the harmika, the spire of thirteen gilded rings, parasol, moon and sun.
// Mani stones, tsatsas and khatas at its foot, a whitewashed sang-khang (juniper incense burner) by the gate.
import { CylinderGeometry } from 'three';
import type { Parts, V3 } from '../../core/geom';
import type { BoxInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import { PAL } from '../../core/palette';
import type { Decals } from './decals';

const PI = Math.PI;
const WHITE = PAL.templeWhite, SHADE = 0xe2ddd0;

export interface ChortenBuild {
  colliders: BoxInit[];
  lamps: Lamp[];
  /** Spire point the flag strings start from. */
  spire: V3;
  /** Tops of the four corner posts (flag anchors). */
  posts: V3[];
  /** Smoke vent of the sang-khang (world). */
  smoke: V3;
}

export function buildChorten(p: Parts, d: Decals, at: { x: number; y: number; z: number; yaw: number }, yard: number): ChortenBuild {
  const cs = Math.cos(at.yaw), sn = Math.sin(at.yaw);
  const W = (lx: number, ly: number, lz: number): V3 => [at.x + lx * cs + lz * sn, at.y + ly, at.z - lx * sn + lz * cs];
  const h = yard / 2;                // enclosure half size (outer)
  const WALL_H = 0.5, POST_H = 2.15, GATE = 0.75;
  const SK: [number, number] = [-h - 0.6, h - 0.35]; // sang-khang, outside the south-west corner
  const posts: V3[] = [];
  let spireY = 0;

  p.group([at.x, at.y, at.z], at.yaw, () => {
    // ---- enclosure: paved yard, low whitewashed wall with a dark cap, gate on the south ------------------
    p.slab(-h + 0.2, -0.2, -h + 0.2, h - 0.2, 0.06, h - 0.2, PAL.stoneStep);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const s = (yard - 0.4) / 5, x = -h + 0.2 + i * s, z = -h + 0.2 + j * s;
      p.slab(x + 0.02, 0.06, z + 0.02, x + s - 0.02, 0.08, z + s - 0.02, (i * 3 + j) % 4 ? PAL.paving : PAL.pavingDark);
    }
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      p.slab(x0, -0.1, z0, x1, WALL_H, z1, WHITE);
      p.slab(x0 - 0.02, WALL_H, z0 - 0.02, x1 + 0.02, WALL_H + 0.06, z1 + 0.02, PAL.pema);
      p.slab(x0 - 0.01, -0.1, z0 - 0.01, x1 + 0.01, 0.1, z1 + 0.01, PAL.rockDark);
    };
    wall(-h, -h, h, -h + 0.22);
    wall(-h, -h + 0.22, -h + 0.22, h);
    wall(h - 0.22, -h + 0.22, h, h);
    wall(-h + 0.22, h - 0.22, -GATE, h);
    wall(GATE, h - 0.22, h - 0.22, h);
    // corner posts with gilded caps (flag anchors) and gate posts
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * (h - 0.15), z = sz * (h - 0.15);
      p.box(0.3, POST_H, 0.3, [x, POST_H / 2 - 0.05, z], WHITE);
      p.box(0.34, 0.08, 0.34, [x, POST_H - 0.05, z], PAL.pema);
      p.cone(0.12, 0.22, [x, POST_H - 0.01, z], PAL.gold, 6);
      posts.push(W(x, POST_H + 0.12, z));
    }
    for (const sx of [-1, 1]) {
      p.box(0.26, 0.95, 0.26, [sx * (GATE + 0.1), 0.45, h - 0.11], WHITE);
      p.box(0.3, 0.06, 0.3, [sx * (GATE + 0.1), 0.95, h - 0.11], PAL.pema);
      p.cyl(0.07, 0.1, 0.12, [sx * (GATE + 0.1), 0.98, h - 0.11], PAL.lungta[sx > 0 ? 2 : 0], 6);
    }

    // ---- the stupa ---------------------------------------------------------------------------------------
    let y = 0.08;
    // lion-throne base: two tiers with recessed panels
    p.slab(-1.5, y - 0.1, -1.5, 1.5, y + 0.48, 1.5, WHITE); y += 0.48;
    for (let k = 0; k < 4; k++) p.group([0, 0, 0], (k * PI) / 2, () => {
      p.slab(-1.15, 0.2, 1.5, 1.15, 0.46, 1.52, SHADE);
      for (let i = 0; i < 3; i++) p.box(0.14, 0.12, 0.02, [-0.7 + i * 0.7, 0.33, 1.53], i === 1 ? PAL.gold : PAL.templeRed);
    });
    p.slab(-1.56, y - 0.04, -1.56, 1.56, y + 0.04, 1.56, PAL.pema);
    p.slab(-1.3, y, -1.3, 1.3, y + 0.36, 1.3, WHITE); y += 0.36;
    p.slab(-1.34, y - 0.03, -1.34, 1.34, y + 0.03, 1.34, PAL.gold);
    // the four steps
    for (let i = 0; i < 4; i++) {
      const s = 1.12 - i * 0.12;
      p.slab(-s, y, -s, s, y + 0.17, s, i % 2 ? SHADE : WHITE);
      y += 0.17;
    }
    // bumpa: lotus collar, vase body flaring upward, rounded shoulder
    p.cyl(0.78, 0.82, 0.12, [0, y, 0], PAL.goldDeep, 12); y += 0.12;
    p.cyl(0.84, 0.72, 0.72, [0, y, 0], WHITE, 14); y += 0.72;
    p.cyl(0.52, 0.84, 0.32, [0, y, 0], WHITE, 14); y += 0.32;
    // butter-lamp niche on the front of the bumpa
    const ny = y - 0.86;
    p.box(0.56, 0.68, 0.16, [0, ny + 0.34, 0.74], PAL.gold);
    p.box(0.44, 0.56, 0.18, [0, ny + 0.32, 0.76], PAL.templeRed);
    p.box(0.34, 0.46, 0.2, [0, ny + 0.29, 0.77], 0x2a1a14);
    p.cone(0.24, 0.12, [0, ny + 0.68, 0.76], PAL.gold, 4);
    p.cyl(0.06, 0.04, 0.07, [0, ny + 0.08, 0.92], PAL.khorloGold, 6);
    p.box(0.04, 0.08, 0.04, [0, ny + 0.19, 0.92], PAL.butterFlame, { emit: PAL.butterFlame, emitIntensity: 1.8 });
    // harmika with a gilded cornice
    p.slab(-0.32, y, -0.32, 0.32, y + 0.36, 0.32, WHITE); y += 0.36;
    p.slab(-0.4, y, -0.4, 0.4, y + 0.07, 0.4, PAL.gold); y += 0.07;
    p.slab(-0.34, y, -0.34, 0.34, y + 0.06, 0.34, PAL.goldDeep); y += 0.06;
    // spire: lotus seat and thirteen rings, alternating tones so each ring reads as a pixel stripe
    p.cyl(0.3, 0.24, 0.1, [0, y, 0], PAL.gold, 10); y += 0.1;
    for (let i = 0; i < 13; i++) {
      const r = 0.27 - i * 0.012;
      p.cyl(r - 0.01, r, 0.1, [0, y, 0], i % 2 ? PAL.goldDeep : PAL.gold, 10);
      y += 0.105;
    }
    spireY = y - 0.3;
    // parasol with a silk fringe, moon, sun and jewel
    p.cyl(0.36, 0.3, 0.07, [0, y, 0], PAL.gold, 10);
    p.cyl(0.37, 0.37, 0.12, [0, y - 0.12, 0], PAL.templeRed, 10);
    p.cyl(0.05, 0.05, 0.14, [0, y + 0.07, 0], PAL.goldDeep, 6);
    y += 0.2;
    p.box(0.26, 0.05, 0.05, [0, y, 0], PAL.gold);
    p.box(0.05, 0.12, 0.05, [-0.12, y + 0.06, 0], PAL.gold);
    p.box(0.05, 0.12, 0.05, [0.12, y + 0.06, 0], PAL.gold);
    p.add(new CylinderGeometry(0.09, 0.09, 0.05, 10), PAL.gold, [0, y + 0.15, 0], { rot: [PI / 2, 0, 0] });
    p.cone(0.05, 0.2, [0, y + 0.24, 0], PAL.gold, 6);

    // ---- offerings at its foot -------------------------------------------------------------------------
    // tsatsas (little clay stupas) on the lower ledge, front and sides
    for (let k = -1; k <= 1; k++) p.group([0, 0, 0], (k * PI) / 2, () => {
      for (let i = 0; i < 6; i++) {
        const x = -1.05 + i * 0.42;
        if (k === 0 && Math.abs(x) < 0.3) continue;
        p.cyl(0.06, 0.07, 0.06, [x, 0.56, 1.42], 0xc9b48a, 6);
        p.cone(0.055, 0.12, [x, 0.62, 1.42], 0xd8c49a, 6);
      }
    });
    // khata draped over the front of the second tier
    p.box(0.9, 0.05, 0.06, [0.15, 0.94, 1.32], PAL.templeWhite, { rot: [0, 0, 0.06] });
    p.box(0.1, 0.42, 0.04, [-0.32, 0.72, 1.33], PAL.templeWhite, { rot: [0, 0, 0.1] });
    p.box(0.1, 0.36, 0.04, [0.6, 0.76, 1.33], PAL.templeWhite, { rot: [0, 0, -0.08] });
    // butter-lamp tray on the ground at the front
    p.box(0.8, 0.08, 0.36, [0, 0.12, 1.75], PAL.rockDark);
    for (let i = 0; i < 5; i++) {
      p.cyl(0.045, 0.03, 0.06, [-0.3 + i * 0.15, 0.16, 1.75], PAL.khorloGold, 6);
      if (i % 2 === 0) p.box(0.03, 0.05, 0.03, [-0.3 + i * 0.15, 0.25, 1.75], PAL.butterFlame, { emit: PAL.butterFlame, emitIntensity: 1.5 });
    }
    // mani stones stacked against the outside of the west wall, painted with the mantra
    const mx = -h - 0.2;
    const stones: [number, number, number, number, number, number][] = [
      // x, y, z, w, h, yaw
      [mx, 0.07, 0.3, 0.55, 0.14, 0.1], [mx, 0.21, 0.25, 0.48, 0.13, -0.15], [mx - 0.02, 0.35, 0.32, 0.42, 0.13, 0.2],
      [mx, 0.07, -0.4, 0.5, 0.14, -0.05], [mx, 0.2, -0.42, 0.4, 0.12, 0.12], [mx, 0.07, -1.1, 0.46, 0.14, 0.08],
    ];
    stones.forEach(([x, yy, z, w, hh, ry], i) => {
      p.group([x, yy, z], -PI / 2 + ry, () => {
        p.box(w, hh, 0.22, [0, 0, 0], i % 2 ? PAL.slate : PAL.rockDark);
        d.quad(p.matrix, [0, 0, 0.112], w * 0.86, hh * 0.72, 'mani' + (i % 5));
      });
    });

    // ---- sang-khang (juniper incense burner) outside the gate, south-west corner -------------------------
    p.group([SK[0], 0, SK[1]], PI / 4, () => {
      p.slab(-0.38, -0.05, -0.38, 0.38, 0.75, 0.38, WHITE);
      p.slab(-0.4, 0.75, -0.4, 0.4, 0.82, 0.4, PAL.pema);
      p.taper(0.6, 0.6, 0.22, 0.22, 0.55, [0, 0.82, 0], WHITE);
      p.cyl(0.08, 0.09, 0.22, [0, 1.37, 0], PAL.concreteDark, 6);
      p.box(0.34, 0.3, 0.04, [0, 0.42, 0.37], 0x1c1714);
      p.box(0.2, 0.1, 0.05, [0, 0.33, 0.38], PAL.lampSodium, { emit: PAL.butterFlame, emitIntensity: 0.9 });
      p.box(0.62, 0.05, 0.08, [0, 0.62, 0.4], PAL.slate);
      // smoke stains
      p.box(0.18, 0.2, 0.01, [0, 1.1, 0.2], PAL.concreteStain, { rot: [-0.35, 0, 0] });
    });
  });

  const colliders: BoxInit[] = [];
  const box = (lx: number, lz: number, w: number, dd: number, y1: number, tag: string, rot = 0) => {
    const c = W(lx, 0, lz);
    colliders.push({ x: c[0], z: c[2], w, d: dd, rot: at.yaw + rot, y0: at.y - 0.2, y1: at.y + y1, tag });
  };
  box(0, -h + 0.11, yard, 0.22, WALL_H + 0.06, 'chorten-wall');
  box(-h + 0.11, 0, 0.22, yard, WALL_H + 0.06, 'chorten-wall');
  box(h - 0.11, 0, 0.22, yard, WALL_H + 0.06, 'chorten-wall');
  box(-(h + GATE) / 2, h - 0.11, h - GATE, 0.22, WALL_H + 0.06, 'chorten-wall');
  box((h + GATE) / 2, h - 0.11, h - GATE, 0.22, WALL_H + 0.06, 'chorten-wall');
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(sx * (h - 0.15), sz * (h - 0.15), 0.32, 0.32, POST_H + 0.15, 'chorten-post');
  for (const sx of [-1, 1]) box(sx * (GATE + 0.1), h - 0.11, 0.28, 0.28, 1.05, 'chorten-gate');
  box(0, 0, 3.0, 3.0, spireY + 0.8, 'chorten');
  box(0, 1.75, 0.8, 0.36, 0.2, 'chorten-tray');
  box(-h - 0.2, -0.4, 0.3, 1.8, 0.45, 'mani-stones');
  const sk = W(SK[0], 0, SK[1]);
  colliders.push({ x: sk[0], z: sk[2], w: 0.8, d: 0.8, rot: at.yaw + PI / 4, y0: at.y - 0.1, y1: at.y + 1.45, tag: 'sangkang' });
  const niche = W(0, 2.1, 1.1);
  const lamps: Lamp[] = [{ x: niche[0], y: niche[1], z: niche[2], color: PAL.butter, intensity: 1.6, distance: 3.5, flicker: 0.5 }];
  return { colliders, lamps, spire: W(0, spireY, 0), posts, smoke: W(SK[0], 1.6, SK[1]) };
}
