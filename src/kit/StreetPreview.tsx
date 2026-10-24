// ?kit=1 — showroom of flags / street-furniture kit pieces, for the kit builders' screenshots. Not part of the game.
// Lives at x -62..-30, z -62..-40 (outside the town rim, so it brings its own little floor).
//   node scripts/shot.mjs --kit --x -46 --z -50 --zoom 0 --out shots/street/overview.png
import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, Mesh, PlaneGeometry, type Object3D } from 'three';
import { Parts, type V3 } from '../core/geom';
import { mat, partsMaterial } from '../core/materials';
import { PAL } from '../core/palette';
import { collision, type BoxInit } from '../core/collision';
import { lamps, type Lamp } from '../core/lamps';
import { fbm2 } from '../core/math';
import { groundY } from '../world/terrain';
import { Darchor, PrayerFlags, type DarchorPole, type FlagLine } from './flags';
import {
  bench, bin, bollard, crateStack, flagFan, lpgCylinders, milestone, motorbike, pottedPlant, powerPole, railing,
  railingColliders, scooter, signpost, stringLights, steps, streetLamp, wire,
} from './street';

const X0 = -63, X1 = -29, Z0 = -63, Z1 = -39;
const ROAD_Z0 = -45.6, ROAD_Z1 = -42.4;
const g = (x: number, z: number) => groundY(x, z);
const at = (x: number, z: number, dy = 0): V3 => [x, g(x, z) + dy, z];

