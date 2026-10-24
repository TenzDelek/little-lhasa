// Tenzin in the world: runs the controller, animates the rig, picks interactables (prompt + E), plays
// footsteps by surface, and keeps the HUD's area name current.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { game } from '../core/game';
import { input } from '../core/input';
import { interactions } from '../core/interact';
import { U } from '../core/uniforms';
import { angleDelta, damp } from '../core/math';
import { buildCharacter, animateCharacter, attachProp, type Action } from '../characters/rig';
import { G, useGame } from '../game/store';
import { spawnPoint } from '../game/debug';
import { groundY, plazaQuery, roadQuery } from '../world/terrain';
import { ITEMS } from '../world/layout';
import { sfx } from '../audio/sfx';
import { stepPlayer } from './controller';
import { TENZIN } from './tenzin';

// first load only: a hot-reload re-run of this module (e.g. after an edit to the rig) must not yank the boy
// back to the spawn mid-walk
if (game.player.pos.lengthSq() === 0) {
  const sp = spawnPoint();
  game.player.pos.set(sp.x, groundY(sp.x, sp.z), sp.z);
  game.player.yaw = sp.ry;
  U.player.value.copy(game.player.pos);
}

const ACTION_TIME: Record<string, number> = { spin: 0.9, light: 1.1, give: 1.2, talk: 0.6, pet: 1.6, wave: 1.4, bow: 1.4, pray: 1.4, eat: 1.6, point: 1.0 };

function guessAnim(label: string): Action {
  const l = label.toLowerCase();
  if (l.includes('wheel')) return 'spin';
  if (l.includes('lamp') || l.includes('light')) return 'light';
  if (l.includes('give') || l.includes('buy')) return 'give';
  if (l.includes('pet') || l.includes('puppy') || l.includes('dog')) return 'pet';
  if (l.includes('talk')) return 'wave';
  return 'point';
}

function areaName(x: number, z: number): string {
  const pz = plazaQuery(x, z);
  if (pz.edge < 0.5) return pz.plaza.name;
  const rq = roadQuery(x, z);
  if (rq.edge < 6) return rq.road.name; // front yards, stalls and forecourts belong to their street
  if (z > 85) return 'Tsuglagkhang';
  if (z < -55) return 'Dharamkot Hill';
  if (x > 25) return 'Bhagsu Hillside';
  return 'McLeod Ganj';
}

export function Player() {
  const rig = useMemo(() => buildCharacter(TENZIN), []);
  const plate = useMemo(() => {
    const o = attachProp(rig, 'R', 'plate');
    o.visible = false;
    return o;
  }, [rig]);
  const st = useMemo(() => ({ lastStep: 0, areaT: 0, visY: game.player.pos.y }), []);

  useEffect(() => () => { G().setPrompt(null); }, []);

  useFrame(() => {
    const dt = game.dt;
    const p = game.player;
    const s = G();
    if (dt > 0) {
      const frozen = !!s.dialogue || !!s.panel;
      // a press of E / Space while a dialogue is open belongs to the dialogue (the UI advances it)
      if (frozen) { input.take('interact'); input.take('jump'); }
      const speed = stepPlayer(dt, frozen || (!!p.action && p.action.kind !== 'talk'));

      // interactions
      const best = frozen ? null : interactions.best(p.pos, p.yaw);
      s.setPrompt(best ? interactions.labelOf(best) : null);
      if (!frozen && input.take('interact') && best) {
        const q = interactions.posOf(best);
        const want = Math.atan2(q.x - p.pos.x, q.z - p.pos.z);
        if (Math.abs(angleDelta(p.yaw, want)) < 2.6) p.yaw = want;
        const kind = (best.anim ?? guessAnim(interactions.labelOf(best))) as NonNullable<typeof p.action>['kind'];
        p.action = { kind, t: 0, dur: ACTION_TIME[kind] ?? 1 };
        best.onInteract();
      }
      if (p.action) { p.action.t += dt; if (p.action.t >= p.action.dur) p.action = null; }

      // footsteps on each foot plant
      const ph = rig.st.phase / Math.PI;
      if (p.grounded && speed > 0.6 && Math.floor(ph) !== Math.floor(st.lastStep)) {
        const pz = plazaQuery(p.pos.x, p.pos.z), rq = roadQuery(p.pos.x, p.pos.z);
        sfx(pz.edge < 0 ? 'stepStone' : rq.edge < 0 && rq.road.surface !== 'dirt' ? 'step' : 'stepDirt', { volume: speed > 3 ? 1 : 0.7 });
      }
      st.lastStep = ph;

      // area name for the HUD
      st.areaT -= dt;
      if (st.areaT <= 0) {
        st.areaT = 0.5;
        const name = areaName(p.pos.x, p.pos.z);
        if (name !== s.area) { useGame.setState({ area: name }); s.emit({ type: 'enter', area: name }); }
      }

      // smooth the visual height on step-ups so stairs don't pop
      st.visY = p.pos.y - st.visY > 0.04 && p.grounded ? damp(st.visY, p.pos.y, 22, dt) : p.pos.y;

      const carrying = s.hasItem(ITEMS.momo);
      plate.visible = carrying;
      const action: Action | null = p.action ? (p.action.kind as Action) : carrying ? 'carry' : null;
      animateCharacter(rig, { dt, time: game.time, speed, grounded: p.grounded, vy: p.vel.y, action, actionT: p.action?.t });
    }
    U.player.value.copy(p.pos);
    rig.root.position.set(p.pos.x, st.visY, p.pos.z);
    rig.root.rotation.y = p.yaw;
  }, -5);

  return <primitive object={rig.root} />;
}
