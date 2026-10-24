// McLeod Ganj's famously chilled street dogs. Most sleep curled up on pavement edges and steps (slow
// breathing, the odd ear flick); two wander their beat along Bhagsu Road and Temple Road / Market Lane,
// sniffing, sitting and scratching; one friendly dog on the square trails Tenzin for a while, then wanders
// home. They bark at monkeys and at a boy who comes running at them. Pet them (E) for a wag and a happy hop.
// At night they all sleep.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Vector3 } from 'three';
import { collision, type CircleCollider } from '../../core/collision';
import { game } from '../../core/game';
import { interactions } from '../../core/interact';
import { clamp, damp, rng, type Rng } from '../../core/math';
import { roadById, roadFrame, roadLength } from '../../world/layout';
import { G } from '../../game/store';
import { animateQuad, CATCH_UP_DT, type QPose, type QuadRig } from './quad';
import { View } from '../cull';
import { buildDog, DOG_COATS } from './species';
import { Mover } from './mover';
import { animalsBus, freeSpot, hdist, isNight, seenSpot, sfxAt } from './nav';

type Kind = 'sleeper' | 'wanderer' | 'friendly';
interface XZ { x: number; z: number }
interface DogDef { id: string; coat: number; kind: Kind; home: XZ; yaw: number; route?: XZ[] }

function onRoad(id: string, s: number, lat: number): XZ & { yaw: number } {
  const r = roadById(id);
  const f = roadFrame(r, s < 0 ? roadLength(r) + s : s);
  return { x: f.x + f.nx * lat, z: f.z + f.nz * lat, yaw: f.yaw };
}

function dogDefs(): DogDef[] {
  const momo = onRoad('temple-road', 15, 3.3);
  const gate = onRoad('temple-road', -7.5, 3.4);
  const jog = onRoad('jogiwara-road', 24, 3.3);
  const bhagsu = [13, 20, 29, 38, 49].map((s, i) => onRoad('bhagsu-road', s, i % 2 ? -2.3 : 2.4));
  const temple = [
    onRoad('temple-road', 18, 2.4), onRoad('temple-road', 29, 2.5), onRoad('temple-road', 38.5, 1.8),
    onRoad('market-lane', 18, 0.6), onRoad('market-lane', 9, -0.6), onRoad('temple-road', 33, -2.2),
  ];
  return [
    { id: 'dog-square', coat: 0, kind: 'sleeper', home: { x: -0.6, z: -8.9 }, yaw: 0.5 },
    { id: 'dog-momo', coat: 2, kind: 'sleeper', home: momo, yaw: momo.yaw + 1.2 },
    { id: 'dog-gate', coat: 4, kind: 'sleeper', home: gate, yaw: gate.yaw - 0.8 },
    { id: 'dog-jogiwara', coat: 5, kind: 'sleeper', home: jog, yaw: jog.yaw + 2.2 },
    { id: 'dog-amala', coat: 1, kind: 'sleeper', home: { x: 17.6, z: -44.6 }, yaw: -2.6 },
    { id: 'dog-bhagsu', coat: 7, kind: 'wanderer', home: bhagsu[0], yaw: 1.5, route: bhagsu },
    { id: 'dog-temple', coat: 6, kind: 'wanderer', home: temple[0], yaw: 0, route: temple },
    { id: 'dog-friendly', coat: 3, kind: 'friendly', home: { x: -2.6, z: 3.4 }, yaw: 2.4 },
  ];
}

type St = 'sleep' | 'rest' | 'alert' | 'walk' | 'pause' | 'follow' | 'return' | 'happy' | 'bark';
type Act = 'sniff' | 'sit' | 'scratch' | 'lie' | 'look';

