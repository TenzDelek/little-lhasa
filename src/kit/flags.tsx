// Prayer flags: lungta strings (horizontal lines of small square flags, blue-white-red-green-yellow,
// sagging, fluttering in the wind) and darchor (tall vertical pole flags). Instanced, a few meshes per area.
//
// API CONTRACT — other modules code against these components. Keep props stable; only add optional ones.
//   <PrayerFlags lines={[{ a: [0, 5, 0], b: [8, 4.6, 3] }]} />
//   <Darchor poles={[{ x: 3, z: -2, h: 6 }]} />
//   <PrayerFlags lines={[...flagChain([roofA, poleTop, roofB], { age: 0.4 }), ...flagFan(top, 12, 6)]} />
//   (flagChain / flagFan live in ./street so this file only exports components + types.)
// Put every line of an area in ONE <PrayerFlags> (a handful of draw calls however many flags).
//
// How it works
// - The flags of one <PrayerFlags> are InstancedMeshes, one per chunk of the area (CHUNK_EXT below), so
//   the camera and the shadow pass cull the far chunks. Each flag is
//   a 2x3-subdivided unit plane hanging down from its top edge. The instance matrix places the flag's top
//   edge on the string (following the string's slope); per-instance attributes carry the hang direction,
//   the downwind normal and a phase. A TSL positionNode swings each flag about the string (the swing grows
//   with distance from the string), adds a cloth ripple and a travelling wave along the line, driven by
//   U.time, U.wind and WIND_DIR. Shadows follow the motion.
// - The colorNode prints a 1-px wind-horse (lungta) block on a 5x5 cell grid; aged flags are bleached on the
//   CPU (instance colour) and tattered ones get a ragged bottom edge (maskNode) and are shorter.
// - Strings are one merged Parts mesh per chunk of thin boxes along a parabolic catenary.
// - Darchor: pole + base + finial (Parts), the long vertical banners as a second InstancedMesh with their own
//   flap shader, and a few lungta strings radiating from the top to the ground (a nested <PrayerFlags>),
//   strung only where they cross no road or plaza below head height.
import { useEffect, useMemo } from 'react';
import {
  Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Vector3, type Mesh,
} from 'three';
import type { MeshLambertNodeMaterial } from 'three/webgpu';
import {
  abs, attribute, clamp as tclamp, cos, float, floor, fract, positionGeometry, positionLocal, select, sin, uv, vec2,
  vec3, vec4,
} from 'three/tsl';
import { Parts, type V3 } from '../core/geom';
import { mat, partsMaterial } from '../core/materials';
import { PAL } from '../core/palette';
import { U, WIND_DIR } from '../core/uniforms';
import { hash12 } from '../core/tsl';
import { clamp, pick } from '../core/math';
import { collision } from '../core/collision';
import { groundY, plazaQuery, roadQuery } from '../world/terrain';
import { beam, sagAt, sagTangent, seedOf, srng } from './street';

export interface FlagLine {
  /** End points (world space). */
  a: V3;
  b: V3;
  /** Sag at mid-span (m), default 6% of the span. */
  sag?: number;
  /** Flag size (m), default 0.24. */
  size?: number;
  /** Spacing between flags (m), default 0.3. */
  spacing?: number;
  /** Fade / weather: 0 = brand new, 1 = sun-bleached tatters. */
  age?: number;
  seed?: number;
}

export interface DarchorPole {
  x: number;
  z: number;
  /** Height above ground (m), default 6. */
  h?: number;
  /** Base y; default groundY. */
  y?: number;
  /** Colour of the long vertical banner (default lungta cycle by seed). */
  color?: number;
  /** Directions (radians, 0 = +x, π/2 = +z) the ground strings may take, default all round. */
  arc?: [number, number];
  seed?: number;
}

const STRING_COL = 0x3a332c;
const PALE = new Color().setHex(0xd8d3c4); // linear, bleached cotton
const _c = new Color();

