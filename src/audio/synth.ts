// Procedural WebAudio engine — every sound is synthesised from oscillators and noise (no files).
// Installed into sfx() on import (the HUD imports this module once for its side effects).
//
//   master gain (mute) → compressor → speakers
//     ├ sfx bus      one-shot effects: steps, bell, coins, animals, chimes…
//     ├ amb bus      ambient bed: day (wind, birds, traffic), night (crickets, far dogs), temple chant
//     └ reverb       shared courtyard-ish convolution reverb (procedural impulse response)
//
// The AudioContext is created and resumed on the first pointer / key gesture (browsers require it), is
// suspended while the tab is hidden, and everything is silent while store.muted is set.
import { setSfxImpl, type SfxName } from './sfx';
import { useGame } from '../game/store';
import { game } from '../core/game';
import { SPOTS } from '../world/layout';

type Opts = { volume?: number; pan?: number };

const MASTER = 0.85;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[(Math.random() * xs.length) | 0];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  amb: GainNode;
  verb: ConvolverNode;
  noise: AudioBuffer;
  brown: AudioBuffer;
  shaper: Float32Array<ArrayBuffer>;
}
let E: Engine | null = null;

// ---------------------------------------------------------------------------------------------------------
// Buffers

function whiteNoise(ctx: BaseAudioContext, sec: number) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function brownNoise(ctx: BaseAudioContext, sec: number) {
  const b = ctx.createBuffer(2, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    // cross-fade the loop seam
    const f = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < f; i++) { const k = i / f; d[d.length - f + i] = d[d.length - f + i] * (1 - k) + d[i] * k; }
  }
  return b;
}

/** Stone-courtyard reverb: stereo noise with a short pre-delay, exponential decay, darkening over time. */
function impulse(ctx: BaseAudioContext, sec = 2.8) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), pre = Math.floor(sr * 0.018);
  const b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const a = 0.85 - 0.72 * t; // low-pass coefficient: bright early reflections, dark tail
      y += (Math.random() * 2 - 1 - y) * a;
      d[i] = y * Math.pow(1 - t, 2.6) * (i - pre < sr * 0.004 ? (i - pre) / (sr * 0.004) : 1);
    }
  }
  return b;
}

/** Endless overlapping crickets, pre-rendered into a seamless 8 s stereo loop. */
function crickets(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate, L = 8, n = sr * L;
  const b = ctx.createBuffer(2, n, sr);
  const L0 = b.getChannelData(0), R0 = b.getChannelData(1);
  const bugs = [
    { f: 4650, period: 0.62, pulses: 3, rate: 30, pan: -0.55, amp: 0.55 },
    { f: 4310, period: 0.83, pulses: 4, rate: 26, pan: 0.6, amp: 0.4 },
    { f: 5020, period: 1.33, pulses: 2, rate: 34, pan: 0.15, amp: 0.3 },
    { f: 3980, period: 2.0, pulses: 5, rate: 22, pan: -0.2, amp: 0.22 },
    { f: 4800, period: 0.5, pulses: 2, rate: 38, pan: 0.85, amp: 0.16 },
  ];
  for (const bug of bugs) {
    const chirps = Math.max(1, Math.round(L / bug.period));
    const P = L / chirps; // fit a whole number of chirps into the loop
    const pl = 0.42 / bug.rate; // pulse length
    const gl = Math.sqrt((1 - bug.pan) / 2), gr = Math.sqrt((1 + bug.pan) / 2);
    const off = Math.random() * P;
    for (let c = 0; c < chirps; c++) {
      const skip = Math.random() < 0.12; // the odd missed chirp keeps it alive
      if (skip) continue;
      for (let p = 0; p < bug.pulses; p++) {
        const t0 = off + c * P + p / bug.rate;
        const i0 = Math.floor(t0 * sr), len = Math.floor(pl * sr);
        for (let k = 0; k < len; k++) {
          const i = (i0 + k) % n;
          const e = Math.sin((Math.PI * k) / len);
          const s = Math.sin((2 * Math.PI * bug.f * k) / sr) * e * e * bug.amp;
          L0[i] += s * gl; R0[i] += s * gr;
        }
      }
    }
  }
  return b;
}

function makeShaper(k = 6) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

// ---------------------------------------------------------------------------------------------------------
// Engine

function build(): Engine {
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3.5;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = useGame.getState().muted ? 0 : MASTER;
  master.connect(comp).connect(ctx.destination);
  const sfx = ctx.createGain(); sfx.connect(master);
  const amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  verb.connect(wet).connect(master);
  return { ctx, master, sfx, amb, verb, noise: whiteNoise(ctx, 2), brown: brownNoise(ctx, 6), shaper: makeShaper() };
}

