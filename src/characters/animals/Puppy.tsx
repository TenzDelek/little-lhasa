// Pema's puppy (quest 'puppy'): small, brown, ONE WHITE EAR.
//   hiding  — curled up in the nook behind the tea shop on Bhagsu Road; yips when Tenzin is near.
//             'Pick up the puppy' → G().emit({ type: 'found', id: ITEMS.puppy }) (quests.ts sets puppyFollowing).
//   follow  — trots / gallops ~1.2 m behind Tenzin, hops when he jumps, sits when he stops, yips now and then.
//             Never walks through walls (collision.resolve); if it falls > 6 m behind or gets stuck it is
//             teleported behind him. On a fresh load with the flag already set it starts right next to him.
//   home    — after the quest (flags.puppyHome) it stays with Pema on the square, circling her, rolling over,
//             play-bowing; at night it sleeps curled at her feet.
// A small dynamic collider (parked while following, so it never trips Tenzin up) keeps people from walking
// through it.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Object3D } from 'three';
import { collision, type CircleCollider } from '../../core/collision';
import { game } from '../../core/game';
import { interactions } from '../../core/interact';
import { clamp, damp, rng } from '../../core/math';
import { ITEMS, SPOTS } from '../../world/layout';
import { groundY, walkable } from '../../world/terrain';
import { G } from '../../game/store';
import { animateQuad, snapQuad, type QPose } from './quad';
import { buildPuppy } from './species';
import { Mover } from './mover';
import { blocked, floorAt, freeSpot, hdist, isNight, optSpot, sfxAt } from './nav';

type Mode = 'hide' | 'follow' | 'home';
type Play = 'circle' | 'roll' | 'sit' | 'bow' | 'toBoy' | 'sleep';

const FOLLOW = 1.2;
const PLAYS: Play[] = ['circle', 'roll', 'sit', 'bow', 'circle', 'toBoy'];

function hideSpot() {
  const s = optSpot('hillside', 'PUPPY_NOOK') ?? optSpot('hillside', 'PUPPY_SPOT');
  if (s) return { x: s.x, z: s.z, yaw: s.yaw ?? 2.4 };
  // facing out of the nook toward the road (south-east, toward the camera)
  return { x: SPOTS.puppyHideout.x, z: SPOTS.puppyHideout.z, yaw: 2.4 };
}
// Pema: the NPC module names her figure 'npc:pema'; follow wherever it actually stands, else the layout spot.
let pemaObj: Object3D | null = null;
let pemaLook = 0;
const _pv = new Vector3();
const _pema: { x: number; z: number } = { x: SPOTS.pemaKid.x, z: SPOTS.pemaKid.z };
function pemaSpot(scene: Object3D | null) {
  const s = optSpot('npcs', 'PEMA') ?? SPOTS.pemaKid;
  _pema.x = s.x; _pema.z = s.z;
  if (scene && !pemaObj && game.time > pemaLook) {
    pemaLook = game.time + 3;
    pemaObj = scene.getObjectByName('npc:pema') ?? null;
  }
  if (pemaObj) {
    if (!pemaObj.parent) { pemaObj = null; return _pema; }
    pemaObj.getWorldPosition(_pv);
    if (Math.hypot(_pv.x - s.x, _pv.z - s.z) < 12) { _pema.x = _pv.x; _pema.z = _pv.z; }
  }
  return _pema;
}

/** Shared result of the follow / home helpers (no per-frame allocation). */
const OUT = { pose: 'stand' as QPose, look: 0, sleep: false, roll: 0, tailLift: 0 };
function out(pose: QPose, look: number, sleep: boolean, roll: number, tailLift: number) {
  OUT.pose = pose; OUT.look = look; OUT.sleep = sleep; OUT.roll = roll; OUT.tailLift = tailLift;
}

