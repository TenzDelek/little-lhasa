// Material for hanging goods (shawls, malas, scarves, snack strips, laundry): flat Parts colours, swinging
// gently in the wind. Each vertex carries `hang` = world y of its hook (see util.hangBox*), so the swing
// grows with the distance below the hook while the hook itself stays put.
import { attribute, clamp, float, positionGeometry, sin, vec3 } from 'three/tsl';
import { partsMaterial } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';

let cached: ReturnType<typeof partsMaterial> | null = null;

export function swayMaterial() {
  if (cached) return cached;
  const hang = attribute<'float'>('hang', 'float');
  const p = positionGeometry;
  const drop = clamp(hang.sub(p.y), 0, 1.6);
  const ph = p.x.mul(0.9).add(p.z.mul(0.6)).add(hang.mul(2.3));
  const gust = sin(U.time.mul(1.7).add(ph)).mul(0.6).add(sin(U.time.mul(3.1).add(ph.mul(1.9))).mul(0.3));
  const amt = gust.add(0.35).mul(drop).mul(0.07).mul(U.wind);
  const off = vec3(float(WIND_DIR.x).mul(amt), drop.mul(drop).mul(-0.01), float(WIND_DIR.z).mul(amt));
  cached = partsMaterial({ positionNode: p.add(off), grain: 0.05 });
  return cached;
}