/** An output strip for one sound: level → optional pan → bus, plus a reverb send. Auto-disconnects. */
function strip(vol: number, dur: number, pan = 0, send = 0, bus?: AudioNode): GainNode {
  const { ctx } = E!;
  const g = ctx.createGain();
  g.gain.value = vol;
  let node: AudioNode = g;
  if (pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
  node.connect(bus ?? E!.sfx);
  let s: GainNode | null = null;
  if (send > 0) { s = ctx.createGain(); s.gain.value = send; node.connect(s); s.connect(E!.verb); }
  setTimeout(() => { node.disconnect(); s?.disconnect(); }, (dur + 0.6) * 1000);
  return g;
}

/** Gain with a percussive envelope: linear attack, exponential (time-constant) decay. */
function envGain(t: number, a: number, peak: number, decay: number, dest: AudioNode) {
  const g = E!.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(0, t + a, decay / 4.6); // ≈ -40 dB after `decay` seconds
  g.connect(dest);
  return g;
}

/** Gain with attack / hold / release (for sustained tones). */
function ahr(t: number, a: number, peak: number, hold: number, r: number, dest: AudioNode) {
  const g = E!.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.linearRampToValueAtTime(0, t + a + hold + r);
  g.connect(dest);
  return g;
}

function osc(type: OscillatorType, f: number, t0: number, t1: number, dest: AudioNode) {
  const o = E!.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.connect(dest);
  o.start(t0); o.stop(t1);
  return o;
}

function noise(t0: number, dur: number, dest: AudioNode, rate = 1) {
  const s = E!.ctx.createBufferSource();
  s.buffer = E!.noise;
  s.playbackRate.value = rate;
  s.connect(dest);
  const max = Math.max(0, E!.noise.duration - dur * rate - 0.02);
  s.start(t0, Math.random() * max, dur * rate + 0.02);
  return s;
}

function filter(type: BiquadFilterType, f: number, q: number, dest: AudioNode) {
  const b = E!.ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q;
  b.connect(dest);
  return b;
}

function shaper(dest: AudioNode) {
  const w = E!.ctx.createWaveShaper();
  w.curve = E!.shaper; w.oversample = '2x';
  w.connect(dest);
  return w;
}

// ---------------------------------------------------------------------------------------------------------
// One-shot sounds

function step(kind: 'step' | 'stepStone' | 'stepDirt', vol: number, pan: number) {
  const t = E!.ctx.currentTime + 0.004;
  const out = strip(vol * rnd(0.75, 1.05), 0.3, pan + rnd(-0.08, 0.08), 0.05);
  if (kind === 'stepStone') {
    // slate flags: a crisp scuff with a hard heel tick
    const bp = filter('bandpass', rnd(1900, 2700), 0.9, envGain(t, 0.002, 0.11, 0.055, out));
    noise(t, 0.08, bp, rnd(0.85, 1.15));
    const tick = filter('highpass', 3800, 0.7, envGain(t, 0.001, 0.05, 0.012, out));
    noise(t, 0.02, tick);
  } else if (kind === 'step') {
    // asphalt / paving: softer mid scuff
    const bp = filter('bandpass', rnd(950, 1450), 0.75, envGain(t, 0.003, 0.11, 0.07, out));
    noise(t, 0.1, bp, rnd(0.85, 1.15));
  } else {
    // dirt and gravel: low crunch with a second gritty burst
    const lp = filter('lowpass', rnd(520, 820), 0.6, envGain(t, 0.004, 0.13, 0.09, out));
    noise(t, 0.12, lp, rnd(0.8, 1.1));
    const grit = filter('bandpass', rnd(2300, 3200), 1.4, envGain(t + 0.022, 0.002, 0.035, 0.05, out));
    noise(t + 0.022, 0.07, grit);
  }
  // the weight of the foot
  const th = envGain(t, 0.003, 0.08, 0.06, out);
  const o = osc('sine', 115, t, t + 0.1, th);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
}

function jump(vol: number, pan: number) {
  const t = E!.ctx.currentTime + 0.004;
  const out = strip(vol * 0.9, 0.4, pan, 0.06);
  const bp = filter('bandpass', 500, 1.1, envGain(t, 0.02, 0.09, 0.2, out));
  bp.frequency.exponentialRampToValueAtTime(1700, t + 0.17);
  noise(t, 0.24, bp);
  const pop = envGain(t, 0.004, 0.035, 0.08, out);
  const o = osc('triangle', 300, t, t + 0.12, pop);
  o.frequency.exponentialRampToValueAtTime(540, t + 0.07);
}

function land(vol: number, pan: number) {
  const t = E!.ctx.currentTime + 0.004;
  const out = strip(vol * 0.9, 0.4, pan, 0.05);
  const th = envGain(t, 0.003, 0.24, 0.16, out);
  const o = osc('sine', 120, t, t + 0.22, th);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
  const lp = filter('lowpass', 650, 0.7, envGain(t, 0.002, 0.12, 0.08, out));
  noise(t, 0.1, lp);
}

// The prayer-wheel bell: a small cast-brass bell struck by the wheel's clapper once per turn.
// Bowl-like inharmonic partials (1 : 2.76 : 5.40 : 8.93 : 13.3), each a slightly detuned pair so the tone
// shimmers ("wah-wah" beating) as it rings out, with brightness fading faster than the fundamental.
const BELL_NOTES = [784, 880, 988, 1175, 1319]; // G5 A5 B5 D6 E6 — successive wheels ring a pentatonic tune
const BELL_PARTIALS: readonly [number, number, number, number][] = [
  // ratio, amplitude, decay (s), beat (Hz)
  [1.0, 1.0, 4.4, 1.1],
  [2.756, 0.42, 2.6, 1.9],
  [5.404, 0.2, 1.4, 2.7],
  [8.933, 0.09, 0.7, 3.4],
  [13.34, 0.045, 0.35, 4.1],
];
let lastBell = -1;
function bell(vol: number, pan: number) {
  const { ctx } = E!;
  const t = ctx.currentTime + 0.006;
  let n = (Math.random() * BELL_NOTES.length) | 0;
  if (n === lastBell) n = (n + 1 + ((Math.random() * 3) | 0)) % BELL_NOTES.length;
  lastBell = n;
  const f0 = BELL_NOTES[n] * rnd(0.996, 1.004);
  const out = strip(vol * 0.2, 5, pan, 0.42);
  // gentle high-shelf roll-off keeps it brass, not glass
  const tone = filter('lowpass', 9000, 0.5, out);
  for (const [r, a, d, beat] of BELL_PARTIALS) {
    const f = f0 * r;
    if (f > 16000) continue;
    for (const [df, k] of [[0, 0.62], [beat, 0.38]] as const) {
      const g = envGain(t, 0.0015, a * k, d, tone);
      osc('sine', f + df, t, t + d * 1.25, g);
    }
  }
  // the clapper's strike: a short metallic tick
  const hit = filter('bandpass', 5200, 2.2, envGain(t, 0.0008, 0.3, 0.012, out));
  noise(t, 0.02, hit);
}

function stickSlip(dur: number) {
  // an impulse train whose spacing drifts: the dry squeak of a wooden axle
  const { ctx } = E!;
  const sr = ctx.sampleRate, n = Math.floor(sr * dur);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  let t = 0, gap = rnd(0.0045, 0.006);
  while (t < dur) {
    const i = Math.floor(t * sr);
    if (i < n) d[i] = rnd(0.5, 1) * (Math.random() < 0.5 ? 1 : -1);
    gap *= rnd(1.004, 1.03);
    t += gap * rnd(0.85, 1.15);
  }
  return b;
}

function wheel(vol: number, pan: number) {
  const { ctx } = E!;
  const t = ctx.currentTime + 0.005;
  const out = strip(vol, 1.6, pan, 0.18);
  // whoosh + low rumble of the copper drum turning, wobbling at the rotation rate
  const wob = ctx.createGain(); wob.gain.value = 1; wob.connect(out);
  const lfo = osc('sine', rnd(3, 4.2), t, t + 1.3, ctx.createGain());
  const depth = lfo.context.createGain(); depth.gain.value = 0.35; lfo.disconnect(); lfo.connect(depth).connect(wob.gain);
  const env = ahr(t, 0.1, 0.075, 0.35, 0.7, wob);
  const bp = filter('bandpass', 260, 0.9, env);
  bp.frequency.linearRampToValueAtTime(720, t + 0.3);
  bp.frequency.exponentialRampToValueAtTime(240, t + 1.15);
  const src = ctx.createBufferSource(); src.buffer = E!.brown; src.connect(bp);
  src.start(t, Math.random() * 4, 1.3);
  // axle creak
  const cr = ctx.createBufferSource(); cr.buffer = stickSlip(0.42);
  const ce = ahr(t + 0.04, 0.08, 0.06, 0.18, 0.16, out);
  const f1 = filter('bandpass', rnd(560, 680), 9, ce);
  const f2 = filter('bandpass', rnd(1300, 1500), 11, ce);
  cr.connect(f1); cr.connect(f2);
  cr.start(t + 0.04);
}

function coin(vol: number, pan: number) {
  const t0 = E!.ctx.currentTime + 0.005;
  const out = strip(vol * 0.11, 1, pan, 0.12);
  const hits = [[0, 1], [0.075, 0.55], [0.13, 0.25]] as const;
  for (const [dt, a] of hits) {
    const t = t0 + dt, k = rnd(0.97, 1.03);
    for (const [f, amp, d] of [[2793, 1, 0.38], [4125, 0.6, 0.26], [5937, 0.4, 0.18], [7860, 0.22, 0.1]] as const) {
      osc('sine', f * k, t, t + d * 1.3, envGain(t, 0.001, amp * a, d, out));
    }
    noise(t, 0.01, filter('highpass', 6000, 0.7, envGain(t, 0.0005, 0.25 * a, 0.006, out)));
  }
}

function deny(vol: number, pan: number) {
  const t0 = E!.ctx.currentTime + 0.005;
  const out = strip(vol * 0.07, 0.6, pan, 0.03);
  const lp = filter('lowpass', 750, 0.8, out);
  for (const dt of [0, 0.14]) {
    const t = t0 + dt;
    const g = ahr(t, 0.008, 1, 0.07, 0.04, lp);
    osc('square', 148, t, t + 0.13, g);
    osc('square', 150.5, t, t + 0.13, g);
  }
}

function blip(vol: number, pan: number, base = 540) {
  const t = E!.ctx.currentTime + 0.004;
  const out = strip(vol * 0.06, 0.2, pan, 0.04);
  const f = base * rnd(0.9, 1.15);
  const o = osc('triangle', f, t, t + 0.1, envGain(t, 0.004, 1, 0.07, out));
  o.frequency.exponentialRampToValueAtTime(f * 1.18, t + 0.04);
  osc('sine', f * 2, t, t + 0.06, envGain(t, 0.002, 0.18, 0.03, out));
}

function lamp(vol: number, pan: number) {
  const { ctx } = E!;
  const t = ctx.currentTime + 0.005;
  const out = strip(vol * 0.9, 1, pan, 0.16);
  // the flame catching: a breathy low-pass sweep
  const lp = filter('lowpass', 180, 1.1, ahr(t, 0.06, 0.13, 0.05, 0.45, out));
  lp.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
  lp.frequency.exponentialRampToValueAtTime(520, t + 0.55);
  noise(t, 0.6, lp);
  const o = osc('sine', 82, t, t + 0.35, envGain(t, 0.02, 0.2, 0.25, out));
  o.frequency.exponentialRampToValueAtTime(48, t + 0.28);
  // a few crackles of the wick
  for (let i = 0; i < 5; i++) {
    const tc = t + rnd(0.05, 0.7);
    noise(tc, 0.006, filter('highpass', 3200, 0.8, envGain(tc, 0.0005, rnd(0.03, 0.08), 0.004, out)));
  }
}

function barkOnce(t: number, out: AudioNode, pitch: number) {
  const { ctx } = E!;
  const g = envGain(t, 0.006, 1, 0.14, out);
  const sh = shaper(g);
  const f1 = filter('bandpass', 950 * pitch, 1.3, sh);
  const f2 = filter('bandpass', 1900 * pitch, 2.2, sh);
  const mix = ctx.createGain(); mix.gain.value = 0.9; mix.connect(f1); mix.connect(f2);
  const o = osc('sawtooth', 430 * pitch, t, t + 0.2, mix);
  o.frequency.linearRampToValueAtTime(580 * pitch, t + 0.025);
  o.frequency.exponentialRampToValueAtTime(300 * pitch, t + 0.15);
  const ng = ctx.createGain(); ng.gain.value = 0.35; ng.connect(mix);
  noise(t, 0.16, ng);
}

function bark(vol: number, pan: number, far = false) {
  const t = E!.ctx.currentTime + 0.005;
  const out = strip(vol * (far ? 0.05 : 0.14), 1.2, pan, far ? 0.5 : 0.12);
  const dest = far ? filter('lowpass', 1100, 0.7, out) : out;
  const pitch = rnd(0.85, 1.15);
  barkOnce(t, dest, pitch);
  if (Math.random() < 0.6) barkOnce(t + rnd(0.2, 0.28), dest, pitch * 0.96);
  if (Math.random() < 0.25) barkOnce(t + rnd(0.45, 0.55), dest, pitch * 0.98);
}

function monkey(vol: number, pan: number) {
  const { ctx } = E!;
  const t0 = ctx.currentTime + 0.005;
  const out = strip(vol * 0.075, 1.4, pan, 0.12);
  const n = 4 + ((Math.random() * 5) | 0);
  let t = t0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1 && Math.random() < 0.6;
    const len = last ? 0.2 : rnd(0.045, 0.07);
    const f = rnd(850, 1300) * (last ? 1.35 : 1);
    const g = envGain(t, 0.004, 1, len, out);
    const bp = filter('bandpass', 1600, 2.6, shaper(g));
    const o = osc('sawtooth', f, t, t + len + 0.05, bp);
    o.frequency.exponentialRampToValueAtTime(f * (last ? 1.6 : 1.4), t + len * 0.6);
    if (last) {
      const v = ctx.createOscillator(); v.frequency.value = 22;
      const vd = ctx.createGain(); vd.gain.value = f * 0.06;
      v.connect(vd).connect(o.frequency); v.start(t); v.stop(t + len + 0.05);
    }
    const ng = ctx.createGain(); ng.gain.value = 0.25; ng.connect(bp);
    noise(t, len, ng);
    t += len + rnd(0.04, 0.09);
  }
}

