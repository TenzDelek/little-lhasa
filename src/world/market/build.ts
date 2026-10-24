// Builds the whole market district once: food stalls, special shops, the two building rows on each road,
// side alleys, Market Lane. Returns merged meshes plus everything Market.tsx registers.
import type { Object3D, Mesh } from 'three';
import { partsMaterial } from '../../core/materials';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { Interactable } from '../../core/interact';
import type { FlagLine, DarchorPole } from '../../kit/flags';
import { makeCtx, type Ctx } from './ctx';
import { JOG, LANE, TEMPLE, toWorld, type OBB } from './util';
import { STALLS, VENDOR_BACK } from './spots';
import { momoStall, balepCart, laphingStall } from './stalls';
import { bookShop, thangkaShop, stallBackdrops } from './specials';
import { backfill, fillRow, placeBuilding, type Placed } from './buildings';
import { alley } from './alleys';
import { marketLane } from './lane';
import { buildSteam } from './steam';
import { swayMaterial } from './sway';
import type { ShopKind } from './dressing';
import { rng, range } from '../../core/math';
import { mergeSigns } from '../../kit/sign';

export interface MarketBuild {
  meshes: Object3D[];
  colliders: BoxInit[];
  circles: CircleInit[];
  lamps: Lamp[];
  interact: Interactable[];
  flags: FlagLine[];
  darchor: DarchorPole[];
  stats: { buildings: number; drawCalls: number; tris: number; lamps: number; ms: number };
  /** Footprints of everything placed (debug maps). */
  footprints: OBB[];
  /** Debug: shop kinds and their front positions. */
  shops: { kind: string; x: number; z: number }[];
}

const LAMP_BUDGET = 38;

const KINDS: Record<string, ShopKind[]> = {
  templeE: ['germanBakery', 'handicraft', 'shawl', 'cafe', 'cyber', 'travel', 'chemist', 'momo', 'guesthouse', 'tailor', 'general', 'house'],
  templeW: ['cafe', 'shawl', 'handicraft', 'general', 'momo', 'travel', 'tailor', 'guesthouse', 'house', 'shawl'],
  jogE: ['handicraft', 'cafe', 'general', 'shawl', 'travel', 'momo', 'cyber', 'guesthouse', 'house'],
  jogW: ['momo', 'shawl', 'general', 'cafe', 'handicraft', 'guesthouse', 'chemist', 'tailor', 'house', 'travel', 'house'],
};

/** Reserve the arc-length span of a placed special building. */
const span = (p: Placed | null, s: number, pad = 0.12): [number, number][] => (p ? [[s - p.w / 2 - pad, s + p.w / 2 + pad]] : []);

/** Footprint of a stall (so no building lands on it). */
function stallFootprint(c: Ctx, f: { x: number; z: number; yaw: number }, back: number, w: number) {
  const [x, z] = toWorld(f, 0, -back / 2 + 0.3);
  c.footprints.push({ x, z, hw: w / 2, hd: back / 2 + 0.6, yaw: f.yaw });
}

