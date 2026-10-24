// Prayer wheels (mani khorlo): one InstancedMesh for every wheel of the temple gallery and the kora
// shelters. Each is an interactable: E spins it one full turn clockwise (seen from above) with an ease-out,
// a bell rings when the turn completes, and the spin is reported to the quests.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { Parts } from '../../core/geom';
import { partsMaterial } from '../../core/materials';
import { PAL } from '../../core/palette';
import { interactions } from '../../core/interact';
import { game } from '../../core/game';
import { TAU } from '../../core/math';
import { sfx } from '../../audio/sfx';
import { G } from '../../game/store';
import { QUEST } from '../layout';
import type { WheelSpec } from './acc';

const SPIN_TIME = 2.6;

/** Standard wheel: 0.42 m across, 0.6 m body, centred on its axis at the origin. */
function wheelGeometry() {
  const p = new Parts();
  const R = 0.21, H = 0.6;
  p.cyl(R, R, H, [0, -H / 2, 0], PAL.khorloBody, 12);
  // gold rims, top cap and bottom boss
  p.cyl(R + 0.02, R + 0.02, 0.07, [0, H / 2 - 0.07, 0], PAL.khorloGold, 12);
  p.cyl(R + 0.02, R + 0.02, 0.07, [0, -H / 2, 0], PAL.khorloGold, 12);
  p.cyl(0.06, R * 0.85, 0.07, [0, H / 2, 0], PAL.khorloGold, 12);
  p.cyl(0.03, 0.05, 0.05, [0, H / 2 + 0.07, 0], PAL.khorloCopper, 6);
  // mantra band: dark maroon ring with the six syllables of om mani padme hum in the six colours
  p.cyl(R + 0.008, R + 0.008, 0.2, [0, -0.1, 0], 0x4a1a20, 12);
  const syll = [0xf2efe6, PAL.templeGreen, PAL.templeYellow, PAL.templeBlue, PAL.templeRed, PAL.khorloGold];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    p.group([Math.sin(a) * (R + 0.012), 0, Math.cos(a) * (R + 0.012)], a, () => {
      p.box(0.09, 0.13, 0.025, [0, 0, 0], syll[i]);
      p.box(0.11, 0.025, 0.03, [0, 0.075, 0], PAL.khorloGold); // head stroke of the letter
    });
    // vertical gold ribs between syllables (they make the turning readable)
    const b = a + TAU / 12;
    p.group([Math.sin(b) * (R + 0.006), 0, Math.cos(b) * (R + 0.006)], b, () => p.box(0.025, H - 0.14, 0.02, [0, 0, 0], PAL.khorloGold));
  }
  return p.merge();
}

interface WheelState { angle: number; from: number; to: number; t0: number; active: boolean }

export function PrayerWheels({ wheels }: { wheels: WheelSpec[] }) {
  const mesh = useMemo(() => {
    const m = new InstancedMesh(wheelGeometry(), partsMaterial({ key: 'temple-wheel', grain: 0.04 }), wheels.length);
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }, [wheels.length]);
  const st = useMemo(() => wheels.map((): WheelState => ({ angle: 0, from: 0, to: 0, t0: 0, active: false })), [wheels]);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(), y: new Vector3(0, 1, 0) }), []);

  const write = (i: number) => {
    const w = wheels[i];
    tmp.q.setFromAxisAngle(tmp.y, -st[i].angle + i * 0.7); // clockwise from above = negative yaw
    tmp.m.compose(tmp.p.set(w.x, w.y, w.z), tmp.q, tmp.s.set(w.scale, w.scale, w.scale));
    mesh.setMatrixAt(i, tmp.m);
  };

  useEffect(() => {
    for (let i = 0; i < wheels.length; i++) write(i);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    const offs = wheels.map((w, i) => interactions.add({
      id: w.id,
      pos: [w.x, w.y - 0.15, w.z],
      radius: 1.05,
      label: 'Spin prayer wheel',
      anim: 'spin',
      onInteract: () => {
        const s = st[i];
        s.from = s.angle;
        s.to = Math.max(s.to, s.angle) + TAU;
        s.t0 = game.time;
        s.active = true;
        sfx('wheel');
        const before = G().quests[QUEST.kora]?.count ?? 0;
        G().emit({ type: 'spinWheel', id: w.id, group: w.group });
        const q = G().quests[QUEST.kora];
        if (w.group === 'temple' && q && !q.done && q.count > before) G().toast(`ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ  ${q.count}/12 wheels`, 'merit');
      },
    }));
    return () => { for (const off of offs) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, wheels, st]);

  useFrame(() => {
    let any = false;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (!s.active) continue;
      const t = Math.min(1, (game.time - s.t0) / SPIN_TIME);
      const e = 1 - (1 - t) ** 3;
      const prev = s.angle;
      s.angle = t >= 1 ? s.to : s.from + (s.to - s.from) * e;
      if (Math.floor(s.angle / TAU + 1e-6) > Math.floor(prev / TAU + 1e-6)) sfx('bell', { volume: 0.7 });
      if (t >= 1) s.active = false;
      write(i);
      any = true;
    }
    if (any) mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
