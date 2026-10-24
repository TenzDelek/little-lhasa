// Shared build context for the street dressing: two Parts (tall things that dissolve in front of the boy,
// and small ground props), everything that must be registered (colliders, lamps), flag lines, sign meshes,
// and the obstacle snapshot used for placement.
import type { Mesh, Object3D } from 'three';
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
  /** Cables and ropes: occluding, but cast no shadows (1-px wire shadows on the asphalt read as rail tracks). */
  wires: Parts;
  boxes: BoxInit[];
  circles: CircleInit[];
  lamps: Lamp[];
  flags: FlagLine[];
  /** makeSign meshes (merged into one atlas mesh at the end). */
  signs: Mesh[];
  /** Ready-made meshes with their own material (banners). */
  extra: Object3D[];
  obs: Obstacles;
  /** High points other features can tie lines to (power-pole tops, flag poles). */
  anchors: Anchor[];
  /** Debug counters. */
  stats: Record<string, number>;
  /** Debug: where things went (window.__propsMarks), for screenshots. */
  marks: [string, number, number][];
}

export interface Anchor { x: number; z: number; y: number; top: number; kind: 'pole' | 'flagpole'; road: string; s: number }

export function makeCtx(): PCtx {
  return {
    tall: new Parts(), small: new Parts(), wires: new Parts(), boxes: [], circles: [], lamps: [], flags: [], signs: [], extra: [],
    obs: new Obstacles(), anchors: [], stats: {}, marks: [],
  };
}

export function count(c: PCtx, k: string, n = 1) { c.stats[k] = (c.stats[k] ?? 0) + n; }
export function mark(c: PCtx, k: string, x: number, z: number) { c.marks.push([k, Math.round(x * 10) / 10, Math.round(z * 10) / 10]); }

/** Register a solid box: collider + claim the footprint so later props avoid it. */
export function solid(c: PCtx, b: BoxInit) { c.boxes.push(b); c.obs.claimBox(b); }
export function solidCircle(c: PCtx, ci: CircleInit) { c.circles.push(ci); c.obs.claimCircle(ci); }
