// Debug lineup of the town's people (?zoo=people): one of every outfit / archetype from the NPC cast, posed
// the way they appear in town, next to the spawn point, for close-up screenshots.
//   ?zoo=people                 idle / their usual action
//   ?zoo=people&peopleWalk=1    everyone walks in place
//   ?zoo=people&peopleYaw=0.8   turn the whole lineup
//   ?zoo=people&peopleRow=1     only one row (0..3)
//   ?zoo=people&peopleTurn=1.57 turn each person in place (profile views)
//   ?zoo=people&peopleAct=pet   everyone does one action (pet, bow, clap, sit, sitCross, wave…)
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { game } from '../core/game';
import { Parts } from '../core/geom';
import { partsMaterial } from '../core/materials';
import { PAL } from '../core/palette';
import { groundY } from '../world/terrain';
import { spawnPoint } from '../game/debug';
import { TENZIN } from '../player/tenzin';
import { animateCharacter, buildCharacter, type Action, type CharSpec, type Rig } from './rig';
import { CAST } from './npcs/cast';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const peopleZooOn = q.get('zoo') === 'people';
const walkAll = q.get('peopleWalk') === '1';
const yaw0 = Number(q.get('peopleYaw') ?? 0.75);
const turn = Number(q.get('peopleTurn') ?? 0);
const forceAct = q.get('peopleAct') as Action | null;
const onlyRow = q.has('peopleRow') ? Number(q.get('peopleRow')) : -1;

interface Item { rig: Rig; speed: number; action: Action | null; seatY?: number }

// rows of cast ids (left → right); '' = Tenzin
const ROWS: string[][] = [
  ['', 'pema', 'amala', 'd-nyima', 'd-dawa', 'c-lhamo', 'mola-yangchen', 'pola-norbu'],
  ['m-lobsang', 'm-thupten', 'm-choedon', 'm-tsering', 'gen-tsewang', 'k-wangdu', 'mani-sangmo', 's-namgyal'],
  ['tashi', 'dolma', 'pasang', 't-yangzom', 't-dekyi', 't-tenzin', 't-kunsang', 'k-dawa', 'k-norzin'],
  ['t-rahul', 't-priya', 't-anna', 'l-lukas', 'b-mia', 'tea-kamla', 'chai-ramesh', 'taxi-vijay', 's-farooq'],
];

export function PeopleZoo() {
  const { group, items } = useMemo(() => {
    const group = new Group();
    const items: Item[] = [];
    const sp = spawnPoint();
    const props = new Parts();
    const cs = Math.cos(yaw0), sn = Math.sin(yaw0);
    ROWS.forEach((row, ri) => {
      if (onlyRow >= 0 && ri !== onlyRow) return;
      row.forEach((id, ci) => {
        const def = id ? CAST.find((d) => d.id === id) : null;
        if (id && !def) return;
        const spec: CharSpec = def ? def.spec : TENZIN;
        const rig = buildCharacter(spec);
        // lineup in local (x along the row, z between rows), rotated by yaw0 round the spawn
        const lx = (ci - (row.length - 1) / 2) * 0.95, lz = onlyRow >= 0 ? 0 : (ri - 1.5) * 2.6;
        const wx = sp.x + lx * cs + lz * sn, wz = sp.z - lx * sn + lz * cs;
        const y = groundY(wx, wz);
        rig.root.position.set(wx, y, wz);
        rig.root.rotation.y = yaw0 + turn;
        group.add(rig.root);
        let action: Action | null = null, speed = 0, seatY: number | undefined;
        const mode = def?.mode ?? 'walk';
        if (walkAll) { speed = 1.1; action = def?.walkAct ?? null; }
        else if (mode === 'walk') { speed = def?.speed ?? 1; action = def?.walkAct ?? null; }
        else if (mode === 'sit') { action = 'sit'; seatY = 0.45; }
        else if (mode === 'debateSit') { action = 'sitCross'; seatY = 0.1; }
        else if (mode === 'debateStand') action = 'clap';
        else if (mode === 'pray') action = 'pray';
        else if (def?.idleAct) action = def.idleAct;
        if (!walkAll && (mode === 'sit' || mode === 'debateSit')) {
          props.group([wx, y, wz], yaw0 + turn, () => {
            if (mode === 'sit') props.box(0.7, 0.42, 0.42, [0, 0.21, -0.08], PAL.woodTrim);
            else props.box(0.6, 0.1, 0.55, [0, 0.05, -0.02], PAL.monkMaroonDark);
          });
        }
        if (forceAct) { action = forceAct; speed = 0; }
        items.push({ rig, speed, action, seatY });
      });
    });
    if (props.size) for (const m of props.toMeshes(partsMaterial({ key: 'people-zoo' }), 64)) group.add(m);
    return { group, items };
  }, []);

  useFrame(() => {
    const dt = game.dt;
    for (const it of items) {
      animateCharacter(it.rig, { dt, time: game.time, speed: it.speed, grounded: true, vy: 0, action: it.action, actionT: game.time, seatY: it.seatY });
    }
  });

  return <primitive object={group} />;
}
