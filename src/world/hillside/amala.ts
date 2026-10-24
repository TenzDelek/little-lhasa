// Amala's house on Dharamkot Road: a two-storey whitewashed Tibetan family house with a maroon parapet band,
// blue window frames in black trapezoid surrounds, painted lintels and lungta-striped shambu valances, window
// boxes of marigolds, a small porch with a green tin roof and a row of potted marigolds, the low bench against
// the front wall where Amala sits (AMALA_SEAT) with her thermos of butter tea, and prayer flags fanning from
// a pole on the flat roof. The front door faces west onto the road; the yard in front stays open.
import { PAL } from '../../core/palette';
import { rng } from '../../core/math';
import type { V3 } from '../../core/geom';
import { groundY } from '../terrain';
import { bench, pottedPlant, flagChain } from '../../kit/street';
import { corrugated } from '../../kit/building';
import { type Ctx, footprint, inFrame, wpos } from './ctx';
import { localBox, rod, toWorld } from './util';
import { AMALA_BENCH_L, AMALA_FRAME, AMALA_HOUSE, AMALA_SEAT } from './spots';

const WALL = 0xeeeae0, WALL_SHADE = 0xd8d2c4, DADO = 0x9a958a;
const BLUE = 0x2f5f9a, BLUE_D = 0x264e80, BLACK = 0x23202a, MAROON = PAL.templeMaroon;
const LUNGTA = PAL.lungta;
const FH = 2.85; // storey height

