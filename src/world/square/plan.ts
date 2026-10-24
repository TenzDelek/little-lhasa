// Main Square (chowk) plan: every footprint the square module builds, as plain data, so the layout can be
// checked against the roads / plaza without rendering (shots/square/tools/map.mjs draws it top-down).
//
// Plaza: x −13..14, z −10..10 (y 0). Territory: x −22..23, z −19..19 minus the road corridors:
//   Dharamkot Road leaves north at x≈2, Bhagsu Road east at z≈−2, Temple Road south at x≈3,
//   Jogiwara Road south-west from (−10, 8).
// Buildings ring the square with their fronts facing in. The iso camera turns all the way round, so every row is
// somebody's foreground: they stay 1–3 storeys (the two far corners, N1 / N7, are the tallest), and the lots
// right behind the landmarks are the lowest — N5 (one storey) behind the chorten, N2 / N4 / W1 (two) behind
// the Mani Lhakhang — so the shrine, the stupa and the boy at them stay in view from the azimuths 1–3 too.
// (shots/review-square/tools/occl2.mjs ray-casts the landmarks / standing spots against these lots.)
import type { BuildingSpec } from '../../kit/building';
import { SPOTS, roadById } from '../layout';
import { besideRoad } from '../../kit/building';

const PI = Math.PI;
/** Yaw that makes a building front face the square from each side. */
export const FACE = { south: 0, north: PI, west: -PI / 2, east: PI / 2 } as const;

export interface Lot {
  id: string;
  /** Footprint centre, size (w along the front, d deep) and yaw (front faces (sin yaw, cos yaw)). */
  x: number; z: number; w: number; d: number; yaw: number;
  spec: Omit<BuildingSpec, 'w' | 'd'>;
}

/** Lot from the front edge: front line at `front` (z for N/S rows, x for E/W rows), span a..b along it. */
function row(id: string, side: 'N' | 'S' | 'E' | 'W', front: number, a: number, b: number, d: number, spec: Lot['spec']): Lot {
  const w = b - a, m = (a + b) / 2;
  switch (side) {
    case 'N': return { id, x: m, z: front - d / 2, w, d, yaw: FACE.south, spec };
    case 'S': return { id, x: m, z: front + d / 2, w, d, yaw: FACE.north, spec };
    case 'E': return { id, x: front + d / 2, z: m, w, d, yaw: FACE.west, spec };
    case 'W': return { id, x: front - d / 2, z: m, w, d, yaw: FACE.east, spec };
  }
}

const NF = -10.7, SF = 11.0, EF = 16.4, WF = -13.9;

