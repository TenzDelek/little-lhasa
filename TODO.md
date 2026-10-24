# Left for later

State on 2026-10-24: the game is complete and playable (all four errands finish with real input; see README).
A final fix pass was stopped part-way to save time, so a few things are in but not fully checked.

## Needs checking (changes are in, verification was cut short)
- **Night lighting**: street lamps were brightened (`streetLamp()` in `src/kit/street.ts`: intensity 13→40,
  reach 12→15 m) and the 10-light lamp pool now prefers big street-lamp pools over shop bulbs
  (`src/render/Lighting.tsx`). Walk every road at night and check nothing is blown out; Main Square's own
  posts still carry a ×1.35 multiplier in `src/world/square` that may now be too much.
- **Prayer flags** (`src/kit/flags.tsx`): flags are now chunked per ~40 m so off-screen strings cull, and
  darchor ground strings avoid hanging below 2.2 m over roads, plazas and doorways. Compare draw calls and
  triangles at the square, temple and viewpoint against `shots/review-perf/spots-after.json`, and look for any
  string that vanished or got cut.
- **Signposts** (`signpost()` in `src/kit/street.ts`): the collider is now the raised board plus two thin
  posts, so Tenzin walks under them. Check all seven that used to block pavements, especially (17.1, -42.8)
  at the way into Amala's yard.
- **Forest culling** (`src/world/hillside/forestView.ts`): trees outside the padded view are no longer drawn.
  Rotate the iso camera (Q/R) at the square and the temple and watch the screen edges for popping.
- Rerun the QA bots after the above: `shots/review-qa/physics.mjs`, `cams.mjs`, `chasewall.mjs`
  (the bus repro at (10.6, 6.9)), and `shots/fix-people-animals/errands.mjs`.

## Not started
- Load time: `src/core/geom.ts` Parts primitives are most of the kit's build cost. Share one index
  `BufferAttribute` across boxes and reuse a cached all-zero `emit` array (output stays identical).
- `src/world/ground/fields.ts` still does ~100 ms of work at import time; a build-time bake would remove it.
- Chase camera: non-occludable small props and tree trunks can still block the view when the camera passes
  behind them.
- From the review pass's known issues: the Mani Lhakhang's base is ~44% hidden from iso azimuth 2; direction
  boards use 1-px letters and are hard to read at steep angles; Tibetan speech bubbles are larger than the
  Latin ones (14 px is the smallest legible size).
