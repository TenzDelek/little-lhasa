// Two cameras, toggled with C:
//   iso   — orthographic diorama camera (Gorshey angle) following the boy; Q / R rotate 90°, wheel zooms.
//           Its position snaps to the art-pixel grid so static pixels never shimmer while it glides.
//   chase — perspective third-person camera behind the boy; drag to orbit, wheel to change distance,
//           pulls in when a wall is in the way.
// Writes game.cam, U.viewDir and U.artPx every frame (priority -2: after the player, before render).
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { game } from '../core/game';
import { input } from '../core/input';
import { U } from '../core/uniforms';
import { collision } from '../core/collision';
import { clamp, damp, dampAngle } from '../core/math';
import { useGame } from '../game/store';
import { view } from './view';
import { debug } from '../game/debug';

const ELEVATION = (36 * Math.PI) / 180;
const VIEW_H = 15; // metres visible vertically at zoom 1 (iso)
const ZOOMS = [0.62, 0.78, 1, 1.25, 1.6];

const _right = new Vector3(), _up = new Vector3(), _p = new Vector3(), _fwd = new Vector3(), _goal = new Vector3();

export function CameraRig() {
  const set = useThree((s) => s.set);
  const mode = useGame((s) => s.camera);
  const cams = useMemo(() => {
    const iso = new OrthographicCamera(-1, 1, 1, -1, 0.5, 220);
    const chase = new PerspectiveCamera(52, 1, 0.1, 900);
    return { iso, chase };
  }, []);
  const st = useMemo(() => {
    const az = Math.PI / 4 + (debug.az ?? 0) * (Math.PI / 2);
    const zoomIdx = clamp(debug.zoom ?? 2, 0, ZOOMS.length - 1);
    game.cam.azimuth = az;
    return { targetAz: az, zoomIdx, zoom: ZOOMS[zoomIdx], chaseDist: 5.2, lastDrag: -10, dragAcc: 0, init: false };
  }, []);

  useEffect(() => {
    const cam = mode === 'iso' ? cams.iso : cams.chase;
    game.cam.mode = mode;
    if (mode === 'chase') {
      // start behind the boy
      game.cam.yaw = game.player.yaw + Math.PI;
      game.cam.pitch = 0.3;
    }
    set({ camera: cam });
  }, [mode, cams, set]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = game.player.pos;
    const aspect = view.lowW / view.lowH;

    // shared target: the boy's chest, eased, with a small lead in the walking direction
    _goal.set(p.x + game.player.vel.x * 0.18, p.y + 0.9, p.z + game.player.vel.z * 0.18);
    if (!st.init) { game.cam.target.copy(_goal); st.init = true; }
    game.cam.target.x = damp(game.cam.target.x, _goal.x, 6, dt);
    game.cam.target.y = damp(game.cam.target.y, _goal.y, 4, dt);
    game.cam.target.z = damp(game.cam.target.z, _goal.z, 6, dt);
    const t = game.cam.target;

    if (input.zoom !== 0) {
      if (game.cam.mode === 'iso') st.zoomIdx = clamp(st.zoomIdx - Math.sign(input.zoom), 0, ZOOMS.length - 1);
      else st.chaseDist = clamp(st.chaseDist + Math.sign(input.zoom) * 0.8, 2.6, 9);
      input.zoom = 0;
    }

    if (game.cam.mode === 'iso') {
      if (input.take('rotL')) st.targetAz -= Math.PI / 2;
      if (input.take('rotR')) st.targetAz += Math.PI / 2;
      // a horizontal drag also rotates in 90° steps
      if (Math.abs(input.look.dx) > 0) {
        st.dragAcc += input.look.dx;
        if (Math.abs(st.dragAcc) > 90) { st.targetAz -= Math.sign(st.dragAcc) * Math.PI / 2; st.dragAcc = 0; }
      }
      input.look.dx = 0; input.look.dy = 0;
      game.cam.azimuth = dampAngle(game.cam.azimuth, st.targetAz, 7, dt);
      const settled = Math.abs(game.cam.azimuth - st.targetAz) < 2e-3;
      if (settled) game.cam.azimuth = st.targetAz;
      st.zoom = damp(st.zoom, ZOOMS[st.zoomIdx], 8, dt);
      game.cam.zoom = st.zoom;

      const cam = cams.iso;
      const hView = VIEW_H / st.zoom;
      const wView = hView * aspect;
      cam.left = -wView / 2; cam.right = wView / 2; cam.top = hView / 2; cam.bottom = -hView / 2;
      const R = 80, ce = Math.cos(ELEVATION);
      const az = game.cam.azimuth;
      cam.position.set(t.x + R * ce * Math.sin(az), t.y + R * Math.sin(ELEVATION), t.z + R * ce * Math.cos(az));
      cam.lookAt(t);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // snap to the art-pixel grid in the camera plane (only once the rotation has settled)
      if (settled) {
        _right.setFromMatrixColumn(cam.matrixWorld, 0);
        _up.setFromMatrixColumn(cam.matrixWorld, 1);
        const worldPerPx = hView / view.lowH;
        _p.copy(cam.position);
        const sx = _p.dot(_right), sy = _p.dot(_up);
        _p.addScaledVector(_right, Math.round(sx / worldPerPx) * worldPerPx - sx);
        _p.addScaledVector(_up, Math.round(sy / worldPerPx) * worldPerPx - sy);
        cam.position.copy(_p);
        cam.updateMatrixWorld();
      }
      U.artPx.value = hView / view.lowH;
      cam.getWorldDirection(_fwd);
      U.viewDir.value.copy(_fwd);
      U.occlude.value = 1;
      U.occludeRadius.value = 2.4 / Math.sqrt(st.zoom);
      game.cam.position.copy(cam.position);
    } else {
      const cam = cams.chase;
      const dragging = input.look.dx !== 0 || input.look.dy !== 0;
      game.cam.yaw -= input.look.dx * 0.006;
      game.cam.pitch = clamp(game.cam.pitch + input.look.dy * 0.004, -0.15, 1.15);
      input.look.dx = 0; input.look.dy = 0;
      if (input.take('rotL')) game.cam.yaw -= Math.PI / 4;
      if (input.take('rotR')) game.cam.yaw += Math.PI / 4;
      if (dragging) st.lastDrag = game.time;
      // drift back behind the boy while he walks and nobody is steering the camera
      if (game.time - st.lastDrag > 1.6 && game.player.speed > 0.5) {
        game.cam.yaw = dampAngle(game.cam.yaw, game.player.yaw + Math.PI, 1.6 * Math.min(1, game.player.speed / 3), dt);
      }
      const yaw = game.cam.yaw, pitch = game.cam.pitch;
      const head = _p.set(t.x, t.y + 0.55, t.z);
      const d = st.chaseDist;
      const cx = head.x + Math.sin(yaw) * Math.cos(pitch) * d;
      const cy = head.y + Math.sin(pitch) * d;
      const cz = head.z + Math.cos(yaw) * Math.cos(pitch) * d;
      const f = collision.segment(head.x, head.y, head.z, cx, cy, cz, 0.25);
      const k = Math.max(0.18, f);
      cam.position.set(head.x + (cx - head.x) * k, head.y + (cy - head.y) * k, head.z + (cz - head.z) * k);
      cam.aspect = aspect;
      cam.lookAt(head);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      _fwd.subVectors(head, cam.position).normalize();
      U.viewDir.value.copy(_fwd);
      U.occlude.value = 1;
      U.occludeRadius.value = 1.1;
      U.artPx.value = 0.04;
      game.cam.position.copy(cam.position);
    }
  }, -2);

  return null;
}
