// UI-local state (not saved, not game state) and the bits the HUD's pieces share: which input device was
// used last (prompt glyphs, touch controls), the dialogue's advance() hook, the New-game confirm.
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { G, useGame } from '../game/store';
import { QUESTS } from '../game/quests';
import { SPOTS } from '../world/layout';
import { groundY } from '../world/terrain';
import { game } from '../core/game';
import { sfx } from '../audio/sfx';

export type Device = 'kbd' | 'mouse' | 'touch';

interface UiState {
  /** Last input device used (keyboard / mouse / touch). */
  device: Device;
  /** Touch controls are shown (coarse pointer, or a touch happened). */
  touch: boolean;
  /** "Start over?" confirmation open (pause menu or title). */
  confirm: boolean;
  /** Desktop errand tracker folded to its header. */
  trackerFolded: boolean;
}

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const FOLD_KEY = 'little-lhasa-ui-tracker';
const readFold = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };

export const useUi = create<UiState>(() => ({
  device: coarse ? 'touch' : 'kbd',
  touch: coarse,
  confirm: false,
  trackerFolded: readFold(),
}));

export function setDevice(d: Device) {
  const s = useUi.getState();
  if (s.device === d && (d !== 'touch' || s.touch)) return;
  useUi.setState(d === 'touch' ? { device: d, touch: true } : { device: d });
}

export function setTrackerFolded(v: boolean) {
  useUi.setState({ trackerFolded: v });
  try { localStorage.setItem(FOLD_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

/** Dialogue control, installed by <DialogueBox/>: finishes the typewriter or moves to the next line. */
export const dialogueCtl = {
  advance: () => { G().next(); },
};

/** True when there is saved progress worth "continuing". */
export function hasProgress(s: ReturnType<typeof G>) {
  if (s.merit > 0 || s.rupees !== 150) return true;
  if (Object.values(s.inventory).some((n) => n > 0)) return true;
  if (Object.keys(s.flags).length) return true;
  for (const d of QUESTS) {
    const q = s.quests[d.id];
    if (!q) continue;
    if (q.done || q.count > 0 || q.stage > (d.autoStart ? 1 : 0)) return true;
  }
  return false;
}

/** Errands finished / total. */
export function errandCount(quests: ReturnType<typeof G>['quests']) {
  return { done: QUESTS.filter((d) => quests[d.id]?.done).length, total: QUESTS.length };
}

/** Wipe progress and return to the title screen with Tenzin back on the square. */
export function newGame() {
  const s = G();
  s.resetProgress();
  s.closeDialogue();
  useGame.setState({ paused: false, panel: null, started: false });
  useUi.setState({ confirm: false });
  const p = game.player;
  p.pos.set(SPOTS.spawn.x, groundY(SPOTS.spawn.x, SPOTS.spawn.z), SPOTS.spawn.z);
  p.vel.set(0, 0, 0);
  p.yaw = SPOTS.spawn.ry;
  p.action = null;
  sfx('ui');
}

/** Begin (or continue) the walk. */
export function begin() {
  if (G().started) return;
  G().start();
  sfx('ui');
  (document.activeElement as HTMLElement | null)?.blur?.();
}

/** A CSS media query as React state. */
const mqSubs = new Map<string, (cb: () => void) => () => void>();
export function useMedia(q: string) {
  let sub = mqSubs.get(q);
  if (!sub) {
    sub = (cb) => { const m = matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
    mqSubs.set(q, sub);
  }
  return useSyncExternalStore(sub, () => matchMedia(q).matches, () => false);
}
