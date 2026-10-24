// Birds. A flock of pigeons pecks about on Main Square and bursts into the air when Tenzin walks or runs
// through them: they flap up, wheel round the square in a loose loop, and glide back down to land again.
// House crows (grey nape) perch on pole tops and roof edges, hop and turn, caw (sfx 'crow'), and flap off
// to another perch when approached. All instanced: bodies and wings are four draw calls in total.
// Night: the pigeons fly off to roost (hidden) and the crows sleep where they perch.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { collision } from '../../core/collision';
import { game } from '../../core/game';
import { Parts } from '../../core/geom';
import { clamp, damp, dampAngle, lerp, rng, smooth, TAU, type Rng } from '../../core/math';
import { groundY, roadQuery } from '../../world/terrain';
import { animalMaterial } from './quad';
import { blocked, hdist, isNight, roofPerches, sfxAt } from './nav';

// ---- geometry -----------------------------------------------------------------------------------------------
function pigeonBody(): BufferGeometry {
  const p = new Parts();
  p.box(0.12, 0.1, 0.2, [0, 0.12, 0], 0x8f98a6);
  p.box(0.1, 0.04, 0.14, [0, 0.075, 0.01], 0x9aa2b0);
  p.box(0.13, 0.07, 0.16, [0, 0.14, -0.03], 0x7c8494); // folded wings
  p.box(0.132, 0.014, 0.03, [0, 0.13, -0.03], 0x2a2c34); // wing bars
  p.box(0.132, 0.014, 0.03, [0, 0.13, -0.09], 0x2a2c34);
  p.box(0.09, 0.09, 0.07, [0, 0.17, 0.08], 0x5f7a72); // iridescent neck
  p.box(0.092, 0.03, 0.072, [0, 0.145, 0.08], 0x7a6a8a);
  p.box(0.065, 0.06, 0.07, [0, 0.225, 0.11], 0x7c8494); // head
  p.box(0.018, 0.016, 0.034, [0, 0.215, 0.158], 0x3a3434); // beak
  p.box(0.022, 0.012, 0.014, [0, 0.227, 0.147], 0xe8e4dc); // cere
  p.box(0.012, 0.016, 0.016, [0.034, 0.232, 0.12], 0xd06030);
  p.box(0.012, 0.016, 0.016, [-0.034, 0.232, 0.12], 0xd06030);
  p.box(0.08, 0.025, 0.12, [0, 0.135, -0.15], 0x6e7686); // tail
  p.box(0.082, 0.027, 0.035, [0, 0.135, -0.2], 0x2a2c34);
  for (const sx of [1, -1]) {
    p.box(0.018, 0.07, 0.018, [sx * 0.025, 0.035, 0], 0xc05a6a);
    p.box(0.03, 0.012, 0.045, [sx * 0.025, 0.006, 0.012], 0xc05a6a);
  }
  return p.merge();
}
function pigeonWing(): BufferGeometry {
  const p = new Parts();
  p.box(0.15, 0.014, 0.11, [0.075, 0, 0], 0x8f98a6);
  p.box(0.1, 0.016, 0.022, [0.06, 0, -0.012], 0x2a2c34);
  p.box(0.09, 0.014, 0.1, [0.19, 0, -0.008], 0x40444e);
  return p.merge();
}
function crowBody(): BufferGeometry {
  const p = new Parts();
  p.box(0.13, 0.13, 0.26, [0, 0.16, 0], 0x1e1e24);
  p.box(0.115, 0.11, 0.1, [0, 0.215, 0.1], 0x5a5a64); // grey nape (house crow)
  p.box(0.085, 0.08, 0.09, [0, 0.27, 0.15], 0x1a1a20);
  p.box(0.026, 0.026, 0.07, [0, 0.262, 0.225], 0x101014);
  p.box(0.012, 0.014, 0.014, [0.043, 0.28, 0.16], 0x6a6a74);
  p.box(0.012, 0.014, 0.014, [-0.043, 0.28, 0.16], 0x6a6a74);
  p.box(0.09, 0.025, 0.17, [0, 0.165, -0.2], 0x16161c);
  for (const sx of [1, -1]) {
    p.box(0.02, 0.1, 0.02, [sx * 0.032, 0.05, 0.01], 0x141418);
    p.box(0.032, 0.012, 0.05, [sx * 0.032, 0.006, 0.02], 0x141418);
  }
  return p.merge();
}
function crowWing(): BufferGeometry {
  const p = new Parts();
  p.box(0.18, 0.016, 0.14, [0.09, 0, 0], 0x1c1c22);
  p.box(0.12, 0.016, 0.13, [0.23, 0, -0.01], 0x121216);
  return p.merge();
}