function floorMesh() {
  const geo = new PlaneGeometry(X1 - X0, Z1 - Z0, (X1 - X0) * 2, (Z1 - Z0) * 2);
  geo.rotateX(-Math.PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const road = z > ROAD_Z0 && z < ROAD_Z1;
    pos.setY(i, g(x, z) + 0.03 + (road ? 0.01 : 0));
    const n = fbm2(x * 0.4, z * 0.4, 2);
    if (road) c.setHex(n > 0.55 ? PAL.asphaltLight : PAL.asphalt);
    else if (z > ROAD_Z0 - 4 && z < ROAD_Z0) c.setHex(n > 0.5 ? PAL.paving : PAL.pavingDark);
    else c.setHex(n > 0.62 ? PAL.grassDry : n > 0.42 ? PAL.earth : PAL.grass);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new Mesh(geo, mat({ key: 'street-preview-floor', vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

export function StreetPreview() {
  const built = useMemo(() => {
    const tall = new Parts(), small = new Parts();
    const colliders: BoxInit[] = [];
    const lampList: Lamp[] = [];
    const extras: Object3D[] = [floorMesh()];

    // --- street lamps along the north kerb, arms over the road (yaw 0 = toward +z / south)
    const lampX = [-60, -52, -44, -36];
    const kinds = ['arm', 'solar', 'old', 'arm'] as const;
    lampX.forEach((x, i) => {
      const z = ROAD_Z0 - 0.5;
      const L = streetLamp(tall, x, g(x, z), z, 0, kinds[i], 11 + i);
      colliders.push(L.collider); lampList.push(L.lamp);
    });
    // string lights between the last two lamps
    lampList.push(...stringLights(small, at(-43.8, ROAD_Z0 - 0.5, 3.4), at(-36.2, ROAD_Z0 - 0.5, 3.4), 0.45,
      { colors: [0xffd890, 0xff8a5a, 0x9ad0ff, 0xffe070, 0xa8f0a0] }));

    // --- power poles on the south side, wires along x
    const poleX = [-60, -49, -38];
    const poles = poleX.map((x, i) => powerPole(tall, x, g(x, ROAD_Z1 + 1.1), ROAD_Z1 + 1.1, Math.PI / 2, (['concrete', 'wood', 'rail'] as const)[i], 21 + i));
    poles.forEach((p) => colliders.push(p.collider));
    for (let i = 1; i < poles.length; i++) {
      wire(tall, poles[i - 1].top, poles[i].top, 0.55, 3);
      wire(tall, poles[i - 1].low, poles[i].low, 0.7, 2, undefined, 0.3);
    }
    // a service drop from a pole to the solar lamp across the road
    wire(tall, poles[1].low, [-52, g(-52, ROAD_Z0 - 0.5) + 3.6, ROAD_Z0 - 0.5], 0.4, 1);

    // --- parked vehicles on the south kerb
    for (let i = 0; i < 4; i++) {
      const x = -58.6 + i * 0.85, z = ROAD_Z1 - 0.7;
      colliders.push(scooter(small, x, g(x, z), z, Math.PI * 0.62 + (i % 2) * 0.08, 31 + i));
    }
    for (let i = 0; i < 3; i++) {
      const x = -53.5 + i * 1.05, z = ROAD_Z1 - 0.8;
      colliders.push(motorbike(small, x, g(x, z), z, Math.PI * 0.6, 41 + i));
    }
    colliders.push(scooter(small, -45, g(-45, -43.8), -43.8, Math.PI / 2, 52));
    colliders.push(motorbike(small, -42.5, g(-42.5, -43.5), -43.5, -Math.PI / 2, 53));

    // --- pavement furniture north of the lamps
    const pz = ROAD_Z0 - 1.8;
    colliders.push(bench(small, -58, g(-58, pz), pz, 0, PAL.woodTrim, { kind: 'wood' }));
    colliders.push(bench(small, -55.4, g(-55.4, pz), pz, 0, PAL.woodTrim, { kind: 'concrete' }));
    colliders.push(bench(small, -53, g(-53, pz - 0.3), pz - 0.3, 0.25, 0x6a3f24, { kind: 'wood', back: false, len: 1.3 }));
    colliders.push(bin(small, -51.2, g(-51.2, pz), pz));
    colliders.push(bin(small, -49.8, g(-49.8, pz), pz, PAL.roofGreen, { kind: 'twin' }));
    colliders.push(bin(small, -48.2, g(-48.2, pz), pz, PAL.roofBlue, { kind: 'box' }));
    for (let i = 0; i < 8; i++) {
      const x = -46.8 + i * 0.6, z = pz - 0.2 + (i % 2) * 0.12;
      colliders.push(pottedPlant(small, x, g(x, z), z, 100 + i));
    }
    for (let i = 0; i < 6; i++) {
      const x = -46.6 + i * 0.75, z = pz - 1.2;
      colliders.push(pottedPlant(small, x, g(x, z), z, 200 + i, (['marigold', 'geranium', 'succulent', 'aloe', 'pothos', 'cactus'] as const)[i]));
    }
    colliders.push(lpgCylinders(small, -40.6, g(-40.6, pz), pz, 4, 3));
    colliders.push(crateStack(small, -39, g(-39, pz), pz, 0.1, 5));
    colliders.push(crateStack(small, -37.8, g(-37.8, pz - 0.2), pz - 0.2, -0.2, 8));
    for (let i = 0; i < 3; i++) colliders.push(bollard(small, -34.6 + i * 0.7, g(-34.6 + i * 0.7, ROAD_Z0 - 0.4), ROAD_Z0 - 0.4));
    colliders.push(milestone(small, -32, g(-32, ROAD_Z0 - 0.5), ROAD_Z0 - 0.5, 0));
    const sp1 = signpost(small, -40.5, g(-40.5, -50.2), -50.2, 0);
    const sp2 = signpost(small, -36.6, g(-36.6, -50.4), -50.4, 0, 'BHAGSU 2');
    colliders.push(sp1.collider, sp2.collider);
    if (sp2.sign) extras.push(sp2.sign);

    // --- railings following the terrain slope (blue and yellow)
    const rail = (x0: number, x1: number, z: number, color: number) => {
      let prev = at(x0, z);
      for (let x = x0 + 2.5; x <= x1 + 1e-6; x += 2.5) {
        const p = at(x, z);
        railing(small, prev, p, 1.0, color);
        colliders.push(...railingColliders(prev, p, 1.0));
        prev = p;
      }
    };
    rail(-47.5, -32.5, -52.5, PAL.railing);
    rail(-62, -52, -51.8, PAL.railingYellow);

    // --- a flight of steps up to a terrace, with a railing on the terrace edge
    const sa = at(-33.5, -55.2);
    const sb: V3 = [-33.5, sa[1] + 1.9, -58.4];
    colliders.push(...steps(small, sa, sb, 1.5));
    small.slab(-36, sb[1] - 2.6, -61.5, -31, sb[1], -58.4, PAL.concrete);
    small.slab(-36, sb[1] - 0.03, -61.5, -31, sb[1] + 0.02, -58.4, PAL.paving);
    colliders.push({ x: -33.5, z: -59.95, w: 5, d: 3.1, y0: sb[1] - 2.6, y1: sb[1], tag: 'terrace' });
    const ra: V3 = [-36, sb[1], -58.5], rb: V3 = [-34.5, sb[1], -58.5];
    colliders.push(railing(small, ra, rb, 1.0, PAL.railing));
    colliders.push(railing(small, [-32.5, sb[1], -58.5], [-31, sb[1], -58.5], 1.0, PAL.railing));
    const sl = streetLamp(tall, -31.6, sb[1], -61, -Math.PI / 2, 'solar', 77);
    colliders.push(sl.collider); lampList.push(sl.lamp);

    // --- flag anchor posts (plain wooden posts) for lungta lines at several heights / sags / ages
    const postA = at(-46, -57.5), postB = at(-37.5, -57);
    for (const p of [postA, postB]) {
      tall.cyl(0.06, 0.09, 5.4, [p[0], p[1] - 0.2, p[2]], PAL.barkLight, 7);
      colliders.push({ x: p[0], z: p[2], w: 0.2, d: 0.2, y0: p[1], y1: p[1] + 5.2, tag: 'post' });
    }
    const lines: FlagLine[] = [
      { a: [postA[0], postA[1] + 2.3, postA[2]], b: [postB[0], postB[1] + 2.3, postB[2]], sag: 0.15, age: 0, seed: 1 },
      { a: [postA[0], postA[1] + 3.4, postA[2]], b: [postB[0], postB[1] + 3.6, postB[2]], sag: 0.45, age: 0.5, seed: 2 },
      { a: [postA[0], postA[1] + 4.6, postA[2]], b: [postB[0], postB[1] + 4.9, postB[2]], sag: 0.9, age: 1, seed: 3 },
      // a long sloping line from the big darchor down to the post
      { a: [-59.8, g(-60, -56) + 6.6, -56], b: [postA[0], postA[1] + 5.1, postA[2]], age: 0.25, seed: 4 },
      // bigger flags, tighter spacing
      { a: [-58, g(-58, -53.6) + 2.6, -53.6], b: [-49, g(-49, -54.2) + 2.9, -54.2], size: 0.32, spacing: 0.36, sag: 0.35, age: 0.15, seed: 5 },
      // overhead line across the road between two lamp posts
      { a: [-59.9, g(-60, ROAD_Z0 - 0.5) + 4.9, ROAD_Z0 - 0.5], b: [-60, g(-60, ROAD_Z1 + 1.1) + 5.4, ROAD_Z1 + 1.1], sag: 0.35, age: 0.35, seed: 6 },
    ];
    // dense canopy (stress test, like the kora hillside): many lines fanning out from a tall pole
    const hub = at(-43, -61);
    tall.cyl(0.07, 0.11, 7.4, [hub[0], hub[1] - 0.2, hub[2]], PAL.bark, 7);
    colliders.push({ x: hub[0], z: hub[2], w: 0.24, d: 0.24, y0: hub[1], y1: hub[1] + 7.2, tag: 'post' });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.97 + (i / 25) * Math.PI * 0.62;
      const R = 7 + (i % 3) * 1.6;
      const ex = hub[0] + Math.cos(a) * R, ez = hub[2] + Math.sin(a) * R * 0.25 + 0.5;
      const top = 7 - (i % 4) * 0.5;
      lines.push({ a: [hub[0], hub[1] + top, hub[2]], b: [ex, g(ex, ez) + 0.25, ez], sag: 0.25 + (i % 5) * 0.12, age: (i % 7) / 7, seed: 100 + i });
    }
    // a small fan from a roadside pole (flagFan helper)
    const fanTop = at(-32.5, -40.4, 4.2);
    tall.cyl(0.05, 0.08, 4.4, [fanTop[0], fanTop[1] - 4.4, fanTop[2]], PAL.barkLight, 7);
    colliders.push({ x: fanTop[0], z: fanTop[2], w: 0.18, d: 0.18, y0: fanTop[1] - 4.2, y1: fanTop[1], tag: 'post' });
    lines.push(...flagFan(fanTop, 7, 4.6, { a0: Math.PI * 0.86, a1: Math.PI * 1.12, age: 0.4, seed: 9 }));
    const darchors: DarchorPole[] = [
      { x: -60, z: -56, h: 7, seed: 1 },
      { x: -55.5, z: -60, h: 5.5, seed: 2 },
      { x: -52.5, z: -61, h: 6.2, seed: 3 },
      { x: -49.5, z: -60.3, h: 4.8, color: PAL.lungta[4], seed: 4 },
    ];

    const meshes: Object3D[] = [
      ...tall.toMeshes(partsMaterial({ occlude: true }), 24),
      ...small.toMeshes(partsMaterial(), 24),
      ...extras,
    ];
    return { meshes, colliders, lampList, lines, darchors };
  }, []);

  useEffect(() => {
    const offs = [
      ...built.colliders.map((c) => collision.addBox(c)),
      ...built.lampList.map((l) => lamps.add(l)),
    ];
    return () => offs.forEach((off) => off());
  }, [built]);

  return (
    <>
      {built.meshes.map((m, i) => <primitive key={i} object={m} />)}
      <PrayerFlags lines={built.lines} />
      <Darchor poles={built.darchors} />
    </>
  );
}