export const LOTS: Lot[] = [
  // ---- north side: hotels and cafés, 1–3 storeys -------------------------------------------
  row('N1', 'N', NF, -22.0, -15.3, 7.6, { floors: 3, ground: 'hotel', roof: 'terrace', tanks: 2, dish: true, wall: 0xe9dfc4, seed: 11, tibetan: true, flags: true,
    sign: { text: 'HOTEL DROLMA', bod: 'མགྲོན་ཁང་', bg: 0x6e1f2a, fg: 0xe0b23a } }),
  row('N2', 'N', NF, -15.1, -10.2, 7.0, { floors: 2, ground: 'cafe', roof: 'flat', tanks: 1, rebar: true, wall: 0xb3d1e0, seed: 12, clothes: true,
    sign: { text: 'SNOWLION CAFE', bg: 0x2f3a46, fg: 0xf3efe6 }, awning: 0x355f8f }),
  row('N3', 'N', NF, -10.0, -5.8, 7.0, { floors: 2, ground: 'shop', roof: 'tin', roofColor: 0x3f7a4c, wall: 0xe8c66a, seed: 13,
    sign: { text: 'THANGKA ART', bg: 0x8b1e2d, fg: 0xe0b23a } }),
  row('N4', 'N', NF, -5.6, -0.9, 6.4, { floors: 2, ground: 'shop', roof: 'flat', tanks: 2, mumty: false, wall: 0xa8cfb4, seed: 14, party: { right: true },
    sign: { text: 'YETI TRAVELS', bg: 0x213252, fg: 0xf1c232 } }),
  row('N5', 'N', NF, 7.5, 12.4, 7.0, { floors: 1, ground: 'cafe', roof: 'flat', tanks: 2, wall: 0xe0a3a0, seed: 15, tibetan: true, flags: true,
    sign: { text: 'KHAWA KARPO', bod: 'ཟ་ཁང་', bg: 0x2f63b8, fg: 0xf3efe6 } }),
  row('N6', 'N', NF, 12.6, 17.6, 7.0, { floors: 2, ground: 'cafe', roof: 'tin', roofColor: 0xa33a2f, wall: 0xe9dfc4, seed: 16, tibetan: true,
    sign: { text: 'THUKPA HOUSE', bod: 'ཟ་ཁང་', bg: 0x6e1f2a, fg: 0xf3efe6 }, awning: 0xa33a2f }),
  row('N7', 'N', NF, 17.8, 22.8, 7.0, { floors: 3, ground: 'shop', roof: 'flat', tanks: 1, dish: true, rebar: true, wall: 0xb7a6c9, seed: 17, clothes: true, mumty: false,
    sign: { text: 'BOOKS', bg: 0x3f6f55, fg: 0xf3efe6 } }),
  // ---- west side: guesthouses, 2 storeys -------------------------------------------------------------
  row('W1', 'W', WF, -10.4, -5.3, 7.0, { floors: 2, ground: 'shop', roof: 'tin', roofColor: 0x355f8f, wall: 0xd09a48, seed: 21,
    // a shawl shop (its front shows shawls); momos are sold only at Tashi's stall on Temple Road, so nothing
    // on the square advertises them
    sign: { text: 'SHAWL HOUSE', bg: 0xe0b23a, fg: 0x6e1f2a } }),
  row('W2', 'W', WF, -5.1, 0.3, 7.0, { floors: 2, ground: 'hotel', roof: 'terrace', tanks: 2, wall: 0xeeeae0, seed: 22, tibetan: true, flags: true,
    sign: { text: 'GUEST HOUSE', bod: 'མགྲོན་ཁང་', bg: 0x2f8a4a, fg: 0xf3efe6 } }),
  row('W3', 'W', WF, 0.5, 4.9, 7.0, { floors: 2, ground: 'shop', roof: 'flat', tanks: 1, wall: 0xd9826a, seed: 23, solar: true,
    sign: { text: 'STD  PCO', bg: 0xf1c232, fg: 0x23202a } }),
  // ---- south side (foreground): low, 2 storeys -----------------------------------------------------------
  row('S1', 'S', SF, -7.0, -4.15, 6.0, { floors: 2, ground: 'shop', roof: 'tin', roofColor: 0x8a4a2a, wall: 0xa8cfb4, seed: 31,
    sign: { text: 'CHEMIST', bod: 'སྨན་ཁང་', bg: 0x2f8a4a, fg: 0xf3efe6 } }),
  row('S2', 'S', SF, -3.95, -1.0, 6.0, { floors: 1, ground: 'cafe', roof: 'flat', tanks: 1, wall: 0xe8c66a, seed: 32,
    sign: { text: 'TASHI BAKERY', bg: 0x6a3f24, fg: 0xf1c232 } }),
  row('S3', 'S', SF, 7.4, 10.4, 6.0, { floors: 1, ground: 'shop', roof: 'tinHip', roofColor: 0x3f7a4c, wall: 0xe9dfc4, seed: 33,
    sign: { text: 'HRTC BOOKING', bg: 0xa33a2f, fg: 0xf3efe6 } }),
  // ---- east side (foreground): 2–3 storeys, behind the bus -------------------------------------------------
  row('E1', 'E', EF, 1.8, 6.9, 6.2, { floors: 1, ground: 'cafe', roof: 'flat', tanks: 2, dish: true, wall: 0xe0a3a0, seed: 41, clothes: true,
    sign: { text: 'JUNGLE CAFE', bg: 0x3f6f55, fg: 0xe8c66a }, awning: 0x3f7a4c }),
  row('E2', 'E', EF, 7.1, 11.9, 6.2, { floors: 1, ground: 'shop', roof: 'tin', roofColor: 0x6a2630, wall: 0x8fb4cf, seed: 42,
    sign: { text: 'TOURS & TAXI', bg: 0x213252, fg: 0xf1c232 } }),
  row('E3', 'E', EF, 12.1, 18.4, 6.2, { floors: 1, ground: 'house', roof: 'tinHip', roofColor: 0x355f8f, wall: 0xe9dfc4, seed: 43, sign: null }),
  // ---- Jogiwara Road head (right / west side, arc length 1.5..6.5; the market owns it from s 8) -------------
  jog('J1', 4.0, 5.0, 6.5, { floors: 2, ground: 'shop', roof: 'tin', roofColor: 0x3f7a4c, wall: 0xe8c66a, seed: 51,
    sign: { text: 'TIBET SHOP', bg: 0x8b1e2d, fg: 0xf1c232 } }),
];

