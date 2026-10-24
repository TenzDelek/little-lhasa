// The town's forests: one InstancedMesh per tree / shrub / rock variant (see trees.ts, woods.ts), canopies
// swaying in the wind (TSL positionNode, shadows follow), dissolving at the diorama rim like the ground
// (rimKeep), trunk colliders. Trees that turn out to stand in another module's building (colliders registered
// after the plan was made) are hidden at mount and again once every module has registered its colliders;
// trees on the kora's outer side also keep ≥ 4.5 m from the temple's kora features and out from under the
// lungta fans that run down the hillside from its outer flag poles.
import { useEffect, useMemo } from 'react';
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { MeshLambertNodeMaterial, Node } from 'three/webgpu';
import { attribute, clamp, cos, float, positionGeometry, positionLocal, positionWorld, sin, vec3 } from 'three/tsl';
import { mat } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';
import { collision, type Collider } from '../../core/collision';
import { roadFrame } from '../layout';
import { groundY } from '../terrain';
import { fields, rimKeep } from '../ground/shade';
import { treeVariants, type TreeKind } from './trees';
import { isTree, type TreeInstance } from './woods';
import { KORA, roadDist } from './util';

// ---- wind material --------------------------------------------------------------------------------------
type WindKind = 'big' | 'small' | 'shrub';
const mats: Partial<Record<WindKind, MeshLambertNodeMaterial>> = {};
/** big: tree canopies (occlude); shrub: bushes, which also dissolve when they stand between the camera and the
 *  boy (the chase camera looks through the understory); small: ferns and rocks. */
function windMaterial(k: WindKind) {
  if (mats[k]) return mats[k]!;
  const big = k === 'big';
  // per instance: x = phase, y = sway start height, z = 1 / (h − sway start), w = amplitude at the top (m)
  const tW = attribute<'vec4'>('tW', 'vec4');
  const hy = positionGeometry.y;
  const kk = clamp(hy.sub(tW.y).mul(tW.z), 0, 1);
  const ph = tW.x;
  const t = U.time;
  const gust = sin(t.mul(0.33).add(ph.mul(0.21))).mul(0.3).add(0.8);
  const sway = sin(t.mul(1.15).add(ph)).mul(0.65).add(sin(t.mul(2.6).add(ph.mul(1.7)).add(hy.mul(0.7))).mul(0.25)).add(0.45);
  const amt = kk.mul(kk).mul(tW.w).mul(U.wind).mul(gust).mul(sway);
  const cross = cos(t.mul(1.7).add(ph.mul(1.3))).mul(kk).mul(tW.w).mul(0.3).mul(U.wind);
  const disp = vec3(
    float(WIND_DIR.x).mul(amt).add(float(-WIND_DIR.z).mul(cross)),
    float(0),
    float(WIND_DIR.z).mul(amt).add(float(WIND_DIR.x).mul(cross)),
  );
  const m = mat({ occlude: k !== 'small', grain: big ? 0.07 : 0.05, grainScale: big ? 8 : 14, seed: big ? 31 : 17, positionNode: positionLocal.add(disp) });
  // dissolve at the diorama rim exactly like the ground and grass do
  const xz = positionWorld.xz;
  const rim = rimKeep(fields(xz).A.a, xz);
  const prev = m.maskNode as Node<'bool'> | null;
  m.maskNode = prev ? prev.and(rim) : rim;
  mats[k] = m;
  return m;
}

interface Entry { kind: TreeKind; mesh: InstancedMesh; items: TreeInstance[]; tW: InstancedBufferAttribute }
interface Built { meshes: Entry[] }

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);
const _c = new Color();
const NONE: ReadonlySet<TreeInstance> = new Set();

/**
 * Write the visible instances of one variant contiguously and shrink mesh.count, so trees hidden by the
 * sweep cost nothing on the GPU (no degenerate instances left in the draw).
 */
function pack(e: Entry, hidden: ReadonlySet<TreeInstance>) {
  const v = treeVariants()[e.kind];
  const range = Math.max(0.2, v.h - v.sway0);
  const tW = e.tW.array as Float32Array;
  let n = 0;
  e.items.forEach((it, i) => {
    if (hidden.has(it)) return;
    _q.setFromAxisAngle(_up, it.yaw);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.scale, it.scale * (0.92 + ((i * 37) % 17) / 100), it.scale));
    e.mesh.setMatrixAt(n, _m);
    e.mesh.setColorAt(n, _c.setRGB(it.tint[0], it.tint[1], it.tint[2]));
    tW[n * 4] = it.phase; tW[n * 4 + 1] = v.sway0; tW[n * 4 + 2] = 1 / range; tW[n * 4 + 3] = v.swayAmp * it.scale;
    n++;
  });
  e.mesh.count = n;
  e.mesh.instanceMatrix.needsUpdate = true;
  if (e.mesh.instanceColor) e.mesh.instanceColor.needsUpdate = true;
  e.tW.needsUpdate = true;
}

