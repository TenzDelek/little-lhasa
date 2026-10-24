// Chase-camera backdrop: the land beyond the diorama, out to ~900 m. One low-poly heightfield, flat-shaded
// with per-face colours:
//   - forested slopes around the town (deodar dark green, clearings), rising north into the Triund ridge,
//   - the Dhauladhar range to the NORTH: a jagged wall of rock and snow 400–650 m away, gullies streaked
//     with rock, curving south at both ends so it frames the chase views east and west,
//   - the Kangra valley to the SOUTH: the land drops away to a hazy valley floor of fields with low
//     Shivalik hills on the horizon.
// Distance + valley haze lerp toward the sky's horizon colour in the material. Hidden in the iso camera.
import { BufferGeometry, Color, Float32BufferAttribute, Mesh } from 'three';
import type { Node } from 'three/webgpu';
import { float, positionWorld, smoothstep, vec3, vec4, cameraPosition, vec2 } from 'three/tsl';
import { vnoise12 } from '../../core/tsl';
import { WORLD_BOUNDS } from '../layout';
import { groundY, worldMask } from '../terrain';
import { sampleFields, type FieldSample } from './fields';
import { clamp, fbm2, hash2, lerp, rng, smooth, vnoise2 } from '../../core/math';
import { mat } from '../../core/materials';
import { PAL } from '../../core/palette';
import { horizon } from './shade';

const B = WORLD_BOUNDS;

/** Ridge line of the snow range (z of the crest for a given x): ~640 m north, curving south at both ends. */
const crestZ = (x: number) => -640 + (x / 820) ** 2 * 260 + Math.sin(x * 0.006) * 25;
/** Triund: the forested ridge in front of the snow range. */
const triundZ = (x: number) => -330 + Math.sin(x * 0.009 + 1.2) * 30 + (x / 900) ** 2 * 140;

function ridged(x: number, z: number, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(vnoise2(x * f, z * f) * 2 - 1);
    s += a * v * v; n += a; a *= 0.5; f *= 2.1;
  }
  return s / n;
}

/**
 * Height of the outer world. Blends from the town's groundY at the bounds into the macro landscape.
 * Heights are tuned for the chase camera (pitched ~17° down): from the town the Triund ridge sits ~4° above
 * the horizon and the snow peaks ~8°, so both stay in frame.
 */
export function landHeight(x: number, z: number): number {
  const ox = Math.max(B.x0 - x, 0, x - B.x1), oz = Math.max(B.z0 - z, 0, z - B.z1);
  const d = Math.hypot(ox, oz);
  const edge = groundY(clamp(x, B.x0, B.x1), clamp(z, B.z0, B.z1));
  // the town's southward tilt, flattening off to a slow climb north of the bounds
  const base = (z > -110 ? -0.085 * Math.min(z, 190) : 9.35 + (-110 - z) * 0.028) + 0.02 * x;
  let m = base + (fbm2(x * 0.011 + 5, z * 0.011 - 2, 3) - 0.5) * 22;
  // fall to the Kangra valley in the south and south-west
  if (z > 190) m -= Math.min(140, ((z - 190) / 210) ** 1.3 * 100);
  if (x < -120) m -= ((-120 - x) / 380) ** 1.3 * 40 * smooth(-250, 100, z);
  // Triund ridge (forested): kept low so the snow range rises clear above it in the chase camera
  const tz = triundZ(x);
  m += Math.exp(-(((z - tz) / 70) ** 2)) * (3 + (fbm2(x * 0.01, 3.3, 2) - 0.5) * 8);
  // Dhauladhar: a steep wall rising from behind the ridge (narrow southern flank, so its foot is hidden)
  const cz = crestZ(x);
  const prof = Math.exp(-(((z - cz) / (z > cz ? 95 : 118)) ** 2));
  const hr = 41 + (fbm2(x * 0.0035 + 9, 1.7, 3) - 0.5) * 34;
  const jag = ridged(x * 0.012 + 3, z * 0.012 - 8, 4);
  m += prof * (hr + (jag - 0.45) * 44);
  // far Shivalik hills on the southern horizon
  m += Math.exp(-(((z - 770) / 95) ** 2)) * (105 + fbm2(x * 0.006, 8.1, 2) * 50);
  return lerp(edge, m, smooth(0, 110, d));
}

