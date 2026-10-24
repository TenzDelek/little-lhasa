// ?stats=1 — tiny FPS / draw-call / triangle readout (top-left), also exposed as window.__stats for scripts.
// Counts are per frame and cover every pass (shadow map, scene, post). With ?stats=1 App also turns on the
// renderer's timestamp queries, so `gpu` is the GPU time of a frame (ms) where the browser supports it.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';
import { debug } from './debug';

declare global {
  interface Window {
    __stats?: {
      fps: number;
      /** Draw calls in one frame, all passes. */
      calls: number;
      /** renderer.render() calls in one frame (shadow, scene, post passes). */
      renders: number;
      /** Triangles in one frame, shadow pass included. */
      triangles: number;
      /** GPU ms per frame (timestamp queries), null when unsupported. */
      gpuMs: number | null;
      backend: string;
    };
  }
}

export function Stats() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const el = useMemo(() => {
    if (!debug.stats) return null;
    const d = document.createElement('pre');
    d.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:11px/1.3 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.6);color:#9f9;z-index:99;pointer-events:none';
    return d;
  }, []);
  useEffect(() => { if (el) document.body.appendChild(el); return () => el?.remove(); }, [el]);
  const st = useMemo(() => {
    const s = {
      t: 0, frames: 0, gpu: -1, pending: false,
      onGpu: (ms: number | undefined) => { if (typeof ms === 'number' && ms > 0) s.gpu = s.gpu < 0 ? ms : s.gpu * 0.8 + ms * 0.2; },
      settle: () => { s.pending = false; },
    };
    return s;
  }, []);
  useFrame((_, dt) => {
    const backend = (gl as unknown as { backend?: { isWebGPUBackend?: boolean; trackTimestamp?: boolean } }).backend;
    // resolve the frame's timestamp queries (one at a time; the pool hands back the last frame's total)
    if (backend?.trackTimestamp && !st.pending) {
      st.pending = true;
      gl.resolveTimestampsAsync('render').then(st.onGpu, st.settle).finally(st.settle);
    }
    st.t += dt; st.frames++;
    if (st.t < 0.5) return;
    const r = gl.info.render;
    const name = backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
    const gpuMs = st.gpu >= 0 ? +st.gpu.toFixed(2) : null;
    window.__stats = { fps: Math.round(st.frames / st.t), calls: r.drawCalls, renders: r.frameCalls, triangles: r.triangles, gpuMs, backend: name };
    if (el) {
      el.textContent = `${window.__stats.fps} fps  ${name}${gpuMs !== null ? `  gpu ${gpuMs.toFixed(1)} ms` : ''}\n`
        + `${r.drawCalls} draws / ${r.frameCalls} passes\n${(r.triangles / 1000).toFixed(0)}k tris (incl. shadows)`;
    }
    st.t = 0; st.frames = 0;
  }, 2);
  return null;
}
