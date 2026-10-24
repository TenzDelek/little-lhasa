// Butter-lamp flames (one InstancedMesh, TSL flicker) and the interactive lamps on the lamp-house shelf.
// 'Light butter lamp' → the flame grows in, a small flickering light is registered, the event goes to the
// quests; a lit lamp stays lit (also across remounts: lit ids come back from the lamps quest state).
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConeGeometry, InstancedMesh, Matrix4, Vector3, Quaternion } from 'three';
import type { Node } from 'three/webgpu';
import { float, fract, instanceIndex, positionGeometry, positionLocal, sin, vec3 } from 'three/tsl';
import { mat, lin } from '../../core/materials';
import { PAL } from '../../core/palette';
import { U } from '../../core/uniforms';
import { interactions } from '../../core/interact';
import { lamps } from '../../core/lamps';
import { game } from '../../core/game';
import { sfx } from '../../audio/sfx';
import { G } from '../../game/store';
import { QUEST } from '../layout';
import type { LampSpot } from './acc';

function flameMaterial() {
  const ph = fract(float(instanceIndex).mul(0.6180339)).mul(6.2831);
  const t = U.time;
  const flick = sin(t.mul(11.0).add(ph.mul(3.0))).mul(sin(t.mul(7.3).add(ph.mul(5.0))));
  const k = positionGeometry.y.mul(8.0); // 0 at the wick, ~1 at the tip
  const pos = positionLocal.add(vec3(sin(t.mul(5.0).add(ph)).mul(0.012), flick.mul(0.022), sin(t.mul(4.1).add(ph.mul(2.0))).mul(0.008)).mul(k));
  const m = mat({ color: 0xffe6a8, vertexColors: false, grain: 0, positionNode: pos as Node<'vec3'> });
  const c = lin(PAL.butterFlame);
  (m as unknown as { emissiveNode: Node }).emissiveNode = vec3(c.r, c.g, c.b).mul(flick.mul(0.35).add(1.45));
  return m;
}

const HIDE = new Matrix4().makeTranslation(0, -999, 0);

export function ButterLamps({ spots }: { spots: LampSpot[] }) {
  const mesh = useMemo(() => {
    const g = new ConeGeometry(0.032, 0.12, 5, 1);
    g.translate(0, 0.06, 0);
    g.deleteAttribute('uv');
    const m = new InstancedMesh(g, flameMaterial(), spots.length);
    m.castShadow = false; m.receiveShadow = false;
    m.frustumCulled = false;
    return m;
  }, [spots.length]);
  // per lamp: current flame scale (grows in when lit)
  const st = useMemo(() => {
    const seen = G().quests[QUEST.lamps]?.seen ?? [];
    return spots.map((s) => ({ lit: s.lit || seen.includes(s.id), k: s.lit || seen.includes(s.id) ? 1 : 0 }));
  }, [spots]);
  const tmp = useMemo(() => ({ m: new Matrix4(), p: new Vector3(), q: new Quaternion(), s: new Vector3() }), []);

  const write = (i: number) => {
    const s = spots[i], k = st[i].k;
    if (k <= 0.001) mesh.setMatrixAt(i, HIDE);
    else {
      const sz = s.interactive ? 1.15 : 1;
      tmp.m.compose(tmp.p.set(s.x, s.y, s.z), tmp.q, tmp.s.set(sz * (0.6 + 0.4 * k), sz * k, sz * (0.6 + 0.4 * k)));
      mesh.setMatrixAt(i, tmp.m);
    }
  };

  useEffect(() => {
    for (let i = 0; i < spots.length; i++) write(i);
    mesh.instanceMatrix.needsUpdate = true;
    const offs: (() => void)[] = [];
    const lampOf = (s: LampSpot) => lamps.add({ x: s.x, y: s.y + 0.18, z: s.z - 0.15, color: PAL.butterFlame, intensity: 0.9, distance: 2.6, day: true, flicker: 0.3 });
    spots.forEach((s, i) => {
      if (!s.interactive) return;
      if (st[i].lit) offs.push(lampOf(s));
      offs.push(interactions.add({
        id: `temple-${s.id}`,
        pos: [s.x, s.y - 0.1, s.z - 0.25],
        radius: 1.0,
        label: 'Light butter lamp',
        anim: 'light',
        enabled: () => !st[i].lit,
        onInteract: () => {
          if (st[i].lit) return;
          st[i].lit = true;
          offs.push(lampOf(s));
          sfx('lamp');
          const before = G().quests[QUEST.lamps]?.count ?? 0;
          G().emit({ type: 'lightLamp', id: s.id });
          const q = G().quests[QUEST.lamps];
          if (q && !q.done && q.count > before) G().toast(`མར་མེ། Butter lamp lit  ${q.count}/5`, 'merit');
        },
      }));
    });
    return () => { for (const off of offs) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, spots, st]);

  useFrame(() => {
    const dt = game.dt;
    if (dt <= 0) return;
    let any = false;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (s.lit && s.k < 1) { s.k = Math.min(1, s.k + dt * 2.2); write(i); any = true; }
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
