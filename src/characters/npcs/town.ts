// The route network the townsfolk walk. Hand-laid links through the Main Square and the temple courtyard
// (clear of the Mani Lhakhang, chorten, taxis, bus, benches and lamp posts in square/plan.ts and the temple
// site plan), joined to keep-left lanes along the roads. Every route is re-bent round real colliders at run
// time (routes.avoid), so small props other builders add later are walked round automatically.
import { roadById, type XZ } from '../../world/layout';
import { lane, makeRoute, roadLen, type Route } from './routes';
import { SQUARE } from './places';

const TEMPLE = roadById('temple-road');
const JOG = roadById('jogiwara-road');
const LANE = roadById('market-lane');
const BHAGSU = roadById('bhagsu-road');
const DKOT = roadById('dharamkot-road');
const KORA = roadById('kora-path');

const cat = (...parts: (readonly XZ[])[]): XZ[] => parts.flat() as XZ[];

/** Rounded square (clockwise from above, starting at the north-west), for the walk round the Mani Lhakhang. */
function roundedSquare(cx: number, cz: number, half: number, rc: number, segPerCorner = 5): XZ[] {
  const out: XZ[] = [];
  const h = half - rc;
  // corner centres clockwise from above (north = −z): NE, SE, SW, NW
  const corners: [number, number, number][] = [
    [cx + h, cz - h, -Math.PI / 2], [cx + h, cz + h, 0], [cx - h, cz + h, Math.PI / 2], [cx - h, cz - h, Math.PI],
  ];
  for (const [ox, oz, a0] of corners) {
    for (let i = 0; i <= segPerCorner; i++) {
      const a = a0 + (i / segPerCorner) * (Math.PI / 2);
      // a = −π/2 points north; clockwise from above means x = sin, z = −cos rotated: use (cos a, sin a) with
      // a increasing turning from north (−z) toward east (+x)
      out.push([ox + rc * Math.cos(a), oz + rc * Math.sin(a)]);
    }
  }
  return out;
}

export function buildRoutes(): Record<string, Route> {
  const LT = roadLen(TEMPLE), LJ = roadLen(JOG), LL = roadLen(LANE), LB = roadLen(BHAGSU), LD = roadLen(DKOT);

  // ---- town loop: down Temple Road, back up, across the square, down Jogiwara Road, back up, across -------
  const town = makeRoute('town', cat(
    lane(TEMPLE, 0, LT - 3.5),          // southbound, east pavement (past Tashi's stall)
    lane(TEMPLE, LT - 3.5, 0),          // northbound, west pavement (past the balep cart)
    [[0.2, 7.2], [-2.4, 6.6]],          // into the square, north of the juice cart
    lane(JOG, 0, LJ - 3),               // south-west bound, east pavement (past Dolma's laphing)
    lane(JOG, LJ - 3, 0),               // back up, west pavement
    [[-10.4, 4.0], [-6.5, 2.9], [-2.0, 2.7], [1.8, 2.8], [4.4, 3.8], [5.1, 7.0]], // across the square
  ), true, { inward: 1, maxIn: 1.8, maxOut: 0.9 });

  // ---- monks: Temple Road between the square and the temple gate, a turn inside the courtyard ------------
  const monks = makeRoute('monks', cat(
    lane(TEMPLE, 0, LT),
    [[10.15, 92.0], [10.9, 95.8], [9.2, 97.6], [7.4, 96.0], [7.9, 92.0]],
    lane(TEMPLE, LT, 0),
    [[0.4, 6.4], [2.6, 4.2], [4.9, 6.6]],
  ), true, { inward: 1, maxIn: 1.6, maxOut: 0.8 });

  // ---- Market Lane: both directions, turning at each end ----------------------------------------------
  const lanePts = cat(lane(LANE, 3.4, LL - 3.6), lane(LANE, LL - 3.6, 3.4));
  const market = makeRoute('market', lanePts, true, { inward: 1, maxIn: 0.8, maxOut: 0.5 });

  // ---- Bhagsu Road: out east toward the waterfall and back --------------------------------------------
  const bhagsu = makeRoute('bhagsu', cat(
    lane(BHAGSU, 0, LB - 3),
    lane(BHAGSU, LB - 3, 0),
    [[11.6, 0.3], [9.9, -1.2], [10.3, -3.5]],
  ), true, { inward: 1, maxIn: 1.8, maxOut: 0.9 });

  // ---- Dharamkot Road: up past Amala's house to the viewpoint and back ---------------------------------
  const dharamkot = makeRoute('dharamkot', cat(
    lane(DKOT, 0, LD, 0.6),
    [[26.4, -84.0], [28.6, -86.8], [31.6, -86.4], [31.2, -82.6]], // a turn round the viewpoint
    lane(DKOT, LD, 0, 0.6),
    [[3.3, -7.2], [1.7, -6.4], [0.4, -8.0]],
  ), true, { inward: 1, maxIn: 1.2, maxOut: 0.6 });

  // ---- the Lingkhor: one way, clockwise (the road's own point order) -----------------------------------
  const kora = makeRoute('kora', KORA.pts, true, { inward: 0, maxIn: 1.0, maxOut: 1.0, sideIn: 0.75, sideOut: 0.75 });

  // ---- round the Mani Lhakhang on its plinth, wheels on the right ---------------------------------------
  const m = SQUARE.mani;
  const half = ((m.plinth ?? 7.2) / 2 + 2.64) / 2 + 0.02; // middle of the walkway between wheel rail and plinth edge
  const mani = makeRoute('mani', roundedSquare(m.x, m.z, half, 0.55), true, { inward: 1, maxIn: 0.32, maxOut: 0.3, probeR: 0.2, sideIn: 0.12, sideOut: 0.25 });

  // ---- inner kora round the main hall in the courtyard (clockwise) ---------------------------------------
  // north leg runs in front of the debaters' standing line, clear of the debate platform and the hall steps;
  // the east leg squeezes past the lamp house (z ≈ 101.3) into the prayer-wheel gallery's lane and walks it
  // southward, the wheels (x = 22.95) on the right hand, then back out round its south end
  const court = makeRoute('court', [
    [-0.4, 99.3], [5.5, 99.3], [9.0, 100.0], [15.0, 101.4], [17.8, 102.0], [21.6, 101.3], [23.7, 102.6], [23.7, 114],
    [23.7, 121.4], [21.6, 123.6], [19.6, 124.8], [17.6, 126.8], [9.0, 127.0], [1.6, 126.8], [0.6, 124.6], [0.7, 114], [0.6, 104.6], [-1.1, 103.2], [-1.3, 100.6],
  ], true, { inward: 1, maxIn: 1.0, maxOut: 1.0 });

  return { town, monks, market, bhagsu, dharamkot, kora, mani, court };
}
