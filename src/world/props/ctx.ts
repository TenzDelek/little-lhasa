// Shared build context for the street dressing: two Parts (tall things that dissolve in front of the boy,
// and small ground props), everything that must be registered (colliders, lamps), flag lines, sign meshes,
// and the obstacle snapshot used for placement.
import type { Mesh } from 'three';
import { Parts } from '../../core/geom';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { FlagLine } from '../../kit/flags';
import { Obstacles } from './plan';

export interface PCtx {
  /** Poles, lamps, wires, signposts, tall vehicles: occluding material. */
  tall: Parts;
  /** Bikes, cars, benches, bins, cylinders, crates, plants, shrines: plain material. */
  small: Parts;
  boxes: BoxInit[];
  circles: CircleInit[];
  lamps: Lamp[];
  flags: FlagLine[];
  /** makeSign meshes (merged into one atlas mesh at the end). */
  signs: Mesh[];
  obs: Obstacles;
  /** High points other features can tie lines to (power-pole tops, flag poles). */
  anchors: Anchor[];
  /** Debug counters. */
  stats: Record<string, number>;
}

export interface Anchor { x: number; z: number; y: number; top: number; kind: 'pole' | 'flagpole'; road: string; s: number }

export function makeCtx(): PCtx {
  return {
    tall: new Parts(), small: new Parts(), boxes: [], circles: [], lamps: [], flags: [], signs: [],
    obs: new Obstacles(), anchors: [], stats: {},
  };
}

export function count(c: PCtx, k: string, n = 1) { c.stats[k] = (c.stats[k] ?? 0) + n; }

/** Register a solid box: collider + claim the footprint so later props avoid it. */
export function solid(c: PCtx, b: BoxInit) { c.boxes.push(b); c.obs.claimBox(b); }
export function solidCircle(c: PCtx, ci: CircleInit) { c.circles.push(ci); c.obs.claimCircle(ci); }
