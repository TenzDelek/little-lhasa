// Prayer flags: lungta strings (horizontal lines of small square flags, blue-white-red-green-yellow,
// sagging, fluttering in the wind) and darchor (tall vertical pole flags). One InstancedMesh per component.
//
// API CONTRACT — other modules code against these components. Keep props stable; only add optional ones.
//   <PrayerFlags lines={[{ a: [0, 5, 0], b: [8, 4.6, 3] }]} />
//   <Darchor poles={[{ x: 3, z: -2, h: 6 }]} />
import type { V3 } from '../core/geom';

export interface FlagLine {
  /** End points (world space). */
  a: V3;
  b: V3;
  /** Sag at mid-span (m), default 6% of the span. */
  sag?: number;
  /** Flag size (m), default 0.24. */
  size?: number;
  /** Spacing between flags (m), default 0.3. */
  spacing?: number;
  /** Fade / weather: 0 = brand new, 1 = sun-bleached tatters. */
  age?: number;
  seed?: number;
}

export interface DarchorPole {
  x: number;
  z: number;
  /** Height above ground (m), default 6. */
  h?: number;
  /** Base y; default groundY. */
  y?: number;
  /** Colour of the long vertical banner (default lungta cycle by seed). */
  color?: number;
  seed?: number;
}

export function PrayerFlags(props: { lines: FlagLine[] }) {
  // PLACEHOLDER (replaced by the flags/street kit builder)
  void props;
  return null;
}

export function Darchor(props: { poles: DarchorPole[] }) {
  // PLACEHOLDER (replaced by the flags/street kit builder)
  void props;
  return null;
}
