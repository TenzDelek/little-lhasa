// Two cameras, toggled with C:
//   iso   — orthographic diorama camera (Gorshey angle) following the boy; Q / R rotate 90°, wheel zooms.
//           Its position snaps to the art-pixel grid so static pixels never shimmer; the part of a pixel the
//           snap removed goes to view.subX / subY, and the post pass slides the picture by it in whole device
//           pixels, so the town glides under the boy instead of stepping an art pixel at a time.
//           Rotation and zoom are fixed-length eases: they land exactly, with no long sub-pixel creep at the
//           end (that tail is what made the whole picture swim after every turn).
//   chase — perspective third-person camera behind the boy; drag to orbit, wheel to change distance,
//           pulls in when a wall is in the way (instantly) and eases back out (slowly). Thin things — tree
//           trunks, lamp posts, poles — don't pull it in (it used to end up a metre behind the boy's head
//           whenever a tree stood behind him); it passes them and they dissolve near the lens instead.
//           Backed right up against something (the bus, a house wall) there is no room behind him, so the
//           camera climbs over his head and looks down past him instead of sinking into the wall.
//           While he walks it settles behind him at a default pitch — a little flatter on the viewpoint
//           or looking north, so the Dhauladhar snow isn't a thin band along the top of the screen.
// New game snaps it back to the spawn (no glide across town under the title).
// Writes game.cam, U.viewDir, U.artPx and U.nearCut every frame (priority -2: after the player, before render).
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { game } from '../core/game';
import { input } from '../core/input';
import { U } from '../core/uniforms';
import { collision, type Collider } from '../core/collision';
import { groundY } from '../world/terrain';
import { PLAZAS } from '../world/layout';
import { angleDelta, clamp, damp, dampAngle, smooth } from '../core/math';
import { G, onReset, useGame } from '../game/store';
import { view } from './view';
import { debug } from '../game/debug';

const ELEVATION = (36 * Math.PI) / 180;
const VIEW_H = 15; // metres visible vertically at zoom 1 (iso)
const FIT_W = 13;  // …but at least this many metres across, so portrait phones still see the street
const ZOOMS = [0.62, 0.78, 1, 1.25, 1.6];
/** Seconds for a 90° iso turn and for one zoom step. */
const TURN_T = 0.5, ZOOM_T = 0.28;
const CHASE_FOV = 52;
/** Chase pitch the camera settles to while he walks, and the flatter one where the snow range is the view. */
const CHASE_PITCH = 0.3, VIEW_PITCH = 0.2;
const VIEWPOINT = PLAZAS.find((p) => p.id === 'viewpoint')?.rect ?? [0, 0, 0, 0];
/** Pressed against a wall: the camera rises toward this pitch, this far from his head. */
const LIFT_PITCH = 1.45, LIFT_DIST = 1.15, MIN_DIST = 0.35;

function chasePitchFor(x: number, z: number, camYaw: number) {
  const [x0, z0, x1, z1] = VIEWPOINT;
  const onViewpoint = x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1;
  // the camera sits at (sin yaw, cos yaw) from his head, so it looks north (-z) when yaw ≈ 0
  return onViewpoint || Math.abs(angleDelta(0, camYaw)) < 0.8 ? VIEW_PITCH : CHASE_PITCH;
}

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const mod4 = (n: number) => ((n % 4) + 4) % 4;

const _right = new Vector3(), _up = new Vector3(), _p = new Vector3(), _fwd = new Vector3(), _goal = new Vector3();
const _cq: Collider[] = [];
const _look = new Vector3();

/** Horizontal distance from (x, z) to a collider's footprint (0 inside), or Infinity for the thin ones —
 *  trunks, posts, poles — that the chase camera passes: occludable surfaces dissolve near the lens and along
 *  the line to the boy, so passing them reads better than snapping onto his head. */
function solidDist(c: Collider, x: number, z: number): number {
  if (c.kind === 'circle') return c.r < 0.5 ? Infinity : Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r);
  if (c.w < 0.5 && c.d < 0.5) return Infinity;
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot), dx = x - c.x, dz = z - c.z;
  const lx = Math.abs(dx * cs - dz * sn) - c.w / 2, lz = Math.abs(dx * sn + dz * cs) - c.d / 2;
  return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
}

/** Fraction (0..1) of the segment a→b the chase camera can travel before the ground or a solid collider gets
 *  within `pad`, sampled every `step` metres. */