function jog(id: string, s: number, w: number, d: number, spec: Lot['spec']): Lot {
  const pl = besideRoad(roadById('jogiwara-road'), s, 1, d);
  return { id, x: pl.x, z: pl.z, w, d, yaw: pl.yaw, spec };
}

// ---- landmarks ------------------------------------------------------------------------------------------
export const MANI = { x: SPOTS.maniLhakhang.x, z: SPOTS.maniLhakhang.z, yaw: SPOTS.maniLhakhang.ry, plinth: 7.2, core: 4.4 };
export const CHORTEN = { x: SPOTS.chorten.x, z: SPOTS.chorten.z, yaw: SPOTS.chorten.ry, yard: 4.8 };

// ---- vehicles (yaw: the way the nose points) ----------------------------------------------------------------
export type VehicleKind = 'bus' | 'innova' | 'sumo' | 'omni';
export interface VehicleSpot { kind: VehicleKind; x: number; z: number; yaw: number; seed: number }
/** Taxi bays: nose-in toward the square (facing west), rears against the bus. */
const TAXI_REAR_X = 11.15;
const LEN: Record<VehicleKind, number> = { bus: 10.4, innova: 4.6, sumo: 4.3, omni: 3.4 };
const taxi = (kind: VehicleKind, z: number, seed: number): VehicleSpot => ({ kind, x: TAXI_REAR_X - LEN[kind] / 2, z, yaw: -PI / 2, seed });
export const VEHICLES: VehicleSpot[] = [
  { kind: 'bus', x: 13.0, z: 6.9, yaw: 0, seed: 1 },  // HRTC bus along the east edge, nose south toward Temple Road
  taxi('innova', 2.5, 2),
  taxi('sumo', 4.75, 3),
  taxi('innova', 7.0, 4),
  taxi('omni', 9.15, 5),
];
export const vehicleLength = (k: VehicleKind) => LEN[k];
export const VEHICLE_W: Record<VehicleKind, number> = { bus: 2.5, innova: 1.8, sumo: 1.72, omni: 1.45 };

// ---- small things on the square ---------------------------------------------------------------------------
export const SHELTER = { x: -12.35, z: 3.3, yaw: PI / 2, w: 3.2, d: 1.5 };
export const CHAI = { x: 11.4, z: -9.55, yaw: 0 };            // chai stall against the north-east pavement
export const JUICE = { x: -3.6, z: 7.5, yaw: PI };             // fruit / juice cart, serving north into the square (clear of S2 so the default camera sees it)
export const SHOESHINE = { x: -12.2, z: 0.9, yaw: PI / 2 };
export const TAP = { x: -1.9, z: -9.55, yaw: 0 };
export const KIOSK = { x: 6.2, z: -9.4, yaw: 0 };              // tiny general store by the Dharamkot Road corner

export const BENCHES: { x: number; z: number; yaw: number }[] = [
  { x: -12.3, z: -3.4, yaw: PI / 2 },
  { x: 11.2, z: -7.4, yaw: PI },
  { x: 10.05, z: -5.4, yaw: PI / 2 }, // back to the chorten's east wall (not in front of its gate), facing Bhagsu Road
  { x: -6.2, z: 9.6, yaw: PI },
];

export const LAMP_POSTS: { x: number; z: number; yaw: number }[] = [
  { x: -12.6, z: -9.5, yaw: PI / 4 },
  { x: -12.6, z: -0.2, yaw: PI / 2 },
  { x: -2.6, z: 9.6, yaw: PI },
  { x: 13.6, z: -9.4, yaw: -PI / 4 },
  { x: 6.9, z: 10.7, yaw: PI },
  { x: -4.4, z: -9.6, yaw: 0 },
  // mid-square, over the taxi drivers' corner: lights the open middle at night (placed off the iso sight lines
  // through the chorten and the Mani Lhakhang, so its pole never stands in front of them)
  { x: 4.5, z: 1.4, yaw: -3 * PI / 4 },
];