export function buildMarket(): MarketBuild {
  const t0 = performance.now();
  const c = makeCtx();

  // 1. food stalls and the buildings behind them
  momoStall(c);
  balepCart(c);
  laphingStall(c);
  stallFootprint(c, STALLS.momo, VENDOR_BACK.momo + 1.0, 5.2);
  stallFootprint(c, STALLS.balep, VENDOR_BACK.balep + 0.6, 2.6);
  stallFootprint(c, STALLS.laphing, VENDOR_BACK.laphing + 0.9, 2.8);
  const back = stallBackdrops(c);

  // 2. special shops
  const books = bookShop(c);
  const thangka = thangkaShop(c);

  // 3. alleys (reserve their gaps)
  const ALLEYS = [
    { road: TEMPLE, side: -1 as const, s: 33.6, gap: 1.8, seed: 501 },
    { road: TEMPLE, side: 1 as const, s: 62.2, gap: 1.8, seed: 502 },
    { road: JOG, side: 1 as const, s: 25.2, gap: 1.8, seed: 503 },
    { road: JOG, side: -1 as const, s: 57.0, gap: 1.8, seed: 504 },
  ];
  for (const a of ALLEYS) alley(c, a);
  const alleyRes = (road: typeof TEMPLE, side: 1 | -1): [number, number][] =>
    ALLEYS.filter((a) => a.road === road && a.side === side).map((a) => [a.s - a.gap / 2, a.s + a.gap / 2]);

  // 4. the rows
  const rows: Placed[] = [];
  rows.push(...fillRow(c, {
    road: TEMPLE, side: -1, s0: 9.6, s1: 76, seed: 11, kinds: KINDS.templeE, low: true,
    reserved: [...span(back.momo, STALLS.momo.s + 0.2), ...span(books, 49.34), ...alleyRes(TEMPLE, -1)],
  }));
  rows.push(...fillRow(c, {
    road: TEMPLE, side: 1, s0: 9.4, s1: 76, seed: 12, kinds: KINDS.templeW,
    reserved: [...span(back.balep, STALLS.balep.s), ...alleyRes(TEMPLE, 1)],
  }));
  rows.push(...fillRow(c, {
    road: JOG, side: -1, s0: 8.6, s1: 78, seed: 13, kinds: KINDS.jogE, low: true,
    reserved: [...span(back.laph, STALLS.laphing.s), ...alleyRes(JOG, -1)],
  }));
  rows.push(...fillRow(c, {
    road: JOG, side: 1, s0: 10.5, s1: 78, seed: 14, kinds: KINDS.jogW,
    reserved: [...span(thangka, 47.78), ...alleyRes(JOG, 1)],
  }));

  // 5. Market Lane: stalls first, then the small buildings behind them
  marketLane(c);
  let laneB = 0;
  for (const side of [1, -1] as const) {
    const r = rng(side > 0 ? 71 : 73);
    let s = 3.0;
    while (s < 24) {
      const w = range(r, 3.8, 5.6);
      const p = placeBuilding(c, {
        road: LANE, side, s: s + w / 2, w, kind: r() < 0.5 ? 'house' : 'guesthouse', seed: 7000 + laneB * 13 + (side > 0 ? 0 : 500),
        setback: 2.0, maxDepth: 5.2, minDepth: 2.8, noDress: true, fd: 0, floors: 2 + Math.floor(r() * 2),
        spec: { ground: 'blank', sign: null, awning: null, balconies: r() < 0.5 },
      });
      if (p) { laneB++; s += w + 0.15; } else s += 0.8;
    }
  }

  // 6. small back houses in the leftover pockets
  const back2 = backfill(c, 31);

  // 7. merge
  const meshes: Object3D[] = [];
  const add = (list: Mesh[]) => { for (const m of list) meshes.push(m); };
  add(c.bld.toMeshes(partsMaterial({ occlude: true }), 40));
  add(c.props.toMeshes(partsMaterial(), 40));
  if (c.hang.size) add(c.hang.toMeshes(swayMaterial(), 200));
  const steam = buildSteam(c.steam);
  if (steam) meshes.push(steam);
  meshes.push(...mergeSigns(c.meshes));

  // lamps: everything the stalls / lane / alleys need, then building lamps evenly subsampled
  const lamps = [...c.lamps];
  const room = Math.max(0, LAMP_BUDGET - lamps.length);
  if (c.bLamps.length) {
    const step = c.bLamps.length / Math.min(room, c.bLamps.length);
    for (let i = 0; i < Math.min(room, c.bLamps.length); i++) lamps.push(c.bLamps[Math.floor(i * step)]);
  }

  let tris = 0;
  for (const m of meshes) {
    const g = (m as Mesh).geometry;
    if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  return {
    meshes, colliders: c.colliders, circles: c.circles, lamps, interact: c.interact, flags: c.flags, darchor: c.darchor,
    stats: { buildings: rows.length + laneB + back2 + 5, drawCalls: meshes.length, tris: Math.round(tris), lamps: lamps.length, ms: Math.round(performance.now() - t0) },
    footprints: c.footprints, shops: c.shops,
  };
}
