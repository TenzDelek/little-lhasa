// Per-instance view culling for the forest's InstancedMeshes. Each variant is one InstancedMesh spanning the
// whole map, and three culls an InstancedMesh all-or-nothing, so without this every tree in town is drawn in
// the main pass and in the shadow pass wherever the boy stands. Woodland.tsx asks `update()` every frame; it
// rebuilds the view volume only when the camera (or the sun) has moved or turned enough since the last
// rebuild, and the forest then rewrites each variant's instance list with only the trees that can show: the
// tree itself in view, or its shadow falling into view. The volume is padded (MARGIN metres all round, and
// SLACK radians wider for the chase camera's perspective), well beyond what the camera moves between rebuilds,
// so nothing pops at the screen edge. No allocations after construction.
import { Frustum, MathUtils, Matrix4, Vector3, type Camera, type DirectionalLight, type OrthographicCamera, type PerspectiveCamera } from 'three';

/** Padding of the view volume (m). */
const MARGIN = 3;
/** Extra half-angle of the perspective (chase) view (rad), so a turn up to REBUILD_TURN never shows a gap far away. */
const SLACK = 0.05;
/** Rebuild when the camera moved this far (m) or turned this much (cos of 1.2°), or the view scaled by 1 %. */
const REBUILD_MOVE2 = 1.0 * 1.0;
const REBUILD_TURN = Math.cos(MathUtils.degToRad(1.2));
const REBUILD_SCALE = 0.01;

const _dir = new Vector3();
const _sun = new Vector3();

/** Floats per item in the source sphere array: base x, y, z, height (m), crown radius (m). */
export const SPHERE_STRIDE = 5;

export class ForestView {
  /** False until the first update(): pack everything until then. */
  ready = false;
  private f = new Frustum();
  private m = new Matrix4();
  private p = new Matrix4();
  private cam: Camera | null = null;
  private pos = new Vector3();
  private dir = new Vector3();
  private sunDir = new Vector3(0, 1, 0);
  private sw = 0;
  private sh = 0;
  /** Horizontal unit vector toward the sun and shadow length per metre of height. */
  private ux = 0;
  private uz = 0;
  private k = 0;

  /** Refresh the volume if the camera or sun moved enough; true when it was rebuilt (the forest must repack). */
  update(cam: Camera, sun: DirectionalLight | null): boolean {
    const persp = (cam as PerspectiveCamera).isPerspectiveCamera === true;
    let sw: number, sh: number;
    if (persp) {
      const c = cam as PerspectiveCamera;
      sh = Math.tan(MathUtils.degToRad(c.fov / 2)) / c.zoom;
      sw = sh * c.aspect;
    } else {
      const c = cam as OrthographicCamera;
      sw = (c.right - c.left) / c.zoom;
      sh = (c.top - c.bottom) / c.zoom;
    }
    cam.getWorldDirection(_dir);
    if (sun) _sun.subVectors(sun.position, sun.target.position).normalize();
    else _sun.copy(this.sunDir);
    const same = this.ready && cam === this.cam
      && this.pos.distanceToSquared(cam.position) < REBUILD_MOVE2
      && _dir.dot(this.dir) > REBUILD_TURN
      && _sun.dot(this.sunDir) > REBUILD_TURN
      && Math.abs(sw - this.sw) < this.sw * REBUILD_SCALE
      && Math.abs(sh - this.sh) < this.sh * REBUILD_SCALE;
    if (same) return false;

    this.ready = true;
    this.cam = cam;
    this.pos.copy(cam.position);
    this.dir.copy(_dir);
    this.sunDir.copy(_sun);
    this.sw = sw; this.sh = sh;
    if (persp) {
      const c = cam as PerspectiveCamera;
      const n = c.near, X = n * Math.tan(Math.atan(sw) + SLACK), Y = n * Math.tan(Math.atan(sh) + SLACK);
      this.p.makePerspective(-X, X, Y, -Y, n, c.far, c.coordinateSystem);
    } else {
      this.p.copy(cam.projectionMatrix);
    }
    this.m.multiplyMatrices(this.p, cam.matrixWorldInverse);
    this.f.setFromProjectionMatrix(this.m, cam.coordinateSystem);
    // no near / far limit: the iso box and the chase cone's sides bound everything the forest can show
    this.f.planes[4].constant = Infinity;
    this.f.planes[5].constant = Infinity;
    // shadows fall away from the sun, |d.xz| / d.y metres along the ground per metre of height
    const hl = Math.hypot(_sun.x, _sun.z);
    this.k = _sun.y > 0.05 ? hl / _sun.y : 0;
    this.ux = hl > 1e-4 ? _sun.x / hl : 0;
    this.uz = hl > 1e-4 ? _sun.z / hl : 0;
    return true;
  }

  private sphere(x: number, y: number, z: number, r: number): boolean {
    const P = this.f.planes;
    for (let i = 0; i < 4; i++) {
      const n = P[i].normal;
      if (n.x * x + n.y * y + n.z * z + P[i].constant < -r) return false;
    }
    return true;
  }

  /** Can item i (spheres `s`, SPHERE_STRIDE floats each) or, if it casts one, its shadow show? */
  sees(s: Float32Array, i: number, shadow: boolean): boolean {
    const o = i * SPHERE_STRIDE;
    const x = s[o], y = s[o + 1], z = s[o + 2], h = s[o + 3], R = s[o + 4];
    const hh = h / 2;
    if (this.sphere(x, y + hh, z, Math.sqrt(hh * hh + R * R) + MARGIN)) return true;
    if (!shadow || this.k <= 0) return false;
    // the shadow on the ground: from the trunk to the crown top's shadow, away from the sun
    const L = h * this.k;
    return this.sphere(x - this.ux * L * 0.5, y, z - this.uz * L * 0.5, L * 0.5 + R + MARGIN);
  }
}
