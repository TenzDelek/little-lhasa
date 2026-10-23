// Shared render geometry: how big the canvas is, how big one art pixel is, and the low-res target size.
// PixelPipeline writes it on resize; CameraRig reads it to frame and pixel-snap the iso camera.

export const view = {
  /** Canvas size in device pixels. */
  w: 1, h: 1,
  /** Art-pixel size in device pixels (integer ≥ 2). */
  px: 3,
  /** Low-res render target size (art pixels). */
  lowW: 1, lowH: 1,
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
  return view;
}