function moo(vol: number, pan: number) {
  const { ctx } = E!;
  const t = ctx.currentTime + 0.01;
  const dur = rnd(1.1, 1.6);
  const out = strip(vol * 0.13, dur + 1, pan, 0.16);
  const env = ahr(t, 0.18, 1, dur - 0.5, 0.32, out);
  const lp = filter('lowpass', 260, 4, env);
  lp.frequency.linearRampToValueAtTime(900, t + 0.42);
  lp.frequency.linearRampToValueAtTime(480, t + dur);
  const form = filter('bandpass', 720, 2, env);
  const fm = ctx.createGain(); fm.gain.value = 0.25; fm.connect(form);
  const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
  const vd = ctx.createGain(); vd.gain.value = 1.6;
  vib.connect(vd); vib.start(t); vib.stop(t + dur + 0.1);
  const f0 = rnd(98, 115);
  for (const k of [1, 1.006]) {
    const o = osc('sawtooth', f0 * k, t, t + dur + 0.1, lp);
    o.connect(fm);
    o.frequency.linearRampToValueAtTime(f0 * 1.22 * k, t + 0.35);
    o.frequency.setValueAtTime(f0 * 1.22 * k, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(f0 * 0.88 * k, t + dur);
    vd.connect(o.frequency);
  }
}

function cawOnce(t: number, out: AudioNode) {
  const { ctx } = E!;
  const len = rnd(0.24, 0.32);
  const g = ahr(t, 0.02, 1, len - 0.12, 0.1, out);
  const sh = shaper(g);
  const f1 = filter('bandpass', 1250, 2.5, sh);
  const f2 = filter('bandpass', 2500, 3, sh);
  const mix = ctx.createGain(); mix.connect(f1); mix.connect(f2);
  const f = rnd(560, 660);
  for (const [type, k] of [['sawtooth', 1], ['square', 1.012]] as const) {
    const o = osc(type, f * 0.85 * k, t, t + len + 0.05, mix);
    o.frequency.linearRampToValueAtTime(f * k, t + 0.04);
    o.frequency.linearRampToValueAtTime(f * 0.82 * k, t + len);
  }
  const ng = ctx.createGain(); ng.gain.value = 0.3; ng.connect(mix);
  noise(t, len, ng);
}

function crow(vol: number, pan: number, far = false) {
  const t = E!.ctx.currentTime + 0.005;
  const out = strip(vol * (far ? 0.03 : 0.06), 1.5, pan, far ? 0.45 : 0.2);
  const dest = far ? filter('lowpass', 1800, 0.7, out) : out;
  cawOnce(t, dest);
  if (Math.random() < 0.65) cawOnce(t + rnd(0.38, 0.5), dest);
  if (Math.random() < 0.2) cawOnce(t + rnd(0.85, 1.0), dest);
}

// a soft major-pentatonic arpeggio with bell-like overtones
const CHIME = [523.25, 659.25, 783.99, 880, 1046.5, 1318.5];
function quest(vol: number, pan: number) {
  const t0 = E!.ctx.currentTime + 0.01;
  const out = strip(vol * 0.075, 3, pan, 0.4);
  CHIME.forEach((f, i) => {
    const t = t0 + i * 0.09;
    const last = i === CHIME.length - 1;
    const d = last ? 2.2 : 1.1;
    osc('sine', f, t, t + d * 1.2, envGain(t, 0.004, last ? 1.1 : 0.9, d, out));
    osc('sine', f * 2, t, t + d * 0.6, envGain(t, 0.002, 0.22, d * 0.45, out));
    osc('sine', f * 3.01, t, t + d * 0.4, envGain(t, 0.002, 0.07, d * 0.25, out));
  });
}

function ui(vol: number, pan: number) {
  const t = E!.ctx.currentTime + 0.003;
  const out = strip(vol * 0.035, 0.15, pan);
  osc('sine', 2100, t, t + 0.05, envGain(t, 0.001, 1, 0.025, out));
  noise(t, 0.008, filter('highpass', 4000, 0.7, envGain(t, 0.0005, 0.6, 0.004, out)));
}

function toggle(vol: number, pan: number) {
  const t = E!.ctx.currentTime + 0.004;
  const out = strip(vol * 0.05, 0.4, pan, 0.12);
  const down = useGame.getState().night;
  const notes = down ? [880, 587.3] : [587.3, 880];
  notes.forEach((f, i) => {
    const ti = t + i * 0.06;
    osc('triangle', f, ti, ti + 0.15, envGain(ti, 0.003, 1, 0.11, out));
  });
}

function honk(vol: number, pan: number, far = true) {
  const t0 = E!.ctx.currentTime + 0.005;
  const out = strip(vol * (far ? 0.045 : 0.08), 1.2, pan, far ? 0.35 : 0.12);
  const lp = filter('lowpass', far ? 1300 : 2200, 0.8, out);
  const pattern = Math.random() < 0.55 ? [[0, 0.2], [0.27, 0.12]] : Math.random() < 0.5 ? [[0, 0.32]] : [[0, 0.1], [0.16, 0.1], [0.32, 0.22]];
  const k = rnd(0.92, 1.08);
  for (const [dt, hold] of pattern) {
    const t = t0 + dt;
    const g = ahr(t, 0.01, 1, hold, 0.05, shaper(lp));
    osc('square', 415 * k, t, t + hold + 0.08, g);
    osc('square', 518 * k, t, t + hold + 0.08, g);
  }
}

const PLAY: Record<SfxName, (vol: number, pan: number) => void> = {
  step: (v, p) => step('step', v, p),
  stepStone: (v, p) => step('stepStone', v, p),
  stepDirt: (v, p) => step('stepDirt', v, p),
  jump, land, bell, wheel, coin, deny,
  talk: (v, p) => blip(v, p),
  lamp,
  bark: (v, p) => bark(v, p),
  monkey, moo,
  crow: (v, p) => crow(v, p),
  quest, ui, toggle,
  honk: (v, p) => honk(v, p, true),
};

// Don't stack dozens of identical sounds in one instant (e.g. several modules reacting to one event).
const lastAt: Partial<Record<SfxName, number>> = {};
const MIN_GAP: Partial<Record<SfxName, number>> = { step: 0.05, stepStone: 0.05, stepDirt: 0.05, ui: 0.03, talk: 0.04, bell: 0.06, quest: 0.3 };

function play(name: SfxName, opts?: Opts) {
  if (!E || E.ctx.state !== 'running' || useGame.getState().muted) return;
  const t = E.ctx.currentTime;
  const gap = MIN_GAP[name] ?? 0.02;
  if ((lastAt[name] ?? -1) > t - gap) return;
  lastAt[name] = t;
  try { PLAY[name]?.(opts?.volume ?? 1, opts?.pan ?? 0); } catch { /* never let audio break the game */ }
}

/** Speech-like blip for the dialogue typewriter; each speaker gets their own pitch. */
export function voiceBlip(speaker: string) {
  if (!E || E.ctx.state !== 'running' || useGame.getState().muted) return;
  let h = 0;
  for (let i = 0; i < speaker.length; i++) h = (h * 31 + speaker.charCodeAt(i)) >>> 0;
  try { blip(0.32, 0, 380 + (h % 9) * 45); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------------------
// Ambient bed

interface Amb {
  day: GainNode; night: GainNode; chant: GainNode;
  wind: { lp: BiquadFilterNode; g: GainNode }[];
  traffic: GainNode;
  next: { bird: number; honk: number; crow: number; dog: number; gust: number };
  chantV: ChantVoice | null;
  chantFar: number;
}

interface ChantVoice {
  srcs: OscillatorNode[];
  freqs: AudioParam[];
  form: BiquadFilterNode[];
  syl: GainNode;
  out: GainNode;
  next: number;
  left: number;
}

let A: Amb | null = null;

function buildAmbient(): Amb {
  const { ctx, amb } = E!;
  const day = ctx.createGain(); day.gain.value = 0; day.connect(amb);
  const night = ctx.createGain(); night.gain.value = 0; night.connect(amb);
  const chant = ctx.createGain(); chant.gain.value = 0; chant.connect(amb);
  const cs = ctx.createGain(); cs.gain.value = 0.35; chant.connect(cs).connect(E!.verb);

  // wind: two decorrelated brown-noise beds, panned apart, each with its own gusting low-pass
  const wind = [-0.65, 0.65].map((pan, i) => {
    const src = ctx.createBufferSource(); src.buffer = E!.brown; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(lp).connect(hp).connect(g).connect(p).connect(amb);
    src.start(0, i * 2.7);
    return { lp, g };
  });

  // far-off town traffic: a low rumble
  const tsrc = ctx.createBufferSource(); tsrc.buffer = E!.brown; tsrc.loop = true;
  const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 170; tlp.Q.value = 0.5;
  const traffic = ctx.createGain(); traffic.gain.value = 0;
  tsrc.connect(tlp).connect(traffic).connect(day);
  tsrc.start(0, 3.1);

  // crickets loop
  const cr = ctx.createBufferSource(); cr.buffer = crickets(ctx); cr.loop = true;
  const cg = ctx.createGain(); cg.gain.value = 0.05;
  const chp = ctx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 2500;
  cr.connect(chp).connect(cg).connect(night);
  cr.start();

  const t = ctx.currentTime;
  return { day, night, chant, wind, traffic, next: { bird: t + 2, honk: t + 9, crow: t + 14, dog: t + 6, gust: t }, chantV: null, chantFar: 0 };
}

function bird(day: AudioNode) {
  const { ctx } = E!;
  const t0 = ctx.currentTime + 0.02;
  const pan = rnd(-0.9, 0.9);
  const out = strip(rnd(0.018, 0.035), 2.5, pan, 0.3, day);
  const kind = Math.random();
  if (kind < 0.45) {
    // sparrow: a few quick descending chips
    const n = 2 + ((Math.random() * 3) | 0), f = rnd(3600, 4600);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * rnd(0.09, 0.14);
      const o = osc('sine', f * rnd(0.97, 1.04), t, t + 0.06, envGain(t, 0.003, 1, 0.045, out));
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.04);
    }
  } else if (kind < 0.85) {
    // bulbul: a liquid little phrase of up-and-down glides
    const n = 3 + ((Math.random() * 3) | 0);
    let t = t0;
    for (let i = 0; i < n; i++) {
      const len = rnd(0.08, 0.16), f = rnd(1700, 2900);
      const o = osc('sine', f, t, t + len + 0.03, ahr(t, 0.01, 1, len * 0.6, len * 0.4, out));
      o.frequency.linearRampToValueAtTime(f * rnd(0.75, 1.3), t + len);
      t += len + rnd(0.02, 0.07);
    }
  } else {
    // a distant two-note whistle
    const f = rnd(1400, 1800);
    for (const [dt, k] of [[0, 1], [0.32, 0.8]] as const) {
      const t = t0 + dt;
      osc('sine', f * k, t, t + 0.3, ahr(t, 0.03, 0.8, 0.14, 0.08, out));
    }
  }
}

const CHANT_F0 = 65.4; // C2 — the deep chant voice

function startChant(a: Amb): ChantVoice {
  const { ctx } = E!;
  const t = ctx.currentTime;
  const out = ctx.createGain(); out.gain.value = 1; out.connect(a.chant);
  const syl = ctx.createGain(); syl.gain.value = 0.5; syl.connect(out);
  // vowel formants ("o" ↔ "a") plus a narrow band on the 10th harmonic: the overtone that rings above the
  // deep chant voice
  const form = [
    filter('bandpass', 360, 3, syl),
    filter('bandpass', 720, 4, syl),
    filter('bandpass', CHANT_F0 * 10, 28, syl),
  ];
  const fg = [1, 0.55, 0.5];
  const pre = ctx.createGain(); pre.gain.value = 1;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.5;
  pre.connect(lp);
  form.forEach((f, i) => { const g = ctx.createGain(); g.gain.value = fg[i]; lp.connect(g).connect(f); });
  // and some of the raw low body
  const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 220;
  const bg = ctx.createGain(); bg.gain.value = 0.5;
  lp.connect(body).connect(bg).connect(syl);
  const srcs: OscillatorNode[] = [];
  const freqs: AudioParam[] = [];
  // several monks: slightly different pitches, one an octave up and quieter
  for (const [k, amp] of [[1, 0.3], [1.004, 0.26], [0.9965, 0.26], [2.003, 0.08]] as const) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = CHANT_F0 * k;
    const g = ctx.createGain(); g.gain.value = amp;
    o.connect(g).connect(pre);
    o.start(t);
    srcs.push(o); freqs.push(o.frequency);
  }
  return { srcs, freqs, form, syl, out, next: t + 0.2, left: 10 };
}

