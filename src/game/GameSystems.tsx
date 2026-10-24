// Game clock and global hotkeys. Runs first every frame (priority -10).
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { game } from '../core/game';
import { input } from '../core/input';
import { interactions } from '../core/interact';
import { collision } from '../core/collision';
import { groundY, walkable } from '../world/terrain';
import { U } from '../core/uniforms';
import { G, useGame } from './store';
import { initQuests } from './quests';
import { sfx } from '../audio/sfx';
import { debug } from './debug';

export function GameSystems() {
  useEffect(() => initQuests(), []);
  // console handles for testing: __game (per-frame state), __store (zustand), __interact / __collision (QA bots)
  useEffect(() => { Object.assign(window, { __game: game, __store: useGame, __interact: interactions, __collision: collision, __terrain: { groundY, walkable } }); }, []);
  useEffect(() => {
    const s = G();
    if (debug.night && !s.night) s.toggleNight();
    if (debug.cam) s.setCamera(debug.cam);
    if (debug.shot) s.start();
  }, []);

  const boot = useMemo(() => ({ frames: 0 }), []);
  useFrame((_, rawDt) => {
    const s = G();
    // ready once ~20 frames have rendered after the world built (shader compiles happen in the first ones)
    if (!s.ready && ++boot.frames > 20) useGame.setState({ ready: true });
    const live = s.started && !s.paused;
    const dt = live ? Math.min(rawDt, 1 / 20) : 0;
    game.dt = dt;
    game.time += dt;
    U.time.value = game.time;

    // hotkeys: re-read the store for each one so two keys in the same frame see each other's effect
    if (input.take('camera')) { G().setCamera(G().camera === 'iso' ? 'chase' : 'iso'); sfx('toggle'); }
    if (input.take('night')) { G().toggleNight(); sfx('toggle'); }
    if (input.take('mute')) G().toggleMute();
    if (input.take('quests')) G().setPanel(G().panel === 'quests' ? null : 'quests');
    if (input.take('help')) G().setPanel(G().panel === 'help' ? null : 'help');
    if (input.take('pause')) {
      const t = G();
      if (t.dialogue) t.closeDialogue();
      else if (t.panel) t.setPanel(null);
      else if (t.started) t.setPaused(!t.paused);
    }
    const now = G();
    input.locked = !!now.dialogue || !now.started || now.paused;

    // screenshot harness: report ready once the scene has rendered for a while
    if (debug.shot && !window.__shotReady) {
      window.__frames = (window.__frames ?? 0) + 1;
      if (window.__frames > 90 && game.time > 3) window.__shotReady = true;
    }
  }, -10);

  return null;
}
