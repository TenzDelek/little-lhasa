// Cows on the road verges of Jogiwara Road and Bhagsu Road: humped Indian cattle, white, brown and grey.
// They stand or lie chewing the cud, flick their tails and ears, slowly turn their heads to watch Tenzin,
// and moo now and then when he is near. Solid: three dynamic circles along the body (block Tenzin and the NPCs,
// never stood on). At night they lie down.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { collision, type CircleCollider } from '../../core/collision';
import { game } from '../../core/game';
import { damp, rng, type Rng } from '../../core/math';
import { roadById, roadFrame } from '../../world/layout';
import { groundY } from '../../world/terrain';
import { animateQuad, type QuadRig } from './quad';
import { buildCow, COW_COATS } from './species';
import { blocked, hdist, isNight, sfxAt } from './nav';

// Spots picked where the default camera can see them (not tucked behind a house) and nothing is built.
interface CowDef { coat: keyof typeof COW_COATS; road: string; s: number; lat: number; turn: number; lying: boolean }

const DEFS: CowDef[] = [
  { coat: 'white', road: 'jogiwara-road', s: 35, lat: 2.1, turn: Math.PI - 0.45, lying: false },
  { coat: 'brown', road: 'bhagsu-road', s: 8.5, lat: 2.3, turn: Math.PI + 0.15, lying: true },
  { coat: 'grey', road: 'jogiwara-road', s: 39, lat: -2.3, turn: -0.12, lying: true },
];

interface Cow {
  rig: QuadRig; r: Rng; x: number; y: number; z: number; yaw: number; roadX: number; roadZ: number;
  lying: boolean; t: number; next: number;
  look: number; pitch: number; chew: number; chewT: number; swish: number; swishT: number;
  ear: number; earT: number; mooCD: number; mouth: number; near: boolean;
  cols: CircleCollider[];
}

/** Lay the three body circles along the cow (rump, barrel, chest + head); lower when she lies down. */
function fit(c: Cow) {
  const sx = Math.sin(c.yaw), sz = Math.cos(c.yaw);
  const top = c.y + (c.lying ? 0.95 : 1.5);
  for (let k = 0; k < c.cols.length; k++) {
    const o = (k - 1) * 0.66 + 0.12;
    const col = c.cols[k];
    col.x = c.x + sx * o; col.z = c.z + sz * o; col.y0 = c.y; col.y1 = top;
  }
}

