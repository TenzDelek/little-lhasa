// Building rows along Bhagsu Road and Dharamkot Road, made with the building kit. Each building is fitted to
// the land: its depth shrinks until the footprint is clear of buildings already placed (inner sides of bends)
// and of other roads / territories, and on the uphill side its floor is lifted a little above the road (the
// kit adds a stone plinth and front steps), so the rows step up and down the hill like a real hill town.
import type { Road } from '../layout';
import { groundY } from '../terrain';
import { ROADS, PLAZAS } from '../layout';
import { buildBuilding, besideRoad, type BuildingSpec, type BuiltBuilding } from '../../kit/building';
import type { Ctx } from './ctx';
import { obbOverlap, rectDist, roadDist, SQUARE_BOX, toWorld, KORA, type OBB } from './util';

export interface PlotOpts {
  /** Gap between the road edge and the façade (m), default 0.6. */
  setback?: number;
  /** Max / min depth (m). */
  depth?: number;
  minDepth?: number;
  /** Lift the floor on rising ground (default true). */
  lift?: boolean;
  /** Extra floor lift (m). */
  extraLift?: number;
}

export interface Placed { b: BuiltBuilding; foot: OBB; s: number; w: number; d: number; y: number; yaw: number; x: number; z: number }

/** Is every sample of this footprint clear of other roads, plazas and other builders' territories? */
function footOK(own: Road, f: OBB): boolean {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  for (const i of [-1, -0.5, 0, 0.5, 1]) for (const j of [-1, -0.33, 0.33, 1]) {
    const lx = i * f.hw, lz = j * f.hd;
    const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
    if (x > SQUARE_BOX[0] && x < SQUARE_BOX[2] && z > SQUARE_BOX[1] && z < SQUARE_BOX[3]) return false;
    for (const p of PLAZAS) if (rectDist(p.rect, x, z) < 1.0) return false;
    for (const r of ROADS) {
      if (r === own) continue;
      const d = roadDist(r, x, z);
      if (d.edge < (r === KORA ? 2.5 : 1.2)) return false;
    }
    if (roadDist(own, x, z).edge < 0.45) return false;
  }
  return true;
}

/**
 * Place one kit building beside `road` at arc length s (centre), side ±1, frontage width w. Returns null
 * if no depth ≥ minDepth fits. Registers colliders, lamps, sign meshes and the footprint in the context.
 */
export function placeBuilding(c: Ctx, road: Road, side: 1 | -1, s: number, w: number, spec: Omit<BuildingSpec, 'w' | 'd'>, o: PlotOpts = {}): Placed | null {
  const setback = o.setback ?? 0.6;
  let d = o.depth ?? 7;
  const minD = o.minDepth ?? 4.2;
  let at = besideRoad(road, s, side, d, setback);
  let foot: OBB = { x: at.x, z: at.z, hw: w / 2, hd: d / 2, yaw: at.yaw };
  const clear = (f: OBB) => footOK(road, f) && !c.footprints.some((q) => obbOverlap(q, f, 0.04));
  while (!clear(foot)) {
    d -= 0.5;
    if (d < minD) return null;
    at = besideRoad(road, s, side, d, setback);
    foot = { x: at.x, z: at.z, hw: w / 2, hd: d / 2, yaw: at.yaw };
  }
  // floor level: a little above the road, lifted on rising ground (front steps are added by the kit)
  const roadY = (at.y ?? 0) - 0.12;
  let y = roadY + 0.12;
  if (o.lift !== false) {
    const [bx, bz] = toWorld({ x: at.x, z: at.z, yaw: at.yaw }, 0, -d / 2);
    const rise = groundY(bx, bz) - roadY;
    if (rise > 0.35) y += Math.min(1.05, Math.round((rise * 0.6) / 0.17) * 0.17);
  }
  y += o.extraLift ?? 0;
  const b = buildBuilding(c.bld, { ...spec, w, d } as BuildingSpec, { x: at.x, z: at.z, yaw: at.yaw, y });
  c.colliders.push(...b.colliders);
  c.bLamps.push(...b.lamps);
  c.meshes.push(...b.meshes);
  c.footprints.push(foot);
  return { b, foot, s, w, d, y, yaw: at.yaw, x: at.x, z: at.z };
}

export interface RowItem {
  /** Frontage width (m). */
  w: number;
  spec: Omit<BuildingSpec, 'w' | 'd'>;
  opts?: PlotOpts;
  /** Leave this much empty frontage before the building (m). */
  gapBefore?: number;
}

/**
 * Lay out buildings one after another from arc length s0 (in walking order along the road), each `gap` m
 * apart. Party walls are set where neighbours touch. Returns what was placed.
 */
export function row(c: Ctx, road: Road, side: 1 | -1, s0: number, items: RowItem[], gap = 0.15): Placed[] {
  const out: Placed[] = [];
  let s = s0;
  items.forEach((it, i) => {
    s += it.gapBefore ?? 0;
    const prevTouch = i > 0 && !(it.gapBefore && it.gapBefore > 0.3) && out.length > 0 && Math.abs(out[out.length - 1].s + out[out.length - 1].w / 2 + gap - s) < 0.05;
    const next = items[i + 1];
    const nextTouch = !!next && !(next.gapBefore && next.gapBefore > 0.3);
    // neighbour at smaller s is on local +x for side = +1, local −x for side = −1 (as in kit streetRow)
    const party = side > 0 ? { right: prevTouch, left: nextTouch } : { left: prevTouch, right: nextTouch };
    const p = placeBuilding(c, road, side, s + it.w / 2, it.w, { party, ...it.spec }, it.opts);
    if (p) out.push(p);
    s += it.w + gap;
  });
  return out;
}
