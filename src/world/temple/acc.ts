// Build accumulator shared by the temple builders: geometry buckets plus everything that has to be
// registered (colliders, lamps, flag lines, darchor poles, prayer wheels, butter lamps, smoke sources).
import type { Object3D } from 'three';
import { Parts, type V3 } from '../../core/geom';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { FlagLine, DarchorPole } from '../../kit/flags';
import { rng, type Rng } from '../../core/math';

export interface WheelSpec {
  id: string;
  group: 'temple' | 'kora';
  /** Wheel centre (world). */
  x: number; y: number; z: number;
  /** Where the player stands to use it (world). */
  use: V3;
  /** Uniform scale of the standard 0.4 x 0.6 m wheel. */
  scale: number;
}

export interface LampSpot {
  id: string;
  /** Lamp cup rim centre (flame sits on top). */
  x: number; y: number; z: number;
  interactive: boolean;
  lit: boolean;
}

export interface SmokeSource { x: number; y: number; z: number; n: number; spread: number; rise: number; size: number }

export class Acc {
  /** Buildings, walls, roofs: occluding, casting shadows. */
  big = new Parts();
  /** Props at human scale: not occluding, casting shadows. */
  small = new Parts();
  /** Tiny details and flat paint: no shadows, not occluding. */
  fine = new Parts();
  /** Deck surface (ground-like: no shadows cast, not occluding). */
  deck = new Parts();
  colliders: BoxInit[] = [];
  circles: CircleInit[] = [];
  lamps: Lamp[] = [];
  flags: FlagLine[] = [];
  poles: DarchorPole[] = [];
  wheels: WheelSpec[] = [];
  butterLamps: LampSpot[] = [];
  smoke: SmokeSource[] = [];
  meshes: Object3D[] = [];
  r: Rng;
  constructor(seed = 108) { this.r = rng(seed); }

  box(b: BoxInit) { this.colliders.push(b); }
  boxes(list: BoxInit[]) { for (const b of list) this.colliders.push(b); }
}
