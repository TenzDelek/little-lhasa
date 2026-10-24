// A tiny 5-row pixel font (capitals, digits, a little punctuation) for speech bubbles, plus a rasteriser
// for Tibetan script: the browser draws it once at a small size and the result is thresholded to hard
// pixels, so it sits in the same chunky style as the Latin glyphs.

const RAW: Record<string, string> = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
  M: '#...#|##.##|#.#.#|#...#|#...#', N: '#..#|##.#|#.##|#..#|#..#', O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..', Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#...#|#...#|#.#.#|##.##|#...#',
  X: '#.#|#.#|.#.|#.#|#.#', Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
  '0': '###|#.#|#.#|#.#|###', '1': '.#.|##.|.#.|.#.|###', '2': '##.|..#|.#.|#..|###', '3': '##.|..#|.#.|..#|##.',
  '4': '#.#|#.#|###|..#|..#', '5': '###|#..|##.|..#|##.', '6': '.##|#..|###|#.#|###', '7': '###|..#|.#.|.#.|.#.',
  '8': '###|#.#|###|#.#|###', '9': '###|#.#|###|..#|##.',
  '!': '#|#|#|.|#', '?': '##.|..#|.#.|...|.#.', '.': '.|.|.|.|#', ',': '..|..|..|.#|#.', "'": '#|#|.|.|.',
  '-': '...|...|###|...|...', ':': '.|#|.|#|.', '~': '....|.#.#|#.#.|....|....', '₹': '###|.#.|###|.#.|..#',
  ' ': '..|..|..|..|..',
};

interface Glyph { w: number; rows: string[] }
const GLYPHS: Record<string, Glyph> = {};
for (const [k, v] of Object.entries(RAW)) {
  const rows = v.split('|');
  GLYPHS[k] = { w: rows[0].length, rows };
}

export const FONT_H = 5;

/** Width in pixels of a Latin string (1 px between glyphs). */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s.toUpperCase()) w += (GLYPHS[ch] ?? GLYPHS['?']).w + 1;
  return Math.max(0, w - 1);
}

/** Draw a Latin string with its top-left at (x, y). */
export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS['?'];
    for (let r = 0; r < FONT_H; r++) for (let c = 0; c < g.w; c++) if (g.rows[r][c] === '#') ctx.fillRect(cx + c, y + r, 1, 1);
    cx += g.w + 1;
  }
}

/** True if the string contains Tibetan script (U+0F00–U+0FFF). */
export const isTibetan = (s: string) => /[\u0F00-\u0FFF]/.test(s);

export interface Mask { w: number; h: number; bits: Uint8Array }

// ---- the Tibetan web font ----------------------------------------------------------------------------------
// index.html links Noto Serif Tibetan from Google Fonts so every machine draws the same glyphs. Canvas text
// does not wait for web fonts: rasterising before the face has arrived would bake a system fallback (or
// tofu boxes) into the bubble atlas for good. So Tibetan is rasterised only once document.fonts has loaded
// the face for the glyphs we need, or after a timeout (offline: fall back to whatever the system has).
export const TIBETAN_FONT = '"Noto Serif Tibetan"';
const TIBETAN_WEIGHT = 500;
let tibetanReady = false;
let tibetanPending: Promise<void> | null = null;

/** True once Tibetan can be rasterised (web font loaded, or given up waiting). */
export const tibetanFontReady = () => tibetanReady;

/** Resolves when the Tibetan web font is loaded for the glyphs in `sample` (or after `timeoutMs`). */
export function whenTibetanFont(sample: string, timeoutMs = 12000): Promise<void> {
  if (tibetanReady) return Promise.resolve();
  tibetanPending ??= (async () => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts && typeof fonts.load === 'function') {
      const spec = `${TIBETAN_WEIGHT} 14px ${TIBETAN_FONT}`;
      const end = performance.now() + timeoutMs;
      // the stylesheet may still be on its way (no matching face yet): retry until a face loads
      while (performance.now() < end) {
        try { if ((await fonts.load(spec, sample)).length) break; } catch { break; }
        await new Promise((res) => setTimeout(res, 300));
      }
    }
    tibetanReady = true;
  })();
  return tibetanPending;
}

/** Rasterise a Tibetan string into a hard 1-bit mask (cropped to its ink). */
export function rasterScript(s: string, sizePx = 14): Mask {
  const cw = Math.ceil(s.length * sizePx * 0.9) + 8, ch = sizePx * 3;
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = `${TIBETAN_WEIGHT} ${sizePx}px ${TIBETAN_FONT}, "Kailasa", "Noto Sans Tibetan", "Microsoft Himalaya", "Jomolhari", serif`;
  x.textBaseline = 'middle';
  x.fillStyle = '#000';
  x.fillText(s, 2, ch / 2);
  const img = x.getImageData(0, 0, cw, ch).data;
  let x0 = cw, x1 = -1, y0 = ch, y1 = -1;
  const on = (i: number) => img[i * 4 + 3] > 100;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (on(j * cw + i)) {
    if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
  }
  if (x1 < 0) return { w: 1, h: 1, bits: new Uint8Array(1) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const bits = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bits[j * w + i] = on((y0 + j) * cw + x0 + i) ? 1 : 0;
  return { w, h, bits };
}

export function drawMask(ctx: CanvasRenderingContext2D, m: Mask, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.bits[j * m.w + i]) ctx.fillRect(x + i, y + j, 1, 1);
}
