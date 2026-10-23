# Little Lhasa ལྷ་ས་ཆུང་ཆུང་།

A pixel-art walk through McLeod Ganj (Dharamshala, India). You play Tenzin, a Tibetan boy in a chuba, running
errands on a busy day in "Little Lhasa": turn the prayer wheels at the Tsuglagkhang, fetch momos for Amala, light
butter lamps, and help Pema find her puppy.

Built with React Three Fiber and three.js r186 **WebGPU + TSL**. Every frame renders into a low-resolution
target and goes through a TSL pixel-art pass (nearest upscale, luma bands, 4×4 Bayer dither, cool shadows and
warm highlights). The style is a sibling of [Gorshey](https://tenzdelek.github.io/Gorshey/gorshey).

## Run

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. A WebGPU browser (Chrome / Edge / Safari 26+) is best. three falls back to WebGL 2
automatically elsewhere.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move | WASD / arrows | left joystick |
| Run | Shift | push the joystick all the way |
| Jump | Space | JUMP |
| Interact / talk / next line | E (or Enter) | ✋ |
| Camera: isometric ⇄ chase | C | CAM |
| Rotate (iso) / orbit (chase) | Q / R, or drag | ⟲ ⟳ / drag |
| Zoom | mouse wheel | |
| Day / night | N | button |
| Errands | J | button |
| Pause | Esc / P | button |
| Mute | M | button |

## Project layout

```
src/
  core/        engine helpers: math, palette, TSL helpers + shared uniforms, materials (mat / partsMaterial),
               Parts geometry builder, collision world, interactions, lamps, input, per-frame game state
  render/      PixelPipeline (TSL post pass), CameraRig (iso + chase), Lighting (sun/moon + lamp pool), sky
  game/        zustand store (saved progress), quests, game clock + hotkeys, debug URL params
  player/      Tenzin's controller and character spec
  characters/  rig.ts (people kit: rigid-skinned procedural characters), npcs/, animals/
  kit/         shared builders: McLeod-style buildings + signs, prayer flags, street furniture
  world/       layout.ts (the town plan), terrain.ts (heights, zones), and one folder per district:
               ground/, square/, market/, temple/, hillside/, props/
  ui/          HUD, title, dialogue, errand log, touch controls
  audio/       sfx API + procedural WebAudio synth
scripts/       shot.mjs (headless screenshots), crop.py (nearest-neighbour zoom)
```

## Debug URL parameters

`?spot=templeGate` (any name in `SPOTS`), `?x=..&z=..`, `?cam=chase`, `?az=0..3`, `?zoom=0..4`, `?night=1`,
`?colliders=1` (wire boxes), `?kit=1` (kit showroom), `?shot=1` (auto-start, no HUD).

```bash
node scripts/shot.mjs --spot templeGate --night --out shots/temple-night.png
```

Progress is saved in `localStorage`. Reset it from the pause menu.
