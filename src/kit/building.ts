// Building kit: McLeod Ganj–style concrete buildings (painted walls, shop shutters, balconies, tin roofs,
// black water tanks, rebar on the roof…). Used by the square, market and hillside builders.
//
// API CONTRACT — other modules code against these signatures. Keep them stable; only add optional fields.
//
//   const p = new Parts();
//   const b = buildBuilding(p, { w: 6, d: 7, floors: 3, ground: 'shop', sign: { text: 'MOMO' }, seed: 4 },
//                           besideRoad(roadById('temple-road'), 30, 1, 7));
//   // later: p.toMeshes(partsMaterial({ occlude: true })); register b.colliders / b.lamps; mount b.meshes
//
// Everything is built in a local frame (origin = footprint centre at ground-floor level, front = +z, x across
// the frontage) and stays inside the w × d footprint, except things that hang over the pavement above head
// height: balconies (0.72 m), chajjas / sunshades, signs, awnings (≈0.55 m) and roof eaves (≈0.35 m).
// "left" / "right" are as seen from the street, facing the front: right = local +x.
import { BufferGeometry, Float32BufferAttribute, type Object3D } from 'three';
import type { Parts, V3 } from '../core/geom';
import type { BoxInit } from '../core/collision';
import type { Lamp } from '../core/lamps';
import type { Road } from '../world/layout';
import { roadFrame } from '../world/layout';
import { groundY } from '../world/terrain';
import { WALLS, ROOFS, PAL } from '../core/palette';
import { rng, pick, clamp, type Rng } from '../core/math';
import { makeSign, signSize, type SignSpec } from './sign';

export type RoofKind = 'flat' | 'tin' | 'tinHip' | 'terrace';
export type GroundFloor = 'shop' | 'cafe' | 'house' | 'hotel' | 'blank' | 'garage';
/** What a shop shows behind its shutters. */
export type ShopKind = 'goods' | 'shawls' | 'grocery' | 'crafts' | 'food';
export type WindowKind = 'grill' | 'shutter' | 'glass' | 'mixed';

export interface BuildingSpec {
  /** Frontage width (local x) and depth (local z), metres. The front faces local +z. */
  w: number;
  d: number;
  /** Storeys above the ground floor's floor level (1..6). */
  floors: number;
  /** Storey height (default 2.9). */
  floorH?: number;
  /** Main wall paint (sRGB hex, from PAL / WALLS). Random from WALLS when omitted. */
  wall?: number;
  /** Trim / band / frame colour. */
  trim?: number;
  /** Ground-floor treatment (default 'shop'). */
  ground?: GroundFloor;
  /** Shop bays / window columns across the front (default from w). */
  bays?: number;
  /** Balconies on upper floors (default true for 'hotel', random otherwise). */
  balconies?: boolean;
  roof?: RoofKind;
  roofColor?: number;
  /** Black water tanks on a flat roof. */
  tanks?: number;
  dish?: boolean;
  /** Unfinished columns with rebar sticking out of a flat roof. */
  rebar?: boolean;
  /** External staircase on a side wall. */
  sideStairs?: 'left' | 'right' | null;
  /** Shop sign over the ground floor front. */
  sign?: SignSpec | null;
  /** Awning colour over the shop front (null = none). */
  awning?: number | null;
  /** Fraction of windows lit at night (default 0.45). */
  litChance?: number;
  seed?: number;

  // ---- optional extras (all have seeded defaults) ----
  /** Goods behind the shop shutters (default random per building). */
  shop?: ShopKind;
  /** Rolling-shutter state of the shop / garage bays (default 'mixed', mostly open). */
  shutters?: 'open' | 'half' | 'closed' | 'mixed';
  /** Upper-floor window style (default random). */
  windows?: WindowKind;
  /** Tibetan touches: black trapezoid window surrounds, lungta-striped shambu valances, maroon trim. */
  tibetan?: boolean;
  /** How far the ground-floor front sits back under the overhanging upper floors (m). */
  overhang?: number;
  /** Side walls touching a neighbour (no windows, no eave overhang). streetRow sets these. */
  party?: { left?: boolean; right?: boolean };
  /** Top storey left as a bare concrete frame with brick infill and rebar on the roof. */
  unfinished?: boolean;
  /** Force open concrete stilts (true) or a solid plinth (false) under a floor raised above the ground. */
  stilts?: boolean;
  /** Stair-head room ("mumty") on a flat roof. */
  mumty?: boolean;
  solar?: boolean;
  antenna?: boolean;
  /** Clothes line on the roof / clothes on balcony rails. */
  clothes?: boolean;
  /** Small prayer-flag string on the roof. */
  flags?: boolean;
  /** Balcony / stair railing colour. */
  railing?: number;
  /** Tin roof ridge: 'x' = parallel to the front, 'z' = gable end facing the street. */
  ridge?: 'x' | 'z';
  /** Amount of small clutter (pots, pipes, meters, clothes), 0..1, default 0.6. */
  clutter?: number;
}

export interface Placement {
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Yaw (rotation.y); the building front faces (sin yaw, cos yaw). */
  yaw: number;
  /** Floor level of the ground floor; default groundY at the front-centre. Slopes get a concrete plinth. */
  y?: number;
}

export interface BuiltBuilding {
  /** Solid volume(s) — register with collision.addBox. */
  colliders: BoxInit[];
  /** Night lights (shop interiors, porch bulbs) — register with lamps.add. */
  lamps: Lamp[];
  /** Extra objects not merged into Parts (e.g. textured signs) — add to the scene. */
  meshes: Object3D[];
  /** Front door / shop opening centre at floor level (for NPC targets and interactions). */
  door: { x: number; y: number; z: number };
  /** Height of the roof top (world y). */
  top: number;
}

