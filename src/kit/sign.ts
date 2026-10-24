// Shop signs: small canvas textures drawn at art-pixel resolution (nearest filtering), English in a pixel
// font and optional Tibetan script, glowing a little at night.
//
// API CONTRACT — keep stable; only add optional fields.
//   const m = makeSign({ text: 'MOMO', bod: 'མོག་མོག', bg: PAL.templeRed, fg: PAL.templeYellow });
//   m.position.set(...); m.rotation.y = yaw; scene.add(m)   // a thin board facing local +z, centred
//
// One texel = one art pixel (≈ 4.4 cm), so a 1.2 m board is ~27 px wide. The English line uses a built-in
// 3x5 bitmap font (scaled ×2/×3 when the board is big enough); the Tibetan line is drawn with the system's
// Tibetan font at ~10 px and thresholded so it reads as crisp pixel script.
//
// Every sign is one Mesh (board + frame in one geometry, one material). Many signs in one area → call
// mergeSigns(meshes) to pack them into one atlas and one draw call.
import {
  BufferGeometry, BoxGeometry, CanvasTexture, Float32BufferAttribute, Mesh, NearestFilter, SRGBColorSpace,
  type Object3D, type Texture,
} from 'three';
import type { MeshLambertNodeMaterial, Node } from 'three/webgpu';
import { attribute, positionLocal, texture, uv, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from '../core/materials';
import { PAL } from '../core/palette';
import { U } from '../core/uniforms';

export interface SignSpec {
  /** Short English text (≤ 10 chars reads best at this resolution). */
  text: string;
  /** Optional Tibetan-script line. */
  bod?: string;
  /** Board and letter colours (sRGB hex). */
  bg?: number;
  fg?: number;
  /** Board size in metres (default sized from the text). */
  w?: number;
  h?: number;
  /** Glow at night (lit signboard). Default true. */
  glow?: boolean;
  /** 3D frame / edge colour (default: a dark shade of the board). */
  frame?: number;
  /** Thin painted border line just inside the frame, in the letter colour (default: on for boards ≥ 12 px tall). */
  border?: boolean;
  /** Tibetan line below the English instead of above it. */
  bodBelow?: boolean;
  /** Board thickness (m), default 0.05. */
  depth?: number;
}

/** Metres per art pixel (matches the default iso zoom). */
export const SIGN_PX = 0.044;

// ---- pixel font (3x5, a few wide letters) ---------------------------------------------------------------
const GLYPHS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['###', '#.#', '#.#', '#.#', '###'], P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '.': ['.', '.', '.', '.', '#'], ',': ['.', '.', '.', '#', '#'], '-': ['...', '...', '###', '...', '...'],
  "'": ['#', '#', '.', '.', '.'], '!': ['#', '#', '#', '.', '#'], ':': ['.', '#', '.', '#', '.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], '+': ['...', '.#.', '###', '.#.', '...'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'],
  '*': ['...', '#.#', '.#.', '#.#', '...'], '|': ['#', '#', '#', '#', '#'],
};
const SPACE_W = 2;

function glyph(ch: string): string[] | null {
  return GLYPHS[ch.toUpperCase()] ?? null;
}
/** Width in font pixels (scale 1) of a line of text, 1 px between glyphs. */
export function textWidthPx(text: string): number {
  let w = 0, first = true;
  for (const ch of text) {
    const g = glyph(ch);
    const gw = ch === ' ' || !g ? SPACE_W : g[0].length;
    w += gw + (first ? 0 : 1);
    first = false;
  }
  return w;
}
function drawText(ctx: CanvasRenderingContext2D, text: string, x0: number, y0: number, s: number) {
  let x = x0, first = true;
  for (const ch of text) {
    if (!first) x += s;
    first = false;
    const g = glyph(ch);
    if (ch === ' ' || !g) { x += SPACE_W * s; continue; }
    for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') ctx.fillRect(x + c * s, y0 + r * s, s, s);
    x += g[0].length * s;
  }
}

// ---- colour helpers ----------------------------------------------------------------------------------------
const hexCss = (h: number) => '#' + h.toString(16).padStart(6, '0');
const luma = (h: number) => (0.299 * ((h >> 16) & 255) + 0.587 * ((h >> 8) & 255) + 0.114 * (h & 255)) / 255;
function shadeHex(h: number, k: number) {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((h >> 16) & 255) << 16) | (f((h >> 8) & 255) << 8) | f(h & 255);
}

