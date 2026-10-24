// Vinyl banners strung high across Temple Road (and one across the head of Dharamkot Road, where it leaves the
// square, together with a bundle of cables and a lungta string): flex sheets in Tibetan maroon / saffron,
// white-and-blue NGO colours or loud yellow, with a printed border band, a big title line, small text rows,
// a line of Tibetan script and sometimes a portrait photo block — all as 1-px "text" marks in the shader.
// They billow gently in the wind (one merged mesh, one draw call) and hang from ropes tied to façades or poles.
import { BufferAttribute, Color, Mesh, PlaneGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attribute, float, floor, positionLocal, select, sin, uv, vec2, vec3, vec4 } from 'three/tsl';
import type { V3 } from '../../core/geom';
import { mat } from '../../core/materials';
import { hash12 } from '../../core/tsl';
import { U, WIND_DIR } from '../../core/uniforms';
import { pick } from '../../core/math';
import { roadFrame, type Road } from '../layout';
import { beam, srng, wire } from '../../kit/street';
import { type PCtx, count, mark } from './ctx';
import { DHARAMKOT, TEMPLE_RD, edgePt, freeRange } from './plan';
import { safeSag } from './power';

/** Metres per art pixel (the print grid). */
const PX = 0.044;

interface Banner { c: V3; yaw: number; w: number; h: number; bg: number; fg: number; accent: number; kind: number; seed: number }

const SCHEMES: { bg: number; fg: number; accent: number }[] = [
  { bg: 0x7a1f2b, fg: 0xf1c232, accent: 0xe6a92e }, // maroon + saffron (monastery / long-life prayers)
  { bg: 0xf3efe6, fg: 0x2f4f8a, accent: 0xc8322b }, // white, blue text, red band (NGO / school event)
  { bg: 0xf1c232, fg: 0x6e1f2a, accent: 0x2f63b8 }, // yellow with maroon
  { bg: 0x2f4f8a, fg: 0xf3efe6, accent: 0xf1c232 }, // blue with white
  { bg: 0xe9e4d8, fg: 0x7a1f2b, accent: 0x2f8a4a }, // cream, maroon text, green band
];

