// Character kit: every person in the town (Tenzin and the NPCs) is ONE rigid-skinned, vertex-coloured
// low-poly mesh — one draw call per figure — built from boxes on a small skeleton and animated procedurally.
//
//   const rig = buildCharacter({ outfit: 'monk', height: 1.68, seed: 3 });
//   scene.add(rig.root);                       // place with rig.root.position / rig.root.rotation.y
//   useFrame(() => animateCharacter(rig, { dt: game.dt, time: game.time, speed, grounded: true, vy: 0,
//                                          action: 'wheelWalk' }));
//
// Model space: metres, feet on y = 0, the figure faces +z, its LEFT is +x, its RIGHT is −x (as in Gorshey).
// Bones are posed only by rotation (plus the hips' height and the robe's flare), so geometry never stretches.
// Long robes (women's chuba, monks' and nuns' shamthab) hang from two skirt bones — hip → knee and knee → hem —
// so they drape over the knees when sitting on a bench ('sit') or spread over the lap ('sitCross').
import {
  Bone, Float32BufferAttribute, Group, Object3D, Skeleton, SkinnedMesh, Uint16BufferAttribute, type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Parts, type V3 } from '../core/geom';
import { partsMaterial } from '../core/materials';
import { PAL, PANGDEN } from '../core/palette';
import { clamp, damp, lerp, rng, smooth, TAU } from '../core/math';

// ---- spec ------------------------------------------------------------------------------------------------
export type Outfit = 'chuba' | 'chubaF' | 'monk' | 'nun' | 'western' | 'kurta' | 'jacket' | 'uniform';
export type HairStyle = 'short' | 'messy' | 'shaved' | 'braids' | 'bun' | 'long' | 'bob' | 'none';
export type Hat = 'cap' | 'beanie' | 'sunhat' | 'fur';
export type Held = 'prayerWheel' | 'mala' | 'stick' | 'phone' | 'plate' | 'bag';

export interface CharSpec {
  outfit: Outfit;
  /** Height in metres (Tenzin 1.3, women 1.52–1.65, men 1.62–1.8, elders a bit shorter). */
  height?: number;
  /** Width scale (default 1). */
  build?: number;
  /** Child proportions (bigger head). Default: height < 1.42. */
  child?: boolean;
  female?: boolean;
  skin?: number;
  /** Rosy Tibetan cheeks. */
  cheeks?: boolean;
  hair?: number;
  hairStyle?: HairStyle;
  /** Main garment: chuba / robe / kurta / jacket / sweater colour. */
  robe?: number;
  /** Trim / brocade edge / cuffs. */
  trim?: number;
  /** Shirt, blouse, t-shirt. */
  shirt?: number;
  sash?: number;
  pants?: number;
  shoes?: number;
  /** Band colour on traditional boots. */
  shoeBand?: number;
  /** Pangden apron stripes (married women only). */
  apron?: readonly number[] | null;
  hat?: Hat | null;
  hatColor?: number;
  bag?: 'backpack' | 'shoulder' | null;
  bagColor?: number;
  holdR?: Held | null;
  holdL?: Held | null;
  /** Mala wrapped round the left wrist. */
  wristMala?: boolean;
  glasses?: boolean;
  /** Western outfit: shorts instead of trousers. */
  shorts?: boolean;
  /** Western outfit: long sleeves. */
  longSleeves?: boolean;
  /** Uniform: skirt instead of trousers. */
  skirt?: boolean;
  seed?: number;
}

// ---- skeleton --------------------------------------------------------------------------------------------
export const BONE_NAMES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'skirt', 'skirt2',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];
const PARENT: Record<BoneName, BoneName | null> = {
  root: null, hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  armL: 'chest', foreL: 'armL', handL: 'foreL', armR: 'chest', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR', skirt: 'hips', skirt2: 'skirt',
};
const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i])) as Record<BoneName, number>;

export interface Dims {
  H: number; child: boolean;
  headH: number; headW: number; headD: number; headBase: number;
  neckH: number; shY: number; chestY: number; waistY: number; hipY: number; hipJ: number;
  kneeY: number; ankleY: number; thigh: number; shin: number;
  torsoW: number; torsoD: number; armT: number; legT: number; shX: number; hipX: number;
  upper: number; fore: number; elbowY: number; wristY: number; handH: number; footLen: number;
}

export function dimsFor(spec: CharSpec): Dims {
  const H = spec.height ?? 1.65;
  const child = spec.child ?? H < 1.42;
  const kw = (spec.build ?? 1) * (spec.female ? 0.92 : 1);
  const headH = child ? H * 0.19 : H * 0.135;
  const headW = headH * 0.86, headD = headH * 0.92;
  const neckH = child ? 0.03 : 0.05;
  const headBase = H - headH;
  const shY = headBase - neckH - 0.005;
  const hipY = H * (child ? 0.47 : 0.52);
  const hipJ = hipY - 0.035;
  const ankleY = child ? 0.06 : 0.075;
  const legLen = hipJ - ankleY;
  const thigh = legLen * 0.52, shin = legLen - thigh;
  const kneeY = hipJ - thigh;
  const torsoW = (child ? 0.28 : 0.33) * kw * (H / (child ? 1.3 : 1.7)) ** 0.5;
  const torsoD = torsoW * 0.6;
  const armT = child ? 0.07 : 0.082;
  const legT = child ? 0.09 : 0.11;
  const upper = H * (child ? 0.165 : 0.17), fore = H * (child ? 0.145 : 0.15);
  const shX = torsoW / 2 + armT * 0.42;
  const elbowY = shY - 0.02 - upper;
  const wristY = elbowY - fore;
  return {
    H, child, headH, headW, headD, headBase, neckH, shY,
    chestY: lerp(hipY, shY, 0.5), waistY: lerp(hipY, shY, 0.22), hipY, hipJ, kneeY, ankleY, thigh, shin,
    torsoW, torsoD, armT, legT, shX, hipX: torsoW * 0.26, upper, fore, elbowY, wristY,
    handH: child ? 0.075 : 0.09, footLen: child ? 0.19 : 0.25,
  };
}