// ---- grid ----------------------------------------------------------------------------------------------
function axis(lo: number, a: number, b: number, hi: number, near: number, far: number): number[] {
  // fine spacing inside [a, b], growing to `far` toward lo / hi
  const out: number[] = [];
  const step = (v: number) => {
    const o = v < a ? a - v : v > b ? v - b : 0;
    return Math.min(far, near + o * 0.07);
  };
  let v = a;
  const left: number[] = [];
  while (v > lo) { v -= step(v); left.push(Math.max(v, lo)); }
  out.push(...left.reverse());
  for (v = a; v < b; v += near) out.push(v);
  out.push(b);
  v = b;
  while (v < hi) { v += step(v); out.push(Math.min(v, hi)); }
  return out;
}

const _c = new Color();
function faceColor(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number): number {
  // height above the local valley floor of the range (the base keeps climbing north)
  const north = cz < -380 ? 1 : 0;
  const snowLine = 54 + (fbm2(cx * 0.012, cz * 0.012, 2) - 0.5) * 20;
  const gully = hash2(Math.floor(cx / 11), 7.3) > 0.66 && ny < 0.9;
  const shade = nx * 0.4 + nz * 0.55 < -0.12;
  if (north && cy > snowLine && ny > 0.38 && !gully) return shade ? PAL.snowShade : PAL.snow;
  if (north && cy > snowLine - 9 && ny > 0.6) return shade ? 0xc9d3e2 : 0xdfe5ee;
  if (north && cy > 40) {
    const k = hash2(Math.floor(cx / 8), Math.floor(cz / 8));
    return shade || k > 0.7 ? PAL.mountainDark : k > 0.35 ? PAL.mountain : 0x828b96;
  }
  if (north && cy > 33) return ny > 0.8 ? 0x5d6b45 : 0x55606a; // alpine meadow / scree
  if (cy < -45) {
    // valley floor: terraced fields and the odd village
    const k = hash2(Math.floor(cx / 22), Math.floor(cz / 18));
    return k > 0.93 ? 0xb5aa92 : k > 0.6 ? 0x8a9a5a : k > 0.3 ? 0x6f8a4a : 0x7d7a50;
  }
  const n = vnoise2(cx * 0.03 + 4, cz * 0.03 - 9);
  const k = hash2(Math.floor(cx / 7), Math.floor(cz / 7));
  if (n > 0.72 && ny > 0.88 && cz > -200) return k > 0.5 ? 0x52703a : 0x5f7d40; // clearings
  // Triund's grassy lower slopes in the view north of the viewpoint (no trees are planted there either)
  const wedge = 40 + (-95 - cz) * 0.8 + (vnoise2(cx * 0.05 + 1.7, cz * 0.05) - 0.5) * 36;
  if (cz < -100 && cz > -250 + (n - 0.5) * 60 && Math.abs(cx - 28) < wedge && ny > 0.75) return k > 0.6 ? 0x5a7a3c : k > 0.2 ? 0x4f6e36 : 0x46632f;
  return k > 0.6 ? PAL.deodarDark : k > 0.15 ? 0x2a4430 : 0x34503a;
}

export function buildBackdrop(): Mesh {
  const xs = axis(-980, B.x0 - 6, B.x1 + 6, 1020, 6, 26);
  const zs = axis(-760, B.z0 - 6, B.z1 + 6, 900, 6, 26);
  const H: number[][] = zs.map((z) => xs.map((x) => landHeight(x, z)));
  // vertices under the town: tuck below the terrain so the seam never shows sky
  const inside = (x: number, z: number) => x > B.x0 + 0.5 && x < B.x1 - 0.5 && z > B.z0 + 0.5 && z < B.z1 - 0.5;
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) if (inside(xs[i], zs[j])) H[j][i] = groundY(xs[i], zs[j]) - 0.5;
  const pos: number[] = [], col: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const hex = faceColor((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3, nx, ny, nz);
    _c.setHex(hex);
    pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) col.push(_c.r, _c.g, _c.b);
  };
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    // skip quads fully under the town (keep a 6 m overlap band at the bounds)
    if (x0 >= B.x0 + 6 && x1 <= B.x1 - 6 && z0 >= B.z0 + 6 && z1 <= B.z1 - 6) continue;
    const a = [x0, H[j][i], z0], b = [x1, H[j][i + 1], z0], c = [x0, H[j + 1][i], z1], d = [x1, H[j + 1][i + 1], z1];
    if ((i + j) & 1) { tri(a, c, b); tri(b, c, d); } else { tri(a, c, d); tri(a, d, b); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new Mesh(g, backdropMaterial());
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'ground:backdrop';
  return mesh;
}

