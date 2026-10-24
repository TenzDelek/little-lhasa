// The ground module: terrain surface (painted procedurally from the town plan), kerbs and drains, grass and
// weeds, retaining walls + railings at drop-offs, and the chase-camera backdrop (outer landscape, the
// Dhauladhar range to the north, Kangra valley haze to the south).
//
//   terrainMesh.ts  1 m terrain grid in 48 m tiles          terrainMat.ts  the TSL ground painter
//   fields.ts       baked distance fields (+ CPU sampler)   shade.ts       shared TSL helpers, rim dissolve
//   grass.ts        blades, ferns, flowers, weeds + wind    edges.ts       kerbs, drain slabs, railings
//   backdrop.ts     outer landscape, Dhauladhar, valley, distant deodars (chase camera only)
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { game } from '../../core/game';
import { partsMaterial } from '../../core/materials';
import { collision } from '../../core/collision';
import { uIso } from './shade';
import { terrainMaterial } from './terrainMat';
import { buildTerrain, CHUNK } from './terrainMesh';
import { buildGrass, grassMaterial } from './grass';
import { buildEdges } from './edges';
import { buildBackdrop, buildBackdropTrees } from './backdrop';

function buildGround() {
  const edges = buildEdges();
  return {
    terrain: buildTerrain(terrainMaterial()),
    grass: buildGrass(grassMaterial()).chunks,
    kerbs: edges.parts.toMeshes(partsMaterial({ key: 'ground:edges' }), CHUNK, false),
    colliders: edges.colliders,
    backdrop: buildBackdrop(),
    farTrees: buildBackdropTrees(),
  };
}
type GroundObjects = ReturnType<typeof buildGround>;

export function Ground() {
  const world = useMemo(() => buildGround(), []);
  const live = useRef<GroundObjects | null>(null);
  const st = useRef({ mode: '', next: 0 });
  const ref = useRef<Group>(null);

  useEffect(() => {
    live.current = world;
    const offs = world.colliders.map((c) => collision.addBox(c));
    // dev hook for perf probes: window.__ground is this module's root group
    if (import.meta.env.DEV) (window as unknown as { __ground?: Group | null }).__ground = ref.current;
    return () => { offs.forEach((off) => off()); live.current = null; };
  }, [world]);

  useFrame((_, raw) => {
    const w = live.current, s = st.current;
    if (!w) return;
    const mode = game.cam.mode;
    const iso = mode === 'iso';
    if (mode !== s.mode) {
      // iso: the diorama (rim dissolves, nothing outside it); chase: the land runs on to the mountains
      s.mode = mode;
      uIso.value = iso ? 1 : 0;
      for (const c of w.terrain) c.mesh.visible = !iso || c.inside;
      w.backdrop.visible = w.farTrees.visible = !iso;
      s.next = 0;
    }
    // grass tiles: only near the camera target (saves draw calls in the chase camera)
    s.next -= raw;
    if (s.next <= 0) {
      s.next = 0.3;
      const t = game.cam.target, R = iso ? 58 : 80;
      for (const c of w.grass) {
        const dx = c.cx + CHUNK / 2 - t.x, dz = c.cz + CHUNK / 2 - t.z;
        c.mesh.visible = dx * dx + dz * dz < R * R;
      }
    }
  });

  return (
    <group name="ground" ref={ref}>
      {world.terrain.map((c, i) => <primitive key={`t${i}`} object={c.mesh} />)}
      {world.grass.map((c, i) => <primitive key={`g${i}`} object={c.mesh} />)}
      {world.kerbs.map((m, i) => <primitive key={`e${i}`} object={m} />)}
      <primitive object={world.backdrop} />
      <primitive object={world.farTrees} />
    </group>
  );
}
