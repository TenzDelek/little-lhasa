// Tree, shrub and rock variants for the hillside forests, built from flat-coloured Parts primitives and
// merged into one geometry per variant (instanced by the forest). Gorshey-like chunky silhouettes:
//   deodar    tall Himalayan cedar: stacked drooping skirts, dark blue-green, lighter tip layer + leader
//   deodarMid a fuller, shorter deodar          sapling  young deodar, 4 tiers
//   pine      chir pine: tall bare reddish trunk, umbrella crown of yellow-green needle clumps
//   oak       banj oak: forked trunk, rounded grey-green crown of clumps
//   rhodo     rhododendron tree: gnarled trunk, dark glossy crown studded with red blossom clusters
//   bush / bushDry / fern / rock / rockFlat   understory
// Every geometry has its origin at the base (y = 0 on the ground, sunk a little below it).
import { BufferGeometry, DodecahedronGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three';
import { Parts } from '../../core/geom';
import { PAL } from '../../core/palette';
import { lerp, rng, type Rng } from '../../core/math';
import { jit, rod } from './util';

export type TreeKind =
  | 'deodar' | 'deodarMid' | 'sapling' | 'pine' | 'oak' | 'rhodo'
  | 'bush' | 'bushDry' | 'fern' | 'rock' | 'rockFlat';

export interface Variant {
  kind: TreeKind;
  geo: BufferGeometry;
  /** Height (m) at scale 1. */
  h: number;
  /** Geometry height where the wind sway starts, and the sway amplitude at the top (m). */
  sway0: number;
  swayAmp: number;
  /** Trunk collider radius (0 = no collider) and canopy radius (m, scale 1). */
  trunkR: number;
  canopyR: number;
  /** Big things: occluding material + shadows. */
  big: boolean;
}

// colours (sRGB) — inside PAL's muted range
const C = {
  deoDark: PAL.deodarDark, deo: PAL.deodar, deoMid: 0x2a4636, deoLight: PAL.deodarLight, deoTip: 0x5d7d48,
  deoBlue: 0x2b4540, bark: PAL.bark, barkLight: PAL.barkLight, barkPine: 0x7a4e36, barkPlate: 0x5e4a3e,
  pine: 0x5f7a30, pineLight: 0x7c9640, pineDark: 0x45602a,
  oak: 0x4a6838, oakLight: 0x67864a, oakDark: 0x36502c, oakBark: 0x5a5148,
  rhodoLeaf: 0x2f4d2b, rhodoLeafL: 0x3f6034, rhodo: PAL.rhodo, rhodoL: 0xd85a50, rhodoD: 0x9a2a30,
  bush: 0x4c6c2e, bushL: 0x668a38, bushDry: 0x7c7a40, bushDryL: 0x969250,
  fern: 0x5a8a34, fernL: 0x78a640, rock: PAL.rock, rockDark: PAL.rockDark, moss: PAL.moss,
};

/** A low-poly blob (icosahedron, squashed) centred at c. */
function blob(p: Parts, r: number, c: readonly [number, number, number], color: number, squash = 0.75, rnd?: Rng) {
  const g = new IcosahedronGeometry(r, 0);
  g.scale(1, squash, 1);
  if (rnd) g.rotateY(rnd() * Math.PI * 2);
  p.add(g, color, c);
}

// ---- deodar --------------------------------------------------------------------------------------------
/** Frustum geometry with optional caps (fewer triangles than CylinderGeometry when a cap is hidden). */
function frustumGeo(rTop: number, rBot: number, h: number, segs: number, topCap: boolean, botCap: boolean, rot = 0): BufferGeometry {
  const pos: number[] = [];
  const P = (r: number, a: number, y: number) => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let i = 0; i < segs; i++) {
    const a0 = rot + (i / segs) * Math.PI * 2, a1 = rot + ((i + 1) / segs) * Math.PI * 2;
    const b0 = P(rBot, a0, 0), b1 = P(rBot, a1, 0), t0 = P(rTop, a0, h), t1 = P(rTop, a1, h);
    if (rTop > 1e-4) pos.push(...b0, ...b1, ...t1, ...b0, ...t1, ...t0);
    else pos.push(...b0, ...b1, 0, h, 0);
    if (topCap && rTop > 1e-4) pos.push(0, h, 0, ...t0, ...t1);
    if (botCap) pos.push(0, 0, 0, ...b1, ...b0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Deodar: a dark core cone wrapped in stacked plate-like skirts. Each tier is a wide shallow plate (its rim
 * reads as the drooping branch layer) with a smaller lighter ring on top (sunlit upper needles); the dark
 * gaps between tiers give the layered Himalayan-cedar silhouette. Tiers wander off-centre a little and the
 * leader nods at the top.
 */
function deodar(seed: number, H: number, tiers: number, R0: number, segs = 6): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const trunkTop = H * 0.8;
  p.add(frustumGeo(0.08, 0.2 * (H / 11) + 0.08, trunkTop + 0.3, 5, false, false), C.bark, [0, -0.3, 0]);
  const y0 = H * (0.15 + r() * 0.03);
  const topH = H * 0.13;
  const span = H - topH - y0;
  // dark core: fills the gaps between the plates
  p.add(frustumGeo(0, R0 * 0.36, H - y0 - 0.3, 6, false, false, r()), C.deoDark, [0, y0 + 0.15, 0]);
  let lx = 0, lz = 0;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = y0 + span * Math.pow(t, 0.95);
    const R = lerp(R0, R0 * 0.3, Math.pow(t, 0.8)) * (0.9 + r() * 0.2);
    const th = (lerp(1.0, 0.62, t) * H) / 11 + 0.15;
    lx += (r() - 0.5) * 0.08; lz += (r() - 0.5) * 0.08;
    const ox = lx + (r() - 0.5) * 0.14 * R, oz = lz + (r() - 0.5) * 0.14 * R;
    const rot = r() * Math.PI;
    const high = i >= tiers - 2;
    const plateC = high ? C.deo : i % 2 ? C.deoBlue : C.deo;
    const ringC = high ? C.deoLight : i % 2 ? C.deoMid : C.deoLight;
    p.add(frustumGeo(R * 0.52, R, th * 0.42, segs, true, true, rot), plateC, [ox, y, oz]);
    p.add(frustumGeo(R * 0.18, R * 0.6, th * 0.5, segs, true, false, rot + 0.5), ringC, [ox, y + th * 0.4, oz]);
    if (i < tiers - 2 && i % 2 === 0) {
      // drooping branch tips hanging off the rim
      for (let k = 0; k < 2; k++) {
        const a = r() * Math.PI * 2;
        p.box(0.42, 0.14, 0.42, [ox + Math.sin(a) * R * 0.88, y - 0.06, oz + Math.cos(a) * R * 0.88], C.deoDark, { rot: [0.5, a, 0] });
      }
    }
  }
  // leader with a nodding tip (deodars droop at the very top)
  p.add(frustumGeo(0, 0.36, topH + 0.2, 5, false, true, r()), C.deoLight, [lx, H - topH - 0.2, lz]);
  p.box(0.09, 0.4, 0.09, [lx + 0.1, H + 0.08, lz], C.deoTip, { rot: [0, 0, -0.6] });
  return p.merge();
}

// ---- chir pine ---------------------------------------------------------------------------------------------
function pine(seed: number, H: number): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const lx = (r() - 0.5) * 0.7, lz = (r() - 0.5) * 0.7; // lean of the crown
  const mid: [number, number, number] = [lx * 0.35, H * 0.45, lz * 0.35];
  const top: [number, number, number] = [lx, H * 0.78, lz];
  rod(p, [0, -0.3, 0], mid, 0.3, C.barkPine);
  rod(p, mid, top, 0.22, C.barkPine);
  // bark plates: a couple of darker chips, and a dead branch stub low on the trunk
  for (let i = 0; i < 2; i++) {
    const y = 0.8 + r() * H * 0.3, a = r() * Math.PI * 2;
    p.box(0.12, 0.24, 0.05, [Math.sin(a) * 0.15 + lx * 0.35 * (y / mid[1]), y, Math.cos(a) * 0.15 + lz * 0.35 * (y / mid[1])], C.barkPlate, { rot: [0, a, 0] });
  }
  rod(p, [0, H * 0.3, 0], [0.55, H * 0.36, 0.1], 0.07, C.barkLight);
  // crown: umbrella of needle clumps on short branches
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6;
    const d = 0.8 + r() * 1.1;
    const y = H * (0.66 + r() * 0.2);
    const c: [number, number, number] = [top[0] + Math.sin(a) * d, y, top[2] + Math.cos(a) * d];
    if (i % 2 === 0) rod(p, [top[0] * (y / top[1]), y - 0.5, top[2] * (y / top[1])], c, 0.08, C.barkPine);
    const rr = 0.8 + r() * 0.45;
    blob(p, rr, c, i % 2 ? C.pine : C.pineDark, 0.5, r);
    if (i % 2 === 0) blob(p, rr * 0.62, [c[0] + 0.1, c[1] + rr * 0.3, c[2] - 0.08], C.pineLight, 0.45, r);
  }
  blob(p, 1.0, [top[0], H * 0.92, top[2]], C.pine, 0.55, r);
  blob(p, 0.62, [top[0] + 0.1, H * 0.98, top[2]], C.pineLight, 0.5, r);
  return p.merge();
}