function stopChant(c: ChantVoice) {
  const t = E!.ctx.currentTime;
  for (const o of c.srcs) { try { o.stop(t + 0.1); } catch { /* already stopped */ } }
  setTimeout(() => c.out.disconnect(), 400);
}

/** Schedule the chant's syllables a little ahead: soft accents, vowel changes, breaths between phrases. */
function chantSchedule(c: ChantVoice) {
  const t = E!.ctx.currentTime;
  while (c.next < t + 0.6) {
    const s = c.next;
    if (c.left <= 0) {
      // breath: the group thins out rather than stopping dead
      const br = rnd(1.0, 1.8);
      c.syl.gain.setTargetAtTime(0.12, s, 0.18);
      c.left = 8 + ((Math.random() * 8) | 0);
      // the next phrase may start a step lower or back home
      const k = Math.random() < 0.3 ? 0.944 : 1;
      c.freqs.forEach((f, i) => f.setTargetAtTime(CHANT_F0 * [1, 1.004, 0.9965, 2.003][i] * k, s + br - 0.1, 0.12));
      c.next = s + br;
      continue;
    }
    const len = rnd(0.5, 0.85);
    c.syl.gain.setTargetAtTime(rnd(0.75, 1), s, 0.06);
    c.syl.gain.setTargetAtTime(rnd(0.5, 0.65), s + len * 0.55, 0.12);
    const open = Math.random() < 0.45; // "a" vs "o"
    c.form[0].frequency.setTargetAtTime(open ? 520 : 360, s, 0.08);
    c.form[1].frequency.setTargetAtTime(open ? 900 : 720, s, 0.08);
    c.left--;
    c.next = s + len;
  }
}

