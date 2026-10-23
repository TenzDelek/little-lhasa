// Interactables: anything the player can use with E / the hand button (prayer wheels, NPCs, stalls,
// butter lamps, the puppy). The player controller picks the best one in range each frame, the HUD shows
// its label, and pressing E calls onInteract().
//
//   useInteractable(() => ({ id: 'wheel-3', pos: [x, y, z], radius: 1.4, label: 'Spin prayer wheel',
//                            onInteract: () => spin() }), [deps]);
import { useEffect } from 'react';
import { Vector3 } from 'three';

export interface Interactable {
  id: string;
  /** World position (static array, or a getter for moving things like NPCs). */
  pos: readonly [number, number, number] | (() => Vector3);
  /** Reach (m, horizontal) from the player's feet. Default 1.5. */
  radius?: number;
  /** Prompt text, e.g. "Spin prayer wheel", "Talk to Amala". */
  label: string | (() => string);
  /** Return false to hide it (e.g. lamp already lit). */
  enabled?: () => boolean;
  /** Higher wins when several are in reach. Default 0. */
  priority?: number;
  onInteract: () => void;
}

const items = new Map<string, Interactable>();
const _v = new Vector3();

export const interactions = {
  add(i: Interactable) {
    items.set(i.id, i);
    return () => { if (items.get(i.id) === i) items.delete(i.id); };
  },
  get(id: string) { return items.get(id); },
  posOf(i: Interactable, out = _v): Vector3 {
    return typeof i.pos === 'function' ? out.copy(i.pos()) : out.set(i.pos[0], i.pos[1], i.pos[2]);
  },
  labelOf(i: Interactable) { return typeof i.label === 'function' ? i.label() : i.label; },
  /** Best interactable for a player at `p` facing `yaw`: in reach, enabled, prefers in front and close. */
  best(p: Vector3, yaw: number): Interactable | null {
    let best: Interactable | null = null, bestScore = -Infinity;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const i of items.values()) {
      if (i.enabled && !i.enabled()) continue;
      const q = this.posOf(i);
      const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y;
      const d = Math.hypot(dx, dz);
      const r = i.radius ?? 1.5;
      if (d > r || dy < -1.5 || dy > 2.6) continue;
      const facing = d > 1e-3 ? (dx * fx + dz * fz) / d : 1;
      const score = (i.priority ?? 0) * 10 + facing * 0.6 - d / r;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  },
};

/** Register an interactable for the lifetime of a component. `make` runs whenever deps change. */
export function useInteractable(make: () => Interactable | null, deps: readonly unknown[]) {
  useEffect(() => {
    const i = make();
    return i ? interactions.add(i) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