function cameraSegment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, pad: number, step = 0.25): number {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / step) + 1;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < groundY(x, z) + pad) return (s - 1) / steps;
    for (const c of collision.query(x, z, pad, _cq)) {
      if (y < c.y0 - pad || y > c.y1 + pad) continue;
      if (solidDist(c, x, z) < pad) return (s - 1) / steps;
    }
  }
  return 1;
}

/** Underside of the lowest solid right over (x, z) that comes down to within `pad` of height y but stays
 *  clear of the boy (a stall awning, a low eave); Infinity when there is none. */
function roofOver(x: number, y: number, z: number, feetY: number, pad: number): number {
  let roof = Infinity;
  for (const c of collision.query(x, z, pad, _cq)) {
    if (c.y0 < feetY + 1.0 || c.y0 > y + pad || c.y1 < y - pad) continue;
    if (solidDist(c, x, z) < pad) roof = Math.min(roof, c.y0);
  }
  return roof;
}

/** Chase camera straight behind the boy at the default pitch, nothing pulled in. */
function behindBoy(st: { chaseK: number; close: number; lift: number; drop: number }) {
  const pl = game.player;
  game.cam.yaw = pl.yaw + Math.PI;
  game.cam.pitch = chasePitchFor(pl.pos.x, pl.pos.z, game.cam.yaw);
  st.chaseK = 1; st.close = 0; st.lift = 0; st.drop = 0;
}

/** A fixed-length ease from `from` to `to`; `t` runs 0 → 1. */
interface Tween { from: number; to: number; t: number; dur: number; ease: (k: number) => number }
const tweenTo = (tw: Tween, cur: number, to: number, dur: number) => {
  // already moving: ease out of the current motion; at rest: ease in and out
  tw.ease = tw.t < 1 ? easeOut : easeInOut;
  tw.from = cur; tw.to = to; tw.t = 0; tw.dur = dur;
};
const tweenStep = (tw: Tween, dt: number) => {
  if (tw.t >= 1) return tw.to;
  tw.t = Math.min(1, tw.t + dt / tw.dur);
  return tw.from + (tw.to - tw.from) * tw.ease(tw.t);
};

