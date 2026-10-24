// Building rows along Temple Road and Jogiwara Road (and small buildings behind the Market Lane stalls),
// made with the building kit. Each building is fitted to the land: its depth shrinks until the footprint
// stays in this street's half of the block (Voronoi split against the other road / the lane), clear of the
// square, the temple court and the kora, and clear of buildings already placed. Fronts face the road and
// every building sits at its own floor level, so the rows step down the hill.
import { Box3, Vector3 } from 'three';
import { Parts } from '../../core/geom';
import { PAL, WALLS } from '../../core/palette';
import { pick, range, rng, type Rng } from '../../core/math';
import { roadFrame, type Road } from '../layout';
import { buildBuilding, besideRoad, type BuildingSpec, type GroundFloor, type RoofKind, type BuiltBuilding } from '../../kit/building';
import type { SignSpec } from '../../kit/sign';
import { type Ctx, inFrame } from './ctx';
import { rectOK, obbOverlap, pointOK, roadDist, toWorld, TEMPLE, JOG, LANE, type Frame, type OBB, type PointRule } from './util';
import { groundY } from '../terrain';
import { bladeSign, dressShop, forecourt, rooftopCafe, roofFlags, upperLaundry, type Dress, type ShopKind } from './dressing';

export const FLOOR_H = 2.9;

// Invented names only — no real businesses.
const SIGNS: Record<ShopKind, SignSpec[]> = {
  handicraft: [
    { text: 'TIBET ART', bod: 'བོད་ཀྱི་བཟོ་རིག', bg: PAL.templeRed, fg: PAL.templeYellow },
    { text: 'HANDICRAFT', bod: 'ལག་ཤེས', bg: 0x2a3f78, fg: 0xf3efe6 },
    { text: 'CURIOS', bg: PAL.templeMaroon, fg: PAL.gold },
  ],
  shawl: [
    { text: 'PASHMINA', bg: 0x5a2a4a, fg: 0xf3efe6 },
    { text: 'SHAWLS', bg: 0x2f5a3e, fg: 0xf1c232 },
  ],
  cafe: [
    { text: 'KHAWA CAFE', bod: 'ཇ་ཁང', bg: 0x2a3f78, fg: 0xf3efe6 },
    { text: 'BLUE POPPY', bod: 'ཇ་ཁང', bg: 0x2f5f8a, fg: 0xf3efe6 },
    { text: 'ROOF CAFE', bg: 0x3d6a4a, fg: 0xf1c232 },
    { text: 'DAWA CAFE', bod: 'ཟླ་བ', bg: 0x6a3f24, fg: 0xf1c232 },
    { text: 'WIFI CAFE', bg: 0x23202a, fg: 0x7adf8a },
  ],
  bakery: [{ text: 'BAKERY', bod: 'བག་ལེབ་ཁང', bg: 0xc98a2c, fg: 0x3a2418 }],
  germanBakery: [{ text: 'GERMAN BAKERY', bg: 0xeeeae0, fg: 0x6a2630, w: 2.8 }],
  momo: [
    { text: 'MOMO HOUSE', bod: 'མོག་མོག', bg: PAL.templeRed, fg: PAL.templeYellow },
    { text: 'THUKPA', bod: 'ཐུག་པ', bg: 0xc98a2c, fg: 0x6a1f2a },
  ],
  chemist: [{ text: 'CHEMIST', bod: 'སྨན་ཁང', bg: 0xeeeae0, fg: 0x2f8a4a }],
  travel: [
    { text: 'TREK TAXI', bg: 0xf1c232, fg: 0x23202a },
    { text: 'TREK TOURS', bg: 0x2f5f8a, fg: 0xf3efe6 },
    { text: 'TAXI', bg: 0xf1c232, fg: 0x23202a },
  ],
  cyber: [{ text: 'CYBER CAFE', bg: 0x23202a, fg: 0x6fd8ff }, { text: 'WIFI', bg: 0x2f5f8a, fg: 0xf3efe6 }],
  tailor: [{ text: 'TAILOR', bod: 'འཚེམ་བུ་བ', bg: 0x6a2630, fg: 0xf3efe6 }],
  general: [
    { text: 'GENERAL', bod: 'ཚོང་ཁང', bg: 0xa83a2e, fg: 0xf3efe6 },
    { text: 'STORE', bg: 0x2f8a4a, fg: 0xf3efe6 },
  ],
  guesthouse: [
    { text: 'GUEST HOUSE', bod: 'མགྲོན་ཁང', bg: 0xeeeae0, fg: 0x2a3f78 },
    { text: 'HOTEL', bod: 'མགྲོན་ཁང', bg: 0x2a3f78, fg: 0xf1c232 },
  ],
  house: [],
  books: [{ text: 'BOOKS', bod: 'དཔེ་ཚོང་ཁང', bg: 0x2f5a3e, fg: 0xf3efe6 }],
  thangka: [{ text: 'THANGKA', bod: 'ཐང་ཀ', bg: PAL.templeMaroon, fg: PAL.templeYellow }],
};

