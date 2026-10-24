// Electric poles every ~25–30 m along each asphalt road with sagging HT / LT cables between them, service
// drops from the poles to the shop and house façades, and TV / phone cables slung across the road from
// façade to façade — the tangled-wire sky of an Indian hill town. Cables never dip below ~4.7 m over the road.
import { Vector3 } from 'three';
import type { V3 } from '../../core/geom';
import { groundY } from '../terrain';
import { powerPole, wire, srng, sagAt, type PoleKind } from '../../kit/street';
import { type PCtx, count, solid } from './ctx';
import { STREETS, edgePt, freeRange, postPt, stripOK, type EdgePt, type Facade } from './plan';
import type { Road } from '../layout';

export interface PoleInfo { p: EdgePt; top: V3; tips: V3[]; low: V3; kind: PoleKind }

const CABLE = 0x1c1c1f, CABLE_GREY = 0x3a3a3e, CABLE_BLACK = 0x161618;
const MIN_CLEAR = 4.7;
const _v = new Vector3();

/** Largest sag (≤ want) that keeps the cable ≥ MIN_CLEAR above the ground everywhere along it. */
export function safeSag(a: V3, b: V3, want: number, clear = MIN_CLEAR): number {
  let sag = want;
  for (let it = 0; it < 6; it++) {
    let ok = true;
    for (let k = 1; k < 8; k++) {
      sagAt(a, b, sag, k / 8, _v);
      if (_v.y - groundY(_v.x, _v.z) < clear) { ok = false; break; }
    }
    if (ok) return sag;
    sag *= 0.6;
  }
  return -1; // even a taut line is too low
}

function poleSpot(c: PCtx, road: Road, s: number, side: 1 | -1, s0: number, s1: number) {
  for (let k = 0; k <= 16; k++) {
    const ss = s + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.8;
    if (ss < s0 || ss > s1) continue;
    const p = postPt(road, ss, side);
    if (!stripOK(p, p.off)) continue;
    if (c.obs.blocked(p.x, p.z, 0.36, p.y + 0.05, p.y + 7.6)) continue;
    if (c.obs.structureDist(p.x, p.z, 1.6, 2.5) < 0.85) continue;
    // the crossbar reaches 0.85 m to each side across the road: keep its outer end out of walls
    const ex = p.x + p.ox * 0.85, ez = p.z + p.oz * 0.85;
    if (c.obs.structureDist(ex, ez, 1, 5) < 0.2) continue;
    if (c.obs.blocked(ex, ez, 0.1, p.y + 6.4, p.y + 7.6)) continue;
    return p;
  }
  return null;
}

/** Façade beside the road near arc length s on one side (top at least `minTop` above the road). */
export function frontage(c: PCtx, road: Road, s: number, side: 1 | -1, minTop = 5.4): Facade | null {
  const q = edgePt(road, s, side, 0.5);
  return c.obs.facade(q.x, q.z, 2.4, q.roadY, minTop);
}