export function CameraRig() {
  const set = useThree((s) => s.set);
  const mode = useGame((s) => s.camera);
  const cams = useMemo(() => {
    const iso = new OrthographicCamera(-1, 1, 1, -1, 0.5, 220);
    const chase = new PerspectiveCamera(CHASE_FOV, 1, 0.1, 900);
    return { iso, chase };
  }, []);
  const st = useMemo(() => {
    const az = Math.PI / 4 + (debug.az ?? 0) * (Math.PI / 2);
    const zoomIdx = clamp(debug.zoom ?? 2, 0, ZOOMS.length - 1);
    game.cam.azimuth = az;
    return {
      targetAz: az, zoomIdx, chaseDist: 5.2, chaseK: 1, close: 0, lift: 0, drop: 0, lastDrag: -10, dragAcc: 0, init: false, title: false,
      turn: { from: az, to: az, t: 1, dur: TURN_T, ease: easeInOut } as Tween,
      zoom: { from: ZOOMS[zoomIdx], to: ZOOMS[zoomIdx], t: 1, dur: ZOOM_T, ease: easeOut } as Tween,
    };
  }, []);

  useEffect(() => {
    const cam = mode === 'iso' ? cams.iso : cams.chase;
    game.cam.mode = mode;
    if (mode === 'chase') behindBoy(st);
    set({ camera: cam });
  }, [mode, cams, set, st]);

  // New game puts Tenzin back on the square: jump there with him on the next frame (after newGame() has
  // moved him) rather than gliding across town under the fading-in title
  useEffect(() => onReset(() => { st.init = false; }), [st]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = game.player.pos;
    // the camera frames lowW × lowH art pixels; the render target adds a margin on every side
    const aspect = view.lowW / view.lowH;
    const rtAspect = view.rtW / view.rtH;

    // shared target: the boy's chest, eased, with a small lead in the walking direction
    _goal.set(p.x + game.player.vel.x * 0.18, p.y + 0.9, p.z + game.player.vel.z * 0.18);
    if (!st.init) {
      game.cam.target.copy(_goal); st.init = true;
      if (game.cam.mode === 'chase') behindBoy(st);
    }
    game.cam.target.x = damp(game.cam.target.x, _goal.x, 6, dt);
    game.cam.target.y = damp(game.cam.target.y, _goal.y, 4, dt);
    game.cam.target.z = damp(game.cam.target.z, _goal.z, 6, dt);
    const t = game.cam.target;

    if (input.zoom !== 0) {
      if (game.cam.mode === 'iso') {
        const next = clamp(st.zoomIdx - Math.sign(input.zoom), 0, ZOOMS.length - 1);
        if (next !== st.zoomIdx) { st.zoomIdx = next; tweenTo(st.zoom, game.cam.zoom, ZOOMS[next], ZOOM_T); }
      } else st.chaseDist = clamp(st.chaseDist + Math.sign(input.zoom) * 0.8, 2.6, 9);
      input.zoom = 0;
    }

    if (game.cam.mode === 'iso') {
      let turned = 0;
      if (input.take('rotL')) turned -= 1;
      if (input.take('rotR')) turned += 1;
      // a horizontal drag also rotates in 90° steps
      if (Math.abs(input.look.dx) > 0) {
        st.dragAcc += input.look.dx;
        if (Math.abs(st.dragAcc) > 90) { turned -= Math.sign(st.dragAcc); st.dragAcc = 0; }
      }
      input.look.dx = 0; input.look.dy = 0;
      // title screen: a slow turntable drift; on start, ease to the nearest diorama angle
      if (!G().started && !debug.shot) {
        st.targetAz += dt * 0.08; st.turn.t = 1; st.turn.to = st.targetAz; st.title = true;
      } else if (st.title) {
        st.title = false;
        st.targetAz = Math.PI / 4 + Math.round((st.targetAz - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2);
        tweenTo(st.turn, game.cam.azimuth, st.targetAz, 0.9);
      }
      if (turned) {
        // azimuths are unwrapped, so the tween always turns the way the key says; a second press mid-turn
        // carries on from where the camera is, a little longer for the longer way
        st.targetAz += turned * (Math.PI / 2);
        const span = Math.abs(st.targetAz - game.cam.azimuth) / (Math.PI / 2);
        tweenTo(st.turn, game.cam.azimuth, st.targetAz, TURN_T * clamp(span, 0.6, 1.5));
      }
      game.cam.azimuth = tweenStep(st.turn, dt);
      // the title turntable keeps turning: no snapping (and no world-locked dither) while it does
      const settled = st.turn.t >= 1 && st.zoom.t >= 1 && !st.title;
      game.cam.zoom = tweenStep(st.zoom, dt);
      const zoom = game.cam.zoom;

      const cam = cams.iso;
      // world metres per art pixel: the visible lowH rows span the view height
      const hVis = Math.max(VIEW_H, FIT_W / aspect) / zoom;
      const wpp = hVis / view.lowH;
      const hView = view.rtH * wpp, wView = view.rtW * wpp;
      cam.left = -wView / 2; cam.right = wView / 2; cam.top = hView / 2; cam.bottom = -hView / 2;
      const R = 80, ce = Math.cos(ELEVATION);
      const az = game.cam.azimuth;
      cam.position.set(t.x + R * ce * Math.sin(az), t.y + R * Math.sin(ELEVATION), t.z + R * ce * Math.cos(az));
      cam.lookAt(t);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      // snap to the art-pixel grid in the camera plane (only once rotation and zoom have landed); the post
      // pass slides the picture back by what the snap removed
      view.subX = 0; view.subY = 0; view.gridX = 0; view.gridY = 0;
      if (settled) {
        _right.setFromMatrixColumn(cam.matrixWorld, 0);
        _up.setFromMatrixColumn(cam.matrixWorld, 1);
        _p.copy(cam.position);
        const sx = _p.dot(_right) / wpp, sy = _p.dot(_up) / wpp;
        const gx = Math.round(sx), gy = Math.round(sy);
        _p.addScaledVector(_right, (gx - sx) * wpp);
        _p.addScaledVector(_up, (gy - sy) * wpp);
        cam.position.copy(_p);
        cam.updateMatrixWorld();
        view.subX = gx - sx; view.subY = gy - sy;
        view.gridX = mod4(gx); view.gridY = mod4(gy);
      }
      U.artPx.value = wpp;
      cam.getWorldDirection(_fwd);
      U.viewDir.value.copy(_fwd);
      U.occlude.value = 1;
      U.occludeRadius.value = 2.4 / Math.sqrt(zoom);
      U.nearCut.value = 0;
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
      // drift back behind the boy, and to the default pitch, while he walks and nobody is steering the camera
      if (game.time - st.lastDrag > 1.6 && game.player.speed > 0.5) {
        const walk = Math.min(1, game.player.speed / 3);
        game.cam.yaw = dampAngle(game.cam.yaw, game.player.yaw + Math.PI, 1.6 * walk, dt);
        game.cam.pitch = damp(game.cam.pitch, chasePitchFor(p.x, p.z, game.cam.yaw), 1.2 * walk, dt);
      }
      const yaw = game.cam.yaw, pitch = game.cam.pitch;
      const sy = Math.sin(yaw), cy = Math.cos(yaw);
      const head = _p.set(t.x, t.y + 0.55, t.z);
      // under a stall awning or a low eave the pivot itself would sit inside it (and every test below would
      // fail at once): keep it just under the underside — at once going in, easing back coming out
      const roof = roofOver(head.x, head.y, head.z, p.y, 0.15);
      const drop = roof < Infinity ? Math.max(0, head.y - (roof - 0.15)) : 0;
      st.drop = drop > st.drop ? drop : damp(st.drop, drop, 4, dt);
      head.y -= st.drop;
      const d = st.chaseDist;
      // walls pull the camera in at once; when they clear it eases back out, so passing a pole or a doorway
      // doesn't make the view jump in and out
      const f = cameraSegment(head.x, head.y, head.z,
        head.x + sy * Math.cos(pitch) * d, head.y + Math.sin(pitch) * d, head.z + cy * Math.cos(pitch) * d, 0.25);
      st.chaseK = f < st.chaseK ? f : damp(st.chaseK, f, 2.5, dt);
      const reach = st.chaseK * d;
      // no room behind him (his back to the bus or a wall): instead of sinking into the wall — or into his
      // hair — the camera climbs over his head toward LIFT_PITCH and looks down past him
      const liftGoal = clamp((1.4 - reach) / 1.1, 0, 1);
      st.lift = damp(st.lift, liftGoal, liftGoal > st.lift ? 12 : 3, dt);
      const lift = smooth(0, 1, st.lift);
      let pe = pitch, r = reach;
      if (lift > 0.001) {
        pe = pitch + (Math.max(pitch, LIFT_PITCH) - pitch) * lift;
        const want = Math.max(reach, LIFT_DIST), ce = Math.cos(pe), se = Math.sin(pe);
        r = want * cameraSegment(head.x, head.y, head.z, head.x + sy * ce * want, head.y + se * want, head.z + cy * ce * want, 0.12, 0.1);
        if (r < MIN_DIST) {
          // an awning or a roof just over him as well: take whichever way has more room, flat or lifted
          const cf = Math.cos(pitch), sf = Math.sin(pitch);
          const r0 = want * cameraSegment(head.x, head.y, head.z, head.x + sy * cf * want, head.y + sf * want, head.z + cy * cf * want, 0.12, 0.1);
          if (r0 > r) { r = r0; pe = pitch; }
        }
        r = Math.max(r, 0.12);
      }
      const ce = Math.cos(pe) * r;
      cam.position.set(head.x + sy * ce, head.y + Math.sin(pe) * r, head.z + cy * ce);
      cam.aspect = rtAspect;
      // pulled in close (a wall or a big trunk behind him): look a little over and past the boy, so his head
      // doesn't fill the screen and you can still see where he is going; lifted over him, look down just
      // past him so he stays at the bottom of the frame
      st.close = damp(st.close, clamp((0.6 - st.chaseK) / 0.42, 0, 1), 5, dt);
      const over = st.close * (1 - lift);
      const ahead = over * 1.4 + lift * 0.5 * Math.min(1, r / LIFT_DIST), up = over * 0.45 - lift * 0.1;
      _look.set(head.x - sy * ahead, head.y + up, head.z - cy * ahead);
      cam.lookAt(_look);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      view.subX = 0; view.subY = 0; view.gridX = 0; view.gridY = 0;
      _fwd.subVectors(head, cam.position).normalize();
      U.viewDir.value.copy(_fwd);
      U.occlude.value = 1;
      U.occludeRadius.value = 1.1;
      U.nearCut.value = 1;
      U.artPx.value = 0.04;
      game.cam.position.copy(cam.position);
    }
  }, -2);

  return null;
}
