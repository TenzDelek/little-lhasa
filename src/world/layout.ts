// The town plan: a compact, stylised McLeod Ganj (Little Lhasa), Dharamshala.
// World units are metres, y up, NORTH = -z, EAST = +x. Main Square is the origin (y = 0).
// The town falls away to the south: Temple Road and Jogiwara Road run downhill to the Tsuglagkhang
// (the main temple), Bhagsu Road runs east along the hillside, Dharamkot Road climbs north.
//
// Every module places things relative to these numbers. Roads carry explicit height profiles; the terrain
// (world/terrain.ts) follows them, so anything standing next to a road should take y from groundY().
//
// Helpers at the bottom (roadFrame, along, sideOf) give positions / tangents along a road so shops can
// line up with the street.

export type XZ = readonly [number, number];
export type Surface = 'asphalt' | 'paving' | 'dirt' | 'stone' | 'flag';

export interface Road {
  id: string;
  name: string;
  /** Centre line, in walking order. */
  pts: readonly XZ[];
  /** Height of the road surface at each point. */
  ys: readonly number[];
  /** Total width (m), kerb to kerb. */
  width: number;
  surface: Surface;
  /** Kind controls what the ground painter draws (centre line, kerbs, drains). */
  kind: 'road' | 'lane' | 'path';
}

export const ROADS: readonly Road[] = [
  {
    id: 'temple-road', name: 'Temple Road', kind: 'road', surface: 'asphalt', width: 6,
    pts: [[3, 10], [4, 30], [2, 50], [6, 70], [8, 90]],
    ys: [0, -2, -4, -6, -7.8],
  },
  {
    id: 'jogiwara-road', name: 'Jogiwara Road', kind: 'road', surface: 'asphalt', width: 5.5,
    pts: [[-10, 8], [-18, 26], [-24, 44], [-28, 62], [-34, 82]],
    ys: [0, -1.8, -3.6, -5.4, -7.5],
  },
  {
    // Narrow market lane joining the two downhill roads, lined with stalls.
    id: 'market-lane', name: 'Market Lane', kind: 'lane', surface: 'paving', width: 3.2,
    pts: [[-24, 44], [-11, 47], [2, 50]],
    ys: [-3.6, -3.8, -4],
  },
  {
    id: 'bhagsu-road', name: 'Bhagsu Road', kind: 'road', surface: 'asphalt', width: 6,
    pts: [[13, -2], [30, -6], [50, -4], [70, -10], [92, -14]],
    ys: [0, 0.6, 1.2, 1.8, 2.5],
  },
  {
    id: 'dharamkot-road', name: 'Dharamkot Road', kind: 'road', surface: 'asphalt', width: 4.5,
    pts: [[2, -10], [6, -26], [16, -38], [12, -52], [20, -66], [28, -80]],
    ys: [0, 1.6, 3, 4.4, 5.8, 7],
  },
  {
    // The Lingkhor: the clockwise kora path that circles the Tsuglagkhang through the forest.
    // Pilgrims walk it clockwise: (12, 90) → east → south → west → back north.
    id: 'kora-path', name: 'Lingkhor Kora', kind: 'path', surface: 'dirt', width: 2.4,
    pts: [[12, 90], [30, 90], [37, 104], [37, 120], [28, 134], [12, 139], [-4, 137], [-16, 129], [-21, 112], [-17, 97], [-7, 90], [4, 89]],
    ys: [-7.8, -8.0, -8.6, -9.4, -10.2, -10.6, -10.6, -10.2, -9.6, -9.0, -8.4, -7.9],
  },
];

export interface Plaza {
  id: string;
  name: string;
  /** Axis-aligned rectangle [x0, z0, x1, z1]. */
  rect: readonly [number, number, number, number];
  y: number;
  surface: Surface;
}

export const PLAZAS: readonly Plaza[] = [
  { id: 'main-square', name: 'Main Square', rect: [-13, -10, 14, 10], y: 0, surface: 'paving' },
  // Tsuglagkhang courtyard: a raised stone platform. The kora runs below it on the south side.
  { id: 'temple-court', name: 'Tsuglagkhang Courtyard', rect: [-10, 93, 27, 127], y: -8, surface: 'flag' },
  // Small flat lookout at the top of Dharamkot Road.
  { id: 'viewpoint', name: 'Dhauladhar Viewpoint', rect: [24, -90, 36, -80], y: 7, surface: 'stone' },
];