// ---- shared instancing --------------------------------------------------------------------------------------
const _m = new Matrix4(), _w = new Matrix4(), _q = new Quaternion(), _e = new Euler(0, 0, 0, 'YXZ'), _p = new Vector3(), _s = new Vector3();
const ZERO = new Matrix4().makeScale(0, 0, 0);
const _ry = new Matrix4().makeRotationY(Math.PI);
const _rz = new Matrix4();
const _t = new Matrix4();

/** Write body + both wing matrices for bird i. */
function writeBird(body: InstancedMesh, wings: InstancedMesh, i: number, x: number, y: number, z: number,
  yaw: number, pitch: number, roll: number, flap: number, wingsOut: boolean, sh: readonly [number, number, number], scale = 1) {
  _e.set(pitch, yaw, roll);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
  body.setMatrixAt(i, _m);
  if (!wingsOut) { wings.setMatrixAt(i * 2, ZERO); wings.setMatrixAt(i * 2 + 1, ZERO); return; }
  for (let s = 0; s < 2; s++) {
    _t.makeTranslation(s ? -sh[0] : sh[0], sh[1], sh[2]);
    _w.copy(_m).multiply(_t);
    if (s) _w.multiply(_ry);
    _rz.makeRotationZ(s ? flap : flap);
    _w.multiply(_rz);
    wings.setMatrixAt(i * 2 + s, _w);
  }
}

// ---- pigeons ---------------------------------------------------------------------------------------------------
const PIG_N = 16;
const AREA = { x: 1.4, z: -0.6, r: 2.7 };
const LOOP = { x: 1.5, z: -0.5 };
type PSt = 'ground' | 'up' | 'loop' | 'down' | 'leave' | 'gone';

interface Pigeon {
  r: Rng; x: number; y: number; z: number; yaw: number; pitch: number; roll: number;
  st: PSt; t: number; dur: number; delay: number;
  tx: number; tz: number; walkT: number; peck: number; peckT: number;
  ang: number; R: number; alt: number; w: number;
  /** Burst control point (Bezier) for the take-off. */
  cx: number; cy: number; cz: number;
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  px: number; py: number; pz: number;
  flap: number; amp: number; rate: number;
}

function groundSpot(r: Rng, avoid: Vector3 | null): [number, number] {
  for (let k = 0; k < 12; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * AREA.r;
    const x = AREA.x + Math.cos(a) * d, z = AREA.z + Math.sin(a) * d * 0.8;
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 3.5) continue;
    if (blocked(x, groundY(x, z), z, 0.08, 0.25)) continue;
    return [x, z];
  }
  return [AREA.x + (r() - 0.5) * 2, AREA.z + (r() - 0.5) * 2];
}

// ---- crows -----------------------------------------------------------------------------------------------------
const CROW_N = 6;
interface CPerch { x: number; y: number; z: number; yaw: number }
type CSt = 'perch' | 'fly' | 'sleep';
interface Crow {
  r: Rng; x: number; y: number; z: number; yaw: number; pitch: number;
  perch: CPerch; st: CSt; t: number; dur: number; hop: number; hopT: number; cawT: number; caw: number;
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; T: number; H: number; next: CPerch | null;
  flap: number;
}

