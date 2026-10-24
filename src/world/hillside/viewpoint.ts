// The Dhauladhar viewpoint at the top of Dharamkot Road (PLAZAS 'viewpoint', y = 7): a stone platform edged by
// a low rubble parapet with blue pipe railings on its outer sides, benches facing the snow peaks to the
// north, a coin-operated binocular on a pedestal, a painted "which peak is which" board, a lamp post, a
// darchor and lungta strings over the plaza, and rhododendrons around it.
import { PAL } from '../../core/palette';
import { rng } from '../../core/math';
import type { V3 } from '../../core/geom';
import { groundY } from '../terrain';
import { G } from '../../game/store';
import { sfx } from '../../audio/sfx';
import { bench, bin, railing, streetLamp, flagChain } from '../../kit/street';
import { makeSign } from '../../kit/sign';
import type { Ctx } from './ctx';
import { VIEWPOINT, jit } from './util';

const PARAPET = 0.42;

export function viewpoint(c: Ctx) {
  const [x0, z0, x1, z1] = VIEWPOINT.rect;
  const y = VIEWPOINT.y;
  const r = rng(5150);
  const P = c.props, B = c.bld;
  const stones = [PAL.rock, PAL.rockDark, PAL.stoneStep, PAL.slateLight] as const;

  /** Rubble parapet with a railing on top along a → b (world xz), its outer face toward `out` (unit xz). */
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    P.group([mx, y, mz], yaw, () => {
      const gLow = Math.min(groundY(ax, az), groundY(bx, bz), y) - 0.4;
      P.slab(-0.22, gLow - y, -L / 2, 0.22, PARAPET, L / 2, PAL.stoneStep);
      P.slab(-0.26, PARAPET, -L / 2 - 0.02, 0.26, PARAPET + 0.07, L / 2 + 0.02, PAL.concrete);
      // coursed stones on both faces
      for (const side of [-1, 1]) {
        let z = -L / 2 + 0.05;
        let k = 0;
        while (z < L / 2 - 0.2) {
          const w = 0.3 + r() * 0.3;
          if (r() < 0.6) P.box(0.04, 0.16 + r() * 0.06, w - 0.05, [side * 0.22, 0.1 + (k % 2) * 0.17, z + w / 2], jit(r, stones[k % stones.length], 0.06));
          z += w; k++;
        }
      }
    });
    c.colliders.push({ x: mx, z: mz, w: 0.5, d: L, rot: yaw, y0: y - 1, y1: y + PARAPET + 1.0, tag: 'parapet' });
    c.colliders.push(railing(P, [ax, y + PARAPET + 0.07, az], [bx, y + PARAPET + 0.07, bz], 0.62, PAL.railing));
  };
  const i = 0.25; // inset of the parapet from the plaza edge
  // north (the view), east, west (south part left open where the road comes in), south-east stub
  edge(x0 + i, z0 + i, x1 - i, z0 + i);
  edge(x1 - i, z0 + i, x1 - i, z1 - i);
  edge(x0 + i, z0 + i, x0 + i, z1 - 3.4);
  edge(x1 - i, z1 - i, x0 + 7.4, z1 - i);

  // benches facing the peaks (north = yaw π), clear of the hiker who stands at (30.4, −87.6)
  for (const bx of [x0 + 2.6, x1 - 2.7]) c.colliders.push(bench(P, bx, y, z0 + 1.4, Math.PI, 0x8b5a33, { back: true, len: 1.8, seed: Math.round(bx) }));

  // coin binocular on a painted pedestal, looking north
  const bx = x0 + 5.0, bz = z0 + 0.95;
  P.group([bx, y, bz], Math.PI, () => {
    P.box(0.5, 0.12, 0.5, [0, 0.06, 0], PAL.concreteDark);
    P.cyl(0.09, 0.12, 1.05, [0, 0.12, 0], PAL.shutterBlue, 8);
    P.cyl(0.13, 0.13, 0.12, [0, 1.12, 0], PAL.railingYellow, 8);
    P.box(0.34, 0.22, 0.3, [0, 1.36, 0], PAL.shutterBlue);
    P.box(0.12, 0.12, 0.26, [-0.09, 1.38, 0.22], 0x2a2a2e, { rot: [0.12, 0, 0] });
    P.box(0.12, 0.12, 0.26, [0.09, 1.38, 0.22], 0x2a2a2e, { rot: [0.12, 0, 0] });
    P.box(0.3, 0.06, 0.1, [0, 1.5, -0.12], PAL.railingYellow);
    P.box(0.06, 0.04, 0.02, [0.1, 1.33, -0.16], 0x1d1a1a); // coin slot
    P.box(0.42, 0.04, 0.08, [0, 1.3, -0.2], 0x2a2a2e); // handles
  });
  c.colliders.push({ x: bx, z: bz, w: 0.45, d: 0.45, y0: y, y1: y + 1.5, tag: 'binocular' });
  c.interact.push({
    id: 'hillside-binocular', pos: [bx, y, bz + 0.6], radius: 1.4, label: 'Look through the binocular (₹5)', anim: 'point',
    onInteract: () => {
      if (!G().spend(5)) { sfx('deny'); return; }
      sfx('coin');
      const lines = [
        'Snow on the Dhauladhar peaks, so close you could touch them…',
        'Look — tiny people walking up to Triund. And a monkey stealing a sandwich!',
        'Eagles circling over the valley. Om mani padme hum.',
      ];
      G().say([{ who: 'Tenzin', text: lines[Math.floor(Math.random() * lines.length)] }]);
    },
  });

  // "which peak is which" board on the north parapet: white peaks painted on blue
  {
    const px = x1 - 5.2, pz = z0 + 0.62;
    P.group([px, y + PARAPET + 0.07, pz], Math.PI, () => {
      P.box(0.06, 0.6, 0.06, [-0.5, 0.3, 0], PAL.concreteDark);
      P.box(0.06, 0.6, 0.06, [0.5, 0.3, 0], PAL.concreteDark);
      P.box(1.3, 0.5, 0.04, [0, 0.82, 0.02], 0x2f5f8a, { rot: [-0.35, 0, 0] });
      const peaks = [[-0.45, 0.16], [-0.2, 0.24], [0.05, 0.3], [0.32, 0.2], [0.5, 0.12]] as const;
      for (const [x, h] of peaks) {
        P.box(0.16, h, 0.02, [x, 0.66 + h / 2, 0.05 + (0.66 + h / 2 - 0.82) * 0.35], PAL.snow, { rot: [-0.35, 0, Math.PI / 4] });
      }
    });
  }

  // lamp post and a dustbin by the entrance
  {
    const L = streetLamp(P, x0 + 0.9, y, z1 - 4.2, Math.PI / 2, 'old', 3);
    c.colliders.push(L.collider); c.lamps.push(L.lamp);
    c.colliders.push(bin(P, x1 - 0.8, y, z1 - 1.1, PAL.roofGreen, { seed: 4 }));
  }

  // VIEW POINT board on two posts at the south-east, facing the road
  {
    const sx = x0 + 9.4, sz = z1 - 0.7;
    for (const dx of [-0.75, 0.75]) {
      P.box(0.08, 1.9, 0.08, [sx + dx, y + 0.95, sz], PAL.concreteDark);
      c.colliders.push({ x: sx + dx, z: sz, w: 0.12, d: 0.12, y0: y, y1: y + 1.9, tag: 'post' });
    }
    const sg = makeSign({ text: 'VIEW POINT', bod: 'ལྟ་ས།', bg: PAL.roofGreen, fg: PAL.wallWhite, glow: false });
    sg.position.set(sx, y + 1.95, sz + 0.05);
    sg.rotation.y = 0.2;
    c.meshes.push(sg);
  }

  // darchor in the north-east corner, lungta strings from it across the plaza
  const dX = x1 - 0.9, dZ = z0 + 2.4;
  c.darchor.push({ x: dX, z: dZ, h: 6.5, y, seed: 12 });
  const poleW: V3 = [x0 + 0.6, y + 3.4, z0 + 0.6];
  B.box(0.08, 3.5, 0.08, [poleW[0], y + 1.75, poleW[2]], PAL.barkLight);
  c.circles.push({ x: poleW[0], z: poleW[2], r: 0.08, y0: y, y1: y + 3.5, tag: 'pole' });
  const dTop: V3 = [dX, y + 5.6, dZ];
  c.flags.push(...flagChain([dTop, poleW], { age: 0.3, seed: 61, sagFrac: 0.08 }));
  c.flags.push(...flagChain([dTop, [x0 + 9.4, y + 3.0, z1 - 0.7]], { age: 0.45, seed: 62, sagFrac: 0.07 }));
  B.box(0.08, 3.1, 0.08, [x0 + 9.4, y + 1.55, z1 - 0.62], PAL.barkLight);

  // rhododendrons around the plaza, a couple of bushes
  const around: [number, number, 'rhodo' | 'bush', number][] = [
    [x0 - 2.0, z0 + 3.0, 'rhodo', 1.0], [x0 - 2.4, z1 - 5.5, 'rhodo', 0.85], [x1 + 2.0, z0 + 4.5, 'rhodo', 1.1],
    [x1 + 2.2, z1 - 2.0, 'rhodo', 0.9], [x0 + 3.0, z0 - 2.2, 'rhodo', 0.8], [x1 - 2.5, z0 - 2.4, 'bush', 1.2],
    [x0 - 1.5, z0 - 1.0, 'bush', 1.0],
  ];
  for (const [x, z, kind, scale] of around) c.trees.push({ x, z, kind, scale });

  c.footprints.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2 + 0.6, hd: (z1 - z0) / 2 + 0.6, yaw: 0 });
  // the view north to the Dhauladhar stays open (shrubs only)
  c.clearings.push({ x: (x0 + x1) / 2, z: z0 - 8, hw: (x1 - x0) / 2 + 2, hd: 8, yaw: 0 });
}
