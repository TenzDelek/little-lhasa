// Bhagsu Road frontage (outside the square territory): guesthouses and hotels with balconies, a German
// bakery, a rooftop café with a valley view, a yoga & meditation centre, small family homes, a terraced
// house up a flight of steps, the chai dhaba with the puppy's nook behind it, and the overlook at the end of
// the road. North side (−1) is uphill, south side (+1) looks down the Kangra valley.
import { PAL } from '../../core/palette';
import type { BuildingSpec } from '../../kit/building';
import type { Ctx } from './ctx';
import { row, type RowItem } from './rows';
import { BHAGSU } from './util';
import { TEA, NOOK } from './spots';
import { teaShop } from './teashop';
import { overlook, stairLane } from './specials';

type Spec = Omit<BuildingSpec, 'w' | 'd'>;
const house = (seed: number, floors: number, x: Partial<Spec> = {}): Spec => ({ ground: 'house', floors, seed, sign: null, awning: null, ...x });
const hotel = (seed: number, floors: number, text: string, x: Partial<Spec> = {}): Spec =>
  ({ ground: 'hotel', floors, seed, balconies: true, sign: { text, bod: 'མགྲོན་ཁང་', bg: PAL.roofBlue, fg: PAL.wallWhite }, ...x });

export function bhagsuRoad(c: Ctx) {
  const R = BHAGSU;

  // ---- north side (uphill) --------------------------------------------------------------------------------
  row(c, R, -1, 12.0, [
    { w: 6.0, spec: hotel(301, 3, 'CEDAR LODGE'), opts: { extraLift: 0.17 } },
  ]);
  // stepped lane up between the houses, then a house high on its stone plinth
  stairLane(c, R, -1, 19.15, 1.4);
  row(c, R, -1, 20.25, [
    { w: 6.2, spec: house(311, 2, { roof: 'tin', tibetan: true, flags: true, clutter: 0.9 }), opts: { extraLift: 0.85 } },
    { w: 6.4, spec: { ground: 'cafe', floors: 2, seed: 321, roof: 'tin', tibetan: true, sign: { text: 'YOGA', bod: 'རྣལ་འབྱོར།', bg: 0xd9772e, fg: PAL.wallWhite }, awning: 0x6a2630 }, opts: { extraLift: 0.51, depth: 7.5 }, gapBefore: 0.35 },
    { w: 4.8, spec: house(331, 3, { roof: 'flat', tanks: 2, clothes: true }), opts: { extraLift: 0.17 } },
    { w: 4.2, spec: { ground: 'shop', floors: 2, seed: 341, shop: 'grocery', sign: { text: 'STORE', bod: 'ཚོང་ཁང', bg: PAL.roofGreen, fg: PAL.wallWhite } } },
  ]);
  // chai dhaba + customers' corner (from TEA.s − w/2 − 2.5) and the nook gap after it
  teaShop(c);
  row(c, R, -1, NOOK.s1, [
    { w: 5.4, spec: house(351, 2, { roof: 'tin', flags: true }), opts: { extraLift: 0.34 } },
    { w: 6.2, spec: hotel(361, 3, 'SNOW VIEW') },
    { w: 7.0, spec: hotel(371, 4, 'HIMALAYA INN', { roof: 'terrace' }), gapBefore: 0.4 },
    { w: 5.2, spec: house(381, 2, { roof: 'tinHip', clutter: 0.9 }), opts: { extraLift: 0.17 } },
  ]);

  // ---- south side (downhill, valley view) -------------------------------------------------------------------
  const southA: RowItem[] = [
    { w: 7.2, spec: { ground: 'cafe', floors: 2, seed: 401, roof: 'terrace', sign: { text: 'GERMAN BAKERY', bg: 0xf1c232, fg: 0x6a2630, w: 2.9 }, awning: 0x8a3a36 }, opts: { depth: 7.5 } },
    { w: 6.4, spec: hotel(411, 4, 'PEMA HOTEL', { roof: 'flat' }) },
    { w: 5.0, spec: house(421, 2, { roof: 'tin' }) },
  ];
  row(c, R, 1, 12.0, southA);
  row(c, R, 1, 33.4, [
    { w: 7.4, spec: { ground: 'cafe', floors: 3, seed: 431, roof: 'terrace', sign: { text: 'ROOFTOP CAFE', bod: 'ཇ་ཁང', bg: PAL.deodarDark, fg: PAL.templeYellow }, awning: null, balconies: true } },
    { w: 5.4, spec: house(441, 2, { roof: 'tin', clothes: true }) },
    // low shops opposite the tea shop, so the dhaba stays in view from the valley side
    { w: 3.4, spec: { ground: 'shop', floors: 1, seed: 451, shop: 'goods', roof: 'tin', sign: { text: 'STD PCO', bg: PAL.wallYellow, fg: PAL.roofRed } } },
    { w: 3.3, spec: { ground: 'shop', floors: 1, seed: 453, shop: 'crafts', roof: 'flat', sign: { text: 'COBBLER', bg: PAL.roofBlue, fg: PAL.wallWhite } } },
  ]);
  row(c, R, 1, 55.4, [
    { w: 6.0, spec: hotel(461, 3, 'MOUNTAIN VIEW') },
    { w: 5.6, spec: house(471, 2, { roof: 'tinHip', flags: true }) },
  ]);
  void TEA;

  // the overlook at the road's end
  overlook(c);
}