/** Joint position (model space, bind pose) of every bone. */
function jointPositions(d: Dims): Record<BoneName, V3> {
  return {
    root: [0, 0, 0], hips: [0, d.hipY, 0], spine: [0, d.waistY, 0], chest: [0, d.chestY, 0],
    neck: [0, d.shY, 0], head: [0, d.headBase, 0],
    armL: [d.shX, d.shY - 0.02, 0], foreL: [d.shX, d.elbowY, 0], handL: [d.shX, d.wristY, 0],
    armR: [-d.shX, d.shY - 0.02, 0], foreR: [-d.shX, d.elbowY, 0], handR: [-d.shX, d.wristY, 0],
    thighL: [d.hipX, d.hipJ, 0], shinL: [d.hipX, d.kneeY, 0], footL: [d.hipX, d.ankleY, 0],
    thighR: [-d.hipX, d.hipJ, 0], shinR: [-d.hipX, d.kneeY, 0], footR: [-d.hipX, d.ankleY, 0],
    // the robe pivots with the thighs (hip joints) and bends again at the knees
    skirt: [0, d.hipJ, 0], skirt2: [0, d.kneeY, 0],
  };
}

// ---- rig ---------------------------------------------------------------------------------------------------
export interface Rig {
  root: Group;
  mesh: SkinnedMesh;
  bones: Record<BoneName, Bone>;
  dims: Dims;
  spec: CharSpec;
  /** Animated hand props (prayer-wheel drum spins). */
  props: { drum?: Object3D };
  /** Internal animation state. */
  st: { phase: number; air: number; walk: number; run: number; landT: number; wasGrounded: boolean; seed: number; act: number };
}

type PartsByBone = Record<BoneName, Parts>;

const mixHex = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const shade = (hex: number, k: number) => mixHex(hex, k < 1 ? 0x000000 : 0xffffff, Math.abs(1 - k));

const DEFAULTS: Record<Outfit, Partial<CharSpec>> = {
  chuba: { robe: PAL.chubaMaroon, trim: PAL.sashGold, shirt: PAL.blouseWhite, sash: PAL.sashRed, pants: PAL.chubaBlack, shoes: PAL.bootRed, shoeBand: PAL.bootGreen },
  chubaF: { robe: PAL.chubaBlack, trim: PAL.sashGold, shirt: PAL.blousePink, pants: PAL.chubaBlack, shoes: PAL.bootBlack, shoeBand: PAL.bootRed, female: true },
  monk: { robe: PAL.monkMaroon, trim: PAL.monkYellow, shirt: PAL.monkYellow, pants: PAL.monkMaroonDark, shoes: PAL.chubaBrown, hairStyle: 'shaved' },
  nun: { robe: PAL.monkMaroon, trim: PAL.monkYellow, shirt: PAL.monkYellow, pants: PAL.monkMaroonDark, shoes: PAL.chubaBrown, hairStyle: 'shaved', female: true },
  western: { shirt: 0x6f8f6a, pants: PAL.denim, shoes: 0xd8d4cc, shoeBand: 0x555555 },
  kurta: { robe: 0xe8e0cc, shirt: 0xe8e0cc, pants: 0xeeeae0, shoes: PAL.chubaBrown },
  jacket: { robe: PAL.fleece, shirt: 0x2f3a46, pants: PAL.denim, shoes: 0x3a3634, shoeBand: 0xbbbbbb, hat: 'beanie' },
  uniform: { robe: 0x2b3a5c, shirt: PAL.blouseWhite, pants: 0x55575c, shoes: PAL.bootBlack, trim: 0xa33a2f },
};

