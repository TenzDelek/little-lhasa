// Night lights. Any module can register a lamp (street light, shop bulb, butter lamps, string lights);
// render/Lighting.tsx keeps a fixed pool of real PointLights and moves them to the lamps nearest the camera
// target, faded by U.night. Draw the glowing bulb yourself (emissive / Parts emit with emitNight).
//
//   useEffect(() => lamps.add({ x, y, z, color: PAL.lampWarm, intensity: 6, distance: 9 }), []);

export interface Lamp {
  x: number; y: number; z: number;
  /** sRGB hex. */
  color: number;
  /** Candela-ish (physically based point light intensity). 4..12 is typical for a street lamp. */
  intensity: number;
  /** Cut-off distance (m). */
  distance: number;
  /** Also on by day (fires, butter lamps inside). Default false. */
  day?: boolean;
  /** Flicker amount 0..1 (flames). */
  flicker?: number;
}

const set = new Set<Lamp>();
export const lamps = {
  add(l: Lamp) { set.add(l); return () => { set.delete(l); }; },
  all(): ReadonlySet<Lamp> { return set; },
};