// ---- materials (module singletons: one shader for every flag in town) ------------------------------
let flagMat: MeshLambertNodeMaterial | null = null;
function flagMaterial() {
  if (flagMat) return flagMat;
  const fH = attribute<'vec4'>('fH', 'vec4'); // hang direction (world, unit), w = flag height (m)
  const fN = attribute<'vec4'>('fN', 'vec4'); // downwind normal of the flag plane (world, unit), w = |n · wind|
  const fM = attribute<'vec4'>('fM', 'vec4'); // x = arc length along the line (m), y = phase, z = tatter, w = seed

  // geometry: unit plane, x ∈ [-0.5, 0.5], y ∈ [-1, 0] (0 = the string)
  const rel = tclamp(positionGeometry.y.negate(), 0, 1);
  const d = rel.mul(fH.w);
  const ph = U.time.mul(4.6).sub(fM.x.mul(1.25)).add(fM.y);
  const gust = sin(U.time.mul(0.55).add(fM.x.mul(0.045)).add(fM.y.mul(0.2))).mul(0.28).add(0.8);
  const w = U.wind.mul(gust);
  // swing angle about the string: mean lift (more when the wind blows across the line) + travelling flap
  const th = w.mul(fN.w.mul(0.65).add(0.18).add(sin(ph).mul(0.3)).add(sin(ph.mul(2.3).add(1.7)).mul(0.09)));
  // cloth ripple across the flag, growing toward the free edge
  const ripple = sin(ph.mul(1.6).add(positionGeometry.x.mul(5.5)).add(rel.mul(3.0))).mul(0.2).mul(rel).mul(fH.w).mul(w);
  const disp = fH.xyz.mul(cos(th).sub(1).mul(d)).add(fN.xyz.mul(sin(th).mul(d).add(ripple)));

  const m = mat({ side: 'double', grain: 0, vertexColors: false, positionNode: positionLocal.add(disp) });

  // print: 5x5 cells ≈ one art pixel each. Wind horse in the middle, guardian animals in the corners.
  const cell = floor(tclamp(uv(), 0, 0.999).mul(5));
  const cx = cell.x, cy = cell.y; // cy = 0 at the bottom edge
  const horse = cy.equal(2).and(cx.greaterThan(0.5)).and(cx.lessThan(3.5))
    .or(cy.equal(1).and(cx.equal(1).or(cx.equal(3))))
    .or(cy.equal(3).and(cx.equal(3)));
  const corner = cx.equal(0).or(cx.equal(4)).and(cy.equal(0).or(cy.equal(4)));
  const textRow = cy.equal(4).and(cx.greaterThan(0.5)).and(cx.lessThan(3.5)).and(hash12(cell.add(fM.w)).greaterThan(0.4));
  const ink = select(horse, float(0.66), select(corner.or(textRow), float(0.82), float(1)));
  const grain = hash12(cell.add(vec2(fM.w.mul(3.1), fM.w.mul(1.7)))).sub(0.5).mul(0.1).add(1);
  m.colorNode = vec4(vec3(ink.mul(grain)), 1);
  // tattered flags: ragged bottom edge, one cell column at a time
  m.maskNode = uv().y.greaterThanEqual(fM.z.mul(hash12(vec2(floor(uv().x.mul(5)), fM.w.mul(7.7)))));
  flagMat = m;
  return m;
}