const GROUND: Record<ShopKind, GroundFloor> = {
  handicraft: 'shop', shawl: 'shop', cafe: 'cafe', bakery: 'cafe', germanBakery: 'cafe', momo: 'cafe',
  chemist: 'shop', travel: 'shop', cyber: 'shop', tailor: 'shop', general: 'shop', guesthouse: 'hotel',
  house: 'house', books: 'shop', thangka: 'shop',
};

const AWNINGS = [0x3d6a9a, 0x8a3a36, 0x3f7a4c, 0xc9a24a, 0x6a2630, 0x5d7a8a] as const;

/** Setback (gap from road edge to façade) by shop kind. */
export function setbackFor(kind: ShopKind, r: Rng): number {
  switch (kind) {
    case 'cafe': case 'germanBakery': return range(r, 1.55, 1.85);
    case 'house': case 'guesthouse': return range(r, 0.6, 1.0);
    case 'travel': case 'cyber': return range(r, 0.65, 1.1);
    default: return range(r, 1.05, 1.45);
  }
}

export interface PlaceOpts {
  road: Road;
  side: 1 | -1;
  s: number;
  w: number;
  kind: ShopKind;
  seed: number;
  setback: number;
  maxDepth?: number;
  minDepth?: number;
  floors?: number;
  roof?: RoofKind;
  rule?: PointRule;
  /** Skip the generic dressing (special fronts do their own). */
  noDress?: boolean;
  /** Forecourt depth override (default setback − 0.5). */
  fd?: number;
  /** Camera-side row: keep it lower so the street stays visible from the default iso view. */
  low?: boolean;
  spec?: Partial<BuildingSpec>;
}

export interface Placed {
  b: BuiltBuilding;
  f: Frame;
  y: number;
  w: number;
  d: number;
  setback: number;
  dress: Dress;
}

/** Try to place one building; returns null if no depth ≥ minDepth fits. */
export function placeBuilding(c: Ctx, o: PlaceOpts): Placed | null {
  const r = rng(o.seed);
  const maxD = Math.min(o.maxDepth ?? 8, 8.6 - o.setback);
  const minD = o.minDepth ?? 3.2;
  for (let d = maxD; d >= minD - 1e-6; d -= 0.4) {
    const pl = besideRoad(o.road, o.s, o.side, d, o.setback);
    const f: Frame = { x: pl.x, z: pl.z, yaw: pl.yaw };
    if (!rectOK(o.road, f, o.w, d, o.rule)) continue;
    const ob: OBB = { x: f.x, z: f.z, hw: o.w / 2, hd: d / 2, yaw: f.yaw };
    if (c.footprints.some((q) => obbOverlap(q, ob, 0.02))) continue;
    return build(c, o, f, d, r, ob);
  }
  return null;
}

