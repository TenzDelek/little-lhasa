// UI-facing game state (zustand). Per-frame physics state lives in core/game.ts instead.
// World modules talk to the game through the actions here: say() opens dialogue, emit() reports events
// (prayer wheel spun, lamp lit, item bought…) that drive quests, toast() shows a small notice.
import { create } from 'zustand';

export interface DialogueLine {
  /** Speaker name shown in the box, e.g. "Amala". */
  who: string;
  /** Optional Tibetan-script name / greeting shown beside it. */
  bod?: string;
  text: string;
}
export interface Choice { label: string; run: () => void }
export interface Dialogue {
  lines: DialogueLine[];
  index: number;
  /** Shown on the last line. */
  choices?: Choice[];
  onClose?: () => void;
}

export type GameEvent =
  | { type: 'spinWheel'; id: string; group: 'temple' | 'square' | 'kora' | 'other' }
  | { type: 'talk'; npc: string }
  | { type: 'buy'; item: string; price: number }
  | { type: 'give'; item: string; to: string }
  | { type: 'lightLamp'; id: string }
  | { type: 'found'; id: string }
  | { type: 'enter'; area: string }
  | { type: 'pet'; animal: string };

export interface QuestState {
  id: string;
  /** 0 = not started, then quest-specific stages; done = finished. */
  stage: number;
  done: boolean;
  /** Counter for collect-n quests. */
  count: number;
  /** Distinct ids already counted (wheels / lamps). */
  seen: string[];
}

export interface Toast { id: number; text: string; kind: 'info' | 'quest' | 'merit' | 'money' }

interface Store {
  started: boolean;
  paused: boolean;
  muted: boolean;
  night: boolean;
  camera: 'iso' | 'chase';
  prompt: string | null;
  dialogue: Dialogue | null;
  toasts: Toast[];
  rupees: number;
  inventory: Record<string, number>;
  /** Prayer-wheel turns (each spin = one turn of mani mantras). */
  merit: number;
  quests: Record<string, QuestState>;
  flags: Record<string, boolean | number | string>;
  panel: null | 'quests' | 'help';
  /** Area name currently shown in the corner (set by world modules via emit({type:'enter'})). */
  area: string;

  start(): void;
  setPaused(p: boolean): void;
  toggleMute(): void;
  toggleNight(): void;
  setCamera(c: 'iso' | 'chase'): void;
  setPrompt(p: string | null): void;
  setPanel(p: Store['panel']): void;
  say(lines: DialogueLine[], opts?: { choices?: Choice[]; onClose?: () => void }): void;
  next(): void;
  closeDialogue(): void;
  toast(text: string, kind?: Toast['kind']): void;
  dropToast(id: number): void;
  addRupees(n: number): void;
  /** Spend rupees; returns false (and toasts) if not enough. */
  spend(n: number): boolean;
  addItem(id: string, n?: number): void;
  takeItem(id: string, n?: number): boolean;
  hasItem(id: string): boolean;
  setFlag(k: string, v: boolean | number | string): void;
  addMerit(n: number): void;
  patchQuest(id: string, patch: Partial<QuestState>): void;
  emit(e: GameEvent): void;
}

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();
/** Subscribe to game events (quests do this). Returns an unsubscribe function. */
export const onGameEvent = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

let toastId = 1;

export const useGame = create<Store>()((set, get) => ({
  started: false,
  paused: false,
  muted: false,
  night: false,
  camera: 'iso',
  prompt: null,
  dialogue: null,
  toasts: [],
  rupees: 150,
  inventory: {},
  merit: 0,
  quests: {},
  flags: {},
  panel: null,
  area: 'Main Square',

  start: () => set({ started: true }),
  setPaused: (paused) => set({ paused }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleNight: () => set((s) => ({ night: !s.night })),
  setCamera: (camera) => set({ camera }),
  setPrompt: (prompt) => { if (get().prompt !== prompt) set({ prompt }); },
  setPanel: (panel) => set({ panel }),
  say: (lines, opts) => set({ dialogue: { lines, index: 0, choices: opts?.choices, onClose: opts?.onClose } }),
  next: () => {
    const d = get().dialogue;
    if (!d) return;
    if (d.index < d.lines.length - 1) set({ dialogue: { ...d, index: d.index + 1 } });
    else if (!d.choices?.length) get().closeDialogue();
  },
  closeDialogue: () => {
    const d = get().dialogue;
    set({ dialogue: null });
    d?.onClose?.();
  },
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => get().dropToast(id), 3400);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  addRupees: (n) => set((s) => ({ rupees: s.rupees + n })),
  spend: (n) => {
    if (get().rupees < n) { get().toast(`Not enough rupees (₹${n} needed)`, 'money'); return false; }
    set((s) => ({ rupees: s.rupees - n }));
    return true;
  },
  addItem: (id, n = 1) => set((s) => ({ inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + n } })),
  takeItem: (id, n = 1) => {
    const have = get().inventory[id] ?? 0;
    if (have < n) return false;
    set((s) => ({ inventory: { ...s.inventory, [id]: have - n } }));
    return true;
  },
  hasItem: (id) => (get().inventory[id] ?? 0) > 0,
  setFlag: (k, v) => set((s) => ({ flags: { ...s.flags, [k]: v } })),
  addMerit: (n) => set((s) => ({ merit: s.merit + n })),
  patchQuest: (id, patch) => set((s) => {
    const q = s.quests[id] ?? { id, stage: 0, done: false, count: 0, seen: [] };
    return { quests: { ...s.quests, [id]: { ...q, ...patch } } };
  }),
  emit: (e) => { for (const l of listeners) l(e); },
}));

/** Non-React access (frame loops, event handlers). */
export const G = () => useGame.getState();