// ---- palette helpers ---------------------------------------------------------------------------------------
const ch8 = (h: number, s: number) => (h >> s) & 255;
/** Multiply an sRGB hex by k (clamped). */
export function shade(h: number, k: number) {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f(ch8(h, 16)) << 16) | (f(ch8(h, 8)) << 8) | f(ch8(h, 0));
}
/** Mix two sRGB hex colours. */
export function mixHex(a: number, b: number, t: number) {
  const f = (s: number) => Math.round(ch8(a, s) + (ch8(b, s) - ch8(a, s)) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
}
const luma = (h: number) => (0.299 * ch8(h, 16) + 0.587 * ch8(h, 8) + 0.114 * ch8(h, 0)) / 255;

const GOODS = [
  PAL.blousePink, PAL.blouseSky, PAL.blouseYellow, PAL.coral, PAL.turquoise, PAL.sashRed, PAL.sashGold,
  PAL.chubaMaroon, PAL.denim, PAL.khaki, PAL.fleece, PAL.templeYellow, PAL.blouseLilac, PAL.wallMint, PAL.wallWhite,
] as const;
const CLOTHES = [
  PAL.blousePink, PAL.blouseSky, PAL.blouseYellow, PAL.sashRed, PAL.denim, PAL.wallWhite, PAL.chubaMaroon,
  PAL.khaki, PAL.blouseLilac, PAL.fleece, PAL.turquoise,
] as const;
const CURTAINS = [PAL.blousePink, PAL.blouseSky, PAL.blouseYellow, PAL.sashRed, PAL.wallMint, PAL.blouseLilac, PAL.coral, PAL.chubaMaroon] as const;
const RAILS = [PAL.railing, PAL.railing, PAL.railingYellow, PAL.shutterGreen, PAL.roofGreen, PAL.shutterBlue, PAL.wallWhite] as const;
const SHUTTERS = [PAL.shutter, PAL.shutter, PAL.roofGrey, PAL.shutterBlue, PAL.shutterGreen] as const;
const WOOD = [PAL.shutterGreen, PAL.shutterBlue, PAL.roofGreen, PAL.railing, PAL.woodTrim, PAL.templeRed] as const;
const FLOWERS = [PAL.rhodo, PAL.wallOchre, PAL.blousePink, PAL.templeYellow, PAL.coral, PAL.wallWhite] as const;
const INTERIOR = [PAL.wallCream, PAL.wallSky, PAL.wallMint, PAL.wallYellow, PAL.wallWhite, PAL.wallPink] as const;
const BLACK = PAL.chubaBlack;
const BRICK = shade(PAL.wallTerracotta, 0.92);
const IRON = 0x3a3d42;
const LINE = 0.05; // ≈ one art pixel

/** Debug: the section currently being built (the kit showroom tallies triangles per section). */
export const KIT_DEBUG = { section: '' };
const sec = (name: string) => { KIT_DEBUG.section = name; };

const HOTEL_NAMES = ['GUEST HOUSE', 'SNOW VIEW', 'HOTEL', 'LODGE', 'HIMALAYA INN', 'KAILASH GH', 'NORLING GH', 'PEACE HOTEL'];

// ---- corrugated sheet --------------------------------------------------------------------------------------
/**
 * Corrugated (ribbed) sheet: a triangle-wave profile of `period` and `amp` across u ∈ [u0, u1], extending along
 * v over vr(u) = [vStart, vEnd] (clips trapezoids / triangles for hip roofs). 4 triangles per rib.
 * mode 'roof': u → x, profile → +y, v → z (lies flat, faces up). mode 'wall': u → y, profile → +z, v → x
 * (stands up facing +z, ribs horizontal: rolling shutters).
 */
export function corrugated(u0: number, u1: number, vr: (u: number) => readonly [number, number], period: number, amp: number, mode: 'roof' | 'wall' = 'roof'): BufferGeometry {
  const pos: number[] = [];
  const n = Math.max(1, Math.round((u1 - u0) / period));
  const st = (u1 - u0) / n;
  const put = (u: number, h: number, v: number) => { if (mode === 'roof') pos.push(u, h, v); else pos.push(v, u, h); };
  const quad = (ua: number, ya: number, ub: number, yb: number) => {
    const [a0, a1] = vr(ua), [b0, b1] = vr(ub);
    if (a1 - a0 < 1e-3 && b1 - b0 < 1e-3) return;
    put(ua, ya, a0); put(ua, ya, a1); put(ub, yb, b0);
    put(ub, yb, b0); put(ua, ya, a1); put(ub, yb, b1);
  };
  for (let i = 0; i < n; i++) {
    const ua = u0 + i * st, um = ua + st / 2, ub = ua + st;
    quad(ua, 0, um, amp);
    quad(um, amp, ub, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Thin box from a to b (cables, struts, rebar, sloped rails). */
function beam(P: Parts, a: V3, b: V3, t: number, col: number, t2 = t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const hz = Math.hypot(dx, dz), L = Math.hypot(hz, dy);
  if (L < 1e-4) return;
  P.group([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], Math.atan2(dx, dz), () => {
    P.box(t, t2, L, [0, 0, 0], col, { rot: [-Math.atan2(dy, hz), 0, 0] });
  });
}

/** Double-sided quad (4 triangles) in the local xy plane, centred: flags, clothes, posters. */
function quadGeometry(w: number, h: number): BufferGeometry {
  const x = w / 2, y = h / 2;
  const pos = [
    -x, -y, 0, x, -y, 0, x, y, 0, -x, -y, 0, x, y, 0, -x, y, 0, // front (+z)
    -x, -y, 0, x, y, 0, x, -y, 0, -x, -y, 0, -x, y, 0, x, y, 0, // back (−z)
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Potted plant on `base` (terracotta / blue-plastic pot + foliage or flowers). */
function pot(P: Parts, r: Rng, x: number, y: number, z: number, s = 1) {
  const potC = r() < 0.7 ? PAL.wallTerracotta : r() < 0.5 ? PAL.railing : PAL.wallWhite;
  P.taper(0.2 * s, 0.2 * s, 0.26 * s, 0.26 * s, 0.22 * s, [x, y, z], potC);
  const leaf = r() < 0.5 ? PAL.grass : PAL.grassDeep;
  P.box(0.3 * s, 0.22 * s, 0.3 * s, [x, y + 0.32 * s, z], leaf);
  if (r() < 0.6) P.box(0.14 * s, 0.1 * s, 0.14 * s, [x + 0.05 * s, y + 0.46 * s, z + 0.04 * s], pick(r, FLOWERS));
}

// =============================================================================================================
/** Build one building into `parts` (world space) and return its colliders, lamps and extras. */
export function buildBuilding(parts: Parts, spec: BuildingSpec, at: Placement): BuiltBuilding {
  try {
    return buildImpl(parts, spec, at);
  } catch (e) {
    console.error('[kit] buildBuilding failed; using a plain block', e);
    return plainBlock(parts, spec, at);
  }
}

/** The old minimal behaviour, kept as a safety net. */
function plainBlock(parts: Parts, spec: BuildingSpec, at: Placement): BuiltBuilding {
  const r = rng(spec.seed ?? 1);
  const fh = spec.floorH ?? 2.9;
  const H = spec.floors * fh;
  const y = at.y ?? groundY(at.x + Math.sin(at.yaw) * spec.d / 2, at.z + Math.cos(at.yaw) * spec.d / 2);
  const wall = spec.wall ?? pick(r, WALLS);
  parts.group([at.x, y, at.z], at.yaw, () => {
    parts.box(spec.w, H + 1.5, spec.d, [0, H / 2 - 0.75, 0], wall);
    parts.box(spec.w + 0.3, 0.2, spec.d + 0.3, [0, H + 0.1, 0], spec.roofColor ?? pick(r, ROOFS));
  });
  const fx = Math.sin(at.yaw), fz = Math.cos(at.yaw);
  return {
    colliders: [{ x: at.x, z: at.z, w: spec.w, d: spec.d, rot: at.yaw, y0: y - 2, y1: y + H + 0.2, tag: 'building' }],
    lamps: [], meshes: [],
    door: { x: at.x + fx * (spec.d / 2 + 0.3), y, z: at.z + fz * (spec.d / 2 + 0.3) },
    top: y + H + 0.2,
  };
}

type Face = 'front' | 'back' | 'left' | 'right';

function buildImpl(P: Parts, spec: BuildingSpec, at: Placement): BuiltBuilding {
  const r = rng(((spec.seed ?? 1) * 7919 + 17) >>> 0);
  const ch = (p: number) => r() < p;
  const w = Math.max(2.4, spec.w), d = Math.max(2.4, spec.d);
  const fh = Math.max(2.4, spec.floorH ?? 2.9);
  const nF = clamp(Math.round(spec.floors), 1, 6);
  const H = nF * fh;
  const st = 0.2;           // slab / band thickness
  const gTop = fh - st;     // top of the ground-floor walls (bottom of the first band)
  const ground: GroundFloor = spec.ground ?? 'shop';
  const sinY = Math.sin(at.yaw), cosY = Math.cos(at.yaw);
  const y = at.y ?? groundY(at.x + sinY * d / 2, at.z + cosY * d / 2);
  // everything below is built in the building's local frame (origin = footprint centre at floor level)
  let out: BuiltBuilding | undefined;
  P.group([at.x, y, at.z], at.yaw, () => { out = body(); });
  return out!;

  function body(): BuiltBuilding {
    const wX = (lx: number, lz: number) => at.x + lx * cosY + lz * sinY;
    const wZ = (lx: number, lz: number) => at.z - lx * sinY + lz * cosY;
    const gRel = (lx: number, lz: number) => groundY(wX(lx, lz), wZ(lx, lz)) - y;
    const clutter = clamp(spec.clutter ?? 0.6, 0, 1);
    const party = spec.party ?? {};
    const litChance = spec.litChance ?? 0.45;

    const colliders: BoxInit[] = [];
    const lamps: Lamp[] = [];
    const meshes: Object3D[] = [];
    /** Local rectangle → world collider. */
    const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tag = 'building') => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      colliders.push({ x: wX(cx, cz), z: wZ(cx, cz), w: Math.abs(x1 - x0), d: Math.abs(z1 - z0), rot: at.yaw, y0: y + y0, y1: y + y1, tag });
    };
    const lamp = (lx: number, ly: number, lz: number, intensity: number, distance: number, color: number = PAL.lampWarm) =>
      lamps.push({ x: wX(lx, lz), y: y + ly, z: wZ(lx, lz), color, intensity, distance });

    // ---- colours -------------------------------------------------------------------------------------------
    const wall = spec.wall ?? pick(r, WALLS);
    const pale = luma(wall) > 0.8;
    const tib = spec.tibetan ?? ch(ground === 'house' || ground === 'hotel' ? 0.45 : 0.25);
    const trim = spec.trim ?? (tib && ch(0.45) ? PAL.templeMaroon
      : pick(r, pale ? [PAL.concreteDark, PAL.concrete, shade(wall, 0.74), PAL.wallOchre, PAL.wallGrey]
        : [PAL.wallWhite, PAL.wallCream, PAL.concrete, shade(wall, 0.72), PAL.concreteDark]));
    const gWall = ch(0.3) ? pick(r, [PAL.concrete, PAL.wallGrey, shade(wall, 0.85), pick(r, WALLS)]) : wall;
    const frameExpr = ch(0.6);
    const frameC = ch(0.7) ? PAL.windowFrame : pick(r, [PAL.woodDoor, PAL.shutterGreen, PAL.shutterBlue, PAL.wallWhite]);
    const railC = spec.railing ?? pick(r, RAILS);
    const woodC = pick(r, WOOD);
    const roofCol = spec.roofColor ?? pick(r, ROOFS);
    const shutterC = pick(r, SHUTTERS);
    const unfinished = spec.unfinished ?? (nF >= 2 && (spec.roof === undefined || spec.roof === 'flat') && ch(0.1));
    const storeyCol: number[] = [];
    for (let i = 0; i < nF; i++) storeyCol.push(i === 0 ? gWall : wall);
    if (nF >= 3 && !unfinished && ch(0.15)) storeyCol[nF - 1] = pick(r, WALLS); // a later addition, painted differently
    if (unfinished) storeyCol[nF - 1] = BRICK;
    const colAt = (fy: number) => storeyCol[clamp(Math.floor(fy / fh + 1e-4), 0, nF - 1)];

    // ---- footprint ------------------------------------------------------------------------------------------
    const SW = 1.0; // stair strip width
    const stairs = spec.sideStairs && w - SW >= 2.6 && d >= 4.2 ? spec.sideStairs : null;
    let bx0 = -w / 2, bx1 = w / 2;
    if (stairs === 'left') bx0 += SW;
    if (stairs === 'right') bx1 -= SW;
    const bw = bx1 - bx0, bcx = (bx0 + bx1) / 2;
    const zB = -d / 2, zF = d / 2;

    // ground-floor recess under the overhanging upper floors
    let ov = spec.overhang ?? (ground === 'shop' ? 0.25 + r() * 0.25 : ground === 'cafe' ? 0.3 : ground === 'hotel' ? 0.35
      : ground === 'garage' ? 0.2 : ground === 'house' ? (ch(0.5) ? 0.35 : 0) : 0);
    if (nF === 1) ov = Math.min(ov, 0.3);
    // front steps if the floor is raised above the pavement
    const frontRise = -gRel(bcx, zF + 0.4);
    let nSteps = 0;
    if (frontRise > 0.26) {
      nSteps = Math.min(6, Math.ceil(frontRise / 0.19) - 1);
      ov = Math.max(ov, nSteps * 0.28 + 0.2);
    }
    ov = clamp(ov, 0, Math.min(1.9, d * 0.32));
    const zG = zF - ov;
    const recess = ov > 0.12;

    // ---- ground under the footprint: plinth or stilts --------------------------------------------------------
    sec('plinth');
    let minRel = 0;
    for (const sx of [-w / 2, 0, w / 2]) for (const sz of [zB, 0, zF]) minRel = Math.min(minRel, gRel(sx, sz));
    minRel = Math.min(minRel, -0.05);
    const drop = -minRel;
    const stilts = spec.stilts ?? drop > 1.5;
    const yLow = minRel - 0.5; // collider bottom
    const stepRun = nSteps * 0.28;
    if (!stilts) {
      const stone = drop > 0.45;
      P.slab(-w / 2, minRel - 0.3, zB, w / 2, 0, zF - stepRun, stone ? PAL.stoneStep : PAL.concrete);
      if (stone) {
        // concrete plinth beam on top of the rubble-stone base, and a few darker stones
        P.slab(-w / 2 - 0.03, -0.14, zB - 0.03, w / 2 + 0.03, 0, zF - stepRun + 0.03, PAL.concrete);
        for (let i = 0; i < 3; i++) {
          const sx = -w / 2 + 0.4 + r() * (w - 0.8), sy = minRel * (0.25 + r() * 0.5);
          P.box(0.32 + r() * 0.2, 0.16, 0.04, [sx, sy, zF - stepRun + 0.01], PAL.rockDark);
        }
      }
    } else {
      // floor slab on a grid of concrete columns standing on the slope, with deep perimeter beams
      P.slab(-w / 2, -0.42, zB, w / 2, 0, zF, PAL.concrete);
      P.slab(-w / 2 - 0.02, -0.62, zB - 0.02, w / 2 + 0.02, -0.42, zF + 0.02, PAL.concreteDark);
      const nx = Math.max(2, Math.round(w / 3) + 1), nz = Math.max(2, Math.round(d / 3) + 1);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
        const cx = -w / 2 + 0.16 + (w - 0.32) * i / (nx - 1), cz = zB + 0.16 + (d - 0.32) * j / (nz - 1);
        const g = gRel(cx, cz);
        if (g > -0.7) continue;
        P.slab(cx - 0.15, g - 0.3, cz - 0.15, cx + 0.15, -0.6, cz + 0.15, PAL.concrete);
        if (g < -2.6 && (i === 0 || i === nx - 1)) {
          // tie beam at mid height along the side
          const cz2 = j < nz - 1 ? zB + 0.16 + (d - 0.32) * (j + 1) / (nz - 1) : cz;
          if (cz2 !== cz) P.slab(cx - 0.12, g * 0.5 - 0.12, cz, cx + 0.12, g * 0.5 + 0.12, cz2, PAL.concreteDark);
        }
      }
      // junk under the house: stacked planks / an old drum
      if (drop > 2 && ch(0.7)) {
        const jx = -w / 4 + r() * w / 2, jz = zB + d * 0.3;
        const g = gRel(jx, jz);
        P.box(1.3, 0.25, 0.5, [jx, g + 0.12, jz], PAL.woodTrim);
        P.cyl(0.25, 0.25, 0.8, [jx + 0.9, g, jz + 0.3], PAL.roofBlue, 8);
      }
    }
    // front steps
    for (let k = 0; k < nSteps; k++) {
      const top = -frontRise + (k + 1) * frontRise / (nSteps + 1);
      const za = zF - (k + 1) * 0.28, zb = zF - k * 0.28;
      P.slab(bx0 + 0.05, minRel - 0.3, za, bx1 - 0.05, top, zb, PAL.stoneStep);
      box(bx0 + 0.05, za, bx1 - 0.05, zb, yLow, top, 'step');
    }

    // ---- storeys, bands, columns --------------------------------------------------------------------------------
    sec('shell');
    for (let i = 1; i < nF; i++) P.slab(bx0, i * fh - st, zB, bx1, (i + 1) * fh, zF, storeyCol[i]);
    const bo = 0.04;
    for (let k = 1; k <= nF; k++) {
      const c = unfinished && k === nF ? PAL.concrete : trim;
      P.slab(bx0 - bo, k * fh - st, zB - bo, bx1 + bo, k * fh, zF + bo, c);
    }
    // dirt / splash band at the foot of the walls
    P.slab(bx0 - 0.01, 0, zB - 0.01, bx1 + 0.01, 0.32, zG - 0.05, shade(gWall, 0.8));
    // corner columns (RC frame); the front pair also holds up the overhang
    const colC = frameExpr ? trim : shade(wall, 0.93);
    for (const cx of [bx0, bx1]) for (const front of [false, true]) {
      if (!frameExpr && !(front && recess)) continue;
      const x0 = cx === bx0 ? bx0 - 0.03 : bx1 - 0.25, x1 = x0 + 0.28;
      const z0 = front ? zF - 0.25 : zB - 0.03, z1 = z0 + 0.28;
      P.slab(x0, 0, z0, x1, frameExpr ? H : fh - st, z1, front && recess && !frameExpr ? PAL.concrete : colC);
      if (front && recess) box(x0, z0, x1, z1, yLow, fh, 'column');
    }
    // unfinished top storey: bare concrete columns between brick panels
    if (unfinished) {
      const fy0 = (nF - 1) * fh;
      const n = Math.max(2, Math.round(bw / 2.6) + 1);
      for (let i = 0; i < n; i++) {
        const cx = bx0 + 0.14 + (bw - 0.28) * i / (n - 1);
        P.slab(cx - 0.15, fy0, zF - 0.1, cx + 0.15, H, zF + 0.04, PAL.concrete);
        P.slab(cx - 0.15, fy0, zB - 0.04, cx + 0.15, H, zB + 0.1, PAL.concrete);
      }
    }

    // ---- faces: build in a frame where the wall is z = 0 and outward is +z --------------------------------------
    const face = (f: Face, fn: () => void, z = zF) => {
      if (f === 'front') P.group([0, 0, z], 0, fn);
      else if (f === 'back') P.group([0, 0, zB], Math.PI, fn);
      else if (f === 'right') P.group([bx1, 0, 0], Math.PI / 2, fn);
      else P.group([bx0, 0, 0], -Math.PI / 2, fn);
    };

    type WStyle = 'grill' | 'shutter' | 'glass' | 'hole';
    const winKind = spec.windows ?? pick(r, ['grill', 'grill', 'shutter', 'glass', 'mixed'] as const);
    const styleFor = (): WStyle => (winKind === 'mixed' ? pick(r, ['grill', 'shutter', 'glass'] as const) : winKind);
    const barC = ch(0.6) ? IRON : railC;

    /** One window in face space: centre x, sill height, size, detail 0 (back) / 1 (side) / 2 (front). */
    const win = (cx: number, sy: number, ww: number, wh: number, det: 0 | 1 | 2, style: WStyle) => {
      const lit = r() < litChance;
      const litCol = ch(0.15) ? PAL.lampCool : PAL.windowLit;
      const glow = lit ? { emit: litCol, emitNight: true, emitIntensity: 0.85 } : undefined;
      if (style === 'hole') {
        P.box(ww, wh, 0.04, [cx, sy + wh / 2, 0.005], shade(PAL.glass, 0.8), glow);
        return;
      }
      if (det === 2 && tib) P.taper(ww + 0.56, 0.03, ww + 0.26, 0.03, wh + 0.32, [cx, sy - 0.16, 0], BLACK);
      P.box(ww + 0.12, wh + 0.12, 0.05, [cx, sy + wh / 2, 0.015], frameC);
      P.box(ww, wh, 0.05, [cx, sy + wh / 2, 0.03], ch(0.5) ? PAL.glassDay : PAL.glass, glow);
      if (det === 0) return;
      P.box(ww + 0.18, 0.06, 0.12, [cx, sy - 0.05, 0.06], trim);
      if (det === 1) {
        P.box(LINE, wh, 0.03, [cx, sy + wh / 2, 0.07], style === 'grill' ? barC : frameC);
        if (lit && ch(0.5)) {
        const cc = pick(r, CURTAINS);
        P.box(ww * 0.42, wh * 0.9, 0.02, [cx + ww * 0.27, sy + wh * 0.48, 0.065], cc, { emit: mixHex(cc, PAL.windowLit, 0.55), emitNight: true, emitIntensity: 0.6 });
      }
        return;
      }
      if (det === 2) {
        if (tib) {
          // shambu: pleated valance in lungta stripes under a dark lintel
          for (let k = 0; k < 5; k++) P.box((ww + 0.06) / 5, 0.13, 0.03, [cx - (ww + 0.06) / 2 + (k + 0.5) * (ww + 0.06) / 5, sy + wh - 0.03, 0.07], PAL.lungta[k]);
          P.box(ww + 0.42, 0.07, 0.16, [cx, sy + wh + 0.2, 0.08], BLACK);
        } else {
          P.box(ww + 0.4, 0.07, 0.34, [cx, sy + wh + 0.2, 0.17], trim); // chajja (sunshade)
        }
      }
      if (style === 'grill') {
        P.box(LINE, wh, 0.03, [cx - ww / 6, sy + wh / 2, 0.07], barC);
        P.box(LINE, wh, 0.03, [cx + ww / 6, sy + wh / 2, 0.07], barC);
        P.box(ww, LINE, 0.03, [cx, sy + wh * 0.5, 0.07], barC);
      } else if (style === 'shutter') {
        for (const s of [-1, 1]) P.box(ww / 2, wh, 0.04, [cx + s * (ww * 0.75 + 0.07), sy + wh / 2, 0.03], woodC);
        P.box(LINE, wh, 0.03, [cx, sy + wh / 2, 0.07], frameC);
      } else {
        P.box(LINE, wh, 0.03, [cx, sy + wh / 2, 0.07], frameC);
        P.box(ww, LINE, 0.03, [cx, sy + wh * 0.68, 0.07], frameC);
      }
      if (lit || ch(0.3)) {
        const cc = pick(r, CURTAINS), s = ch(0.5) ? -1 : 1;
        P.box(ww * 0.42, wh * 0.9, 0.02, [cx + s * ww * 0.27, sy + wh * 0.48, 0.065], cc,
          lit ? { emit: mixHex(cc, PAL.windowLit, 0.55), emitNight: true, emitIntensity: 0.6 } : undefined);
      }
      if (det === 2 && ch(0.25 * clutter)) pot(P, r, cx + (ch(0.5) ? -1 : 1) * ww * 0.3, sy - 0.02, 0.09, 0.7);
    };

    /** Door in face space (centre x, width), wood leaves or a metal sheet, with frame and optional bulb. */
    const door = (cx: number, dw: number, col: number, bulb: boolean) => {
      P.box(dw + 0.14, 2.17, 0.05, [cx, 1.085, 0.015], tib ? BLACK : frameC);
      P.box(dw, 2.06, 0.07, [cx, 1.05, 0.03], col);
      P.box(LINE, 1.96, 0.03, [cx, 1.03, 0.075], shade(col, 0.6));
      P.box(0.05, 0.05, 0.04, [cx + 0.1, 1.0, 0.09], PAL.gold);
      if (tib) for (let k = 0; k < 5; k++) P.box((dw + 0.06) / 5, 0.14, 0.03, [cx - (dw + 0.06) / 2 + (k + 0.5) * (dw + 0.06) / 5, 2.0, 0.08], PAL.lungta[k]);
      P.box(dw + 0.5, 0.07, 0.42, [cx, 2.3, 0.21], trim);
      if (bulb) P.box(0.09, 0.13, 0.09, [cx + dw / 2 + 0.22, 2.12, 0.07], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.4 });
    };

    /** Faux painted board (pseudo-text blocks) in face space — cheap extra signage without textures. */
    const fauxSign = (cx: number, cy: number, sw: number, sh: number, bg: number, fg: number) => {
      P.box(sw, sh, 0.04, [cx, cy, 0.02], bg);
      const rows = sh > 0.5 ? 2 : 1;
      for (let k = 0; k < rows; k++) {
        const ry = cy + (rows === 2 ? (k === 0 ? 0.1 : -0.1) * sh * 1.4 : 0);
        let x = cx - sw / 2 + 0.1;
        while (x < cx + sw / 2 - 0.2) {
          const lw = Math.min(0.12 + r() * 0.3, cx + sw / 2 - 0.1 - x);
          P.box(lw, 0.09, 0.02, [x + lw / 2, ry, 0.045], fg);
          x += lw + 0.08;
        }
      }
    };

    // ---- ground floor -----------------------------------------------------------------------------------------
    let doorX = bcx;
    let shopLamp = true;
    const shopKinds: ShopKind[] = ['goods', 'shawls', 'grocery', 'crafts', 'food'];
    const shutterState = (i: number): 'open' | 'half' | 'closed' => {
      const m = spec.shutters ?? 'mixed';
      if (m !== 'mixed') return m;
      const q = r();
      return i === 0 && q < 0.7 ? 'open' : q < 0.6 ? 'open' : q < 0.85 ? 'half' : 'closed';
    };

    /** Rolling shutter over an opening x ∈ [ox0, ox1], height oh, in the plane z = zs. */
    const rollingShutter = (ox0: number, ox1: number, oh: number, zs: number, state: 'open' | 'half' | 'closed') => {
      P.slab(ox0 - 0.06, oh, zs, ox1 + 0.06, oh + 0.26, zs + 0.13, shade(shutterC, 0.88)); // roller housing
      P.slab(ox0 - 0.05, 0, zs, ox0, oh, zs + 0.06, shade(shutterC, 0.7));
      P.slab(ox1, 0, zs, ox1 + 0.05, oh, zs + 0.06, shade(shutterC, 0.7));
      if (state === 'open') return;
      const bot = state === 'half' ? 1.15 + r() * 0.5 : 0.02;
      P.group([0, 0, zs + 0.025], 0, () => P.add(corrugated(bot, oh, () => [ox0, ox1], 0.11, 0.022, 'wall'), shutterC));
      P.slab(ox0, bot - 0.04, zs + 0.01, ox1, bot + 0.04, zs + 0.07, shade(shutterC, 0.6));
      if (state === 'closed') {
        P.box(0.07, 0.09, 0.04, [(ox0 + ox1) / 2, 0.14, zs + 0.08], PAL.gold);
        if (ch(0.35)) P.slab(ox0 + 0.2, 0.7, zs + 0.06, ox0 + 0.2 + (ox1 - ox0) * 0.5, 1.3, zs + 0.075, pick(r, [PAL.wallYellow, PAL.roofRed, PAL.wallSky]));
      }
    };

    /** Goods inside a shop bay: back panel at zb, opening front at zs. */
    const shopGoods = (ox0: number, ox1: number, zb: number, zs: number, oh: number, kind: ShopKind) => {
      const ow = ox1 - ox0, ocx = (ox0 + ox1) / 2;
      const shelf = (sy: number) => {
        P.slab(ox0 + 0.04, sy - 0.04, zb, ox1 - 0.04, sy, zb + 0.32, PAL.woodTrim);
        let x = ox0 + 0.08;
        while (x < ox1 - 0.2) {
          const iw = Math.min(0.3 + r() * 0.4, ox1 - 0.08 - x), ih = 0.14 + r() * 0.24;
          P.slab(x, sy, zb + 0.04, x + iw, sy + ih, zb + 0.28, pick(r, GOODS));
          x += iw + 0.04 + r() * 0.06;
        }
      };
      if (kind === 'goods' || kind === 'grocery') {
        for (const sy of kind === 'goods' ? [0.55, 1.05, 1.55] : [1.0, 1.55]) shelf(sy);
      }
      if (kind === 'goods') {
        // display counter with a glass front, snack-packet strips hanging at the sides
        P.slab(ox0 + 0.08, 0, zs - 0.5, ox0 + ow * 0.6, 0.85, zs - 0.12, PAL.woodTrim);
        P.slab(ox0 + 0.14, 0.3, zs - 0.13, ox0 + ow * 0.6 - 0.06, 0.8, zs - 0.1, PAL.glassDay);
        for (const sx of [ox0 + 0.04, ox1 - 0.22]) P.slab(sx, oh - 1.15, zs - 0.07, sx + 0.18, oh - 0.06, zs - 0.04, pick(r, GOODS));
      } else if (kind === 'shawls') {
        P.slab(ox0, oh - 0.14, zs - 0.32, ox1, oh - 0.1, zs - 0.28, IRON);
        let x = ox0 + 0.04, j = 0;
        while (x < ox1 - 0.25) {
          const sw = Math.min(0.32 + r() * 0.2, ox1 - 0.04 - x), L = 0.9 + r() * 0.6;
          const zz = zs - 0.3 + (j % 2) * 0.05;
          P.slab(x, oh - 0.12 - L, zz, x + sw, oh - 0.12, zz + 0.03, pick(r, CLOTHES));
          x += sw + 0.02; j++;
        }
        // folded stacks on a low table at the back
        P.slab(ox0 + 0.1, 0, zb + 0.05, ox1 - 0.1, 0.5, zb + 0.5, PAL.woodTrim);
        for (let k = 0; k < 3; k++) {
          const sx = ox0 + 0.15 + (ow - 0.45) * k / 2;
          for (let l = 0; l < 3; l++) P.box(0.3, 0.09, 0.3, [sx + 0.15, 0.55 + l * 0.09, zb + 0.28], pick(r, CLOTHES));
        }
      } else if (kind === 'grocery') {
        // crates of produce and a sack at the front
        let x = ox0 + 0.06;
        while (x < ox1 - 0.45) {
          const cw = 0.42;
          P.slab(x, 0, zs - 0.48, x + cw, 0.32, zs - 0.08, PAL.woodTrim);
          P.slab(x + 0.03, 0.32, zs - 0.45, x + cw - 0.03, 0.4, zs - 0.11, pick(r, [PAL.coral, PAL.grassLight, PAL.wallOchre, PAL.blouseYellow, PAL.sashRed, PAL.grass]));
          x += cw + 0.05;
        }
        P.cyl(0.2, 0.24, 0.55, [ox1 - 0.3, 0, zb + 0.6], PAL.khaki, 6);
      } else if (kind === 'crafts') {
        // thangkas on the back wall, singing bowls on a shelf, a little string of flags
        const n = Math.max(1, Math.floor(ow / 0.7));
        for (let k = 0; k < n; k++) {
          const tx = ox0 + (k + 0.5) * ow / n;
          P.box(0.46, 0.7, 0.03, [tx, 1.45, zb + 0.035], ch(0.5) ? PAL.templeRed : PAL.goldDeep);
          P.box(0.34, 0.5, 0.02, [tx, 1.47, zb + 0.055], pick(r, [PAL.templeBlue, PAL.templeGreen, PAL.gold, PAL.templeOchre]));
          P.box(0.12, 0.12, 0.02, [tx, 1.5, zb + 0.07], pick(r, [PAL.gold, PAL.templeWhite, PAL.coral]));
        }
        P.slab(ox0 + 0.04, 0.66, zb, ox1 - 0.04, 0.7, zb + 0.32, PAL.woodTrim);
        for (let k = 0; k < Math.floor(ow / 0.3); k++) P.cyl(0.1, 0.07, 0.08, [ox0 + 0.18 + k * 0.3, 0.7, zb + 0.16], ch(0.5) ? PAL.gold : PAL.khorloCopper, 6);
        for (let k = 0; k < 5; k++) P.box(0.12, 0.13, 0.01, [ox0 + 0.15 + k * (ow - 0.3) / 4, oh - 0.2, zs - 0.15], PAL.lungta[k]);
        P.box(ow, 0.02, 0.02, [ocx, oh - 0.12, zs - 0.15], PAL.wallWhite);
      } else if (kind === 'food') {
        // counter with a stack of aluminium steamers, menu board on the side
        P.slab(ox0 + 0.06, 0, zs - 0.55, ox1 - 0.06, 0.9, zs - 0.15, PAL.wallWhite);
        P.slab(ox0 + 0.06, 0.88, zs - 0.58, ox1 - 0.06, 0.94, zs - 0.12, PAL.woodTrim);
        for (let k = 0; k < 3; k++) P.cyl(0.21, 0.21, 0.16, [ox0 + 0.35, 0.94 + k * 0.17, zs - 0.35], k === 2 ? PAL.slateLight : PAL.dish, 8);
        P.cone(0.12, 0.08, [ox0 + 0.35, 1.45, zs - 0.35], PAL.slateLight, 6);
        P.slab(ox1 - 0.55, 1.0, zb, ox1 - 0.1, 1.7, zb + 0.04, PAL.deodarDark);
        for (let k = 0; k < 4; k++) P.box(0.3 * (0.6 + r() * 0.4), 0.04, 0.02, [ox1 - 0.33, 1.58 - k * 0.14, zb + 0.05], PAL.wallWhite);
        P.slab(ox0 + 0.2, 0, zb + 0.35, ox0 + 0.8, 0.7, zb + 0.95, PAL.woodDoor);
      }
    };

    const signAt = (lx: number, ly: number, lz: number, s: SignSpec) => {
      const m = makeSign(s);
      m.position.set(wX(lx, lz), y + ly, wZ(lx, lz));
      m.rotation.y = at.yaw;
      meshes.push(m);
      return m;
    };

    let sign = spec.sign ?? null;
    if (spec.sign === undefined && ground === 'hotel') {
      sign = { text: pick(r, HOTEL_NAMES), bg: pick(r, [PAL.templeRed, PAL.roofBlue, PAL.wallWhite, PAL.deodarDark]), bod: ch(0.6) ? 'མགྲོན་ཁང་' : undefined };
    }
    const awningC = spec.awning === undefined ? (ground === 'shop' && ch(0.35) ? pick(r, ROOFS) : null) : spec.awning;
    let balconyOnFirst = false; // decided below, needed by the sign placement

    sec('ground');
    if (ground === 'shop' || ground === 'garage') {
      const garage = ground === 'garage';
      const sd = clamp(d * 0.18, 0.8, 1.2);
      const oh = garage ? 2.35 : 2.2;
      const zS = zG;
      P.slab(bx0, 0, zB, bx1, gTop, zS - sd, gWall);
      P.slab(bx0, oh, zS - sd, bx1, gTop, zS, gWall);
      const bays = garage ? 1 : Math.max(1, spec.bays ?? Math.round(bw / 2.7));
      const pw = garage ? 0.35 : 0.28;
      const bayW = (bw - pw) / bays;
      for (let i = 0; i <= bays; i++) {
        const px = bx0 + pw / 2 + i * bayW;
        P.slab(px - pw / 2, 0, zS - sd, px + pw / 2, oh, zS, frameExpr ? trim : gWall);
      }
      const kind0 = spec.shop ?? pick(r, shopKinds);
      for (let i = 0; i < bays; i++) {
        const ox0 = bx0 + pw + i * bayW, ox1 = ox0 + bayW - pw;
        const zb = zS - sd;
        const interior = shade(pick(r, INTERIOR), garage ? 0.45 : 0.8);
        P.slab(ox0, 0, zb, ox1, oh, zb + 0.02, interior, { emit: PAL.windowLit, emitNight: true, emitIntensity: garage ? 0.15 : 0.32 });
        P.slab(ox0, 0, zb, ox1, 0.03, zS, garage ? PAL.concreteStain : PAL.pavingDark);
        const ocx = (ox0 + ox1) / 2, ow = ox1 - ox0;
        P.slab(ocx - ow * 0.3, oh - 0.1, zb + 0.05, ocx + ow * 0.3, oh - 0.05, zb + 0.1, PAL.lampCool, { emit: PAL.lampCool, emitNight: true, emitIntensity: 1.2 });
        if (garage) {
          for (let k = 0; k < 2; k++) {
            const tx = ox0 + 0.4 + k * 0.62;
            P.cyl(0.29, 0.29, 0.75 + k * 0.2, [tx, 0, zb + 0.45], 0x262628, 8);
            P.cyl(0.3, 0.3, 0.04, [tx, 0.35, zb + 0.45], PAL.rockDark, 8);
          }
          P.cyl(0.26, 0.26, 0.85, [ox1 - 0.45, 0, zb + 0.4], pick(r, [PAL.roofBlue, PAL.roofRed]), 8);
          P.slab(ocx - 0.5, 0, zb + 0.05, ocx + 0.4, 0.85, zb + 0.6, PAL.woodDoor);
          P.slab(ocx - 0.7, 0.031, zS - 1.0, ocx + 0.2, 0.035, zS - 0.3, BLACK); // oil stain
        } else {
          const kind = i === 0 || ch(0.6) ? kind0 : pick(r, shopKinds);
          shopGoods(ox0, ox1, zb + 0.02, zS, oh, kind);
        }
        rollingShutter(ox0, ox1, oh, zS, garage ? (spec.shutters && spec.shutters !== 'mixed' ? spec.shutters : pick(r, ['half', 'closed', 'open'] as const)) : shutterState(i));
      }
      doorX = bx0 + pw + Math.floor((bays - 1) / 2) * bayW + (bayW - pw) / 2;
      // awning over the whole front
      if (awningC !== null && awningC !== undefined) {
        const ay = oh + 0.3, len = ov + 0.55, drop2 = 0.32;
        P.group([bcx, ay, zS], 0, () => {
          P.groupEuler([0, 0, 0], [Math.atan2(drop2, len), 0, 0], () => {
            const L = Math.hypot(len, drop2);
            const aw = bw / 2 - (recess ? 0.3 : 0.05);
            P.add(corrugated(-aw, aw, () => [0, L], 0.24, 0.035), awningC);
            P.box(aw * 2, 0.03, L, [0, -0.02, L / 2], shade(awningC, 0.6));
          });
        });
        for (const sx of [bx0 + 0.3, bx1 - 0.3]) beam(P, [sx, ay - 0.55, zS], [sx, ay - drop2 + 0.02, zS + len - 0.05], 0.04, IRON);
      }
    } else if (ground === 'cafe') {
      const pd = clamp(d * 0.25, 1.2, 1.8);
      const zP = zG - pd;
      P.slab(bx0, 0, zB, bx1, gTop, zP, gWall);
      P.slab(bx0, 2.45, zG - 0.22, bx1, gTop, zG, frameExpr ? trim : gWall);   // fascia beam
      P.slab(bx0, 0, zP, bx0 + 0.22, gTop, zG, gWall);                          // porch end walls
      P.slab(bx1 - 0.22, 0, zP, bx1, gTop, zG, gWall);
      P.slab(bx0 + 0.22, 0, zP, bx1 - 0.22, 0.03, zG, PAL.woodTrim);            // deck
      const gx0 = bx0 + 0.3, gx1 = bx1 - 0.3;
      const cafeFrame = pick(r, [PAL.woodTrim, PAL.woodDoor, PAL.shutterGreen, PAL.windowFrame]);
      P.slab(gx0, 0, zP, gx1, 2.32, zP + 0.05, cafeFrame);
      P.slab(gx0 + 0.07, 0.42, zP, gx1 - 0.07, 2.25, zP + 0.08, PAL.glassDay, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.9 });
      const nm = Math.max(2, Math.round((gx1 - gx0) / 0.9));
      for (let k = 1; k < nm; k++) {
        const mx = gx0 + (gx1 - gx0) * k / nm;
        P.slab(mx - 0.03, 0.4, zP, mx + 0.03, 2.3, zP + 0.1, cafeFrame);
      }
      P.slab(gx0, 1.92, zP, gx1, 1.98, zP + 0.1, cafeFrame);
      // door (wooden frame with glass) at one end
      const dxx = ch(0.5) ? gx0 + 0.55 : gx1 - 0.55;
      doorX = dxx;
      P.slab(dxx - 0.45, 0.02, zP, dxx + 0.45, 2.08, zP + 0.12, cafeFrame);
      P.slab(dxx - 0.33, 0.9, zP, dxx + 0.33, 1.95, zP + 0.14, PAL.glassDay, { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.9 });
      // tables & chairs on the porch
      const nT = bw > 4.6 ? 2 : 1;
      const chairC = pick(r, [PAL.wallWhite, PAL.roofGreen, PAL.roofRed, PAL.woodTrim]);
      for (let k = 0; k < nT; k++) {
        const tx = nT === 1 ? (dxx < bcx ? bcx + 0.6 : bcx - 0.6) : bx0 + bw * (k === 0 ? 0.3 : 0.7) + (dxx < bcx ? 0.3 : -0.3);
        const tz = zP + pd * 0.5;
        P.box(0.62, 0.05, 0.62, [tx, 0.74, tz], PAL.woodTrim);
        P.box(0.08, 0.72, 0.08, [tx, 0.36, tz], IRON);
        if (ch(0.6)) P.cyl(0.05, 0.05, 0.12, [tx + 0.12, 0.765, tz], PAL.wallWhite, 6);
        for (const s of [-1, 1]) {
          const cx = tx + s * 0.55;
          P.box(0.38, 0.42, 0.36, [cx, 0.21, tz], chairC);
          P.box(0.06, 0.5, 0.36, [cx + s * 0.16, 0.67, tz], chairC);
        }
      }
      // string lights under the fascia
      beam(P, [bx0 + 0.25, 2.42, zG - 0.12], [bx1 - 0.25, 2.42, zG - 0.12], 0.025, BLACK);
      const nb = Math.max(4, Math.round(bw / 0.55));
      for (let k = 0; k < nb; k++) {
        const bxk = bx0 + 0.35 + (bw - 0.7) * k / (nb - 1);
        P.box(0.07, 0.08, 0.07, [bxk, 2.34 - Math.sin(Math.PI * k / (nb - 1)) * 0.05, zG - 0.12], PAL.stringLight, { emit: PAL.stringLight, emitNight: true, emitIntensity: 1.6 });
      }
      // chalk menu board and a planter
      const mx = dxx < bcx ? dxx + 0.75 : dxx - 0.75;
      P.box(0.5, 0.75, 0.06, [mx, 0.45, zG - 0.25], PAL.woodTrim, { rot: [-0.18, 0, 0] });
      P.box(0.42, 0.6, 0.02, [mx, 0.48, zG - 0.2], PAL.deodarDark, { rot: [-0.18, 0, 0] });
      for (let k = 0; k < 3; k++) P.box(0.25 + r() * 0.1, 0.03, 0.01, [mx, 0.66 - k * 0.12, zG - 0.18 - k * 0.02], PAL.wallWhite, { rot: [-0.18, 0, 0] });
      if (ch(0.7)) {
        const px = dxx < bcx ? bx1 - 0.6 : bx0 + 0.6;
        P.slab(px - 0.35, 0, zG - 0.45, px + 0.35, 0.35, zG - 0.1, PAL.wallTerracotta);
        P.box(0.6, 0.35, 0.3, [px, 0.5, zG - 0.27], PAL.grass);
        P.box(0.2, 0.15, 0.2, [px - 0.12, 0.72, zG - 0.27], pick(r, FLOWERS));
      }
    } else if (ground === 'hotel') {
      P.slab(bx0, 0, zB, bx1, gTop, zG, gWall);
      face('front', () => {
        // glass entrance with a concrete canopy and two pots
        P.box(1.62, 2.38, 0.05, [bcx, 1.19, 0.015], frameC);
        P.box(1.5, 2.28, 0.07, [bcx, 1.14, 0.03], PAL.glassDay, { emit: PAL.windowLit, emitNight: true, emitIntensity: 1.0 });
        P.box(LINE, 2.28, 0.03, [bcx, 1.14, 0.075], frameC);
        P.box(1.5, LINE, 0.03, [bcx, 1.05, 0.075], frameC);
        P.box(2.1, 0.1, Math.min(0.75, ov + 0.5), [bcx, 2.52, Math.min(0.75, ov + 0.5) / 2], trim);
        for (const s of [-1, 1]) P.box(0.1, 0.14, 0.08, [bcx + s * 0.95, 2.1, 0.06], PAL.lampWarm, { emit: PAL.lampWarm, emitNight: true, emitIntensity: 1.4 });
        if (bw > 4.2) for (const s of [-1, 1]) win(bcx + s * (bw * 0.32), 0.85, Math.min(1.1, bw * 0.18), 1.3, 2, 'glass');
        fauxSign(bcx + 1.09, 1.55, 0.42, 0.28, PAL.wallWhite, PAL.windowFrame);
      }, zG);
      if (recess && ov > 0.3) for (const s of [-1, 1]) {
        const px = bcx + s * 1.05;
        pot(P, r, px, 0, zG + 0.22, 1.1);
        box(px - 0.15, zG + 0.08, px + 0.15, zG + 0.36, yLow, 0.55, 'plant');
      }
    } else if (ground === 'house') {
      P.slab(bx0, 0, zB, bx1, gTop, zG, gWall);
      const nb = Math.max(1, spec.bays ?? Math.round((bw - 0.2) / 2.1));
      const cw = bw / nb;
      const di = Math.floor(r() * nb);
      doorX = bx0 + cw * (di + 0.5);
      face('front', () => {
        door(doorX, 0.9, tib ? pick(r, [PAL.templeRed, PAL.templeMaroon, PAL.shutterBlue]) : pick(r, [PAL.woodDoor, PAL.shutterBlue, PAL.shutterGreen, PAL.woodTrim]), true);
        for (let i = 0; i < nb; i++) if (i !== di) win(bx0 + cw * (i + 0.5), 0.9, Math.min(1.1, cw - 0.7), 1.2, 2, styleFor());
        if (ch(0.4 * clutter)) fauxSign(doorX + 0.85, 1.75, 0.5, 0.3, PAL.wallWhite, PAL.templeRed);
      }, zG);
      if (recess && ov >= 0.3) {
        for (let k = 0; k < 1 + Math.floor(r() * 3 * clutter); k++) {
          const px = doorX + (k % 2 ? -1 : 1) * (0.75 + Math.floor(k / 2) * 0.4);
          if (px < bx0 + 0.25 || px > bx1 - 0.25) continue;
          pot(P, r, px, 0, zG + 0.2);
          box(px - 0.14, zG + 0.06, px + 0.14, zG + 0.34, yLow, 0.5, 'plant');
        }
      }
      lamp(doorX + 0.67, 2.1, zG + 0.25, 2.5, 5.5);
      shopLamp = false;
    } else {
      // blank: plain wall, maybe a small window or a padlocked shutter
      P.slab(bx0, 0, zB, bx1, gTop, zG, gWall);
      face('front', () => {
        if (ch(0.5)) win(bcx + (ch(0.5) ? -1 : 1) * bw * 0.22, 1.5, 0.6, 0.6, 1, 'grill');
        if (ch(0.35)) fauxSign(bcx, 1.6, Math.min(2.4, bw * 0.6), 0.6, pick(r, [PAL.wallYellow, PAL.wallSky, PAL.wallWhite]), pick(r, [PAL.templeRed, PAL.roofBlue]));
      }, zG);
      shopLamp = false;
    }
    if (shopLamp) lamp(doorX, 2.3, zG + 0.35, ground === 'garage' ? 3 : 5, 7);

    // ---- upper floors: windows, balconies -------------------------------------------------------------------------
    const nWin = Math.max(1, spec.bays ?? Math.round((bw - 0.2) / 2.1));
    const colW = bw / nWin;
    const xs = Array.from({ length: nWin }, (_, i) => bx0 + colW * (i + 0.5));
    const ww = clamp(colW - 0.8, 0.6, 1.3);
    const balcFloors = new Set<number>();
    const wantBalc = spec.balconies ?? (ground === 'hotel' ? true : undefined);
    for (let i = 1; i < nF; i++) {
      if (unfinished && i === nF - 1) continue;
      if (wantBalc === true || (wantBalc === undefined && ch(0.35))) balcFloors.add(i);
    }
    const balcFull = ch(0.55) || nWin <= 2;
    const bLo = balcFull ? bx0 + 0.05 : xs[Math.floor((nWin - 1) / 2)] - colW / 2 + 0.15;
    const bHi = balcFull ? bx1 - 0.05 : xs[Math.ceil((nWin - 1) / 2)] + colW / 2 - 0.15;
    if (sign && !balcFull && ground !== 'hotel') balcFloors.delete(1);
    balconyOnFirst = balcFloors.has(1);
    const solidFirst = balconyOnFirst && !!sign && ground !== 'hotel';
    const balcWall = ch(0.5) ? wall : trim;

    const balcony = (fy: number, x0: number, x1: number, solid: boolean) => {
      const bd = 0.72, z1 = zF + bd, rh = 0.95;
      P.slab(x0, fy - st, zF, x1, fy, z1, trim);
      if (solid) {
        P.slab(x0, fy, z1 - 0.1, x1, fy + 0.85, z1, balcWall);
        P.slab(x0, fy, zF, x0 + 0.1, fy + 0.85, z1 - 0.1, balcWall);
        P.slab(x1 - 0.1, fy, zF, x1, fy + 0.85, z1 - 0.1, balcWall);
        P.slab(x0 - 0.02, fy + 0.85, z1 - 0.13, x1 + 0.02, fy + 0.91, z1 + 0.02, railC);
      } else {
        const n = Math.max(1, Math.round((x1 - x0) / 1.3));
        for (let k = 0; k <= n; k++) P.box(0.05, rh, 0.05, [x0 + 0.03 + (x1 - x0 - 0.06) * k / n, fy + rh / 2, z1 - 0.03], railC);
        for (const hy of [rh, rh * 0.62, rh * 0.28]) P.box(x1 - x0, 0.045, 0.045, [(x0 + x1) / 2, fy + hy, z1 - 0.03], railC);
        for (const sx of [x0 + 0.03, x1 - 0.03]) for (const hy of [rh, rh * 0.5]) P.box(0.045, 0.045, bd, [sx, fy + hy, zF + bd / 2], railC);
      }
      // life on the balcony
      const items = Math.round(clutter * 3 * r());
      for (let k = 0; k < items; k++) {
        const px = x0 + 0.3 + r() * (x1 - x0 - 0.6);
        if (ch(0.55)) pot(P, r, px, fy, z1 - 0.3, 0.9);
        else if (!solid && (spec.clothes ?? true)) {
          const cw = 0.35 + r() * 0.3;
          const chh = 0.5 + r() * 0.3;
          P.group([px, fy + rh + 0.02 - chh / 2, z1 + 0.01], 0, () => P.add(quadGeometry(cw, chh), pick(r, CLOTHES)));
        } else {
          const cc = pick(r, [PAL.wallWhite, PAL.roofRed, PAL.roofGreen, PAL.roofBlue]);
          P.box(0.4, 0.42, 0.4, [px, fy + 0.21, zF + 0.32], cc);
          P.box(0.4, 0.45, 0.05, [px, fy + 0.64, zF + 0.14], cc);
        }
      }
    };

    sec('upper');
    for (let i = 1; i < nF; i++) {
      const fy = i * fh;
      const top = unfinished && i === nF - 1;
      const inBalc = balcFloors.has(i);
      face('front', () => {
        for (const x of xs) {
          if (top) { win(x, fy + 0.85, ww, 1.35, 0, 'hole'); continue; }
          if (inBalc && x > bLo && x < bHi) {
            // balcony door: glass or wooden leaves
            const dw = Math.min(1.0, ww);
            const lit = r() < litChance;
            P.box(dw + 0.12, 2.17, 0.05, [x, fy + 1.08, 0.015], frameC);
            P.box(dw, 2.08, 0.06, [x, fy + 1.05, 0.03], ch(0.5) ? woodC : PAL.glass, lit ? { emit: PAL.windowLit, emitNight: true, emitIntensity: 0.7 } : undefined);
            P.box(LINE, 2.0, 0.03, [x, fy + 1.05, 0.07], frameC);
            if (tib) for (let k = 0; k < 5; k++) P.box((dw + 0.06) / 5, 0.13, 0.03, [x - (dw + 0.06) / 2 + (k + 0.5) * (dw + 0.06) / 5, fy + 2.0, 0.08], PAL.lungta[k]);
          } else {
            win(x, fy + 0.85, ww, 1.3, 2, styleFor());
          }
        }
      });
      if (inBalc) balcony(fy, bLo, bHi, i === 1 && solidFirst);
    }

    // side and back windows (simpler); skip party walls and buried ground-floor windows
    sec('sides');
    const sideN = Math.max(1, Math.round(d / 3.4));
    for (const f of ['left', 'right'] as const) {
      if (party[f]) continue;
      for (let i = 0; i < nF; i++) {
        const fy = i * fh;
        if (i === 0 && ground !== 'house' && ground !== 'hotel' && ground !== 'blank') continue;
        const xSide = f === 'left' ? bx0 : bx1;
        const stairHere = stairs === f;
        face(f, () => {
          for (let k = 0; k < sideN; k++) {
            const zc = zB + d * (k + 0.5) / sideN;
            if (gRel(xSide, zc) > fy + 0.75) continue;
            if (stairHere && i <= 1) continue;
            const lx = f === 'left' ? zc : -zc;
            win(lx, fy + 0.9, 0.85, 1.15, 1, unfinished && i === nF - 1 ? 'hole' : styleFor());
          }
        });
      }
    }
    const backN = Math.max(1, Math.round(bw / 3));
    for (let i = 0; i < nF; i++) {
      const fy = i * fh;
      face('back', () => {
        for (let k = 0; k < backN; k++) {
          const bxk = bx0 + bw * (k + 0.5) / backN;
          if (gRel(bxk, zB) > fy + 0.75) continue;
          win(-bxk, fy + 0.95, 0.8, 1.1, 0, unfinished && i === nF - 1 ? 'hole' : 'grill');
        }
      });
    }

    // stains, drain pipe, electric meter, painted ads on bare party walls
    sec('clutter');
    face('front', () => {
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const sx = bx0 + 0.3 + r() * (bw - 0.6), L = 0.8 + r() * 1.8;
        P.box(0.1 + r() * 0.12, L, 0.012, [sx, H - st - L / 2, 0.006], shade(colAt(H - st - L / 2), 0.84));
      }
      if (ch(0.7 * clutter)) {
        const px = ch(0.5) ? bx0 + 0.36 : bx1 - 0.36;
        P.box(0.08, H, 0.08, [px, H / 2, 0.06], ch(0.5) ? PAL.slate : 0x2a2a2c);
      }
      if (nF >= 2 && ch(0.75 * clutter + 0.15)) {
        // cable bundle along the first-floor band (sagging between hooks), down one corner to the meter
        const cy = fh + 0.05, n = Math.max(2, Math.round(bw / 2.2));
        const zc = 0.1;
        for (let k = 0; k < n; k++) {
          const xa = bx0 + 0.2 + (bw - 0.4) * k / n, xb = bx0 + 0.2 + (bw - 0.4) * (k + 1) / n, xm = (xa + xb) / 2;
          beam(P, [xa, cy, zc], [xm, cy - 0.16, zc], 0.03, BLACK);
          beam(P, [xm, cy - 0.16, zc], [xb, cy, zc], 0.03, BLACK);
        }
        const cx = ch(0.5) ? bx0 + 0.2 : bx1 - 0.2;
        beam(P, [cx, cy, zc], [cx, 2.3, zc], 0.03, BLACK);
      }
    });
    if (ch(0.6 * clutter)) {
      const f: Face = !party.left ? 'left' : !party.right ? 'right' : 'back';
      face(f, () => {
        const mx = f === 'back' ? 0 : f === 'left' ? zF - 1.2 : -(zF - 1.2);
        P.box(0.32, 0.42, 0.14, [mx, 1.7, 0.07], PAL.wallGrey);
        P.box(0.22, 0.12, 0.02, [mx, 1.75, 0.15], PAL.glassDay);
        beam(P, [mx, 1.92, 0.08], [mx + 0.2, H - 0.1, 0.06], 0.03, BLACK);
      });
    }
    for (const f of ['left', 'right'] as const) {
      if (!party[f] || nF < 3 || !ch(0.35)) continue;
      face(f, () => fauxSign(0, H - fh * 0.9, Math.min(3, d * 0.6), 1.2,
        pick(r, [PAL.wallYellow, PAL.wallSky, PAL.roofRed, PAL.wallWhite, PAL.roofGreen]), pick(r, [PAL.wallWhite, PAL.templeRed, PAL.roofBlue, PAL.windowFrame])));
    }

    // ---- external side staircase -----------------------------------------------------------------------------------
    sec('stairs');
    if (stairs) {
      const sx0 = stairs === 'left' ? -w / 2 : bx1, sx1 = stairs === 'left' ? bx0 : w / 2;
      const toRoof = nF === 1;
      const rise = toRoof ? H : fh;
      const n = Math.ceil(rise / 0.19);
      const land = 1.0;
      const z0 = zF - 0.1;
      const tread = Math.min(0.28, (d - 0.3 - land) / n);
      const stepC = ch(0.5) ? PAL.concrete : PAL.stoneStep;
      const scx = (sx0 + sx1) / 2;
      for (let k = 0; k < n; k++) {
        const top = (k + 1) * rise / n;
        const za = z0 - (k + 1) * tread, zb = z0 - k * tread;
        const solid = top < 1.0;
        const g = Math.min(0, gRel(scx, (za + zb) / 2));
        const yb = solid ? g - 0.25 : top - 0.2;
        P.slab(sx0 + 0.02, yb, za, sx1 - 0.02, top, zb + 0.02, stepC);
        box(sx0 + 0.02, za, sx1 - 0.02, zb, solid ? yLow : top - 0.2, top, 'step');
      }
      const zl1 = z0 - n * tread, zl0 = zl1 - land;
      P.slab(sx0, rise - 0.2, zl0, sx1, rise, zl1 + 0.02, stepC);
      box(sx0, zl0, sx1, zl1, rise - 0.2, rise, 'step');
      const outer = stairs === 'left' ? sx0 + 0.08 : sx1 - 0.08;
      const gl = gRel(outer, zl0 + 0.2);
      P.slab(outer - 0.12, gl - 0.2, zl0 + 0.05, outer + 0.12, rise - 0.2, zl0 + 0.29, PAL.concrete);
      box(outer - 0.12, zl0 + 0.05, outer + 0.12, zl0 + 0.29, yLow, rise - 0.2, 'column');
      // railing: sloped rail on posts along the open side, plus the landing
      const t0 = rise / n;
      beam(P, [outer, t0 + 0.95, z0 - tread / 2], [outer, rise + 0.95, zl1], 0.05, railC);
      for (const k of [0, Math.floor(n / 2), n - 1]) {
        const top = (k + 1) * rise / n;
        P.box(0.05, 0.95, 0.05, [outer, top + 0.475, z0 - (k + 0.5) * tread], railC);
      }
      P.box(0.05, 0.05, land, [outer, rise + 0.95, (zl0 + zl1) / 2], railC);
      P.box(0.05, 0.95, 0.05, [outer, rise + 0.475, zl0 + 0.03], railC);
      P.box(sx1 - sx0, 0.05, 0.05, [scx, rise + 0.95, zl0 + 0.03], railC);
      box(sx0, zl0, sx1, zl0 + 0.08, rise, rise + 1.0, 'railing');
      if (!toRoof) {
        // door onto the landing
        const f = stairs;
        face(f, () => {
          const lz = (zl0 + zl1) / 2;
          P.group([f === 'left' ? lz : -lz, rise, 0], 0, () => door(0, 0.8, pick(r, [PAL.shutterBlue, PAL.woodDoor, PAL.shutterGreen]), false));
        });
      }
    }

    // ---- roof ---------------------------------------------------------------------------------------------------------------
    let roof: RoofKind = spec.roof ?? (unfinished ? 'flat'
      : pick(r, ground === 'house' ? ['flat', 'tin', 'tin', 'tinHip', 'terrace'] as const
        : ground === 'hotel' ? ['flat', 'terrace', 'terrace', 'tin'] as const
          : ['flat', 'flat', 'tin', 'tin', 'tinHip', 'terrace'] as const));
    if (unfinished && (roof === 'tin' || roof === 'tinHip')) roof = 'flat';
    // in a terrace of buildings a randomly chosen hip roof becomes a street-parallel gable (no eaves into neighbours)
    const partyAny = !!(party.left || party.right);
    if (partyAny && roof === 'tinHip' && spec.roof === undefined) roof = 'tin';
    let roofTop = H;
    const rebar = spec.rebar ?? (unfinished || (roof === 'flat' && ch(0.3)));
    const roofReachable = !!stairs && nF === 1;

    const tank = (x: number, z: number, base: number, stand: boolean) => {
      let b = base;
      if (stand) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(0.05, 0.55, 0.05, [x + sx * 0.45, b + 0.275, z + sz * 0.45], IRON);
        P.box(1.05, 0.07, 1.05, [x, b + 0.58, z], IRON);
        b += 0.62;
      }
      P.cyl(0.52, 0.52, 1.05, [x, b, z], PAL.waterTank, 8);
      P.cyl(0.545, 0.545, 0.07, [x, b + 0.62, z], 0x2b2b30, 8);
      P.cyl(0.17, 0.17, 0.07, [x, b + 1.05, z], 0x2b2b30, 6);
      P.box(0.05, b - base + 0.1, 0.05, [x + 0.5, base + (b - base) / 2 + 0.05, z + 0.2], PAL.wallWhite);
      return b + 1.12;
    };
    const dish = (x: number, z: number, base: number) => {
      P.box(0.05, 0.9, 0.05, [x, base + 0.45, z], IRON);
      P.cyl(0.36, 0.05, 0.12, [x, base + 0.95, z + 0.02], PAL.dish, 8, { rot: [1.0, 0, 0] });
      beam(P, [x, base + 1.0, z + 0.06], [x, base + 1.18, z + 0.42], 0.03, PAL.dish);
      P.box(0.07, 0.07, 0.09, [x, base + 1.2, z + 0.45], PAL.windowFrame);
    };
    const antenna = (x: number, z: number, base: number) => {
      P.box(0.045, 2.4, 0.045, [x, base + 1.2, z], IRON);
      P.box(0.035, 0.035, 1.3, [x, base + 2.35, z], IRON);
      for (let k = 0; k < 4; k++) P.box(0.7 - k * 0.1, 0.035, 0.035, [x, base + 2.38, z - 0.55 + k * 0.36], IRON);
    };
    const rebarStub = (x: number, z: number, base: number) => {
      const h = 0.35 + r() * 0.6;
      P.box(0.28, h, 0.28, [x, base + h / 2, z], PAL.concrete);
      for (const [ox, oz] of [[-0.09, -0.09], [0.09, 0.09], [0.09, -0.09]] as const) {
        if (ch(0.15)) continue;
        const L = 0.45 + r() * 0.55;
        beam(P, [x + ox, base + h, z + oz], [x + ox * (1 + r() * 2.5), base + h + L, z + oz * (1 + r() * 2.5)], 0.035, PAL.roofRust);
      }
    };
    const flagString = (a: V3, b: V3) => {
      const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.3));
      const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
      const sag = 0.06 * Math.hypot(b[0] - a[0], b[2] - a[2]);
      const pt = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      for (let s = 0; s < 4; s++) beam(P, pt(s / 4), pt((s + 1) / 4), 0.025, PAL.wallWhite);
      const off = Math.floor(r() * 5);
      for (let k = 1; k < n; k++) {
        const p = pt(k / n);
        P.group([p[0], p[1] - 0.11, p[2]], yaw + Math.PI / 2, () => P.add(quadGeometry(0.17, 0.19), PAL.lungta[(k + off) % 5]));
      }
    };
    const pole = (x: number, z: number, base: number, h: number) => { P.box(0.06, h, 0.06, [x, base + h / 2, z], PAL.barkLight); return [x, base + h, z] as V3; };
    const clothesLine = (x0: number, z0: number, x1: number, z1: number, base: number) => {
      const a = pole(x0, z0, base, 1.7), b = pole(x1, z1, base, 1.7);
      beam(P, a, b, 0.025, PAL.wallWhite);
      const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      let t = 0.12;
      while (t < 0.9) {
        const cw = 0.3 + r() * 0.35, ch2 = 0.4 + r() * 0.45;
        const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        P.group([px, base + 1.68 - ch2 / 2, pz], yaw + Math.PI / 2, () => P.add(quadGeometry(cw, ch2), pick(r, CLOTHES)));
        t += (cw + 0.1 + r() * 0.3) / L;
      }
    };
    const solarHeater = (x: number, z: number, base: number) => {
      P.group([x, base, z], 0, () => {
        P.box(1.5, 0.05, 1.0, [0, 0.55, 0.1], PAL.windowFrame, { rot: [0.6, 0, 0] });
        for (let k = 0; k < 5; k++) P.box(0.05, 0.03, 0.95, [-0.6 + k * 0.3, 0.58, 0.1], PAL.slateLight, { rot: [0.6, 0, 0] });
        P.cyl(0.19, 0.19, 1.6, [-0.8, 0.98, -0.35], PAL.dish, 8, { rot: [0, 0, -Math.PI / 2] });
        for (const sx of [-0.65, 0.65]) P.box(0.05, 0.9, 0.05, [sx, 0.45, -0.35], IRON);
      });
    };
    /** Single-slope corrugated roof over x ∈ [x0, x1], from zHigh (back, top yHigh) sloping down to zLow. */
    const leanTo = (x0: number, x1: number, zHigh: number, zLow: number, yHigh: number, drop: number, col: number) => {
      const L = Math.hypot(zLow - zHigh, drop);
      P.group([(x0 + x1) / 2, yHigh, zHigh], zLow > zHigh ? 0 : Math.PI, () => {
        P.groupEuler([0, 0, 0], [Math.atan2(drop, Math.abs(zLow - zHigh)), 0, 0], () => {
          P.add(corrugated(-(x1 - x0) / 2, (x1 - x0) / 2, () => [0, L], 0.3, 0.04), col);
          P.box(x1 - x0, 0.04, L, [0, -0.025, L / 2], shade(col, 0.6));
        });
      });
    };

    sec('roof');
    if (roof === 'flat' || roof === 'terrace') {
      const terrace = roof === 'terrace';
      P.slab(bx0 + 0.15, H, zB + 0.15, bx1 - 0.15, H + 0.03, zF - 0.15, pick(r, [PAL.concreteStain, PAL.concreteDark, PAL.wallTerracotta]));
      const noParapet = rebar && ch(0.5);
      const ph = terrace ? 0.5 : noParapet ? 0 : ch(0.7) ? 0.9 : 0.55;
      const parC = unfinished ? BRICK : storeyCol[nF - 1];
      if (ph > 0) {
        const sides: [number, number, number, number][] = [
          [bx0, zF - 0.15, bx1, zF], [bx0, zB, bx1, zB + 0.15], [bx0, zB + 0.15, bx0 + 0.15, zF - 0.15], [bx1 - 0.15, zB + 0.15, bx1, zF - 0.15],
        ];
        for (const [x0, z0, x1, z1] of sides) {
          P.slab(x0, H, z0, x1, H + ph, z1, parC);
          P.slab(x0 - 0.03, H + ph, z0 - 0.03, x1 + 0.03, H + ph + 0.06, z1 + 0.03, trim);
          if (roofReachable) box(x0, z0, x1, z1, H, H + ph + 0.06, 'parapet');
        }
        roofTop = H + ph + 0.06;
        if (terrace) {
          const rh = 0.5;
          for (const [cx, cz] of [[bx0 + 0.07, zF - 0.07], [bx1 - 0.07, zF - 0.07], [bcx, zF - 0.07], [bx0 + 0.07, 0], [bx1 - 0.07, 0]] as const) {
            P.box(0.05, rh, 0.05, [cx, H + ph + rh / 2, cz], railC);
          }
          P.box(bw, 0.05, 0.05, [bcx, H + ph + rh, zF - 0.07], railC);
          for (const sx of [bx0 + 0.07, bx1 - 0.07]) P.box(0.05, 0.05, d * 0.6, [sx, H + ph + rh, zF - d * 0.3], railC);
        }
      }
      const rx0 = bx0 + 0.45, rx1 = bx1 - 0.45, rz0 = zB + 0.45, rz1 = zF - 0.45;
      const base = H + 0.03;
      let backFree = rz0; // z where free roof space begins (after the back structures)
      let flagB: V3 | null = null;
      const side = ch(0.5) ? -1 : 1;
      if (terrace) {
        // penthouse room across the back with a lean-to tin roof shading part of the terrace
        const pd = clamp(d * 0.42, 2.2, 3.4);
        const px0 = bx0 + 0.15, px1 = bx1 - 0.15, pz0 = zB + 0.15, pz1 = zB + 0.15 + pd;
        const roomC = ch(0.5) ? storeyCol[nF - 1] : pick(r, WALLS);
        P.slab(px0, H, pz0, px1, H + 2.35, pz1, roomC);
        face('front', () => P.group([0, H, 0], 0, () => {
          door(bcx + bw * 0.25, 0.8, pick(r, [PAL.shutterBlue, PAL.woodDoor, PAL.shutterGreen]), true);
          win(bcx - bw * 0.2, 0.95, Math.min(1.1, bw * 0.25), 1.0, 1, 'glass');
        }), pz1);
        leanTo(px0 - 0.2, px1 + 0.2, pz0 - 0.25, pz1 + 1.1, H + 2.42 + 0.55, 0.55, roofCol);
        lamp(bcx + bw * 0.25 + 0.6, H + 2.1, pz1 + 0.3, 2.5, 6);
        backFree = pz1 + 1.2;
        // terrace furniture
        const tx = bcx - bw * 0.15, tz = Math.min(rz1 - 0.4, backFree + 0.4);
        P.box(0.62, 0.05, 0.62, [tx, base + 0.72, tz], PAL.woodTrim);
        P.box(0.08, 0.7, 0.08, [tx, base + 0.35, tz], IRON);
        for (const s of [-1, 1]) P.box(0.4, 0.42, 0.4, [tx + s * 0.55, base + 0.21, tz], PAL.wallWhite);
        if (bw > 4) {
          // sun umbrella
          P.box(0.04, 2.0, 0.04, [tx, base + 1.0, tz], IRON);
          P.cyl(0.02, 1.0, 0.35, [tx, base + 1.85, tz], pick(r, [PAL.roofRed, PAL.wallYellow, PAL.roofGreen, PAL.wallWhite]), 8);
        }
        for (let k = 0; k < 3; k++) pot(P, r, rx0 + (rx1 - rx0) * (k + 0.5) / 3 + 0.3, base, rz1 - 0.05);
        flagB = [px0 + 0.1, H + 2.6, pz1 - 0.2];
      } else {
        // stair-head room (mumty), tanks, solar heater, dish, antenna, rebar, clothes, flags
        const hasMumty = (spec.mumty ?? (nF >= 2 && bw >= 4 && d >= 5 && ch(0.45))) && !roofReachable && bw >= 3.4 && d >= 4.2;
        let nTanks = spec.tanks ?? (1 + (ch(0.45) ? 1 : 0));
        if (hasMumty) {
          const mw = 2.0, md = 2.5;
          const mx0 = side > 0 ? rx1 - mw + 0.3 : rx0 - 0.3, mx1 = mx0 + mw, mz0 = rz0 - 0.3, mz1 = mz0 + md;
          const mc = unfinished ? BRICK : storeyCol[nF - 1];
          P.slab(mx0, H, mz0, mx1, H + 2.3, mz1, mc);
          P.slab(mx0 - 0.12, H + 2.3, mz0 - 0.12, mx1 + 0.12, H + 2.42, mz1 + 0.12, trim);
          face('front', () => P.group([0, H, 0], 0, () => door((mx0 + mx1) / 2 + (side > 0 ? -0.3 : 0.3), 0.8, pick(r, [PAL.shutterBlue, PAL.woodDoor, PAL.shutterGreen, PAL.shutter]), false)), mz1);
          let tTop = H + 2.42;
          if (nTanks > 0) { tTop = tank((mx0 + mx1) / 2, (mz0 + mz1) / 2, H + 2.42, false); nTanks--; }
          flagB = [(mx0 + mx1) / 2, tTop + 0.15, (mz0 + mz1) / 2];
          roofTop = Math.max(roofTop, tTop);
          backFree = rz0 - 0.3 + 2.5 + 0.2;
          if (spec.antenna ?? ch(0.3)) antenna(side > 0 ? mx0 + 0.3 : mx1 - 0.3, mz0 + 0.3, H + 2.42);
        }
        for (let k = 0; k < nTanks; k++) {
          const tx = hasMumty ? (side > 0 ? rx0 + 0.35 + k * 1.2 : rx1 - 0.35 - k * 1.2) : (k === 0 ? rx0 + 0.35 : rx1 - 0.35);
          if (tx < rx0 - 0.1 || tx > rx1 + 0.1) continue;
          const tTop = tank(tx, rz0 + 0.35, base, ch(0.6));
          if (!flagB) flagB = [tx, tTop + 0.1, rz0 + 0.35];
          roofTop = Math.max(roofTop, tTop);
          if (!hasMumty) backFree = Math.max(backFree, rz0 + 1.0);
          if (roofReachable) colliders.push({ x: wX(tx, rz0 + 0.35), z: wZ(tx, rz0 + 0.35), w: 1.1, d: 1.1, rot: at.yaw, y0: y + H, y1: y + tTop, tag: 'tank' });
        }
        if ((spec.solar ?? ch(0.3)) && bw >= 4 && rz1 - backFree > 1.6) {
          solarHeater(hasMumty ? (side > 0 ? rx0 + 1.0 : rx1 - 1.0) : bcx, backFree + 0.6, base);
          backFree += 1.4;
        }
        if (spec.dish ?? ch(0.5)) dish(side > 0 ? rx0 + 0.1 : rx1 - 0.1, rz1 - 0.05, base);
        if (!hasMumty && (spec.antenna ?? ch(0.2))) antenna(side > 0 ? rx1 - 0.2 : rx0 + 0.2, rz1 - 0.3, base);
        if ((spec.clothes ?? ch(0.45 * clutter + 0.1)) && rz1 - backFree > 0.8 && bw > 3) {
          const cz = (backFree + rz1) / 2;
          clothesLine(rx0 + 0.1, cz, rx1 - 0.1, cz + (r() - 0.5) * 0.6, base);
        }
        if (ch(0.5 * clutter)) for (let k = 0; k < 2; k++) pot(P, r, side > 0 ? rx1 - 0.2 - k * 0.45 : rx0 + 0.2 + k * 0.45, base, rz1 - 0.15);
        // roof life: a tarpaulin-covered pile or a stack of bricks, and damp patches on the slab
        if (ch(0.55 * clutter + 0.1) && rz1 - backFree > 1.0) {
          const jx = side > 0 ? rx1 - 0.5 : rx0 + 0.5, jz = backFree + 0.45;
          if (ch(0.6)) {
            P.taper(1.1, 0.8, 0.8, 0.5, 0.45, [jx, base, jz], pick(r, [PAL.roofBlue, PAL.railing, PAL.shutterBlue]));
            P.box(0.25, 0.08, 0.25, [jx - 0.35, base + 0.04, jz + 0.38], PAL.rockDark);
          } else {
            P.box(0.8, 0.36, 0.5, [jx, base + 0.18, jz], BRICK);
            P.box(0.5, 0.12, 0.5, [jx + 0.1, base + 0.42, jz], BRICK);
          }
        }
        for (let k = 0; k < 2; k++) {
          if (!ch(0.5)) continue;
          P.box(0.6 + r() * 0.9, 0.012, 0.5 + r() * 0.7, [rx0 + r() * (rx1 - rx0), base + 0.006, backFree + r() * Math.max(0.1, rz1 - backFree)], PAL.concreteStain);
        }
      }
      if (rebar) {
        const n = Math.max(2, Math.round(bw / 2.8) + 1);
        for (let i = 0; i < n; i++) {
          const cx = bx0 + 0.14 + (bw - 0.28) * i / (n - 1);
          for (const cz of [zF - 0.14, zB + 0.14]) {
            if (cz < 0 && (terrace || (i > 0 && i < n - 1) || ch(0.4))) continue;
            rebarStub(cx, cz, H + Math.max(0, ph));
          }
        }
      }
      if (spec.flags ?? ch(0.65)) {
        const a = pole(side > 0 ? rx0 - 0.25 : rx1 + 0.25, rz1 + 0.25, H + Math.max(0, ph), 2.1);
        flagString(a, flagB ?? [side > 0 ? rx1 + 0.25 : rx0 - 0.25, H + 1.6, rz0 - 0.1]);
        if (!flagB) pole(side > 0 ? rx1 + 0.25 : rx0 - 0.25, rz0 - 0.1, H + Math.max(0, ph), 1.6);
      }
    } else {
      // ---- tin roof: gable or hip, corrugated sheets with overhanging eaves -------------------------------------------
      const hip = roof === 'tinHip';
      const along = hip ? bw >= d : spec.ridge ? spec.ridge === 'x' : partyAny ? true : bw >= d ? ch(0.75) : ch(0.3);
      const Lr = along ? bw : d, Sp = along ? d : bw;
      const pitch = Math.atan(0.42), tn = Math.tan(pitch), cs = Math.cos(pitch);
      const rise = (Sp / 2) * tn;
      // eaves overhang; shrunk when eaves would run along a party wall (hip, or a gable facing the street)
      const ovE = partyAny && (hip || !along) ? 0.1 : 0.35;
      // verge overhang at each ridge end (in roof-local -X / +X); none against a party wall
      const ovA = along ? (party.left ? 0.02 : 0.25) : 0.25;
      const ovB = along ? (party.right ? 0.02 : 0.25) : 0.25;
      const bcz = (zB + zF) / 2;
      const faded = mixHex(roofCol, PAL.wallWhite, 0.18);
      /** Corrugated sheet in the current slope frame, split into panels (some faded / rusty). */
      const sheet = (u0: number, u1: number, vr: (u: number) => readonly [number, number]) => {
        const n = Math.max(1, Math.round((u1 - u0) / 1.6));
        for (let k = 0; k < n; k++) {
          const a = u0 + (u1 - u0) * k / n, b = u0 + (u1 - u0) * (k + 1) / n;
          const q = r();
          const c = q < 0.12 ? PAL.roofRust : q < 0.3 ? faded : roofCol;
          P.add(corrugated(a, b, vr, 0.3, 0.045), c);
        }
      };
      P.group([bcx, H, bcz], along ? 0 : Math.PI / 2, () => {
        const Ls = (Sp / 2 + ovE) / cs;
        if (!hip) {
          // gable infill (in the top storey's paint) + vent
          P.group([0, 0, 0], Math.PI / 2, () => P.prism(Sp, rise, Lr, [0, 0, 0], storeyCol[nF - 1]));
          for (const s of [-1, 1]) {
            if ((s < 0 ? ovA : ovB) < 0.1) continue;
            P.box(0.04, 0.3, 0.5, [s * (Lr / 2 + 0.01), rise * 0.45, 0], BLACK);
          }
          for (const s of [1, -1]) {
            P.group([0, rise, 0], s > 0 ? 0 : Math.PI, () => {
              P.groupEuler([0, 0.03, 0], [pitch, 0, 0], () => {
                const ua = s > 0 ? -Lr / 2 - ovA : -Lr / 2 - ovB, ub = s > 0 ? Lr / 2 + ovB : Lr / 2 + ovA;
                sheet(ua, ub, () => [0, Ls]);
                P.box(ub - ua, 0.05, Ls, [(ua + ub) / 2, -0.03, Ls / 2], shade(roofCol, 0.55));
                P.box(ub - ua, 0.12, 0.05, [(ua + ub) / 2, -0.06, Ls], shade(roofCol, 0.7)); // eave fascia
              });
            });
          }
          P.box(Lr + ovA + ovB + 0.04, 0.08, 0.32, [(ovB - ovA) / 2, rise + 0.06, 0], shade(roofCol, 0.75));
        } else {
          const RL = Math.max(0.02, Lr - Sp);
          P.taper(Lr + 2 * ovE, Sp + 2 * ovE, RL, 0.02, (Sp / 2 + ovE) * tn, [0, -ovE * tn, 0], shade(roofCol, 0.55));
          for (const s of [1, -1]) {
            P.group([0, rise, 0], s > 0 ? 0 : Math.PI, () => {
              P.groupEuler([0, 0.035, 0], [pitch, 0, 0], () => {
                sheet(-Lr / 2 - ovE, Lr / 2 + ovE, (u) => [Math.max(0, Math.abs(u) - RL / 2) / cs, Ls]);
              });
            });
            P.group([s * RL / 2, rise, 0], s * Math.PI / 2, () => {
              P.groupEuler([0, 0.035, 0], [pitch, 0, 0], () => {
                sheet(-Sp / 2 - ovE, Sp / 2 + ovE, (u) => [Math.abs(u) / cs, Ls]);
              });
            });
          }
          P.box(RL + 0.1, 0.08, 0.26, [0, rise + 0.06, 0], shade(roofCol, 0.75));
        }
      });
      roofTop = H + rise + 0.1;
      // a small flag on a pole at one end of the ridge, a dish bracketed to the wall
      if (spec.flags ?? ch(0.45)) {
        const ex = along ? (ch(0.5) ? bx0 + 0.3 : bx1 - 0.3) : bcx;
        const ez = along ? bcz : zF - 0.3;
        const a = pole(ex, ez, H + rise * 0.8, 1.9);
        const bpt: V3 = along ? [ex < bcx ? bx1 - 0.3 : bx0 + 0.3, H + rise + 0.9, bcz] : [bcx, H + rise + 0.9, zB + 0.3];
        pole(bpt[0], bpt[2], H + rise * 0.8, 1.6);
        flagString(a, bpt);
      }
      if (spec.dish ?? ch(0.35)) {
        const f: Face = !party.right ? 'right' : !party.left ? 'left' : 'front';
        face(f, () => {
          P.box(0.35, 0.05, 0.4, [f === 'front' ? bx0 + 0.6 : 0.8, H - 0.6, 0.2], IRON);
          dish(f === 'front' ? bx0 + 0.6 : 0.8, 0.3, H - 0.6);
        });
      }
      if ((spec.tanks ?? 0) > 0) {
        // a tank on a steel stand standing on the sheets near the back corner (roof surface ≈ H + 0.6·tan)
        const tTop = tank(ch(0.5) ? bx0 + 0.6 : bx1 - 0.6, zB + 0.6, H + 0.6 * tn - 0.06, true);
        roofTop = Math.max(roofTop, tTop);
      }
    }

    // ---- sign -------------------------------------------------------------------------------------------------------------
    if (sign) {
      const s: SignSpec = { ...sign };
      if (s.w === undefined && (ground === 'shop' || ground === 'cafe' || ground === 'garage')) {
        s.w = clamp(Math.max(signSize({ ...s, w: undefined, h: undefined }).w, bw * 0.72), 0.8, bw - 0.4);
      }
      const shopLike = ground === 'shop' || ground === 'cafe' || ground === 'garage';
      if (s.h === undefined) s.h = shopLike ? (s.bod ? 1.1 : 0.72) : s.bod ? 0.9 : 0.5;
      if (ground === 'hotel' && (roof === 'flat' || roof === 'terrace')) {
        // hotel name board standing on the roof parapet
        signAt(bcx, H + 0.3 + signSize(s).h / 2, zF + 0.06, s);
      } else if (balconyOnFirst) {
        // hung on the first-floor balcony front
        if (s.w !== undefined) s.w = Math.min(s.w, bHi - bLo - 0.1);
        s.h = Math.min(s.h, 0.8);
        signAt((bLo + bHi) / 2, fh + 0.45, zF + 0.72 + 0.035, s);
      } else {
        // across the first-floor band, above the shutters / awning
        signAt(bcx, Math.max(2.5 + signSize(s).h / 2, fh - 0.05), zF + 0.06, s);
      }
    }

    sec('');
    // ---- colliders ---------------------------------------------------------------------------------------------------------
    const mainTop = H; // roof floor / wall top (parapets get their own boxes when the roof is reachable)
    box(bx0, zB, bx1, recess ? zG : zF, yLow, mainTop);
    if (recess) {
      box(bx0, zG, bx1, zF, fh - st - 0.05, mainTop, 'overhang');
      if (nSteps === 0) box(bx0, zG, bx1, zF, yLow, 0, 'plinth');
      else box(bx0, zG, bx1, zF - stepRun, yLow, 0, 'plinth');
    }

    const dz = zF + 0.35;
    return {
      colliders, lamps, meshes,
      door: { x: wX(doorX, dz), y, z: wZ(doorX, dz) },
      top: y + roofTop,
    };
  }
}

