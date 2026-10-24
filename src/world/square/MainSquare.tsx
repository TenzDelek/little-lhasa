// Main Square (the chowk) of McLeod Ganj: the Mani Lhakhang prayer-wheel shrine, a white chorten, the taxi
// stand and the HRTC bus, the bus shelter, chai / juice / shoe-shine life, lamp posts and prayer flags,
// and the hotels and cafés ringing it. Static geometry is merged into a few meshes (occluding buildings,
// small props, text decals, one merged sign mesh); the prayer wheels are animated in ManiWheels.
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import type { Object3D } from 'three';
import { Parts, type V3 } from '../../core/geom';
import { partsMaterial } from '../../core/materials';
import { collision, type BoxInit, type CircleInit } from '../../core/collision';
import { lamps as lampWorld, type Lamp } from '../../core/lamps';
import { interactions } from '../../core/interact';
import { G } from '../../game/store';
import { groundY } from '../terrain';
import { buildBuilding, type BuiltBuilding } from '../../kit/building';
import { mergeSigns } from '../../kit/sign';
import { PrayerFlags, Darchor, type FlagLine, type DarchorPole } from '../../kit/flags';
import { LOTS, MANI, CHORTEN, VEHICLES } from './plan';
import { Decals, squareAtlas } from './decals';
import { buildMani, type ManiBuild } from './maniLhakhang';
import { buildChorten, type ChortenBuild } from './chorten';
import { buildVehicle } from './vehicles';
import { buildLife } from './life';
import { ManiWheels } from './ManiWheels';

const DARCHOR: DarchorPole = { x: -11.9, z: -8.6, h: 7.2, seed: 3 };

interface SquareBuild {
  objects: Object3D[];
  colliders: BoxInit[];
  circles: CircleInit[];
  lamps: Lamp[];
  flags: FlagLine[];
  mani: ManiBuild;
  timetable?: V3;
}

function lotFloor(x: number, z: number, d: number, yaw: number) {
  const fx = x + Math.sin(yaw) * (d / 2 + 0.3), fz = z + Math.cos(yaw) * (d / 2 + 0.3);
  return groundY(fx, fz) + 0.1;
}

