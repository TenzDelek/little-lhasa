// Building kit: McLeod Ganj–style concrete buildings (painted walls, shop shutters, balconies, tin roofs,
// black water tanks, rebar on the roof…). Used by the square, market and hillside builders.
//
// API CONTRACT — other modules code against these signatures. Keep them stable; only add optional fields.
//
//   const p = new Parts();
//   const b = buildBuilding(p, { w: 6, d: 7, floors: 3, ground: 'shop', sign: { text: 'MOMO' }, seed: 4 },
//                           besideRoad(roadById('temple-road'), 30, 1, 7));
//   // later: p.toMeshes(partsMaterial({ occlude: true })); register b.colliders / b.lamps; mount b.meshes
import type { Object3D } from 'three';
import type { Parts } from '../core/geom';
import type { BoxInit } from '../core/collision';
import type { Lamp } from '../core/lamps';
import type { Road } from '../world/layout';
import { roadFrame } from '../world/layout';
import { groundY } from '../world/terrain';
import { WALLS, ROOFS, PAL } from '../core/palette';
import { rng, pick } from '../core/math';
import type { SignSpec } from './sign';

export type RoofKind = 'flat' | 'tin' | 'tinHip' | 'terrace';
export type GroundFloor = 'shop' | 'cafe' | 'house' | 'hotel' | 'blank' | 'garage';

export interface BuildingSpec {
  /** Frontage width (local x) and depth (local z), metres. The front faces local +z. */
  w: number;
  d: number;
  /** Storeys above the ground floor's floor level (1..6). */
  floors: number;
  /** Storey height (default 2.9). */
  floorH?: number;
  /** Main wall paint (sRGB hex, from PAL / WALLS). Random from WALLS when omitted. */
  wall?: number;
  /** Trim / band / frame colour. */
  trim?: number;
  /** Ground-floor treatment (default 'shop'). */
  ground?: GroundFloor;
  /** Shop bays / window columns across the front (default from w). */
  bays?: number;
  /** Balconies on upper floors (default true for 'hotel', random otherwise). */
  balconies?: boolean;
  roof?: RoofKind;
  roofColor?: number;
  /** Black water tanks on a flat roof. */
  tanks?: number;
  dish?: boolean;
  /** Unfinished columns with rebar sticking out of a flat roof. */
  rebar?: boolean;
  /** External staircase on a side wall. */
  sideStairs?: 'left' | 'right' | null;
  /** Shop sign over the ground floor front. */
  sign?: SignSpec | null;
  /** Awning colour over the shop front (null = none). */
  awning?: number | null;
  /** Fraction of windows lit at night (default 0.45). */
  litChance?: number;
  seed?: number;
}

export interface Placement {
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Yaw (rotation.y); the building front faces (sin yaw, cos yaw). */
  yaw: number;
  /** Floor level of the ground floor; default groundY at the front-centre. Slopes get a concrete plinth. */
  y?: number;
}

export interface BuiltBuilding {
  /** Solid volume(s) — register with collision.addBox. */
  colliders: BoxInit[];
  /** Night lights (shop interiors, porch bulbs) — register with lamps.add. */
  lamps: Lamp[];
  /** Extra objects not merged into Parts (e.g. textured signs) — add to the scene. */
  meshes: Object3D[];
  /** Front door / shop opening centre at floor level (for NPC targets and interactions). */
  door: { x: number; y: number; z: number };
  /** Height of the roof top (world y). */
  top: number;
}

/** Build one building into `parts` (world space) and return its colliders, lamps and extras. */
export function buildBuilding(parts: Parts, spec: BuildingSpec, at: Placement): BuiltBuilding {
  // PLACEHOLDER (replaced by the building-kit builder): a painted block with a roof slab.
  const r = rng(spec.seed ?? 1);
  const fh = spec.floorH ?? 2.9;
  const H = spec.floors * fh;
  const y = at.y ?? groundY(at.x + Math.sin(at.yaw) * spec.d / 2, at.z + Math.cos(at.yaw) * spec.d / 2);
  const wall = spec.wall ?? pick(r, WALLS);
  parts.group([at.x, y, at.z], at.yaw, () => {
    parts.box(spec.w, H + 1.5, spec.d, [0, H / 2 - 0.75, 0], wall);
    parts.box(spec.w + 0.3, 0.2, spec.d + 0.3, [0, H + 0.1, 0], spec.roofColor ?? pick(r, ROOFS));
    parts.box(1.1, 2.1, 0.06, [0, 1.05, spec.d / 2 + 0.03], PAL.shutter);
  });
  const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
  return {
    colliders: [{ x: at.x, z: at.z, w: spec.w, d: spec.d, rot: at.yaw, y0: y - 2, y1: y + H + 0.2, tag: 'building' }],
    lamps: [],
    meshes: [],
    door: { x: at.x + fx * (spec.d / 2 + 0.3), y, z: at.z + fz * (spec.d / 2 + 0.3) },
    top: y + H + 0.2,
  };
}

/**
 * Placement for a building of depth `depth` beside a road, its front facing the road.
 * s = arc length along the road, side = +1 right / −1 left of the walking direction,
 * setback = gap between the road edge and the building front (pavement), default 0.6 m.
 */
export function besideRoad(road: Road, s: number, side: 1 | -1, depth: number, setback = 0.6): Placement {
  const f = roadFrame(road, s);
  const off = road.width / 2 + setback + depth / 2;
  const x = f.x + f.nx * off * side, z = f.z + f.nz * off * side;
  // face back toward the road centre
  const yaw = Math.atan2(-f.nx * side, -f.nz * side);
  return { x, z, yaw, y: f.y + 0.12 };
}

export interface RowOpts {
  depth?: number;
  minW?: number;
  maxW?: number;
  /** Floors range [min, max]. */
  floors?: [number, number];
  ground?: GroundFloor[];
  setback?: number;
  /** Gap between neighbours (m), default 0.15. */
  gap?: number;
  /** Return true to leave a gap at arc length s (lanes, stalls, landmarks). */
  skip?: (s: number) => boolean;
  /** Per-building overrides. */
  tweak?: (spec: BuildingSpec, i: number, s: number) => BuildingSpec;
  seed: number;
}

/** Fill road frontage between arc lengths s0..s1 on one side with a row of varied buildings. */
export function streetRow(parts: Parts, road: Road, s0: number, s1: number, side: 1 | -1, o: RowOpts): BuiltBuilding[] {
  const r = rng(o.seed);
  const out: BuiltBuilding[] = [];
  let s = s0, i = 0;
  while (s < s1) {
    const w = (o.minW ?? 4.5) + r() * ((o.maxW ?? 7.5) - (o.minW ?? 4.5));
    if (s + w > s1) break;
    const mid = s + w / 2;
    if (!o.skip?.(mid)) {
      const fl = o.floors ?? [2, 4];
      let spec: BuildingSpec = {
        w, d: o.depth ?? 7, floors: fl[0] + Math.floor(r() * (fl[1] - fl[0] + 1)),
        ground: o.ground ? pick(r, o.ground) : 'shop', seed: o.seed * 101 + i,
      };
      if (o.tweak) spec = o.tweak(spec, i, mid);
      out.push(buildBuilding(parts, spec, besideRoad(road, mid, side, spec.d, o.setback)));
      i++;
    }
    s += w + (o.gap ?? 0.15);
  }
  return out;
}
