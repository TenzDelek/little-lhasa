import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
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
import { Stats } from './game/Stats';
import { G, useGame } from './game/store';
import { debug } from './game/debug';

/** If the 3D view can't start (no WebGPU or WebGL2) or throws, only the canvas goes: the HUD stays up and the
 *  loading paper says what happened (store.renderError) instead of the whole page going blank. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { if (!G().renderError) useGame.setState({ renderError: 'crash' }); }
  // remounted after a crash (a hot reload retrying it): the scene is back
  componentDidMount() { if (G().renderError === 'crash') useGame.setState({ renderError: null }); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function App() {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => (wrap.current ? attachInput(wrap.current) : undefined), []);

  return (
    <div className="stage" ref={wrap}>
      <SceneBoundary>
        <Canvas
          className="scene"
          flat
          dpr={[1, 2]}
          shadows={{ type: PCFShadowMap }}
          gl={async (props) => {
            try {
              const r = new WebGPURenderer({
                ...(props as object), antialias: false, alpha: false, powerPreference: 'high-performance',
                // GPU frame time for the ?stats=1 readout (game/Stats.tsx)
                trackTimestamp: debug.stats,
              });
              await r.init();
              // the GPU went away mid-walk (driver reset, a sleeping laptop): say so rather than freeze
              const lost = r.onDeviceLost;
              r.onDeviceLost = (info) => { lost.call(r, info); useGame.setState({ renderError: 'lost' }); };
              return r;
            } catch (e) {
              useGame.setState({ renderError: 'start' });
              throw e;
            }
          }}
        >
          <Suspense fallback={null}>
            <GameSystems />
            <Lighting />
            <World />
            <Player />
            <CameraRig />
            <PixelPipeline />
            <Stats />
          </Suspense>
        </Canvas>
      </SceneBoundary>
      <Hud />
    </div>
  );
}
