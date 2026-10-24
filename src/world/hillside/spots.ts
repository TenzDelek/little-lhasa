// Fixed places on the hillside that other modules read (eagerly, via import.meta.glob): Amala's bench, the
// puppy's nook behind the tea shop, the tea-shop counter. Pure data: only layout / terrain imports.
//
//   AMALA_SEAT  { x, y, z, yaw }  seat surface of the low bench in Amala's front yard (y = seat height),
//                                  yaw faces Dharamkot Road (west)
//   PUPPY_NOOK  { x, y, z, yaw }  where the lost puppy curls up, in front of the cardboard box behind the tea
//                                  shop; yaw faces out of the nook toward Bhagsu Road
//   TEA_VENDOR  { x, z, yaw }      where a chai-wallah would stand behind the tea-shop counter, facing the road
import { groundY } from '../terrain';
import { BHAGSU, DHARAMKOT, roadsideFrame, toWorld } from './util';

// ---- tea shop (Bhagsu Road, north side) -------------------------------------------------------------------
/** Tea-shop shack: arc length of its centre, counter line offset from the road edge, size. */
export const TEA = { s: 47.0, side: -1 as const, edgeOff: 1.0, w: 3.4, d: 2.5 };
/** Frame on the counter line (origin = front centre, +z = toward the road, the shack is at local z < 0). */
export const TEA_FRAME = roadsideFrame(BHAGSU, TEA.s, TEA.side, TEA.edgeOff);
const [tvx, tvz] = toWorld(TEA_FRAME, 0.35, -0.85);
export const TEA_VENDOR = { x: tvx, z: tvz, yaw: TEA_FRAME.yaw };

// ---- the puppy's nook: the gap east of the shack, behind its back line ------------------------------------
/** Gap between the shack and the next house (arc lengths), and the nook frame at the road edge. */
export const NOOK = { s0: TEA.s + TEA.w / 2, s1: 52.7, s: 50.55, back: 4.05 };
export const NOOK_FRAME = roadsideFrame(BHAGSU, NOOK.s, -1, 0);
const [px, pz] = toWorld(NOOK_FRAME, -0.15, -NOOK.back);
export const PUPPY_NOOK = { x: px, y: groundY(px, pz), z: pz, yaw: NOOK_FRAME.yaw - 0.35 };

// ---- Amala's house (Dharamkot Road, east side) ------------------------------------------------------------
/** Arc length of the house centre, front wall offset from the road edge, size, porch depth. */
export const AMALA_HOUSE = { s: 34.7, side: 1 as const, edgeOff: 5.0, w: 7.4, d: 6.0, porch: 1.5, doorX: 0.9 };
/** Frame on the front wall (origin = front-wall centre at the road side, +z = toward the road). */
export const AMALA_FRAME = roadsideFrame(DHARAMKOT, AMALA_HOUSE.s, AMALA_HOUSE.side, AMALA_HOUSE.edgeOff);
/** Bench against the front wall, north of the porch (local frame position). */
export const AMALA_BENCH_L = { x: -2.35, z: 0.62, len: 1.5 };
const [ax, az] = toWorld(AMALA_FRAME, AMALA_BENCH_L.x, AMALA_BENCH_L.z);
export const AMALA_SEAT = { x: ax, y: groundY(ax, az) + 0.46, z: az, yaw: AMALA_FRAME.yaw };
