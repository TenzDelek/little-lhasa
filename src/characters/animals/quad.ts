// Quadruped kit: every animal with legs (dogs, the puppy, cows, macaques, langurs) is ONE rigid-skinned,
// vertex-coloured mesh — one draw call — built from Parts boxes on a small skeleton, posed procedurally
// (gaits, sit / lie / curl / bow / leap / monkey postures, tail wag, chewing, breathing).
//
//   const q = buildDog({ coat: PAL.dogTan, seed: 3 });     // species.ts
//   group.add(q.root);                                      // owner places q.root (feet at y = 0)
//   animateQuad(q, { dt, time, speed, pose: 'sit', wag: 1 });
//
// Model space: metres, feet on y = 0, the animal faces +z, its LEFT is +x.
// Bones: hips (hind-leg root, pivot for sitting) → spine (front-leg root) → neck → head; tail chain off
// the hips; `barrel` is a leaf bone holding the torso so breathing can scale it without moving the legs.
import {
  Bone, Float32BufferAttribute, Group, Skeleton, SkinnedMesh, Sphere, Uint16BufferAttribute, Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Parts, type V3 } from '../../core/geom';
import { partsMaterial } from '../../core/materials';
import { clamp, damp, lerp, TAU } from '../../core/math';

export const QBONES = [
  'root', 'hips', 'barrel', 'tail0', 'tail1', 'tail2', 'tail3',
  'thighBL', 'shinBL', 'thighBR', 'shinBR',
  'spine', 'thighFL', 'shinFL', 'thighFR', 'shinFR',
  'neck', 'head', 'jaw', 'earL', 'earR',
] as const;
export type QBone = (typeof QBONES)[number];
const QPARENT: Record<QBone, QBone | null> = {
  root: null, hips: 'root', barrel: 'hips', tail0: 'hips', tail1: 'tail0', tail2: 'tail1', tail3: 'tail2',
  thighBL: 'hips', shinBL: 'thighBL', thighBR: 'hips', shinBR: 'thighBR',
  spine: 'hips', thighFL: 'spine', shinFL: 'thighFL', thighFR: 'spine', shinFR: 'thighFR',
  neck: 'spine', head: 'neck', jaw: 'head', earL: 'head', earR: 'head',
};
const QI = Object.fromEntries(QBONES.map((n, i) => [n, i])) as Record<QBone, number>;
const NB = QBONES.length;

export interface QDims {
  /** Hip joint → shoulder joint distance along z. */
  len: number;
  /** Standing hip / shoulder joint heights (= hind / front leg lengths). */
  hipY: number; shY: number;
  /** Barrel thickness (for lying / sitting heights). */
  bodyH: number;
  /** Metres per walk cycle. */
  stride: number;
  /** Gait change speeds (m/s). */
  trotAt: number; gallopAt: number;
  /** Primate: sits upright, arms instead of front legs. */
  monkey: boolean;
  /** How folded legs tuck when lying: dogs stretch the forelegs forward, cattle fold them under. */
  lie: 'sphinx' | 'tuck';
}

export type QPose = 'stand' | 'sit' | 'lie' | 'curl' | 'bow' | 'hunch';

export interface QuadRig {
  root: Group;
  mesh: SkinnedMesh;
  bones: Record<QBone, Bone>;
  dims: QDims;
  /** Rest rotations (rx, ry, rz per bone): tail curl, ear set, neck carriage. */
  rest: Float32Array;
  st: {
    phase: number; walk: number; gallop: number; off: Float32Array;
    pw: Record<Exclude<QPose, 'stand'>, number>; air: number; seed: number;
  };
}

/** Per-bone Parts plus joint positions; species builders fill these, then call assembleQuad(). */
export interface QuadParts { P: Record<QBone, Parts>; J: Record<QBone, V3> }

export function newQuadParts(J: Record<QBone, V3>): QuadParts {
  return { P: Object.fromEntries(QBONES.map((n) => [n, new Parts()])) as Record<QBone, Parts>, J };
}

