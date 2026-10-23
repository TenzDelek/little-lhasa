// Game clock and global hotkeys. Runs first every frame (priority -10).
import { useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { game } from '../core/game';
import { input } from '../core/input';
import { U } from '../core/uniforms';
import { G } from './store';
import { initQuests } from './quests';
import { sfx } from '../audio/sfx';
import { debug } from './debug';

export function GameSystems() {
  useEffect(() => initQuests(), []);
  useEffect(() => {
    const s = G();
    if (debug.night && !s.night) s.toggleNight();
    if (debug.cam) s.setCamera(debug.cam);
    if (debug.shot) s.start();
  }, []);

  useFrame((_, rawDt) => {
    const s = G();
    const live = s.started && !s.paused;
    const dt = live ? Math.min(rawDt, 1 / 20) : 0;
    game.dt = dt;
    game.time += dt;
    U.time.value = game.time;

    if (input.take('camera')) { s.setCamera(s.camera === 'iso' ? 'chase' : 'iso'); sfx('toggle'); }
    if (input.take('night')) { s.toggleNight(); sfx('toggle'); }
    if (input.take('mute')) s.toggleMute();
    if (input.take('quests')) s.setPanel(s.panel === 'quests' ? null : 'quests');
    if (input.take('help')) s.setPanel(s.panel === 'help' ? null : 'help');
    if (input.take('pause')) {
      if (s.dialogue) s.closeDialogue();
      else if (s.panel) s.setPanel(null);
      else if (s.started) s.setPaused(!s.paused);
    }
    input.locked = !!s.dialogue || !s.started || s.paused;

    // screenshot harness: report ready once the scene has rendered for a while
    if (debug.shot && !window.__shotReady) {
      window.__frames = (window.__frames ?? 0) + 1;
      if (window.__frames > 90 && game.time > 3) window.__shotReady = true;
    }
  }, -10);

  return null;
}