let bannerMat: MeshLambertNodeMaterial | null = null;
function bannerMaterial() {
  if (bannerMat) return bannerMat;
  const bM = attribute<'vec4'>('bM', 'vec4'); // x = phase, y = width (m), z = length (m), w = seed
  const bN = attribute<'vec4'>('bN', 'vec4'); // xyz = flap normal (world), w = 0
  const bX = attribute<'vec4'>('bX', 'vec4'); // xyz = downwind (world, along the banner width), w = 0
  const u = positionGeometry.x; // 0 at the pole → 1 at the free edge
  const v = positionGeometry.y; // 0 bottom → 1 top
  const xm = u.mul(bM.y), ym = v.mul(bM.z);
  const w = U.wind.mul(sin(U.time.mul(0.5).add(bM.x)).mul(0.25).add(0.85));
  const ph = U.time.mul(3.4).sub(xm.mul(2.6)).add(ym.mul(0.7)).add(bM.x);
  const amp = xm.mul(0.42).mul(w);
  const flap = sin(ph).mul(amp).add(sin(ph.mul(2.2).add(1.3)).mul(amp).mul(0.25));
  const droop = xm.mul(0.35).mul(float(1.25).sub(w.mul(0.75)).max(0.05));
  const disp = bN.xyz.mul(flap).sub(bX.xyz.mul(abs(flap).mul(0.45))).add(vec3(0, droop.negate(), 0));
  const m = mat({ side: 'double', grain: 0, vertexColors: false, positionNode: positionLocal.add(disp) });

  // print: rows of 1-px mantra text, a darker hem along the pole, plain margins
  const px = floor(xm.div(0.045)), py = floor(ym.div(0.045));
  const inText = u.greaterThan(0.16).and(u.lessThan(0.86)).and(v.greaterThan(0.04)).and(v.lessThan(0.94));
  const textRow = fract(py.mul(0.5)).lessThan(0.25); // every other pixel row
  const word = hash12(vec2(floor(px.div(3)).add(bM.w), py)).greaterThan(0.22);
  const hem = u.lessThan(0.07);
  const ink = select(inText.and(textRow).and(word), float(0.72), select(hem, float(0.8), float(1)));
  const grain = hash12(vec2(px.add(bM.w.mul(5.3)), py)).sub(0.5).mul(0.08).add(1);
  m.colorNode = vec4(vec3(ink.mul(grain)), 1);
  bannerMat = m;
  return m;
}

// ---- geometry ----------------------------------------------------------------------------------------
let flagGeo: PlaneGeometry | null = null;
function baseFlagGeometry() {
  if (!flagGeo) {
    flagGeo = new PlaneGeometry(1, 1, 2, 3);
    flagGeo.translate(0, -0.5, 0); // top edge on the string
  }
  return flagGeo;
}
let bannerGeo: PlaneGeometry | null = null;
function baseBannerGeometry() {
  if (!bannerGeo) {
    bannerGeo = new PlaneGeometry(1, 1, 3, 16);
    bannerGeo.translate(0.5, 0.5, 0); // x 0..1 from the pole, y 0..1 bottom to top
  }
  return bannerGeo;
}

const _p = new Vector3(), _t = new Vector3(), _h = new Vector3(), _up = new Vector3(), _z = new Vector3();
const _n = new Vector3(), _tx = new Vector3(), _uy = new Vector3(), _m = new Matrix4(), _q = new Vector3();
const WIND_H = new Vector3(WIND_DIR.x, 0, WIND_DIR.z).normalize();

interface FlagBuild { flags: InstancedMesh[]; strings: Mesh[] }