// The kit's contract is world-space output. Probe once whether it actually applies the placement transform to
// its Parts geometry (colliders, lamps and signs are always world-space); if not, wrap the call in the same
// transform so the result is right either way.
let kitPlaces: boolean | null = null;
function kitAppliesPlacement(): boolean {
  if (kitPlaces !== null) return kitPlaces;
  const p = new Parts();
  buildBuilding(p, { w: 4, d: 4, floors: 1, ground: 'blank', sign: null, seed: 1 }, { x: 40, z: 150, yaw: 0, y: 0 });
  const g = p.merge();
  const bb = new Box3().setFromBufferAttribute(g.attributes.position as never);
  const ctr = bb.getCenter(new Vector3());
  kitPlaces = Math.hypot(ctr.x - 40, ctr.z - 150) < 20;
  g.dispose();
  return kitPlaces;
}

function kitBuild(c: Ctx, spec: BuildingSpec, f: Frame, y: number): BuiltBuilding {
  const at = { x: f.x, z: f.z, yaw: f.yaw, y };
  if (kitAppliesPlacement()) return buildBuilding(c.bld, spec, at);
  let out: BuiltBuilding | null = null;
  c.bld.group([f.x, y, f.z], f.yaw, () => { out = buildBuilding(c.bld, spec, at); });
  return out!;
}

function build(c: Ctx, o: PlaceOpts, f: Frame, d: number, r: Rng, ob: OBB): Placed {
  const kind = o.kind;
  const y = roadFrame(o.road, o.s).y + 0.15;
  let floors = o.floors ?? (o.low ? lowFloors(kind, r) : floorsFor(kind, r));
  // keep Market Lane open to the sky: anything backing onto it stays low
  if (o.road !== LANE) {
    let near = Infinity;
    for (const i of [-0.5, 0, 0.5]) for (const j of [-0.5, 0, 0.5]) {
      const [wx, wz] = toWorld(f, i * o.w, j * d);
      near = Math.min(near, roadDist(LANE, wx, wz).edge);
    }
    if (near < 5) floors = Math.min(floors, 2);
    else if (near < 9) floors = Math.min(floors, 3);
  }
  // the forecourt ends half a metre short of the road edge (that strip belongs to the street furniture);
  // on the inside of a bend pull it back further
  let fd = o.fd ?? o.setback - 0.5;
  for (let k = 0; k < 4 && fd > 0.3; k++) {
    let minE = Infinity;
    for (const sx of [-0.5, 0, 0.5]) {
      const [wx, wz] = toWorld(f, sx * o.w, d / 2 + fd);
      minE = Math.min(minE, roadDist(o.road, wx, wz).edge);
    }
    if (minE >= 0.48) break;
    fd -= 0.52 - minE;
  }
  const signs = SIGNS[kind];
  let roof: RoofKind = o.roof ?? pick(r, ['flat', 'flat', 'flat', 'tin', 'tin', 'tinHip', 'terrace'] as RoofKind[]);
  if (!o.roof && (kind === 'cafe' || kind === 'germanBakery') && r() < 0.7) roof = 'terrace';
  const spec: BuildingSpec = {
    w: o.w, d, floors, floorH: FLOOR_H,
    wall: r() < 0.85 ? pick(r, WALLS) : pick(r, [PAL.wallMaroon, PAL.wallTerracotta, PAL.concrete]),
    ground: GROUND[kind],
    sign: signs.length && (kind !== 'house') ? { ...pick(r, signs) } : null,
    awning: GROUND[kind] === 'shop' && r() < 0.55 ? pick(r, AWNINGS) : null,
    balconies: kind === 'guesthouse' ? true : kind === 'cafe' || kind === 'germanBakery' ? false : r() < 0.45,
    roof,
    tanks: roof === 'flat' || roof === 'terrace' ? 1 + Math.floor(r() * 2) : 0,
    dish: r() < 0.3,
    rebar: roof === 'flat' && r() < 0.3,
    sideStairs: null,
    litChance: kind === 'house' ? 0.5 : 0.6,
    seed: o.seed,
    ...o.spec,
  };
  // cafés get a deep first-floor balcony from dressing.cafeBalcony: their board hangs on its railing instead
  let balconySign: SignSpec | null = null;
  if ((kind === 'cafe' || kind === 'germanBakery') && !o.noDress && floors >= 2 && fd - 0.05 >= 0.7 && spec.sign) {
    balconySign = spec.sign;
    spec.sign = null;
  }
  const b = kitBuild(c, spec, f, y);
  c.footprints.push(ob);
  c.colliders.push(...b.colliders);
  c.bLamps.push(...b.lamps);
  c.meshes.push(...b.meshes);

  {
    const [fx, fz] = toWorld(f, 0, d / 2 + o.setback * 0.5);
    c.shops.push({ kind, x: Math.round(fx * 10) / 10, z: Math.round(fz * 10) / 10 });
  }
  const dress: Dress = {
    kind, w: o.w, d, fd, f, y, floorH: FLOOR_H, floors, top: b.top, roof, r, sign: balconySign,
  };
  inFrame(c, f, y, () => {
    forecourt(c, dress);
    if (!o.noDress) dressShop(c, dress);
    if (!o.noDress && !spec.balconies && !balconySign && r() < 0.5) bladeSign(c, dress);
    if (r() < 0.28) upperLaundry(c, dress);
    if ((roof === 'terrace') && (kind === 'cafe' || kind === 'germanBakery')) rooftopCafe(c, dress);
    else if (r() < 0.4) roofFlags(c, dress, roof === 'tin' || roof === 'tinHip');
  });
  return { b, f, y, w: o.w, d, setback: o.setback, dress };
}