/** Build a character. Deterministic for a given spec + seed. */
export function buildCharacter(input: CharSpec): Rig {
  const spec: CharSpec = { ...DEFAULTS[input.outfit], ...input };
  const d = dimsFor(spec);
  const r = rng(spec.seed ?? 7);
  const P = Object.fromEntries(BONE_NAMES.map((n) => [n, new Parts()])) as PartsByBone;
  const J = jointPositions(d);

  const skin = spec.skin ?? PAL.skin;
  const hair = spec.hair ?? PAL.hair;
  const robe = spec.robe ?? PAL.chubaMaroon;
  const trim = spec.trim ?? PAL.sashGold;
  const shirt = spec.shirt ?? PAL.blouseWhite;
  const pants = spec.pants ?? PAL.chubaBlack;
  const shoes = spec.shoes ?? PAL.bootBlack;
  const o = spec.outfit;
  const longGarment = o === 'chubaF' || o === 'monk' || o === 'nun';
  const tw = d.torsoW, td = d.torsoD;
  const fz = td / 2; // torso front z

  // ---- head & face ---------------------------------------------------------------------------------------
  const hb = d.headBase, hh = d.headH, hw = d.headW, hd = d.headD;
  const H = P.head;
  H.box(hw, hh * 0.9, hd, [0, hb + hh * 0.45, 0], skin);
  H.box(hw * 0.7, hh * 0.12, hd * 0.8, [0, hb + hh * 0.05, -0.005], shade(skin, 0.92)); // jaw/chin
  H.box(0.022, 0.05, 0.04, [hw / 2 + 0.008, hb + hh * 0.45, -0.01], shade(skin, 0.9)); // ears
  H.box(0.022, 0.05, 0.04, [-hw / 2 - 0.008, hb + hh * 0.45, -0.01], shade(skin, 0.9));
  const eyeY = hb + hh * 0.5;
  H.box(0.034, 0.042, 0.012, [hw * 0.22, eyeY, hd / 2 + 0.004], 0x1a1414);
  H.box(0.034, 0.042, 0.012, [-hw * 0.22, eyeY, hd / 2 + 0.004], 0x1a1414);
  H.box(0.03, 0.045, 0.025, [0, eyeY - 0.045, hd / 2 + 0.01], shade(skin, 0.94)); // nose
  if (spec.cheeks ?? (o === 'chuba' || o === 'chubaF' || d.child)) {
    const ck = mixHex(skin, PAL.cheek, 0.55);
    H.box(0.045, 0.03, 0.01, [hw * 0.32, eyeY - 0.055, hd / 2 + 0.002], ck);
    H.box(0.045, 0.03, 0.01, [-hw * 0.32, eyeY - 0.055, hd / 2 + 0.002], ck);
  }
  if (spec.glasses) {
    H.box(hw * 0.82, 0.012, 0.012, [0, eyeY + 0.026, hd / 2 + 0.012], 0x222222);
    H.box(0.05, 0.05, 0.008, [hw * 0.22, eyeY, hd / 2 + 0.012], 0x5a6878);
    H.box(0.05, 0.05, 0.008, [-hw * 0.22, eyeY, hd / 2 + 0.012], 0x5a6878);
  }

  // hair
  const hs = spec.hairStyle ?? (spec.female ? 'braids' : 'short');
  const top = hb + hh * 0.9;
  const cap = (k: number, col = hair) => H.box(hw + 0.024, hh * k, hd + 0.024, [0, top - hh * k / 2 + 0.02, 0], col);
  const back = (k: number, col = hair) => H.box(hw + 0.024, hh * k, 0.04, [0, top - hh * k / 2, -hd / 2 - 0.012], col);
  if (hs === 'shaved') {
    cap(0.24, mixHex(skin, hair, 0.3)); // close-shaved: a faint stubble tone over the crown
  } else if (hs !== 'none') {
    cap(0.3); back(hs === 'short' || hs === 'messy' ? 0.62 : 0.8);
    H.box(0.024, hh * 0.38, hd * 0.7, [hw / 2 + 0.01, top - hh * 0.22, -0.02], hair); // sideburn blocks
    H.box(0.024, hh * 0.38, hd * 0.7, [-hw / 2 - 0.01, top - hh * 0.22, -0.02], hair);
    if (hs === 'short' || hs === 'messy') {
      H.box(hw * 0.92, 0.045, 0.03, [0.01, top - 0.035, hd / 2 + 0.005], hair); // fringe
      if (hs === 'messy') for (let i = 0; i < 5; i++) {
        H.box(0.05, 0.035, 0.05, [(r() - 0.5) * hw * 0.8, top + 0.03, (r() - 0.5) * hd * 0.7], hair, { rot: [0, r() * 3, (r() - 0.5) * 0.6] });
      }
    }
    if (hs === 'bun') H.box(0.11, 0.09, 0.08, [0, top - 0.02, -hd / 2 - 0.05], hair);
    if (hs === 'bob' || hs === 'long') {
      H.box(0.03, hh * 0.7, hd * 0.85, [hw / 2 + 0.018, top - hh * 0.4, -0.01], hair);
      H.box(0.03, hh * 0.7, hd * 0.85, [-hw / 2 - 0.018, top - hh * 0.4, -0.01], hair);
    }
    if (hs === 'long') P.chest.box(tw * 0.75, 0.22, 0.04, [0, d.shY - 0.08, -td / 2 - 0.025], hair);
    if (hs === 'braids') {
      // two braids hanging down the back with red yarn at the ends (Gorshey)
      for (const sx of [1, -1]) {
        P.chest.box(0.045, 0.3, 0.045, [sx * 0.05, d.shY - 0.12, -td / 2 - 0.03], hair);
        P.chest.box(0.05, 0.06, 0.05, [sx * 0.05, d.shY - 0.3, -td / 2 - 0.03], PAL.sashRed);
      }
    }
  }

  // hats
  const hatCol = spec.hatColor ?? (spec.hat === 'fur' ? PAL.sashGold : 0x8a2f3a);
  if (spec.hat === 'cap') {
    H.box(hw + 0.035, 0.08, hd + 0.035, [0, top + 0.01, 0], hatCol);
    H.box(hw * 0.85, 0.02, 0.1, [0, top - 0.02, hd / 2 + 0.05], shade(hatCol, 0.8));
  } else if (spec.hat === 'beanie') {
    H.box(hw + 0.04, hh * 0.36, hd + 0.04, [0, top - hh * 0.08, 0], hatCol);
    H.box(hw + 0.05, 0.04, hd + 0.05, [0, top - hh * 0.25, 0], shade(hatCol, 0.8));
  } else if (spec.hat === 'sunhat') {
    H.cyl(hw * 1.15, hw * 1.15, 0.02, [0, top - 0.04, 0], hatCol, 10);
    H.cyl(hw * 0.55, hw * 0.6, 0.09, [0, top - 0.03, 0], hatCol, 8);
  } else if (spec.hat === 'fur') {
    H.box(hw + 0.02, 0.1, hd + 0.02, [0, top + 0.03, 0], hatCol);
    H.box(hw + 0.08, 0.07, hd + 0.08, [0, top - 0.04, 0], PAL.furLight);
  }

  // neck
  P.neck.box(0.075, d.neckH + 0.03, 0.07, [0, d.shY + d.neckH / 2, 0], skin);

  // ---- torso / garments ----------------------------------------------------------------------------------
  const C = P.chest, S = P.spine, Hp = P.hips, K = P.skirt, K2 = P.skirt2;
  const chestH = d.shY - d.chestY + 0.025;
  const absH = d.chestY - d.waistY + 0.02;
  const torso = (col: number, upperCol = col) => {
    C.taper(tw, td, tw * 0.9, td * 0.92, chestH, [0, d.chestY - 0.01, 0], upperCol);
    S.box(tw * 0.96, absH, td * 0.98, [0, d.waistY + absH / 2 - 0.01, 0], col);
    Hp.box(tw * 0.92, d.waistY - d.hipJ + 0.06, td * 0.95, [0, (d.waistY + d.hipJ) / 2 - 0.02, 0], col);
  };
  // arm segments: upper (bone armX), fore (foreX), hand (handX)
  const arm = (side: 1 | -1, upperCol: number, foreCol: number, cuff?: number, puffy = 1) => {
    const ax = side * d.shX, a = side > 0 ? 'L' : 'R';
    const t = d.armT * puffy;
    P[`arm${a}` as BoneName].box(t, d.upper + 0.03, t, [ax, d.shY - 0.02 - d.upper / 2, 0], upperCol);
    P[`arm${a}` as BoneName].box(t * 1.05, 0.05, t * 1.05, [ax, d.shY - 0.03, 0], upperCol); // shoulder cap
    P[`fore${a}` as BoneName].box(t * 0.92, d.fore + 0.02, t * 0.92, [ax, d.elbowY - d.fore / 2, 0], foreCol);
    if (cuff !== undefined) P[`fore${a}` as BoneName].box(t * 1.02, 0.04, t * 1.02, [ax, d.wristY + 0.02, 0], cuff);
    P[`hand${a}` as BoneName].box(d.armT * 0.85, d.handH, d.armT * 0.7, [ax, d.wristY - d.handH / 2, 0.005], skin);
  };
  const legs = (thighCol: number, shinCol: number) => {
    for (const side of [1, -1] as const) {
      const lx = side * d.hipX, a = side > 0 ? 'L' : 'R';
      P[`thigh${a}` as BoneName].box(d.legT, d.thigh + 0.04, d.legT * 1.05, [lx, d.hipJ - d.thigh / 2, 0], thighCol);
      P[`shin${a}` as BoneName].box(d.legT * 0.88, d.shin + 0.02, d.legT * 0.9, [lx, d.kneeY - d.shin / 2, 0], shinCol);
    }
  };
  const feet = (col: number, sole = 0x2a2422, band?: number, upturn = false) => {
    for (const side of [1, -1] as const) {
      const lx = side * d.hipX, F = P[side > 0 ? 'footL' : 'footR'];
      F.box(d.legT * 0.95, d.ankleY + 0.025, d.footLen, [lx, (d.ankleY + 0.025) / 2, d.footLen * 0.28], col);
      F.box(d.legT, 0.025, d.footLen + 0.01, [lx, 0.0125, d.footLen * 0.28], sole);
      if (upturn) F.box(d.legT * 0.6, 0.03, 0.04, [lx, d.ankleY - 0.005, d.footLen * 0.28 + d.footLen / 2], col);
      if (band !== undefined) F.box(d.legT * 0.98, 0.02, d.footLen * 0.7, [lx, d.ankleY, d.footLen * 0.2], band);
    }
  };
  // A skirt that reaches below the knee is split there: the upper part rides the skirt bone, the lower part
  // skirt2 (it overlaps a little upward so the fold has no notch when the knee bends).
  const skirtTaper = (hemY: number, col: number, flare = 0.1, topW = tw * 1.02, topD = td * 1.04) => {
    const h = d.waistY - hemY;
    const botW = topW + flare, botD = topD + flare * 0.8;
    const split = hemY < d.kneeY - 0.08;
    if (!split) K.taper(botW, botD, topW, topD, h, [0, hemY, 0], col);
    else {
      const at = (y: number) => clamp((y - hemY) / h);
      const kk = at(d.kneeY);
      K.taper(lerp(botW, topW, kk), lerp(botD, topD, kk), topW, topD, d.waistY - d.kneeY, [0, d.kneeY, 0], col);
      const e = Math.min(0.06, botD * 0.4), ke = at(d.kneeY + e);
      K2.taper(botW, botD, lerp(botW, topW, ke) * 0.985, lerp(botD, topD, ke) * 0.985, d.kneeY + e - hemY, [0, hemY, 0], col);
    }
    return { h, botW, botD, split };
  };

  if (o === 'chuba') {
    // men's / boys' chuba: right arm out of the robe showing the silk shirt, knee length, sash
    torso(robe);
    C.box(tw * 0.5, chestH * 0.9, 0.012, [-tw * 0.24, d.chestY + chestH * 0.5, fz + 0.012], shirt); // shirt on the right chest
    C.box(tw * 0.42, 0.04, td * 0.9, [-tw * 0.29, d.shY + 0.005, 0], shirt);                  // right shoulder top
    const dx = -tw * 0.5 - 0.02, dy = d.chestY - d.shY + 0.03;
    const L = Math.hypot(dx, dy);
    C.box(0.034, L, 0.014, [dx / 2 + 0.02, d.shY + dy / 2, fz + 0.016], trim, { rot: [0, 0, Math.atan2(-dx, dy)] }); // wrap line
    C.box(tw * 0.28, 0.035, 0.02, [tw * 0.12, d.shY - 0.005, fz + 0.012], trim); // collar
    arm(1, robe, robe, trim);              // left arm in the chuba sleeve, brocade cuff
    arm(-1, shirt, shirt, shade(shirt, 0.9)); // right arm in the shirt sleeve
    S.box(tw + 0.03, 0.075, td + 0.03, [0, d.waistY + 0.01, 0], spec.sash ?? PAL.sashRed); // sash
    const k = skirtTaper(d.kneeY + 0.02, robe, 0.12);
    K.taper(k.botW + 0.005, k.botD + 0.005, k.botW - 0.01, k.botD - 0.01, 0.04, [0, d.kneeY + 0.02, 0], trim); // hem
    K.box(0.06, 0.2, 0.03, [tw * 0.3, d.waistY - 0.12, fz + 0.04], spec.sash ?? PAL.sashRed);  // sash tail
    K.box(0.085, 0.3, 0.08, [-tw / 2 - 0.035, d.waistY - 0.16, -0.03], robe);                  // empty right sleeve
    K.box(0.09, 0.04, 0.085, [-tw / 2 - 0.035, d.waistY - 0.31, -0.03], trim);
    legs(pants, spec.shoes ?? PAL.bootRed);
    for (const side of [1, -1] as const) P[side > 0 ? 'shinL' : 'shinR'].box(d.legT * 0.92, 0.035, d.legT * 0.94, [side * d.hipX, d.kneeY - 0.06, 0], spec.shoeBand ?? PAL.bootGreen);
    feet(spec.shoes ?? PAL.bootRed, 0x2a2422, undefined, true);
  } else if (o === 'chubaF') {
    // women's sleeveless chuba over a silk blouse, ankle length, pangden apron if married
    torso(robe);
    C.box(0.07, 0.07, 0.012, [0, d.shY - 0.02, fz + 0.012], shirt); // blouse at the collar
    C.box(0.03, chestH * 0.8, 0.014, [-0.04, d.chestY + chestH * 0.45, fz + 0.014], trim);
    arm(1, shirt, shirt, shade(shirt, 0.88), 0.95);
    arm(-1, shirt, shirt, shade(shirt, 0.88), 0.95);
    if (spec.sash !== undefined) S.box(tw + 0.025, 0.06, td + 0.025, [0, d.waistY + 0.01, 0], spec.sash);
    const hem = 0.09;
    const k = skirtTaper(hem, robe, 0.14);
    if (spec.apron !== null) {
      const stripes = spec.apron ?? PANGDEN[Math.floor(r() * PANGDEN.length)];
      const top0 = d.waistY - 0.02, bot = hem + 0.08, n = stripes.length;
      const slope = Math.atan(((k.botD - td * 1.04) / 2) / k.h);
      const band = (y0: number, y1: number, col: number, B: Parts) => {
        const t = (y0 + y1) / 2;
        const zf = lerp(k.botD / 2, td * 1.04 / 2, (t - hem) / k.h) + 0.01;
        B.box(tw * 0.74, y1 - y0 + 0.002, 0.012, [0, t, zf], col, { rot: [slope, 0, 0] });
      };
      for (let i = 0; i < n; i++) {
        // stripes a touch softer than the raw dye colours, so the apron sits in the town's muted palette
        const col = mixHex(stripes[i], robe, 0.12);
        const y1 = lerp(top0, bot, i / n), y0 = lerp(top0, bot, (i + 1) / n);
        if (!k.split || y0 >= d.kneeY) band(y0, y1, col, K);
        else if (y1 <= d.kneeY) band(y0, y1, col, K2);
        else { band(d.kneeY, y1, col, K); band(y0, d.kneeY, col, K2); }
      }
    }
    legs(pants, pants);
    feet(shoes, 0x2a2422, spec.shoeBand, true);
  } else if (o === 'monk' || o === 'nun') {
    // zen shawl over the left shoulder, right arm bare, saffron donka edge, shamthab skirt
    torso(robe);
    C.box(tw * 0.45, chestH * 0.75, 0.012, [-tw * 0.26, d.chestY + chestH * 0.48, fz + 0.012], shirt); // donka (saffron) on the right chest
    const dx = -tw * 0.55, dy = -(d.shY - d.waistY) * 0.95;
    const L = Math.hypot(dx, dy);
    C.box(0.12, L, td + 0.05, [tw * 0.22 + dx / 2, d.shY + dy / 2 + 0.02, 0], shade(robe, 0.86), { rot: [0, 0, Math.atan2(-dx, dy)] }); // shawl drape
    arm(1, robe, skin, undefined, 1.25); // shawl covers the left upper arm
    arm(-1, skin, skin);
    const hem = 0.07;
    skirtTaper(hem, robe, 0.18, tw * 1.08, td * 1.1);
    legs(spec.pants ?? PAL.monkMaroonDark, spec.pants ?? PAL.monkMaroonDark);
    feet(shoes);
  } else if (o === 'western') {
    const jacket = spec.robe;
    torso(jacket ?? shirt);
    if (jacket !== undefined) C.box(tw * 0.22, chestH * 0.95, 0.012, [0, d.chestY + chestH * 0.48, fz + 0.012], shirt);
    const sleeve = jacket ?? shirt;
    const long = jacket !== undefined || spec.longSleeves;
    arm(1, sleeve, long ? sleeve : skin);
    arm(-1, sleeve, long ? sleeve : skin);
    if (!long) for (const side of [1, -1] as const) P[side > 0 ? 'armL' : 'armR'].box(d.armT * 1.06, 0.03, d.armT * 1.06, [side * d.shX, d.shY - 0.02 - d.upper * 0.6, 0], shade(sleeve, 0.9));
    Hp.box(tw * 0.95, 0.06, td * 0.97, [0, d.waistY - 0.01, 0], pants);
    Hp.box(tw * 0.94, d.waistY - d.hipJ + 0.04, td * 0.96, [0, (d.waistY + d.hipJ) / 2 - 0.03, 0], pants);
    legs(pants, spec.shorts ? skin : pants);
    if (spec.shorts) for (const side of [1, -1] as const) P[side > 0 ? 'shinL' : 'shinR'].box(d.legT * 0.95, 0.08, d.legT * 0.95, [side * d.hipX, d.kneeY + 0.0, 0], pants);
    feet(shoes, 0x3a3634, spec.shoeBand);
  } else if (o === 'kurta') {
    torso(robe);
    C.box(0.03, chestH * 0.7, 0.012, [0, d.chestY + chestH * 0.5, fz + 0.012], shade(robe, 0.85)); // placket
    arm(1, robe, robe); arm(-1, robe, robe);
    skirtTaper(d.kneeY + d.thigh * 0.35, robe, 0.08);
    if (spec.female) { // dupatta scarf across the chest
      C.box(0.09, chestH * 1.3, td + 0.04, [0, d.chestY + chestH * 0.5, 0], spec.trim ?? PAL.blouseLilac, { rot: [0, 0, 0.7] });
    }
    legs(pants, pants);
    feet(shoes);
  } else if (o === 'jacket') {
    torso(robe);
    for (let i = 0; i < 3; i++) C.box(tw + 0.012, 0.012, td + 0.012, [0, d.chestY + 0.03 + i * chestH * 0.3, 0], shade(robe, 0.82)); // quilting
    C.box(tw * 0.5, 0.05, td * 0.8, [0, d.shY + 0.01, 0], shade(robe, 0.9)); // collar
    C.box(0.02, chestH, 0.012, [0, d.chestY + chestH * 0.48, fz + 0.012], 0x2a2a2a); // zip
    arm(1, robe, robe, shade(robe, 0.8), 1.12); arm(-1, robe, robe, shade(robe, 0.8), 1.12);
    S.box(tw * 0.98, 0.04, td + 0.012, [0, d.waistY + 0.02, 0], shade(robe, 0.8));
    legs(pants, pants);
    feet(shoes, 0x2a2422, spec.shoeBand);
  } else if (o === 'uniform') {
    torso(robe);
    C.box(0.1, 0.05, 0.012, [0, d.shY - 0.015, fz + 0.012], shirt); // collar
    C.box(0.025, chestH * 0.75, 0.014, [0, d.chestY + chestH * 0.5, fz + 0.014], spec.trim ?? 0xa33a2f); // tie
    arm(1, robe, robe, shirt); arm(-1, robe, robe, shirt);
    if (spec.skirt) {
      skirtTaper(d.kneeY - 0.02, pants, 0.1);
      legs(skin, skin);
      for (const side of [1, -1] as const) P[side > 0 ? 'shinL' : 'shinR'].box(d.legT * 0.92, 0.14, d.legT * 0.92, [side * d.hipX, d.ankleY + 0.08, 0], 0xeeeeee); // socks
    } else legs(pants, pants);
    feet(shoes);
  }

  if (longGarment) {
    // feet peek out under the long robe: hide shins/thighs from the skirt's flare naturally
  }
  if (spec.wristMala) P.foreL.box(d.armT * 1.12, 0.03, d.armT * 1.12, [d.shX, d.wristY + 0.035, 0], 0x5a2a1a);

  // bags
  if (spec.bag === 'backpack') {
    const bc = spec.bagColor ?? 0x3d5f86;
    C.box(tw * 0.85, 0.36, 0.17, [0, d.chestY + 0.02, -td / 2 - 0.085], bc);
    C.box(tw * 0.7, 0.12, 0.05, [0, d.chestY - 0.06, -td / 2 - 0.19], shade(bc, 0.8));
    for (const sx of [1, -1]) C.box(0.035, chestH, 0.012, [sx * tw * 0.28, d.chestY + chestH * 0.5, fz + 0.012], shade(bc, 0.7));
  } else if (spec.bag === 'shoulder') {
    const bc = spec.bagColor ?? PAL.khaki;
    K.box(0.06, 0.24, 0.2, [tw / 2 + 0.05, d.waistY - 0.1, 0.02], bc);
    C.box(0.03, (d.shY - d.waistY) * 1.3, 0.012, [0, d.chestY + 0.02, fz + 0.014], shade(bc, 0.7), { rot: [0, 0, -0.75] });
  }

  // ---- assemble skinned mesh ---------------------------------------------------------------------------
  const geos: BufferGeometry[] = [];
  for (const n of BONE_NAMES) {
    if (!P[n].size) continue;
    const g = P[n].merge();
    const cnt = g.attributes.position.count;
    const si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
    for (let i = 0; i < cnt; i++) { si[i * 4] = BI[n]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(sw, 4));
    geos.push(g);
  }
  const geo = mergeGeometries(geos, false)!;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const bones = {} as Record<BoneName, Bone>;
  for (const n of BONE_NAMES) { const b = new Bone(); b.name = n; bones[n] = b; }
  for (const n of BONE_NAMES) {
    const p = PARENT[n];
    const [x, y, z] = J[n];
    if (p) { const [px, py, pz] = J[p]; bones[n].position.set(x - px, y - py, z - pz); bones[p].add(bones[n]); }
    else bones[n].position.set(x, y, z);
  }
  const mesh = new SkinnedMesh(geo, charMaterial());
  mesh.add(bones.root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(BONE_NAMES.map((n) => bones[n])));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // skinned bounds don't follow poses; figures are small and few

  const root = new Group();
  root.add(mesh);

  const rig: Rig = {
    root, mesh, bones, dims: d, spec, props: {},
    st: { phase: r() * TAU, air: 0, walk: 0, run: 0, landT: 9, wasGrounded: true, seed: r() * 100, act: 0 },
  };
  if (spec.holdR) attachProp(rig, 'R', spec.holdR);
  if (spec.holdL) attachProp(rig, 'L', spec.holdL);
  return rig;
}

