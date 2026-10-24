// Shared TSL pieces for the ground module: colour constants, the diorama-rim dissolve, the camera-mode
// uniform and the distance haze used by the chase-camera backdrop.
import { Color } from 'three';
import type { Node } from 'three/webgpu';
import {
  cameraPosition, float, mix, positionWorld, screenCoordinate, smoothstep, texture, uniform, vec2, vec3, floor,
} from 'three/tsl';
import { bayer4, hash12 } from '../../core/tsl';
import { U } from '../../core/uniforms';
import { fieldTextures, UV } from './fields';

/** sRGB hex → linear vec3 constant. */
export const C = (hex: number): Node<'vec3'> => {
  const c = new Color().setHex(hex);
  return vec3(c.r, c.g, c.b);
};

/**
 * Concrete kerb along the asphalt roads (3D kerbs in edges.ts and the painted band under them). Duller than
 * PAL.curb so kerb + open drain read as one verge, not as a pair of bright rails.
 */
export const KERB = 0xa09a8e, KERB_DARK = 0x8c867b;

/** 1 while the iso (diorama) camera is active, 0 in the chase camera. Written by <Ground/> every frame. */
export const uIso = uniform(1);

/** Field-texture uv for a world xz. */
export const fieldUV = (xz: Node<'vec2'>): Node<'vec2'> =>
  vec2(xz.x.mul(UV.sx).add(UV.ox), xz.y.mul(UV.sz).add(UV.oz));

/** Sample both field textures at a world xz. */
export function fields(xz: Node<'vec2'>) {
  const { a, b } = fieldTextures();
  const uv = fieldUV(xz);
  return { A: texture(a, uv), B: texture(b, uv) };
}

/** World art-pixel cell (≈ one art pixel at the default zoom) for per-pixel grain. */
export const PIX = 0.045;
export const pixCell = (xz: Node<'vec2'>) => floor(xz.div(PIX));

/**
 * Rim dissolve: keep the fragment when the dithered threshold is under the world mask. In the chase camera
 * everything is kept (the landscape continues to the mountains instead).
 */
export function rimKeep(mask: Node<'float'>, xz: Node<'vec2'>): Node<'bool'> {
  const jitter = hash12(floor(xz.div(PIX * 2)).add(vec2(7.1, 3.3))).sub(0.5).mul(0.22);
  const m = mask.mul(1.12).sub(0.06).add(jitter);
  return m.greaterThan(bayer4(screenCoordinate.xy).mul(0.94).add(0.03)).or(uIso.lessThan(0.5));
}

// sky horizon colours of render/sky.ts (sRGB)
const HZ_DAY = new Color().setHex(0xdfe8ee), HZ_NIGHT = new Color().setHex(0x1d2742);
/** Linear horizon colour, day → night. */
export const horizon = (): Node<'vec3'> =>
  mix(vec3(HZ_DAY.r, HZ_DAY.g, HZ_DAY.b), vec3(HZ_NIGHT.r, HZ_NIGHT.g, HZ_NIGHT.b), U.night);

/** Haze factor 0..max by distance from the camera (chase camera only; 0 in iso). */
export function haze(start: number, end: number, max: number, isoToo = false): Node<'float'> {
  const d = positionWorld.sub(cameraPosition).length();
  const h = smoothstep(start, end, d).mul(max);
  return isoToo ? h : h.mul(float(1).sub(uIso));
}