// Dispose GPU resources when a component really unmounts. React StrictMode runs effect cleanups once on a
// simulated unmount and immediately re-mounts; deferring by a tick lets the re-mount cancel the disposal.
const pendingDispose = new WeakMap<object, ReturnType<typeof setTimeout>>();
function useDisposeOnUnmount(obj: object, dispose: () => void) {
  useEffect(() => {
    const t = pendingDispose.get(obj);
    if (t !== undefined) { clearTimeout(t); pendingDispose.delete(obj); }
    return () => { pendingDispose.set(obj, setTimeout(() => { pendingDispose.delete(obj); dispose(); }, 0)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj]);
}

// Chunking: the lines of one <PrayerFlags> are split into chunks at most CHUNK_EXT m across (xz), each with its
// own flags InstancedMesh and strings mesh and so its own bounding sphere: the camera and the sun's shadow pass
// skip the chunks out of view instead of drawing every flag in the area. Lines are never cut (a line's flags
// and string share a chunk), and a group of under 2 x CHUNK_MIN flags is not split further (a draw call is
// worth more than a few hundred flags). Splits fall at the flag-weighted median of the line midpoints along
// the longer side, so chunks stay balanced and the result depends only on the lines.
// Measured over the five main spots (shots/fix-flags/perf-*.txt): 56 m / 200 turns the town's 6 flag meshes
// into 12 and draws a third fewer flag + string triangles per frame for ~5 more draw calls per pass; 40 m / 120
// made 22 meshes and cost twice the draw calls for little more culling.
const CHUNK_EXT = 56;
const CHUNK_MIN = 200;
/** Darchor ground strings: no part of one lower than this above the ground (m) may hang over a road or plaza… */
const WALK_CLEAR = 2.2;
/** …including this far outside the road or plaza edge (m). */
const WALK_MARGIN = 0.3;
/** A string that would hang over a walkway is turned by this (rad) and tried again, up to STRING_TRIES times. */
const STRING_TURN = 0.6;
const STRING_TRIES = 11;
/** Strings are polylines through the sag curve; fewest segments that keep within this of the curve (m). */
const STRING_TOL = 0.005;

type Prep = { line: FlagLine; sag: number; cum: Float32Array; N: number; L: number; ss: number[]; mx: number; mz: number };

/** Arc-length table and flag stations of one line (null when the line is too short to draw). */
function prepLine(line: FlagLine): Prep | null {
  const { a, b } = line;
  const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (span < 0.2) return null;
  const sag = line.sag ?? span * 0.06;
  const N = Math.max(8, Math.min(240, Math.ceil(span / 0.2)));
  const cum = new Float32Array(N + 1);
  sagAt(a, b, sag, 0, _p);
  for (let i = 1; i <= N; i++) {
    sagAt(a, b, sag, i / N, _q);
    cum[i] = cum[i - 1] + _q.distanceTo(_p);
    _p.copy(_q);
  }
  const L = cum[N];
  const spacing = Math.max(0.12, line.spacing ?? 0.3);
  const margin = Math.max(0.12, spacing * 0.5);
  const ss: number[] = [];
  if (L > margin * 2) {
    const K = Math.floor((L - 2 * margin) / spacing) + 1;
    const start = (L - (K - 1) * spacing) / 2;
    for (let k = 0; k < K; k++) ss.push(start + k * spacing);
  }
  return { line, sag, cum, N, L, ss, mx: (a[0] + b[0]) / 2, mz: (a[2] + b[2]) / 2 };
}

function chunkLines(preps: Prep[], out: Prep[][]): Prep[][] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
  for (const { line: { a, b }, ss } of preps) {
    x0 = Math.min(x0, a[0], b[0]); x1 = Math.max(x1, a[0], b[0]);
    z0 = Math.min(z0, a[2], b[2]); z1 = Math.max(z1, a[2], b[2]);
    n += ss.length;
  }
  if (preps.length < 2 || n < 2 * CHUNK_MIN || Math.max(x1 - x0, z1 - z0) <= CHUNK_EXT) {
    out.push(preps);
    return out;
  }
  const s = [...preps].sort(x1 - x0 >= z1 - z0 ? (p, q) => p.mx - q.mx : (p, q) => p.mz - q.mz);
  let acc = 0, cut = 0;
  while (cut < s.length - 1 && acc < n / 2) acc += s[cut++].ss.length;
  chunkLines(s.slice(0, cut), out);
  return chunkLines(s.slice(cut), out);
}

/** Every string of a chunk as one merged mesh: thin boxes along the sag curve plus a knot at each end. */
function buildStrings(chunk: readonly Prep[], shadows: boolean): Mesh | null {
  if (!chunk.length) return null;
  const parts = new Parts();
  for (const { line, sag } of chunk) {
    // a chord of the parabola over 1/n of the line strays sag / n² from it
    const n = Math.max(4, Math.min(48, Math.ceil(Math.sqrt(sag / STRING_TOL))));
    sagAt(line.a, line.b, sag, 0, _p);
    for (let i = 1; i <= n; i++) {
      sagAt(line.a, line.b, sag, i / n, _q);
      beam(parts, _p, _q, 0.04, STRING_COL);
      _p.copy(_q);
    }
    // knots at both ends
    parts.box(0.07, 0.07, 0.07, [line.a[0], line.a[1], line.a[2]], STRING_COL);
    parts.box(0.07, 0.07, 0.07, [line.b[0], line.b[1], line.b[2]], STRING_COL);
  }
  const strings = parts.toMesh(partsMaterial(), shadows);
  strings.name = 'lungta-strings';
  return strings;
}

/** Every flag of a chunk as one InstancedMesh (null when the chunk has none). */
function buildCloth(chunk: readonly Prep[], shadows: boolean): InstancedMesh | null {
  let total = 0;
  for (const { ss } of chunk) total += ss.length;
  if (!total) return null;
  const geo = baseFlagGeometry().clone();
  const fH = new Float32Array(total * 4), fN = new Float32Array(total * 4), fM = new Float32Array(total * 4);
  const mesh = new InstancedMesh(geo, flagMaterial(), total);
  let idx = 0;
  for (const { line, sag, cum, N, ss } of chunk) {
    const { a, b } = line;
    const r = srng(line.seed ?? seedOf(a[0] * 3.1 + b[2], a[2] * 1.7 + b[0] + a[1]));
    const size = line.size ?? 0.24;
    const age = clamp(line.age ?? 0, 0, 1);
    const sOff = r() * 40;
    let j = 0;
    for (let k = 0; k < ss.length; k++) {
      const s = ss[k];
      while (j < N - 1 && cum[j + 1] < s) j++;
      const t = (j + (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])) / N;
      sagAt(a, b, sag, t, _p);
      sagTangent(a, b, sag, t, _t);
      // hang direction: gravity with the along-string part removed
      _h.set(0, -1, 0).addScaledVector(_t, _t.y);
      if (_h.lengthSq() < 1e-4) _h.set(1, 0, 0).addScaledVector(_t, -_t.x);
      _h.normalize();
      _up.copy(_h).negate();
      _z.crossVectors(_t, _up).normalize();
      // slight in-plane tilt
      const tilt = (r() - 0.5) * 0.14, ct = Math.cos(tilt), st = Math.sin(tilt);
      _tx.copy(_t).multiplyScalar(ct).addScaledVector(_up, st);
      _uy.copy(_up).multiplyScalar(ct).addScaledVector(_t, -st);
      // size, wear
      let fw = size * (0.9 + r() * 0.16), fh = size * (0.95 + r() * 0.17);
      let tatter = age > 0.35 ? r() * 0.25 * age : 0;
      if (r() < age * 0.6) { fh *= 0.5 + r() * 0.35; tatter = 0.3 + r() * 0.4; fw *= 0.92; }
      _m.makeBasis(_q.copy(_tx).multiplyScalar(fw), _uy.clone().multiplyScalar(fh), _z);
      _m.setPosition(_p.x, _p.y - 0.012, _p.z);
      mesh.setMatrixAt(idx, _m);
      // colour: strict lungta order from end a, bleached with age
      _c.setHex(PAL.lungta[k % 5]);
      const bleach = age * (0.45 + 0.55 * r());
      _c.lerp(PALE, bleach * 0.62).multiplyScalar(0.9 + r() * 0.14);
      mesh.setColorAt(idx, _c);
      // downwind normal (horizontal) and how square-on the wind hits the line
      _n.copy(_z); _n.y = 0;
      if (_n.lengthSq() < 1e-4) _n.set(1, 0, 0);
      _n.normalize();
      const across = _n.dot(WIND_H);
      if (across < 0) _n.negate();
      const hv = _uy.clone().negate();
      fH.set([hv.x, hv.y, hv.z, fh], idx * 4);
      fN.set([_n.x, _n.y, _n.z, Math.abs(across)], idx * 4);
      fM.set([s + sOff, (r() - 0.5) * 1.1, tatter, Math.floor(r() * 97)], idx * 4);
      idx++;
    }
  }
  geo.setAttribute('fH', new InstancedBufferAttribute(fH, 4));
  geo.setAttribute('fN', new InstancedBufferAttribute(fN, 4));
  geo.setAttribute('fM', new InstancedBufferAttribute(fM, 4));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.6; // flutter reaches beyond the rest pose
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  mesh.name = 'lungta-flags';
  return mesh;
}