function build(items: TreeInstance[]): Built {
  const V = treeVariants();
  const by = new Map<TreeKind, TreeInstance[]>();
  for (const it of items) {
    if (!by.has(it.kind)) by.set(it.kind, []);
    by.get(it.kind)!.push(it);
  }
  const meshes: Built['meshes'] = [];
  for (const [kind, list] of by) {
    const v = V[kind];
    const geo = v.geo.clone();
    const n = list.length;
    const tW = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('tW', tW);
    const mesh = new InstancedMesh(geo, windMaterial(v.big ? 'big' : kind === 'bush' || kind === 'bushDry' ? 'shrub' : 'small'), n);
    mesh.setColorAt(0, _c.setRGB(1, 1, 1)); // allocate instanceColor
    const e: Entry = { kind, mesh, items: list, tW };
    pack(e, NONE);
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
    mesh.castShadow = v.big || kind === 'rock';
    mesh.receiveShadow = true;
    mesh.name = 'forest:' + kind;
    meshes.push(e);
  }
  return { meshes };
}

/** Distance in xz from (x, z) to a static collider's footprint (0 inside). */
function colliderDist(c: Collider, x: number, z: number) {
  if (c.kind === 'circle') return Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r);
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  return Math.hypot(Math.max(Math.abs(lx) - c.w / 2, 0), Math.max(Math.abs(lz) - c.d / 2, 0));
}

const TREE_TAG = 'hillside-tree';
const _near: Collider[] = [];

/** Clearance from the temple's kora features on the kora's outer side (m). */
const KORA_CLEAR = 4.5;
/** Lungta fans from the outer kora poles: reach (m) and half-angle (cos) of the sector kept free of trees. */
const FAN_REACH = 9.5, FAN_COS = Math.cos(0.8);

/** Is a tree on the kora's outer side too close to a kora feature, or under a fan of flags? */
function koraBlocked(it: TreeInstance, trunkR: number): boolean {
  for (const c of collision.query(it.x, it.z, FAN_REACH + 0.5, _near)) {
    if (c.tag === TREE_TAG) continue;
    if (c.y1 - groundY(c.x, c.z) < 0.6) continue; // low stones and kerbs are not features
    const d = colliderDist(c, it.x, it.z) - trunkR;
    if (d < KORA_CLEAR) return true;
    if (c.tag !== 'pole' || d > FAN_REACH) continue;
    const k = roadDist(KORA, c.x, c.z);
    if (k.centre > 3.6 || k.lateral > 0) continue; // only the outer poles on the path edge carry fans
    const f = roadFrame(KORA, k.s);
    const dx = it.x - c.x, dz = it.z - c.z, L = Math.hypot(dx, dz) || 1;
    if ((dx * -f.nx + dz * -f.nz) / L > FAN_COS) return true;
  }
  return false;
}
const pendingDispose = new WeakMap<object, ReturnType<typeof setTimeout>>();

export function Forest({ items }: { items: TreeInstance[] }) {
  const built = useMemo(() => build(items), [items]);

  useEffect(() => {
    const V = treeVariants();
    const hidden = new Set<TreeInstance>();
    const offs = new Map<TreeInstance, () => void>();

    // hide anything standing in someone else's solid things; (re)register trunk colliders for the rest
    const sweep = (force = false) => {
      for (const e of built.meshes) {
        const { kind, items: list } = e;
        const v = V[kind];
        let dirty = false;
        list.forEach((it) => {
          if (hidden.has(it) || it.fixed) return;
          const tree = isTree(kind);
          const reach = tree ? v.canopyR * it.scale : 0.6;
          let bad = !!it.koraOuter && koraBlocked(it, v.trunkR * it.scale);
          if (!bad) for (const c of collision.query(it.x, it.z, reach + 0.5, _near)) {
            if (c.tag === TREE_TAG) continue;
            const d = colliderDist(c, it.x, it.z);
            const tall = c.y1 - c.y0 > 2.2 && c.y1 > it.y + 2;
            // trees keep their canopy mostly out of buildings; small things only avoid being inside solids
            const need = tree ? (tall ? reach * 0.62 : v.trunkR * it.scale + 0.25) : tall ? 0.35 : 0.15;
            if (d < need) { bad = true; break; }
          }
          if (!bad) return;
          hidden.add(it);
          dirty = true;
          offs.get(it)?.();
          offs.delete(it);
        });
        if (dirty || force) pack(e, hidden);
      }
    };
    sweep(true);
    for (const { kind, items: list } of built.meshes) {
      const v = V[kind];
      if (v.trunkR <= 0) continue;
      for (const it of list) {
        if (hidden.has(it)) continue;
        const r = v.trunkR * it.scale;
        offs.set(it, collision.addCircle({ x: it.x, z: it.z, r, y0: it.y - 0.5, y1: it.y + (isTree(kind) ? Math.min(4, v.h * it.scale) : v.h * it.scale), tag: TREE_TAG }));
      }
    }
    // again once every module (props, npcs…) has mounted, and once more after late builders
    const raf = requestAnimationFrame(() => sweep());
    const t1 = setTimeout(sweep, 1500);
    const t2 = setTimeout(sweep, 6000);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2);
      for (const off of offs.values()) off();
    };
  }, [built]);

  // dispose on a real unmount (StrictMode's simulated unmount is followed by an immediate re-mount)
  useEffect(() => {
    const t = pendingDispose.get(built);
    if (t) { clearTimeout(t); pendingDispose.delete(built); }
    return () => {
      pendingDispose.set(built, setTimeout(() => {
        pendingDispose.delete(built);
        for (const { mesh } of built.meshes) { mesh.geometry.dispose(); mesh.dispose(); }
      }, 0));
    };
  }, [built]);

  return (
    <group name="forest">
      {built.meshes.map(({ kind, mesh }) => <primitive key={kind} object={mesh} />)}
    </group>
  );
}
