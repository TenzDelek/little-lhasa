// Grass, weeds, ferns and wildflowers (Gorshey-style blades). Placed on the CPU from the ground fields:
// none on streets, drains, frontage or footpaths; thick on road verges and in clearings; sparse ferns on the
// forest floor. Merged into one static mesh per 48 m tile (one draw call each, culled with the terrain).
// The shader sways the blades in the wind and parts them around the boy's feet, and dissolves them with the
// diorama rim exactly like the ground. Once the other modules have registered their colliders, every tuft that
// stands in a solid thing (plinths, steps, house floors, the temple's kora features) is collapsed (trimGrass).
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Mesh, type Material } from 'three';
import type { Node } from 'three/webgpu';
import {
  attribute, cameraViewMatrix, float, max, positionLocal, positionWorld, sin, smoothstep, vec2, vec3, vec4,
} from 'three/tsl';
import { WORLD_BOUNDS, roadById } from '../layout';
import { groundY } from '../terrain';
import { insideEnclosure } from '../temple/site';
import { collision, type Collider } from '../../core/collision';
import { mat } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';
import { PAL } from '../../core/palette';
import { rng, smooth, vnoise2 } from '../../core/math';
import { sampleFields, streetEdge, type FieldSample } from './fields';
import { fields, rimKeep } from './shade';
import { CHUNK } from './terrainMesh';

const B = WORLD_BOUNDS;
/** The viewpoint's tree-free view cone (twin of hillside/woods.ts VIEW_CONE). */
const VIEW = { x: 30, z: -81.5, tan: Math.tan((35 * Math.PI) / 180) };
/** The temple gate approach (paved by the temple module between the kora and the gate). */
const GATE_APPROACH = [4.5, 88.5, 13.5, 93.5] as const;
/** Inside the temple enclosure, or within `pad` m of its wall (the temple's deck and walls). */
const nearEnclosure = (x: number, z: number, pad: number) =>
  insideEnclosure(x, z) || insideEnclosure(x - pad, z) || insideEnclosure(x + pad, z) || insideEnclosure(x, z - pad) || insideEnclosure(x, z + pad);

// ---- geometry writer ---------------------------------------------------------------------------------
class Writer {
  pos: number[] = []; col: number[] = []; sway: number[] = [];
  /** One record per placement (tuft, fern, flower, weed): x, z, reach, first vertex, end vertex. */
  items: number[] = [];
  blades = 0;
  get verts() { return this.pos.length / 3; }
  private c = new Color();
  tri(a: number[], b: number[], c: number[], ca: number, cb: number, cc: number, sa: number, sb: number, sc: number) {
    this.pos.push(...a, ...b, ...c);
    for (const h of [ca, cb, cc]) { this.c.setHex(h); this.col.push(this.c.r, this.c.g, this.c.b); }
    this.sway.push(sa, sb, sc);
  }
  build(): BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new BufferGeometry();
    const n = this.pos.length / 3;
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('sway', new Float32BufferAttribute(this.sway, 1));
    const nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.computeBoundingSphere();
    return g;
  }
}

type R = () => number;

/** One blade: a thin leaning triangle from (x, y, z), base width w, height h, toward yaw with lean. */
function blade(W: Writer, r: R, x: number, y: number, z: number, h: number, w: number, base: number, tip: number) {
  const yaw = r() * Math.PI * 2;
  const lean = 0.15 + r() * 0.45;
  const dx = Math.sin(yaw), dz = Math.cos(yaw);
  const px = -dz * w * 0.5, pz = dx * w * 0.5;
  const tx = x + dx * lean * h, tz = z + dz * lean * h;
  W.tri([x - px, y - 0.02, z - pz], [x + px, y - 0.02, z + pz], [tx, y + h, tz], base, base, tip, 0, 0, h);
  W.blades++;
}

/** Fern: fronds arching out from the centre (two segments each). */
function fern(W: Writer, r: R, x: number, y: number, z: number, s: number) {
  const n = 5 + Math.floor(r() * 3);
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const dx = Math.sin(a), dz = Math.cos(a), L = s * (0.75 + r() * 0.5);
    const px = -dz, pz = dx;
    const m = [x + dx * L * 0.45, y + L * 0.42, z + dz * L * 0.45];
    const t = [x + dx * L, y + L * 0.12, z + dz * L];
    const w = L * 0.16;
    const cBase = PAL.grassDeep, cMid = 0x4f7426, cTip = 0x6b8d33;
    W.tri([x, y, z], [m[0] + px * w, m[1], m[2] + pz * w], [m[0] - px * w, m[1], m[2] - pz * w], cBase, cMid, cMid, 0, L * 0.4, L * 0.4);
    W.tri([m[0] + px * w, m[1], m[2] + pz * w], t, [m[0] - px * w, m[1], m[2] - pz * w], cMid, cTip, cMid, L * 0.4, L * 0.7, L * 0.4);
    W.blades += 2;
  }
}