/** Chunk the lines; per chunk, its flags as one InstancedMesh and its strings as one merged mesh. */
function buildFlags(lines: readonly FlagLine[], withStrings: boolean, shadows: boolean): FlagBuild {
  const preps: Prep[] = [];
  for (const line of lines) {
    const p = prepLine(line);
    if (p) preps.push(p);
  }
  const out: FlagBuild = { flags: [], strings: [] };
  if (!preps.length) return out;
  for (const chunk of chunkLines(preps, [])) {
    const cloth = buildCloth(chunk, shadows);
    if (cloth) out.flags.push(cloth);
    const str = withStrings ? buildStrings(chunk, shadows) : null;
    if (str) out.strings.push(str);
  }
  return out;
}

/** Lungta strings. The flags of all lines are InstancedMeshes and the strings merged meshes, one of each per
 *  chunk of the area (see CHUNK_EXT), so a whole area costs a handful of draw calls and culls by chunk. */
export function PrayerFlags(props: {
  lines: FlagLine[];
  /** Draw the strings (default true). */
  strings?: boolean;
  /** Cast shadows (default true — flags throw fun moving shadows). */
  castShadow?: boolean;
}) {
  const { lines, strings = true, castShadow = true } = props;
  const key = useMemo(() => JSON.stringify(lines), [lines]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => buildFlags(lines, strings, castShadow), [key, strings, castShadow]);
  useDisposeOnUnmount(built, () => {
    for (const m of built.flags) { m.geometry.dispose(); m.dispose(); }
    for (const m of built.strings) m.geometry.dispose();
  });
  return (
    <>
      {built.flags.map((m) => <primitive key={m.uuid} object={m} />)}
      {built.strings.map((m) => <primitive key={m.uuid} object={m} />)}
    </>
  );
}

