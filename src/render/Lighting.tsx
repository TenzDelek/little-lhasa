// Sun / moon, sky fill, and the night lamp pool.
// Day: warm sun from the south-east over a pale sky fill (Gorshey's day mode).
// Night: slate moonlight with a blue cast, a dim hemisphere, and up to POOL real point lights that hop to
// the registered lamps nearest the view, so streets glow warm wherever the boy walks. A lamp joining or
// leaving the pool fades over a quarter second instead of popping. The pool size never changes: the light
// count is baked into every shader, so changing it would recompile the whole town.
// Shadows: in the iso view the sun's shadow frustum is fitted to what the camera can actually see (the view
// box between a little below and well above the boy), so the shadow pass draws less and still covers the
// whole screen at every zoom and on tall portrait phones; the chase camera keeps a square around the boy.
// Eases U.night toward the store's day/night toggle.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AmbientLight, Color, DirectionalLight, HemisphereLight, PointLight, Vector3, type OrthographicCamera } from 'three';
import { game } from '../core/game';
import { lamps, type Lamp } from '../core/lamps';
import { U } from '../core/uniforms';
import { clamp, lerp } from '../core/math';
import { G } from '../game/store';
import { groundY } from '../world/terrain';
import { lightRig } from './state';

const POOL = 10;
/** Global boost for lamp pools: physical decay-2 lights need more punch to read as pools in the pixel pass. */
const LAMP_GAIN = 2.6;
/** Lamp fade in / out speed (1/s). */
const LAMP_FADE = 4;
const MODES = {
  day: { hemiSky: 0xc9d8ee, hemiGround: 0x6a6650, hemi: 1.35, sun: 0xfff0d6, sunI: 2.9, sunDir: [0.45, 1, 0.62], amb: 0xffffff, ambI: 0.12 },
  night: { hemiSky: 0x3a4256, hemiGround: 0x15181e, hemi: 0.5, sun: 0xa2aed0, sunI: 0.6, sunDir: [-0.5, 1, 0.35], amb: 0x2a2f3c, ambI: 0.22 },
} as const;
/** Half-size (m) of the square shadow frustum for the chase camera (and the iso fit's upper limit). */
const SHADOW_HALF = 22;
const SHADOW_RES = 2048;
/** Receivers the iso view can show: from just under the lowest ground in view up to this far above the
 *  highest (m) — rooftops, temple roofs, the deodar crowns. */
const RECV_ABOVE = 12;

interface Slot { lamp: Lamp | null; level: number; leaving: boolean }

const _a = new Color(), _b = new Color(), _d = new Vector3(), _r = new Vector3(), _u = new Vector3(), _s = new Vector3();
const _cr = new Vector3(), _cu = new Vector3(), _cf = new Vector3(), _o = new Vector3();
const UP = new Vector3(0, 1, 0);

