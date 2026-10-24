// Species builders for the quadruped kit: McLeod's street dogs, Pema's puppy (one white ear), humped Indian
// cattle, rhesus macaques and grey langurs. Chunky colour blocks first: at ~4.4 cm per art pixel a dog is
// ~14 px tall, so silhouettes, coat patches and 1-px eyes carry the character.
import { PAL } from '../../core/palette';
import type { V3 } from '../../core/geom';
import { Parts } from '../../core/geom';
import { assembleQuad, newQuadParts, type QBone, type QuadRig } from './quad';

const EYE = 0x141010;

// ---- shared body plan -----------------------------------------------------------------------------------
interface Shape {
  legB: number; legF: number; len: number;
  bodyW: number; bodyH: number; bodyLift: number;
  neckL: number; neckA: number; neckT: number;
  headW: number; headH: number; headD: number;
  legT: number; hipX: number; shX: number;
  tailSeg: number; tailT: number; tailN: number;
}

interface Frame {
  J: Record<QBone, V3>;
  hz: number; fz: number;
  bodyY: number;
  /** Neck joint and head joint. */
  N: V3; H: V3;
  tailRoot: V3;
}

function frame(s: Shape): Frame {
  const hz = -s.len / 2, fz = s.len / 2;
  const bodyY = s.legB + s.bodyLift;
  const N: V3 = [0, s.legF + s.bodyLift + s.bodyH * 0.32, fz + s.len * 0.14];
  const H: V3 = [0, N[1] + Math.cos(s.neckA) * s.neckL, N[2] + Math.sin(s.neckA) * s.neckL];
  const tailRoot: V3 = [0, bodyY + s.bodyH * 0.32, hz - s.len * 0.2 - 0.01];
  const thB = s.legB * 0.52, thF = s.legF * 0.52;
  const J: Record<QBone, V3> = {
    root: [0, 0, 0], hips: [0, s.legB, hz], barrel: [0, bodyY, 0], spine: [0, s.legF, fz],
    thighBL: [s.hipX, s.legB, hz], shinBL: [s.hipX, s.legB - thB, hz],
    thighBR: [-s.hipX, s.legB, hz], shinBR: [-s.hipX, s.legB - thB, hz],
    thighFL: [s.shX, s.legF, fz], shinFL: [s.shX, s.legF - thF, fz],
    thighFR: [-s.shX, s.legF, fz], shinFR: [-s.shX, s.legF - thF, fz],
    neck: N, head: H, jaw: [0, H[1], H[2]], earL: [0, H[1], H[2]], earR: [0, H[1], H[2]],
    tail0: tailRoot,
    tail1: [0, tailRoot[1], tailRoot[2] - s.tailSeg],
    tail2: [0, tailRoot[1], tailRoot[2] - s.tailSeg * 2],
    tail3: [0, tailRoot[1], tailRoot[2] - s.tailSeg * 3],
  };
  return { J, hz, fz, bodyY, N, H, tailRoot };
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Legs (thigh / shin / paw) in four colours. */
function legs(P: Record<QBone, Parts>, s: Shape, f: Frame, c: { thighB: number; thighF: number; lowB: number; lowF: number; paw: number; pawF?: number; bulk?: number; pawL?: number }) {
  const thB = s.legB * 0.52, shB = s.legB - thB, thF = s.legF * 0.52, shF = s.legF - thF;
  const t = s.legT, k = c.bulk ?? 1;
  for (const sx of [1, -1] as const) {
    const B = sx > 0 ? 'L' : 'R';
    const hx = sx * s.hipX, fx = sx * s.shX;
    P[`thigh${'B' + B}` as QBone].box(t * 1.2 * k, thB + 0.05, t * 1.5 * k, [hx, s.legB - thB / 2 + 0.015, f.hz], c.thighB);
    P[`shin${'B' + B}` as QBone].box(t * 0.78, shB + 0.02, t * 0.85, [hx, shB / 2, f.hz - 0.005], c.lowB);
    P[`shin${'B' + B}` as QBone].box(t * 0.95, t * 0.5, t * (c.pawL ?? 1.35), [hx, t * 0.25, f.hz + t * 0.25], c.paw);
    P[`thigh${'F' + B}` as QBone].box(t * 1.05 * k, thF + 0.05, t * 1.25 * k, [fx, s.legF - thF / 2 + 0.015, f.fz], c.thighF);
    P[`shin${'F' + B}` as QBone].box(t * 0.78, shF + 0.02, t * 0.82, [fx, shF / 2, f.fz], c.lowF);
    P[`shin${'F' + B}` as QBone].box(t * 0.95, t * 0.5, t * (c.pawL ?? 1.35), [fx, t * 0.25, f.fz + t * 0.3], c.pawF ?? c.paw);
  }
}

function tail(P: Record<QBone, Parts>, s: Shape, f: Frame, col: number, tip?: number, tipK = 1) {
  const names: QBone[] = ['tail0', 'tail1', 'tail2', 'tail3'];
  for (let i = 0; i < s.tailN; i++) {
    const last = i === s.tailN - 1;
    const z = f.tailRoot[2] - s.tailSeg * (i + 0.5);
    const th = s.tailT * (last ? tipK : 1);
    P[names[i]].box(th, th, s.tailSeg + 0.02, [0, f.tailRoot[1], z], last && tip !== undefined ? tip : col);
  }
}

// ---- dogs ----------------------------------------------------------------------------------------------------
export interface DogSpec {
  coat: number;
  belly?: number;
  muzzle?: number;
  /** White chest blaze. */
  bib?: number;
  socks?: number;
  /** Darker back (black-and-tan / saddle). */
  saddle?: number;
  /** Tail tip colour. */
  tip?: number;
  /** Tan eyebrow spots (black-and-tan dogs). */
  brows?: number;
  earL?: number;
  earR?: number;
  ears?: 'up' | 'flop' | 'half';
  /** Overall size (1 = medium street dog, ~0.75 m to the ear tips). */
  size?: number;
  /** Fluffy (Himalayan / Gaddi cross): chunkier tail and ruff. */
  fluffy?: boolean;
  puppy?: boolean;
  seed?: number;
}

export function buildDog(spec: DogSpec): QuadRig {
  const pup = !!spec.puppy;
  const k = spec.size ?? 1;
  const s: Shape = pup
    ? {
      legB: 0.15, legF: 0.145, len: 0.19, bodyW: 0.14, bodyH: 0.13, bodyLift: 0.045,
      neckL: 0.06, neckA: 0.55, neckT: 0.09, headW: 0.135, headH: 0.12, headD: 0.12,
      legT: 0.055, hipX: 0.045, shX: 0.045, tailSeg: 0.045, tailT: 0.04, tailN: 3,
    }
    : {
      legB: 0.37 * k, legF: 0.36 * k, len: 0.4 * k, bodyW: 0.19 * k, bodyH: 0.2 * k, bodyLift: 0.07 * k,
      neckL: 0.16 * k, neckA: 0.6, neckT: 0.12 * k, headW: 0.16 * k, headH: 0.14 * k, headD: 0.15 * k,
      legT: 0.072 * k, hipX: 0.062 * k, shX: 0.062 * k, tailSeg: 0.095 * k, tailT: (spec.fluffy ? 0.075 : 0.058) * k, tailN: 4,
    };
  const f = frame(s);
  const qp = newQuadParts(f.J);
  const P = qp.P;
  const coat = spec.coat, belly = spec.belly ?? coat, muzzle = spec.muzzle ?? coat;
  const by = f.bodyY;

  // torso: barrel (breathes), rump (hips), chest (spine)
  P.barrel.box(s.bodyW, s.bodyH, s.len * 0.92, [0, by, 0], coat);
  P.barrel.box(s.bodyW * 0.82, s.bodyH * 0.18, s.len * 0.6, [0, by - s.bodyH * 0.46, 0.01], belly);
  if (spec.saddle !== undefined) P.barrel.box(s.bodyW * 1.04, s.bodyH * 0.42, s.len * 0.8, [0, by + s.bodyH * 0.32, -0.01], spec.saddle);
  P.hips.box(s.bodyW * 1.04, s.bodyH * 1.0, s.len * 0.36, [0, by + 0.005, f.hz - s.len * 0.02], coat);
  if (spec.saddle !== undefined) P.hips.box(s.bodyW * 1.06, s.bodyH * 0.4, s.len * 0.3, [0, by + s.bodyH * 0.33, f.hz - s.len * 0.02], spec.saddle);
  P.spine.box(s.bodyW * 1.08, s.bodyH * 1.18, s.len * 0.42, [0, by - s.bodyH * 0.06, f.fz - 0.005], coat);
  if (spec.saddle !== undefined) P.spine.box(s.bodyW * 1.1, s.bodyH * 0.34, s.len * 0.3, [0, by + s.bodyH * 0.42, f.fz - s.len * 0.06], spec.saddle);
  if (spec.bib !== undefined) P.spine.box(s.bodyW * 0.62, s.bodyH * 0.8, 0.02, [0, by - s.bodyH * 0.12, f.fz + s.len * 0.2], spec.bib);
  if (spec.fluffy) P.neck.box(s.bodyW * 1.15, s.bodyH * 0.7, s.len * 0.22, [0, f.N[1] - s.bodyH * 0.1, f.N[2] - 0.01], coat); // ruff

  // neck
  const nd: V3 = [0, Math.cos(s.neckA), Math.sin(s.neckA)];
  P.neck.box(s.neckT, s.neckL + 0.05, s.neckT * 1.05, add(f.N, [0, nd[1] * s.neckL / 2, nd[2] * s.neckL / 2]), spec.saddle ?? coat, { rot: [s.neckA, 0, 0] });

  // head
  const sk: V3 = add(f.H, [0, s.headH * 0.32, s.headD * 0.12]);
  P.head.box(s.headW, s.headH, s.headD, sk, coat);
  const mL = pup ? 0.055 : 0.095 * k, mW = pup ? 0.07 : 0.085 * k, mH = pup ? 0.055 : 0.07 * k;
  const mz = sk[2] + s.headD / 2 + mL / 2 - 0.01;
  const my = sk[1] - s.headH * 0.22;
  P.head.box(mW, mH, mL, [0, my, mz], muzzle);
  P.head.box(mW * 0.55, mH * 0.5, 0.025, [0, my + mH * 0.3, mz + mL / 2 + 0.005], 0x1a1414); // nose
  const fzH = sk[2] + s.headD / 2 + 0.004;
  const ey = sk[1] + s.headH * (pup ? 0.06 : 0.14);
  const ex = s.headW * (pup ? 0.27 : 0.28);
  const eyeS = pup ? 0.032 : 0.036;
  P.head.box(eyeS, eyeS, 0.012, [ex, ey, fzH], EYE);
  P.head.box(eyeS, eyeS, 0.012, [-ex, ey, fzH], EYE);
  if (spec.brows !== undefined) {
    P.head.box(0.034, 0.022, 0.012, [ex, ey + 0.035, fzH], spec.brows);
    P.head.box(0.034, 0.022, 0.012, [-ex, ey + 0.035, fzH], spec.brows);
  }
  // jaw (opens for barks / pants); tongue on top
  const jJ: V3 = [0, my - mH * 0.5 + 0.005, sk[2] + s.headD * 0.3];
  qp.J.jaw = jJ;
  P.jaw.box(mW * 0.9, 0.024, mL + s.headD * 0.2, [0, jJ[1] - 0.012, jJ[2] + (mL + s.headD * 0.2) / 2], spec.muzzle ?? coat);
  P.jaw.box(mW * 0.55, 0.01, mL * 0.8, [0, jJ[1] + 0.002, jJ[2] + mL * 0.5], 0xc0505a);

  // ears
  const earTop = sk[1] + s.headH / 2;
  const ex2 = s.headW * 0.32;
  const ears = spec.ears ?? 'up';
  for (const sx of [1, -1] as const) {
    const bone: QBone = sx > 0 ? 'earL' : 'earR';
    const col = (sx > 0 ? spec.earL : spec.earR) ?? coat;
    const J: V3 = [sx * ex2, earTop, sk[2] - s.headD * 0.12];
    qp.J[bone] = J;
    if (pup) {
      // big soft puppy ears, half-flopped forward
      P[bone].box(0.06, 0.07, 0.03, add(J, [sx * 0.012, 0.03, 0]), col);
      P[bone].box(0.055, 0.03, 0.05, add(J, [sx * 0.016, 0.06, 0.02]), col);
    } else if (ears === 'up') {
      P[bone].box(0.055 * k, 0.07 * k, 0.026 * k, add(J, [0, 0.035 * k, 0]), col);
      P[bone].box(0.03 * k, 0.035 * k, 0.022 * k, add(J, [sx * 0.004, 0.085 * k, 0]), col);
    } else if (ears === 'half') {
      P[bone].box(0.055 * k, 0.055 * k, 0.026 * k, add(J, [0, 0.028 * k, 0]), col);
      P[bone].box(0.05 * k, 0.026 * k, 0.05 * k, add(J, [0, 0.058 * k, 0.018 * k]), col);
    } else {
      P[bone].box(0.03 * k, 0.085 * k, 0.065 * k, add(J, [sx * 0.03 * k, -0.035 * k, 0.01]), col);
    }
  }

  legs(P, s, f, {
    thighB: coat, thighF: coat, lowB: spec.socks ?? coat, lowF: spec.socks ?? coat,
    paw: spec.socks ?? (spec.belly ?? coat), bulk: pup ? 1.15 : 1,
  });
  tail(P, s, f, spec.saddle ?? coat, spec.tip, spec.fluffy ? 1.2 : 1);

  const rest: Partial<Record<QBone, V3>> = pup
    ? {
      thighBL: [-0.1, 0, 0], thighBR: [-0.1, 0, 0], shinBL: [0.18, 0, 0], shinBR: [0.18, 0, 0],
      tail0: [0.9, 0, 0], tail1: [0.5, 0, 0], tail2: [0.4, 0, 0],
      earL: [0.25, 0, 0.45], earR: [0.3, 0, -0.55],
    }
    : {
      thighBL: [-0.14, 0, 0], thighBR: [-0.14, 0, 0], shinBL: [0.24, 0, 0], shinBR: [0.24, 0, 0],
      thighFL: [0.03, 0, 0], thighFR: [0.03, 0, 0],
      tail0: [1.0, 0, 0], tail1: [0.95, 0, 0], tail2: [0.85, 0, 0], tail3: [0.6, 0, 0],
      earL: [0, 0, ears === 'up' ? -0.12 : 0], earR: [0, 0, ears === 'up' ? 0.12 : 0],
    };
  return assembleQuad(qp, {
    len: s.len, hipY: s.legB, shY: s.legF, bodyH: s.bodyH,
    stride: pup ? 0.32 : 0.7 * k, trotAt: pup ? 0.75 : 1.5, gallopAt: pup ? 2.4 : 3.6, monkey: false, lie: 'sphinx',
  }, rest, spec.seed ?? 1, pup ? 0.45 : 0.9 * k);
}

/** Coat recipes for McLeod's street dogs. */
export const DOG_COATS: DogSpec[] = [
  // classic tan pariah with white socks and bib
  { coat: PAL.dogTan, belly: 0xd9b88a, muzzle: 0x4a3a2c, bib: PAL.dogWhite, socks: 0xe2d4bc, tip: PAL.dogWhite, ears: 'up' },
  // black-and-tan Himalayan cross, fluffy
  { coat: 0x2c2826, belly: 0xb07a46, muzzle: 0xb07a46, saddle: 0x1e1b1a, socks: 0xb07a46, brows: 0xc08850, ears: 'half', fluffy: true, size: 1.08 },
  // white with brown patches
  { coat: PAL.dogWhite, muzzle: 0xe8e2d6, saddle: 0xa06a3e, earL: 0x8a5a32, earR: 0x8a5a32, socks: PAL.dogWhite, ears: 'flop' },
  // pale fawn
  { coat: 0xd8be92, belly: 0xebdcc0, muzzle: 0xc9a878, socks: 0xebdcc0, ears: 'up', size: 0.92 },
  // black with a white blaze
  { coat: PAL.dogBlack, muzzle: 0x3a3532, bib: PAL.dogWhite, socks: PAL.dogWhite, tip: PAL.dogWhite, ears: 'half' },
  // russet
  { coat: 0x9a5a32, belly: 0xc88e5c, muzzle: 0x5a3622, bib: 0xe8d8bc, ears: 'up', size: 0.95 },
  // grey-brown brindle-ish, shaggy
  { coat: 0x6e5e4e, belly: 0x9a8a74, muzzle: 0x3a322a, saddle: 0x4e4236, brows: 0x9a8a74, ears: 'flop', fluffy: true },
  // tan with a black saddle
  { coat: 0xc49058, belly: 0xe0c49a, muzzle: 0x3a2e24, saddle: 0x2a2624, socks: 0xe0c49a, ears: 'up', size: 1.04 },
];

/** Pema's puppy: small, brown, ONE WHITE EAR. */
export function buildPuppy(): QuadRig {
  return buildDog({
    puppy: true, coat: 0x7a4c2c, belly: 0xa8784c, muzzle: 0xb88a5c, socks: 0xa8784c, tip: 0xa8784c,
    earL: 0xf4f0e6, earR: 0x5e3820, seed: 99,
  });
}

// ---- cattle ----------------------------------------------------------------------------------------------------
export interface CowSpec { coat: number; shade: number; belly: number; muzzle: number; low: number; fore?: number; seed?: number }
export const COW_COATS: Record<'white' | 'brown' | 'grey', CowSpec> = {
  white: { coat: PAL.cowWhite, shade: 0xbab2a3, fore: 0xdcd5c7, belly: 0xf2eee4, muzzle: 0x9a8680, low: 0xcfc7b8 },
  brown: { coat: PAL.cowBrown, shade: 0x5e432c, belly: 0x9c7a58, muzzle: 0x3e302a, low: 0x6a4e36 },
  grey: { coat: 0xd8d2c6, shade: 0x8e8a84, fore: 0xb4afa6, belly: 0xe6e1d6, muzzle: 0x6a625e, low: 0xb8b2a8 },
};

export function buildCow(c: CowSpec): QuadRig {
  const s: Shape = {
    legB: 0.74, legF: 0.72, len: 0.9, bodyW: 0.5, bodyH: 0.5, bodyLift: 0.21,
    neckL: 0.3, neckA: 1.25, neckT: 0.26, headW: 0.22, headH: 0.22, headD: 0.2,
    legT: 0.13, hipX: 0.15, shX: 0.14, tailSeg: 0.2, tailT: 0.04, tailN: 4,
  };
  const f = frame(s);
  // the zebu's neck comes out low and forward; tail root at the top of the rump
  f.J.neck = [0, 1.02, f.fz + 0.22]; f.N = f.J.neck;
  f.J.head = [0, 1.12, f.fz + 0.52]; f.H = f.J.head;
  f.J.tail0 = [0, 1.18, f.hz - 0.27]; f.tailRoot = f.J.tail0;
  for (let i = 1; i < 4; i++) f.J[`tail${i}` as QBone] = [0, 1.18, f.hz - 0.27 - s.tailSeg * i];
  const qp = newQuadParts(f.J);
  const P = qp.P;
  const by = f.bodyY;
  const fore = c.fore ?? c.coat;

  // barrel with a rounded top and a sagging belly
  P.barrel.box(s.bodyW, s.bodyH * 0.84, 1.12, [0, by - s.bodyH * 0.06, 0], c.coat);
  P.barrel.box(s.bodyW * 0.8, s.bodyH * 0.2, 1.08, [0, by + s.bodyH * 0.38, 0], c.coat);
  P.barrel.box(s.bodyW * 0.84, 0.12, 0.74, [0, by - s.bodyH / 2 - 0.03, 0.02], c.belly);
  P.hips.box(0.48, 0.42, 0.36, [0, by - 0.01, f.hz - 0.08], c.coat);
  P.hips.box(0.4, 0.1, 0.34, [0, by + 0.24, f.hz - 0.06], c.coat);
  P.hips.box(0.09, 0.07, 0.1, [0.19, by + 0.27, f.hz + 0.02], c.shade); // hook bones
  P.hips.box(0.09, 0.07, 0.1, [-0.19, by + 0.27, f.hz + 0.02], c.shade);
  P.hips.box(0.2, 0.06, 0.12, [0, by + 0.27, f.hz - 0.2], c.coat); // tail head
  P.spine.box(0.48, 0.52, 0.42, [0, by - 0.03, f.fz + 0.05], fore);
  P.spine.box(0.38, 0.1, 0.4, [0, by + 0.26, f.fz + 0.03], fore);
  // the hump over the withers
  P.spine.box(0.27, 0.24, 0.3, [0, by + 0.37, f.fz + 0.1], c.shade);
  P.spine.box(0.2, 0.1, 0.22, [0, by + 0.51, f.fz + 0.08], c.shade);
  // dewlap: loose skin hanging under the neck and brisket
  P.spine.box(0.06, 0.2, 0.22, [0, by - 0.34, f.fz + 0.24], c.shade);

  // neck
  const N = f.N, H = f.H;
  P.neck.box(0.28, 0.34, 0.38, [0, (N[1] + H[1]) / 2 - 0.02, (N[2] + H[2]) / 2 - 0.03], c.shade, { rot: [-0.2, 0, 0] });
  P.neck.box(0.06, 0.24, 0.34, [0, N[1] - 0.25, N[2] + 0.12], c.shade); // dewlap
  // head: poll, long face angled down to a pale muzzle
  P.head.box(0.27, 0.17, 0.2, add(H, [0, 0.05, 0.03]), c.coat);
  P.head.box(0.23, 0.42, 0.18, add(H, [0, -0.12, 0.18]), c.coat, { rot: [-0.72, 0, 0] });
  P.head.box(0.22, 0.14, 0.16, add(H, [0, -0.29, 0.34]), c.muzzle);
  P.head.box(0.14, 0.035, 0.02, add(H, [0, -0.26, 0.425]), 0x2a201e); // nostrils
  P.head.box(0.016, 0.045, 0.045, add(H, [0.118, -0.02, 0.13]), EYE);
  P.head.box(0.016, 0.045, 0.045, add(H, [-0.118, -0.02, 0.13]), EYE);
  // horns: short, up and back
  P.head.box(0.06, 0.15, 0.06, add(H, [0.095, 0.18, -0.01]), 0xc8b898, { rot: [-0.35, 0, -0.3] });
  P.head.box(0.06, 0.15, 0.06, add(H, [-0.095, 0.18, -0.01]), 0xc8b898, { rot: [-0.35, 0, 0.3] });
  P.head.box(0.045, 0.05, 0.045, add(H, [0.125, 0.26, -0.045]), 0x4a4038);
  P.head.box(0.045, 0.05, 0.045, add(H, [-0.125, 0.26, -0.045]), 0x4a4038);
  // jaw (chews the cud)
  const jJ: V3 = add(H, [0, -0.33, 0.22]);
  qp.J.jaw = jJ;
  P.jaw.box(0.17, 0.05, 0.16, add(jJ, [0, -0.02, 0.07]), c.muzzle);
  // ears stick out sideways below the horns
  for (const sx of [1, -1] as const) {
    const bone: QBone = sx > 0 ? 'earL' : 'earR';
    const J: V3 = add(H, [sx * 0.12, 0.04, 0.0]);
    qp.J[bone] = J;
    P[bone].box(0.17, 0.045, 0.1, add(J, [sx * 0.08, 0, 0]), c.coat);
    P[bone].box(0.11, 0.012, 0.065, add(J, [sx * 0.09, -0.025, 0]), 0xc89a8a);
  }

  legs(P, s, f, { thighB: c.coat, thighF: fore, lowB: c.low, lowF: c.low, paw: 0x3a302a, bulk: 1.05, pawL: 1.1 });
  // tail: thin with a dark switch
  const tn: QBone[] = ['tail0', 'tail1', 'tail2', 'tail3'];
  for (let i = 0; i < 4; i++) {
    const z = f.tailRoot[2] - s.tailSeg * (i + 0.5);
    if (i < 3) P[tn[i]].box(0.045, 0.045, s.tailSeg + 0.02, [0, f.tailRoot[1], z], c.coat);
    else P[tn[i]].box(0.08, 0.08, s.tailSeg + 0.04, [0, f.tailRoot[1], z - 0.02], 0x2e2824);
  }
  return assembleQuad(qp, {
    len: s.len, hipY: s.legB, shY: s.legF, bodyH: s.bodyH,
    stride: 1.25, trotAt: 1.6, gallopAt: 4, monkey: false, lie: 'tuck',
  }, {
    thighBL: [-0.08, 0, 0], thighBR: [-0.08, 0, 0], shinBL: [0.14, 0, 0], shinBR: [0.14, 0, 0],
    tail0: [-1.42, 0, 0], tail1: [-0.04, 0, 0], tail2: [0.04, 0, 0], tail3: [0.08, 0, 0],
    earL: [0, 0, -0.3], earR: [0, 0, 0.3],
  }, c.seed ?? 3, 1.6);
}

// ---- monkeys -----------------------------------------------------------------------------------------------------
export function buildMacaque(seed: number): QuadRig {
  const s: Shape = {
    legB: 0.2, legF: 0.2, len: 0.25, bodyW: 0.15, bodyH: 0.15, bodyLift: 0.05,
    neckL: 0.05, neckA: 0.75, neckT: 0.09, headW: 0.14, headH: 0.13, headD: 0.12,
    legT: 0.05, hipX: 0.055, shX: 0.065, tailSeg: 0.09, tailT: 0.032, tailN: 2,
  };
  const fur = seed % 2 ? PAL.monkey : 0x857058, rump = 0xa47a4e, belly = 0xb5a48a, hand = 0x5e4a3a;
  const f = frame(s);
  const qp = newQuadParts(f.J);
  const P = qp.P;
  const by = f.bodyY;
  P.barrel.box(s.bodyW, s.bodyH, s.len * 0.9, [0, by, 0], fur);
  P.barrel.box(s.bodyW * 0.8, 0.03, s.len * 0.6, [0, by - s.bodyH / 2, 0.01], belly);
  P.hips.box(s.bodyW * 1.06, s.bodyH, s.len * 0.42, [0, by, f.hz - 0.01], rump);
  P.spine.box(s.bodyW * 1.08, s.bodyH * 1.12, s.len * 0.45, [0, by + 0.005, f.fz], fur);
  const H = f.H;
  P.neck.box(0.08, 0.08, 0.08, add(f.N, [0, 0.03, 0.02]), fur);
  P.head.box(s.headW, s.headH, s.headD, add(H, [0, 0.045, 0.02]), fur);
  P.head.box(s.headW * 0.8, 0.03, 0.05, add(H, [0, 0.11, 0.0]), 0x9c8466); // crown tuft
  P.head.box(0.125, 0.028, 0.035, add(H, [0, 0.09, 0.075]), 0x6e5a44); // brow ridge
  P.head.box(0.11, 0.085, 0.035, add(H, [0, 0.035, 0.09]), 0xd48a7a); // pink face
  P.head.box(0.07, 0.05, 0.045, add(H, [0, 0.0, 0.11]), 0xe0a090); // muzzle
  P.head.box(0.028, 0.028, 0.01, add(H, [0.026, 0.052, 0.109]), 0x2a1a14);
  P.head.box(0.028, 0.028, 0.01, add(H, [-0.026, 0.052, 0.109]), 0x2a1a14);
  const jJ: V3 = add(H, [0, -0.012, 0.07]);
  qp.J.jaw = jJ;
  P.jaw.box(0.05, 0.02, 0.04, add(jJ, [0, -0.01, 0.025]), 0xc98f7a);
  for (const sx of [1, -1] as const) {
    const bone: QBone = sx > 0 ? 'earL' : 'earR';
    const J: V3 = add(H, [sx * 0.068, 0.05, 0.02]);
    qp.J[bone] = J;
    P[bone].box(0.022, 0.04, 0.032, add(J, [sx * 0.008, 0, 0]), 0xc08a78);
  }
  legs(P, s, f, { thighB: rump, thighF: fur, lowB: fur, lowF: fur, paw: hand, pawL: 1.3 });
  tail(P, s, f, rump);
  return assembleQuad(qp, {
    len: s.len, hipY: s.legB, shY: s.legF, bodyH: s.bodyH,
    stride: 0.42, trotAt: 0.9, gallopAt: 2.0, monkey: true, lie: 'sphinx',
  }, {
    tail0: [-0.7, 0, 0], tail1: [-0.35, 0, 0], neck: [0, 0, 0],
  }, seed, 0.7);
}

export function buildLangur(seed: number): QuadRig {
  const s: Shape = {
    legB: 0.3, legF: 0.31, len: 0.34, bodyW: 0.18, bodyH: 0.19, bodyLift: 0.06,
    neckL: 0.06, neckA: 0.7, neckT: 0.1, headW: 0.15, headH: 0.14, headD: 0.14,
    legT: 0.058, hipX: 0.065, shX: 0.075, tailSeg: 0.22, tailT: 0.042, tailN: 4,
  };
  const fur = seed % 2 ? 0xbdb8ae : 0xb3ada2, pale = 0xe2ded4, chest = 0xd6d1c6, black = 0x1c1818, hand = 0x2a2624, tailC = 0xa9a49a;
  const f = frame(s);
  const qp = newQuadParts(f.J);
  const P = qp.P;
  const by = f.bodyY;
  P.barrel.box(s.bodyW, s.bodyH, s.len * 0.9, [0, by, 0], fur);
  P.barrel.box(s.bodyW * 0.8, 0.035, s.len * 0.6, [0, by - s.bodyH / 2, 0.01], chest);
  P.hips.box(s.bodyW * 1.04, s.bodyH * 0.98, s.len * 0.4, [0, by, f.hz - 0.01], fur);
  P.spine.box(s.bodyW * 1.06, s.bodyH * 1.1, s.len * 0.45, [0, by, f.fz], fur);
  P.spine.box(s.bodyW * 0.7, s.bodyH * 0.6, 0.02, [0, by - 0.02, f.fz + s.len * 0.23], chest);
  const H = f.H;
  P.neck.box(0.09, 0.09, 0.09, add(f.N, [0, 0.03, 0.02]), fur);
  P.head.box(s.headW, s.headH, s.headD, add(H, [0, 0.05, 0.01]), pale);
  P.head.box(0.1, 0.1, 0.03, add(H, [0, 0.035, 0.085]), black); // black face
  P.head.box(0.16, 0.035, 0.05, add(H, [0, 0.1, 0.075]), pale);  // the pale brow fringe that juts over the face
  P.head.box(0.022, 0.022, 0.01, add(H, [0.024, 0.055, 0.101]), 0x7a5a32); // amber eyes on the black mask
  P.head.box(0.022, 0.022, 0.01, add(H, [-0.024, 0.055, 0.101]), 0x7a5a32);
  const jJ: V3 = add(H, [0, -0.01, 0.07]);
  qp.J.jaw = jJ;
  P.jaw.box(0.06, 0.022, 0.04, add(jJ, [0, -0.01, 0.025]), black);
  for (const sx of [1, -1] as const) {
    const bone: QBone = sx > 0 ? 'earL' : 'earR';
    const J: V3 = add(H, [sx * 0.078, 0.05, 0.0]);
    qp.J[bone] = J;
    P[bone].box(0.02, 0.04, 0.035, add(J, [sx * 0.006, 0, 0]), black);
  }
  legs(P, s, f, { thighB: fur, thighF: fur, lowB: fur, lowF: fur, paw: hand, pawL: 1.4 });
  // black hands and feet extend up the wrists
  for (const b of ['shinFL', 'shinFR'] as const) {
    const x = b === 'shinFL' ? s.shX : -s.shX;
    P[b].box(s.legT * 0.82, 0.07, s.legT * 0.86, [x, 0.04, f.fz], hand);
  }
  tail(P, s, f, tailC, 0x9a958c);
  return assembleQuad(qp, {
    len: s.len, hipY: s.legB, shY: s.legF, bodyH: s.bodyH,
    stride: 0.6, trotAt: 1.2, gallopAt: 2.4, monkey: true, lie: 'sphinx',
  }, {
    tail0: [-0.9, 0, 0], tail1: [0.25, 0, 0], tail2: [0.3, 0, 0], tail3: [0.35, 0, 0],
  }, seed, 1.2);
}
