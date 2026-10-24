// Small bits of render state shared between the render components (kept out of the .tsx files so React fast
// refresh keeps working when those change).
import type { DirectionalLight } from 'three';

/** The sun (Lighting.tsx), for the render pipeline's warm-up: it opens the shadow frustum over the whole map once. */
export const lightRig = { sun: null as DirectionalLight | null };

/** CPU cost of the render submit (scene + post): smoothed, plus the raw cost of the first frames (shader
 *  builds land there) and of the warm-up. Read by perf probes as window.__render (dev, or ?stats=1), which
 *  also gets `benchPost(n)`: the GPU cost of the two post passes. */
export const renderStats = {
  cpuMs: 0, frames: 0, first: [] as number[], warmMs: 0,
  benchPost: null as null | ((n?: number) => Promise<{ style: number; upscale: number; perDevicePixel: number }>),
};