const FLOWERS = [0xe8e4d8, 0xe2c24e, 0xd88aa6, 0x9a7cc0, 0x7f9fd8, 0xd98a3a, 0xe8e4d8, 0xc8503f] as const;

/** Wildflower: 2–4 stems with a tiny crossed head. */
function flower(W: Writer, r: R, x: number, y: number, z: number) {
  const n = 2 + Math.floor(r() * 3);
  const colr = FLOWERS[Math.floor(r() * FLOWERS.length)];
  for (let i = 0; i < n; i++) {
    const ox = x + (r() - 0.5) * 0.16, oz = z + (r() - 0.5) * 0.16;
    const h = 0.16 + r() * 0.16;
    const lx = (r() - 0.5) * 0.08, lz = (r() - 0.5) * 0.08;
    const hx = ox + lx, hz = oz + lz, hy = y + h;
    W.tri([ox - 0.012, y - 0.02, oz], [ox + 0.012, y - 0.02, oz], [hx, hy, hz], PAL.grassDeep, PAL.grassDeep, 0x5f8a2a, 0, 0, h);
    const s = 0.035;
    W.tri([hx - s, hy, hz], [hx + s, hy, hz], [hx, hy + s * 1.4, hz], colr, colr, colr, h, h, h);
    W.tri([hx, hy, hz - s], [hx, hy, hz + s], [hx, hy + s * 1.4, hz], colr, colr, colr, h, h, h);
    W.tri([hx - s, hy + 0.01, hz], [hx, hy + 0.01, hz + s], [hx + s, hy + 0.01, hz], colr, colr, colr, h, h, h);
    W.blades += 2;
  }
}

/** Nettle / tall weed: a few tall dark blades with seed heads. */
function weed(W: Writer, r: R, x: number, y: number, z: number) {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.35 + r() * 0.3;
    blade(W, r, x + (r() - 0.5) * 0.14, y, z + (r() - 0.5) * 0.14, h, 0.07, PAL.grassDeep, r() < 0.5 ? 0x7c8a3c : PAL.grassDry);
  }
}

interface Tone { base: number; mid: number; tip: number }
const TONES = {
  green: { base: 0x3a5a1e, mid: 0x6a9032, tip: 0x93b33e },
  lush: { base: 0x3a5a1e, mid: 0x5f8a2a, tip: 0x9fbd48 },
  dry: { base: 0x6b6a35, mid: 0xa89c5c, tip: 0xcbbd84 },
  forest: { base: 0x2f4a22, mid: 0x4a6b26, tip: 0x6b8d33 },
  verge: { base: 0x3a5a1e, mid: 0x6e8f34, tip: 0xa3a85a },
} satisfies Record<string, Tone>;

function tuft(W: Writer, r: R, x: number, y: number, z: number, tone: Tone, tall: number) {
  const n = 5 + Math.floor(r() * 4);
  const big = 0.8 + r() * 0.5;
  for (let i = 0; i < n; i++) {
    const h = (0.16 + r() * 0.2) * tall * big;
    const tip = r() < 0.55 ? tone.tip : tone.mid;
    blade(W, r, x + (r() - 0.5) * 0.18, y, z + (r() - 0.5) * 0.18, h, 0.085 + r() * 0.035, tone.base, tip);
  }
}

// ---- placement -----------------------------------------------------------------------------------------
/** Lush meadow patches. CPU twin of the ground shader's lush mask (vnoise12(xz * 0.11 + (40, -13))). */
export const lushAt = (x: number, z: number) => smooth(0.58, 0.7, vnoise2(x * 0.11 + 40, z * 0.11 - 13));