// ---- Tibetan line ------------------------------------------------------------------------------------------
const BOD_FONT = "'Noto Serif Tibetan', 'Kailasa', 'BabelStone Tibetan', 'Microsoft Himalaya', serif";
let scratch: HTMLCanvasElement | null = null;

/** Draw Tibetan text thresholded to crisp pixels, centred in the box (x, y, w, h). */
function drawBod(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, fg: number) {
  if (!scratch) scratch = document.createElement('canvas');
  const sw = Math.max(4, w), sh = Math.max(4, h * 2);
  scratch.width = sw; scratch.height = sh;
  const s = scratch.getContext('2d', { willReadFrequently: true })!;
  let size = Math.max(7, Math.round(h * 1.25));
  s.font = `${size}px ${BOD_FONT}`;
  let m = s.measureText(text);
  while (m.width > w - 1 && size > 7) { size--; s.font = `${size}px ${BOD_FONT}`; m = s.measureText(text); }
  s.clearRect(0, 0, sw, sh);
  s.fillStyle = '#fff';
  s.textBaseline = 'alphabetic';
  s.textAlign = 'center';
  const asc = m.actualBoundingBoxAscent || size * 0.7, desc = m.actualBoundingBoxDescent || size * 0.3;
  const base = Math.round(sh / 2 + (asc - desc) / 2);
  s.fillText(text, sw / 2, base);
  const img = s.getImageData(0, 0, sw, sh).data;
  // find the inked rows, then centre them vertically in the target box
  let r0 = sh, r1 = -1;
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) if (img[(j * sw + i) * 4 + 3] > 110) { r0 = Math.min(r0, j); r1 = Math.max(r1, j); break; }
  if (r1 < 0) return;
  const inkH = r1 - r0 + 1;
  const oy = y + Math.floor((h - Math.min(h, inkH)) / 2) - r0;
  ctx.fillStyle = hexCss(fg);
  for (let j = r0; j <= r1; j++) {
    const ty = j + oy;
    if (ty < y || ty >= y + h) continue;
    for (let i = 0; i < sw; i++) if (img[(j * sw + i) * 4 + 3] > 110) ctx.fillRect(x + i, ty, 1, 1);
  }
}

// ---- layout / drawing -----------------------------------------------------------------------------------
interface Drawn { tex: Texture; canvas: HTMLCanvasElement; cw: number; ch: number; w: number; h: number; key: string }
const texCache = new Map<string, Drawn>();

/** Board size in metres for a spec (what makeSign will build). */
export function signSize(spec: SignSpec): { w: number; h: number } {
  const L = layoutPx(spec);
  return { w: L.cw * SIGN_PX, h: L.ch * SIGN_PX };
}

function layoutPx(spec: SignSpec) {
  const tw = textWidthPx(spec.text);
  const hasBod = !!spec.bod;
  const bodW = hasBod ? Math.min(60, Math.round(spec.bod!.length * 3.2) + 2) : 0;
  const cw = spec.w ? Math.max(6, Math.round(spec.w / SIGN_PX)) : Math.max(tw, bodW) + 6;
  const ch = spec.h ? Math.max(6, Math.round(spec.h / SIGN_PX)) : hasBod ? 20 : 9;
  return { cw, ch, tw };
}

