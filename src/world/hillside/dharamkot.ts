// Dharamkot Road frontage: family houses climbing the slope (floors lifted on stone plinths, tin and flat
// roofs, laundry and prayer flags), a home-stay, the little Hindu shrine on the outer side of the first
// bend, Amala's house, a stepped lane between the houses, and the school with its yard on the way up to
// the viewpoint. West side = −1 (left walking uphill), east side = +1.
import { PAL } from '../../core/palette';
import type { BuildingSpec } from '../../kit/building';
import type { Ctx } from './ctx';
import { row } from './rows';
import { DHARAMKOT, roadsideFrame, toWorld } from './util';
import { amalaHouse } from './amala';
import { school, shrine, stairLane } from './specials';
import { AMALA_HOUSE } from './spots';

type Spec = Omit<BuildingSpec, 'w' | 'd'>;
const house = (seed: number, floors: number, x: Partial<Spec> = {}): Spec => ({ ground: 'house', floors, seed, sign: null, awning: null, ...x });

export function dharamkotRoad(c: Ctx) {
  const R = DHARAMKOT;

  // ---- west side (−1) --------------------------------------------------------------------------------------
  row(c, R, -1, 10.6, [
    { w: 5.4, spec: house(501, 3, { roof: 'flat', tanks: 1, clothes: true }), opts: { depth: 6.5 } },
  ]);
  shrine(c, 18.6, -1);
  row(c, R, -1, 21.2, [
    { w: 5.6, spec: house(511, 2, { roof: 'tin', tibetan: true, flags: true }), opts: { extraLift: 0.34, depth: 6.5 } },
    { w: 5.0, spec: { ground: 'shop', floors: 2, seed: 521, shop: 'grocery', sign: { text: 'GENERAL', bod: 'ཚོང་ཁང', bg: PAL.roofRed, fg: PAL.wallWhite } }, opts: { depth: 6 } },
  ]);
  row(c, R, -1, 33.2, [
    { w: 5.6, spec: house(531, 2, { roof: 'tinHip', clothes: true }), opts: { depth: 6.5 } },
    { w: 6.0, spec: house(541, 3, { roof: 'flat', tanks: 2, dish: true, rebar: true }), opts: { depth: 6.5 } },
  ]);
  school(c, 49.6, 61.8, -1);
  row(c, R, -1, 62.6, [
    { w: 5.4, spec: house(551, 2, { roof: 'tin', flags: true }), opts: { extraLift: 0.17, depth: 6.5 } },
    { w: 5.8, spec: { ground: 'hotel', floors: 3, seed: 561, balconies: true, sign: { text: 'HOME STAY', bod: 'མགྲོན་ཁང་', bg: PAL.deodarDark, fg: PAL.wallWhite } }, opts: { extraLift: 0.34, depth: 6.5 } },
  ]);

  // ---- east side (+1) ----------------------------------------------------------------------------------------
  row(c, R, 1, 10.6, [
    { w: 5.6, spec: house(601, 2, { roof: 'tin', clothes: true }), opts: { depth: 6.5 } },
  ]);
  row(c, R, 1, 17.4, [
    { w: 5.4, spec: house(611, 3, { roof: 'flat', tanks: 1, flags: true, tibetan: true }), opts: { extraLift: 0.34, depth: 6.5 } },
    { w: 6.0, spec: { ground: 'hotel', floors: 3, seed: 621, balconies: true, sign: { text: 'DOLMA GH', bod: 'མགྲོན་ཁང་', bg: PAL.wallWhite, fg: PAL.roofBlue } }, opts: { extraLift: 0.17, depth: 6.5 } },
  ]);
  amalaHouse(c);
  // a stepped lane up between Amala's house and her neighbours
  stairLane(c, R, 1, AMALA_HOUSE.s + AMALA_HOUSE.w / 2 + 1.25, 1.3);
  row(c, R, 1, AMALA_HOUSE.s + AMALA_HOUSE.w / 2 + 2.3, [
    { w: 5.2, spec: house(631, 2, { roof: 'tin', tibetan: true, clutter: 0.9 }), opts: { extraLift: 0.51, depth: 6 } },
  ]);
  row(c, R, 1, 48.0, [
    { w: 5.6, spec: house(641, 2, { roof: 'tinHip', flags: true }), opts: { depth: 6.5 } },
    { w: 5.2, spec: house(651, 3, { roof: 'flat', tanks: 2, clothes: true }), opts: { depth: 6.5 } },
    { w: 6.0, spec: house(661, 2, { roof: 'tin', tibetan: true }), opts: { extraLift: 0.17, depth: 6.5 }, gapBefore: 2.1 },
    { w: 5.4, spec: house(671, 2, { roof: 'terrace' }), opts: { depth: 6.5 } },
  ]);

  // a second stepped lane up the slope, between the houses above the school
  stairLane(c, R, 1, 48.0 + 5.6 + 0.15 + 5.2 + 0.15 + 1.05, 1.2);

  // trees in the gaps between houses
  const gap = (s: number, side: 1 | -1, off: number, kind: 'deodar' | 'oak' | 'rhodo' | 'deodarMid' | 'bush', scale = 1) => {
    const f = roadsideFrame(R, s, side, off);
    const [x, z] = toWorld(f, 0, 0);
    c.trees.push({ x, z, kind: kind === 'deodarMid' ? 'deodar' : kind, scale: kind === 'deodarMid' ? scale * 0.75 : scale });
  };
  gap(32.55, -1, 2.6, 'rhodo', 0.85);
  gap(46.4, -1, 3.0, 'deodar', 0.95);
  gap(73.2, 1, 1.2, 'rhodo', 0.8);
  gap(75.2, 1, 3.0, 'deodar', 0.9);
  gap(74.6, -1, 3.5, 'oak', 0.9);
  gap(16.6, 1, 2.6, 'bush', 1.1);
}
