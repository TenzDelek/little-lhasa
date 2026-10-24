// Builds the whole hillside module once: Bhagsu Road and Dharamkot Road frontages (guesthouses, hotels,
// cafés, homes, the tea shop and the puppy's nook, Amala's house, the school, the shrine), the viewpoint and
// the Bhagsu overlook, then plans the forest around everything. Returns merged meshes plus everything
// Hillside.tsx registers.
import type { Mesh, Object3D } from 'three';
import { partsMaterial } from '../../core/materials';
import type { BoxInit, CircleInit } from '../../core/collision';
import type { Lamp } from '../../core/lamps';
import type { Interactable } from '../../core/interact';
import type { FlagLine, DarchorPole } from '../../kit/flags';
import { mergeSigns } from '../../kit/sign';
import { makeCtx } from './ctx';
import { bhagsuRoad } from './bhagsu';
import { dharamkotRoad } from './dharamkot';
import { viewpoint } from './viewpoint';
import { planForest, type TreeInstance } from './woods';
import type { OBB } from './util';

export interface HillsideBuild {
  meshes: Object3D[];
  colliders: BoxInit[];
  circles: CircleInit[];
  lamps: Lamp[];
  interact: Interactable[];
  flags: FlagLine[];
  darchor: DarchorPole[];
  trees: TreeInstance[];
  footprints: OBB[];
  stats: { drawCalls: number; tris: number; lamps: number; trees: Record<string, number> };
}

const LAMP_BUDGET = 30;

export function buildHillside(): HillsideBuild {
  const c = makeCtx();
  bhagsuRoad(c);
  dharamkotRoad(c);
  viewpoint(c);

  // merge
  const meshes: Object3D[] = [];
  const add = (list: Mesh[]) => { for (const m of list) meshes.push(m); };
  // buildings in 24 m chunks (fewer triangles drawn past the view edge for a few more draw calls), props in 48 m
  if (c.bld.size) add(c.bld.toMeshes(partsMaterial({ occlude: true }), 24));
  if (c.props.size) add(c.props.toMeshes(partsMaterial(), 48));
  meshes.push(...mergeSigns(c.meshes));

  const lamps = [...c.lamps];
  const room = Math.max(0, LAMP_BUDGET - lamps.length);
  if (c.bLamps.length && room) {
    const n = Math.min(room, c.bLamps.length), step = c.bLamps.length / n;
    for (let i = 0; i < n; i++) lamps.push(c.bLamps[Math.floor(i * step)]);
  }

  const forest = planForest(c.footprints, c.trees, c.clearings);

  let tris = 0;
  for (const m of meshes) {
    const g = (m as Mesh).geometry;
    if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  return {
    meshes, colliders: c.colliders, circles: c.circles, lamps, interact: c.interact, flags: c.flags, darchor: c.darchor,
    trees: forest.items, footprints: c.footprints,
    stats: { drawCalls: meshes.length, tris: Math.round(tris), lamps: lamps.length, trees: forest.counts },
  };
}
