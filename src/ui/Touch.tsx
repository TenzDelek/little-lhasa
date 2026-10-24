// Touch controls: a floating joystick on the left half (writes input.joy), a look / pinch pad on the right
// half (input.look, input.zoom), and a thumb cluster bottom-right: ✋ act, JUMP, ⟲ CAM ⟳.
// Scene touches are read with native pointer listeners on the stage, so nothing covers the canvas; the
// buttons use native pointerdown too (instant, and the HUD root stops pointerdown from reaching the game).
import { useEffect, useRef, type ReactNode } from 'react';
import { G, useGame } from '../game/store';
import { input, type Action } from '../core/input';
import { dialogueCtl, useUi } from './ctl';
import { ROT_L, ROT_R } from './pixels';
import { PixelIcon } from './bits';

const R = 48;          // joystick travel (px)
const DEAD = 0.12;

export function TouchControls({ stage }: { stage: HTMLElement | null }) {
  const show = useUi((s) => s.touch);
  const hidden = useGame((s) => !s.started || s.paused || !!s.panel || !!s.dialogue);
  const canAct = useGame((s) => !!s.prompt);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stage || !show) return;
    const joy = { id: -1, ox: 0, oy: 0 };
    const looks = new Map<number, { x: number; y: number }>();
    let pinchD = 0, pinchAcc = 0;

    const release = () => {
      joy.id = -1;
      input.joy.x = 0; input.joy.y = 0; input.joy.active = false;
      const b = base.current, k = knob.current;
      if (b) { b.classList.remove('is-active', 'is-run'); b.style.left = ''; b.style.top = ''; b.style.bottom = ''; }
      if (k) k.style.transform = '';
    };
    const pinchDist = () => {
      const [a, b] = [...looks.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const s = G();
      if (!s.started || s.paused || s.panel) return;
      if (s.dialogue) { dialogueCtl.advance(); return; }   // tap anywhere on the town to read on
      if (e.clientX < window.innerWidth * 0.5 && joy.id < 0) {
        joy.id = e.pointerId;
        // keep the whole base on screen
        const vw = window.innerWidth, vh = window.innerHeight, r0 = 60;
        joy.ox = Math.min(Math.max(e.clientX, r0 + 8), vw - r0 - 8);
        joy.oy = Math.min(Math.max(e.clientY, r0 + 8), vh - r0 - 8);
        const b = base.current;
        if (b) { b.classList.add('is-active'); b.style.left = `${joy.ox - r0}px`; b.style.top = `${joy.oy - r0}px`; b.style.bottom = 'auto'; }
        input.joy.active = true; input.joy.x = 0; input.joy.y = 0;
      } else {
        looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (looks.size === 2) { pinchD = pinchDist(); pinchAcc = 0; }
      }
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === joy.id) {
        let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
        const L = Math.hypot(dx, dy);
        if (L > R) { dx *= R / L; dy *= R / L; }
        const m = Math.min(1, L / R);
        // (dx, dy) / R has length m; rescale so the dead zone maps to 0 and the rim to 1
        const k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD) / m;
        input.joy.x = (dx / R) * k;
        input.joy.y = (-dy / R) * k;
        if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
        base.current?.classList.toggle('is-run', m > 0.92);
        return;
      }
      const p = looks.get(e.pointerId);
      if (!p) return;
      if (looks.size === 1) {
        input.look.dx += e.clientX - p.x;
        input.look.dy += e.clientY - p.y;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (looks.size === 2) {
        const d = pinchDist();
        pinchAcc += d - pinchD;
        pinchD = d;
        while (pinchAcc > 40) { input.zoom -= 1; pinchAcc -= 40; }
        while (pinchAcc < -40) { input.zoom += 1; pinchAcc += 40; }
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === joy.id) release();
      if (looks.delete(e.pointerId) && looks.size < 2) pinchAcc = 0;
    };
    stage.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    const unsub = useGame.subscribe((s) => { if ((s.dialogue || s.paused || s.panel) && joy.id >= 0) release(); });
    return () => {
      release();
      unsub();
      stage.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [stage, show]);

  if (!show) return null;
  return (
    <div className={`touch${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      <div ref={base} className="joy" aria-hidden="true">
        <div ref={knob} className="joy-knob" />
      </div>
      <div className="tcluster">
        <div className="trow">
          <TouchBtn className="tb-sm" act="rotL" label="Turn view left"><PixelIcon grid={ROT_L} size={22} /></TouchBtn>
          <TouchBtn className="tb-sm tb-cam" act="camera" label="Switch camera">Cam</TouchBtn>
          <TouchBtn className="tb-sm" act="rotR" label="Turn view right"><PixelIcon grid={ROT_R} size={22} /></TouchBtn>
        </div>
        <div className="trow">
          <TouchBtn className={`tb-big tb-act${canAct ? ' is-ready' : ''}`} act="interact" label="Use">
            <span className="tb-hand">✋</span>
          </TouchBtn>
          <TouchBtn className="tb-big" act="jump" label="Jump">Jump</TouchBtn>
        </div>
      </div>
    </div>
  );
}

function TouchBtn({ act, label, className, children }: { act: Action; label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (act === 'interact' && G().dialogue) dialogueCtl.advance();
      else input.press(act);
      el.classList.add('is-down');
    };
    const up = () => el.classList.remove('is-down');
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
    };
  }, [act]);
  // keyboard / assistive activation still works through click (detail 0)
  return (
    <button ref={ref} type="button" className={`tb ${className ?? ''}`} aria-label={label}
      onClick={(e) => { if (e.detail === 0) input.press(act); }}>
      {children}
    </button>
  );
}
