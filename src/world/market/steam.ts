// Steam puffs over the momo steamers: little cubes that rise, swell and shrink away (Gorshey-style voxel
// smoke). One mesh for every emitter in the market; all motion is in the vertex shader (TSL), no CPU work
// per frame. Each puff is a unit cube whose vertices carry the emitter position and a phase.
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attribute, float, fract, positionGeometry, sin, vec3 } from 'three/tsl';
import { mat } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';
import { rng } from '../../core/math';

export interface SteamEmitter {
  x: number; y: number; z: number;
  /** Number of puffs in flight (default 6). */
  n?: number;
  /** Puff size multiplier (default 1). */
  size?: number;
  /** Rise height (m, default 0.9). */
  rise?: number;
}

export function buildSteam(emitters: SteamEmitter[], seed = 7): Mesh | null {
  if (!emitters.length) return null;
  const r = rng(seed);
  const geos: BufferGeometry[] = [];
  for (const e of emitters) {
    const n = Math.round((e.n ?? 6) * 1.6);
    for (let i = 0; i < n; i++) {
      const g = new BoxGeometry(1, 1, 1);
      g.deleteAttribute('uv');
      const cnt = g.attributes.position.count;
      const pos = g.attributes.position;
      // keep real positions near the emitter (correct bounds / culling); the shader rebuilds the cube
      for (let k = 0; k < cnt; k++) pos.setXYZ(k, e.x + pos.getX(k), e.y + pos.getY(k), e.z + pos.getZ(k));
      const pc = new Float32Array(cnt * 3), ph = new Float32Array(cnt * 4);
      const phase = (i + r() * 0.6) / n;
      const jx = (r() - 0.5) * 0.12, jz = (r() - 0.5) * 0.12;
      for (let k = 0; k < cnt; k++) {
        pc[k * 3] = e.x; pc[k * 3 + 1] = e.y; pc[k * 3 + 2] = e.z;
        ph[k * 4] = phase; ph[k * 4 + 1] = e.size ?? 1; ph[k * 4 + 2] = e.rise ?? 0.9; ph[k * 4 + 3] = jx * 7 + jz * 3;
      }
      g.setAttribute('pc', new Float32BufferAttribute(pc, 3));
      g.setAttribute('ph', new Float32BufferAttribute(ph, 4));
      geos.push(g);
    }
  }
  const geo = mergeGeometries(geos, false)!;
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 1.2;

  const pc = attribute<'vec3'>('pc', 'vec3');
  const ph = attribute<'vec4'>('ph', 'vec4');
  const t = fract(U.time.mul(0.5).add(ph.x));
  const swell = sin(t.mul(Math.PI)).mul(t.oneMinus().mul(0.5).add(0.6));
  const size = swell.mul(0.11).mul(ph.y);
  const wob = sin(U.time.mul(1.9).add(ph.x.mul(23)).add(ph.w)).mul(0.035);
  const drift = t.mul(t).mul(0.32).mul(U.wind);
  const off = vec3(
    float(WIND_DIR.x).mul(drift).add(wob),
    t.mul(ph.z),
    float(WIND_DIR.z).mul(drift).add(wob.mul(0.6)),
  );
  const corner = positionGeometry.sub(pc);
  const m = mat({
    color: 0xe4e8ec, vertexColors: false, grain: 0.05, grainScale: 30,
    positionNode: pc.add(off).add(corner.mul(size)),
    emissive: 0x9aa4b4, emissiveIntensity: 0.25, emissiveNight: true,
  });
  const mesh = new Mesh(geo, m);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'market-steam';
  return mesh;
}