// ---- darchor -----------------------------------------------------------------------------------------
interface DarchorBuild { pole: Mesh; banners: InstancedMesh | null; lines: FlagLine[]; colliders: Parameters<typeof collision.addCircle>[0][] }

/** Would any point of the line lower than WALK_CLEAR above the ground hang over a road or plaza? */
function overWalkway(a: V3, b: V3, sag: number) {
  for (let i = 0; i <= 12; i++) {
    sagAt(a, b, sag, i / 12, _p);
    if (_p.y - groundY(_p.x, _p.z) >= WALK_CLEAR) continue;
    if (roadQuery(_p.x, _p.z).edge < WALK_MARGIN || plazaQuery(_p.x, _p.z).edge < WALK_MARGIN) return true;
  }
  return false;
}

function buildDarchor(poles: readonly DarchorPole[], strings: number, shadows: boolean): DarchorBuild {
  const parts = new Parts();
  const lines: FlagLine[] = [];
  const colliders: DarchorBuild['colliders'] = [];
  const n = poles.length;
  const geo = baseBannerGeometry().clone();
  const banners = n ? new InstancedMesh(geo, bannerMaterial(), n) : null;
  const bM = new Float32Array(n * 4), bN = new Float32Array(n * 4), bX = new Float32Array(n * 4);
  const X = new Vector3(), Y = new Vector3(0, 1, 0), Z = new Vector3();

  poles.forEach((pole, i) => {
    const r = srng(pole.seed ?? seedOf(pole.x, pole.z));
    const H = pole.h ?? 6;
    const y = pole.y ?? groundY(pole.x, pole.z);
    const { x, z } = pole;
    const woodCol = pick(r, [PAL.barkLight, 0x8a7a62, PAL.bark, 0x7a6a52]);
    const rBot = 0.085 * Math.min(1.4, Math.max(0.8, H / 6)), rTop = rBot * 0.6;

    // base: a cairn of stones or a whitewashed plinth
    let baseTop = y;
    if (r() < 0.5) {
      for (let s = 0; s < 9; s++) {
        const a = (s / 9) * Math.PI * 2 + r() * 0.5, d = 0.18 + r() * 0.2, sz = 0.16 + r() * 0.14;
        parts.box(sz, sz * 0.7, sz * 0.9, [x + Math.cos(a) * d, y + sz * 0.3, z + Math.sin(a) * d], pick(r, [PAL.rock, PAL.rockDark, PAL.slateLight, PAL.templeWhite]), { rot: [r() * 0.4, r() * 3, r() * 0.4] });
      }
      parts.box(0.3, 0.22, 0.3, [x, y + 0.22, z], PAL.rock, { rot: [0.2, r() * 3, 0.1] });
      baseTop = y + 0.3;
      colliders.push({ x, z, r: 0.42, y0: y - 0.2, y1: y + 0.32, tag: 'darchor-base' });
    } else {
      parts.box(0.8, 0.3, 0.8, [x, y + 0.08, z], PAL.templeWhite);
      parts.box(0.56, 0.2, 0.56, [x, y + 0.33, z], PAL.templeWhite);
      parts.box(0.84, 0.06, 0.84, [x, y - 0.05, z], PAL.concreteDark);
      parts.box(0.58, 0.03, 0.58, [x, y + 0.44, z], PAL.templeOchre); // ochre rim
      baseTop = y + 0.43;
      colliders.push({ x, z, r: 0.42, y0: y - 0.2, y1: y + 0.43, tag: 'darchor-base' });
    }
    parts.cyl(rTop, rBot, H - (baseTop - y) + 0.1, [x, baseTop - 0.1, z], woodCol, 7);
    colliders.push({ x, z, r: rBot + 0.04, y0: y, y1: y + H, tag: 'darchor' });
    // khata (white silk scarf) tied round the pole, tails hanging
    const ky = y + 1.5 + r() * 0.4;
    parts.cyl(rBot + 0.015, rBot + 0.015, 0.1, [x, ky, z], 0xf2efe6, 7);
    for (let t = 0; t < 2; t++) {
      const a = r() * Math.PI * 2;
      parts.box(0.07, 0.42 + r() * 0.2, 0.015, [x + Math.cos(a) * (rBot + 0.02), ky - 0.22, z + Math.sin(a) * (rBot + 0.02)], 0xeeeae0, { rot: [0.08, -a + Math.PI / 2, 0.05] });
    }
    // finial: gilded collar, little umbrella and a spear tip
    const top = y + H;
    parts.cyl(rTop + 0.03, rTop + 0.03, 0.08, [x, top - 0.02, z], PAL.gold, 8);
    parts.cyl(0.02, 0.17, 0.1, [x, top + 0.06, z], PAL.templeRed, 8);
    parts.cyl(0.03, 0.03, 0.14, [x, top + 0.14, z], PAL.goldDeep, 6);
    parts.cone(0.05, 0.22, [x, top + 0.28, z], PAL.gold, 6);

    // banner: hangs along the pole, streams downwind
    const len = Math.min(H * 0.6, H - 1.6), wdt = 0.42 + r() * 0.16;
    const b0 = top - 0.32 - len;
    const yawJ = (r() - 0.5) * 0.5;
    X.copy(WIND_H).applyAxisAngle(Y, yawJ).normalize();
    Z.crossVectors(X, Y).normalize();
    _m.makeBasis(_q.copy(X).multiplyScalar(wdt), _n.set(0, len, 0), Z);
    _m.setPosition(x + X.x * rTop, b0, z + X.z * rTop);
    banners!.setMatrixAt(i, _m);
    _c.setHex(pole.color ?? PAL.lungta[(pole.seed ?? i) % 5]).multiplyScalar(0.94 + r() * 0.08);
    banners!.setColorAt(i, _c);
    bM.set([r() * 6.28, wdt, len, Math.floor(r() * 97)], i * 4);
    bN.set([Z.x, Z.y, Z.z, 0], i * 4);
    bX.set([X.x, X.y, X.z, 0], i * 4);
    // ties where the banner meets the pole
    for (let k = 0; k <= 3; k++) parts.box(rTop * 2 + 0.05, 0.04, rTop * 2 + 0.05, [x, b0 + (len * k) / 3, z], 0x2b2622);

    // lungta strings radiating from the top down to stones on the ground, spread over the pole's arc (default
    // all round). A string that would hang over a road or plaza below head height, or run within `apart` of
    // one already strung, is turned by STRING_TURN (alternating sides, staying inside the arc) and tried
    // again, and dropped when no direction is clear. Every random draw comes before the retries, so a pole's
    // strings depend on its seed alone.
    const [arc0, arc1] = pole.arc ?? [0, Math.PI * 2];
    const full = arc1 - arc0 >= Math.PI * 2 - 1e-3;
    const a0 = full ? r() * Math.PI * 2 : arc0;
    const strung: number[] = [];
    const apart = Math.min(0.35, Math.PI / (2 * strings));
    const near = (ak: number) => strung.some((p) => Math.abs(((ak - p + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) < apart);
    for (let s = 0; s < strings; s++) {
      const spread = full ? s / strings : strings === 1 ? 0.5 : s / (strings - 1);
      let a = a0 + (arc1 - arc0) * spread + (r() - 0.5) * (full ? 0.5 : 0.25);
      if (!full) a = clamp(a, arc0, arc1);
      const R = H * (0.7 + r() * 0.25);
      const age = 0.15 + r() * 0.5, seed = Math.floor(r() * 1e6), rot = r() * 3;
      for (let k = 0; k < STRING_TRIES; k++) {
        const ak = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * STRING_TURN;
        if ((!full && (ak < arc0 || ak > arc1)) || near(ak)) continue;
        const ax = x + Math.cos(ak) * R, az = z + Math.sin(ak) * R;
        const gy = groundY(ax, az);
        const A: V3 = [x + Math.cos(ak) * rTop, top - 0.45, z + Math.sin(ak) * rTop];
        const B: V3 = [ax, gy + 0.18, az];
        const sag = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * 0.04;
        if (overWalkway(A, B, sag)) continue;
        lines.push({ a: A, b: B, sag, age, seed });
        parts.box(0.22, 0.16, 0.2, [ax, gy + 0.06, az], PAL.rockDark, { rot: [0, rot, 0] });
        strung.push(ak);
        break;
      }
    }
  });

  if (banners) {
    geo.setAttribute('bM', new InstancedBufferAttribute(bM, 4));
    geo.setAttribute('bN', new InstancedBufferAttribute(bN, 4));
    geo.setAttribute('bX', new InstancedBufferAttribute(bX, 4));
    banners.instanceMatrix.needsUpdate = true;
    if (banners.instanceColor) banners.instanceColor.needsUpdate = true;
    banners.computeBoundingSphere();
    if (banners.boundingSphere) banners.boundingSphere.radius += 0.8;
    banners.castShadow = shadows;
    banners.receiveShadow = true;
    banners.name = 'darchor-banners';
  }
  const pole = parts.toMesh(partsMaterial({ occlude: true }), shadows);
  pole.name = 'darchor-pole';
  return { pole, banners, lines, colliders };
}

/**
 * Darchor: tall wooden poles, each with a long vertical banner streaming downwind, a gilded finial, a
 * khata tied round it, a stone cairn or whitewashed plinth at its foot, and `strings` lungta lines
 * radiating from the top down to stones on the ground, kept off roads and plazas (a string that would hang
 * over one below head height is turned, or dropped; `arc` on the pole limits the directions). Registers its
 * own colliders (pole + base).
 */
export function Darchor(props: {
  poles: DarchorPole[];
  /** Lungta strings radiating from each pole top to the ground (default 3; 0 for none). */
  strings?: number;
  /** Register colliders for the poles and their bases (default true). */
  collide?: boolean;
  castShadow?: boolean;
}) {
  const { poles, strings = 3, collide = true, castShadow = true } = props;
  const key = useMemo(() => JSON.stringify(poles), [poles]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => buildDarchor(poles, strings, castShadow), [key, strings, castShadow]);
  useEffect(() => {
    if (!collide) return;
    const offs = built.colliders.map((c) => collision.addCircle(c));
    return () => offs.forEach((off) => off());
  }, [built, collide]);
  useDisposeOnUnmount(built, () => {
    built.pole.geometry.dispose();
    built.banners?.geometry.dispose();
    built.banners?.dispose();
  });
  return (
    <>
      <primitive object={built.pole} />
      {built.banners && <primitive object={built.banners} />}
      {built.lines.length > 0 && <PrayerFlags lines={built.lines} castShadow={castShadow} />}
    </>
  );
}