function lowFloors(kind: ShopKind, r: Rng) {
  if (kind === 'guesthouse') return 3 + (r() < 0.25 ? 1 : 0);
  return r() < 0.12 ? 4 : 2 + Math.floor(r() * 2);
}

function floorsFor(kind: ShopKind, r: Rng) {
  switch (kind) {
    case 'guesthouse': return 3 + Math.floor(r() * 3);
    case 'house': return 2 + Math.floor(r() * 3);
    case 'cafe': case 'germanBakery': return 2 + Math.floor(r() * 3);
    default: return pick(r, [2, 3, 3, 4, 4, 5]);
  }
}

export interface RowOpts {
  road: Road;
  side: 1 | -1;
  s0: number;
  s1: number;
  /** Arc-length intervals to leave free (special builds, alleys, lane mouths). */
  reserved: [number, number][];
  kinds: ShopKind[];
  seed: number;
  maxDepth?: number;
  /** Camera-side row (lower buildings). */
  low?: boolean;
}

/** Fill one side of a road between s0 and s1 with fitted buildings. Returns what was placed. */
export function fillRow(c: Ctx, o: RowOpts): Placed[] {
  const r = rng(o.seed);
  const res = o.reserved.slice().sort((a, b) => a[0] - b[0]);
  const out: Placed[] = [];
  let s = o.s0, i = 0, guard = 0;
  while (s < o.s1 - 3.4 && guard++ < 200) {
    const inRes = res.find(([a, b]) => s >= a - 1e-6 && s < b);
    if (inRes) { s = inRes[1] + 0.12; continue; }
    const next = res.find(([a]) => a > s);
    const limit = Math.min(o.s1, next ? next[0] - 0.12 : o.s1);
    const room = limit - s;
    if (room < 3.4) { s = next ? next[0] : o.s1; continue; }
    let w = range(r, 4.4, 7.2);
    if (room - w < 3.6) w = room <= 8.4 ? room : room / 2;
    const kind = o.kinds[i % o.kinds.length];
    let placed = placeBuilding(c, {
      road: o.road, side: o.side, s: s + w / 2, w, kind, seed: o.seed * 131 + i * 7 + guard, setback: setbackFor(kind, r), maxDepth: o.maxDepth, low: o.low,
    });
    if (!placed && w > 5) {
      w = Math.max(3.6, w * 0.6);
      placed = placeBuilding(c, {
        road: o.road, side: o.side, s: s + w / 2, w, kind, seed: o.seed * 131 + i * 7 + guard + 1, setback: setbackFor(kind, r), maxDepth: o.maxDepth, low: o.low,
      });
    }
    if (placed) { out.push(placed); s += w + range(r, 0.1, 0.25); i++; }
    else s += 0.7;
  }
  return out;
}