// ---- banj oak ----------------------------------------------------------------------------------------------
function oak(seed: number, H: number): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const fork: [number, number, number] = [(r() - 0.5) * 0.3, H * 0.38, (r() - 0.5) * 0.3];
  rod(p, [0, -0.3, 0], fork, 0.36, C.oakBark);
  const heads: [number, number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r() * 0.8;
    const d = 0.9 + r() * 0.7;
    const h: [number, number, number] = [fork[0] + Math.sin(a) * d, H * (0.58 + r() * 0.14), fork[2] + Math.cos(a) * d];
    rod(p, fork, h, 0.2, C.oakBark);
    heads.push(h);
  }
  for (const h of heads) {
    blob(p, 1.35 + r() * 0.4, [h[0], h[1] + 0.5, h[2]], r() < 0.5 ? C.oak : C.oakDark, 0.72, r);
    blob(p, 0.85, [h[0] + 0.2, h[1] + 1.25, h[2] - 0.1], C.oakLight, 0.7, r);
  }
  blob(p, 1.5, [fork[0], H * 0.82, fork[2]], C.oak, 0.7, r);
  blob(p, 0.9, [fork[0] - 0.2, H * 0.95, fork[2] + 0.15], C.oakLight, 0.7, r);
  return p.merge();
}