const TEMPLE = SPOTS.templeMain;
const CHANT_R = 35;

function tickAmbient() {
  if (!E || E.ctx.state !== 'running') return;
  if (!A) A = buildAmbient();
  const { ctx } = E;
  const t = ctx.currentTime;
  const s = useGame.getState();
  const night = s.night;
  const p = game.player.pos;

  // overall level: quieter on the title screen and while paused
  E.amb.gain.setTargetAtTime(!s.started ? 0.7 : s.paused ? 0.4 : 1, t, 0.6);
  A.day.gain.setTargetAtTime(night ? 0 : 1, t, 1.4);
  A.night.gain.setTargetAtTime(night ? 1 : 0, t, 1.4);

  // traffic hum: strongest round the square and the busy roads near it
  const dSq = Math.hypot(p.x, p.z);
  A.traffic.gain.setTargetAtTime(0.05 * clamp(1.15 - dSq / 70, 0.18, 1), t, 1.5);

  // gusts
  if (t >= A.next.gust) {
    for (const w of A.wind) {
      const strong = Math.random() < 0.25;
      w.lp.frequency.setTargetAtTime(strong ? rnd(700, 1100) : rnd(260, 560), t, rnd(0.8, 1.8));
      w.g.gain.setTargetAtTime((night ? 0.6 : 1) * (strong ? rnd(0.055, 0.08) : rnd(0.02, 0.045)), t, rnd(1, 2));
    }
    A.next.gust = t + rnd(1.5, 4.5);
  }

  if (s.started || true) {
    if (!night && t >= A.next.bird) { bird(A.day); A.next.bird = t + (Math.random() < 0.3 ? rnd(0.4, 1.2) : rnd(2, 7)); }
    if (t >= A.next.honk) {
      if (!night || Math.random() < 0.3) PLAY.honk(clamp(1.1 - dSq / 120, 0.35, 1), rnd(-0.8, 0.8));
      A.next.honk = t + (night ? rnd(40, 90) : rnd(10, 32));
    }
    if (!night && t >= A.next.crow) { crow(1, rnd(-0.9, 0.9), true); A.next.crow = t + rnd(18, 45); }
    if (night && t >= A.next.dog) {
      bark(1, rnd(-0.95, 0.95), true);
      if (Math.random() < 0.35) setTimeout(() => { if (E && useGame.getState().night && !useGame.getState().muted) bark(0.8, rnd(-0.95, 0.95), true); }, rnd(900, 2200));
      A.next.dog = t + rnd(8, 26);
    }
    if (night && t < A.next.dog - 30) A.next.dog = t + rnd(3, 8);
  }

  // temple chant fades in within 35 m of the main hall
  const dT = Math.hypot(p.x - TEMPLE.x, p.z - TEMPLE.z);
  const k = clamp((CHANT_R - dT) / (CHANT_R - 8), 0, 1);
  const level = 0.16 * k * k * (3 - 2 * k);
  if (level > 0.001 && !A.chantV) A.chantV = startChant(A);
  A.chant.gain.setTargetAtTime(level, t, 0.9);
  if (A.chantV) {
    chantSchedule(A.chantV);
    if (level <= 0.001) {
      A.chantFar += 0.2;
      if (A.chantFar > 6) { stopChant(A.chantV); A.chantV = null; A.chantFar = 0; }
    } else A.chantFar = 0;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Lifecycle: unlock on the first gesture, mute, tab visibility

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
let hiddenSuspend = false;

function unlock() {
  try {
    if (!E) E = build();
    if (E.ctx.state === 'suspended' && !document.hidden) E.ctx.resume().catch(() => {});
  } catch { /* no audio available */ }
}

function onVisibility() {
  if (!E) return;
  if (document.hidden) {
    if (E.ctx.state === 'running') { hiddenSuspend = true; E.ctx.suspend().catch(() => {}); }
  } else if (hiddenSuspend) {
    hiddenSuspend = false;
    E.ctx.resume().catch(() => {});
  }
}

const unsubMute = useGame.subscribe((s, prev) => {
  if (!E || s.muted === prev.muted) return;
  const t = E.ctx.currentTime;
  E.master.gain.cancelScheduledValues(t);
  E.master.gain.setTargetAtTime(s.muted ? 0 : MASTER, t, 0.06);
});

for (const g of GESTURES) window.addEventListener(g, unlock, { capture: true, passive: true });
document.addEventListener('visibilitychange', onVisibility);
const timer = window.setInterval(tickAmbient, 200);
setSfxImpl(play);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const g of GESTURES) window.removeEventListener(g, unlock, { capture: true });
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(timer);
    unsubMute();
    setSfxImpl(() => {});
    if (E) { E.ctx.close().catch(() => {}); E = null; A = null; }
  });
}
