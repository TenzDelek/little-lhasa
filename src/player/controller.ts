// Tenzin's movement: camera-relative walking / running, jumping with coyote time and a jump buffer, collision
// against the town (step up kerbs and stairs ≤ 0.42 m, stand on walls / benches / roofs, bump heads), kept
// inside the diorama rim. Pure logic on game.player — no rendering.
import { game } from '../core/game';
import { input } from '../core/input';
import { collision } from '../core/collision';
import { clamp, damp, dampAngle } from '../core/math';
import { groundY, walkable } from '../world/terrain';
import { sfx } from '../audio/sfx';

export const PLAYER = {
  radius: 0.24,
  height: 1.25,
  stepUp: 0.42,
  walk: 2.3,
  run: 4.5,
  jumpV: 6.6,
  gravity: 23,
  coyote: 0.12,
  buffer: 0.14,
};

const st = { coyote: 0, jumpBuf: 0, fallV: 0 };
const _prev = { x: 0, z: 0 };
const _sq = { x: 0, z: 0 };

/** Advance the player by dt. `frozen` stops input (dialogue). Returns the actual horizontal speed. */
export function stepPlayer(dt: number, frozen: boolean): number {
  const p = game.player;
  const pos = p.pos, vel = p.vel;
  const x0 = pos.x, z0 = pos.z;

  // camera-relative wish direction
  const mv = frozen || p.frozen ? { x: 0, y: 0 } : input.move();
  let fx: number, fz: number;
  if (game.cam.mode === 'iso') { fx = -Math.sin(game.cam.azimuth); fz = -Math.cos(game.cam.azimuth); }
  else { fx = -Math.sin(game.cam.yaw); fz = -Math.cos(game.cam.yaw); }
  const rx = -fz, rz = fx; // right of the camera's forward
  const wx = rx * mv.x + fx * mv.y, wz = rz * mv.x + fz * mv.y;
  const wl = Math.hypot(wx, wz);
  const target = (input.run() ? PLAYER.run : PLAYER.walk) * Math.min(1, wl);
  const dirx = wl > 1e-3 ? wx / wl : 0, dirz = wl > 1e-3 ? wz / wl : 0;
  const accel = p.grounded ? 14 : 4.5;
  vel.x = damp(vel.x, dirx * target, accel, dt);
  vel.z = damp(vel.z, dirz * target, accel, dt);
  if (wl > 0.1) p.yaw = dampAngle(p.yaw, Math.atan2(dirx, dirz), p.grounded ? 14 : 8, dt);

  // jump
  st.coyote = p.grounded ? PLAYER.coyote : st.coyote - dt;
  if (!frozen && input.take('jump')) st.jumpBuf = PLAYER.buffer; else st.jumpBuf -= dt;
  if (st.jumpBuf > 0 && st.coyote > 0 && !p.action) {
    vel.y = PLAYER.jumpV * (input.run() ? 1.05 : 1);
    p.grounded = false; st.coyote = 0; st.jumpBuf = 0;
    sfx('jump');
  }
  vel.y -= PLAYER.gravity * dt;
  vel.y = Math.max(vel.y, -30);

  // integrate in sub-steps so fast runs don't tunnel through thin walls
  const n = Math.max(1, Math.ceil((Math.hypot(vel.x, vel.z) * dt) / 0.12));
  const h = dt / n;
  const wasGrounded = p.grounded;
  for (let i = 0; i < n; i++) {
    _prev.x = pos.x; _prev.z = pos.z;
    pos.x += vel.x * h; pos.z += vel.z * h;
    collision.resolve(pos, PLAYER.radius, pos.y, PLAYER.height, PLAYER.stepUp);
    // squeezed (a gap narrower than the boy, an acute corner, an NPC shoving him into a wall): the pushes
    // cancel and he would end inside a wall — undo this sub-step's move if that leaves him better off
    const pen = collision.penetration(pos, PLAYER.radius, pos.y, PLAYER.height, PLAYER.stepUp);
    if (pen > 0.03) {
      const cx = pos.x, cz = pos.z;
      pos.x = _prev.x; pos.z = _prev.z;
      if (collision.penetration(pos, PLAYER.radius, pos.y, PLAYER.height, PLAYER.stepUp) >= pen) { pos.x = cx; pos.z = cz; }
    }
    if (!walkable(pos.x, pos.z)) {
      // slide along the rim: try each axis alone
      if (walkable(pos.x, _prev.z)) pos.z = _prev.z;
      else if (walkable(_prev.x, pos.z)) pos.x = _prev.x;
      else { pos.x = _prev.x; pos.z = _prev.z; }
    }
    // vertical
    let support = collision.supportY(pos.x, pos.z, PLAYER.radius * 0.8, pos.y, PLAYER.stepUp);
    let ny = pos.y + vel.y * h;
    if (vel.y > 0) {
      const ceil = collision.ceilingY(pos.x, pos.z, PLAYER.radius * 0.8, pos.y + PLAYER.height - 0.05);
      if (ny + PLAYER.height > ceil) { ny = ceil - PLAYER.height; vel.y = 0; }
    }
    if (wasGrounded && vel.y <= 0 && support < pos.y && pos.y - support < 0.5) ny = support; // stick to slopes / step down
    if (ny < pos.y) {
      // sinking past a ledge into a gap too narrow to stand in: land on the ledge's edge instead of wedging
      const top = collision.squeezeTop(pos.x, pos.z, PLAYER.radius, pos.y, ny, PLAYER.height, PLAYER.stepUp, _sq);
      if (top > ny) { ny = top; support = top; pos.x = _sq.x; pos.z = _sq.z; }
    }
    if (ny <= support) {
      if (!p.grounded && st.fallV < -7.5) sfx('land');
      ny = support;
      vel.y = Math.max(0, vel.y);
      p.grounded = true;
    } else {
      p.grounded = ny - support < 0.015;
      st.fallV = vel.y;
    }
    pos.y = ny;
  }
  // safety net: never end up under the terrain
  const g = groundY(pos.x, pos.z);
  if (pos.y < g - 2) { pos.y = g; vel.y = 0; }

  const moved = Math.hypot(pos.x - x0, pos.z - z0) / Math.max(dt, 1e-4);
  p.speed = clamp(moved, 0, 8);
  return p.speed;
}
