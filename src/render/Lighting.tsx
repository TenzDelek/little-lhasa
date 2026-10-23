// Sun / moon, sky fill, and the night lamp pool.
// Day: warm sun from the south-east over a pale sky fill (Gorshey's day mode).
// Night: slate moonlight with a blue cast, a dim hemisphere, and up to POOL real point lights that hop to
// the registered lamps nearest the camera target, so streets glow warm wherever the boy walks.
// Eases U.night toward the store's day/night toggle.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AmbientLight, Color, DirectionalLight, HemisphereLight, PointLight, Vector3 } from 'three';
import { game } from '../core/game';
import { lamps, type Lamp } from '../core/lamps';
import { U } from '../core/uniforms';
import { clamp, lerp } from '../core/math';
import { G } from '../game/store';

const POOL = 10;
const MODES = {
  day: { hemiSky: 0xc9d8ee, hemiGround: 0x6a6650, hemi: 1.35, sun: 0xfff0d6, sunI: 2.9, sunDir: [0.45, 1, 0.62], amb: 0xffffff, ambI: 0.12 },
  night: { hemiSky: 0x3a4256, hemiGround: 0x15181e, hemi: 0.5, sun: 0xa2aed0, sunI: 0.6, sunDir: [-0.5, 1, 0.35], amb: 0x2a2f3c, ambI: 0.22 },
} as const;
const SHADOW_HALF = 22;
const SHADOW_RES = 2048;

const _a = new Color(), _b = new Color(), _d = new Vector3(), _dn = new Vector3();

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
    return { hemi, amb, sun, pool, assigned: new Array<Lamp | null>(POOL).fill(null), nextAssign: 0, night: 0 };
  }, []);

  useEffect(() => {
    scene.add(L.hemi, L.amb, L.sun, L.sun.target, ...L.pool);
    return () => { scene.remove(L.hemi, L.amb, L.sun, L.sun.target, ...L.pool); };
  }, [scene, L]);

  useFrame((_, rawDt) => {
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

    // sun follows the camera target; snap to shadow texels so shadows don't crawl
    _d.set(lerp(D.sunDir[0], N.sunDir[0], n), lerp(D.sunDir[1], N.sunDir[1], n), lerp(D.sunDir[2], N.sunDir[2], n)).normalize();
    const t = game.cam.target;
    const texel = (SHADOW_HALF * 2) / SHADOW_RES;
    const tx = Math.round(t.x / texel) * texel, tz = Math.round(t.z / texel) * texel, ty = Math.round(t.y / texel) * texel;
    L.sun.target.position.set(tx, ty, tz);
    L.sun.position.set(tx + _d.x * 60, ty + _d.y * 60, tz + _d.z * 60);
    L.sun.target.updateMatrixWorld();

    // lamp pool: every 0.25 s pick the lamps nearest the camera target
    L.nextAssign -= dt;
    if (L.nextAssign <= 0) {
      L.nextAssign = 0.25;
      const list = [...lamps.all()];
      list.sort((a, b) => ((a.x - t.x) ** 2 + (a.z - t.z) ** 2) - ((b.x - t.x) ** 2 + (b.z - t.z) ** 2));
      for (let i = 0; i < POOL; i++) L.assigned[i] = list[i] ?? null;
    }
    for (let i = 0; i < POOL; i++) {
      const lamp = L.assigned[i], light = L.pool[i];
      if (!lamp) { light.intensity = 0; continue; }
      const on = lamp.day ? 1 : n;
      const fl = lamp.flicker ? 1 - lamp.flicker * (0.5 + 0.5 * Math.sin(game.time * 17 + i * 3.1) * Math.sin(game.time * 7.3 + i)) : 1;
      light.position.set(lamp.x, lamp.y, lamp.z);
      light.color.setHex(lamp.color);
      light.intensity = lamp.intensity * on * fl;
      light.distance = lamp.distance;
      _dn.set(lamp.x - t.x, 0, lamp.z - t.z);
    }
  }, -1);

  return null;
}
