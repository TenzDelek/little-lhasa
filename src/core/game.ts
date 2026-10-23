// Mutable per-frame game state shared outside React (no re-renders). The player controller writes
// `game.player`, the camera rig writes `game.cam`; NPCs, animals and interactions read them.
import { Vector3 } from 'three';

export type PlayerAction = null | {
  kind: 'spin' | 'wave' | 'give' | 'bow' | 'pray' | 'light' | 'eat' | 'pet' | 'talk' | 'point';
  /** Seconds since the action started. */
  t: number;
  /** Duration (s). */
  dur: number;
};

export const game = {
  player: {
    /** Feet position. */
    pos: new Vector3(),
    vel: new Vector3(),
    /** Facing yaw (radians about y, 0 = facing +z). */
    yaw: 0,
    grounded: true,
    /** Horizontal speed (m/s). */
    speed: 0,
    /** Current one-shot action animation (spin a wheel, wave, …). */
    action: null as PlayerAction,
    /** When true the controller ignores movement input (dialogue, cut-ins). */
    frozen: false,
    /** World position the player is looking at / facing toward during an action (optional). */
    lookAt: null as Vector3 | null,
  },
  cam: {
    mode: 'iso' as 'iso' | 'chase',
    /** Iso azimuth (radians). Default π/4: camera south-east of the player looking north-west. */
    azimuth: Math.PI / 4,
    /** Chase yaw/pitch. */
    yaw: 0,
    pitch: 0.32,
    zoom: 1,
    /** Camera world position and look target (written by CameraRig). */
    position: new Vector3(),
    target: new Vector3(),
  },
  /** Seconds of game time (stops when paused). */
  time: 0,
  dt: 0,
};