function crowPerches(): CPerch[] {
  const out: CPerch[] = [];
  for (const c of collision.list()) {
    if (c.tag !== 'pole' && c.tag !== 'lamp') continue;
    if (Math.hypot(c.x, c.z - 20) > 75) continue;
    out.push({ x: c.x, y: c.y1, z: c.z, yaw: Math.atan2(-c.x, -c.z) });
  }
  const roofs = roofPerches((c) => c.tag === 'building' && Math.hypot(c.x, c.z - 15) < 55 && roadQuery(c.x, c.z).edge < 14, 0.12);
  for (const p of roofs) {
    out.push({ x: p.x + p.ex * p.half * 0.6, y: p.y, z: p.z + p.ez * p.half * 0.6, yaw: p.yaw });
    out.push({ x: p.x - p.ex * p.half * 0.5, y: p.y, z: p.z - p.ez * p.half * 0.5, yaw: p.yaw + 0.4 });
  }
  if (out.length < CROW_N + 2) {
    // nothing built yet: hop about the edges of the square
    const pts: [number, number][] = [[-11, -8], [12, -8], [-11, 8], [12, 8.5], [5, 9], [-8, 9.4], [0, -9], [9, -9.5]];
    for (const [x, z] of pts) out.push({ x, y: groundY(x, z), z, yaw: Math.atan2(-x, -z) });
  }
  return out;
}

