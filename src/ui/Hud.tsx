// The HTML layer over the canvas (mounted by App inside .stage). Owns the day/night theme of the page
// (data-scene on the stage), keyboard routing for the UI (keys.ts), and installs the audio engine.
//
//   top-left     area + day/night glyph, errand tracker          top-right   ₹ · ཨོཾ merit · satchel
//   top-centre   toasts                                          bottom-right DAY/NIGHT · CAMERA · SOUND · PAUSE
//   bottom       interaction prompt / dialogue box               touch       joystick + thumb cluster
//   cards        errand log (J), controls (H), pause menu (Esc), title screen
//   loading      five butter lamps on plain paper until store.ready, then the title fades in (Loading.tsx)
import '../audio/synth';
import './hud.css';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useGame } from '../game/store';
import { debug } from '../game/debug';
import { useKeyRouter } from './keys';
import { setDevice, useUi } from './ctl';
import { Title } from './Title';
import { AreaBlock, Tracker, Purse } from './TopBar';
import { Prompt, Toasts } from './Notices';
import { DialogueBox } from './Dialogue';
import { HelpCard, PauseMenu, QuestLog } from './Panels';
import { CornerButtons, Dock, KeyHints } from './Dock';
import { TouchControls } from './Touch';
import { Loading } from './Loading';

const THEME = { day: '#f6f3ea', night: '#0e1220' };

/** Toasts sit in the top band between the area / tracker column and the purse column when there is room,
 *  otherwise just below the taller of the two. Measured, because both columns change size as you play
 *  (area names, the satchel, touch corner buttons), and never per frame — only when they resize. */
function useToastLane(play: RefObject<HTMLDivElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = play.current;
    const tl = el?.querySelector<HTMLElement>(':scope > .tl');
    const tr = el?.querySelector<HTMLElement>(':scope > .tr');
    if (!on || !el || !tl || !tr) return;
    const update = () => {
      const o = el.getBoundingClientRect(), a = tl.getBoundingClientRect(), b = tr.getBoundingClientRect();
      const left = Math.ceil(a.right - o.left + 14), right = Math.ceil(o.right - b.left + 14);
      const band = o.width - left - right >= 300;
      el.style.setProperty('--lane-l', `${left}px`);
      el.style.setProperty('--lane-r', `${right}px`);
      el.style.setProperty('--lane-t', `${Math.ceil(Math.max(a.bottom, b.bottom) - o.top + 10)}px`);
      el.dataset.toasts = band ? 'band' : 'below';
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el); ro.observe(tl); ro.observe(tr);
    return () => ro.disconnect();
  }, [play, on]);
}

export function Hud() {
  const root = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const night = useGame((s) => s.night);
  const started = useGame((s) => s.started);
  const paused = useGame((s) => s.paused);
  const panel = useGame((s) => s.panel);
  const ready = useGame((s) => s.ready);
  const touch = useUi((s) => s.touch);
  const play = useRef<HTMLDivElement>(null);
  useToastLane(play, started && !debug.shot);

  // theme: the stage (and the page behind it) follow the scene's day / night
  useLayoutEffect(() => {
    const scene = night ? 'night' : 'day';
    const st = (root.current?.parentElement ?? document.querySelector('.stage')) as HTMLElement | null;
    if (st) st.dataset.scene = scene;
    document.documentElement.dataset.scene = scene;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[scene]);
    // allow the page's day / night cross-fade only after the first paint in the right theme
    const raf = requestAnimationFrame(() => { document.documentElement.dataset.themed = '1'; });
    return () => cancelAnimationFrame(raf);
  }, [night]);

  useLayoutEffect(() => { setStage((root.current?.parentElement as HTMLElement | null) ?? null); }, []);

  // HUD controls must not start a camera drag in core/input.ts (it listens for pointerdown on the stage)
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const stop = (e: PointerEvent) => { if (e.target !== el) e.stopPropagation(); };
    const wheel = (e: WheelEvent) => { if ((e.target as Element).closest('.card, .dlg, .title-card')) e.stopPropagation(); };
    el.addEventListener('pointerdown', stop);
    el.addEventListener('wheel', wheel);
    return () => { el.removeEventListener('pointerdown', stop); el.removeEventListener('wheel', wheel); };
  }, []);

  // which device was used last: prompt glyphs, and the touch controls appear after the first touch
  useEffect(() => {
    const t = (e: PointerEvent) => setDevice(e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'touch' : 'mouse');
    window.addEventListener('pointerdown', t, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', t, { capture: true });
  }, []);

  useKeyRouter(!debug.shot);

  if (debug.shot) return null;
  const playing = started && !paused;
  const modal = paused || !!panel;
  return (
    <div ref={root} className={`hud${touch ? ' is-touch' : ''}${!started ? ' on-title' : ''}`}>
      {started && (
        <div ref={play} className={`play${modal ? ' is-dim' : ''}`} inert={modal}>
          <div className="tl">
            <AreaBlock />
            <Tracker />
          </div>
          <div className="tr">
            <Purse />
            {touch && <CornerButtons />}
          </div>
          <Toasts />
          {playing && <Prompt />}
          <DialogueBox />
          {!touch && <Dock />}
          {!touch && <KeyHints />}
          <TouchControls stage={stage} />
        </div>
      )}
      {started && modal && (
        <div className="modal">
          <div className="scrim" aria-hidden="true" onClick={() => {
            const s = useGame.getState();
            if (s.panel) s.setPanel(null); else s.setPaused(false);
          }} />
          {paused && !panel && <PauseMenu />}
          {panel === 'quests' && <QuestLog />}
          {panel === 'help' && <HelpCard />}
        </div>
      )}
      {ready && <Title />}
      <Loading />
    </div>
  );
}