// ---- the material: print + billow ---------------------------------------------------------------------------
let bannerMat: ReturnType<typeof mat> | null = null;
function material() {
  if (bannerMat) return bannerMat;
  const bA = attribute<'vec4'>('bA', 'vec4'); // bg (linear rgb), seed
  const bB = attribute<'vec4'>('bB', 'vec4'); // fg (linear rgb), kind (0 text, 1 photo + text)
  const bC = attribute<'vec4'>('bC', 'vec4'); // accent (linear rgb), phase
  const bD = attribute<'vec4'>('bD', 'vec4'); // billow normal (world xyz, downwind), weight
  const bE = attribute<'vec2'>('bE', 'vec2'); // size in art pixels (w, h)

  // billow: the cloth bellies downwind between its tied corners, breathing with the gusts
  const t = U.time.mul(1.3).add(bC.w);
  const gust = sin(t).mul(0.5).add(sin(t.mul(2.7).add(uv().x.mul(3))).mul(0.25)).add(0.9);
  const off = bD.xyz.mul(bD.w.mul(gust).mul(U.wind).mul(0.16));

  const m = mat({ vertexColors: false, grain: 0, side: 'double', occlude: true, positionNode: positionLocal.add(off) });

  const wpx = bE.x, hpx = bE.y, seed = bA.w, kind = bB.w;
  const px = floor(uv().x.mul(wpx)), py = floor(uv().y.mul(hpx));
  const h1 = hash12(vec2(px.add(seed.mul(7.13)), py.add(seed.mul(3.31))));
  const frame = px.lessThan(1).or(px.greaterThan(wpx.sub(2))).or(py.lessThan(1)).or(py.greaterThan(hpx.sub(2)));
  const band = py.lessThan(3).or(py.greaterThan(hpx.sub(4)));
  // portrait block on the left (kind 1)
  const ph = hpx.sub(7);
  const photo = kind.greaterThan(0.5);
  const inPhoto = photo.and(px.greaterThanEqual(4)).and(px.lessThan(ph.add(4))).and(py.greaterThanEqual(4)).and(py.lessThan(hpx.sub(3)));
  const pu = px.sub(4).add(0.5).div(ph), pv = py.sub(4).add(0.5).div(ph);
  const head = pu.sub(0.5).mul(pu.sub(0.5)).add(pv.sub(0.62).mul(pv.sub(0.62)).mul(0.8)).lessThan(0.035);
  const robe = pv.lessThan(0.42).and(pu.sub(0.5).abs().lessThan(pv.mul(-0.5).add(0.42)));
  const photoCol = select(head, vec3(0.42, 0.22, 0.13), select(robe, vec3(0.2, 0.025, 0.035), vec3(0.62, 0.7, 0.78)));
  // text block
  const x0 = select(photo, ph.add(7), float(4));
  const lx = px.sub(x0), tw = wpx.sub(x0).sub(4);
  const inCols = lx.greaterThanEqual(0).and(lx.lessThan(tw));
  const ty0 = floor(hpx.mul(0.38));
  // title: 5-px capitals, 3 px + 1 gap, word spaces by hash
  const li = floor(lx.div(4)), lc = lx.sub(li.mul(4));
  const titleRow = py.greaterThanEqual(ty0).and(py.lessThan(ty0.add(5)));
  const title = titleRow.and(inCols).and(lc.lessThan(3)).and(hash12(vec2(li, seed)).greaterThan(0.17)).and(h1.greaterThan(0.36));
  // two rows of small 3-px text below
  const si = floor(lx.div(3)), sc = lx.sub(si.mul(3));
  const row1 = py.greaterThanEqual(ty0.sub(5)).and(py.lessThan(ty0.sub(2)));
  const row2 = py.greaterThanEqual(ty0.sub(9)).and(py.lessThan(ty0.sub(6))).and(py.greaterThanEqual(4));
  const small = row1.or(row2).and(lx.greaterThanEqual(0)).and(lx.lessThan(tw.mul(0.88))).and(sc.lessThan(2))
    .and(hash12(vec2(si, py.add(seed))).greaterThan(0.2)).and(h1.greaterThan(0.3));
  // Tibetan line above the title: a headline (with syllable gaps and tsheg dots) and stems hanging under it
  const bi = floor(lx.div(6)), bc = lx.sub(bi.mul(6));
  const word = hash12(vec2(bi, seed.add(5))).greaterThan(0.12);
  const top = ty0.add(8);
  const fits = top.lessThan(hpx.sub(4));
  const headline = py.equal(top).and(bc.lessThan(4)).or(py.equal(top).and(bc.equal(5)));
  const stems = py.greaterThanEqual(top.sub(2)).and(py.lessThan(top)).and(bc.lessThan(4)).and(h1.greaterThan(0.5));
  const bod = fits.and(inCols).and(lx.lessThan(tw.mul(0.8))).and(word).and(headline.or(stems));
  const ink = title.or(small).or(bod);

  const bg = bA.xyz, fg = bB.xyz, acc = bC.xyz;
  const base = select(frame, fg, select(band, acc, select(inPhoto, photoCol, select(ink, fg, bg))));
  const grain = hash12(vec2(px.mul(0.5).floor(), py.mul(0.5).floor()).add(seed)).sub(0.5).mul(0.08).add(1);
  m.colorNode = vec4(base.mul(grain), 1);
  bannerMat = m;
  return m;
}