let _mat: ReturnType<typeof partsMaterial> | null = null;
/** Shared material for every animal (flat Lambert + grain, like the people). */
export const animalMaterial = () => (_mat ??= partsMaterial({ grain: 0.05, grainScale: 24, key: 'animal' }));

export function assembleQuad(qp: QuadParts, dims: QDims, rest: Partial<Record<QBone, V3>>, seed: number, radius: number): QuadRig {
  const { P, J } = qp;
  const geos: BufferGeometry[] = [];
  for (const n of QBONES) {
    if (!P[n].size) continue;
    const g = P[n].merge();
    const cnt = g.attributes.position.count;
    const si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    for (let i = 0; i < cnt; i++) { si[i * 4] = QI[n]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
    geos.push(g);
  }
  const geo = mergeGeometries(geos, false)!;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const bones = {} as Record<QBone, Bone>;
  for (const n of QBONES) { const b = new Bone(); b.name = n; bones[n] = b; }
  for (const n of QBONES) {
    const p = QPARENT[n];
    const [x, y, z] = J[n];
    if (p) { const [px, py, pz] = J[p]; bones[n].position.set(x - px, y - py, z - pz); bones[p].add(bones[n]); }
    else bones[n].position.set(x, y, z);
  }
  const mesh = new SkinnedMesh(geo, animalMaterial());
  mesh.add(bones.root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(QBONES.map((n) => bones[n])));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // generous fixed bounds (poses never leave this sphere), so culling works without per-frame skinning maths
  mesh.boundingSphere = new Sphere(new Vector3(0, radius * 0.5, 0), radius);

  const root = new Group();
  root.add(mesh);
  const R = new Float32Array(NB * 3);
  for (const [k, v] of Object.entries(rest)) { const i = QI[k as QBone] * 3; R[i] = v![0]; R[i + 1] = v![1]; R[i + 2] = v![2]; }
  // start in the rest pose
  for (let i = 0; i < NB; i++) bones[QBONES[i]].rotation.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
  return {
    root, mesh, bones, dims, rest: R,
    st: {
      phase: (seed * 1.618) % TAU, walk: 0, gallop: 0, off: new Float32Array([0, 0.5, 0.25, 0.75]),
      pw: { sit: 0, lie: 0, curl: 0, bow: 0, hunch: 0 }, air: 0, seed: seed * 7.31,
    },
  };
}

// ---- animation -----------------------------------------------------------------------------------------
export interface QuadAnim {
  dt: number;
  time: number;
  /** Horizontal speed (m/s): drives the gait. */
  speed: number;
  /** Posture when slow (forced to 'stand' while moving). */
  pose?: QPose;
  /** Posture blend rate (1/s). Default 5; cows lying down use ~1.5. */
  poseRate?: number;
  /** Airborne (leap / hop): 0..1, with vertical velocity for the pitch. */
  air?: boolean;
  vy?: number;
  /** Head turn (radians, + = toward the animal's left) and pitch (+ = down). */
  lookYaw?: number;
  lookPitch?: number;
  /** Tail wag 0..1 (dogs), tail swish 0..1 (cows: slow flick). */
  wag?: number;
  swish?: number;
  /** Jaw open 0..1; chewing 0..1 (cud). */
  mouth?: number;
  chew?: number;
  /** Ear flick impulse −1..1 (decays in the owner). */
  ear?: number;
  /** Scratch 0..1 (dog: hind leg at the ear; monkey: hand at the head). */
  scratch?: number;
  /** Monkey grooming 0..1: both hands picking in front. */
  groom?: number;
  /** Nose to the ground 0..1 (sniff, peck at food). */
  sniff?: number;
  /** Sleeping: slow deep breaths, head heavy. */
  sleep?: boolean;
  /** Roll about the body's long axis (radians) — puppy rolling over. */
  roll?: number;
  /** Extra tail lift (radians, + = up). */
  tailLift?: number;
  /** Panting (after running): breath rate up, mouth a little open. */
  pant?: number;
  /** Bone smoothing rate (1/s). Default 14. */
  rate?: number;
}

const T = new Float32Array(NB * 3);
const GAIT = [
  [0, 0.5, 0.25, 0.75], // walk  (BL, BR, FL, FR): lateral sequence
  [0, 0.5, 0.5, 0],     // trot: diagonal pairs
  [0, 0.1, 0.55, 0.65], // gallop
];
const LEGS: [QBone, QBone][] = [['thighBL', 'shinBL'], ['thighBR', 'shinBR'], ['thighFL', 'shinFL'], ['thighFR', 'shinFR']];

const A = (b: QBone, x: number, y = 0, z = 0) => { const i = QI[b] * 3; T[i] += x; T[i + 1] += y; T[i + 2] += z; };
/** Lerp the current target toward an absolute rotation by k. */
const L = (k: number, b: QBone, x: number, y = 0, z = 0) => {
  const i = QI[b] * 3;
  T[i] = lerp(T[i], x, k); T[i + 1] = lerp(T[i + 1], y, k); T[i + 2] = lerp(T[i + 2], z, k);
};
const R = (q: QuadRig, b: QBone, c: 0 | 1 | 2) => q.rest[QI[b] * 3 + c];

export function animateQuad(q: QuadRig, a: QuadAnim) {
  const { bones, dims: d, st } = q;
  const dt = a.dt;
  if (dt <= 0) return;
  T.set(q.rest);
  const t = a.time + st.seed;
  let hy = 0, hz = 0;

  // ---- gait --------------------------------------------------------------------------------------------
  const speed = a.speed;
  st.walk = damp(st.walk, clamp(speed / (d.stride * 0.5)), 10, dt);
  const g = speed < d.trotAt ? 0 : speed < d.gallopAt ? 1 : 2;
  st.gallop = damp(st.gallop, g === 2 ? 1 : 0, 6, dt);
  for (let i = 0; i < 4; i++) st.off[i] = damp(st.off[i], GAIT[g][i], 5, dt);
  const strideNow = d.stride * (g === 0 ? 1 : g === 1 ? 1.35 : 2.1);
  st.phase = (st.phase + (speed / strideNow) * TAU * dt) % (TAU * 1000);
  const w = st.walk * (1 - st.air);
  const gw = st.gallop * w;
  const amp = (0.42 + 0.1 * (g >= 1 ? 1 : 0)) * (1 - st.gallop) + 0.85 * st.gallop;
  for (let i = 0; i < 4; i++) {
    const ph = st.phase + st.off[i] * TAU;
    const s = Math.sin(ph), c = Math.cos(ph);
    const [th, sh] = LEGS[i];
    const front = i >= 2;
    A(th, -s * amp * w);
    A(sh, Math.max(0, c) * (front ? 0.9 : 0.75) * w + (front ? 0 : 0.05 * w));
  }
  const s0 = Math.sin(st.phase), c2 = Math.cos(st.phase * 2);
  hy += -Math.abs(c2) * 0.012 * d.hipY * w * (1 + 2 * st.gallop);
  A('hips', s0 * 0.14 * gw, Math.sin(st.phase) * 0.05 * w * (1 - st.gallop));
  A('spine', -s0 * 0.16 * gw, -Math.sin(st.phase) * 0.06 * w);
  A('neck', c2 * 0.05 * w + 0.12 * gw);
  A('tail0', -0.25 * gw, Math.sin(st.phase) * 0.18 * w);

  // ---- postures (only when slow) ------------------------------------------------------------------------
  const moving = speed > 0.25 || !!a.air;
  const want = moving ? 'stand' : (a.pose ?? 'stand');
  const pr = a.poseRate ?? 5;
  for (const k of ['sit', 'lie', 'curl', 'bow', 'hunch'] as const) st.pw[k] = damp(st.pw[k], want === k ? 1 : 0, pr, dt);
  const pw = st.pw;

  if (pw.sit > 0.001 || pw.hunch > 0.001) {
    const k = Math.min(1, pw.sit + pw.hunch);
    if (d.monkey) {
      const p = -1.25;
      const sitHip = d.bodyH * 0.42;
      hy = lerp(hy, sitHip - d.hipY, k);
      L(k, 'hips', p);
      L(k, 'thighBL', -1.55 - p, 0, 0.35); L(k, 'thighBR', -1.55 - p, 0, -0.35);
      L(k, 'shinBL', 1.75); L(k, 'shinBR', 1.75);
      L(k, 'thighFL', -0.3 - p, 0, 0.12); L(k, 'thighFR', -0.3 - p, 0, -0.12);
      L(k, 'shinFL', -0.35); L(k, 'shinFR', -0.35);
      L(k, 'spine', 0.3); // round-shouldered
      L(k, 'neck', R(q, 'neck', 0) - p * 0.9 - 0.3);
      L(k, 'tail0', R(q, 'tail0', 0) - p, R(q, 'tail0', 1), R(q, 'tail0', 2));
      if (pw.hunch > 0.001) {
        const h = pw.hunch;
        A('spine', 0.45 * h); A('neck', 0.55 * h); A('head', 0.35 * h);
        L(h, 'thighFL', 0.55, 0, -0.35); L(h, 'thighFR', 0.55, 0, 0.35); L(h, 'shinFL', -1.5); L(h, 'shinFR', -1.5);
      }
    } else {
      const sitHip = d.bodyH * 0.55;
      const p = -Math.asin(clamp((d.shY - sitHip) / d.len, 0, 0.92));
      hy = lerp(hy, sitHip - d.hipY, k);
      hz = lerp(hz, d.len * 0.08, k);
      L(k, 'hips', p);
      L(k, 'thighBL', -1.3 - p, 0, 0.15); L(k, 'thighBR', -1.3 - p, 0, -0.15);
      L(k, 'shinBL', 2.6); L(k, 'shinBR', 2.6);
      L(k, 'thighFL', -p + 0.06); L(k, 'thighFR', -p + 0.06);
      L(k, 'shinFL', 0); L(k, 'shinFR', 0);
      L(k, 'neck', R(q, 'neck', 0) - p * 0.75);
      L(k, 'tail0', R(q, 'tail0', 0) - p * 0.6 - 0.5, R(q, 'tail0', 1), R(q, 'tail0', 2));
    }
  }
  if (pw.lie > 0.001 || pw.curl > 0.001) {
    const k = Math.min(1, pw.lie + pw.curl);
    const lieHip = d.bodyH * (d.lie === 'tuck' ? 0.62 : 0.5);
    hy = lerp(hy, lieHip - d.hipY, k);
    L(k, 'hips', 0); L(k, 'spine', 0);
    if (d.lie === 'tuck') {
      L(k, 'thighFL', 1.45, 0, 0.1); L(k, 'thighFR', 1.45, 0, -0.1); L(k, 'shinFL', -2.75); L(k, 'shinFR', -2.75);
      L(k, 'thighBL', -1.35, 0, 0.55); L(k, 'thighBR', -1.4, 0, -0.15); L(k, 'shinBL', 2.7); L(k, 'shinBR', 2.8);
    } else {
      L(k, 'thighFL', -1.45, 0, 0.05); L(k, 'thighFR', -1.45, 0, -0.05); L(k, 'shinFL', 0.1); L(k, 'shinFR', 0.1);
      L(k, 'thighBL', -1.4, 0, 0.3); L(k, 'thighBR', -1.4, 0, -0.3); L(k, 'shinBL', 2.8); L(k, 'shinBR', 2.8);
    }
    L(k, 'neck', R(q, 'neck', 0) - 0.15);
    if (pw.curl > 0.001) {
      const c = pw.curl;
      hy -= d.bodyH * 0.1 * c;
      // a C: rear and front halves bend toward the left, head tucked back to the hind legs, tail round the nose
      L(c, 'hips', 0, -0.4, 0.38);
      L(c, 'spine', 0.05, 0.85, 0);
      L(c, 'thighFL', -1.1, 0.3, 0.2); L(c, 'thighFR', -1.1, 0.3, 0.1); L(c, 'shinFL', 1.4); L(c, 'shinFR', 1.5);
      L(c, 'thighBL', -1.5, 0.2, 0.5); L(c, 'thighBR', -1.5, 0.2, 0.2);
      L(c, 'neck', 0.55, 1.0, -0.25); L(c, 'head', 0.45, 0.6, -0.3);
      L(c, 'tail0', -0.2, -1.35, 0.1); L(c, 'tail1', 0.1, -0.7, 0); L(c, 'tail2', 0.1, -0.5, 0); L(c, 'tail3', 0, -0.3, 0);
    }
  }
  if (pw.bow > 0.001) {
    const k = pw.bow;
    hy = lerp(hy, -d.hipY * 0.05, k);
    L(k, 'hips', 0.42);
    L(k, 'thighFL', -1.85, 0, 0.1); L(k, 'thighFR', -1.85, 0, -0.1); L(k, 'shinFL', 0.15); L(k, 'shinFR', 0.15);
    L(k, 'thighBL', -0.42); L(k, 'thighBR', -0.42);
    L(k, 'neck', R(q, 'neck', 0) - 0.65);
  }

  // ---- airborne (leap / hop) ----------------------------------------------------------------------------
  st.air = damp(st.air, a.air ? 1 : 0, a.air ? 14 : 10, dt);
  if (st.air > 0.01) {
    const k = st.air, vy = a.vy ?? 0;
    const pitch = clamp(-vy * 0.07, -0.45, 0.45);
    L(k, 'hips', pitch); L(k, 'spine', 0);
    if (d.monkey) {
      L(k, 'thighFL', -2.0, 0, 0.25); L(k, 'thighFR', -2.0, 0, -0.25); L(k, 'shinFL', -0.2); L(k, 'shinFR', -0.2);
    } else {
      L(k, 'thighFL', -1.15); L(k, 'thighFR', -1.05); L(k, 'shinFL', 0.5); L(k, 'shinFR', 0.6);
    }
    L(k, 'thighBL', 0.95); L(k, 'thighBR', 1.05); L(k, 'shinBL', 0.35); L(k, 'shinBR', 0.3);
    L(k, 'tail0', R(q, 'tail0', 0) * 0.3 + 0.15);
    L(k, 'neck', R(q, 'neck', 0) - pitch * 0.8);
  }

  // ---- details ----------------------------------------------------------------------------------------------
  if (a.sniff) { A('neck', 0.85 * a.sniff, Math.sin(t * 3.1) * 0.12 * a.sniff); A('head', 0.35 * a.sniff, Math.sin(t * 7) * 0.1 * a.sniff); }
  if (a.lookYaw || a.lookPitch) {
    const ly = clamp(a.lookYaw ?? 0, -1.4, 1.4);
    A('neck', 0, ly * 0.45); A('head', a.lookPitch ?? 0, ly * 0.55);
  }
  if (a.wag) {
    const wg = a.wag;
    A('tail0', 0.25 * wg, Math.sin(t * 17) * 0.55 * wg);
    A('tail1', 0, Math.sin(t * 17 - 0.9) * 0.4 * wg);
    A('hips', 0, Math.sin(t * 17) * 0.06 * wg); // the whole rear wiggles
  }
  if (a.swish) {
    const sw = a.swish;
    A('tail0', 0.2 * sw, Math.sin(t * 5) * 0.55 * sw, Math.sin(t * 5) * 0.3 * sw);
    A('tail1', 0, Math.sin(t * 5 - 1) * 0.5 * sw); A('tail2', 0, Math.sin(t * 5 - 2) * 0.5 * sw);
  }
  const mouth = Math.max(a.mouth ?? 0, (a.pant ?? 0) * (0.35 + 0.15 * Math.sin(t * 14)));
  if (mouth > 0) A('jaw', mouth * 0.55);
  if (a.chew) { A('jaw', (0.12 + 0.1 * Math.sin(t * 7)) * a.chew, Math.sin(t * 3.5) * 0.12 * a.chew); }
  if (a.ear) { A('earL', 0, 0, a.ear * 0.6); A('earR', 0, 0, -a.ear * 0.6); }
  if (a.scratch) {
    const sc = a.scratch, wig = Math.sin(t * 22) * 0.22;
    if (d.monkey) {
      L(sc, 'thighFR', -1.45, 0, -0.35); A('thighFR', wig * sc); L(sc, 'shinFR', -1.5 + wig);
      A('head', 0.1 * sc, 0, -0.25 * sc);
    } else {
      L(sc, 'thighBR', -2.1 + wig, 0, -0.5); L(sc, 'shinBR', 1.3 - wig);
      A('neck', 0.2 * sc, -0.35 * sc, -0.35 * sc); A('head', 0, 0, -0.3 * sc);
    }
  }
  if (a.groom) {
    const gr = a.groom;
    L(gr, 'thighFL', 0.6 + Math.sin(t * 5.2) * 0.22, 0, -0.2); L(gr, 'thighFR', 0.6 + Math.sin(t * 4.3 + 1) * 0.22, 0, 0.2);
    L(gr, 'shinFL', -0.9 + Math.sin(t * 9) * 0.2); L(gr, 'shinFR', -0.9 + Math.cos(t * 8) * 0.2);
    A('neck', 0.3 * gr); A('head', 0.3 * gr, Math.sin(t * 1.3) * 0.2 * gr);
  }
  if (a.roll) {
    A('hips', 0, 0, a.roll);
    const up = Math.sin(Math.min(Math.abs(a.roll), Math.PI) / 2) ** 2;
    hy += d.bodyH * 0.25 * up;
    // legs paddle in the air when on its back
    for (let i = 0; i < 4; i++) { const [th] = LEGS[i]; A(th, Math.sin(t * 9 + i * 1.7) * 0.4 * up); }
  }
  if (a.tailLift) A('tail0', a.tailLift);
  if (a.sleep) { A('head', 0.15); }

  // ---- apply ------------------------------------------------------------------------------------------------
  const rate = a.rate ?? 14;
  for (let i = 1; i < NB; i++) {
    const b = bones[QBONES[i]];
    b.rotation.x = damp(b.rotation.x, T[i * 3], rate, dt);
    b.rotation.y = damp(b.rotation.y, T[i * 3 + 1], rate, dt);
    b.rotation.z = damp(b.rotation.z, T[i * 3 + 2], rate, dt);
  }
  const hb = bones.hips.position;
  hb.y = damp(hb.y, d.hipY + hy, Math.min(rate, 12), dt);
  hb.z = damp(hb.z, -d.len / 2 + hz, Math.min(rate, 12), dt);
  // breathing: the barrel swells (deep and slow asleep, fast when panting)
  const br = a.sleep ? 1.3 : 2.2 + (a.pant ?? 0) * 9;
  const ba = a.sleep ? 0.06 : 0.03 + (a.pant ?? 0) * 0.03;
  const sb = 1 + Math.sin(t * br) * ba;
  bones.barrel.scale.set(sb, sb, 1);
}

/** Restore everything to the rest pose immediately (e.g. after a teleport). */
export function snapQuad(q: QuadRig) {
  for (let i = 1; i < NB; i++) q.bones[QBONES[i]].rotation.set(q.rest[i * 3], q.rest[i * 3 + 1], q.rest[i * 3 + 2]);
}