interface Dog {
  def: DogDef; rig: QuadRig; m: Mover; r: Rng;
  dyn: CircleCollider | null;
  st: St; t: number; dur: number; after: St;
  act: Act; routeI: number; tx: number; tz: number;
  home: XZ;
  wag: number; mouth: number; ear: number; earT: number; pant: number;
  barkCD: number; barkN: number; barkAt: XZ; followCD: number; check: number;
  ipos: Vector3;
  ph: number;
}

const STEP_SLEEP: Record<Kind, St> = { sleeper: 'sleep', wanderer: 'walk', friendly: 'rest' };

export function Dogs() {
  const view = useMemo(() => new View(), []);
  const { group, dogs } = useMemo(() => {
    const group = new Group();
    const dogs: Dog[] = dogDefs().map((def, i) => {
      const rig = buildDog({ ...DOG_COATS[def.coat], seed: 11 + i });
      rig.root.name = def.id;
      const m = new Mover(def.home.x, def.home.z, def.yaw, 0.2, 0.5);
      rig.root.position.copy(m.pos);
      rig.root.rotation.y = def.yaw;
      group.add(rig.root);
      const r = rng(101 + i * 17);
      const st: St = STEP_SLEEP[def.kind];
      return {
        def, rig, m, r, dyn: null, st, t: r() * 20, dur: 30 + r() * 40, after: st,
        act: 'look', routeI: 1, tx: def.home.x, tz: def.home.z, home: { ...def.home },
        wag: 0, mouth: 0, ear: 0, earT: 2 + r() * 6, pant: 0,
        barkCD: 2, barkN: 0, barkAt: { x: 0, z: 0 }, followCD: 4, check: r(),
        ipos: new Vector3(m.pos.x, m.pos.y + 0.3, m.pos.z), ph: r() * 10,
      };
    });
    return { group, dogs };
  }, []);

  // colliders, interactables, and nudging homes clear of whatever the other modules built there
  useEffect(() => {
    const offs: (() => void)[] = [];
    for (const d of dogs) {
      const dyn = collision.addDynamic({ x: d.m.pos.x, z: d.m.pos.z, r: 0.24, y0: d.m.pos.y, y1: d.m.pos.y + 0.55 });
      d.dyn = dyn.collider;
      d.m.w.dyn = dyn.collider;
      offs.push(dyn.remove);
      offs.push(interactions.add({
        id: `pet-${d.def.id}`, pos: () => d.ipos, radius: 1.35, label: 'Pet the dog', anim: 'pet',
        enabled: () => d.st !== 'bark',
        onInteract: () => pet(d),
      }));
    }
    const settle = () => {
      for (const d of dogs) if (d.dyn) { d.dyn.x = 1e6; d.dyn.z = 1e6; } // not blocked by ourselves
      for (const d of dogs) {
        // a free spot near home that the camera can see (not tucked behind a house)
        const f = seenSpot(d.def.home.x, d.def.home.z, 0.3, 0.5, 3.5) ?? freeSpot(d.def.home.x, d.def.home.z, 0.3, 0.5, 2.5);
        if (!f) continue;
        d.home.x = f.x; d.home.z = f.z;
        const unseen = game.time < 5 || hdist(d.m.pos, game.player.pos) > 14;
        if ((d.st === 'sleep' || d.st === 'rest') && unseen) {
          d.m.teleport(f.x, f.y, f.z);
          d.rig.root.position.copy(d.m.pos); // shown there at once (the frame loop is idle on the title screen)
          d.ipos.set(f.x, f.y + 0.3, f.z);
        }
      }
    };
    settle();
    const t0 = setTimeout(settle, 1000), t1 = setTimeout(settle, 2500), t2 = setTimeout(settle, 8000);
    return () => { offs.forEach((f) => f()); clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); for (const d of dogs) { d.dyn = null; d.m.w.dyn = undefined; } };
  }, [dogs]);

  useFrame((state) => {
    const dt = game.dt;
    if (dt <= 0) return;
    const P = game.player.pos;
    const night = isNight();
    view.update(state.camera);
    for (const d of dogs) {
      const dist = hdist(d.m.pos, P);
      const far = dist > 70;
      // drawn (and animated) only on screen; the sphere is generous so shadows just off screen still fall in
      const was = d.rig.root.visible;
      const shown = !far && view.sees(d.m.pos.x, d.m.pos.y + 0.3, d.m.pos.z, 1.8);
      d.rig.root.visible = shown;
      // the pet prompt follows the dog even while it is out of range (teleports, settling)
      d.ipos.set(d.m.pos.x, d.m.pos.y + 0.3, d.m.pos.z);
      if (far && d.st !== 'follow') continue;
      think(d, dt, dist, night);
      // animation
      const sleeping = d.st === 'sleep';
      const pose: QPose = poseOf(d);
      d.ear = damp(d.ear, 0, 9, dt);
      d.earT -= dt;
      if (d.earT <= 0) { d.earT = 3 + d.r() * 8; d.ear = (d.r() > 0.5 ? 1 : -1) * (sleeping ? 0.6 : 1); }
      d.pant = damp(d.pant, d.m.vel > 2.6 ? 1 : 0, d.m.vel > 2.6 ? 1.5 : 0.25, dt);
      const lookP = dist < 7 && d.st !== 'sleep' && d.st !== 'walk';
      if (shown) animateQuad(d.rig, {
        dt: was ? dt : CATCH_UP_DT, time: game.time, speed: d.m.vel, pose, poseRate: 4,
        air: !d.m.w.grounded, vy: d.m.w.vy,
        lookYaw: d.st === 'bark' ? d.m.lookAt(d.barkAt.x, d.barkAt.z) : lookP ? d.m.lookAt(P.x, P.z) : Math.sin(game.time * 0.3 + d.ph) * 0.5 * (d.st === 'pause' ? 1 : 0),
        lookPitch: d.st === 'bark' ? -0.15 : 0,
        wag: d.wag, mouth: d.mouth, ear: d.ear, pant: d.st === 'sleep' ? 0 : d.pant,
        sniff: d.st === 'pause' && d.act === 'sniff' ? 1 : 0,
        scratch: d.st === 'pause' && d.act === 'scratch' && d.t < 1.8 ? 1 : 0,
        sleep: sleeping,
      });
      d.rig.root.position.copy(d.m.pos);
      d.rig.root.rotation.y = d.m.yaw;
      d.ipos.set(d.m.pos.x, d.m.pos.y + 0.3, d.m.pos.z);
      if (d.dyn) {
        const park = d.st === 'follow' || d.st === 'happy';
        d.dyn.x = park ? 1e6 : d.m.pos.x; d.dyn.z = park ? 1e6 : d.m.pos.z;
        d.dyn.y0 = d.m.pos.y; d.dyn.y1 = d.m.pos.y + 0.55;
      }
    }
  });

  return <primitive object={group} />;
}

