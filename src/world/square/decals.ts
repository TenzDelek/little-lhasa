// Text decals for the square: one canvas atlas (taxi boards, number plates, bus livery lettering, the mantra
// on the great prayer wheel, stall boards…) and a quad builder that merges every decal into ONE mesh, so all
// the small lettering on the square costs a single draw call.
//
//   const atlas = squareAtlas();                         // drawn once
//   const d = new Decals(atlas);
//   p.group([x, y, z], yaw, () => d.quad(p.matrix, [0, 1.2, 0.9], 0.5, 0.12, 'plate0'));
//   scene.add(d.toMesh());
import {
  BufferGeometry, CanvasTexture, CylinderGeometry, Float32BufferAttribute, Matrix4, Mesh, NearestFilter,
  SRGBColorSpace, Vector3, type Material, Euler,
} from 'three';
import { mat } from '../../core/materials';
import type { V3 } from '../../core/geom';

export interface Region { u0: number; v0: number; u1: number; v1: number; aspect: number }

const W = 1024, H = 1024;
const FONT_LAT = '"Helvetica Neue", Arial, sans-serif';
const FONT_BOD = '"Kailasa", "Noto Sans Tibetan", "Microsoft Himalaya", "Jomolhari", serif';
const FONT_DEV = '"Kohinoor Devanagari", "Devanagari Sangam MN", "Noto Sans Devanagari", "Mangal", sans-serif';
export const MANTRA = 'ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ།';

const css = (hex: number) => '#' + hex.toString(16).padStart(6, '0');

export interface Atlas { tex: CanvasTexture; regions: Record<string, Region>; material: Material }

interface TextOpts {
  bg: number; fg: number;
  font?: 'lat' | 'bod' | 'dev';
  bold?: boolean;
  /** Second line under the first (smaller). */
  sub?: string; subFont?: 'lat' | 'bod' | 'dev';
  /** Border colour (1 px frame). */
  border?: number;
  /** Repeat the text n times across the width. */
  repeat?: number;
  /** Fraction of the height used by the glyphs. */
  fill?: number;
}

let cached: Atlas | null = null;