export function buildPower(c: PCtx): PoleInfo[] {
  const all: PoleInfo[] = [];
  for (const road of STREETS) {
    const [s0, s1] = freeRange(road);
    const r = srng(4100 + road.id.length * 37 + Math.round(road.width * 10));
    let side: 1 | -1 = road.id === 'temple-road' || road.id === 'bhagsu-road' ? 1 : -1;
    const poles: PoleInfo[] = [];
    for (let s = s0 + 1.5 + r() * 2; s < s1 - 0.5; s += 24 + r() * 6) {
      let p = poleSpot(c, road, s, side, s0, s1);
      if (!p) p = poleSpot(c, road, s, side === 1 ? -1 : 1, s0, s1);
      if (!p) continue;
      const roll = r();
      const kind: PoleKind = roll < 0.62 ? 'concrete' : roll < 0.88 ? 'wood' : 'rail';
      const P = powerPole(c.tall, p.x, p.kerb ? p.y - 0.12 : p.y, p.z, p.yawAlong, kind, 5200 + Math.round(p.x * 31 + p.z * 17));
      solid(c, P.collider);
      const info: PoleInfo = { p, top: P.top, tips: P.tips, low: P.low, kind };
      poles.push(info);
      c.anchors.push({ x: p.x, z: p.z, y: p.y, top: P.top[1], kind: 'pole', road: road.id, s: p.s });
      count(c, 'poles');
      side = p.side;
      if (r() < 0.22) side = side === 1 ? -1 : 1; // the line hops across the road now and then
    }
    // HT (3 cables on the top insulators) and LT (2–4 on the lower bar) between consecutive poles
    for (let i = 1; i < poles.length; i++) {
      const A = poles[i - 1], B = poles[i];
      const span = Math.hypot(B.top[0] - A.top[0], B.top[2] - A.top[2]);
      if (span > 42) continue;
      const sag = safeSag(A.top, B.top, 0.25 + span * 0.022);
      if (sag > 0) wire(c.tall, A.top, B.top, sag, 3);
      const sagL = safeSag(A.low, B.low, 0.3 + span * 0.026);
      if (sagL > 0) wire(c.tall, A.low, B.low, sagL, r() < 0.5 ? 2 : 4, CABLE, r() < 0.5 ? 0.3 : 0.27, 0.032);
      count(c, 'spans');
    }
    // tie the first pole into the square's network (nearest pole of theirs)
    if (poles.length) {
      const F = poles[0];
      const theirs = c.obs.tagged(F.p.x, F.p.z, 36, 'pole').filter((q) => !c.anchors.some((a) => Math.hypot(a.x - q.x, a.z - q.z) < 0.5));
      theirs.sort((a, b) => Math.hypot(a.x - F.p.x, a.z - F.p.z) - Math.hypot(b.x - F.p.x, b.z - F.p.z));
      const q = theirs[0];
      if (q) {
        const tgt: V3 = [q.x, q.y1 - 0.25, q.z];
        const sag = safeSag(F.top, tgt, 0.6);
        if (sag > 0) { wire(c.tall, F.top, tgt, sag, 3); count(c, 'spans'); }
      }
    }
    // service drops: each pole feeds a few façades within ~10 m, on both sides of the road
    poles.forEach((P) => {
      const seen = new Set<unknown>();
      const n = 1 + Math.floor(r() * 3);
      let made = 0;
      for (let tries = 0; tries < 10 && made < n; tries++) {
        const sd: 1 | -1 = r() < 0.6 ? P.p.side : (P.p.side === 1 ? -1 : 1);
        const f = frontage(c, road, P.p.s + (r() - 0.5) * 20, sd);
        if (!f || seen.has(f.c)) continue;
        seen.add(f.c);
        const roadY = P.p.roadY;
        const h = Math.min(f.top - 0.35, roadY + 5.0 + r() * 1.1);
        if (h < roadY + 4.9) continue;
        const a: V3 = [P.low[0] + (r() - 0.5) * 0.5, P.low[1] - 0.02, P.low[2] + (r() - 0.5) * 0.5];
        const b: V3 = [f.x, h, f.z];
        const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (span < 1.2 || span > 18) continue;
        const sag = safeSag(a, b, 0.12 + span * 0.025);
        if (sag < 0) continue;
        const bundle = r() < 0.4 ? 2 : 1;
        wire(c.tall, a, b, sag, bundle, pick3(r), 0.07, 0.026);
        // insulator hook / meter clamp where it meets the wall
        c.tall.box(0.07, 0.07, 0.07, [b[0], b[1], b[2]], 0xe6e3dc);
        made++;
        count(c, 'drops');
      }
    });
    all.push(...poles);
  }
  return all;
}

const pick3 = (r: () => number) => { const k = r(); return k < 0.6 ? CABLE : k < 0.85 ? CABLE_BLACK : CABLE_GREY; };

/**
 * TV / phone / internet cables slung across the road between façades (and the odd one along it), in
 * loose bundles, 5–6.6 m up.
 */
export function buildCrossCables(c: PCtx) {
  for (const road of STREETS) {
    const [s0, s1] = freeRange(road);
    const r = srng(8800 + road.id.length * 11);
    const dense = road.id === 'temple-road' || road.id === 'jogiwara-road';
    for (let s = s0 + 2 + r() * 3; s < s1 - 2; s += (dense ? 5.5 : 9) + r() * (dense ? 4 : 7)) {
      const sB = s + (r() - 0.5) * 7;
      const A = frontage(c, road, s, -1, 5.3), B = frontage(c, road, sB, 1, 5.3);
      if (!A || !B) continue;
      const ry = edgePt(road, s, 1, 0).roadY;
      const ha = Math.min(A.top - 0.3, ry + 5.1 + r() * 1.5), hb = Math.min(B.top - 0.3, ry + 5.1 + r() * 1.5);
      if (ha < ry + 4.9 || hb < ry + 4.9) continue;
      const a: V3 = [A.x, ha, A.z], b: V3 = [B.x, hb, B.z];
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (span > 16) continue;
      const sag = safeSag(a, b, 0.15 + span * (0.03 + r() * 0.04));
      if (sag < 0) continue;
      const n = 1 + Math.floor(r() * (dense ? 3 : 2));
      wire(c.tall, a, b, sag, n, pick3(r), 0.06 + r() * 0.08, 0.024);
      c.tall.box(0.06, 0.06, 0.06, a, 0x3a3a3e);
      c.tall.box(0.06, 0.06, 0.06, b, 0x3a3a3e);
      count(c, 'crossCables');
    }
  }
}
