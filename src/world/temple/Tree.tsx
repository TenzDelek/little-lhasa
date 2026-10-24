// The debate-yard peepal (bodhi) tree canopy: chunky faceted leaf blobs with a gentle TSL wind sway.
// Trunk, platform and khatas are static Parts in dressing.ts.
import { useMemo } from 'react';
import { IcosahedronGeometry, Mesh } from 'three';
import type { Node } from 'three/webgpu';
import { positionGeometry, positionLocal, sin, vec3, float } from 'three/tsl';
import { Parts } from '../../core/geom';
import { mat } from '../../core/materials';
import { PAL } from '../../core/palette';
import { U, WIND_DIR } from '../../core/uniforms';
import { rng } from '../../core/math';
import { CY, DEBATE } from './site';
import { jitter } from './util';

const LEAVES = [PAL.grassDeep, PAL.deodarLight, PAL.moss, 0x557a2e, 0x4a6b2a] as const;

export function BodhiTree() {
  const mesh = useMemo(() => {
    const [tx, tz] = DEBATE.tree;
    const r = rng(77);
    const p = new Parts();
    const base = CY + 0.46 + 3.6;
    // a broad, flattened dome of many small faceted blobs, darker underneath, lit tufts on top
    for (let i = 0; i < 84; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 4.6;
      const y = base + 0.6 + r() * 2.3 - (d / 4.6) ** 2 * 1.3;
      const s = 0.65 + r() * 0.6;
      const g = new IcosahedronGeometry(s, 0);
      g.scale(1.15, 0.62, 1.15);
      const under = y < base + 1.1;
      p.add(g, jitter(r, under ? LEAVES[0] : LEAVES[1 + Math.floor(r() * 4)], 0.07), [tx + Math.sin(a) * d, y, tz + Math.cos(a) * d], { rot: [r() * 0.6, r() * 3, r() * 0.6] });
    }
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 3.4;
      const g = new IcosahedronGeometry(0.45 + r() * 0.35, 0);
      g.scale(1.2, 0.6, 1.2);
      p.add(g, jitter(r, PAL.grassLight, 0.06), [tx + Math.sin(a) * d - 0.4, base + 2.5 + r() * 0.7 - (d / 3.4) ** 2 * 0.8, tz + Math.cos(a) * d + 0.3], { rot: [r() * 0.5, r() * 3, r() * 0.5] });
    }
    const geo = p.merge();
    // sway: displacement grows with height above the trunk top, a slow gust plus a faster flutter
    const h = positionGeometry.y.sub(base).max(0).div(4.0);
    const ph = positionGeometry.x.mul(0.35).add(positionGeometry.z.mul(0.27));
    const gust = sin(U.time.mul(0.9).add(ph)).mul(0.1).add(sin(U.time.mul(2.7).add(ph.mul(3.0))).mul(0.035));
    const w = U.wind.mul(gust).mul(h);
    const pos = positionLocal.add(vec3(float(WIND_DIR.x).mul(w), w.mul(0.15), float(WIND_DIR.z).mul(w)));
    const m = mat({ vertexColors: true, emit: true, occlude: true, grain: 0.08, positionNode: pos as Node<'vec3'> });
    const mesh = new Mesh(geo, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }, []);
  return <primitive object={mesh} />;
}
