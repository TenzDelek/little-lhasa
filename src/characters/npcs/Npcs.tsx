// The people of McLeod Ganj (NPC module entry). See system.ts for how they live, cast.ts for who they are.
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { NpcSystem } from './system';

export function Npcs() {
  const sys = useMemo(() => new NpcSystem(), []);
  useEffect(() => sys.mount(), [sys]);
  // after the player (-5) and the camera rig (-2): bubbles billboard toward this frame's camera
  useFrame((state, raw) => sys.update(state.camera, raw), -1);
  return <primitive object={sys.group} />;
}
