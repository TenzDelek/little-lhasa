// Incense / juniper smoke: cheap animated puffs. Every puff of every source is one merged mesh (one draw
// call); each vertex carries its puff's origin + phase, and a TSL positionNode lifts, drifts (downwind),
// wobbles, grows and finally shrinks each puff to nothing over its life. No per-frame CPU work.
import { useMemo } from 'react';
import { Float32BufferAttribute, IcosahedronGeometry, Mesh, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Node } from 'three/webgpu';
import { attribute, float, fract, positionGeometry, screenCoordinate, sin, smoothstep, vec3 } from 'three/tsl';
import { bayer4 } from '../../core/tsl';
import { mat } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';
import { rng } from '../../core/math';
import type { SmokeSource } from './acc';

export function Smoke({ sources }: { sources: SmokeSource[] }) {
  const mesh = useMemo(() => {
    const r = rng(5);
    const geos: BufferGeometry[] = [];
    let maxRise = 1, maxSize = 0.3;
    for (const s of sources) {
      maxRise = Math.max(maxRise, s.rise); maxSize = Math.max(maxSize, s.size);
      for (let i = 0; i < s.n; i++) {
        const g = new IcosahedronGeometry(s.size * 0.62, 0);
        g.deleteAttribute('uv');
        g.deleteAttribute('normal');
        g.computeVertexNormals();
        const ox = s.x + (r() - 0.5) * s.spread, oz = s.z + (r() - 0.5) * s.spread;
        g.translate(ox, s.y, oz);
        const n = g.attributes.position.count;
        const puff = new Float32Array(n * 4), meta = new Float32Array(n * 2);
        const phase = i / s.n + r() * 0.02;
        for (let k = 0; k < n; k++) {
          puff[k * 4] = ox; puff[k * 4 + 1] = s.y; puff[k * 4 + 2] = oz; puff[k * 4 + 3] = phase;
          meta[k * 2] = s.rise; meta[k * 2 + 1] = 0.12 + r() * 0.08;
        }
        g.setAttribute('puffOrigin', new Float32BufferAttribute(puff, 4));
        g.setAttribute('puffLife', new Float32BufferAttribute(meta, 2));
        geos.push(g);
      }
    }
    const geo = mergeGeometries(geos, false)!;
    geo.computeBoundingSphere();
    if (geo.boundingSphere) geo.boundingSphere.radius += maxRise + 3;

    const puff = attribute<'vec4'>('puffOrigin', 'vec4');
    const meta = attribute<'vec2'>('puffLife', 'vec2');
    const life = fract(U.time.mul(meta.y).add(puff.w));
    const rise = meta.x.mul(life.pow(0.8));
    const drift = life.mul(life).mul(1.6).mul(U.wind);
    const wob = sin(U.time.mul(1.3).add(puff.w.mul(37.0))).mul(0.18).mul(life);
    const centre = puff.xyz.add(vec3(
      float(WIND_DIR.x).mul(drift).add(wob),
      rise,
      float(WIND_DIR.z).mul(drift).add(sin(U.time.mul(1.1).add(puff.w.mul(23.0))).mul(0.12).mul(life)),
    ));
    const grow = smoothstep(0.0, 0.12, life).mul(float(1).sub(smoothstep(0.55, 1.0, life))).mul(life.mul(1.8).add(0.6));
    const pos = centre.add(positionGeometry.sub(puff.xyz).mul(grow));
    const m = mat({ color: 0xdcd8d0, vertexColors: false, grain: 0.05, flat: true, positionNode: pos as Node<'vec3'> });
    // dither the puffs thinner as they age
    m.maskNode = bayer4(screenCoordinate.xy).lessThan(float(1).sub(smoothstep(0.25, 1.0, life)).mul(0.75).add(0.08));
    const mesh = new Mesh(geo, m);
    mesh.castShadow = false; mesh.receiveShadow = false;
    return mesh;
  }, [sources]);
  return <primitive object={mesh} />;
}
