// Shared build context for the market module: three Parts (occluding buildings / roofs, small props,
// swaying hanging goods) plus everything that must be registered (colliders, lamps, interactables…).
import type { Object3D } from 'three';
import { Parts, type V3 } from '../../core/geom';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { Interactable } from '../../core/interact';
import type { FlagLine, DarchorPole } from '../../kit/flags';
import type { SteamEmitter } from './steam';
import type { Sight } from './sight';
import { toWorld, type Frame, type OBB } from './util';

export interface Ctx {
  /** Buildings, roofs, tarps, balconies: occluding material (dissolves in front of the boy). */
  bld: Parts;
  /** Goods, counters, furniture, forecourts, steps: plain material. */
  props: Parts;
  /** Hanging goods that sway (only util.hangBox / hangBoxFrom!). */
  hang: Parts;
  colliders: BoxInit[];
  circles: CircleInit[];
  /** Lamps that must be registered (stalls, lane). */
  lamps: Lamp[];
  /** Lamps offered by buildings (subsampled at the end to keep the total under budget). */
  bLamps: Lamp[];
  steam: SteamEmitter[];
  flags: FlagLine[];
  darchor: DarchorPole[];
  /** Extra objects (signs) mounted as-is. */
  meshes: Object3D[];
  interact: Interactable[];
  /** Footprints already placed (overlap tests). */
  footprints: OBB[];
  /** Debug: what kind of shop stands where (front centre), floors and roof top. */
  shops: { kind: string; x: number; z: number; floors?: number; top?: number }[];
  /** View corridors (default camera → food stalls) that buildings must stay below. */
  sight: Sight[];
}

export function makeCtx(): Ctx {
  return {
    bld: new Parts(), props: new Parts(), hang: new Parts(),
    colliders: [], circles: [], lamps: [], bLamps: [], steam: [], flags: [], darchor: [], meshes: [], interact: [],
    footprints: [], shops: [], sight: [],
  };
}

/** Open the same local frame (front = +z, y = floor) on all three Parts. */
export function inFrame(c: Ctx, f: Frame, y: number, fn: () => void) {
  const pos: V3 = [f.x, y, f.z];
  c.bld.group(pos, f.yaw, () => c.props.group(pos, f.yaw, () => c.hang.group(pos, f.yaw, fn)));
}

/** World position of a local point in a frame at floor y. */
export function wpos(f: Frame, y: number, l: V3): V3 {
  const [x, z] = toWorld(f, l[0], l[2]);
  return [x, y + l[1], z];
}
