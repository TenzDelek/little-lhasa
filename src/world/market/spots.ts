// Where the market's stalls stand and where their vendors stand (behind the counters, facing customers).
// The NPC builder places Tashi, Dolma and the balep seller at VENDOR_SPOTS; these spots are kept free of
// colliders. y is omitted: take it from groundY(x, z) (the stalls stand on the graded ground there).
import { SPOTS, type Road } from '../layout';
import { JOG, TEMPLE, roadDist, roadsideFrame, toWorld } from './util';

export interface StallFrame {
  /** Counter centre (world xz). The stall's front (customer side) faces local +z = (sin yaw, cos yaw). */
  x: number; z: number; yaw: number;
  /** Road arc length and side (+1 right / −1 left of the walking direction). */
  s: number; side: 1 | -1;
  /** Road surface height at s. */
  roadY: number;
}

function stallFrame(road: Road, spot: { x: number; z: number }, edgeOff?: number): StallFrame {
  const d = roadDist(road, spot.x, spot.z);
  const side: 1 | -1 = d.lateral >= 0 ? 1 : -1;
  const f = roadsideFrame(road, d.s, side, edgeOff ?? d.edge);
  return { x: f.x, z: f.z, yaw: f.yaw, s: d.s, side, roadY: f.roadY };
}

/** Counter frames of the three food stalls. */
export const STALLS = {
  /** Tashi's momo stall, east side of Temple Road. */
  momo: stallFrame(TEMPLE, SPOTS.momoStall),
  /** Balep (Tibetan bread) cart, west side of Temple Road. */
  balep: stallFrame(TEMPLE, SPOTS.breadStall),
  /** Dolma's laphing table, east side of Jogiwara Road (pulled back a little off the kerb). */
  laphing: stallFrame(JOG, SPOTS.laphingStall, 0.95),
};

/** How far behind the counter centre each vendor stands (local −z). */
export const VENDOR_BACK = { momo: 0.68, balep: 0.82, laphing: 0.78 } as const;

function vendor(f: StallFrame, back: number) {
  const [x, z] = toWorld(f, 0, -back);
  return { x, z, yaw: f.yaw };
}

/** Standing spots behind each counter; yaw faces the customer (rotation.y convention). */
export const VENDOR_SPOTS = {
  tashi: vendor(STALLS.momo, VENDOR_BACK.momo),
  dolma: vendor(STALLS.laphing, VENDOR_BACK.laphing),
  balep: vendor(STALLS.balep, VENDOR_BACK.balep),
} as const;
