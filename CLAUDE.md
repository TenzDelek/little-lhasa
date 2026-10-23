# Little Lhasa — a pixel-art walk through McLeod Ganj

A browser game: Tenzin, a Tibetan boy in a chuba, walks, runs and jumps around a stylised McLeod Ganj
(Dharamshala, India) — Main Square, Temple Road, Jogiwara Road, the Tsuglagkhang temple and its kora,
Bhagsu Road, Dharamkot Road. Isometric diorama camera (default) and a third-person chase camera (C).
Day / night (N). NPCs, animals, prayer wheels, momo stalls, butter lamps, four small errands.

Art direction is the sibling of Gorshey (https://tenzdelek.github.io/Gorshey/gorshey): low-poly, flat
vertex-coloured primitives rendered into a low-res target and upscaled with nearest sampling, luma bands,
4x4 Bayer dither, cool shadows / warm highlights. Muted, warm, lived-in colours. Tibetan details must be
respectful and accurate (clockwise kora, lungta colour order blue-white-red-green-yellow, monks in maroon
and saffron, women's pangden aprons only on women, etc.).

## Stack
- React 19 + @react-three/fiber 9, three r186 **WebGPURenderer + TSL** (`three/webgpu`, `three/tsl`). No GLSL,
  no ShaderMaterial, no onBeforeCompile, no drei. Node materials only (classic Mesh*Material also auto-converts).
- zustand store (`src/game/store.ts`), TypeScript strict.

## Commands
- Dev server: already running at http://localhost:5179 (Vite, HMR). If it is down, start your own in the
  background: `npx vite --port 5180 --strictPort` and pass `--url http://localhost:5180` to the shot script.
- Type-check: `npx tsc -p tsconfig.app.json --noEmit` (other modules may be mid-edit; only your files must be clean).
- Screenshot: `node scripts/shot.mjs --spot templeGate --out shots/<you>/temple.png` then Read the PNG.
  Flags: `--spot NAME | --x N --z N`, `--yaw`, `--cam iso|chase`, `--az 0..3` (iso rotation), `--zoom 0..4`,
  `--night`, `--colliders` (wire boxes for every collider). Prints page console errors — fix any from your code.
  Always look at your work from at least two iso azimuths and at night before calling it done.

## World conventions (read src/world/layout.ts and src/world/terrain.ts first)
- Metres, y up, NORTH = -z, EAST = +x. Main Square at origin. Town slopes down to the south.
- `ROADS`, `PLAZAS`, `SPOTS` (named places), `QUEST`/`NPC_IDS`/`ITEMS` ids live in layout.ts. Helpers:
  `roadFrame(road, s)` / `along(road, s0, s1, step)` give centre, tangent, right-normal (nx, nz), height, yaw.
- `groundY(x, z)` ground height; `roadQuery(x, z)` nearest road (edge distance, lateral side); `plazaQuery`;
  `worldMask` (diorama rim). Keep roads and plazas walkable — build beside them, never on them (except
  stalls/props that belong on a pavement edge, and things the brief explicitly puts there).
- Rotation convention: `rotation.y = yaw`, an object with yaw 0 faces +z (south). `yaw = atan2(dx, dz)`.
- Scale: one art pixel ≈ 4.4 cm at default zoom. Details under ~4 cm vanish; 1-px details (eyes, window
  bars, flag strings) are good. Tenzin is 1.3 m tall, adults 1.55–1.8 m, doors ~2.0 m, storeys ~2.9 m.

## How to build things
- Geometry: `Parts` (src/core/geom.ts) — boxes / cylinders / prisms / tapers with flat sRGB vertex colours
  from `PAL` (src/core/palette.ts), optional glow (`emit`, `emitNight`). Merge static stuff per area with
  `parts.toMeshes(partsMaterial({ occlude: true }), 24)`. Repeated items → InstancedMesh with `mat()`.
- Materials: always `mat()` / `partsMaterial()` (src/core/materials.ts): flat Lambert + grain. Set
  `occlude: true` on buildings, walls, roofs, tree canopies, tall props (they dither away when they hide the
  boy). Never on ground, characters or small props. Custom vertex animation (wind) via `positionNode` with TSL.
- TSL: assignments (`toVar`, `assign`, `addAssign`, `If`) only inside `Fn(() => …)()`. Shared uniforms in
  `src/core/uniforms.ts` (`U.time`, `U.night`, `U.player`, `U.wind`, …). Helpers in `src/core/tsl.ts`.
- Collision (src/core/collision.ts): every solid thing registers a collider in a `useEffect` with cleanup:
  `collision.addBox({ x, z, w, d, rot, y0, y1 })`, `addCircle`, `addDynamic` (moving). Tops are standable;
  anything ≤ 0.4 m above the feet is stepped onto. Leave doors closed (walls are solid).
- Night lights: `lamps.add({ x, y, z, color, intensity, distance })` (src/core/lamps.ts) — never create your
  own PointLights. Draw the bulb/flame with emissive (`emit` + `emitNight` in Parts).
- Interactions: `useInteractable(() => ({ id, pos, radius, label, onInteract }), deps)` (src/core/interact.ts).
- Game state: `G()` / `useGame` (src/game/store.ts): `say()` dialogue, `emit()` events, `toast()`, items,
  rupees. Quest rules live in src/game/quests.ts — call `talkTo()` / `buy()` from there, emit the events
  documented there (`spinWheel` with group 'temple' for the Tsuglagkhang row, `lightLamp`, `found`, …).
- Sound: `sfx('bell')` etc. (src/audio/sfx.ts). Never make your own AudioContext.
- Per-frame: `useFrame((_, raw) => { const dt = game.dt; … })` — use `game.dt` (0 while paused / on the title
  screen), `game.time`, `game.player`. No allocations per frame in hot paths. Build geometry in `useMemo`;
  side effects (colliders, lamps, interactables) in `useEffect` with cleanup (React StrictMode mounts twice).
- Performance budget per module: ≲ 40 draw calls (merge!), ≲ 300k triangles, no per-frame CPU geometry
  rebuilds, castShadow only on things bigger than ~0.3 m.

## Ownership (parallel builders share one working tree)
Only edit files inside the folder you were given. Core files (src/core, src/render, src/game, src/world/
layout.ts, src/world/terrain.ts, src/world/World.tsx, src/player, src/characters/rig.ts) belong to the lead:
if you need a change there, work around it and describe the change in your final report. Keep your module
compiling at all times (develop new pieces in new files, import them once they type-check) — a broken file
blanks the game for everyone. Put screenshots under `shots/<your-module>/`.