/**
 * Placement for a building of depth `depth` beside a road, its front facing the road.
 * s = arc length along the road, side = +1 right / −1 left of the walking direction,
 * setback = gap between the road edge and the building front (pavement), default 0.6 m.
 */
export function besideRoad(road: Road, s: number, side: 1 | -1, depth: number, setback = 0.6): Placement {
  const f = roadFrame(road, s);
  const off = road.width / 2 + setback + depth / 2;
  const x = f.x + f.nx * off * side, z = f.z + f.nz * off * side;
  // face back toward the road centre
  const yaw = Math.atan2(-f.nx * side, -f.nz * side);
  return { x, z, yaw, y: f.y + 0.12 };
}

export interface RowOpts {
  depth?: number;
  minW?: number;
  maxW?: number;
  /** Floors range [min, max]. */
  floors?: [number, number];
  ground?: GroundFloor[];
  setback?: number;
  /** Gap between neighbours (m), default 0.15. */
  gap?: number;
  /** Return true to leave a gap at arc length s (lanes, stalls, landmarks). */
  skip?: (s: number) => boolean;
  /** Per-building overrides. */
  tweak?: (spec: BuildingSpec, i: number, s: number) => BuildingSpec;
  seed: number;
  /** Roof kinds to pick from (default: the kit's own mix). */
  roofs?: RoofKind[];
  /** Random extra setback (m) per building so fronts don't line up perfectly, default 0.12. */
  jitter?: number;
}

