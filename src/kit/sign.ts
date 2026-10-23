// Shop signs: small canvas textures drawn at art-pixel resolution (nearest filtering), English in a pixel
// font and optional Tibetan script, glowing a little at night.
//
// API CONTRACT — keep stable; only add optional fields.
//   const m = makeSign({ text: 'MOMO', bod: 'མོག་མོག', bg: PAL.templeRed, fg: PAL.templeYellow });
//   m.position.set(...); m.rotation.y = yaw; scene.add(m)   // a thin board facing local +z, centred
import { BoxGeometry, Mesh } from 'three';
import { mat } from '../core/materials';
import { PAL } from '../core/palette';

export interface SignSpec {
  /** Short English text (≤ 10 chars reads best at this resolution). */
  text: string;
  /** Optional Tibetan-script line. */
  bod?: string;
  /** Board and letter colours (sRGB hex). */
  bg?: number;
  fg?: number;
  /** Board size in metres (default sized from the text). */
  w?: number;
  h?: number;
  /** Glow at night (lit signboard). Default true. */
  glow?: boolean;
}

export function makeSign(spec: SignSpec): Mesh {
  // PLACEHOLDER (replaced by the building-kit builder): a plain coloured board.
  const w = spec.w ?? Math.max(1, spec.text.length * 0.22 + 0.3);
  const h = spec.h ?? (spec.bod ? 0.7 : 0.45);
  const m = new Mesh(new BoxGeometry(w, h, 0.05), mat({ color: spec.bg ?? PAL.templeRed, vertexColors: false }));
  m.castShadow = true;
  return m;
}
