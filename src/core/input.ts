// Unified input: keyboard + mouse + touch (the on-screen joystick / buttons in ui/ write here).
// Edge-triggered actions are counters; consume them with take('jump') etc. in the frame loop.
//
// Keys: WASD / arrows move · Shift run · Space jump · E / Enter interact · C camera · Q / Z and R / X rotate
// (iso) · mouse drag orbit (chase) · wheel zoom · N day/night · P / Esc pause · M mute.

export type Action = 'jump' | 'interact' | 'camera' | 'rotL' | 'rotR' | 'night' | 'pause' | 'mute' | 'quests' | 'help';

const held = new Set<string>();
const pressed: Record<Action, number> = {
  jump: 0, interact: 0, camera: 0, rotL: 0, rotR: 0, night: 0, pause: 0, mute: 0, quests: 0, help: 0,
};

export const input = {
  /** Touch joystick vector (x right, y up/forward), magnitude 0..1. Written by the touch UI. */
  joy: { x: 0, y: 0, active: false },
  /** Touch run toggle / sprint while joystick pushed far. */
  touchRun: false,
  /** Accumulated pointer-drag look delta (px) since last frame. */
  look: { dx: 0, dy: 0 },
  /** Accumulated wheel zoom steps since last frame. */
  zoom: 0,
  /** When true, keyboard movement is ignored (typing in UI, dialogue). */
  locked: false,

  /** Move vector in screen terms: x right, y forward. Magnitude ≤ 1. */
  move(): { x: number; y: number } {
    let x = 0, y = 0;
    if (!this.locked) {
      if (held.has('KeyW') || held.has('ArrowUp')) y += 1;
      if (held.has('KeyS') || held.has('ArrowDown')) y -= 1;
      if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
      if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
    }
    if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
    const L = Math.hypot(x, y);
    return L > 1 ? { x: x / L, y: y / L } : { x, y };
  },
  run(): boolean {
    return held.has('ShiftLeft') || held.has('ShiftRight') || this.touchRun || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92);
  },
  /** Fire an action (used by touch buttons and HUD). */
  press(a: Action) { pressed[a]++; },
  /** Consume one press of an action. */
  take(a: Action): boolean {
    if (pressed[a] > 0) { pressed[a] = 0; return true; }
    return false;
  },
  peek(a: Action) { return pressed[a] > 0; },
};

const KEYMAP: Record<string, Action> = {
  Space: 'jump', KeyE: 'interact', Enter: 'interact', KeyF: 'interact', KeyC: 'camera',
  KeyQ: 'rotL', KeyZ: 'rotL', KeyR: 'rotR', KeyX: 'rotR', KeyN: 'night', KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute', KeyJ: 'quests', KeyH: 'help',
};

let attached = false;
export function attachInput(target: HTMLElement) {
  if (attached) return () => {};
  attached = true;
  const isTyping = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (!e.repeat && KEYMAP[e.code]) pressed[KEYMAP[e.code]]++;
    held.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => { held.delete(e.code); };
  const blur = () => held.clear();
  let drag: { id: number; x: number; y: number } | null = null;
  const pdown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return; // touch look is handled by the touch UI's look pad
    if ((e.target as HTMLElement | null)?.closest?.('.hud')) return; // clicks on HUD controls never drag the camera
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const pmove = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    input.look.dx += e.clientX - drag.x; input.look.dy += e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
  };
  const pup = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; };
  const wheel = (e: WheelEvent) => { input.zoom += Math.sign(e.deltaY); e.preventDefault(); };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  target.addEventListener('pointerdown', pdown);
  window.addEventListener('pointermove', pmove);
  window.addEventListener('pointerup', pup);
  target.addEventListener('wheel', wheel, { passive: false });
  return () => {
    attached = false;
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    target.removeEventListener('pointerdown', pdown);
    window.removeEventListener('pointermove', pmove);
    window.removeEventListener('pointerup', pup);
    target.removeEventListener('wheel', wheel);
  };
}
