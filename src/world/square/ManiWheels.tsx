// The Mani Lhakhang's wheels: 20 small hand wheels (one InstancedMesh) on the outer walls and the great wheel
// inside. Spinning a wheel turns it clockwise seen from above (as pilgrims do), easing out over ~3 s; a bell
// rings each time a wheel's striker comes round. Every spin earns merit (spinWheel, group 'square').
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { partsMaterial } from '../../core/materials';
import { interactions } from '../../core/interact';
import { game } from '../../core/game';
import { G } from '../../game/store';
import { sfx } from '../../audio/sfx';
import { TAU, rng } from '../../core/math';
import { smallWheelGeometry, greatWheelGeometry, GW, type ManiBuild } from './maniLhakhang';
import { bandGeometry, squareAtlas } from './decals';

const SMALL_TURNS = 1.35;   // turns per push
const SMALL_DUR = 3.0;
const GREAT_TURNS = 1;
const GREAT_DUR = 7.5;

interface Spin { angle: number; from: number; to: number; t: number; dur: number; on: boolean; rings: number }
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/** Clockwise (seen from above) = decreasing rotation.y. */
function push(s: Spin, turns: number, dur: number) {
  const target = (s.on ? s.to : s.angle) - turns * TAU;
  s.from = s.angle; s.to = target; s.t = 0; s.dur = dur; s.on = true;
}
/** Advance; returns true if the striker passed the bell this frame. */
function step(s: Spin, dt: number): boolean {
  if (!s.on) return false;
  s.t += dt;
  const k = Math.min(1, s.t / s.dur);
  s.angle = s.from + (s.to - s.from) * ease(k);
  if (k >= 1) s.on = false;
  const rings = Math.floor(-s.angle / TAU);
  if (rings !== s.rings) { s.rings = rings; return true; }
  return false;
}

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(1, 1, 1), _up = new Vector3(0, 1, 0);

export function ManiWheels({ build }: { build: ManiBuild }) {
  const n = build.slots.length;
  const { small, great, spins, gSpin } = useMemo(() => {
    const small = new InstancedMesh(smallWheelGeometry(), partsMaterial(), n);
    small.castShadow = false; small.receiveShadow = true;
    const r = rng(77);
    const spins: Spin[] = build.slots.map(() => {
      const a = -r() * TAU; // random striker phase so bells ring at different moments
      return { angle: a, from: a, to: a, t: 0, dur: 1, on: false, rings: Math.floor(-a / TAU) };
    });
    build.slots.forEach((sl, i) => {
      _m.compose(_p.set(sl.x, sl.y, sl.z), _q.setFromAxisAngle(_up, sl.yaw + spins[i].angle), _s);
      small.setMatrixAt(i, _m);
    });
    small.instanceMatrix.needsUpdate = true;
    small.computeBoundingSphere();
    const great = new Group();
    great.position.set(build.great.x, build.great.y, build.great.z);
    const body = new Mesh(greatWheelGeometry(), partsMaterial());
    body.castShadow = true; body.receiveShadow = true;
    const atlas = squareAtlas();
    const band = new Mesh(bandGeometry(atlas, 'mantraBand', GW.r + 0.008, 0.78, 32), atlas.material);
    band.position.y = GW.h / 2;
    band.receiveShadow = true;
    great.add(body, band);
    const gSpin: Spin = { angle: 0, from: 0, to: 0, t: 0, dur: 1, on: false, rings: 0 };
    return { small, great, spins, gSpin };
  }, [build, n]);

  // interactables: each small wheel + the great wheel
  useEffect(() => {
    const offs = build.slots.map((sl, i) => interactions.add({
      id: `square-wheel-${i}`,
      pos: [sl.x, sl.y + 0.25, sl.z],
      radius: 1.05,
      label: 'Spin prayer wheel',
      anim: 'spin',
      onInteract: () => {
        push(spins[i], SMALL_TURNS, SMALL_DUR);
        sfx('wheel');
        G().emit({ type: 'spinWheel', id: `square-wheel-${i}`, group: 'square' });
      },
    }));
    offs.push(interactions.add({
      id: 'square-great-wheel',
      pos: [build.great.x, build.great.y + 0.9, build.great.z],
      radius: 2.35,
      label: 'Turn the great wheel',
      anim: 'spin',
      onInteract: () => {
        push(gSpin, GREAT_TURNS, GREAT_DUR);
        sfx('wheel', { volume: 1 });
        sfx('bell', { volume: 0.7 });
        G().emit({ type: 'spinWheel', id: 'square-great-wheel', group: 'square' });
      },
    }));
    return () => { for (const off of offs) off(); };
  }, [build, spins, gSpin]);

  useFrame(() => {
    const dt = game.dt;
    if (dt <= 0) return;
    let dirty = false;
    for (let i = 0; i < n; i++) {
      const s = spins[i];
      if (!s.on) continue;
      if (step(s, dt)) sfx('bell', { volume: 0.45 });
      const sl = build.slots[i];
      _m.compose(_p.set(sl.x, sl.y, sl.z), _q.setFromAxisAngle(_up, sl.yaw + s.angle), _s);
      small.setMatrixAt(i, _m);
      dirty = true;
    }
    if (dirty) small.instanceMatrix.needsUpdate = true;
    if (gSpin.on) {
      if (step(gSpin, dt)) sfx('bell', { volume: 0.9 });
      great.rotation.y = gSpin.angle;
    }
  });

  return (
    <>
      <primitive object={small} />
      <primitive object={great} />
    </>
  );
}
