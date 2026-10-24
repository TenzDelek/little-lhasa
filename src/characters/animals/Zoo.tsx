// Debug showroom (?zoo=1): every species in a row of poses next to the spawn point, for screenshots.
//   ?zoo=1&zooSpeed=1.2            → everything walks in place at that speed
//   ?zoo=1&zooYaw=1.57             → face that way
//   ?zoo=1&zooKind=dog&zooPose=curl → eight of one kind in one pose, turned to eight headings
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import { game } from '../../core/game';
import { groundY } from '../../world/terrain';
import { spawnPoint } from '../../game/debug';
import { animateQuad, type QPose, type QuadAnim, type QuadRig } from './quad';
import { buildCow, buildDog, buildLangur, buildMacaque, buildPuppy, COW_COATS, DOG_COATS } from './species';

const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
export const zooOn = q.get('zoo') === '1';
const zooSpeed = Number(q.get('zooSpeed') ?? 0);
const zooYaw = Number(q.get('zooYaw') ?? 0.6);
const zooKind = q.get('zooKind');
const zooPose = (q.get('zooPose') ?? 'stand') as QPose;
const zooExtra = q.get('zooExtra'); // e.g. "wag", "groom", "scratch", "sleep", "air", "roll", "chew"

interface Item { rig: QuadRig; anim: Partial<QuadAnim> & { pose?: QPose } }

function make(kind: string, i: number): QuadRig {
  switch (kind) {
    case 'cow': return buildCow(Object.values(COW_COATS)[i % 3]);
    case 'mac': return buildMacaque(i + 1);
    case 'lang': return buildLangur(i + 1);
    case 'pup': return buildPuppy();
    default: return buildDog({ ...DOG_COATS[i % DOG_COATS.length], seed: i + 1 });
  }
}

export function Zoo() {
  const { group, items } = useMemo(() => {
    const group = new Group();
    const sp = spawnPoint();
    const items: Item[] = [];
    const put = (rig: QuadRig, x: number, z: number, anim: Item['anim'], yaw = zooYaw) => {
      const wx = sp.x + x, wz = sp.z + z;
      rig.root.position.set(wx, groundY(wx, wz), wz);
      rig.root.rotation.y = yaw;
      group.add(rig.root);
      items.push({ rig, anim });
    };
    if (zooKind) {
      const extra: Partial<QuadAnim> = {};
      if (zooExtra === 'wag') extra.wag = 1;
      if (zooExtra === 'groom') extra.groom = 1;
      if (zooExtra === 'scratch') extra.scratch = 1;
      if (zooExtra === 'sleep') extra.sleep = true;
      if (zooExtra === 'air') { extra.air = true; extra.vy = 1; }
      if (zooExtra === 'roll') extra.roll = 3;
      if (zooExtra === 'chew') extra.chew = 1;
      const R = zooKind === 'cow' ? 3.2 : zooKind === 'pup' ? 1.0 : 1.7;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        put(make(zooKind, i), Math.sin(a) * R, Math.cos(a) * R - (zooKind === 'cow' ? 1 : 0.4), { pose: zooPose, ...extra }, a);
      }
      return { group, items };
    }
    // row 1: dogs
    put(buildDog({ ...DOG_COATS[0], seed: 1 }), -3, -2, { pose: 'stand' });
    put(buildDog({ ...DOG_COATS[1], seed: 2 }), -1.8, -2, { pose: 'sit' });
    put(buildDog({ ...DOG_COATS[2], seed: 3 }), -0.6, -2, { pose: 'lie' });
    put(buildDog({ ...DOG_COATS[3], seed: 4 }), 0.6, -2, { pose: 'curl', sleep: true });
    put(buildDog({ ...DOG_COATS[4], seed: 5 }), 1.8, -2, { pose: 'bow', wag: 1 });
    put(buildDog({ ...DOG_COATS[7], seed: 8 }), 3.0, -2, { pose: 'sit', scratch: 1 });
    // row 2: puppy + more dogs
    put(buildPuppy(), -3, -0.8, { pose: 'stand', wag: 1 });
    put(buildPuppy(), -2.2, -0.8, { pose: 'sit' });
    put(buildPuppy(), -1.4, -0.8, { pose: 'curl', sleep: true });
    put(buildPuppy(), -0.6, -0.8, { pose: 'lie', roll: 3.0 });
    put(buildDog({ ...DOG_COATS[5], seed: 6 }), 0.6, -0.8, { pose: 'stand', mouth: 1 });
    put(buildDog({ ...DOG_COATS[6], seed: 7 }), 1.8, -0.8, { pose: 'stand', sniff: 1 });
    // row 3: cows
    put(buildCow(COW_COATS.white), -2.6, -4.2, { pose: 'stand', chew: 1 });
    put(buildCow(COW_COATS.brown), 0, -4.2, { pose: 'lie', chew: 1 });
    put(buildCow(COW_COATS.grey), 2.6, -4.2, { pose: 'stand', swish: 1 });
    // row 4: monkeys
    put(buildMacaque(1), -3, 1.0, { pose: 'stand' });
    put(buildMacaque(2), -2.2, 1.0, { pose: 'sit' });
    put(buildMacaque(3), -1.4, 1.0, { pose: 'sit', groom: 1 });
    put(buildMacaque(4), -0.6, 1.0, { pose: 'sit', scratch: 1 });
    put(buildMacaque(5), 0.2, 1.0, { pose: 'hunch', sleep: true });
    put(buildLangur(1), 1.2, 1.0, { pose: 'sit', tailLift: 0.9 });
    put(buildLangur(2), 2.4, 1.0, { pose: 'stand' });
    put(buildLangur(3), 3.6, 1.0, { pose: 'stand', air: true, vy: 1 });
    return { group, items };
  }, []);

  useFrame(() => {
    const dt = game.dt;
    for (const it of items) animateQuad(it.rig, { dt, time: game.time, speed: zooSpeed, ...it.anim });
  });

  return <primitive object={group} />;
}
