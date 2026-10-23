import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { WebGPURenderer } from 'three/webgpu';
import { PCFShadowMap } from 'three';
import { PixelPipeline } from './render/PixelPipeline';
import { CameraRig } from './render/CameraRig';
import { Lighting } from './render/Lighting';
import { GameSystems } from './game/GameSystems';
import { World } from './world/World';
import { Player } from './player/Player';
import { attachInput } from './core/input';
import { Hud } from './ui/Hud';

export default function App() {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => (wrap.current ? attachInput(wrap.current) : undefined), []);

  return (
    <div className="stage" ref={wrap}>
      <Canvas
        className="scene"
        flat
        dpr={[1, 2]}
        shadows={{ type: PCFShadowMap }}
        gl={async (props) => {
          const r = new WebGPURenderer({ ...(props as object), antialias: false, alpha: false, powerPreference: 'high-performance' });
          await r.init();
          return r;
        }}
      >
        <Suspense fallback={null}>
          <GameSystems />
          <Lighting />
          <World />
          <Player />
          <CameraRig />
          <PixelPipeline />
        </Suspense>
      </Canvas>
      <Hud />
    </div>
  );
}
