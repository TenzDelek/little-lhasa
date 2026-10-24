// Speech bubbles: short phrases that pop above a person's head for a couple of seconds.
// Every phrase is drawn once into one atlas canvas (white rounded box, 1-px dark outline, a tail, pixel text
// from font.ts) at one canvas pixel = one art pixel. A small pool of camera-facing quads shows them; in the
// iso camera each quad is scaled to exactly one texel per art pixel and snapped to the art-pixel grid, so
// the text stays crisp. Drawn on top of everything (depthTest off). Tibetan phrases join the atlas only once
// the Tibetan web font has loaded (font.ts), so no fallback glyphs get baked in; until then they do not show.
import {
  CanvasTexture, Group, Mesh, NearestFilter, PlaneGeometry, SRGBColorSpace, Vector3, type Camera,
  type BufferAttribute, type PerspectiveCamera,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture } from 'three/tsl';
import { view } from '../../render/view';
import { U } from '../../core/uniforms';
import { FONT_H, drawMask, drawText, isTibetan, rasterScript, textWidth, tibetanFontReady, whenTibetanFont } from './font';

export interface BubbleOwner {
  /** World point just above the head (updated by the owner every frame). */
  head: Vector3;
  /** False hides the bubble (owner went home / out of range). */
  shown: boolean;
}

interface Entry { x: number; y: number; w: number; h: number; tip: number }
interface Slot { mesh: Mesh; uv: BufferAttribute; owner: BubbleOwner | null; t: number; dur: number; e: Entry | null }

const ATLAS_W = 512, ATLAS_H = 256;
const PAD_X = 3, PAD_Y = 2, LINE_GAP = 2, TAIL = 2;
const INK = '#2a2224', PAPER = '#fbf7ee', BOD_INK = '#6e1f2a';

const _r = new Vector3(), _u = new Vector3(), _p = new Vector3();
// placed bubble rectangles this frame (camera right / up plane), to stack overlapping ones
const MAX_SLOTS = 16;
const _rect = new Float32Array(MAX_SLOTS * 4);