function build(): SquareBuild {
  const big = new Parts();     // buildings, shrine, chorten, vehicles — dissolve when they hide the boy
  const props = new Parts();   // small things on the square
  const atlas = squareAtlas();
  const decals = new Decals(atlas);
  const signs: Object3D[] = [];
  const colliders: BoxInit[] = [];
  const circles: CircleInit[] = [];
  const lamps: Lamp[] = [];
  const flags: FlagLine[] = [];

  // ---- buildings ringing the square ---------------------------------------------------------------------
  const built: Record<string, BuiltBuilding> = {};
  for (const l of LOTS) {
    const b = buildBuilding(big, { ...l.spec, w: l.w, d: l.d }, { x: l.x, z: l.z, yaw: l.yaw, y: lotFloor(l.x, l.z, l.d, l.yaw) });
    built[l.id] = b;
    colliders.push(...b.colliders);
    lamps.push(...b.lamps);
    signs.push(...b.meshes);
  }

  // ---- landmarks -----------------------------------------------------------------------------------------
  const mani = buildMani(big, decals, { x: MANI.x, y: groundY(MANI.x, MANI.z), z: MANI.z, yaw: MANI.yaw });
  colliders.push(...mani.colliders);
  circles.push(...mani.circles);
  lamps.push(...mani.lamps);
  const ch: ChortenBuild = buildChorten(big, decals, { x: CHORTEN.x, y: groundY(CHORTEN.x, CHORTEN.z), z: CHORTEN.z, yaw: CHORTEN.yaw }, CHORTEN.yard);
  colliders.push(...ch.colliders);
  lamps.push(...ch.lamps);

  // ---- vehicles ------------------------------------------------------------------------------------------
  for (const v of VEHICLES) {
    const vb = buildVehicle({ p: big, d: decals, signs }, v, groundY(v.x, v.z));
    colliders.push(...vb.colliders);
  }

  // Potala mural on N4's blank east wall (it faces the Dharamkot Road corner)
  {
    const l = LOTS.find((q) => q.id === 'N4')!;
    const y = lotFloor(l.x, l.z, l.d, l.yaw);
    const wx = l.x + l.w / 2 + 0.035;
    big.group([wx, y, l.z], Math.PI / 2, () => decals.quad(big.matrix, [0.4, 3.75, 0], 4.4, 3.08, 'mural'));
  }

  // ---- life on the square (stalls, shelter, lamps, benches, pots) ----------------------------------------------
  const life = buildLife({ p: props, big, d: decals, signs });
  colliders.push(...life.colliders);
  lamps.push(...life.lamps);

  // ---- prayer flags ----------------------------------------------------------------------------------------------
  const roofAt = (id: string, along: number, inset = 0.4): V3 => {
    const l = LOTS.find((q) => q.id === id)!;
    const b = built[id];
    const cs = Math.cos(l.yaw), sn = Math.sin(l.yaw);
    const lx = along * l.w / 2, lz = l.d / 2 - inset;
    return [l.x + lx * cs + lz * sn, b.top + 0.6, l.z - lx * sn + lz * cs];
  };
  // chorten: spire down to the four corner posts, and two long strings across to the roofs behind
  for (let i = 0; i < 4; i++) flags.push({ a: ch.spire, b: ch.posts[i], sag: 0.25, seed: 10 + i, age: 0.1 + i * 0.06 });
  flags.push({ a: ch.spire, b: roofAt('N5', -0.3), seed: 21, age: 0.25 });
  flags.push({ a: ch.spire, b: roofAt('N6', 0.5), seed: 22, age: 0.1 });
  // Mani Lhakhang: finial to the four roof corners, then across the square
  for (let i = 0; i < 4; i++) flags.push({ a: mani.finial, b: mani.corners[i], sag: 0.12, size: 0.2, spacing: 0.26, seed: 30 + i, age: 0.2 });
  flags.push({ a: mani.finial, b: ch.spire, sag: 0.9, seed: 35, age: 0.07 });
  flags.push({ a: mani.finial, b: roofAt('N3', 0.2), seed: 36, age: 0.3 });
  flags.push({ a: mani.finial, b: roofAt('W2', 0.4), seed: 37, age: 0.17 });
  // high strings across the square between rooftops
  flags.push({ a: roofAt('N4', 0.6), b: roofAt('S2', -0.2), sag: 1.2, seed: 41, age: 0.12 });
  flags.push({ a: roofAt('W3', -0.5), b: roofAt('E1', 0.3), sag: 1.6, seed: 42, age: 0.23 });
  flags.push({ a: roofAt('N7', -0.4), b: roofAt('E2', 0.6), sag: 1.0, seed: 43, age: 0.15 });
  flags.push({ a: roofAt('W1', 0.2), b: roofAt('N2', 0.7), sag: 0.6, seed: 44, age: 0.35 });
  // the darchor in the north-west corner and the old deodar
  const dTop: V3 = [DARCHOR.x, groundY(DARCHOR.x, DARCHOR.z) + (DARCHOR.h ?? 7) - 0.3, DARCHOR.z];
  flags.push({ a: dTop, b: mani.corners[0], sag: 0.4, seed: 51, age: 0.25 });
  flags.push({ a: dTop, b: roofAt('W1', -0.6), sag: 0.3, seed: 52, age: 0.15 });
  if (life.tree) {
    flags.push({ a: life.tree, b: roofAt('E3', -0.4), sag: 0.5, seed: 61, age: 0.28 });
    flags.push({ a: life.tree, b: roofAt('S3', 0.6), sag: 0.4, seed: 62, age: 0.1 });
  }

  const objects: Object3D[] = [
    ...big.toMeshes(partsMaterial({ occlude: true }), 24),
    props.toMesh(partsMaterial()),
    decals.toMesh(),
    ...mergeSigns(signs),
  ];
  return { objects, colliders, circles, lamps, flags, mani, timetable: life.timetable };
}

export function MainSquare() {
  const b = useMemo(build, []);
  const ref = useRef<Group>(null);
  // dev handle for the perf probe (shots/square/tools/perf.mjs)
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __square?: Group | null }).__square = ref.current; }, []);

  useEffect(() => {
    const offs = [
      ...b.colliders.map((c) => collision.addBox(c)),
      ...b.circles.map((c) => collision.addCircle(c)),
      ...b.lamps.map((l) => lampWorld.add(l)),
    ];
    if (b.timetable) {
      const t = b.timetable;
      offs.push(interactions.add({
        id: 'square-timetable', pos: [t[0], t[1], t[2]], radius: 1.3, label: 'Read the bus timetable', anim: 'point',
        onInteract: () => G().say([
          { who: 'HRTC timetable', text: 'McLeod Ganj bus stand — Himachal Road Transport Corporation.' },
          { who: 'HRTC timetable', text: 'Dharamshala: every half hour, 6:00 to 20:00. Bhagsu and Naddi: on the hour.' },
          { who: 'HRTC timetable', text: 'Pathankot 6:30 and 13:00 · Manali 7:15 · Delhi (Volvo, overnight) 18:30 and 19:30.' },
          { who: 'Tenzin', text: 'One day I will ride the night bus to Delhi with Amala!' },
        ]),
      }));
    }
    return () => { for (const off of offs) off(); };
  }, [b]);

  return (
    <group name="main-square" ref={ref}>
      {b.objects.map((o, i) => <primitive key={i} object={o} />)}
      <ManiWheels build={b.mani} />
      <PrayerFlags lines={b.flags} />
      <Darchor poles={[DARCHOR]} strings={0} />
    </group>
  );
}
