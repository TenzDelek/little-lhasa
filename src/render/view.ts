// Shared render geometry: how big the canvas is, how big one art pixel is, and the low-res target size.
// PixelPipeline writes it on resize; CameraRig reads it to frame and pixel-snap the iso camera.
//
// The low-res target is MARGIN art pixels bigger than the screen on every side. The iso camera snaps to the
// art-pixel grid (so static pixels never shimmer), and the post pass then slides the upscaled picture by the
// part of a pixel the snap removed (`subX/subY`, in whole device pixels), so the town glides smoothly under
// the boy instead of stepping a whole art pixel at a time. `gridX/gridY` is the snapped camera position on
// the art-pixel grid (mod 4), so the post pass can lock its Bayer dither to the world instead of the screen.

export const MARGIN = 1;

export const view = {
  /** Canvas size in device pixels. */
  w: 1, h: 1,
  /** Art-pixel size in device pixels (integer ≥ 2). */
  px: 3,
  /** Art pixels visible on screen (the camera frames exactly this many, plus the margin). */
  lowW: 1, lowH: 1,
  /** Render-target size in art pixels: lowW / lowH plus MARGIN on each side. */
  rtW: 3, rtH: 3,
  /** Sub-art-pixel offset the snap removed, in art pixels (-0.5..0.5; x right, y up). Written by CameraRig. */
  subX: 0, subY: 0,
  /** Snapped camera position on the art-pixel grid, mod 4 (x right, y up). Written by CameraRig. */
  gridX: 0, gridY: 0,
  /** Target number of art-pixel rows (≈ vertical resolution of the "pixel art"). */
  rows: 340,
};

export function computeView(wCss: number, hCss: number, dpr: number) {
  const w = Math.max(2, Math.round(wCss * dpr)), h = Math.max(2, Math.round(hCss * dpr));
  view.w = w; view.h = h;
  // integer art-pixel size so every art pixel is the same size on screen
  view.px = Math.max(2, Math.round(Math.min(h, w * 0.9) / view.rows));
  view.lowW = Math.ceil(w / view.px);
  view.lowH = Math.ceil(h / view.px);
  view.rtW = view.lowW + 2 * MARGIN;
  view.rtH = view.lowH + 2 * MARGIN;
  return view;
}