export function Cows() {
  const { group, cows } = useMemo(() => {
    const group = new Group();
    const cows: Cow[] = DEFS.map((d, i) => {
      const f = roadFrame(roadById(d.road), d.s);
      const x = f.x + f.nx * d.lat, z = f.z + f.nz * d.lat;
      const rig = buildCow({ ...COW_COATS[d.coat], seed: 5 + i });
      rig.root.name = `cow-${d.coat}`;
      group.add(rig.root);
      const r = rng(303 + i * 29);
      rig.root.position.set(x, groundY(x, z), z);
      rig.root.rotation.y = f.yaw + d.turn;
      return {
        rig, r, x, z, y: groundY(x, z), yaw: f.yaw + d.turn, roadX: f.x, roadZ: f.z,
        lying: d.lying, t: 0, next: 50 + r() * 70,
        look: 0, pitch: 0, chew: 1, chewT: 6 + r() * 8, swish: 0, swishT: 2 + r() * 5,
        ear: 0, earT: 1 + r() * 4, mooCD: 6 + r() * 10, mouth: 0, near: false, cols: [],
      };
    });
    // settle the lying ones in their pose from the first frame
    for (const c of cows) if (c.lying) for (let k = 0; k < 30; k++) animateQuad(c.rig, { dt: 0.1, time: k * 0.1, speed: 0, pose: 'lie', poseRate: 30, rate: 30 });
    return { group, cows };
  }, []);

  useEffect(() => {
    const offs: (() => void)[] = [];
    for (const c of cows) {
      for (let k = 0; k < 3; k++) {
        const d = collision.addDynamic({ x: c.x, z: c.z, r: 0.36, y0: c.y, y1: c.y + 1.5 });
        c.cols.push(d.collider);
        offs.push(d.remove);
      }
      fit(c);
    }
    // keep clear of whatever was built on the verge: shuffle toward the road centre
    const place = () => {
      for (const c of cows) for (const col of c.cols) { col.x = 1e6; col.z = 1e6; } // not blocked by ourselves
      for (const c of cows) {
        for (let k = 0; k < 8 && blocked(c.x, c.y, c.z, 0.4, 1.2); k++) {
          const dx = c.roadX - c.x, dz = c.roadZ - c.z, L = Math.hypot(dx, dz) || 1;
          c.x += (dx / L) * 0.25; c.z += (dz / L) * 0.25; c.y = groundY(c.x, c.z);
        }
        fit(c);
        c.rig.root.position.set(c.x, c.y, c.z);
      }
    };
    const t1 = setTimeout(place, 2600), t2 = setTimeout(place, 9000);
    const w = window as unknown as { __cows?: () => unknown };
    w.__cows = () => cows.map((c) => ({ p: [+c.x.toFixed(1), +c.y.toFixed(1), +c.z.toFixed(1)], lying: c.lying }));
    return () => { offs.forEach((f) => f()); clearTimeout(t1); clearTimeout(t2); for (const c of cows) c.cols.length = 0; delete w.__cows; };
  }, [cows]);

  useFrame(() => {
    const dt = game.dt;
    if (dt <= 0) return;
    const P = game.player.pos;
    const night = isNight();
    for (const c of cows) {
      const dist = hdist(c, P);
      c.rig.root.visible = dist < 65;
      if (dist > 65) continue;
      c.t += dt;
      // posture: lie down / get up now and then; always lying at night
      if (night && !c.lying) { c.lying = true; c.t = 0; fit(c); }
      else if (!night && c.t > c.next) { c.lying = !c.lying; c.t = 0; c.next = 60 + c.r() * 90; fit(c); }
      // chewing the cud with pauses
      c.chewT -= dt;
      if (c.chewT <= 0) { c.chew = c.chew > 0.5 ? 0 : 1; c.chewT = c.chew ? 8 + c.r() * 12 : 2 + c.r() * 3; }
      // tail swish and ear flicks
      c.swishT -= dt;
      if (c.swishT <= 0) { c.swishT = 3 + c.r() * 7; c.swish = 1; }
      c.swish = damp(c.swish, 0, 0.9, dt);
      c.earT -= dt;
      c.ear = damp(c.ear, 0, 7, dt);
      if (c.earT <= 0) { c.earT = 1.5 + c.r() * 5; c.ear = c.r() > 0.5 ? 1 : -1; }
      // slowly turn the head to watch the boy
      const ax = P.x - c.x, az = P.z - c.z;
      let want = 0;
      if (dist < 8) {
        let a = Math.atan2(ax, az) - c.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        want = Math.abs(a) < 2.2 ? Math.max(-1.25, Math.min(1.25, a)) : 0;
      }
      c.look = damp(c.look, want, 0.9, dt);
      // moo when he comes close
      c.mooCD -= dt;
      c.mouth = damp(c.mouth, 0, 1.6, dt);
      const nearNow = dist < 5;
      if (nearNow && c.mooCD <= 0 && (!c.near || c.r() < dt * 0.05) && !night) {
        c.mooCD = 18 + c.r() * 20;
        if (c.r() < 0.7) { sfxAt('moo', c.x, c.z, 0.9); c.mouth = 1; c.chew = 0; c.chewT = 2; }
      }
      c.near = nearNow;
      c.pitch = damp(c.pitch, c.mouth > 0.3 ? -0.3 : 0, 3, dt);
      animateQuad(c.rig, {
        dt, time: game.time, speed: 0, pose: c.lying ? 'lie' : 'stand', poseRate: 0.9, rate: 6,
        lookYaw: c.look, lookPitch: c.pitch + (c.lying ? -0.05 : 0.05),
        chew: c.chew * (1 - c.mouth), mouth: c.mouth * 0.7, swish: c.swish, ear: c.ear,
        sleep: night && c.lying,
      });
      c.rig.root.position.set(c.x, c.y, c.z);
      c.rig.root.rotation.y = c.yaw;
    }
  });

  return <primitive object={group} />;
}