let _charMat: ReturnType<typeof partsMaterial> | null = null;
const charMaterial = () => (_charMat ??= partsMaterial({ grain: 0.045, grainScale: 22, key: 'character' }));

// ---- hand props --------------------------------------------------------------------------------------------
/** Attach a held prop to a hand (replaces nothing; call once). */
export function attachProp(rig: Rig, side: 'L' | 'R', kind: Held) {
  const d = rig.dims;
  const hand = rig.bones[side === 'L' ? 'handL' : 'handR'];
  const p = new Parts();
  const gy = -d.handH * 0.6; // grip point below the wrist, in hand-local space
  let drum: Object3D | undefined;
  if (kind === 'prayerWheel') {
    // handle along local +z (vertical when the forearm is bent forward ~90°)
    p.box(0.022, 0.022, 0.26, [0, gy, 0.1], PAL.woodTrim);
    const dp = new Parts();
    dp.cyl(0.068, 0.068, 0.095, [0, -0.0475, 0], PAL.khorloCopper, 8, { rot: [Math.PI / 2, 0, 0] });
    dp.box(0.14, 0.024, 0.024, [0, 0, 0], PAL.gold);
    dp.cone(0.045, 0.06, [0, 0, 0.05], PAL.gold, 6, { rot: [Math.PI / 2, 0, 0] });
    dp.box(0.03, 0.03, 0.03, [0.1, 0, 0], PAL.rockDark); // chain weight
    drum = dp.toMesh(charMaterial());
    drum.position.set(0, gy, 0.28);
  } else if (kind === 'mala') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      p.box(0.022, 0.022, 0.022, [Math.cos(a) * 0.05, gy - 0.07 + Math.sin(a) * 0.07, 0.02], i % 6 === 0 ? PAL.coral : 0x5a2a1a);
    }
    p.box(0.02, 0.05, 0.02, [0, gy - 0.17, 0.02], PAL.sashRed);
  } else if (kind === 'stick') {
    p.box(0.03, d.wristY + 0.05, 0.03, [0, gy - d.wristY / 2 + 0.05, 0.03], PAL.woodTrim);
  } else if (kind === 'phone') {
    p.box(0.045, 0.012, 0.09, [0, gy + 0.005, 0.03], 0x1c1c1e, { emit: 0x8fb4cf, emitIntensity: 0.6 });
  } else if (kind === 'plate') {
    p.cyl(0.12, 0.1, 0.02, [0, gy, 0.12], 0xf1ede4, 10);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p.box(0.045, 0.035, 0.045, [Math.cos(a) * 0.06, gy + 0.03, 0.12 + Math.sin(a) * 0.06], 0xefe2c4);
    }
  } else if (kind === 'bag') {
    p.box(0.2, 0.24, 0.1, [0, gy - 0.16, 0], 0xe8e4da);
    p.box(0.02, 0.1, 0.02, [0, gy - 0.02, 0], 0xe8e4da);
  }
  const obj = new Group();
  if (p.size) obj.add(p.toMesh(charMaterial()));
  if (drum) { obj.add(drum); rig.props.drum = drum; }
  obj.traverse((o) => { o.castShadow = true; });
  hand.add(obj);
  // the hand bone's local frame equals model space (bind pose has no rotation): props are authored relative
  // to the wrist joint, so shift them by −wrist
  obj.position.set(0, 0, 0);
  return obj;
}

