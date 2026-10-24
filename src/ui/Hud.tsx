// The HTML layer over the canvas (mounted by App inside .stage). Owns the day/night theme of the page
// (data-scene on the stage), keyboard routing for the UI (keys.ts), and installs the audio engine.
//
//   top-left     area + day/night glyph, errand tracker          top-right   ₹ · ཨོཾ merit · satchel
//   top-centre   toasts                                          bottom-right DAY/NIGHT · CAMERA · SOUND · PAUSE
//   bottom       interaction prompt / dialogue box               touch       joystick + thumb cluster
//   cards        errand log (J), controls (H), pause menu (Esc), title screen
import '../audio/synth';
import './hud.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const THEME = { day: '#f6f3ea', night: '#0e1220' };

export function Hud() {
  const root = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const night = useGame((s) => s.night);
  const started = useGame((s) => s.started);
  const paused = useGame((s) => s.paused);
  const panel = useGame((s) => s.panel);
  const touch = useUi((s) => s.touch);

  // theme: the stage (and the page behind it) follow the scene's day / night
  useLayoutEffect(() => {
    const scene = night ? 'night' : 'day';
    const st = (root.current?.parentElement ?? document.querySelector('.stage')) as HTMLElement | null;
    if (st) st.dataset.scene = scene;
    document.documentElement.dataset.scene = scene;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[scene]);
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
        <div className={`play${modal ? ' is-dim' : ''}`}>
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
      <Title />
    </div>
  );
}