// ---- rhododendron (burans) -----------------------------------------------------------------------------------
function rhodo(seed: number, H: number): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const k1: [number, number, number] = [0.25, H * 0.28, 0.1];
  rod(p, [0, -0.3, 0], k1, 0.26, C.oakBark);
  const clumps: [number, number, number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.9;
    const d = 0.6 + r() * 0.6;
    const c: [number, number, number] = [k1[0] + Math.sin(a) * d, H * (0.55 + r() * 0.18), k1[2] + Math.cos(a) * d];
    rod(p, k1, [c[0] * 0.8, c[1] - 0.4, c[2] * 0.8], 0.14, C.oakBark);
    const rr = 0.95 + r() * 0.35;
    blob(p, rr, c, r() < 0.5 ? C.rhodoLeaf : C.rhodoLeafL, 0.75, r);
    clumps.push([c[0], c[1], c[2], rr]);
  }
  clumps.push([k1[0], H * 0.83, k1[2], 1.05]);
  blob(p, 1.05, [k1[0], H * 0.83, k1[2]], C.rhodoLeaf, 0.72, r);
  // blossom clusters on the upper surfaces
  for (const [cx, cy, cz, rr] of clumps) {
    const n = 3 + Math.floor(r() * 2);
    for (let j = 0; j < n; j++) {
      const a = r() * Math.PI * 2, el = 0.15 + r() * 0.9;
      const x = cx + Math.cos(el) * Math.sin(a) * rr * 0.95, y = cy + Math.sin(el) * rr * 0.72, z = cz + Math.cos(el) * Math.cos(a) * rr * 0.95;
      const col = r() < 0.5 ? C.rhodo : r() < 0.5 ? C.rhodoL : C.rhodoD;
      p.box(0.26, 0.2, 0.26, [x, y, z], col, { rot: [r(), r() * 3, r()] });
    }
  }
  return p.merge();
}