function draw(spec: SignSpec): Drawn {
  const key = JSON.stringify([spec.text, spec.bod, spec.bg, spec.fg, spec.w, spec.h, spec.frame, spec.border, spec.bodBelow]);
  const hit = texCache.get(key);
  if (hit) return hit;
  const bg = spec.bg ?? PAL.templeRed;
  const fg = spec.fg ?? (luma(bg) < 0.55 ? PAL.templeYellow : PAL.windowFrame);
  const frame = spec.frame ?? shadeHex(bg, 0.5);
  const { cw, ch, tw } = layoutPx(spec);
  // one extra column on the right holds the frame / back colours (sampled by the board's sides and frame)
  const canvas = document.createElement('canvas');
  canvas.width = cw + 1; canvas.height = Math.max(ch, 2);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = hexCss(bg);
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = hexCss(frame);
  ctx.fillRect(cw, 0, 1, canvas.height);
  ctx.fillStyle = hexCss(shadeHex(frame, 0.8));
  ctx.fillRect(cw, 1, 1, 1);

  // subtle weathering: a slightly lighter top row and a darker bottom row (sun-faded paint)
  ctx.fillStyle = hexCss(shadeHex(bg, 1.08));
  ctx.fillRect(0, 0, cw, 1);
  ctx.fillStyle = hexCss(shadeHex(bg, 0.86));
  ctx.fillRect(0, ch - 1, cw, 1);

  const border = spec.border ?? ch >= 12;
  if (border && cw >= 10) {
    ctx.fillStyle = hexCss(fg);
    ctx.fillRect(1, 1, cw - 2, 1); ctx.fillRect(1, ch - 2, cw - 2, 1);
    ctx.fillRect(1, 1, 1, ch - 2); ctx.fillRect(cw - 2, 1, 1, ch - 2);
  }
  const inset = border ? 3 : 2;
  const innerW = cw - inset * 2, innerH = ch - inset * 2;

  // vertical zones: Tibetan (≈ 55 %) and English
  let enY = inset, enH = innerH, bodY = 0, bodH = 0;
  if (spec.bod) {
    // big boards get double-size English under a ~9-12 px Tibetan line; smaller ones split ~55/45
    const big = tw * 2 <= innerW && innerH >= 19;
    bodH = big ? Math.min(12, innerH - 11) : Math.max(7, Math.min(13, Math.round(innerH * 0.56)));
    enH = innerH - bodH - 1;
    if (enH < 5) { enH = 5; bodH = Math.max(5, innerH - 6); }
    if (spec.bodBelow) { enY = inset; bodY = inset + enH + 1; }
    else { bodY = inset; enY = inset + bodH + 1; }
  }
  // English: largest integer scale that fits
  let s = 1;
  while (s < 4 && tw * (s + 1) <= innerW && 5 * (s + 1) <= enH) s++;
  let text = spec.text;
  while (text.length > 1 && textWidthPx(text) > cw - 2) text = text.slice(0, -1);
  const twS = textWidthPx(text) * s;
  ctx.fillStyle = hexCss(fg);
  drawText(ctx, text, Math.floor((cw - twS) / 2), enY + Math.floor((enH - 5 * s) / 2), s);
  if (spec.bod) drawBod(ctx, spec.bod, inset, bodY, innerW, bodH, fg);

  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter; tex.minFilter = NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  const d: Drawn = { tex, canvas, cw, ch, w: cw * SIGN_PX, h: ch * SIGN_PX, key };
  texCache.set(key, d);
  return d;
}

// ---- geometry ----------------------------------------------------------------------------------------------
/** Board (front face samples the text, other faces the frame texel) + a slightly larger frame behind it. */
function signGeometry(d: Drawn, depth: number, glow: number): BufferGeometry {
  const tw = d.cw + 1;
  const uFront = d.cw / tw;
  const frameU = (d.cw + 0.5) / tw, frameV = 1 - 0.5 / d.canvas.height;
  const backV = 1 - 1.5 / d.canvas.height;

  const board = new BoxGeometry(d.w, d.h, depth);
  const uvA = board.attributes.uv;
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 verts each)
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 4) uvA.setXY(i, uvA.getX(i) * uFront, uvA.getY(i));
    else uvA.setXY(i, frameU, f === 5 ? backV : frameV);
  }
  const f = SIGN_PX; // frame lip = one art pixel
  const frame = new BoxGeometry(d.w + 2 * f, d.h + 2 * f, depth * 0.6);
  frame.translate(0, 0, -depth * 0.35);
  const uvB = frame.attributes.uv;
  for (let i = 0; i < uvB.count; i++) uvB.setXY(i, frameU, frameV);

  const g = mergeGeometries([board, frame], false)!;
  board.dispose(); frame.dispose();
  const n = g.attributes.position.count;
  const gl = new Float32Array(n);
  // only the printed face glows
  for (let i = 0; i < 4; i++) gl[16 + i] = glow;
  g.setAttribute('glow', new Float32BufferAttribute(gl, 1));
  g.computeBoundingSphere();
  return g;
}

