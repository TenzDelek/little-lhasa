// Ground locomotion for the animals that walk around (dogs, the puppy): steer toward a point with a turning
// arc, collide with the town, step up kerbs, hop, and get unstuck by detouring around whatever blocks the way.
import { Vector3 } from 'three';
import { angleDelta, damp, dampAngle } from '../../core/math';
import { groundY } from '../../world/terrain';
import { walk, type Walker } from './nav';

export class Mover {
  w: Walker;
  yaw: number;
  /** Commanded speed (m/s). */
  spd = 0;
  /** Measured horizontal speed (m/s) — feed this to the animation. */
  vel = 0;
  stuck = 0;
  private detour = 0;
  private detourT = 0;
  private flip = 1;

  constructor(x: number, z: number, yaw: number, r: number, h: number, stepUp = 0.42) {
    this.w = { pos: new Vector3(x, groundY(x, z), z), vy: 0, grounded: true, r, h, stepUp };
    this.yaw = yaw;
  }
  get pos() { return this.w.pos; }

  /** Steer toward (tx, tz) at up to `speed`. Returns the remaining distance. */
  to(tx: number, tz: number, speed: number, dt: number, arrive = 0.4, turn = 7): number {
    const p = this.w.pos;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.04) { this.idle(dt); return d; }
    const want = Math.atan2(dx, dz) + this.detour;
    this.yaw = dampAngle(this.yaw, want, turn, dt);
    const align = Math.max(0, Math.cos(angleDelta(this.yaw, want)));
    const v = speed * Math.min(1, d / Math.max(0.05, arrive)) * (0.25 + 0.75 * align);
    this.spd = damp(this.spd, v, 6, dt);
    this.move(dt);
    // unstick: if we barely moved while trying to, detour to one side for a moment
    if (this.detourT > 0) {
      this.detourT -= dt;
      if (this.detourT <= 0) this.detour = 0;
    }
    return d;
  }

  /** Walk straight along the current yaw at the commanded speed. */
  move(dt: number) {
    const step = this.spd * dt;
    const p = this.w.pos;
    const x0 = p.x, z0 = p.z;
    const frac = walk(this.w, Math.sin(this.yaw) * step, Math.cos(this.yaw) * step, dt);
    const moved = Math.hypot(p.x - x0, p.z - z0);
    this.vel = damp(this.vel, moved / Math.max(dt, 1e-4), 12, dt);
    if (step > 0.004 && frac < 0.4) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 0.5);
    if (this.stuck > 0.5 && this.detourT <= 0) {
      this.flip = -this.flip;
      this.detour = this.flip * 1.2;
      this.detourT = 0.9;
      this.stuck = 0;
    }
  }

  /** Stand still (settle on the floor, decelerate). */
  idle(dt: number) {
    this.spd = damp(this.spd, 0, 8, dt);
    if (this.spd > 0.05) { this.move(dt); return; }
    this.spd = 0;
    walk(this.w, 0, 0, dt);
    this.vel = damp(this.vel, 0, 10, dt);
  }

  face(yaw: number, dt: number, rate = 5) { this.yaw = dampAngle(this.yaw, yaw, rate, dt); }
  faceTo(x: number, z: number, dt: number, rate = 5) {
    const p = this.w.pos;
    this.face(Math.atan2(x - p.x, z - p.z), dt, rate);
  }
  hop(vy: number) { if (this.w.grounded) { this.w.vy = vy; this.w.grounded = false; } }
  teleport(x: number, y: number, z: number) {
    this.w.pos.set(x, y, z); this.w.vy = 0; this.w.grounded = true; this.spd = 0; this.vel = 0; this.stuck = 0;
  }
  /** Head-turn angle toward a point, clamped (0 when it is behind). */
  lookAt(x: number, z: number) {
    const p = this.w.pos;
    const a = angleDelta(this.yaw, Math.atan2(x - p.x, z - p.z));
    return Math.abs(a) > 1.9 ? 0 : Math.max(-1.2, Math.min(1.2, a));
  }
}