/** The square's decal atlas (built once, shared). */
export function squareAtlas(): Atlas {
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const regions: Record<string, Region> = {};
  let cx = 0, cy = 0, rowH = 0;
  const alloc = (w: number, h: number) => {
    if (cx + w > W) { cx = 0; cy += rowH + 2; rowH = 0; }
    const at = { x: cx, y: cy };
    cx += w + 2; rowH = Math.max(rowH, h);
    return at;
  };
  const fam = (f?: 'lat' | 'bod' | 'dev') => (f === 'bod' ? FONT_BOD : f === 'dev' ? FONT_DEV : FONT_LAT);
  const fitText = (s: string, x: number, y: number, w: number, h: number, font: string, bold: boolean) => {
    g.font = `${bold ? 'bold ' : ''}${Math.round(h)}px ${font}`;
    const m = g.measureText(s);
    const sc = Math.min(1, (w * 0.94) / Math.max(1, m.width));
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.scale(sc, 1);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s, 0, 0);
    g.restore();
  };
  const text = (key: string, s: string, w: number, h: number, o: TextOpts) => {
    const at = alloc(w, h);
    g.fillStyle = css(o.bg); g.fillRect(at.x, at.y, w, h);
    if (o.border !== undefined) { g.strokeStyle = css(o.border); g.lineWidth = 2; g.strokeRect(at.x + 1, at.y + 1, w - 2, h - 2); }
    g.fillStyle = css(o.fg);
    const fill = o.fill ?? 0.78;
    const n = o.repeat ?? 1;
    const lines = o.sub ? 2 : 1;
    const lh = h / lines;
    for (let i = 0; i < n; i++) {
      const x0 = at.x + (w / n) * i;
      fitText(s, x0, at.y + (lh * (1 - fill)) / 2, w / n, lh * fill, fam(o.font), o.bold !== false);
      if (o.sub) fitText(o.sub, x0, at.y + lh + (lh * (1 - fill)) / 2, w / n, lh * fill, fam(o.subFont), o.bold !== false);
    }
    regions[key] = { u0: at.x / W, v0: 1 - (at.y + h) / H, u1: (at.x + w) / W, v1: 1 - at.y / H, aspect: w / h };
  };
  const paint = (key: string, w: number, h: number, draw: (x: number, y: number) => void) => {
    const at = alloc(w, h);
    draw(at.x, at.y);
    regions[key] = { u0: at.x / W, v0: 1 - (at.y + h) / H, u1: (at.x + w) / W, v1: 1 - at.y / H, aspect: w / h };
  };

  // --- the great wheel's mantra band (wraps a cylinder; 3 repeats around) ---
  paint('mantraBand', 1024, 64, (x, y) => {
    g.fillStyle = css(0x8b1e2d); g.fillRect(x, y, 1024, 64);
    g.fillStyle = css(0xd9a23a); g.fillRect(x, y, 1024, 4); g.fillRect(x, y + 60, 1024, 4);
    g.fillStyle = css(0xf0c24a);
    for (let i = 0; i < 3; i++) fitText(MANTRA, x + (1024 / 3) * i, y + 8, 1024 / 3, 48, FONT_BOD, false);
  });
  // --- lettering ---
  text('mantraPlaque', MANTRA, 320, 48, { bg: 0x6e1f2a, fg: 0xf0c24a, font: 'bod', bold: false, border: 0xd9a23a, fill: 0.8 });
  text('mantraGold', MANTRA, 256, 40, { bg: 0xd9a23a, fg: 0x6e1f2a, font: 'bod', bold: false, fill: 0.86 });
  const plates = ['HP 39 C 4821', 'HP 68 A 1047', 'HP 39 B 7712', 'HP 40 2265', 'HP 39 D 0918'];
  plates.forEach((s, i) => text('plate' + i, s, 120, 24, { bg: 0xf1c232, fg: 0x1d1a1a, border: 0x1d1a1a, fill: 0.8 }));
  text('hrtcHindi', 'हिमाचल पथ परिवहन निगम', 384, 40, { bg: 0xf1ead2, fg: 0xb52a2a, font: 'dev', fill: 0.84 });
  text('hrtcLogo', 'HRTC', 96, 40, { bg: 0xf1ead2, fg: 0xb52a2a, fill: 0.86 });
  text('busNo', '2471', 64, 28, { bg: 0xf1ead2, fg: 0x1d1a1a, fill: 0.8 });
  text('busHindi', 'मैक्लोडगंज बस अड्डा', 256, 32, { bg: 0x7e786f, fg: 0xf3efe6, font: 'dev', fill: 0.84 });
  text('chaiHindi', 'चाय', 64, 36, { bg: 0x3d5f86, fg: 0xf1c232, font: 'dev', fill: 0.86 });
  text('kioskDrink', 'COLD DRINK', 160, 32, { bg: 0xc8322b, fg: 0xf3efe6, fill: 0.8 });
  text('poster1', 'MUSIC NIGHT', 128, 160, { bg: 0x213252, fg: 0xf1c232, fill: 0.3 });
  text('poster2', 'YOGA', 96, 128, { bg: 0xe07a2e, fg: 0xf3efe6, fill: 0.4 });
  text('poster3', 'LOSAR', 96, 96, { bg: 0xf3efe6, fg: 0x8b1e2d, fill: 0.45 });
  text('tapNote', 'पानी', 48, 24, { bg: 0x7e786f, fg: 0xf3efe6, font: 'dev', fill: 0.8 });
  // painted mani stones: coloured letters on grey slate
  const stoneInk = [0x2f63b8, 0xc8322b, 0xf1c232, 0x2f8a4a, 0xf3efe6];
  stoneInk.forEach((ink, i) => text('mani' + i, MANTRA, 160, 40, { bg: 0x6c6a64, fg: ink, font: 'bod', bold: false, fill: 0.8 }));
  // the ‘Om’ syllable alone, for stones and the chorten niche
  text('om', 'ཨོཾ', 40, 48, { bg: 0x6c6a64, fg: 0xf3efe6, font: 'bod', bold: false, fill: 0.86 });
  // thangka: a painted Buddha on a blue-green field with a brocade border
  paint('thangka', 64, 96, (x, y) => {
    g.fillStyle = '#7a1f2b'; g.fillRect(x, y, 64, 96);
    g.fillStyle = '#d9a23a'; g.fillRect(x + 6, y + 8, 52, 74);
    g.fillStyle = '#2f6f6a'; g.fillRect(x + 9, y + 11, 46, 68);
    g.fillStyle = '#e8a84a'; // aureole
    g.beginPath(); g.arc(x + 32, y + 40, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d7fb8'; g.beginPath(); g.arc(x + 32, y + 30, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f0c24a'; g.beginPath(); g.arc(x + 32, y + 30, 5.5, 0, Math.PI * 2); g.fill(); // face
    g.fillStyle = '#b8322b'; g.fillRect(x + 21, y + 37, 22, 20); // robe
    g.fillStyle = '#f0c24a'; g.fillRect(x + 18, y + 55, 28, 6); // lotus seat
    g.fillStyle = '#c84a6a'; g.fillRect(x + 16, y + 61, 32, 5);
    g.fillStyle = '#3a2a1a'; g.fillRect(x + 28, y + 24, 8, 3); // hair
  });

  // HRTC timetable board: header and rows of destinations / times
  paint('timetable', 64, 88, (x, y) => {
    g.fillStyle = '#2f5f3a'; g.fillRect(x, y, 64, 88);
    g.fillStyle = '#f1ead2'; g.fillRect(x + 2, y + 2, 60, 12);
    g.fillStyle = '#b52a2a'; g.font = 'bold 10px ' + FONT_LAT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('HRTC', x + 32, y + 8.5);
    g.fillStyle = '#e8e4d8';
    for (let i = 0; i < 8; i++) {
      g.fillRect(x + 5, y + 20 + i * 8, 26 - (i * 7) % 11, 3);
      g.fillRect(x + 42, y + 20 + i * 8, 16, 3);
    }
    g.fillStyle = '#f1c232'; g.fillRect(x + 36, y + 18, 2, 64);
  });
  // mural of the Potala under the snow peaks, painted on a blank side wall
  paint('mural', 240, 168, (x, y) => {
    const W2 = 240, H2 = 168;
    g.fillStyle = '#6f9ccc'; g.fillRect(x, y, W2, H2);
    g.fillStyle = '#8fb8dc'; g.fillRect(x, y + 40, W2, 40);
    g.fillStyle = '#b3d1e6'; g.fillRect(x, y + 70, W2, 30);
    const peak = (cx: number, base: number, hw: number, h: number) => {
      g.fillStyle = '#7d8aa0'; g.beginPath(); g.moveTo(cx - hw, y + base); g.lineTo(cx, y + base - h); g.lineTo(cx + hw, y + base); g.fill();
      g.fillStyle = '#f4f6fa'; g.beginPath(); g.moveTo(cx - hw * 0.38, y + base - h * 0.62); g.lineTo(cx, y + base - h); g.lineTo(cx + hw * 0.38, y + base - h * 0.62); g.fill();
      g.fillStyle = '#c9d4e4'; g.beginPath(); g.moveTo(cx, y + base - h); g.lineTo(cx + hw * 0.38, y + base - h * 0.62); g.lineTo(cx + hw * 0.1, y + base - h * 0.6); g.fill();
    };
    peak(x + 40, 100, 60, 62); peak(x + 120, 96, 70, 78); peak(x + 205, 100, 55, 56);
    g.fillStyle = '#9a8a5a'; g.fillRect(x, y + 118, W2, 50); // the Marpo Ri hill
    g.fillStyle = '#b8a26a'; g.beginPath(); g.moveTo(x, y + 128); g.lineTo(x + 50, y + 104); g.lineTo(x + 190, y + 104); g.lineTo(x + W2, y + 128); g.lineTo(x + W2, y + H2); g.lineTo(x, y + H2); g.fill();
    // White Palace wings, Red Palace in the middle, golden roofs
    g.fillStyle = '#f1ede4'; g.fillRect(x + 42, y + 78, 156, 40);
    g.fillStyle = '#e2ddd0'; g.fillRect(x + 42, y + 110, 156, 8);
    g.fillStyle = '#8b1e2d'; g.fillRect(x + 92, y + 60, 56, 50);
    g.fillStyle = '#5a2228'; g.fillRect(x + 92, y + 60, 56, 5); g.fillRect(x + 42, y + 78, 50, 3); g.fillRect(x + 148, y + 78, 50, 3);
    g.fillStyle = '#d9a23a'; g.fillRect(x + 100, y + 54, 12, 6); g.fillRect(x + 128, y + 54, 12, 6); g.fillRect(x + 115, y + 50, 10, 10);
    g.fillStyle = '#2b2522';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) g.fillRect(x + 48 + c * 5 + (c > 4 ? 100 : 0), y + 85 + r * 7, 2, 3);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) g.fillRect(x + 96 + c * 6.5, y + 68 + r * 8, 2, 3);
    g.fillStyle = '#e2ddd0'; // zig-zag stairs
    for (let i = 0; i < 4; i++) g.fillRect(x + 30 + i * 6, y + 118 + i * 9, 14, 3);
    for (let i = 0; i < 4; i++) g.fillRect(x + 196 - i * 6, y + 118 + i * 9, 14, 3);
    // lungta strings across the top corners
    const cols = ['#2f63b8', '#f2f2ec', '#c8322b', '#2f8a4a', '#f1c232'];
    for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 5]; g.fillRect(x + 4 + i * 8, y + 6 + i * 2.2, 6, 6); }
    for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 5]; g.fillRect(x + W2 - 10 - i * 8, y + 6 + i * 2.2, 6, 6); }
    g.strokeStyle = '#6e1f2a'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, W2 - 4, H2 - 4);
  });

  const tex = new CanvasTexture(cv);
  tex.magFilter = NearestFilter; tex.minFilter = NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  tex.flipY = true;
  const material = mat({ grain: 0, vertexColors: false, key: 'square-decal-atlas' });
  (material as unknown as { map: CanvasTexture }).map = tex;
  material.needsUpdate = true;
  cached = { tex, regions, material };
  return cached;
}