export function Birds() {
  const S = useMemo(() => {
    const mat = animalMaterial();
    const pb = new InstancedMesh(pigeonBody(), mat, PIG_N);
    const pw = new InstancedMesh(pigeonWing(), mat, PIG_N * 2);
    const cb = new InstancedMesh(crowBody(), mat, CROW_N);
    const cw = new InstancedMesh(crowWing(), mat, CROW_N * 2);
    for (const m of [pb, pw, cb, cw]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; }
    // a few odd-coloured pigeons in the flock
    const tint = new Color();
    const r0 = rng(55);
    for (let i = 0; i < PIG_N; i++) {
      const k = r0();
      tint.setRGB(1, 1, 1);
      if (k < 0.15) tint.setRGB(0.62, 0.62, 0.66);       // dark
      else if (k < 0.25) tint.setRGB(1.18, 1.12, 1.05);  // pale
      else if (k < 0.33) tint.setRGB(1.05, 0.86, 0.72);  // reddish
      pb.setColorAt(i, tint); pw.setColorAt(i * 2, tint); pw.setColorAt(i * 2 + 1, tint);
    }
    const pigeons: Pigeon[] = Array.from({ length: PIG_N }, (_, i) => {
      const r = rng(1000 + i * 7);
      const [x, z] = groundSpot(r, null);
      return {
        r, x, y: groundY(x, z), z, yaw: r() * TAU, pitch: 0, roll: 0, st: 'ground' as PSt, t: 0, dur: 0, delay: 0,
        tx: x, tz: z, walkT: r() * 3, peck: 0, peckT: r() * 2,
        ang: 0, R: 5 + r() * 2.5, alt: 3.2 + r() * 1.8, w: 0.95 + r() * 0.2, cx: 0, cy: 0, cz: 0,
        x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, px: x, py: 0, pz: z, flap: r() * 6, amp: 0, rate: 0,
      };
    });
    const cr = rng(31);
    const perches = crowPerches();
    const crows: Crow[] = Array.from({ length: CROW_N }, (_, i) => {
      const p = perches[Math.floor(cr() * perches.length)];
      return {
        r: rng(2000 + i * 11), x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, perch: p, st: 'perch' as CSt, t: 0,
        dur: 20 + cr() * 40, hop: 0, hopT: 2 + cr() * 5, cawT: 3 + cr() * 10, caw: 0,
        x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, T: 1, H: 1, next: null, flap: 0,
      };
    });
    return { pb, pw, cb, cw, pigeons, crows, perches, scanT: 0, scans: 0, version: -1, scareCD: 0 };
  }, []);

  useEffect(() => () => { S.pb.dispose(); S.pw.dispose(); S.cb.dispose(); S.cw.dispose(); }, [S]);

  useFrame(() => {
    const dt = game.dt;
    if (dt <= 0) return;
    const p = game.player, P = p.pos;
    const night = isNight();

    // ---- pigeons --------------------------------------------------------------------------------------------
    const near = hdist(AREA, P) < 60;
    S.pb.visible = S.pw.visible = near;
    if (near) {
      S.scareCD -= dt;
      // scare: walking right through them, or running anywhere near
      let scare = false;
      for (const b of S.pigeons) {
        if (b.st !== 'ground') continue;
        const d = Math.hypot(b.x - P.x, b.z - P.z);
        if ((d < 1.3 && p.speed > 0.4) || (d < 3.2 && p.speed > 3.2) || (d < 0.7)) { scare = true; break; }
      }
      if (scare || (night && S.pigeons.some((b) => b.st === 'ground'))) {
        for (const b of S.pigeons) {
          if (b.st !== 'ground') continue;
          const d = Math.hypot(b.x - P.x, b.z - P.z);
          if (!night && d > 6.5) continue;
          b.st = 'up'; b.t = 0; b.delay = d * 0.05 + b.r() * 0.15; b.dur = 1.3 + b.r() * 0.4;
          b.x0 = b.x; b.y0 = b.y; b.z0 = b.z;
          // burst up and away from the boy, then sweep into the loop on that side
          const ax = b.x - P.x, az = b.z - P.z, al = Math.hypot(ax, az) || 1;
          const spread = (b.r() - 0.5) * 1.2;
          const dx = (ax / al) * Math.cos(spread) - (az / al) * Math.sin(spread), dz = (ax / al) * Math.sin(spread) + (az / al) * Math.cos(spread);
          b.cx = b.x + dx * (2 + b.r() * 1.5); b.cz = b.z + dz * (2 + b.r() * 1.5); b.cy = b.y + 2.2 + b.r();
          b.ang = Math.atan2(b.cx - LOOP.x, b.cz - LOOP.z) + 0.5;
        }
      }
      for (let i = 0; i < PIG_N; i++) {
        const b = S.pigeons[i];
        pigeon(b, dt, night, P);
        const out = b.st !== 'ground' && b.st !== 'gone';
        if (b.st === 'gone') { S.pb.setMatrixAt(i, ZERO); S.pw.setMatrixAt(i * 2, ZERO); S.pw.setMatrixAt(i * 2 + 1, ZERO); continue; }
        writeBird(S.pb, S.pw, i, b.x, b.y, b.z, b.yaw, b.pitch, b.roll, Math.sin(b.flap) * b.amp + (out ? 0.15 : 0), out, [0.055, 0.15, 0.02]);
      }
      S.pb.instanceMatrix.needsUpdate = true;
      S.pw.instanceMatrix.needsUpdate = true;
    }

    // ---- crows ------------------------------------------------------------------------------------------------
    S.scanT += dt;
    const due = S.scans < 3 ? S.scanT > [2.2, 6.5, 15][S.scans] : S.scanT > 25 + S.scans;
    if (due) {
      S.scans++;
      if (collision.version !== S.version) {
        S.version = collision.version;
        S.perches = crowPerches();
        // crows on fallback ground spots move to the new perches
        for (const c of S.crows) if (c.st === 'perch') c.dur = Math.min(c.dur, c.t + 1 + c.r() * 4);
      }
    }
    for (let i = 0; i < CROW_N; i++) {
      const c = S.crows[i];
      crow(S, c, dt, night, P);
      const out = c.st === 'fly' || c.hop > 0;
      writeBird(S.cb, S.cw, i, c.x, c.y + Math.max(0, c.hop), c.z, c.yaw, c.pitch, 0,
        Math.sin(c.flap) * (c.st === 'fly' ? 0.95 : 0.6) + 0.1, out, [0.065, 0.2, 0.03]);
    }
    S.cb.instanceMatrix.needsUpdate = true;
    S.cw.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={S.pb} />
      <primitive object={S.pw} />
      <primitive object={S.cb} />
      <primitive object={S.cw} />
    </>
  );
}

function loopPos(b: Pigeon, out: Vector3) {
  return out.set(LOOP.x + Math.sin(b.ang) * b.R, b.alt + Math.sin(b.ang * 2 + b.R) * 0.6, LOOP.z + Math.cos(b.ang) * b.R * 0.85);
}
const _lp = new Vector3();

function pigeon(b: Pigeon, dt: number, night: boolean, P: Vector3) {
  b.t += dt;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  switch (b.st) {
    case 'ground': {
      // potter about, pecking
      b.walkT -= dt;
      if (b.walkT <= 0) {
        b.walkT = 1.5 + b.r() * 4;
        const a = b.r() * TAU, d = 0.3 + b.r() * 0.8;
        b.tx = clamp(b.x + Math.cos(a) * d, AREA.x - AREA.r, AREA.x + AREA.r);
        b.tz = clamp(b.z + Math.sin(a) * d, AREA.z - AREA.r, AREA.z + AREA.r);
        if (blocked(b.tx, b.y, b.tz, 0.08, 0.25)) { b.tx = b.x; b.tz = b.z; }
      }
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.03 && b.peck <= 0) {
        b.yaw = dampAngle(b.yaw, Math.atan2(dx, dz), 8, dt);
        const step = Math.min(d, 0.32 * dt);
        b.x += (dx / d) * step; b.z += (dz / d) * step;
      }
      b.peckT -= dt;
      if (b.peckT <= 0) { b.peckT = 0.6 + b.r() * 2.2; b.peck = 0.35; }
      b.peck = Math.max(0, b.peck - dt);
      const walking = d > 0.03 && b.peck <= 0;
      b.y = groundY(b.x, b.z) + (walking ? Math.abs(Math.sin(b.t * 14)) * 0.012 : 0);
      b.pitch = b.peck > 0 ? Math.sin((b.peck / 0.35) * Math.PI) * 0.75 : walking ? Math.sin(b.t * 14) * 0.08 : 0;
      b.roll = 0; b.amp = 0;
      break;
    }
    case 'up': {
      if (b.t < b.delay) { b.pitch = -0.2; break; }
      const k = clamp((b.t - b.delay) / b.dur);
      loopPos(b, _lp);
      // quadratic Bezier: ground → burst point → loop
      const a = (1 - k) * (1 - k), m = 2 * (1 - k) * k, c = k * k;
      b.x = a * b.x0 + m * b.cx + c * _lp.x;
      b.y = a * b.y0 + m * b.cy + c * _lp.y;
      b.z = a * b.z0 + m * b.cz + c * _lp.z;
      b.ang += b.w * dt * k;
      b.rate = 13; b.amp = 1.15;
      if (k >= 1) { b.st = night ? 'leave' : 'loop'; b.t = 0; b.dur = 6 + b.r() * 6; b.x0 = b.x; b.y0 = b.y; b.z0 = b.z; }
      break;
    }
    case 'loop': {
      b.ang += b.w * dt;
      loopPos(b, _lp);
      b.x = _lp.x; b.y = _lp.y; b.z = _lp.z;
      // flap, then glide a little
      const glide = Math.sin(b.t * 0.9 + b.R) > 0.45;
      b.rate = glide ? 2 : 8; b.amp = damp(b.amp, glide ? 0.12 : 0.85, 6, dt);
      if (night) { b.st = 'leave'; b.t = 0; b.x0 = b.x; b.y0 = b.y; b.z0 = b.z; break; }
      if (b.t > b.dur) {
        const [x, z] = groundSpot(b.r, P);
        b.st = 'down'; b.t = 0; b.dur = 1.8 + b.r() * 0.5;
        b.x0 = b.x; b.y0 = b.y; b.z0 = b.z; b.x1 = x; b.z1 = z; b.y1 = groundY(x, z);
      }
      break;
    }
    case 'down': {
      const k = clamp(b.t / b.dur);
      const e = 1 - (1 - k) * (1 - k);
      b.x = lerp(b.x0, b.x1, e); b.z = lerp(b.z0, b.z1, e);
      b.y = lerp(b.y0, b.y1, smooth(0, 1, k));
      b.rate = k > 0.75 ? 11 : 5; b.amp = k > 0.75 ? 0.9 : 0.35;
      if (k >= 1) { b.st = 'ground'; b.t = 0; b.x = b.x1; b.z = b.z1; b.tx = b.x; b.tz = b.z; b.walkT = 0.5 + b.r(); }
      break;
    }
    case 'leave': {
      // off to roost: climb away to the north-west and vanish
      const k = clamp(b.t / 4);
      b.x = b.x0 - 30 * k; b.z = b.z0 - 34 * k; b.y = b.y0 + 14 * k;
      b.rate = 9; b.amp = 0.9;
      if (k >= 1) { b.st = 'gone'; b.t = 0; }
      break;
    }
    case 'gone': {
      if (!night && b.t > b.r() * 0.2 + 1.5) {
        // fly back in from the sky
        const [x, z] = groundSpot(b.r, P);
        b.st = 'down'; b.t = 0; b.dur = 3 + b.r() * 2;
        b.x0 = x - 20; b.y0 = 16; b.z0 = z - 22; b.x1 = x; b.z1 = z; b.y1 = groundY(x, z);
        b.x = b.x0; b.y = b.y0; b.z = b.z0;
      }
      return;
    }
  }
  if (b.st !== 'ground') {
    b.flap += b.rate * TAU * dt;
    const vx = (b.x - b.px) / dt, vy = (b.y - b.py) / dt, vz = (b.z - b.pz) / dt;
    const vh = Math.hypot(vx, vz);
    if (vh > 0.2) b.yaw = dampAngle(b.yaw, Math.atan2(vx, vz), 10, dt);
    b.pitch = damp(b.pitch, clamp(-Math.atan2(vy, Math.max(vh, 0.5)) * 0.7, -0.8, 0.6), 8, dt);
    b.roll = damp(b.roll, b.st === 'loop' ? -0.35 : 0, 4, dt);
  }
}