function density(f: FieldSample, x: number, z: number): { p: number; forest: number; verge: number; lush: number } {
  const none = { p: 0, forest: 0, verge: 0, lush: 0 };
  if (f.mask < 0.18) return none;
  const dS = streetEdge(f);
  if (dS < 0.3) return none;
  if (f.asphalt < 1.0 && f.lane > 0 && f.plaza > 0) return none; // kerb, drain, shoulder
  if (f.built > 0.45) return none;
  // temple court, its deck and enclosure wall (+0.5 m), and the paved gate approach
  if (x > GATE_APPROACH[0] && x < GATE_APPROACH[2] && z > GATE_APPROACH[1] && z < GATE_APPROACH[3]) return none;
  if (z > 88 && z < 134 && x > -17 && x < 32 && nearEnclosure(x, z, 0.5)) return none;
  if (f.path > 0.4) return { ...none, p: 0.02 };
  const cone = smooth(-1, 5, (VIEW.z - z) * VIEW.tan - Math.abs(x - VIEW.x)); // viewpoint meadow, no woods
  const forest = Math.min(1, Math.max(0, (dS - 7 + (vnoise2(x * 0.075 + 3.1, z * 0.075 + 8.7) - 0.5) * 10) / 9)) * (1 - cone);
  const verge = Math.max(0, 1 - Math.abs(dS - 1.7) / 1.3);
  const lush = lushAt(x, z) * (1 - forest * 0.8);
  let p = 0.05 + verge * 0.5 + lush * 0.9;
  p *= 1 - forest * 0.45;
  p *= Math.min(1, (f.mask - 0.18) * 3);
  return { p: Math.min(1, p), forest, verge, lush };
}

export interface GrassChunk {
  mesh: Mesh; cx: number; cz: number;
  /** Placement records (x, z, reach, v0, v1) for the collider trim. */
  items: Float32Array;
  /** 1 once a placement has been trimmed away. */
  dead: Uint8Array;
}

export function buildGrass(material: Material): { chunks: GrassChunk[]; blades: number } {
  const chunks: GrassChunk[] = [];
  let blades = 0;
  const f: FieldSample = sampleFields(0, 0);
  const STEP = 0.4;
  for (let cz = B.z0; cz < B.z1; cz += CHUNK) {
    for (let cx = B.x0; cx < B.x1; cx += CHUNK) {
      const W = new Writer();
      const r = rng(((cx + 1000) * 7919 + (cz + 1000) * 104729) >>> 0);
      const x1 = Math.min(cx + CHUNK, B.x1), z1 = Math.min(cz + CHUNK, B.z1);
      for (let z = cz; z < z1; z += STEP) for (let x = cx; x < x1; x += STEP) {
        const px = x + r() * STEP, pz = z + r() * STEP;
        sampleFields(px, pz, f);
        const d = density(f, px, pz);
        if (d.p <= 0 || r() > d.p * 0.56) continue;
        const y = groundY(px, pz);
        const dry = vnoise2(px * 0.075 + 3.1, pz * 0.075 + 8.7) * 0.8 + vnoise2(px * 1.25 + 9.1, pz * 1.25 + 4.4) * 0.2 > 0.62;
        const roll = r();
        const v0 = W.verts;
        let reach = 0.2;
        if (d.forest > 0.5) {
          if (roll < 0.3) { const fs = 0.32 + r() * 0.25; fern(W, r, px, y, pz, fs); reach = fs; }
          else tuft(W, r, px, y, pz, TONES.forest, 1);
        } else if (roll < 0.05 && !dry) flower(W, r, px, y, pz);
        else if (roll < 0.05 + d.verge * 0.08) weed(W, r, px, y, pz);
        else if (roll < 0.09 && d.forest > 0.2) { const fs = 0.3 + r() * 0.2; fern(W, r, px, y, pz, fs); reach = fs; }
        else {
          const tone = dry ? TONES.dry : d.verge > 0.4 ? TONES.verge : r() < 0.5 ? TONES.lush : TONES.green;
          tuft(W, r, px, y, pz, tone, 1 + d.verge * 0.5 + d.lush * 0.5);
        }
        W.items.push(px, pz, reach, v0, W.verts);
      }
      const g = W.build();
      if (!g) continue;
      const mesh = new Mesh(g, material);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'ground:grass';
      chunks.push({ mesh, cx, cz, items: new Float32Array(W.items), dead: new Uint8Array(W.items.length / 5) });
      blades += W.blades;
    }
  }
  return { chunks, blades };
}

// ---- collider trim -------------------------------------------------------------------------------------
// Other modules' solid things (plinths, mani piles, chortens, steps, house floors…) register colliders after
// the grass is built. Once they have, every placement whose footprint touches one is collapsed to a point
// under the ground, so no blade pokes through a platform or hugs the base of a shrine. Along the kora the
// margin is wider: the pilgrims' features stand clear of the meadow.
const KORA = roadById('kora-path');
const TREE_TAGS = new Set(['hillside-tree', 'tree']);
const _near: Collider[] = [];

