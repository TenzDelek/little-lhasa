// The town's forests: one InstancedMesh per tree / shrub / rock variant (see trees.ts, forest.ts), canopies
// swaying in the wind (TSL positionNode, shadows follow), trunk colliders. Trees that turn out to stand in
// another module's building (colliders registered after the plan was made) are hidden at mount and again
// once every module has registered its colliders.
import { useEffect, useMemo } from 'react';
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import type { MeshLambertNodeMaterial } from 'three/webgpu';
import { attribute, clamp, cos, float, positionGeometry, positionLocal, sin, vec3 } from 'three/tsl';
import { mat } from '../../core/materials';
import { U, WIND_DIR } from '../../core/uniforms';
import { collision, type Collider } from '../../core/collision';
import { treeVariants, type TreeKind } from './trees';
import { isTree, type TreeInstance } from './woods';

// ---- wind material --------------------------------------------------------------------------------------
const mats: Partial<Record<'big' | 'small', MeshLambertNodeMaterial>> = {};
function windMaterial(big: boolean) {
  const k = big ? 'big' : 'small';
  if (mats[k]) return mats[k]!;
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
  const m = mat({ occlude: big, grain: big ? 0.07 : 0.05, grainScale: big ? 8 : 14, seed: big ? 31 : 17, positionNode: positionLocal.add(disp) });
  mats[k] = m;
  return m;
}

interface Built {
  meshes: { kind: TreeKind; mesh: InstancedMesh; items: TreeInstance[] }[];
}

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);
const _c = new Color();
const ZERO = new Matrix4().makeScale(0, 0, 0);

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
    const tW = new Float32Array(n * 4);
    const mesh = new InstancedMesh(geo, windMaterial(v.big), n);
    list.forEach((it, i) => {
      _q.setFromAxisAngle(_up, it.yaw);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.scale, it.scale * (0.92 + ((i * 37) % 17) / 100), it.scale));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setRGB(it.tint[0], it.tint[1], it.tint[2]));
      const range = Math.max(0.2, v.h - v.sway0);
      tW.set([it.phase, v.sway0, 1 / range, v.swayAmp * it.scale], i * 4);
    });
    geo.setAttribute('tW', new InstancedBufferAttribute(tW, 4));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
    mesh.castShadow = v.big || kind === 'rock';
    mesh.receiveShadow = true;
    mesh.name = 'forest:' + kind;
    meshes.push({ kind, mesh, items: list });
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
const pendingDispose = new WeakMap<object, ReturnType<typeof setTimeout>>();

export function Forest({ items }: { items: TreeInstance[] }) {
  const built = useMemo(() => build(items), [items]);

  useEffect(() => {
    const V = treeVariants();
    const hidden = new Set<TreeInstance>();
    const offs = new Map<TreeInstance, () => void>();

    // hide anything standing in someone else's solid things; (re)register trunk colliders for the rest
    const sweep = () => {
      for (const { kind, mesh, items: list } of built.meshes) {
        const v = V[kind];
        let dirty = false;
        list.forEach((it, i) => {
          if (hidden.has(it) || it.fixed) return;
          const tree = isTree(kind);
          const reach = tree ? v.canopyR * it.scale : 0.6;
          let bad = false;
          for (const c of collision.query(it.x, it.z, reach + 0.5, _near)) {
            if (c.tag === TREE_TAG) continue;
            const d = colliderDist(c, it.x, it.z);
            const tall = c.y1 - c.y0 > 2.2 && c.y1 > it.y + 2;
            // trees keep their canopy mostly out of buildings; small things only avoid being inside solids
            const need = tree ? (tall ? reach * 0.62 : v.trunkR * it.scale + 0.25) : tall ? 0.35 : 0.15;
            if (d < need) { bad = true; break; }
          }
          if (!bad) return;
          hidden.add(it);
          mesh.setMatrixAt(i, ZERO);
          dirty = true;
          offs.get(it)?.();
          offs.delete(it);
        });
        if (dirty) mesh.instanceMatrix.needsUpdate = true;
      }
    };
    sweep();
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
    const raf = requestAnimationFrame(sweep);
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