const matCache = new Map<Texture, MeshLambertNodeMaterial>();
/** TSL Lambert material sampling the sign texture; glows with U.night where the `glow` attribute is set. */
export function signMaterial(tex: Texture): MeshLambertNodeMaterial {
  const hit = matCache.get(tex);
  if (hit) return hit;
  // positionNode makes mat() return a fresh (uncached) material that still has the see-through cut
  const m = mat({ vertexColors: false, grain: 0, occlude: true, positionNode: positionLocal });
  const t = texture(tex, uv());
  m.colorNode = vec4(t.rgb, 1);
  const glow = attribute<'float'>('glow', 'float');
  (m as unknown as { emissiveNode: Node }).emissiveNode = t.rgb.mul(glow.mul(U.night).mul(0.75));
  matCache.set(tex, m);
  return m;
}

export function makeSign(spec: SignSpec): Mesh {
  const d = draw(spec);
  const geo = signGeometry(d, spec.depth ?? 0.05, spec.glow === false ? 0 : 1);
  const m = new Mesh(geo, signMaterial(d.tex));
  m.castShadow = d.w * d.h > 0.15;
  m.receiveShadow = true;
  m.name = 'sign:' + spec.text;
  m.userData.kitSign = { key: d.key, canvas: d.canvas };
  return m;
}

/**
 * Merge every makeSign() mesh in `objects` into one mesh with a shared texture atlas (one draw call).
 * Uses each mesh's current position / rotation / scale (they must not be parented yet). Returns the new
 * list: the merged mesh plus every non-sign object untouched.
 */
export function mergeSigns(objects: Object3D[]): Object3D[] {
  const signs: Mesh[] = [], rest: Object3D[] = [];
  for (const o of objects) {
    if ((o as Mesh).isMesh && o.userData.kitSign && !o.parent) signs.push(o as Mesh); else rest.push(o);
  }
  if (signs.length < 2) return objects;
  // shelf-pack the distinct canvases
  const slots = new Map<string, { c: HTMLCanvasElement; x: number; y: number }>();
  const AW = 512;
  let x = 0, y = 0, rowH = 0;
  for (const s of signs) {
    const { key, canvas } = s.userData.kitSign as { key: string; canvas: HTMLCanvasElement };
    if (slots.has(key)) continue;
    if (x + canvas.width > AW) { x = 0; y += rowH + 1; rowH = 0; }
    slots.set(key, { c: canvas, x, y });
    x += canvas.width + 1; rowH = Math.max(rowH, canvas.height);
  }
  const AH = y + rowH;
  const atlas = document.createElement('canvas');
  atlas.width = AW; atlas.height = Math.max(1, AH);
  const ctx = atlas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const sl of slots.values()) ctx.drawImage(sl.c, sl.x, sl.y);

  const geos: BufferGeometry[] = [];
  for (const s of signs) {
    const sl = slots.get((s.userData.kitSign as { key: string }).key)!;
    const g = s.geometry.clone();
    const uvs = g.attributes.uv;
    const cw = sl.c.width, ch = sl.c.height;
    for (let i = 0; i < uvs.count; i++) {
      const u = uvs.getX(i), v = uvs.getY(i);
      uvs.setXY(i, (sl.x + u * cw) / AW, 1 - (sl.y + (1 - v) * ch) / AH);
    }
    s.updateMatrix();
    g.applyMatrix4(s.matrix);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  merged.computeBoundingSphere();
  const tex = new CanvasTexture(atlas);
  tex.magFilter = NearestFilter; tex.minFilter = NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(merged, signMaterial(tex));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'signs';
  return [mesh, ...rest];
}