/** Named places. y is omitted: take it from groundY(x, z). ry = facing (radians about y, 0 = facing +z). */
export const SPOTS = {
  spawn: { x: 1, z: 5, ry: Math.PI },              // on the square, facing north toward the Mani Lhakhang
  // Main Square
  maniLhakhang: { x: -7, z: -4, ry: 0 },           // prayer-wheel pavilion (big mani wheel inside, small wheels round it)
  chorten: { x: 7, z: -6, ry: 0 },                 // small white stupa on the square's north-east
  taxiStand: { x: 6, z: 5, ry: -Math.PI / 2 },     // in front of the taxis / Maruti vans parked on the square's east side
  busShelter: { x: -12, z: 4, ry: Math.PI / 2 },   // in front of the HRTC bus shelter
  maniDoor: { x: -7, z: -0.9, ry: Math.PI },       // standing on the Mani Lhakhang plinth at its door, facing the great wheel
  // Temple Road
  momoStall: { x: 8, z: 28, ry: -Math.PI / 2 },    // Tashi's momo stall, east side, counter facing the road (west)
  momoCounter: { x: 6.2, z: 27.6, ry: Math.PI / 2 }, // standing point: customer side of Tashi's counter, facing it (E buys)
  breadStall: { x: -1, z: 40, ry: Math.PI / 2 },   // Tibetan bread (balep) cart, west side
  bookShop: { x: 9, z: 58, ry: -Math.PI / 2 },
  // Jogiwara Road / Market Lane
  laphingStall: { x: -13, z: 22, ry: -1.99 },      // laphing stall, east side of Jogiwara Road, facing the road
  thangkaShop: { x: -30, z: 52, ry: Math.PI / 2 },
  // Tsuglagkhang complex (courtyard y = -8)
  templeGate: { x: 9, z: 93, ry: 0 },              // gate arch where Temple Road meets the courtyard
  templeMain: { x: 10, z: 116, ry: Math.PI },      // main temple hall, front door faces north (toward the gate)
  kalachakra: { x: -4, z: 109, ry: Math.PI / 2 },  // Kalachakra temple on the west side, facing east
  prayerWheelRow: { x: 23.7, z: 112, ry: -Math.PI / 2 }, // in the gallery lane by the wheel row (wheels at x 22.95, z 102.6..121.4), facing west
  butterLampHouse: { x: 19, z: 99, ry: Math.PI },  // glass-fronted butter-lamp house near the gate
  debateYard: { x: 3, z: 100, ry: 0 },             // monks debate here (clapping)
  // standing points in front of things (the spots above are object centres)
  templeSteps: { x: 10, z: 102.6, ry: 0 },         // foot of the main hall's steps, facing its doors (south)
  lampShelf: { x: 19, z: 95.6, ry: 0 },            // in front of the butter-lamp shelf, facing it
  wheelLane: { x: 23.6, z: 102.6, ry: -Math.PI / 2 }, // gallery lane at the first (north) wheel, facing the wheels (west); walk south
  // Dharamkot Road
  amalaHouse: { x: 22, z: -42, ry: -Math.PI / 2 }, // Amala's house, door facing west onto the road
  amalaYard: { x: 19.8, z: -43.5, ry: 2.29 },      // standing point: in her front yard, facing Amala on her bench (E talks)
  viewpoint: { x: 30, z: -85, ry: 0 },
  // Bhagsu Road
  puppyHideout: { x: 62.3, z: -11.4, ry: Math.PI }, // mouth of the nook behind the tea shop where the lost puppy hides
  teaShop: { x: 57.8, z: -9.6, ry: 3.43 },         // customer side of the tea-shack counter
  // Square: kid who lost the puppy
  pemaKid: { x: -6, z: 6, ry: 0.4 },
} as const;
export type SpotId = keyof typeof SPOTS;

/** Bounds of the playable town (the diorama rim dissolves outside the road network). */
export const WORLD_BOUNDS = { x0: -70, z0: -118, x1: 125, z1: 170 } as const;

// ---- Quest / event ids shared by the world modules, NPCs and the UI --------------------------------
export const QUEST = {
  kora: 'kora',       // spin 12 different prayer wheels on the Tsuglagkhang (temple) row
  momos: 'momos',     // Amala wants momos: talk to Amala → buy momos at Tashi's stall → bring them back
  lamps: 'lamps',     // light 5 butter lamps in the butter-lamp house
  puppy: 'puppy',     // Pema lost her puppy: talk to Pema → find the puppy on Bhagsu Road → bring it back
} as const;

export const NPC_IDS = {
  amala: 'amala',     // grandmother at amalaHouse (quest giver: momos)
  tashi: 'tashi',     // momo-stall owner (sells momos)
  pema: 'pema',       // little girl on the square (quest giver: puppy)
  dolma: 'dolma',     // laphing seller
} as const;

export const ITEMS = {
  momo: 'momo',       // a plate of momos (₹60)
  laphing: 'laphing', // ₹40
  balep: 'balep',     // Tibetan bread (₹20)
  puppy: 'puppy',     // carried / following
} as const;

// ---- Road helpers ------------------------------------------------------------------------------------
export const roadById = (id: string) => ROADS.find((r) => r.id === id)!;

/** Cumulative arc length of a road's polyline. */
export function roadLength(road: Road) {
  let L = 0;
  for (let i = 1; i < road.pts.length; i++) L += Math.hypot(road.pts[i][0] - road.pts[i - 1][0], road.pts[i][1] - road.pts[i - 1][1]);
  return L;
}

/**
 * Frame at arc length s along a road: centre point, unit tangent (walking direction), unit normal pointing
 * to the RIGHT of the walking direction (in the xz plane), the road height y there, and the yaw that faces
 * along the tangent (rotation about y with 0 = facing +z).
 */
export function roadFrame(road: Road, s: number) {
  let acc = 0;
  for (let i = 1; i < road.pts.length; i++) {
    const [ax, az] = road.pts[i - 1], [bx, bz] = road.pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= acc + L || i === road.pts.length - 1) {
      const t = Math.min(1, Math.max(0, (s - acc) / L));
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      return {
        x: ax + (bx - ax) * t, z: az + (bz - az) * t,
        y: road.ys[i - 1] + (road.ys[i] - road.ys[i - 1]) * t,
        tx, tz,
        // right-hand side when walking along +t with y up: right = t × up = (−tz, tx)
        nx: -tz, nz: tx,
        yaw: Math.atan2(tx, tz),
      };
    }
    acc += L;
  }
  const p = road.pts[road.pts.length - 1];
  return { x: p[0], z: p[1], y: road.ys[road.ys.length - 1], tx: 0, tz: 1, nx: -1, nz: 0, yaw: 0 };
}

/** Evenly spaced frames along a road between arc lengths s0 and s1. */
export function along(road: Road, s0: number, s1: number, step: number) {
  const out: ReturnType<typeof roadFrame>[] = [];
  for (let s = s0; s <= s1 + 1e-6; s += step) out.push(roadFrame(road, s));
  return out;
}
