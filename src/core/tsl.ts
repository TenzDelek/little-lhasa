// TSL building blocks shared by materials and the post pass. Pure expressions (no toVar / assign), so
// they work both inside and outside Fn().
// Twins of the CPU helpers in core/math.ts where noted, so CPU and GPU agree on patterns.
import { float, floor, fract, vec2, vec3, dot, mix, smoothstep } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** 2x2 Bayer value in [0, 1) for a pixel coordinate. */
const bayer2 = (a: Node<'vec2'>) => {
  const f = floor(a);
  return fract(f.x.div(2).add(f.y.mul(f.y).mul(0.75)));
};
/** 4x4 ordered-dither threshold in [0, 1) for a pixel coordinate (pass screenCoordinate.xy). */
export const bayer4 = (p: Node<'vec2'>): Node<'float'> => bayer2(p.mul(0.5)).mul(0.25).add(bayer2(p));

/** Hash of a vec2 in [0, 1). Twin of hash2() in core/math.ts. */
export const hash12 = (p: Node<'vec2'>): Node<'float'> => {
  const a = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const b = a.add(dot(a, a.yzx.add(33.33)));
  return fract(b.x.add(b.y).mul(b.z));
};

/** Hash of a vec3 in [0, 1). */
export const hash13 = (p: Node<'vec3'>): Node<'float'> => {
  const a = fract(p.mul(0.1031));
  const b = a.add(dot(a, a.zyx.add(31.32)));
  return fract(b.x.add(b.y).mul(b.z));
};

/** Value noise in [0, 1) over a vec2. */
export const vnoise12 = (p: Node<'vec2'>): Node<'float'> => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  const a = hash12(i), b = hash12(i.add(vec2(1, 0)));
  const c = hash12(i.add(vec2(0, 1))), d = hash12(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
};

/** 1 inside [a, b] with soft edges of width w. */
export const band = (x: Node<'float'>, a: number, b: number, w: number): Node<'float'> =>
  smoothstep(a - w, a, x).mul(float(1).sub(smoothstep(b, b + w, x)));
