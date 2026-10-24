// Build all street dressing once (after the other modules have registered their colliders, so placement can
// dodge them). Returns merged meshes + everything to register.
import type { Object3D } from 'three';
import type { Mesh } from 'three';
import { partsMaterial } from '../../core/materials';
import { mergeSigns } from '../../kit/sign';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { FlagLine } from '../../kit/flags';
import { makeCtx } from './ctx';
import { buildLights } from './lights';
import { buildPower, buildCrossCables } from './power';
import { buildRoadFlags, buildHillFlags } from './flags';
import { buildBanners } from './banners';
import { buildParking } from './parking';
import { buildSigns, buildBenches, buildDoorsteps, buildShrines } from './furniture';

export interface PropsBuild {
  meshes: Object3D[];
  boxes: BoxInit[];
  circles: CircleInit[];
  lamps: Lamp[];
  flags: FlagLine[];
  stats: Record<string, number>;
  marks: [string, number, number][];
}

/** Chunk size for merging (m): big enough to keep draw calls low, small enough for some culling. */
const CHUNK = 44;

export function buildProps(): PropsBuild {
  const t0 = performance.now();
  const c = makeCtx();
  const step = (name: string, fn: () => void) => {
    try { fn(); } catch (e) { console.error(`[props] ${name} failed`, e); }
  };
  step('power', () => buildPower(c));
  step('lights', () => buildLights(c));
  step('cables', () => buildCrossCables(c));
  step('roadFlags', () => buildRoadFlags(c));
  step('hillFlags', () => buildHillFlags(c));
  step('banners', () => buildBanners(c));
  step('parking', () => buildParking(c));
  step('signs', () => buildSigns(c));
  step('benches', () => buildBenches(c));
  step('doorsteps', () => buildDoorsteps(c));
  step('shrines', () => buildShrines(c));

  const meshes: Object3D[] = [];
  if (c.tall.size) meshes.push(...c.tall.toMeshes(partsMaterial({ occlude: true }), CHUNK));
  if (c.small.size) meshes.push(...c.small.toMeshes(partsMaterial(), CHUNK));
  // cables: bigger chunks (they are long and thin) and no shadows
  if (c.wires.size) meshes.push(...c.wires.toMeshes(partsMaterial({ occlude: true }), CHUNK * 2, false));
  if (c.signs.length) meshes.push(...mergeSigns(c.signs));
  meshes.push(...c.extra);
  let tris = 0;
  for (const m of meshes) {
    const g = (m as Mesh).geometry;
    if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  c.stats.meshes = meshes.length;
  c.stats.tris = Math.round(tris);
  c.stats.ms = Math.round(performance.now() - t0);
  return { meshes, boxes: c.boxes, circles: c.circles, lamps: c.lamps, flags: c.flags, stats: c.stats, marks: c.marks };
}
