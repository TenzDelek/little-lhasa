// Material factory. Port of Gorshey's mat(): flat-shaded Lambert, per-voxel value "grain" so flat
// faces break into a few pixel tones, an optional ordered-dither fade, and — new for the town — a
// see-through cut: occludable materials dissolve (Bayer dither) where they stand between the camera
// and the player, so the boy never disappears behind a building.
//
// Every visible surface in the game should come from mat() (or partsMaterial() for Parts output),
// so lighting, grain and the post pass treat the whole town the same.
import { Color, DoubleSide, FrontSide, type Side } from 'three';
import { MeshLambertNodeMaterial, type Node, type UniformNode } from 'three/webgpu';
import {
  attribute, cameraPosition, float, floor, max, positionGeometry, positionWorld, screenCoordinate, select, smoothstep, vec3, vec4,
  uniform,
} from 'three/tsl';
import { U } from './uniforms';
import { bayer4, hash13 } from './tsl';

export interface MatOpts {
  /** Base colour (sRGB hex). Multiplies vertex colours when present. Default white. */
  color?: number;
  /** Use the geometry's `color` attribute. Default true. */
  vertexColors?: boolean;
  /** Flat shading (faceted, Gorshey look). Default true. */
  flat?: boolean;
  /** Grain amplitude (0 = none). Default 0.06. */
  grain?: number;
  /** Grain cells per metre (in geometry space). Default 18. */
  grainScale?: number;
  /** Grain seed so neighbouring materials don't share a pattern. */
  seed?: number;
  /** Dissolve where it blocks the camera's view of the player (buildings, canopies, walls). */
  occlude?: boolean;
  /** Read the per-vertex `emit` attribute written by Parts (glowing windows, lamps, signs). */
  emit?: boolean;
  /** Constant emissive colour (sRGB hex) and intensity. */
  emissive?: number;
  emissiveIntensity?: number;
  /** If true, the constant emissive only shows at night (scaled by U.night). */
  emissiveNight?: boolean;
  /** Side. Default FrontSide; use 'double' for cloth / leaves / flags. */
  side?: Side | 'double';
  /** Optional dither fade uniform (0 = invisible, 1 = solid), e.g. for things that appear. */
  fade?: UniformNode<'float', number>;
  /** Optional custom position node (vertex animation: wind, sway). Shadows follow it. */
  positionNode?: Node<'vec3'>;
  /** Skip lighting response to the see-through cut etc. and cache by key. */
  key?: string;
}

const cache = new Map<string, MeshLambertNodeMaterial>();
const srgb = (hex: number) => new Color().setHex(hex); // Color.setHex converts sRGB -> linear working space

/** Mask that is false where an occludable fragment sits between the camera and the player. */
function occlusionKeep(): Node<'bool'> {
  const head = U.player.add(vec3(0, 0.8, 0));
  const d = positionWorld.sub(head);
  const along = d.dot(U.viewDir).negate(); // > 0: toward the camera from the player
  const perp = d.sub(U.viewDir.mul(d.dot(U.viewDir))).length();
  const k = smoothstep(U.occludeRadius, U.occludeRadius.mul(0.55), perp)
    .mul(smoothstep(0.35, 1.3, along))
    .mul(U.occlude);
  // chase camera pushed into a canopy or under an eave: whatever is right in front of the lens dissolves —
  // completely inside ~1 m, thinning out to 2.6 m — so the view never fills with a wall of leaves
  const near = smoothstep(2.6, 1.0, positionWorld.distance(cameraPosition)).mul(U.nearCut).mul(1.1);
  return bayer4(screenCoordinate.xy).greaterThanEqual(max(k.mul(0.9), near));
}

/** Cache key from the resolved options, so equivalent calls share one material (and one shader build) no
 *  matter how they spell their options. Keyed calls (`key`) stay separate: their callers customise them. */
function cacheKey(o: MatOpts): string {
  if (o.key) return `k:${o.key}`;
  return [
    o.color ?? 0xffffff, o.vertexColors !== false ? 1 : 0, o.flat !== false ? 1 : 0, o.grain ?? 0.06, o.grainScale ?? 18,
    o.seed ?? '', o.occlude ? 1 : 0, o.emit ? 1 : 0, o.emissive ?? '', o.emissiveIntensity ?? 1, o.emissiveNight ? 1 : 0,
    o.side === 'double' ? 'd' : (o.side ?? FrontSide),
  ].join('|');
}

export function mat(opts: MatOpts = {}): MeshLambertNodeMaterial {
  const simple = !opts.fade && !opts.positionNode;
  const key = simple ? cacheKey(opts) : null;
  if (key && cache.has(key)) return cache.get(key)!;

  const side = opts.side === 'double' ? DoubleSide : (opts.side ?? FrontSide);
  const m = new MeshLambertNodeMaterial({
    color: srgb(opts.color ?? 0xffffff),
    flatShading: opts.flat !== false,
    vertexColors: opts.vertexColors !== false,
    side,
  });

  // Grain: one value-noise cell per 1/grainScale m in geometry space, so the pattern sticks to the object.
  // Amount, scale and seed are uniforms rather than literals, so materials that differ only in grain share
  // one compiled shader.
  const grain = opts.grain ?? 0.06;
  if (grain > 0) {
    const seed = opts.seed ?? ((opts.color ?? 0x777777) % 997) * 0.37;
    const n = hash13(floor(positionGeometry.mul(uniform(opts.grainScale ?? 18))).add(uniform(seed)));
    const g = float(1).add(n.sub(0.5).mul(uniform(2 * grain)));
    m.colorNode = vec4(uniform(srgb(opts.color ?? 0xffffff)).mul(g), 1);
  }

  // Emission: Parts writes vec4 emit = (linear rgb, mode); mode 1 = always on, 2 = night only.
  const emissive: Node<'vec3'>[] = [];
  if (opts.emit) {
    const e = attribute<'vec4'>('emit', 'vec4');
    emissive.push(e.xyz.mul(select(e.w.greaterThan(1.5), U.night, float(1))));
  }
  if (opts.emissive !== undefined) {
    const c = uniform(srgb(opts.emissive).multiplyScalar(opts.emissiveIntensity ?? 1)).mul(1);
    emissive.push(opts.emissiveNight ? c.mul(U.night) : c);
  }
  // emissiveNode is honoured by every lit NodeMaterial at runtime; the Lambert typings just omit it
  if (emissive.length) (m as unknown as { emissiveNode: Node }).emissiveNode = emissive.reduce((a, b) => a.add(b));

  // Masks: see-through cut and dither fade.
  const masks: Node<'bool'>[] = [];
  if (opts.occlude) masks.push(occlusionKeep());
  if (opts.fade) masks.push(bayer4(screenCoordinate.xy).lessThan(opts.fade));
  if (masks.length) m.maskNode = masks.reduce((a, b) => a.and(b));

  if (opts.positionNode) m.positionNode = opts.positionNode;
  if (key) cache.set(key, m);
  return m;
}

/** The material for Parts output: vertex colours + emit attribute. */
export const partsMaterial = (opts: Omit<MatOpts, 'vertexColors' | 'emit'> = {}) =>
  mat({ ...opts, vertexColors: true, emit: true });

/** Linear-space Color of an sRGB hex (for TSL uniforms / vertex colours). */
export const lin = (hex: number) => srgb(hex);