// ---- animation ---------------------------------------------------------------------------------------------
export type Action =
  | 'spin' | 'wave' | 'give' | 'bow' | 'pray' | 'light' | 'pet' | 'eat' | 'talk' | 'clap' | 'sit' | 'mala'
  | 'phone' | 'stick' | 'wheelWalk' | 'point' | 'carry'
  /** Cross-legged on a cushion / the floor (debate defenders, prayer); seatY = cushion top. */
  | 'sitCross';

export interface AnimInput {
  /** Frame delta (use game.dt). */
  dt: number;
  /** Seconds (game.time). */
  time: number;
  /** Horizontal speed m/s. */
  speed: number;
  grounded: boolean;
  /** Vertical velocity (m/s), for jump poses. */
  vy: number;
  action?: Action | null;
  /** Seconds since the action started (one-shots), default uses time. */
  actionT?: number;
  /** Head yaw relative to the body (look at something). */
  lookYaw?: number;
  /** Head pitch (+ looks down). */
  lookPitch?: number;
  /** Seat surface height above the feet for 'sit' (bench) and 'sitCross' (cushion top), m. */
  seatY?: number;
}

// target pose scratch (rx, ry, rz per bone) + hips height
const T = new Float32Array(BONE_NAMES.length * 3);
// robe scale targets: skirt (x = lap width, y = reach over the thighs, z = thickness × walking flare),
// skirt2 (y = drop length)
const KS = new Float32Array(4);
const set = (b: BoneName, x: number, y = 0, z = 0) => { const i = BI[b] * 3; T[i] = x; T[i + 1] = y; T[i + 2] = z; };
const add = (b: BoneName, x: number, y = 0, z = 0) => { const i = BI[b] * 3; T[i] += x; T[i + 1] += y; T[i + 2] += z; };