function poseOf(d: Dog): QPose {
  switch (d.st) {
    case 'sleep': return 'curl';
    case 'rest': case 'alert': return 'lie';
    case 'pause': return d.act === 'sit' || d.act === 'scratch' ? 'sit' : d.act === 'lie' ? 'lie' : 'stand';
    case 'follow': return 'sit';
    case 'happy': return d.t < 2.2 ? 'stand' : 'sit';
    default: return 'stand';
  }
}

/** Current state, un-narrowed (helpers called above may have changed it). */
const stOf = (d: Dog): St => d.st;

function go(d: Dog, st: St, dur = 0) { d.st = st; d.t = 0; d.dur = dur; }

function pet(d: Dog) {
  const prev = d.st === 'happy' || d.st === 'bark' ? d.after : d.st;
  d.after = prev === 'sleep' || prev === 'alert' ? 'rest' : prev === 'walk' ? 'pause' : prev;
  if (d.after === 'pause') d.act = 'sit';
  go(d, 'happy', 4.2);
  d.wag = 1;
  sfxAt('bark', d.m.pos.x, d.m.pos.z, 0.35);
  G().emit({ type: 'pet', animal: 'dog' });
}

function bark(d: Dog, at: XZ) {
  if (d.st !== 'bark') d.after = d.st === 'sleep' ? 'alert' : d.st === 'happy' ? d.after : d.st;
  d.barkAt.x = at.x; d.barkAt.z = at.z;
  d.barkN = 2 + (d.r() < 0.4 ? 1 : 0);
  d.barkCD = 6 + d.r() * 6;
  go(d, 'bark', 0.45 * d.barkN + 0.5);
}