export function Puppy() {
  const scene = useThree((st) => st.scene);
  const rig = useMemo(() => { const r = buildPuppy(); r.root.name = 'puppy'; return r; }, []);
  const S = useMemo(() => {
    const h = hideSpot();
    return {
      m: new Mover(h.x, h.z, h.yaw, 0.13, 0.32, 0.42),
      mode: 'hide' as Mode, r: rng(4242),
      // hide
      yipT: 2, wag: 0, mouth: 0, ear: 0, earT: 3, awake: 0,
      // follow
      sitT: 0, jumpQ: -1, wasAir: false, farT: 0, stuckT: 0, pant: 0, happyT: 0,
      // home
      play: 'sit' as Play, playT: 0, playDur: 4, ang: 0, roll: 0, lapDir: 1,
      ipos: new Vector3(), hide: h, placed: false, dyn: null as CircleCollider | null,
    };
  }, []);

  // test hook: window.__puppy() → mode / position
  useEffect(() => {
    const w = window as unknown as { __puppy?: () => unknown };
    w.__puppy = () => ({ mode: S.mode, pos: S.m.pos.toArray().map((v) => +v.toFixed(2)), vel: +S.m.vel.toFixed(2), play: S.play });
    return () => { delete w.__puppy; };
  }, [S]);

  // settle into the nook once the hillside has built it
  useEffect(() => {
    const place = () => {
      const h = hideSpot();
      if (S.mode !== 'hide') { S.hide = h; return; }
      if (S.dyn) { S.dyn.x = 1e6; S.dyn.z = 1e6; } // not blocked by ourselves
      let y = floorAt(h.x, h.z, groundY(h.x, h.z) + 0.35, 0.1, 0.1);
      let x = h.x, z = h.z;
      if (blocked(x, y, z, 0.12, 0.3)) {
        const f = freeSpot(h.x, h.z, 0.16, 0.35, 1.5);
        if (f) { x = f.x; y = f.y; z = f.z; }
      }
      S.hide = { x, z, yaw: h.yaw };
      S.m.teleport(x, y, z);
      S.m.yaw = h.yaw;
      S.placed = true;
      rig.root.position.copy(S.m.pos);
      rig.root.rotation.y = S.m.yaw;
    };
    place();
    const t1 = setTimeout(place, 2500), t2 = setTimeout(place, 9000);
    const offA = interactions.add({
      id: 'puppy-call', pos: () => S.ipos, radius: 1.7, priority: 1, anim: 'pet',
      label: 'Pick up the puppy',
      enabled: () => S.mode === 'hide' && !G().flags.puppyFollowing && !G().flags.puppyHome,
      onInteract: () => {
        S.happyT = 1.6; S.wag = 1;
        sfxAt('bark', S.m.pos.x, S.m.pos.z, 0.5);
        G().emit({ type: 'found', id: ITEMS.puppy });
      },
    });
    const offB = interactions.add({
      id: 'puppy-pet', pos: () => S.ipos, radius: 1.2, priority: -1, anim: 'pet', label: 'Pet the puppy',
      // while following he sits ~1.2 m behind: only offer it when Tenzin actually turns to him
      enabled: () => S.mode !== 'hide' && S.happyT <= 0 && (S.mode === 'home' || hdist(S.m.pos, game.player.pos) < 0.95),
      onInteract: () => {
        S.happyT = 1.6; S.wag = 1;
        sfxAt('bark', S.m.pos.x, S.m.pos.z, 0.4);
        G().emit({ type: 'pet', animal: 'puppy' });
      },
    });
    const dyn = collision.addDynamic({ x: S.m.pos.x, z: S.m.pos.z, r: 0.16, y0: S.m.pos.y, y1: S.m.pos.y + 0.32 });
    S.dyn = dyn.collider;
    S.m.w.dyn = dyn.collider;
    return () => { clearTimeout(t1); clearTimeout(t2); offA(); offB(); dyn.remove(); S.dyn = null; S.m.w.dyn = undefined; };
  }, [S, rig]);

  useFrame(() => {
    const dt = game.dt;
    if (dt <= 0) return;
    const flags = G().flags;
    const want: Mode = flags.puppyHome ? 'home' : flags.puppyFollowing ? 'follow' : 'hide';
    if (want !== S.mode) {
      S.mode = want;
      S.farT = 0; S.stuckT = 0; S.sitT = 0;
      if (want === 'home') { S.play = 'circle'; S.playT = 0; S.playDur = 6; }
      // a saved game loaded with the puppy already found (or the flag set from afar): start where it
      // belongs right away, not in the nook
      if (want === 'follow' && hdist(S.m.pos, game.player.pos) > 4) teleportBehind();
      if (want === 'home') {
        const c = pemaSpot(scene);
        const f = hdist(S.m.pos, c) > 12 ? freeSpot(c.x + 0.6, c.z + 0.45, 0.16, 0.35, 1.5) : null;
        if (f) { S.m.teleport(f.x, f.y, f.z); snapQuad(rig); }
      }
      // progress wiped (new game): back to the nook
      if (want === 'hide') { const h = S.hide; S.m.teleport(h.x, floorAt(h.x, h.z, groundY(h.x, h.z) + 0.35, 0.1, 0.1), h.z); S.m.yaw = h.yaw; S.awake = 0; snapQuad(rig); }
    }
    const p = game.player, P = p.pos, m = S.m;
    const dist = hdist(m.pos, P);
    const night = isNight();
    S.wag = damp(S.wag, 0, 1.0, dt);
    S.mouth = damp(S.mouth, 0, 9, dt);
    S.ear = damp(S.ear, 0, 8, dt);
    S.happyT -= dt;
    S.earT -= dt;
    if (S.earT <= 0) { S.earT = 2 + S.r() * 5; S.ear = S.r() > 0.5 ? 0.8 : -0.8; }
    let pose: QPose = 'stand';
    let look = 0, sleep = false, roll = 0, tailLift = 0;

    if (S.happyT > 0) {
      // just called / petted: two little hops and a frantic wag
      m.idle(dt);
      m.faceTo(P.x, P.z, dt, 8);
      const t = 1.6 - S.happyT;
      if ((t > 0.1 && t - dt <= 0.1) || (t > 0.75 && t - dt <= 0.75)) m.hop(2.4);
      S.wag = 1;
      look = m.lookAt(P.x, P.z);
    } else if (S.mode === 'hide') {
      // lost and a bit scared: curled up, lifts its head and yips when someone comes near
      m.idle(dt);
      S.awake = damp(S.awake, dist < 9 ? 1 : 0, 1.5, dt);
      pose = S.awake > 0.5 ? (dist < 2.6 ? 'sit' : 'lie') : 'curl';
      sleep = S.awake < 0.5;
      if (S.awake > 0.5) {
        look = m.lookAt(P.x, P.z);
        if (dist < 4) S.wag = Math.max(S.wag, 0.6);
        S.yipT -= dt;
        if (S.yipT <= 0) { S.yipT = 3.5 + S.r() * 4; sfxAt('bark', m.pos.x, m.pos.z, 0.45); S.mouth = 1; S.ear = 1; }
      }
    } else if (S.mode === 'follow') {
      follow(dt);
      followPose();
      pose = OUT.pose; look = OUT.look;
    } else {
      home(dt, night);
      ({ pose, look, sleep, roll, tailLift } = OUT);
    }

    const moving = m.vel > 0.3;
    S.pant = damp(S.pant, m.vel > 2.2 ? 1 : 0, m.vel > 2.2 ? 2 : 0.3, dt);
    animateQuad(rig, {
      dt, time: game.time, speed: m.vel, pose, poseRate: 6,
      air: !m.w.grounded, vy: m.w.vy,
      lookYaw: look, lookPitch: moving ? 0 : -0.1,
      wag: Math.max(S.wag, moving ? 0.35 : 0), mouth: S.mouth, ear: S.ear,
      pant: sleep ? 0 : S.pant, sleep, roll, tailLift,
    });
    rig.root.position.copy(m.pos);
    rig.root.rotation.y = m.yaw;
    S.ipos.set(m.pos.x, m.pos.y + 0.15, m.pos.z);
    if (S.dyn) {
      const park = S.mode === 'follow';
      S.dyn.x = park ? 1e6 : m.pos.x; S.dyn.z = park ? 1e6 : m.pos.z;
      S.dyn.y0 = m.pos.y; S.dyn.y1 = m.pos.y + 0.32;
    }
  });

  // ---- follow ---------------------------------------------------------------------------------------------
  function follow(dt: number) {
    const p = game.player, P = p.pos, m = S.m;
    const dx = m.pos.x - P.x, dz = m.pos.z - P.z;
    const L = Math.hypot(dx, dz) || 1e-3;
    // hop after him when he jumps
    if (!p.grounded && p.vel.y > 2 && !S.wasAir) S.jumpQ = 0.12 + S.r() * 0.08;
    S.wasAir = !p.grounded;
    if (S.jumpQ >= 0) { S.jumpQ -= dt; if (S.jumpQ < 0) m.hop(3.8); }

    const gap = L - FOLLOW;
    const up = P.y - m.pos.y;
    if (gap > 0.15 || p.speed > 0.3) {
      const tx = P.x + (dx / L) * FOLLOW, tz = P.z + (dz / L) * FOLLOW;
      const spd = clamp(Math.max(p.speed * 1.08, gap * 2.4), 0.6, 6.2);
      m.to(tx, tz, spd, dt, 0.3, 10);
      S.sitT = 0;
      // something in the way and he is above us: try a jump up
      if (m.stuck > 0.25 && up > 0.3 && m.w.grounded) m.hop(5.2);
    } else {
      m.idle(dt);
      m.faceTo(P.x, P.z, dt, 5);
      S.sitT += dt;
      S.yipT -= dt;
      if (S.yipT <= 0) { S.yipT = 10 + S.r() * 15; sfxAt('bark', m.pos.x, m.pos.z, 0.4); S.mouth = 1; }
    }
    // fell behind or stuck: reappear behind him (out of his way)
    S.farT = L > 6 || Math.abs(up) > 3 ? S.farT + dt : 0;
    S.stuckT = m.stuck > 0.2 && gap > 1.5 ? S.stuckT + dt : Math.max(0, S.stuckT - dt);
    if (S.farT > 0.6 || S.stuckT > 2.2) {
      teleportBehind();
      S.farT = 0; S.stuckT = 0;
    }
  }

  function followPose() {
    const P = game.player.pos, m = S.m;
    const sit = S.sitT > 0.35;
    OUT.pose = sit ? (Math.sin(game.time * 0.21) > 0.93 ? 'bow' : 'sit') : 'stand';
    OUT.look = sit ? m.lookAt(P.x, P.z) : 0;
  }

  function teleportBehind() {
    const p = game.player, P = p.pos;
    const back = p.yaw + Math.PI;
    for (const r of [1.6, 2.2, 1.2, 2.8]) {
      for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, Math.PI]) {
        const a = back + da;
        const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
        if (!walkable(x, z)) continue;
        const y = floorAt(x, z, P.y + 0.2, 0.12, 0.6);
        if (Math.abs(y - P.y) > 0.6) continue;
        if (blocked(x, y, z, 0.14, 0.32)) continue;
        S.m.teleport(x, y, z);
        S.m.yaw = Math.atan2(P.x - x, P.z - z);
        snapQuad(rig);
        return;
      }
    }
  }

  /** Pick the next game to play by Pema. */
  function nextPlay(c: { x: number; z: number }) {
    const m = S.m, P = game.player.pos;
    let n = PLAYS[Math.floor(S.r() * PLAYS.length)];
    if (n === 'toBoy' && hdist(P, c) > 5) n = 'sit';
    S.play = n; S.playT = 0;
    S.playDur = n === 'circle' ? 5 + S.r() * 3 : n === 'roll' ? 2.6 : n === 'toBoy' ? 5 : 2.5 + S.r() * 3;
    S.lapDir = S.r() > 0.5 ? 1 : -1;
    if (n === 'bow') { sfxAt('bark', m.pos.x, m.pos.z, 0.4); S.mouth = 1; }
  }

  // ---- home with Pema ---------------------------------------------------------------------------------------
  function home(dt: number, night: boolean) {
    const m = S.m, P = game.player.pos;
    const c = pemaSpot(scene);
    const dc = hdist(m.pos, c);
    S.playT += dt;
    let pose: QPose = 'stand', look = 0, sleep = false, roll = 0, tailLift = 0;
    if (dc > 3.5) {
      // still on the way to her
      m.to(c.x + 0.8, c.z + 0.6, 2.8, dt, 0.4);
      if (dc > 30) { const f = freeSpot(c.x + 0.8, c.z + 0.6, 0.16); if (f) m.teleport(f.x, f.y, f.z); }
      return out(pose, look, sleep, roll, tailLift);
    }
    if (night && S.play !== 'sleep') { S.play = 'sleep'; S.playT = 0; }
    if (!night && S.play === 'sleep') { S.play = 'circle'; S.playT = 0; S.playDur = 6; }
    switch (S.play) {
      case 'circle': {
        // run round Pema
        S.ang = Math.atan2(m.pos.x - c.x, m.pos.z - c.z) + S.lapDir * 0.9;
        const tx = c.x + Math.sin(S.ang) * 1.0, tz = c.z + Math.cos(S.ang) * 1.0;
        m.to(tx, tz, 2.2, dt, 0.2, 9);
        S.wag = Math.max(S.wag, 0.8);
        if (S.playT > S.playDur) nextPlay(c);
        break;
      }
      case 'roll': {
        // flop over onto its back and wriggle, then back up
        m.idle(dt);
        pose = 'lie';
        const k = clamp(S.playT / S.playDur);
        roll = Math.sin(k * Math.PI) * Math.PI * 0.95 * (k < 0.15 || k > 0.85 ? Math.sin(k * Math.PI) : 1);
        S.wag = 0.6;
        if (S.playT > S.playDur) nextPlay(c);
        break;
      }
      case 'sit':
      case 'bow': {
        m.idle(dt);
        m.faceTo(c.x, c.z, dt, 4);
        pose = S.play;
        look = m.lookAt(hdist(P, m.pos) < 3 ? P.x : c.x, hdist(P, m.pos) < 3 ? P.z : c.z);
        S.wag = Math.max(S.wag, S.play === 'bow' ? 1 : 0.5);
        tailLift = S.play === 'bow' ? 0.4 : 0;
        if (S.playT > S.playDur) nextPlay(c);
        break;
      }
      case 'toBoy': {
        // scamper to Tenzin, sniff, scamper back
        const d = hdist(m.pos, P);
        if (S.playT < 2.5 && d > 0.9) m.to(P.x, P.z, 2.6, dt, 0.5); else { m.idle(dt); m.faceTo(P.x, P.z, dt, 5); pose = 'sit'; }
        look = m.lookAt(P.x, P.z);
        S.wag = 1;
        if (S.playT > S.playDur) nextPlay(c);
        break;
      }
      case 'sleep': {
        const sx = c.x + 0.55, sz = c.z + 0.35;
        if (hdist(m.pos, { x: sx, z: sz }) > 0.25 && S.playT < 8) m.to(sx, sz, 1.2, dt, 0.3);
        else { m.idle(dt); pose = 'curl'; sleep = true; }
        break;
      }
    }
    return out(pose, look, sleep, roll, tailLift);
  }

  return <primitive object={rig.root} />;
}