let MAT: ReturnType<typeof makeMaterial> | null = null;
function backdropMaterial() { return (MAT ??= makeMaterial()); }
function makeMaterial() {
  const m = mat({ flat: true, grain: 0, vertexColors: true, key: 'ground:backdrop' });
  const d = vec2(positionWorld.x.sub(cameraPosition.x), positionWorld.z.sub(cameraPosition.z)).length();
  const dist = smoothstep(60, 820, d).mul(0.86);
  const low = smoothstep(-30, -120, positionWorld.y).mul(0.35).mul(smoothstep(120, 380, d));
  // the snow range stands above the valley haze
  const high = smoothstep(30, 85, positionWorld.y).mul(0.45);
  const hz = dist.add(low).mul(float(1).sub(high)).min(0.93);
  // canopy texture on the forested slopes (fades out above the tree line)
  const forest = float(1).sub(smoothstep(28, 40, positionWorld.y));
  const canopy = vnoise12(positionWorld.xz.mul(0.22)).sub(0.5).mul(0.55).mul(forest).add(1);
  m.colorNode = vec4(vec3(float(1).sub(hz).mul(canopy)), 1);
  (m as unknown as { emissiveNode: Node }).emissiveNode = horizon().mul(hz);
  return m;
}

// ---- distant forest (chase camera only): low-poly deodars beyond the rim --------------------------------
function deodar(pos: number[], col: number[], x: number, y: number, z: number, h: number, hex: number, hexTop: number) {
  const tiers = 3;
  const r0 = h * 0.3;
  const yaw0 = (x * 13.7 + z * 7.1) % (Math.PI * 2);
  for (let t = 0; t < tiers; t++) {
    const yb = y + h * (0.18 + t * 0.25), yt = yb + h * 0.42;
    const r = r0 * (1 - t * 0.27);
    const c = t === tiers - 1 ? hexTop : hex;
    _c.setHex(c);
    for (let k = 0; k < 5; k++) {
      const a0 = yaw0 + (k / 5) * Math.PI * 2, a1 = yaw0 + ((k + 1) / 5) * Math.PI * 2;
      pos.push(x + Math.sin(a0) * r, yb, z + Math.cos(a0) * r, x + Math.sin(a1) * r, yb, z + Math.cos(a1) * r, x, yt, z);
      for (let q = 0; q < 3; q++) col.push(_c.r, _c.g, _c.b);
    }
  }
}

const _fs = {} as FieldSample;

export function buildBackdropTrees(): Mesh {
  const pos: number[] = [], col: number[] = [];
  const r = rng(9001);
  const STEP = 6.5;
  let n = 0;
  for (let z = -390; z < 420; z += STEP) for (let x = -380; x < 480; x += STEP) {
    const px = x + r() * STEP, pz = z + r() * STEP;
    // beyond the diorama rim (the hillside module plants the forest inside it); inside the bounds only where
    // the land is outside the diorama, off the painted road extensions and goat paths
    const ox = Math.max(B.x0 - px, 0, px - B.x1), oz = Math.max(B.z0 - pz, 0, pz - B.z1);
    const dOut = Math.hypot(ox, oz);
    if (dOut === 0) {
      if (worldMask(px, pz) > 0.12) continue;
      const f = sampleFields(px, pz, _fs);
      if (f.asphalt < 3 || f.path > 0.2) continue;
    } else if (dOut < vnoise2(px * 0.04 + 2, pz * 0.04 + 5) * 24) continue;
    // keep the view north from the viewpoint / Dharamkot Road open: Triund's grassy slopes
    if (pz < -95 && Math.abs(px - 28) < 40 + (-95 - pz) * 0.8) continue;
    if (pz < -200 && r() < 0.6) continue;
    // and the view south over the Kangra valley (the land drops away there)
    if (pz > B.z1 - 5 && Math.abs(px - 20) < 150 + (pz - B.z1) * 0.9) continue;
    // clustered stands, thinning with distance
    const stand = vnoise2(px * 0.025 + 7, pz * 0.025 - 3);
    if (stand < 0.38 + dOut * 0.0012) continue;
    if (r() > 0.72) continue;
    const y = landHeight(px, pz);
    if (y < -40 || y > 30) continue;
    const h = (dOut === 0 ? 6.5 : 8) + r() * 6 + Math.min(4, dOut * 0.02);
    const k = r();
    deodar(pos, col, px, y - 0.3, pz, h, k < 0.5 ? PAL.deodarDark : k < 0.85 ? PAL.deodar : 0x26402c, k < 0.5 ? PAL.deodar : PAL.deodarLight);
    n++;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new Mesh(g, backdropMaterial());
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'ground:backdrop-trees';
  mesh.userData.count = n;
  return mesh;
}