// ---- understory --------------------------------------------------------------------------------------------
function bush(seed: number, dry: boolean): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = i === 0 ? 0 : 0.3 + r() * 0.25;
    const rr = (i === 0 ? 0.55 : 0.36) + r() * 0.15;
    const col = dry ? (r() < 0.5 ? C.bushDry : C.bushDryL) : r() < 0.5 ? C.bush : C.bushL;
    blob(p, rr, [Math.sin(a) * d, rr * 0.55, Math.cos(a) * d], col, 0.72, r);
  }
  if (dry) {
    // lantana-ish flecks of colour
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      p.box(0.1, 0.1, 0.1, [Math.sin(a) * 0.45, 0.55 + r() * 0.2, Math.cos(a) * 0.45], r() < 0.5 ? 0xd88a3a : 0xc86a8a);
    }
  }
  return p.merge();
}

function fern(seed: number): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const L = 0.55 + r() * 0.2;
    p.group([0, 0.02, 0], a, () => {
      p.box(0.16, 0.025, L, [0, L * 0.3, L * 0.45], i % 2 ? C.fern : C.fernL, { rot: [-0.62 + r() * 0.2, 0, 0] });
    });
  }
  return p.merge();
}

function rock(seed: number, flat: boolean): BufferGeometry {
  const p = new Parts();
  const r = rng(seed);
  const g = new DodecahedronGeometry(0.55, 0);
  // jitter vertices by position (shared corners move together so faces stay closed)
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = Math.sin(x * 12.9 + y * 78.2 + z * 37.7 + seed) * 43758.5;
    const k = 0.82 + (h - Math.floor(h)) * 0.36;
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  g.scale(flat ? 1.5 : 1.05, flat ? 0.42 : 0.7, flat ? 1.1 : 0.95);
  g.computeVertexNormals();
  p.add(g, r() < 0.5 ? C.rock : jit(r, C.rock, 0.1), [0, flat ? 0.1 : 0.2, 0], { rot: [0, r() * 3, 0] });
  const m = new DodecahedronGeometry(0.32, 0);
  m.scale(1.2, 0.3, 1);
  p.add(m, C.moss, [0.08, flat ? 0.3 : 0.55, -0.05]);
  if (!flat) p.box(0.4, 0.12, 0.3, [0.35, 0.05, 0.25], C.rockDark, { rot: [0.2, 1, 0.1] });
  return p.merge();
}

let cached: Record<TreeKind, Variant> | null = null;

/** All variants (built once). */
export function treeVariants(): Record<TreeKind, Variant> {
  if (cached) return cached;
  const v = (kind: TreeKind, geo: BufferGeometry, h: number, sway0: number, swayAmp: number, trunkR: number, canopyR: number, big = true): Variant =>
    ({ kind, geo, h, sway0, swayAmp, trunkR, canopyR, big });
  cached = {
    deodar: v('deodar', deodar(11, 11.5, 7, 2.5), 11.5, 2.0, 0.32, 0.3, 2.5),
    deodarMid: v('deodarMid', deodar(23, 8.0, 6, 2.2), 8.0, 1.4, 0.26, 0.24, 2.2),
    sapling: v('sapling', deodar(37, 4.2, 4, 1.25, 6), 4.2, 0.6, 0.18, 0.14, 1.25),
    pine: v('pine', pine(41, 10.5), 10.5, 3.5, 0.4, 0.22, 2.0),
    oak: v('oak', oak(53, 7.2), 7.2, 2.4, 0.22, 0.24, 2.6),
    rhodo: v('rhodo', rhodo(67, 5.2), 5.2, 1.5, 0.16, 0.18, 1.8),
    bush: v('bush', bush(71, false), 1.0, 0.1, 0.06, 0, 0.8, false),
    bushDry: v('bushDry', bush(73, true), 1.0, 0.1, 0.06, 0, 0.8, false),
    fern: v('fern', fern(79), 0.6, 0.05, 0.07, 0, 0.6, false),
    rock: v('rock', rock(83, false), 0.8, 99, 0, 0.5, 0.6, false),
    rockFlat: v('rockFlat', rock(89, true), 0.5, 99, 0, 0, 0.8, false),
  };
  return cached;
}