// ---- backfill ---------------------------------------------------------------------------------------------------
const MY_ROADS = () => [
  { road: TEMPLE, s0: 9, s1: 76 },
  { road: JOG, s0: 8, s1: 78 },
  { road: LANE, s0: -1, s1: 99 },
];

/** Nearest of the market's roads (within its frontage arc range), or null. */
function nearestMine(x: number, z: number) {
  let best: { road: Road; d: ReturnType<typeof roadDist> } | null = null;
  for (const m of MY_ROADS()) {
    const d = roadDist(m.road, x, z);
    if (d.s < m.s0 + 0.5 || d.s > m.s1 - 0.8) continue;
    if (!best || d.edge < best.d.edge) best = { road: m.road, d };
  }
  return best;
}

/**
 * Fill leftover pockets of the frontage (behind short buildings, around the lane mouths) with small back
 * houses and sheds: mostly roofs from the iso camera — tin sheets, water tanks, washing, flags.
 */
export function backfill(c: Ctx, seed: number): number {
  const r = rng(seed);
  let n = 0;
  for (let z = 13; z <= 90; z += 1.6) for (let x = -46; x <= 24; x += 1.6) {
    const px = x + range(r, -0.4, 0.4), pz = z + range(r, -0.4, 0.4);
    const near = nearestMine(px, pz);
    if (!near || near.d.edge < 3.2 || near.d.edge > 7.4) continue;
    if (c.footprints.some((f) => obbOverlap(f, { x: px, z: pz, hw: 0.3, hd: 0.3, yaw: 0 }, 0.3))) continue;
    const side: 1 | -1 = near.d.lateral >= 0 ? 1 : -1;
    const fr = roadFrame(near.road, near.d.s);
    const yaw = Math.atan2(-fr.nx * side, -fr.nz * side) + (r() < 0.25 ? Math.PI / 2 : 0);
    for (const [w, d] of [[4.6, 4.2], [3.8, 3.4], [3.0, 2.8], [2.6, 2.4]]) {
      const f: Frame = { x: px, z: pz, yaw };
      const ob: OBB = { x: px, z: pz, hw: w / 2, hd: d / 2, yaw };
      if (c.footprints.some((q) => obbOverlap(q, ob, 0.12))) continue;
      let ok = true;
      for (const i of [-0.5, 0, 0.5]) for (const j of [-0.5, 0, 0.5]) {
        if (!ok) break;
        const [wx, wz] = toWorld(f, i * w, j * d);
        const m = nearestMine(wx, wz);
        if (!m || m.d.edge > 8.6 || m.d.edge < 2.4) { ok = false; break; }
        if (!pointOK(m.road, wx, wz, { voronoi: -100 })) ok = false;
      }
      if (!ok) continue;
      const y = groundY(px, pz) + 0.05;
      const tin = r() < 0.55;
      const spec: BuildingSpec = {
        w, d, floors: w < 3 ? 1 : 1 + Math.floor(r() * 2), floorH: FLOOR_H, ground: r() < 0.6 ? 'house' : 'blank',
        sign: null, awning: null, balconies: r() < 0.3, roof: tin ? pick(r, ['tin', 'tinHip'] as RoofKind[]) : 'flat',
        tanks: tin ? 0 : 1 + Math.floor(r() * 2), dish: r() < 0.25, rebar: !tin && r() < 0.3, clutter: 0.8,
        seed: seed * 977 + n * 31,
      };
      const b = kitBuild(c, spec, f, y);
      c.footprints.push(ob);
      c.colliders.push(...b.colliders);
      c.meshes.push(...b.meshes);
      n++;
      if (r() < 0.35) {
        const dress: Dress = { kind: 'house', w, d, fd: 0, f, y, floorH: FLOOR_H, floors: spec.floors, top: b.top, roof: spec.roof ?? 'flat', r };
        inFrame(c, f, y, () => roofFlags(c, dress, tin));
      }
      break;
    }
  }
  return n;
}