function think(d: Dog, dt: number, dist: number, night: boolean) {
  const p = game.player;
  const P = p.pos;
  d.t += dt;
  d.barkCD -= dt;
  d.followCD -= dt;
  d.wag = damp(d.wag, 0, 1.2, dt);
  d.mouth = damp(d.mouth, 0, 10, dt);

  // ---- reactions -------------------------------------------------------------------------------------------
  d.check -= dt;
  if (d.check <= 0 && d.st !== 'bark' && d.st !== 'happy') {
    d.check = 0.4;
    // a boy running straight at us
    if (p.speed > 3.3 && dist < 2.8 && d.barkCD <= 0) {
      const dx = d.m.pos.x - P.x, dz = d.m.pos.z - P.z;
      const toward = (p.vel.x * dx + p.vel.z * dz) / (Math.hypot(p.vel.x, p.vel.z) * Math.hypot(dx, dz) + 1e-4);
      if (toward > 0.45) {
        if (d.st === 'sleep' && d.r() < 0.45) { d.after = 'alert'; go(d, 'alert', 4); d.barkCD = 4; }
        else bark(d, P);
      }
    }
    // monkeys: always at one leaping about nearby or down on the street; now and then at one up on a roof
    if (stOf(d) !== 'bark' && d.barkCD <= 0) {
      for (const mk of animalsBus.monkeys) {
        const md = hdist(mk.pos, d.m.pos);
        const awake = d.st !== 'sleep';
        const low = mk.pos.y - d.m.pos.y < 2.2;
        if ((mk.leaping && md < 7) || (awake && low && md < 6) || (awake && md < 8 && d.r() < 0.05)) {
          bark(d, mk.pos);
          d.barkCD = 14 + d.r() * 12;
          break;
        }
      }
    }
    // night: everyone to bed
    const s1 = stOf(d);
    if (night && s1 !== 'sleep' && s1 !== 'return' && s1 !== 'bark' && s1 !== 'happy') {
      if (hdist(d.m.pos, d.home) > 1) go(d, 'return'); else go(d, 'sleep', 1e9);
    }
  }

  switch (d.st) {
    case 'sleep': {
      d.m.idle(dt);
      if (!night && d.def.kind !== 'sleeper' && d.t > 3) go(d, STEP_SLEEP[d.def.kind]);
      else if (!night && d.t > d.dur) go(d, 'rest', 6 + d.r() * 10);
      else if (dist < 1.5 && p.speed > 0.6 && d.r() < dt * 0.6) go(d, 'alert', 3 + d.r() * 2);
      break;
    }
    case 'alert': {
      d.m.idle(dt);
      if (dist < 3) d.wag = Math.max(d.wag, 0.3);
      if (d.t > d.dur) go(d, night || d.def.kind === 'sleeper' ? 'sleep' : STEP_SLEEP[d.def.kind], 30 + d.r() * 50);
      break;
    }
    case 'rest': {
      d.m.idle(dt);
      if (dist < 3.5) { d.wag = Math.max(d.wag, 0.45); d.m.faceTo(P.x, P.z, dt, 0.6); }
      if (d.def.kind === 'friendly') {
        if (!night && dist < 3 && d.followCD <= 0) { go(d, 'follow', 25 + d.r() * 20); d.wag = 1; sfxAt('bark', d.m.pos.x, d.m.pos.z, 0.3); }
      } else if (d.t > d.dur) go(d, d.def.kind === 'sleeper' ? 'sleep' : 'walk', 40 + d.r() * 60);
      break;
    }
    case 'walk': {
      const route = d.def.route!;
      const tgt = route[d.routeI % route.length];
      const rem = d.m.to(tgt.x, tgt.z, 1.05, dt, 0.5);
      if (rem < 0.35 || d.t > 40) {
        d.routeI = (d.routeI + 1) % route.length;
        const acts: Act[] = ['sniff', 'sit', 'scratch', 'lie', 'look', 'sniff'];
        d.act = acts[Math.floor(d.r() * acts.length)];
        go(d, 'pause', d.act === 'lie' ? 10 + d.r() * 12 : 3 + d.r() * 5);
      }
      break;
    }
    case 'pause': {
      d.m.idle(dt);
      if (dist < 3 && d.act !== 'sniff') d.wag = Math.max(d.wag, 0.35);
      if (d.t > d.dur) go(d, 'walk');
      break;
    }
    case 'follow': {
      // trail ~1.7 m behind the boy, matching his pace; sit and wag when he stops
      const dx = d.m.pos.x - P.x, dz = d.m.pos.z - P.z;
      const L = Math.hypot(dx, dz) || 1;
      const tx = P.x + (dx / L) * 1.7, tz = P.z + (dz / L) * 1.7;
      const gap = L - 1.7;
      if (gap > 0.35 || p.speed > 0.4) {
        const spd = clamp(Math.max(p.speed * 1.05, gap * 1.6), 0.8, 5.2);
        d.m.to(tx, tz, spd, dt, 0.4);
      } else { d.m.idle(dt); d.m.faceTo(P.x, P.z, dt, 4); }
      d.wag = Math.max(d.wag, 0.55);
      if (d.t > d.dur || L > 16 || night) { go(d, 'return'); d.followCD = 50; }
      break;
    }
    case 'return': {
      const rem = d.m.to(d.home.x, d.home.z, 1.15, dt, 0.5);
      if (rem < 0.3 || d.t > 60) {
        if (d.t > 60) { const f = freeSpot(d.home.x, d.home.z, 0.3); if (f) d.m.teleport(f.x, f.y, f.z); }
        go(d, night ? 'sleep' : d.def.kind === 'wanderer' ? 'walk' : STEP_SLEEP[d.def.kind], night ? 1e9 : 40 + d.r() * 40);
        d.m.face(d.def.yaw, 1, 1);
      }
      break;
    }
    case 'happy': {
      d.m.idle(dt);
      d.m.faceTo(P.x, P.z, dt, 6);
      d.wag = 1;
      if (!night) {
        // two happy hops, then a wagging sit
        const t = d.t;
        if ((t > 0.25 && t - dt <= 0.25) || (t > 0.95 && t - dt <= 0.95)) d.m.hop(2.7);
      }
      if (d.t > d.dur) go(d, d.after, d.after === 'rest' ? 8 + d.r() * 6 : d.after === 'pause' ? 2.5 : d.after === 'follow' ? 15 : 30);
      break;
    }
    case 'bark': {
      d.m.idle(dt);
      d.m.faceTo(d.barkAt.x, d.barkAt.z, dt, 6);
      const k = Math.floor((d.t - 0.15) / 0.45);
      const kp = Math.floor((d.t - dt - 0.15) / 0.45);
      if (d.t > 0.15 && k !== kp && k < d.barkN) {
        sfxAt('bark', d.m.pos.x, d.m.pos.z, 0.9);
        d.mouth = 1;
        d.ear = 0.8;
      }
      if (d.t > d.dur) go(d, d.after, d.after === 'alert' ? 3 : d.after === 'pause' ? 2 : d.after === 'rest' ? 8 : d.after === 'follow' ? 10 : 30);
      break;
    }
  }
}