/** Distance in xz from (x, z) to a collider's footprint (0 inside). */
function footDist(c: Collider, x: number, z: number) {
  if (c.kind === 'circle') return Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r);
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  return Math.hypot(Math.max(Math.abs(lx) - c.w / 2, 0), Math.max(Math.abs(lz) - c.d / 2, 0));
}

/** Within ~6 m of the kora's centre line (the band where the temple placed its kora features)? */
function nearKora(x: number, z: number) {
  if (x < -32 || x > 48 || z < 78 || z > 150) return false;
  const P = KORA.pts;
  for (let i = 1; i < P.length; i++) {
    const [ax, az] = P[i - 1], [bx, bz] = P[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 6) return true;
  }
  return false;
}

/**
 * Collapse every grass placement that stands in (or, along the kora, close to) a static collider. Returns
 * placements trimmed by tag (dev statistics). Cheap enough to run again whenever the colliders change.
 */
export function trimGrass(chunks: GrassChunk[]): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const ch of chunks) {
    const it = ch.items;
    const posA = ch.mesh.geometry.getAttribute('position') as BufferAttribute;
    const swayA = ch.mesh.geometry.getAttribute('sway') as BufferAttribute;
    const pos = posA.array as Float32Array, sway = swayA.array as Float32Array;
    let dirty = false;
    for (let k = 0, i = 0; k < it.length; k += 5, i++) {
      if (ch.dead[i]) continue;
      const x = it[k], z = it[k + 1];
      const R = it[k + 2] + (nearKora(x, z) ? 0.55 : 0.08);
      const gy = groundY(x, z);
      let hit: Collider | null = null;
      for (const c of collision.query(x, z, R, _near)) {
        if (c.tag && TREE_TAGS.has(c.tag)) continue;
        if (c.y0 > gy + 0.6 || c.y1 < gy + 0.03) continue; // overhead (balconies, awnings) or buried
        if (footDist(c, x, z) < R) { hit = c; break; }
      }
      if (!hit) continue;
      ch.dead[i] = 1;
      dirty = true;
      const tag = hit.tag ?? hit.kind;
      stats[tag] = (stats[tag] ?? 0) + 1;
      const v0 = it[k + 3], v1 = it[k + 4];
      const bx = pos[v0 * 3], by = pos[v0 * 3 + 1] - 0.4, bz = pos[v0 * 3 + 2];
      for (let v = v0; v < v1; v++) {
        pos[v * 3] = bx; pos[v * 3 + 1] = by; pos[v * 3 + 2] = bz;
        sway[v] = 0; // no wind / parting either, so the collapsed triangles stay zero-area
      }
    }
    if (dirty) { posA.needsUpdate = true; swayA.needsUpdate = true; }
  }
  return stats;
}

// ---- material --------------------------------------------------------------------------------------
export function grassMaterial() {
  const sway = attribute<'float'>('sway', 'float');
  const p = positionLocal;
  const ph = p.x.mul(0.41).add(p.z.mul(0.27));
  const gust = sin(U.time.mul(0.6).add(p.x.mul(0.05)).add(p.z.mul(0.03))).mul(0.5).add(0.5);
  const w = sin(U.time.mul(2.1).add(ph)).mul(0.5).add(sin(U.time.mul(3.9).add(ph.mul(1.7))).mul(0.18)).add(0.3).mul(gust.mul(0.7).add(0.3));
  const wind = vec3(WIND_DIR.x, 0, WIND_DIR.z).mul(w.mul(sway).mul(U.wind).mul(0.3));
  // part around the boy
  const d = vec2(p.x.sub(U.player.x), p.z.sub(U.player.z));
  const dl = max(d.length(), float(0.001));
  const push = smoothstep(0.75, 0.15, dl).mul(smoothstep(1.2, 0.0, p.y.sub(U.player.y).abs()));
  const part = vec3(d.x.div(dl), float(-0.35), d.y.div(dl)).mul(push.mul(sway).mul(1.6));
  const m = mat({ flat: false, grain: 0, side: 'double', positionNode: p.add(wind).add(part) as Node<'vec3'> });
  // blades shade like the ground under them, never dark on the back face
  m.normalNode = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz;
  const F = fields(positionWorld.xz);
  m.maskNode = rimKeep(F.A.a, positionWorld.xz);
  return m;
}
