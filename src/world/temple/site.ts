// Site plan of the Tsuglagkhang complex (temple module). All numbers are world metres.
// The courtyard (PLAZAS 'temple-court', rect [-10, 93, 27, 127]) sits on a platform at y = -8. The module
// widens it with a stone deck out to an enclosure wall (ENCLOSURE) whose corners are chamfered so the wall
// stays clear of the Lingkhor kora path that circles below it.
import { PLAZAS, roadById } from '../layout';

export const COURT = PLAZAS.find((p) => p.id === 'temple-court')!;
export const CY = COURT.y; // -8
export const [RX0, RZ0, RX1, RZ1] = COURT.rect;
export const KORA = roadById('kora-path');

/** Enclosure polygon (outer face of the wall), clockwise seen from above, starting east of the gate. */
export const ENCLOSURE: readonly (readonly [number, number])[] = [
  [11.6, 92.6], [29.1, 92.6], [29.6, 93.6], [29.6, 127.7], [27.2, 131.5],
  [-8.6, 131.5], [-14, 127.9], [-14, 97.3], [-7.2, 92.6], [6.4, 92.6],
];

/** Gate opening on the north wall (x range) and gate centre. */
export const GATE = { x: 9, z: 92.6, x0: 6.4, x1: 11.6 };

/** Openings in the enclosure for stairs from the kora (half width). */
export const STAIRS = [
  // south: from the kora at (12, 137.6) up to the deck at z = 131.5
  { id: 'south', foot: [12, 137.1] as const, top: [12, 131.5] as const, w: 2.6 },
  // west: from the kora at (-19.6, 112) up to x = -14
  { id: 'west', foot: [-19.1, 111.4] as const, top: [-14, 111.4] as const, w: 2.2 },
  // east: from the kora at (35.6, 114) up to x = 29.6
  { id: 'east', foot: [35.3, 113.6] as const, top: [29.6, 113.6] as const, w: 2.2 },
];

// ---- buildings -------------------------------------------------------------------------------------------
/** Main hall (Tsuglagkhang): front faces north. */
export const MAIN = {
  x0: 3, x1: 17, // plinth
  zFront: 105.2, zBack: 123.5,
  plinthTop: CY + 1.0,
  bodyZ0: 109.4, // ground-storey front wall (verandah behind the pillars)
  pillarZ: 106.0,
  stairsZ0: 103.0, // foot of the front steps
};

export const KALA = { x0: -7.6, x1: -1.6, z0: 105.4, z1: 112.6, plinth: 0.6 };
export const LAMPHOUSE = { x0: 16.7, x1: 21.3, z0: 97.0, z1: 100.6 };
export const GALLERY = { xFront: 22.1, xBack: 25.3, xWheel: 24.25, z0: 98.0, z1: 122.0, n: 24 };
export const DEBATE = { x: 3.5, z: 100, tree: [-4.2, 98.6] as const };

/** Horizontal span [xl, xr] of the enclosure polygon at depth z (convex polygon). */
export function spanAt(z: number): [number, number] | null {
  let xl = Infinity, xr = -Infinity;
  const P = ENCLOSURE;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
    if ((z < Math.min(az, bz)) || (z > Math.max(az, bz)) || az === bz) {
      if (az === bz && Math.abs(z - az) < 1e-6) { xl = Math.min(xl, ax, bx); xr = Math.max(xr, ax, bx); }
      continue;
    }
    const t = (z - az) / (bz - az);
    const x = ax + (bx - ax) * t;
    xl = Math.min(xl, x); xr = Math.max(xr, x);
  }
  return xl <= xr ? [xl, xr] : null;
}

/** True if (x, z) is inside the enclosure polygon. */
export function insideEnclosure(x: number, z: number) {
  const s = spanAt(z);
  return !!s && x >= s[0] && x <= s[1];
}
