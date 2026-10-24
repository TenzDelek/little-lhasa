// Sightlines from the default iso camera to the food stalls. Tashi's momo stall and Dolma's laphing table
// stand on the east (camera) side of their roads, so anything built between them and the default camera
// (azimuth π/4: south-east of the boy, 36° up) would hide them. Each stall registers a Sight; buildings and
// back houses whose footprint lies in that view corridor are kept low enough (or left out) for the stall's
// counter to stay in view.
import { toWorld, type Frame } from './util';

const AZ = Math.PI / 4;
const VX = Math.sin(AZ), VZ = Math.cos(AZ);
const TAN = Math.tan((36 * Math.PI) / 180);

export interface Sight {
  /** Point that must stay visible (world). */
  x: number; z: number;
  /** World y of that point (e.g. the counter top). */
  y: number;
  /** Half-width of the view corridor across the view direction (m). */
  hw: number;
}

/** Lowest allowed world-space top for anything covering (x, z); Infinity outside every corridor. */
export function sightTopAt(sights: readonly Sight[], x: number, z: number): number {
  let top = Infinity;
  for (const s of sights) {
    const dx = x - s.x, dz = z - s.z;
    const along = dx * VX + dz * VZ;
    if (along < 0.3) continue;
    if (Math.abs(dx * VZ - dz * VX) > s.hw) continue;
    top = Math.min(top, s.y + along * TAN - 0.15);
  }
  return top;
}

/**
 * Lowest allowed top over a local rectangle of a frame: x in [−w/2, w/2], z in [z0, z1] (front = +z).
 * Infinity when the rectangle is clear of every corridor.
 */
export function sightTop(sights: readonly Sight[], f: Frame, w: number, z0: number, z1: number): number {
  if (!sights.length) return Infinity;
  let top = Infinity;
  const nx = Math.max(2, Math.ceil(w / 0.5)), nz = Math.max(2, Math.ceil((z1 - z0) / 0.5));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const [x, z] = toWorld(f, -w / 2 + (w * i) / nx, z0 + ((z1 - z0) * j) / nz);
    top = Math.min(top, sightTopAt(sights, x, z));
  }
  return top;
}

/** Height a building of `floors` storeys reaches above its floor with a bare flat roof (parapet + trim). */
export const FLAT_EXTRA = 1.05;
