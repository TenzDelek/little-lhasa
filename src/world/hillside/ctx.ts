// Shared build context for the hillside module: occluding Parts (buildings, roofs, big walls), plain Parts
// (small props, benches, steps, platforms) and everything that must be registered (colliders, lamps,
// interactables, flags), plus footprints so the forest keeps clear of everything built here.
import type { Object3D } from 'three';
import { Parts, type V3 } from '../../core/geom';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { Interactable } from '../../core/interact';
import type { FlagLine, DarchorPole } from '../../kit/flags';
import { toWorld, type Frame, type OBB } from './util';

/** A tree the builders want at a fixed spot (shrine tree, courtyard tree…), planted by the forest. */
export interface PlantedTree { x: number; z: number; kind: 'deodar' | 'pine' | 'oak' | 'rhodo' | 'bush'; scale?: number; yaw?: number }

export interface Ctx {
  /** Buildings, roofs, walls: occluding material (dissolves in front of the boy). */
  bld: Parts;
  /** Furniture, steps, platforms, small props: plain material. */
  props: Parts;
  colliders: BoxInit[];
  circles: CircleInit[];
  /** Lamps that must be registered (tea shop, viewpoint, Amala's porch). */
  lamps: Lamp[];
  /** Lamps offered by kit buildings (subsampled at the end to stay inside the budget). */
  bLamps: Lamp[];
  flags: FlagLine[];
  darchor: DarchorPole[];
  /** Extra objects (signs) mounted as-is. */
  meshes: Object3D[];
  interact: Interactable[];
  /** Footprints of everything built (the forest keeps clear of them). */
  footprints: OBB[];
  /** Trees requested at fixed spots. */
  trees: PlantedTree[];
  /** Areas kept free of trees (views), shrubs still allowed. */
  clearings: OBB[];
}

export function makeCtx(): Ctx {
  return {
    bld: new Parts(), props: new Parts(),
    colliders: [], circles: [], lamps: [], bLamps: [], flags: [], darchor: [], meshes: [], interact: [],
    footprints: [], trees: [], clearings: [],
  };
}

/** Open the same local frame (front = +z, y = floor) on both Parts. */
export function inFrame(c: Ctx, f: Frame, y: number, fn: () => void) {
  const pos: V3 = [f.x, y, f.z];
  c.bld.group(pos, f.yaw, () => c.props.group(pos, f.yaw, fn));
}

/** World position of a local point in a frame at floor y. */
export function wpos(f: Frame, y: number, l: V3): V3 {
  const [x, z] = toWorld(f, l[0], l[2]);
  return [x, y + l[1], z];
}

/** Record a local rectangle (centre lx, lz; full size w x d) of a frame as a footprint. */
export function footprint(c: Ctx, f: Frame, lx: number, lz: number, w: number, d: number) {
  const [x, z] = toWorld(f, lx, lz);
  c.footprints.push({ x, z, hw: w / 2, hd: d / 2, yaw: f.yaw });
}
