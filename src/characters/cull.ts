// Cheap culling for the skinned figures (people and animals). Each figure is a group over a skinned mesh with
// 20-odd bones, and three walks every bone's matrices every frame whether the figure shows or not; with ~80
// figures that is ~1600 bones. A hidden figure keeps its pose but skips the pass (its root.visible = false is
// the switch); the first frame it shows again recomputes the whole figure, so nothing pops.
//
//   skipWhenHidden(rig.root);              // once, after building the rig
//   const view = new View();               // per component
//   view.update(camera);                   // once per frame
//   rig.root.visible = near && view.sees(x, y + 0.5, z, 2.5);
import { Frustum, Matrix4, Object3D, Sphere, Vector3, type Camera } from 'three';

const base = Object3D.prototype.updateMatrixWorld;

/** Skip the world-matrix pass for `root` and everything under it while root.visible is false. */
export function skipWhenHidden(root: Object3D) {
  root.updateMatrixWorld = function (this: Object3D, force?: boolean) {
    if (this.visible) base.call(this, force);
  };
}

/** The camera's view volume, for "is this figure (or its shadow) on screen?" tests. */
export class View {
  private f = new Frustum();
  private m = new Matrix4();
  private s = new Sphere(new Vector3(), 1);
  update(camera: Camera) {
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.f.setFromProjectionMatrix(this.m, camera.coordinateSystem, camera.reversedDepth);
  }
  /** True if a sphere of radius r at (x, y, z) touches the view (generous r keeps shadows just off screen). */
  sees(x: number, y: number, z: number, r: number) {
    this.s.center.set(x, y, z);
    this.s.radius = r;
    return this.f.intersectsSphere(this.s);
  }
}