export class Bubbles {
  readonly group = new Group();
  private entries = new Map<string, Entry>();
  private slots: Slot[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private shelfX = 1; private shelfY = 1; private shelfH = 0;
  private dirty = false;
  private disposed = false;

  constructor(phrases: readonly string[], poolSize = 5) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_W; this.canvas.height = ATLAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.magFilter = this.tex.minFilter = NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = SRGBColorSpace;
    const later: string[] = [];
    for (const p of phrases) {
      if (isTibetan(p) && !tibetanFontReady()) later.push(p);
      else this.entry(p);
    }
    if (later.length) {
      void whenTibetanFont(later.join('')).then(() => {
        if (!this.disposed) for (const p of later) this.entry(p);
      });
    }

    const m = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: true });
    const t = texture(this.tex);
    m.colorNode = t;
    m.opacityNode = t.a;
    m.alphaTest = 0.5;
    m.fog = false;
    for (let i = 0; i < poolSize; i++) {
      const g = new PlaneGeometry(1, 1);
      const mesh = new Mesh(g, m);
      mesh.renderOrder = 1000;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.name = 'bubble';
      this.group.add(mesh);
      this.slots.push({ mesh, uv: g.attributes.uv as BufferAttribute, owner: null, t: 0, dur: 0, e: null });
    }
  }

  /** Atlas entry for a phrase (drawn on first use). Lines split on '\n'. */
  private entry(text: string): Entry | null {
    const have = this.entries.get(text);
    if (have) return have;
    const lines = text.split('\n');
    const bod = isTibetan(text);
    const masks = bod ? lines.map((l) => rasterScript(l, 14)) : null;
    const lw = lines.map((l, i) => (masks ? masks[i].w : textWidth(l)));
    const lh = lines.map((_, i) => (masks ? masks[i].h : FONT_H));
    const tw = Math.max(...lw);
    const th = lh.reduce((a, b) => a + b, 0) + LINE_GAP * (lines.length - 1);
    let w = tw + PAD_X * 2 + 2;
    if (w % 2) w++; // even width: the tail tip sits on a pixel boundary pattern we can snap
    const bh = th + PAD_Y * 2 + 2;
    const h = bh + TAIL;
    if (this.shelfX + w + 1 > ATLAS_W) { this.shelfX = 1; this.shelfY += this.shelfH + 2; this.shelfH = 0; }
    if (this.shelfY + h + 1 > ATLAS_H) { console.warn('[npcs] bubble atlas full:', text); return null; }
    const x0 = this.shelfX, y0 = this.shelfY;
    this.shelfX += w + 2; this.shelfH = Math.max(this.shelfH, h);

    const c = this.ctx;
    // body with 1-px rounded corners and outline
    c.fillStyle = PAPER;
    c.fillRect(x0 + 1, y0 + 1, w - 2, bh - 2);
    c.fillStyle = INK;
    c.fillRect(x0 + 2, y0, w - 4, 1); c.fillRect(x0 + 2, y0 + bh - 1, w - 4, 1);
    c.fillRect(x0, y0 + 2, 1, bh - 4); c.fillRect(x0 + w - 1, y0 + 2, 1, bh - 4);
    c.fillRect(x0 + 1, y0 + 1, 1, 1); c.fillRect(x0 + w - 2, y0 + 1, 1, 1);
    c.fillRect(x0 + 1, y0 + bh - 2, 1, 1); c.fillRect(x0 + w - 2, y0 + bh - 2, 1, 1);
    // tail, a little left of centre
    const tip = Math.floor(w / 2) - 2;
    c.fillStyle = PAPER; c.fillRect(x0 + tip - 1, y0 + bh - 1, 3, 1); c.fillRect(x0 + tip, y0 + bh, 1, 1);
    c.fillStyle = INK; c.fillRect(x0 + tip - 1, y0 + bh, 1, 1); c.fillRect(x0 + tip + 1, y0 + bh, 1, 1); c.fillRect(x0 + tip, y0 + bh + 1, 1, 1);
    // text, centred per line
    let ty = y0 + 1 + PAD_Y;
    lines.forEach((l, i) => {
      const lx = x0 + Math.floor((w - lw[i]) / 2);
      if (masks) drawMask(c, masks[i], lx, ty, BOD_INK);
      else drawText(c, l, lx, ty, INK);
      ty += lh[i] + LINE_GAP;
    });
    const e: Entry = { x: x0, y: y0, w, h, tip };
    this.entries.set(text, e);
    this.dirty = true;
    return e;
  }

  /** Number of bubbles currently showing. */
  get active() { let n = 0; for (const s of this.slots) if (s.owner) n++; return n; }
  isShowing(owner: BubbleOwner) { for (const s of this.slots) if (s.owner === owner) return true; return false; }

  /** Pop a bubble over `owner` for `dur` seconds. Returns false if the pool is full. */
  show(owner: BubbleOwner, text: string, dur = 2.2): boolean {
    let slot = this.slots.find((s) => s.owner === owner) ?? this.slots.find((s) => !s.owner);
    if (!slot) return false;
    if (isTibetan(text) && !this.entries.has(text) && !tibetanFontReady()) return false; // font still loading
    const e = this.entry(text);
    if (!e) return false;
    slot.owner = owner; slot.t = 0; slot.dur = dur; slot.e = e;
    // uv: PlaneGeometry order is top-left, top-right, bottom-left, bottom-right (flipY texture)
    const u0 = e.x / ATLAS_W, u1 = (e.x + e.w) / ATLAS_W;
    const v1 = 1 - e.y / ATLAS_H, v0 = 1 - (e.y + e.h) / ATLAS_H;
    const a = slot.uv;
    a.setXY(0, u0, v1); a.setXY(1, u1, v1); a.setXY(2, u0, v0); a.setXY(3, u1, v0);
    a.needsUpdate = true;
    return true;
  }

  hide(owner: BubbleOwner) { for (const s of this.slots) if (s.owner === owner) { s.owner = null; s.mesh.visible = false; } }

  /** Per frame: age, billboard and pixel-snap every live bubble. */
  update(camera: Camera, dt: number) {
    if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; }
    const ortho = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true;
    _r.setFromMatrixColumn(camera.matrixWorld, 0);
    _u.setFromMatrixColumn(camera.matrixWorld, 1);
    let placed = 0;
    for (const s of this.slots) {
      if (!s.owner) continue;
      s.t += dt;
      if (s.t > s.dur || !s.owner.shown) { s.owner = null; s.mesh.visible = false; continue; }
      const e = s.e!, A = s.owner.head;
      let px: number;
      if (ortho) px = U.artPx.value;
      else {
        const pc = camera as PerspectiveCamera;
        const d = _p.subVectors(A, camera.position).length();
        px = (d * 2 * Math.tan((pc.fov * Math.PI) / 360)) / Math.max(1, view.lowH);
      }
      const lift = s.t < 0.09 ? 2 : 0; // tiny pop
      const a = A.dot(_r), b = A.dot(_u);
      let L = a - (e.tip + 0.5) * px, B = b + lift * px;
      if (ortho) {
        const ox = camera.position.dot(_r) - (view.lowW / 2) * px;
        const oy = camera.position.dot(_u) - (view.lowH / 2) * px;
        L = ox + Math.round((L - ox) / px) * px;
        B = oy + Math.round((B - oy) / px) * px;
      }
      const W = e.w * px, H = e.h * px;
      if (ortho) {
        // two people talking side by side: lift the later bubble clear of the earlier ones (whole art pixels)
        for (let pass = 0; pass < 3; pass++) {
          let moved = false;
          for (let k = 0; k < placed; k++) {
            const l = _rect[k * 4], b = _rect[k * 4 + 1], w = _rect[k * 4 + 2], h = _rect[k * 4 + 3];
            if (L < l + w + px && L + W + px > l && B < b + h + px && B + H + px > b) { B = b + h + px; moved = true; }
          }
          if (!moved) break;
        }
        if (placed < MAX_SLOTS) { const k = placed++ * 4; _rect[k] = L; _rect[k + 1] = B; _rect[k + 2] = W; _rect[k + 3] = H; }
      }
      const m = s.mesh;
      m.position.copy(A).addScaledVector(_r, L + W / 2 - a).addScaledVector(_u, B + H / 2 - b);
      m.quaternion.copy(camera.quaternion);
      m.scale.set(W, H, 1);
      m.visible = true;
    }
  }

  dispose() {
    this.disposed = true;
    this.tex.dispose();
    for (const s of this.slots) s.mesh.geometry.dispose();
    (this.slots[0]?.mesh.material as MeshBasicNodeMaterial | undefined)?.dispose();
  }
}
