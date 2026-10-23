// Global TSL uniforms. The render loop (render/PixelPipeline.tsx + render/CameraRig.tsx) writes them every
// frame; any material may read them. Never create per-material copies of these.
import { Vector3 } from 'three';
import { uniform } from 'three/tsl';

export const U = {
  /** Seconds since start (pauses with the game). */
  time: uniform(0),
  /** 0 = day, 1 = night, eased in between. Use it to switch on windows, lamps, stars. */
  night: uniform(0),
  /** Player feet position in world space. */
  player: uniform(new Vector3()),
  /** Normalised direction the camera looks along (from camera into the scene). */
  viewDir: uniform(new Vector3(-0.6, -0.55, -0.6).normalize()),
  /** Strength (0..1) of the see-through cut on occludable materials. */
  occlude: uniform(1),
  /** Radius (m, perpendicular to the view) of the see-through hole around the player. */
  occludeRadius: uniform(2.6),
  /** One art pixel in world metres at the current zoom (iso camera). */
  artPx: uniform(0.04),
  /** Prevailing wind strength multiplier (flags, trees, smoke). */
  wind: uniform(1),
};

/** Prevailing wind direction (world xz, normalised): flags, smoke and foliage lean along it. */
export const WIND_DIR = new Vector3(1, 0, -0.45).normalize();