/** Pose the rig for this frame (procedural walk / run / jump / idle + upper-body actions). */
export function animateCharacter(rig: Rig, a: AnimInput) {
  const { bones, dims: d, st } = rig;
  const dt = a.dt;
  if (dt <= 0) return;
  T.fill(0);
  KS[0] = 1; KS[1] = 1; KS[2] = 1; KS[3] = 1;

  // blend weights
  st.walk = damp(st.walk, clamp(a.speed / 1.0), 12, dt);
  st.run = damp(st.run, clamp((a.speed - 2.6) / 1.6), 8, dt);
  st.air = damp(st.air, a.grounded ? 0 : 1, a.grounded ? 20 : 10, dt);
  if (a.grounded && !st.wasGrounded) st.landT = 0;
  st.wasGrounded = a.grounded;
  st.landT += dt;
  const w = st.walk * (1 - st.air), r = st.run;
  const cycle = d.H * (1.05 + 0.65 * r);
  st.phase = (st.phase + (a.speed / cycle) * TAU * dt) % (TAU * 100);
  const s = Math.sin(st.phase), c = Math.cos(st.phase);

  // ---- locomotion ---------------------------------------------------------------------------------------
  const A = 0.5 + 0.38 * r;
  set('thighL', -s * A * w); set('thighR', s * A * w);
  const flexL = (Math.max(0, c) * (0.7 + 0.7 * r) + 0.08) * w, flexR = (Math.max(0, -c) * (0.7 + 0.7 * r) + 0.08) * w;
  set('shinL', flexL); set('shinR', flexR);
  set('footL', (s * A * w - flexL) * 0.55); set('footR', (-s * A * w - flexR) * 0.55);
  let hipsY = (Math.abs(c) - 0.6) * (0.03 + 0.05 * r) * w;
  set('hips', 0, s * 0.12 * w, c * 0.035 * w);
  const lean = 0.04 * w + 0.2 * r;
  set('spine', lean, 0, 0);
  set('chest', 0, -s * 0.16 * w, 0);
  const armA = (0.42 + 0.5 * r) * w;
  set('armL', s * armA, 0, 0.07 + 0.1 * r); set('armR', -s * armA, 0, -(0.07 + 0.1 * r));
  set('foreL', -(0.18 + 0.9 * r + 0.25 * Math.max(0, -s) * w)); set('foreR', -(0.18 + 0.9 * r + 0.25 * Math.max(0, s) * w));
  set('head', -lean * 0.6, s * 0.05 * w, 0);
  set('skirt', -lean * 0.5, 0, -c * 0.03 * w);
  set('skirt2', 0.04 * w * Math.abs(s), 0, -c * 0.035 * w); // the hem swings a little more than the hips

  // idle life: breathing, weight shift, looking around
  const idle = 1 - st.walk;
  const t = a.time + st.seed;
  add('chest', Math.sin(t * 2.1) * 0.018 * idle);
  add('hips', 0, 0, Math.sin(t * 0.43) * 0.025 * idle);
  add('head', Math.sin(t * 0.23) * 0.06 * idle, (Math.sin(t * 0.31) * 0.35 + Math.sin(t * 0.13) * 0.2) * idle * 0.6, 0);
  add('armL', 0, 0, Math.sin(t * 2.1) * 0.012 * idle);

  // airborne: tuck one leg, arms out
  if (st.air > 0.01) {
    const k = st.air, rising = a.vy > 0 ? 1 : 0;
    const L = (b: BoneName, x: number, y = 0, z = 0) => {
      const i = BI[b] * 3;
      T[i] = lerp(T[i], x, k); T[i + 1] = lerp(T[i + 1], y, k); T[i + 2] = lerp(T[i + 2], z, k);
    };
    L('thighL', rising ? -1.0 : -0.45); L('shinL', rising ? 1.3 : 0.6);
    L('thighR', rising ? 0.25 : -0.15); L('shinR', rising ? 0.6 : 0.35);
    L('footL', -0.2); L('footR', 0.2);
    L('armL', -0.45, 0, rising ? 0.85 : 1.2); L('armR', -0.25, 0, rising ? -0.85 : -1.2);
    L('foreL', -0.5); L('foreR', -0.5);
    L('spine', 0.12); L('skirt', -0.15); L('skirt2', 0.1);
  }
  // landing squash
  if (st.landT < 0.22) {
    const k = Math.sin((st.landT / 0.22) * Math.PI) * (1 - st.air);
    hipsY -= 0.07 * k * d.H;
    add('thighL', -0.45 * k); add('thighR', -0.45 * k); add('shinL', 0.9 * k); add('shinR', 0.9 * k);
    add('footL', -0.45 * k); add('footR', -0.45 * k); add('spine', 0.15 * k);
  }

  // ---- actions (upper body; some also legs) ---------------------------------------------------------
  const act = a.action ?? null;
  st.act = damp(st.act, act ? 1 : 0, 10, dt);
  if (act) {
    const at = a.actionT ?? a.time;
    const O = (b: BoneName, x: number, y = 0, z = 0) => set(b, x, y, z);
    switch (act) {
      case 'spin':
        O('armR', -1.2, 0.15, -0.3); O('foreR', -0.35 + Math.sin(at * 7) * 0.18); O('chest', 0.05, -0.18, 0); O('head', 0.12, -0.25, 0);
        break;
      case 'wave':
        O('armR', -0.2, 0, -2.5 + Math.sin(at * 9) * 0.28); O('foreR', -0.3); O('head', 0, 0, 0.08);
        break;
      case 'give':
      case 'carry':
        O('armL', -1.05, 0, -0.18); O('armR', -1.05, 0, 0.18); O('foreL', -0.45); O('foreR', -0.45);
        if (act === 'give') add('spine', 0.18);
        break;
      case 'bow':
      case 'pray': {
        O('armL', -0.55, 0, -0.42); O('armR', -0.55, 0, 0.42); O('foreL', -1.85, 0, 0); O('foreR', -1.85, 0, 0);
        if (act === 'bow') { add('spine', 0.35); add('head', 0.25); }
        break;
      }
      case 'light':
        O('armR', -0.95, 0, -0.1); O('foreR', -0.35); add('spine', 0.22); O('head', 0.35, 0, 0);
        break;
      case 'pet': {
        hipsY -= d.hipY * 0.42;
        O('thighL', -1.35); O('thighR', -1.2); O('shinL', 2.0); O('shinR', 1.9); O('footL', -0.65); O('footR', -0.7);
        add('spine', 0.45); O('armR', -1.0 + Math.sin(at * 5) * 0.12, 0, -0.1); O('foreR', -0.2); O('head', 0.4);
        O('skirt', -1.15); O('skirt2', 1.0);
        break;
      }
      case 'eat':
        O('armR', -0.5, 0, 0.2); O('foreR', -2.1 + Math.sin(at * 6) * 0.12);
        break;
      case 'talk':
        O('armR', -0.35 + Math.sin(at * 2.7) * 0.22, 0, -0.12); O('foreR', -0.9 + Math.sin(at * 4.3) * 0.3);
        O('armL', -0.15 + Math.sin(at * 1.9) * 0.08, 0, 0.1); O('foreL', -0.5);
        add('head', Math.sin(at * 5.1) * 0.04);
        break;
      case 'clap': {
        // Tibetan monastic debate: raise the right hand high, swing it down to clap onto the left palm, stamp
        const p = (at % 1.7) / 1.7;
        const raise = smooth(0.05, 0.55, p) * (1 - smooth(0.62, 0.74, p));
        O('armR', lerp(-1.15, -2.9, raise), 0, -0.25); O('foreR', lerp(-0.4, -0.15, raise));
        O('armL', -1.2, 0, -0.15); O('foreL', -0.55);
        add('spine', lerp(0.25, -0.05, raise));
        if (p > 0.62 && p < 0.85) { O('thighL', -0.3 * (1 - smooth(0.7, 0.85, p))); }
        break;
      }
      case 'sit': {
        // on a bench: thighs rest on the seat, sloping down to the knees if the seat is high enough for the
        // feet to reach the ground; shins hang straight; the robe lies along the lap and falls from the knees
        const seat = a.seatY ?? d.kneeY + 0.04;
        const hj = seat + d.legT * 0.5;
        hipsY += hj - d.hipJ;
        const ta = Math.acos(clamp((hj - d.kneeY) / d.thigh, -0.4, 0.96));
        O('thighL', -ta, 0, 0.05); O('thighR', -ta, 0, -0.05); O('shinL', ta - 0.06); O('shinR', ta - 0.06);
        O('footL', 0.06); O('footR', 0.06);
        O('skirt', -ta); O('skirt2', ta - 0.12);
        KS[0] = 1.06; KS[2] = 1.04; // a little fuller where it bunches over the knees
        add('spine', -0.04);
        O('armL', -0.55, 0, 0.12); O('armR', -0.55, 0, -0.12); O('foreL', -0.75); O('foreR', -0.75);
        break;
      }
      case 'sitCross': {
        // cross-legged: knees out to the sides, shins folded under, the robe spread over the lap and tucked
        // down onto the cushion in front; hands rest on the knees
        const seat = a.seatY ?? 0.1;
        hipsY += seat + d.legT * 0.5 + 0.015 - d.hipJ;
        O('thighL', -1.42, 0, 0.98); O('thighR', -1.42, 0, -0.98);
        O('shinL', 2.5, 0, 0); O('shinR', 2.5, 0, 0);
        O('footL', -0.5, 0, 0); O('footR', -0.5, 0, 0);
        O('skirt', -1.5); O('skirt2', 1.45);
        KS[0] = 1.55; KS[1] = 0.62; KS[3] = 0.74; KS[2] = 0.5 / KS[3]; // a low, wide lap
        add('spine', 0.04);
        O('armL', -0.3, 0, 0.32); O('armR', -0.3, 0, -0.32); O('foreL', -0.75, 0, 0); O('foreR', -0.75, 0, 0);
        break;
      }
      case 'mala':
        // beads counted at the chest: elbow by the side, forearm raised and turned in, thumb ticking
        O('armL', -0.14, -0.72, -0.04); O('foreL', -1.6 + Math.sin(at * 3) * 0.06); O('handL', 0.25 + Math.sin(at * 6) * 0.08);
        break;
      case 'phone':
        O('armR', -0.45, 0, 0.15); O('foreR', -1.75); O('head', 0.4, -0.05, 0);
        break;
      case 'stick':
        O('armR', -0.4, 0, -0.08); O('foreR', -0.25); add('spine', 0.12);
        break;
      case 'wheelWalk':
        O('armR', -0.18, 0, -0.1); O('foreR', -1.5); O('handR', 0, 0, Math.sin(at * 6) * 0.25);
        break;
      case 'point':
        O('armR', -1.4, 0.3, -0.2); O('foreR', -0.1);
        break;
    }
  }
  // looking
  if (a.lookYaw) add('head', 0, clamp(a.lookYaw, -1.1, 1.1), 0);
  if (a.lookPitch) add('head', a.lookPitch);

  // hand-held prayer wheel spins (clockwise seen from above)
  if (rig.props.drum) rig.props.drum.rotation.z -= dt * (act === 'wheelWalk' ? 7 : 2.5);

  // ---- apply with smoothing -----------------------------------------------------------------------
  const rate = 16;
  for (let i = 1; i < BONE_NAMES.length; i++) {
    const b = bones[BONE_NAMES[i]];
    b.rotation.x = damp(b.rotation.x, T[i * 3], rate, dt);
    b.rotation.y = damp(b.rotation.y, T[i * 3 + 1], rate, dt);
    b.rotation.z = damp(b.rotation.z, T[i * 3 + 2], rate, dt);
  }
  bones.hips.position.y = damp(bones.hips.position.y, d.hipY + hipsY, 20, dt);
  // robe flares as the legs spread; seated poses widen the lap and shorten the drop
  const flare = 1 + 0.12 * w * Math.abs(s) + 0.2 * st.air;
  const sk = bones.skirt.scale, sk2 = bones.skirt2.scale;
  sk.x = damp(sk.x, KS[0], 10, dt);
  sk.y = damp(sk.y, KS[1], 10, dt);
  sk.z = damp(sk.z, flare * KS[3], 12, dt);
  sk2.y = damp(sk2.y, KS[2], 10, dt);
}