function crow(S: { perches: CPerch[]; crows: Crow[] }, c: Crow, dt: number, night: boolean, P: Vector3) {
  c.t += dt;
  const d3 = Math.hypot(c.x - P.x, c.y - P.y, c.z - P.z);
  const flyTo = (target: CPerch) => {
    c.st = 'fly'; c.t = 0; c.next = target;
    c.x0 = c.x; c.y0 = c.y; c.z0 = c.z; c.x1 = target.x; c.y1 = target.y; c.z1 = target.z;
    const d = Math.hypot(c.x1 - c.x0, c.z1 - c.z0);
    c.T = 1.2 + d * 0.09; c.H = 1.2 + d * 0.12 + Math.max(0, c.y1 - c.y0) * 0.3;
    c.yaw = Math.atan2(c.x1 - c.x0, c.z1 - c.z0);
    sfxAt('crow', c.x, c.z, 0.75);
  };
  const choose = () => {
    let best: CPerch | null = null, bs = -Infinity;
    for (const p of S.perches) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < 3 || d > 30) continue;
      if (S.crows.some((o) => o !== c && (o.perch === p || o.next === p))) continue;
      const s = Math.hypot(p.x - P.x, p.z - P.z) * 0.3 - Math.abs(d - 12) * 0.2 + c.r() * 3;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  };
  switch (c.st) {
    case 'perch': {
      c.hop = c.hopT < 0 ? Math.max(0, Math.sin((-c.hopT / 0.28) * Math.PI) * 0.12) : 0;
      c.hopT -= dt;
      if (c.hopT < -0.28) { c.hopT = 2 + c.r() * 6; c.hop = 0; }
      if (c.hopT < 0 && c.hopT + dt >= 0) c.yaw += (c.r() - 0.5) * 2.4; // hop-turn
      c.flap += dt * 30;
      // caw
      c.cawT -= dt;
      c.caw = Math.max(0, c.caw - dt);
      if (c.cawT <= 0) {
        c.cawT = 7 + c.r() * 16;
        if (d3 < 20) { sfxAt('crow', c.x, c.z, 0.6); c.caw = 0.5; }
      }
      c.pitch = c.caw > 0 ? -0.35 * Math.sin((c.caw / 0.5) * Math.PI * 3) ** 2 : 0;
      if (night) { c.st = 'sleep'; c.t = 0; break; }
      if (d3 < 3.3 || c.t > c.dur) {
        const t = choose();
        if (t) flyTo(t); else { c.t = 0; c.dur = 10; }
      }
      break;
    }
    case 'fly': {
      const k = clamp(c.t / c.T);
      c.x = lerp(c.x0, c.x1, k); c.z = lerp(c.z0, c.z1, k);
      c.y = lerp(c.y0, c.y1, k) + 4 * c.H * k * (1 - k);
      const vy = ((c.y1 - c.y0) + 4 * c.H * (1 - 2 * k)) / c.T;
      c.pitch = clamp(-vy * 0.12, -0.6, 0.5);
      c.flap += dt * TAU * (k > 0.4 && k < 0.8 ? 4 : 8);
      c.hop = 0;
      if (k >= 1) { c.st = 'perch'; c.t = 0; c.dur = 30 + c.r() * 50; c.perch = c.next!; c.next = null; c.x = c.x1; c.y = c.y1; c.z = c.z1; c.pitch = 0; }
      break;
    }
    case 'sleep': {
      c.hop = 0; c.pitch = 0.15;
      if (!night) { c.st = 'perch'; c.t = 0; c.dur = 10 + c.r() * 30; }
      break;
    }
  }
}