export function Lighting() {
  const scene = useThree((s) => s.scene);
  const L = useMemo(() => {
    const hemi = new HemisphereLight(0xffffff, 0x444444, 1);
    const amb = new AmbientLight(0xffffff, 0.1);
    const sun = new DirectionalLight(0xffffff, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
    const sc = sun.shadow.camera;
    sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
    sc.near = 1; sc.far = 140;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    const pool = Array.from({ length: POOL }, () => {
      const l = new PointLight(0xffc070, 0, 8, 2);
      l.castShadow = false;
      return l;
    });
    const slots: Slot[] = Array.from({ length: POOL }, () => ({ lamp: null, level: 0, leaving: false }));
    return { hemi, amb, sun, pool, slots, nextAssign: 0, night: 0, hx: SHADOW_HALF, hy: SHADOW_HALF };
  }, []);

  useEffect(() => {
    scene.add(L.hemi, L.amb, L.sun, L.sun.target, ...L.pool);
    lightRig.sun = L.sun;
    return () => { scene.remove(L.hemi, L.amb, L.sun, L.sun.target, ...L.pool); if (lightRig.sun === L.sun) lightRig.sun = null; };
  }, [scene, L]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const goal = G().night ? 1 : 0;
    L.night = clamp(L.night + Math.sign(goal - L.night) * dt * 0.9, 0, 1);
    if (Math.abs(goal - L.night) < 1e-3) L.night = goal;
    const n = L.night * L.night * (3 - 2 * L.night);
    U.night.value = n;

    const D = MODES.day, N = MODES.night;
    L.hemi.color.copy(_a.setHex(D.hemiSky)).lerp(_b.setHex(N.hemiSky), n);
    L.hemi.groundColor.copy(_a.setHex(D.hemiGround)).lerp(_b.setHex(N.hemiGround), n);
    L.hemi.intensity = lerp(D.hemi, N.hemi, n);
    L.amb.color.copy(_a.setHex(D.amb)).lerp(_b.setHex(N.amb), n);
    L.amb.intensity = lerp(D.ambI, N.ambI, n);
    L.sun.color.copy(_a.setHex(D.sun)).lerp(_b.setHex(N.sun), n);
    L.sun.intensity = lerp(D.sunI, N.sunI, n);

    // shadow frustum in light space (x = _r, y = _u, depth along _d)
    _d.set(lerp(D.sunDir[0], N.sunDir[0], n), lerp(D.sunDir[1], N.sunDir[1], n), lerp(D.sunDir[2], N.sunDir[2], n)).normalize();
    _r.crossVectors(UP, _d).normalize();
    _u.crossVectors(_d, _r);
    const t = game.cam.target;
    let hx = SHADOW_HALF, hy = SHADOW_HALF, cr = t.dot(_r), cu = t.dot(_u);
    const cam = state.camera as OrthographicCamera;
    if (cam.isOrthographicCamera) {
      // fit the iso view: its four edge rays cut by planes just under the lowest ground in view and well above
      // the highest, bounded in light space
      _cr.setFromMatrixColumn(cam.matrixWorld, 0);
      _cu.setFromMatrixColumn(cam.matrixWorld, 1);
      cam.getWorldDirection(_cf);
      const fy = Math.min(-1e-3, _cf.y);
      let gLo = game.player.pos.y, gHi = gLo;
      for (let i = 0; i < 9; i++) {
        // corners, edge midpoints and centre of the view, where they cross the boy's height
        const a = (i % 3) - 1, b = Math.floor(i / 3) - 1;
        _o.copy(cam.position).addScaledVector(_cr, a * cam.right).addScaledVector(_cu, b * cam.top);
        const k = (t.y - _o.y) / fy;
        const g = groundY(_o.x + _cf.x * k, _o.z + _cf.z * k);
        gLo = Math.min(gLo, g); gHi = Math.max(gHi, g);
      }
      const yLo = Math.max(t.y - 16, gLo - 1), yHi = gHi + RECV_ABOVE;
      let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
      for (let i = 0; i < 4; i++) {
        _o.copy(cam.position)
          .addScaledVector(_cr, i & 1 ? cam.right : cam.left)
          .addScaledVector(_cu, i & 2 ? cam.top : cam.bottom);
        for (let j = 0; j < 2; j++) {
          const y = j ? yHi : yLo;
          const k = (y - _o.y) / fy;
          const px = _o.x + _cf.x * k, py = y, pz = _o.z + _cf.z * k;
          const pr = px * _r.x + py * _r.y + pz * _r.z, pu = px * _u.x + py * _u.y + pz * _u.z;
          r0 = Math.min(r0, pr); r1 = Math.max(r1, pr); u0 = Math.min(u0, pu); u1 = Math.max(u1, pu);
        }
      }
      // whole metres (+ room for the PCF kernel), so the frustum only changes size while zooming / turning
      hx = Math.min(SHADOW_HALF * 1.6, Math.ceil((r1 - r0) / 2 + 1));
      hy = Math.min(SHADOW_HALF * 1.6, Math.ceil((u1 - u0) / 2 + 1));
      cr = (r0 + r1) / 2; cu = (u0 + u1) / 2;
    }
    const sc = L.sun.shadow.camera;
    if (hx !== L.hx || hy !== L.hy) {
      L.hx = hx; L.hy = hy;
      sc.left = -hx; sc.right = hx; sc.top = hy; sc.bottom = -hy;
      sc.updateProjectionMatrix();
    }
    // snapped to whole shadow texels in light space so shadows don't crawl while the camera glides
    const tx = (hx * 2) / SHADOW_RES, ty = (hy * 2) / SHADOW_RES;
    const sx = Math.round(cr / tx) * tx, sy = Math.round(cu / ty) * ty, sz = t.dot(_d);
    _s.copy(_r).multiplyScalar(sx).addScaledVector(_u, sy).addScaledVector(_d, sz);
    L.sun.target.position.copy(_s);
    L.sun.position.copy(_s).addScaledVector(_d, 60);
    L.sun.target.updateMatrixWorld();

    // lamp pool: every 0.25 s find the lamps nearest the view centre (the chase camera looks ahead of the boy)
    let vx = t.x, vz = t.z;
    if (game.cam.mode === 'chase') {
      const fx = t.x - game.cam.position.x, fz = t.z - game.cam.position.z, fl = Math.hypot(fx, fz) || 1;
      vx += (fx / fl) * 7; vz += (fz / fl) * 7;
    }
    L.nextAssign -= dt;
    if (L.nextAssign <= 0) {
      L.nextAssign = 0.25;
      const list = [...lamps.all()];
      list.sort((a, b) => ((a.x - vx) ** 2 + (a.z - vz) ** 2) - ((b.x - vx) ** 2 + (b.z - vz) ** 2));
      const wanted = new Set(list.slice(0, POOL));
      // lamps that dropped out of the nearest set fade out; newcomers take free slots and fade in
      for (const s of L.slots) if (s.lamp && !wanted.has(s.lamp)) s.leaving = true;
      for (const s of L.slots) if (s.lamp) wanted.delete(s.lamp);
      for (const lamp of wanted) {
        const free = L.slots.find((s) => !s.lamp);
        if (!free) break;
        free.lamp = lamp; free.level = 0; free.leaving = false;
      }
    }
    for (let i = 0; i < POOL; i++) {
      const s = L.slots[i], light = L.pool[i], lamp = s.lamp;
      s.level = clamp(s.level + (s.lamp && !s.leaving ? 1 : -1) * dt * LAMP_FADE, 0, 1);
      if (!lamp) { light.intensity = 0; continue; }
      if (s.leaving && s.level <= 0) { s.lamp = null; s.leaving = false; light.intensity = 0; continue; }
      const on = lamp.day ? 1 : n;
      const fl = lamp.flicker ? 1 - lamp.flicker * (0.5 + 0.5 * Math.sin(game.time * 17 + i * 3.1) * Math.sin(game.time * 7.3 + i)) : 1;
      light.position.set(lamp.x, lamp.y, lamp.z);
      light.color.setHex(lamp.color);
      light.intensity = lamp.intensity * on * fl * LAMP_GAIN * s.level;
      light.distance = lamp.distance;
    }
  }, -1);

  return null;
}
