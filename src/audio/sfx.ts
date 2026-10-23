// Sound effects API. Every module calls sfx(name) — never creates its own AudioContext.
// Implementation is procedural WebAudio (no asset files); see audio/synth.ts.
export type SfxName =
  | 'step' | 'stepStone' | 'stepDirt' | 'jump' | 'land'
  | 'bell' | 'wheel' | 'coin' | 'deny' | 'talk' | 'lamp' | 'bark' | 'monkey' | 'moo' | 'crow'
  | 'quest' | 'ui' | 'toggle' | 'honk';

type Impl = (name: SfxName, opts?: { volume?: number; pan?: number }) => void;
let impl: Impl = () => {};

/** Play a sound. Safe to call any time (no-op until audio is unlocked by the first user gesture). */
export function sfx(name: SfxName, opts?: { volume?: number; pan?: number }) { impl(name, opts); }
/** Installed by the audio engine. */
export function setSfxImpl(f: Impl) { impl = f; }
