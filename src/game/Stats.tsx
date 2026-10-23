// ?stats=1 — tiny FPS / draw-call / triangle readout (top-left), also exposed as window.__stats for scripts.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';
import { debug } from './debug';

declare global { interface Window { __stats?: { fps: number; calls: number; triangles: number; backend: string } } }

export function Stats() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const el = useMemo(() => {
    if (!debug.stats) return null;
    const d = document.createElement('pre');
    d.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:11px/1.3 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.6);color:#9f9;z-index:99;pointer-events:none';
    return d;
  }, []);
  useEffect(() => { if (el) document.body.appendChild(el); return () => el?.remove(); }, [el]);
  const st = useMemo(() => ({ t: 0, frames: 0 }), []);
  useFrame((_, dt) => {
    st.t += dt; st.frames++;
    if (st.t < 0.5) return;
    const info = gl.info;
    const backend = (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
    window.__stats = { fps: Math.round(st.frames / st.t), calls: info.render.calls, triangles: info.render.triangles, backend };
    if (el) el.textContent = `${window.__stats.fps} fps  ${backend}\n${info.render.calls} calls  ${(info.render.triangles / 1000).toFixed(0)}k tris`;
    st.t = 0; st.frames = 0;
  }, 2);
  return null;
}
