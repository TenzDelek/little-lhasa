// URL parameters for testing and screenshots:
//   ?spot=templeGate            spawn at a named spot (world/layout.ts SPOTS)
//   ?x=12&z=-40                 spawn at a position (y from the ground)
//   ?yaw=1.57                   facing (radians, 0 = +z / south)
//   ?cam=chase                  start in the chase camera
//   ?az=0..3                    iso azimuth step (π/4 + k·π/2)
//   ?zoom=0..4                  iso zoom step (2 = default)
//   ?night=1                    start at night
//   ?shot=1                     auto-start, hide the HUD, and set window.__shotReady once frames have settled
//   ?colliders=1                draw every collider as a wire box (debug)
//   ?kit=1                      mount src/kit/KitPreview.tsx (kit showroom)
//   ?stats=1                    FPS / draw calls / triangles readout (also window.__stats)
import { SPOTS, type SpotId } from '../world/layout';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);

export const debug = {
  spot: (q.get('spot') ?? undefined) as SpotId | undefined,
  x: num('x'),
  z: num('z'),
  yaw: num('yaw'),
  cam: (q.get('cam') as 'iso' | 'chase' | null) ?? undefined,
  az: num('az'),
  zoom: num('zoom'),
  night: q.get('night') === '1',
  shot: q.get('shot') === '1',
  colliders: q.get('colliders') === '1',
  kit: q.get('kit') === '1',
  stats: q.get('stats') === '1',
};

/** Spawn point resolved from the URL (or the default spawn). */
export function spawnPoint() {
  if (debug.x !== undefined && debug.z !== undefined) return { x: debug.x, z: debug.z, ry: debug.yaw ?? Math.PI };
  const s = debug.spot && SPOTS[debug.spot] ? SPOTS[debug.spot] : SPOTS.spawn;
  return { x: s.x, z: s.z, ry: debug.yaw ?? s.ry };
}

declare global {
  interface Window { __shotReady?: boolean; __frames?: number }
}