export function amalaHouse(c: Ctx) {
  const f = AMALA_FRAME;
  const { w, d, porch, doorX } = AMALA_HOUSE;
  const r = rng(2024);
  const hw = w / 2;
  const gFront = groundY(f.x, f.z);
  const y = Math.max(gFront, f.roadY) + 0.3; // floor level on a low plinth
  const H = FH * 2;
  const B = c.bld, P = c.props;

  /** Tibetan window on a wall facing +z (wall plane at z = 0 in the current group). */
  const windowAt = (x: number, wy: number, ww: number, wh: number, lit: boolean, box: boolean, rich = true) => {
    // black trapezoid surround, wider at the bottom
    B.taper(ww + 0.42, 0.04, ww + 0.2, 0.04, wh + 0.36, [x, wy - 0.2, 0.01], BLACK);
    // painted lintel: rows of little coloured blocks (front only), then a maroon board
    B.slab(x - ww / 2 - 0.2, wy + wh + 0.18, 0.0, x + ww / 2 + 0.2, wy + wh + 0.3, 0.12, MAROON);
    const n = rich ? Math.max(4, Math.round((ww + 0.3) / 0.13)) : 0;
    for (let i = 0; i < n; i++) {
      const bx = x - (ww + 0.3) / 2 + ((ww + 0.3) * (i + 0.5)) / n;
      B.box(0.08, 0.07, 0.06, [bx, wy + wh + 0.13, 0.08], [PAL.templeGreen, PAL.templeRed, PAL.templeBlue, PAL.templeYellow][i % 4]);
    }
    if (!rich) B.slab(x - ww / 2 - 0.12, wy + wh + 0.1, 0.0, x + ww / 2 + 0.12, wy + wh + 0.17, 0.08, PAL.templeGreen);
    // blue frame, glass, mullions
    B.slab(x - ww / 2, wy, 0.0, x + ww / 2, wy + wh, 0.07, BLUE);
    B.slab(x - ww / 2 + 0.07, wy + 0.07, 0.03, x + ww / 2 - 0.07, wy + wh - 0.07, 0.075, lit ? 0x3a4a56 : PAL.glass,
      lit ? { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.9 } : undefined);
    B.slab(x - 0.025, wy + 0.07, 0.03, x + 0.025, wy + wh - 0.07, 0.09, BLUE_D);
    B.slab(x - ww / 2 + 0.07, wy + wh * 0.6 - 0.025, 0.03, x + ww / 2 - 0.07, wy + wh * 0.6 + 0.025, 0.09, BLUE_D);
    // shambu valance: lungta stripes across the top
    for (let i = 0; i < 5; i++) {
      const sx = x - ww / 2 + 0.07 + ((ww - 0.14) * (i + 0.5)) / 5;
      B.box((ww - 0.14) / 5, 0.14, 0.02, [sx, wy + wh - 0.15, 0.1], LUNGTA[i]);
    }
    // window box of marigolds
    if (box) {
      B.slab(x - ww / 2 - 0.05, wy - 0.22, 0.0, x + ww / 2 + 0.05, wy - 0.02, 0.24, PAL.wallTerracotta);
      for (let i = 0; i < 5; i++) B.box(0.14, 0.1, 0.14, [x - ww / 2 + 0.1 + (ww - 0.2) * (i / 4), wy + 0.02, 0.13], i % 2 ? 0xe0801e : 0xe8a82a);
      B.slab(x - ww / 2, wy - 0.04, 0.04, x + ww / 2, wy + 0.0, 0.22, 0x4f7a32);
    }
  };

  inFrame(c, f, y, () => {
    // ---- shell ----------------------------------------------------------------------------------------------
    B.slab(-hw - 0.05, -0.9, -d - 0.05, hw + 0.05, 0, 0.05, PAL.stoneStep); // plinth into the slope
    B.slab(-hw, 0, -d, hw, H, 0, WALL);
    B.slab(-hw - 0.02, 0, -d - 0.02, hw + 0.02, 0.38, 0.02, DADO); // splash band
    B.slab(-hw - 0.06, FH - 0.12, -d - 0.06, hw + 0.06, FH + 0.04, 0.06, WALL_SHADE); // floor band
    // maroon parapet band (Tibetan roof edge) with a white cap, and a thin dark line under it
    const ring = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, t: number, col: number) => {
      B.slab(x0, y0, z1 - t, x1, y1, z1, col);
      B.slab(x0, y0, z0, x1, y1, z0 + t, col);
      B.slab(x0, y0, z0 + t, x0 + t, y1, z1 - t, col);
      B.slab(x1 - t, y0, z0 + t, x1, y1, z1 - t, col);
    };
    ring(-hw - 0.08, -d - 0.08, hw + 0.08, 0.08, H, H + 0.55, 0.24, MAROON);
    ring(-hw - 0.1, -d - 0.1, hw + 0.1, 0.1, H + 0.55, H + 0.65, 0.28, WALL);
    ring(-hw - 0.09, -d - 0.09, hw + 0.09, 0.09, H - 0.06, H, 0.12, BLACK);
    B.slab(-hw + 0.1, H, -d + 0.1, hw - 0.1, H + 0.12, -0.1, 0x8e887e); // roof slab (bare concrete)
    B.slab(-hw + 0.6, H + 0.12, -d + 2.2, -hw + 2.6, H + 0.13, -d + 3.6, 0x7a746a); // damp patch
    // corner pilasters
    for (const sx of [-hw, hw]) B.slab(sx - 0.07, 0, -0.12, sx + 0.07, H, 0.07, WALL_SHADE);

    // ---- front (west) ----------------------------------------------------------------------------------
    // door: maroon with brass, shambu valance, white curtain with a blue endless knot
    B.slab(doorX - 0.55, 0, 0.0, doorX + 0.55, 2.25, 0.08, BLUE);
    B.slab(doorX - 0.45, 0, 0.02, doorX + 0.45, 2.12, 0.09, PAL.templeRed);
    B.slab(doorX - 0.44, 0.9, 0.08, doorX + 0.44, 2.0, 0.11, 0xf1ede4);
    B.box(0.26, 0.26, 0.02, [doorX, 1.45, 0.12], BLUE, { rot: [0, 0, Math.PI / 4] });
    B.box(0.12, 0.12, 0.022, [doorX, 1.45, 0.125], 0xf1ede4, { rot: [0, 0, Math.PI / 4] });
    for (let i = 0; i < 5; i++) B.box(0.18, 0.16, 0.02, [doorX - 0.36 + i * 0.18, 2.02, 0.13], LUNGTA[i]);
    B.slab(doorX - 0.75, 2.3, 0.0, doorX + 0.75, 2.42, 0.16, MAROON);
    windowAt(-2.15, 1.0, 1.0, 1.15, false, false);
    windowAt(-2.3, FH + 0.85, 1.0, 1.2, true, true);
    windowAt(0.1, FH + 0.85, 1.0, 1.2, false, true);
    windowAt(2.45, FH + 0.85, 1.0, 1.2, true, true);
    // a small painted dharma wheel above the door
    B.cyl(0.16, 0.16, 0.03, [doorX, 2.62, 0.02], PAL.gold, 8, { rot: [Math.PI / 2, 0, 0] });

    // ---- side and back walls: the same blue Tibetan windows (simpler lintels), a kitchen door at the back ----
    // local +x is the south wall, −x the north wall, −z the back (east, down the slope)
    B.group([hw, 0, 0], Math.PI / 2, () => {
      windowAt(d * 0.5, 1.0, 0.9, 1.1, true, false, false);
      windowAt(d * 0.28, FH + 0.85, 0.9, 1.15, false, true, false);
      windowAt(d * 0.72, FH + 0.85, 0.9, 1.15, true, false, false);
    });
    B.group([-hw, 0, 0], -Math.PI / 2, () => {
      windowAt(-d * 0.62, 1.0, 0.8, 1.05, false, false, false);
      windowAt(-d * 0.3, FH + 0.85, 0.9, 1.15, true, true, false);
      windowAt(-d * 0.7, FH + 0.85, 0.9, 1.15, false, false, false);
    });
    B.group([0, 0, -d], Math.PI, () => {
      windowAt(-1.9, 1.0, 0.9, 1.05, false, false, false);
      windowAt(1.6, FH + 0.85, 1.0, 1.15, true, false, false);
      windowAt(-0.6, FH + 0.85, 1.0, 1.15, false, true, false);
      windowAt(-2.6, FH + 0.85, 0.8, 1.15, false, false, false);
      // kitchen door with a cotton curtain, a stove pipe up the wall, firewood stacked beside it
      B.slab(0.55, 0, 0.0, 1.45, 2.05, 0.07, BLUE);
      B.slab(0.62, 0, 0.02, 1.38, 1.95, 0.08, PAL.templeMaroon);
      B.slab(0.64, 0.7, 0.08, 1.36, 1.9, 0.1, 0xe8e2d6);
      for (let i = 0; i < 5; i++) B.box(0.14, 0.12, 0.02, [0.72 + i * 0.14, 1.83, 0.11], LUNGTA[i]);
      B.slab(0.4, 2.12, 0.0, 1.6, 2.22, 0.14, MAROON);
      B.cyl(0.07, 0.07, H + 1.0 - 2.0, [2.55, 2.0, 0.24], 0x4a4a4c, 6);
      B.box(0.24, 0.12, 0.3, [2.55, 2.0, 0.12], 0x3a3634);
      B.cyl(0.11, 0.09, 0.2, [2.55, H + 1.0, 0.24], 0x3a3634, 6);
      for (let j = 0; j < 3; j++) for (let k = 0; k < 4 - j; k++) {
        B.cyl(0.07, 0.07, 0.75, [-0.35 + k * 0.15 + j * 0.075, 0.07 + j * 0.13, 0.35], j % 2 ? 0x8b6a44 : 0x7a5a3a, 5, { rot: [0, 0, Math.PI / 2] });
      }
    });

    // ---- porch: raised floor, two blue posts, a green tin roof, rug, shoes ------------------------------------
    const px0 = doorX - 1.8, px1 = doorX + 1.8;
    P.slab(px0, -0.6, 0, px1, 0, porch, PAL.concrete);
    P.slab(px0 - 0.02, -0.04, porch - 0.06, px1 + 0.02, 0.01, porch + 0.02, PAL.curb);
    P.slab(doorX - 0.5, -0.6, porch, doorX + 0.5, -0.15, porch + 0.32, PAL.stoneStep); // step
    P.slab(doorX - 0.5, 0.0, 0.25, doorX + 0.5, 0.012, 1.1, PAL.templeRed); // rug
    P.slab(doorX - 0.42, 0.012, 0.32, doorX + 0.42, 0.016, 1.03, PAL.templeYellow);
    P.slab(doorX - 0.32, 0.016, 0.42, doorX + 0.32, 0.02, 0.93, 0x2f63b8);
    for (const sx of [px0 + 0.12, px1 - 0.12]) B.slab(sx - 0.06, 0, porch - 0.18, sx + 0.06, 2.55, porch - 0.06, BLUE);
    B.groupEuler([0, 2.6 + 0.25, -0.05], [0.16, 0, 0], () => {
      B.add(corrugated(px0 - 0.15, px1 + 0.15, () => [0, porch + 0.35], 0.13, 0.03), PAL.roofGreen, [0, 0, 0]);
      B.slab(px0 - 0.15, -0.035, 0, px1 + 0.15, -0.005, porch + 0.35, 0x355a3c);
    });
    // shoes by the door
    P.box(0.1, 0.06, 0.24, [doorX + 0.62, 0.03, 0.35], 0x2a2a2e);
    P.box(0.1, 0.06, 0.24, [doorX + 0.75, 0.03, 0.4], 0x2a2a2e, { rot: [0, 0.3, 0] });
    P.box(0.09, 0.05, 0.2, [doorX - 0.7, 0.025, 0.3], PAL.bootRed, { rot: [0, -0.2, 0] });
    // porch light
    P.box(0.08, 0.1, 0.08, [doorX, 2.48, 0.22], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 2.2 });
    // a hand prayer wheel and a thermos of butter tea on a small table beside the bench
    const bx = AMALA_BENCH_L.x;
    P.slab(bx + 0.95, 0, 0.35, bx + 1.35, 0.5, 0.75, 0x8b5a33);
    P.cyl(0.07, 0.07, 0.3, [bx + 1.06, 0.5, 0.55], PAL.roofRed, 8);
    P.cyl(0.04, 0.04, 0.05, [bx + 1.06, 0.8, 0.55], 0xd8d0c0, 8);
    P.cyl(0.05, 0.045, 0.08, [bx + 1.24, 0.5, 0.5], 0xd8d0c0, 8);
    // clothes line from the porch post to a pole in the yard, washing on it
    const pole: V3 = [hw - 0.2, 0, 3.2];
    rod(P, pole, [pole[0], 2.05, pole[2]], 0.06, 0x8b5a33);
  });

  const W = (l: V3): V3 => wpos(f, y, l);
  // clothes on the line (sag between the post and the pole)
  {
    const a = W([doorX + 1.68, 2.0, porch - 0.12]), b = W([hw - 0.2, 2.0, 3.2]);
    const n = 6;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, t2 = (i + 1) / 12;
      if (i === 12) break;
      const pa: V3 = [a[0] + (b[0] - a[0]) * t, a[1] - Math.sin(t * Math.PI) * 0.18, a[2] + (b[2] - a[2]) * t];
      const pb: V3 = [a[0] + (b[0] - a[0]) * t2, a[1] - Math.sin(t2 * Math.PI) * 0.18, a[2] + (b[2] - a[2]) * t2];
      rod(P, pa, pb, 0.02, 0x3a332c);
    }
    const cols = [PAL.chubaMaroon, PAL.blouseSky, 0xe8e2d6, PAL.blousePink, PAL.chubaNavy, PAL.sashGold];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.7) / (n + 0.6);
      const cx = a[0] + (b[0] - a[0]) * t, cz = a[2] + (b[2] - a[2]) * t, cy = a[1] - Math.sin(t * Math.PI) * 0.18;
      const big = i % 3 === 0;
      P.group([cx, cy, cz], Math.atan2(b[0] - a[0], b[2] - a[2]), () => {
        P.box(0.04, big ? 0.62 : 0.4, big ? 0.48 : 0.34, [0, big ? -0.31 : -0.2, 0], cols[i]);
      });
    }
  }

  // bench against the front wall (Amala's seat), facing the road
  {
    const [x, z] = toWorld(f, AMALA_BENCH_L.x, AMALA_BENCH_L.z);
    c.colliders.push(bench(P, x, AMALA_SEAT.y - 0.46, z, f.yaw, 0x6a3f24, { back: true, len: AMALA_BENCH_L.len, seed: 77 }));
  }
  // potted marigolds along the porch edge and by the steps
  {
    const spots: [number, number, number][] = [
      [doorX - 1.65, porch - 0.25, 0], [doorX - 1.15, porch - 0.25, 0], [doorX + 1.2, porch - 0.25, 0], [doorX + 1.62, porch - 0.25, 0],
      [doorX - 0.75, porch + 0.3, -0.3], [doorX + 0.75, porch + 0.3, -0.3], [hw - 0.35, 0.4, -0.3], [hw - 0.75, 0.42, -0.3],
    ];
    spots.forEach(([lx, lz, dy], i) => {
      const [x, z] = toWorld(f, lx, lz);
      const by = dy < 0 ? groundY(x, z) : y;
      const col = pottedPlant(P, x, by, z, 300 + i, i % 3 === 2 ? 'geranium' : 'marigold', i % 2 ? 'tin' : 'terracotta');
      if (dy < 0) c.colliders.push(col);
    });
  }

  // colliders: house, porch floor (a step up), porch posts, table, clothes pole
  c.colliders.push(localBox(f, 0, -d / 2, w, d, y - 1, y + H + 0.65, 'building'));
  c.colliders.push(localBox(f, doorX, porch / 2, 3.6, porch, y - 0.8, y, 'porch'));
  c.colliders.push(localBox(f, doorX, porch + 0.16, 1.0, 0.32, y - 0.8, y - 0.15, 'step'));
  for (const sx of [doorX - 1.68, doorX + 1.68]) c.colliders.push(localBox(f, sx, porch - 0.12, 0.14, 0.14, y, y + 2.6, 'post'));
  c.colliders.push(localBox(f, AMALA_BENCH_L.x + 1.15, 0.55, 0.42, 0.42, y - 0.3, y + 0.5, 'table'));
  c.colliders.push(localBox(f, hw - 0.2, 3.2, 0.1, 0.1, y - 0.3, y + 2.05, 'pole'));
  footprint(c, f, 0, -d / 2 + 0.4, w + 0.4, d + 1.4);
  {
    const [x, z] = toWorld(f, doorX, 0.4);
    c.lamps.push({ x, y: y + 2.3, z, color: PAL.lampWarm, intensity: 5, distance: 8 });
  }

  // ---- roof: water tank, sang (incense) burner, flag poles at the corners and a tall pole in the middle --------
  inFrame(c, f, y, () => {
    B.cyl(0.55, 0.55, 1.05, [hw - 1.0, H + 0.12, -d + 1.0], PAL.waterTank, 10);
    B.cyl(0.2, 0.2, 0.12, [hw - 1.0, H + 1.17, -d + 1.0], 0x2a2a2e, 8);
    B.slab(-hw + 0.6, H + 0.12, -d + 0.5, -hw + 1.2, H + 0.75, -d + 1.1, WALL);
    B.slab(-hw + 0.7, H + 0.5, -d + 0.45, -hw + 1.1, H + 0.68, -d + 0.52, 0x2a1a14);
    B.cone(0.24, 0.5, [-hw + 0.9, H + 0.75, -d + 0.8], WALL, 6);
  });
  const corners: [number, number][] = [[-hw + 0.25, -0.25], [hw - 0.25, -0.25], [hw - 0.25, -d + 0.25], [-hw + 0.25, -d + 0.25]];
  const tops: V3[] = [];
  for (const [lx, lz] of corners) {
    const base = W([lx, H + 0.12, lz]);
    rod(P, base, [base[0], base[1] + 1.9, base[2]], 0.06, PAL.barkLight);
    tops.push([base[0], base[1] + 1.85, base[2]]);
  }
  const mid = W([0.3, H + 0.12, -d / 2]);
  rod(P, mid, [mid[0], mid[1] + 3.6, mid[2]], 0.08, PAL.barkLight);
  P.cone(0.06, 0.2, [mid[0], mid[1] + 3.6, mid[2]], PAL.gold, 6);
  c.circles.push({ x: mid[0], z: mid[2], r: 0.08, y0: mid[1], y1: mid[1] + 3.6, tag: 'pole' });
  const top: V3 = [mid[0], mid[1] + 3.45, mid[2]];
  for (const t of tops) c.flags.push(...flagChain([top, t], { age: 0.25 + r() * 0.3, seed: Math.floor(r() * 1000) }));
  c.flags.push(...flagChain([tops[0], tops[1], tops[2], tops[3], tops[0]], { age: 0.55, seed: 77, sagFrac: 0.05, size: 0.2 }));
  // and a long string from the roof pole down to the clothes-line pole in the yard
  c.flags.push(...flagChain([top, W([hw - 0.2, 2.1, 3.2])], { age: 0.4, seed: 91, sagFrac: 0.05 }));
}
