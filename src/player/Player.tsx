import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import { game } from '../core/game';
import { U } from '../core/uniforms';
import { groundY } from '../world/terrain';
import { spawnPoint } from '../game/debug';

const sp = spawnPoint();
game.player.pos.set(sp.x, 0, sp.z);
game.player.yaw = sp.ry;

export function Player() {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const p = game.player.pos;
    p.y = groundY(p.x, p.z);
    U.player.value.copy(p);
    ref.current?.position.set(p.x, p.y + 0.65, p.z);
  }, -5);
  return <mesh ref={ref} castShadow><boxGeometry args={[0.4, 1.3, 0.3]} /><meshLambertMaterial color="#8b1e2d" /></mesh>;
}