const _c = new Color();
function geometry(b: Banner): BufferGeometry {
  const nx = Math.max(6, Math.round(b.w / 0.5)), ny = 3;
  const g = new PlaneGeometry(b.w, b.h, nx, ny);
  g.rotateY(b.yaw);
  g.translate(b.c[0], b.c[1], b.c[2]);
  g.deleteAttribute('normal');
  const n = g.attributes.position.count;
  const uvA = g.attributes.uv;
  // downwind normal of the sheet
  let fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  if (fx * WIND_DIR.x + fz * WIND_DIR.z < 0) { fx = -fx; fz = -fz; }
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4), Cc = new Float32Array(n * 4), D = new Float32Array(n * 4), E = new Float32Array(n * 2);
  const bg = _c.setHex(b.bg).toArray(), fg = new Color().setHex(b.fg).toArray(), ac = new Color().setHex(b.accent).toArray();
  for (let i = 0; i < n; i++) {
    const u = uvA.getX(i), v = uvA.getY(i);
    A.set([bg[0], bg[1], bg[2], b.seed], i * 4);
    B.set([fg[0], fg[1], fg[2], b.kind], i * 4);
    Cc.set([ac[0], ac[1], ac[2], b.seed * 0.37], i * 4);
    const w = Math.sin(Math.PI * u) * (0.4 + 0.6 * Math.sin(Math.PI * v)) + 0.12 * (1 - v) * Math.sin(Math.PI * u);
    D.set([fx, 0, fz, w], i * 4);
    E.set([b.w / PX, b.h / PX], i * 2);
  }
  g.setAttribute('bA', new BufferAttribute(A, 4));
  g.setAttribute('bB', new BufferAttribute(B, 4));
  g.setAttribute('bC', new BufferAttribute(Cc, 4));
  g.setAttribute('bD', new BufferAttribute(D, 4));
  g.setAttribute('bE', new BufferAttribute(E, 2));
  return g;
}

// ---- placement ------------------------------------------------------------------------------------------------
/**
 * Tie point on one side of the road near s, at most `h` above the road (lower on a lower building, but never
 * under `minH`): a façade, or failing that a power / flag pole of this road.
 */
function tie(c: PCtx, road: Road, s: number, side: 1 | -1, h: number, minH: number, maxD = 2.8): V3 | null {
  const q = edgePt(road, s, side, 0.5);
  const f = c.obs.facade(q.x, q.z, maxD, q.roadY, minH + 0.12);
  if (f) return [f.x, q.roadY + Math.min(h, f.top - 0.12 - q.roadY), f.z];
  let best: V3 | null = null, bd = 2.4;
  for (const a of c.anchors) {
    if (a.road !== road.id) continue;
    const d = Math.hypot(a.x - q.x, a.z - q.z);
    if (d > bd || (a.x - q.x) * q.ox + (a.z - q.z) * q.oz < -1.5) continue;
    const y = Math.min(a.top - 0.3, q.roadY + h);
    if (y < q.roadY + minH) continue;
    bd = d;
    best = [a.x, y, a.z];
  }
  return best;
}

const ROPE = 0xd8d0b8;

/** One banner across the road at s, hung from ropes tied at a (side −1) and b (side +1). */
function hang(c: PCtx, list: Banner[], road: Road, s: number, r: () => number, kindBias = 0.4, minBottom = 4.7, bh0 = 0.8, bh1 = 1.1): boolean {
  const f = roadFrame(road, s);
  const bh = bh0 + r() * (bh1 - bh0);
  const want = 6.0 + r() * 0.8;
  const A = tie(c, road, s, -1, want, minBottom + 0.1 + bh), B = tie(c, road, s, 1, want, minBottom + 0.1 + bh);
  if (!A || !B) return false;
  const h = Math.min(A[1], B[1]) - f.y - 0.12; // banner top above the road
  if (h - bh < minBottom) return false;
  const A2 = tie(c, road, s, -1, h - bh - 0.15, 3.5), B2 = tie(c, road, s, 1, h - bh - 0.15, 3.5);
  const span = Math.hypot(B[0] - A[0], B[2] - A[2]);
  if (span < road.width || span > road.width + 7) return false;
  const w = Math.min(road.width * (0.62 + r() * 0.12), span - 1.2);
  // centre over the road, facing along it
  const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2;
  const cx = f.x + (mx - f.x) * 0.3, cz = f.z + (mz - f.z) * 0.3;
  const yaw = Math.atan2(A[0] - B[0], A[2] - B[2]) + Math.PI / 2;
  const cy = f.y + h - bh / 2;
  const sc = pick(r, SCHEMES);
  list.push({ c: [cx, cy, cz], yaw, w, h: bh, ...sc, kind: r() < kindBias ? 1 : 0, seed: Math.floor(r() * 997) + 1 });
  // ropes: from the four corners out to the ties (bottom ropes to the lower ties when there are any)
  const ax = Math.cos(yaw), az = -Math.sin(yaw); // banner's local +x in world
  const corner = (sx: number, sy: number): V3 => [cx + ax * sx * w / 2, cy + sy * bh / 2, cz + az * sx * w / 2];
  // which end of the banner faces A?
  const sA = (A[0] - cx) * ax + (A[2] - cz) * az < 0 ? -1 : 1;
  const ropes: [V3, V3][] = [[corner(sA, 1), A], [corner(-sA, 1), B]];
  ropes.push([corner(sA, -1), A2 ?? [A[0], A[1] - 0.5, A[2]]], [corner(-sA, -1), B2 ?? [B[0], B[1] - 0.5, B[2]]]);
  for (const [p, q] of ropes) {
    const L = Math.hypot(q[0] - p[0], q[2] - p[2]);
    wire(c.tall, p, q, Math.min(0.12, L * 0.03), 1, ROPE, 0, 0.022);
  }
  // hem pipe along the top (a bamboo stick or a pipe slid through the hem)
  beam(c.tall, corner(-1, 1), corner(1, 1), 0.035, 0x8a7a56);
  count(c, 'banners');
  mark(c, 'banner', cx, cz);
  return true;
}