const _v = new Vector3(), _n = new Vector3(), _m = new Matrix4(), _e = new Euler();

/** Collects textured quads (world space) and merges them into one mesh. */
export class Decals {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  readonly atlas: Atlas;
  constructor(atlas: Atlas) { this.atlas = atlas; }

  /**
   * Quad of w x h centred at `c` (in the space of matrix `m`, e.g. Parts.matrix inside a group), facing local
   * +z rotated by `yaw` about y (and `pitch` about x). `flip` mirrors the texture horizontally.
   */
  quad(m: Matrix4, c: V3, w: number, h: number, key: string, yaw = 0, o: { pitch?: number; flip?: boolean; u?: [number, number] } = {}) {
    const r = this.atlas.regions[key];
    if (!r) return;
    _m.makeRotationFromEuler(_e.set(o.pitch ?? 0, yaw, 0, 'YXZ'));
    _m.setPosition(c[0], c[1], c[2]);
    _m.premultiply(m);
    const ua = o.u ? r.u0 + (r.u1 - r.u0) * o.u[0] : r.u0, ub = o.u ? r.u0 + (r.u1 - r.u0) * o.u[1] : r.u1;
    const [u0, u1] = o.flip ? [ub, ua] : [ua, ub];
    const corners: [number, number, number, number][] = [
      [-w / 2, -h / 2, u0, r.v0], [w / 2, -h / 2, u1, r.v0], [w / 2, h / 2, u1, r.v1],
      [-w / 2, -h / 2, u0, r.v0], [w / 2, h / 2, u1, r.v1], [-w / 2, h / 2, u0, r.v1],
    ];
    _n.set(0, 0, 1).transformDirection(_m);
    for (const [x, y, u, v] of corners) {
      _v.set(x, y, 0).applyMatrix4(_m);
      this.pos.push(_v.x, _v.y, _v.z);
      this.nrm.push(_n.x, _n.y, _n.z);
      this.uv.push(u, v);
    }
  }

  get count() { return this.pos.length / 18; }

  toMesh(): Mesh {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.atlas.material);
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Open cylinder band textured with an atlas region (wraps once around), for rotating drums. */
export function bandGeometry(atlas: Atlas, key: string, r: number, h: number, segs = 24): BufferGeometry {
  const g = new CylinderGeometry(r, r, h, segs, 1, true);
  const reg = atlas.regions[key];
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, reg.u0 + (reg.u1 - reg.u0) * uv.getX(i), reg.v0 + (reg.v1 - reg.v0) * uv.getY(i));
  }
  g.deleteAttribute('color');
  return g;
}
