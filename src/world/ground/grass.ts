// Grass, weeds, ferns and wildflowers (Gorshey-style blades). Placed on the CPU from the ground fields:
// none on streets, drains, frontage or footpaths; thick on road verges and in clearings; sparse ferns on the
// forest floor. Merged into one static mesh per 48 m tile (one draw call each, culled with the terrain).
// The shader sways the blades in the wind and parts them around the boy's feet, and dissolves them with the
// diorama rim exactly like the ground.
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Mesh, type Material } from 'three';
import type { Node } from 'three/webgpu';
import {
  attribute, cameraViewMatrix, float, max, positionLocal, positionWorld, sin, smoothstep, vec2, vec3, vec4,
} from 'three/tsl';
import { WORLD_BOUNDS } from '../layout';
import { groundY } from '../terrain';
import { mat } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';
import { PAL } from '../../core/palette';
import { rng, smooth, vnoise2 } from '../../core/math';
import { sampleFields, streetEdge, type FieldSample } from './fields';
import { fields, rimKeep } from './shade';
import { CHUNK } from './terrainMesh';

const B = WORLD_BOUNDS;
const COURT = [-13.5, 89.5, 30.5, 130.5] as const;

// ---- geometry writer ---------------------------------------------------------------------------------
class Writer {
  pos: number[] = []; col: number[] = []; sway: number[] = [];
  blades = 0;
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
  // temple court + its walls / walkway (temple builder's floors)
  if (x > COURT[0] && x < COURT[2] && z > COURT[1] && z < COURT[3]) return none;
  if (f.path > 0.4) return { ...none, p: 0.02 };
  const forest = Math.min(1, Math.max(0, (dS - 7 + (vnoise2(x * 0.075 + 3.1, z * 0.075 + 8.7) - 0.5) * 10) / 9));
  const verge = Math.max(0, 1 - Math.abs(dS - 1.7) / 1.3);
  const lush = lushAt(x, z) * (1 - forest * 0.8);
  let p = 0.05 + verge * 0.5 + lush * 0.9;
  p *= 1 - forest * 0.45;
  p *= Math.min(1, (f.mask - 0.18) * 3);
  return { p: Math.min(1, p), forest, verge, lush };
}

export interface GrassChunk { mesh: Mesh; cx: number; cz: number }

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
        if (d.forest > 0.5) {
          if (roll < 0.3) fern(W, r, px, y, pz, 0.32 + r() * 0.25);
          else tuft(W, r, px, y, pz, TONES.forest, 1);
        } else if (roll < 0.05 && !dry) flower(W, r, px, y, pz);
        else if (roll < 0.05 + d.verge * 0.08) weed(W, r, px, y, pz);
        else if (roll < 0.09 && d.forest > 0.2) fern(W, r, px, y, pz, 0.3 + r() * 0.2);
        else {
          const tone = dry ? TONES.dry : d.verge > 0.4 ? TONES.verge : r() < 0.5 ? TONES.lush : TONES.green;
          tuft(W, r, px, y, pz, tone, 1 + d.verge * 0.5 + d.lush * 0.5);
        }
      }
      const g = W.build();
      if (!g) continue;
      const mesh = new Mesh(g, material);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'ground:grass';
      chunks.push({ mesh, cx, cz });
      blades += W.blades;
    }
  }
  return { chunks, blades };
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
