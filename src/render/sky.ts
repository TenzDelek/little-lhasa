// Sky for the chase camera (background pixels only): a dithered gradient from a hazy horizon to a deeper
// zenith, warm by day, deep blue with stars and a moon glow by night. The iso camera never sees the sky;
// it shows flat paper instead (Gorshey's diorama look).
import { Matrix4, Vector3, type Camera } from 'three';
import { uniform, vec2, vec3, vec4, float, normalize, mix, smoothstep, max, atan, asin, floor, step, pow, dot } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { U } from '../core/uniforms';
import { hash12 } from '../core/tsl';

const invProj = uniform(new Matrix4());
const camWorld = uniform(new Matrix4());
const moonDir = new Vector3(-0.5, 0.55, -0.65).normalize();

// sRGB colours (the post pass works in sRGB)
/** Horizon colours (sRGB hex) — the ground's distance haze matches these. */
export const DAY_HORIZON_HEX = 0xe6eef2, NIGHT_HORIZON_HEX = 0x1d2742;

const c = (hex: number) => vec3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const DAY_ZENITH = c(0x7fa8d6), DAY_HORIZON = c(DAY_HORIZON_HEX), DAY_GROUND = c(0xc9cfc8);
const NIGHT_ZENITH = c(0x0a0e1c), NIGHT_HORIZON = c(NIGHT_HORIZON_HEX), NIGHT_GROUND = c(0x10141f);

export const sky = {
  invProj,
  camWorld,
  update(cam: Camera) {
    invProj.value.copy(cam.projectionMatrixInverse);
    camWorld.value.copy(cam.matrixWorld);
  },
  /** Sky colour (sRGB) for a background pixel at screen uv (0..1, y DOWN as screenUV) / art pixel px. */
  colorAt(uv: Node<'vec2'>, ip: typeof invProj, cw: typeof camWorld, px: Node<'vec2'>): Node<'vec3'> {
    const ndc = vec4(uv.x.mul(2).sub(1), uv.y.mul(-2).add(1), 1, 1);
    const v = ip.mul(ndc);
    const dirView = normalize(v.xyz.div(v.w));
    const dir = normalize(cw.mul(vec4(dirView, 0)).xyz);
    const y = dir.y;
    const n = U.night;
    const zen = mix(DAY_ZENITH, NIGHT_ZENITH, n), hor = mix(DAY_HORIZON, NIGHT_HORIZON, n), gnd = mix(DAY_GROUND, NIGHT_GROUND, n);
    const up = pow(smoothstep(0.0, 0.75, y), float(0.7));
    const col = mix(hor, zen, up).toVar();
    col.assign(mix(col, gnd, smoothstep(0.0, -0.08, y)));
    // stars: fixed to the sky (direction cells), twinkle a little
    const az = atan(dir.x, dir.z), el = asin(y);
    const cell = floor(vec2(az, el).mul(380));
    const h = hash12(cell);
    const tw = hash12(cell.add(floor(U.time.mul(1.5)))).mul(0.5).add(0.5);
    const star = step(0.9975, h).mul(smoothstep(0.06, 0.3, y)).mul(n).mul(tw);
    col.addAssign(vec3(0.85, 0.88, 1).mul(star));
    // moon glow at night
    const md = max(dot(dir, vec3(moonDir.x, moonDir.y, moonDir.z)), 0);
    col.addAssign(vec3(0.75, 0.8, 0.95).mul(smoothstep(0.9993, 0.9996, md).add(pow(md, float(60)).mul(0.12))).mul(n));
    void px;
    return col;
  },
};