/** Fill road frontage between arc lengths s0..s1 on one side with a row of varied buildings. */
export function streetRow(parts: Parts, road: Road, s0: number, s1: number, side: 1 | -1, o: RowOpts): BuiltBuilding[] {
  const r = rng(o.seed);
  const out: BuiltBuilding[] = [];
  // first pass: lay out the plots so each building knows whether it touches a neighbour
  const plots: { w: number; mid: number; skip: boolean }[] = [];
  let s = s0;
  while (s < s1) {
    const w = (o.minW ?? 4.5) + r() * ((o.maxW ?? 7.5) - (o.minW ?? 4.5));
    if (s + w > s1) break;
    const mid = s + w / 2;
    plots.push({ w, mid, skip: !!o.skip?.(mid) });
    s += w + (o.gap ?? 0.15);
  }
  const gap = o.gap ?? 0.15;
  const touching = gap < 0.6;
  let i = 0, lastWall = -1;
  for (let k = 0; k < plots.length; k++) {
    const p = plots[k];
    if (p.skip) continue;
    const fl = o.floors ?? [2, 4];
    const prev = k > 0 && !plots[k - 1].skip && touching;
    const next = k < plots.length - 1 && !plots[k + 1].skip && touching;
    // neighbour at smaller s is on local +x for side = +1 ("right" seen from the street), local −x for side = −1
    const party = side > 0 ? { right: prev, left: next } : { left: prev, right: next };
    let wall = pick(r, WALLS) as number;
    if (wall === lastWall) wall = pick(r, WALLS);
    lastWall = wall;
    let spec: BuildingSpec = {
      w: p.w, d: o.depth ?? 7, floors: fl[0] + Math.floor(r() * (fl[1] - fl[0] + 1)),
      ground: o.ground ? pick(r, o.ground) : 'shop', seed: o.seed * 101 + i, party, wall,
    };
    if (o.roofs?.length) spec.roof = pick(r, o.roofs);
    if (o.tweak) spec = o.tweak(spec, i, p.mid);
    const setback = (o.setback ?? 0.6) + r() * (o.jitter ?? 0.12);
    out.push(buildBuilding(parts, spec, besideRoad(road, p.mid, side, spec.d, setback)));
    i++;
  }
  return out;
}