export function buildBanners(c: PCtx) {
  const list: Banner[] = [];
  const r = srng(2727);
  const [t0, t1] = freeRange(TEMPLE_RD);
  // a few across Temple Road, spread out along it
  const targets = [t0 + 6, t0 + 22, t0 + 41, t0 + 58].filter((s) => s < t1 - 3);
  for (const s of targets) {
    for (let k = 0; k < 10; k++) {
      const ss = s + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.8;
      if (hang(c, list, TEMPLE_RD, ss, r)) break;
    }
  }
  dharamkotHead(c, list, r);
  if (list.length) {
    const g = mergeGeometries(list.map(geometry), false);
    if (g) {
      g.computeBoundingSphere();
      const m = new Mesh(g, material());
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'props-banners';
      c.extra.push(m);
    }
  }
}

/**
 * The overhead span across the head of Dharamkot Road where it leaves the square: a bundle of cables between
 * the corner buildings, a lungta string above, and a welcome banner below.
 */
function dharamkotHead(c: PCtx, list: Banner[], r: () => number) {
  const road = DHARAMKOT;
  for (const s of [5, 4, 6, 3.5, 6.5, 7.5]) {
    const A = tie(c, road, s, -1, 6.3, 5.0, 3.6), B = tie(c, road, s + 0.6, 1, 6.1, 5.0, 3.6);
    if (!A || !B) continue;
    const span = Math.hypot(B[0] - A[0], B[2] - A[2]);
    if (span > 14) continue;
    const sag = safeSag(A, B, 0.35, 4.9);
    if (sag > 0) {
      wire(c.tall, A, B, sag, 3, 0x1c1c1f, 0.09, 0.026);
      c.tall.box(0.08, 0.08, 0.08, A, 0x3a3a3e);
      c.tall.box(0.08, 0.08, 0.08, B, 0x3a3a3e);
      count(c, 'crossCables', 3);
    }
    const A2 = tie(c, road, s - 0.8, -1, 7.4, 5.1, 3.6), B2 = tie(c, road, s - 0.4, 1, 7.2, 5.1, 3.6);
    if (A2 && B2) {
      const sp = Math.hypot(B2[0] - A2[0], B2[1] - A2[1], B2[2] - A2[2]);
      c.flags.push({ a: A2, b: B2, sag: sp * 0.07, age: 0.15, size: 0.24, seed: 4049 });
      count(c, 'flagLines');
    }
    // the welcome banner hangs a little lower (the corner building on the east is only two storeys)
    if (!hang(c, list, road, s - 1.8, r, 0, 4.55, 0.6, 0.66) && !hang(c, list, road, s - 2.4, r, 0, 4.55, 0.55, 0.6)) count(c, 'headBannerMissed');
    count(c, 'dharamkotHead');
    return;
  }
  count(c, 'dharamkotHeadMissed');
}

