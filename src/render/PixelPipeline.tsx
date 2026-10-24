// Pixel-art render pipeline in TSL (port of Gorshey's render.js post pass).
// 1. The scene renders into a small render target (one texel = one art pixel), no MSAA. The target is one art
//    pixel bigger than the screen on every side (view.ts MARGIN).
// 2. A TSL pass at art-pixel resolution (once per art pixel, not once per screen pixel) darkens depth edges a
//    touch, snaps luma to bands (toon ramp), shifts shadows cool / highlights warm, and posterises with a 4x4
//    ordered dither (locked to the world grid while the iso camera scrolls, so dithered gradients don't
//    crawl), so gradients break into pixel patterns. Background pixels get the paper colour (iso) or a
//    dithered sky (chase camera), with stars at night.
// 3. A full-screen pass upscales that with nearest sampling — each art pixel exactly view.px device pixels,
//    slid by the camera's sub-pixel remainder so the iso view scrolls smoothly.
// 4. On the very first frame (behind the loading screen) the whole town renders once from a camera that sees
//    everything, with the sun's shadow frustum opened over the whole map, so every material's main and shadow
//    pipelines compile up front instead of hitching the first walk into each new street.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  DepthTexture, FloatType, HalfFloatType, NearestFilter, RenderTarget, UnsignedByteType, Vector2, Vector3, Color,
  LinearSRGBColorSpace,
  OrthographicCamera, type Camera, type Object3D, type PerspectiveCamera, type Scene,
} from 'three';
import { NodeMaterial, QuadMesh, RenderPipeline, type WebGPURenderer, type Node } from 'three/webgpu';
import {
  Fn, If, texture, screenCoordinate, uniform, vec2, vec3, vec4, float, floor, max, min, mix, smoothstep, dot, clamp,
  sRGBTransferOETF, orthographicDepthToViewZ, perspectiveDepthToViewZ, select, step, abs,
} from 'three/tsl';
import { bayer4 } from '../core/tsl';
import { U } from '../core/uniforms';
import { WORLD_BOUNDS } from '../world/layout';
import { MARGIN, computeView, view } from './view';
import { sky } from './sky';
import { lightRig, renderStats } from './state';
import { debug } from '../game/debug';

/** ?warm=0 skips the up-front pipeline warm-up (for load-time comparisons). */
const NO_WARM = typeof location !== 'undefined' && new URLSearchParams(location.search).get('warm') === '0';

export const post = {
  levels: uniform(24),
  dither: uniform(0.7),
  bands: uniform(11),
  bandMix: uniform(0.8),
  bandDither: uniform(0.42),
  cool: uniform(0.5),
  warm: uniform(0.55),
  edge: uniform(0.2),
  edgeThresh: uniform(0.45), // metres of depth jump that count as an edge
};

export function PixelPipeline() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const ctx = useMemo(() => {
    const depthTex = new DepthTexture(1, 1);
    depthTex.type = FloatType;
    depthTex.minFilter = depthTex.magFilter = NearestFilter;
    const rt = new RenderTarget(1, 1, {
      type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter,
      depthBuffer: true, depthTexture: depthTex, samples: 0,
    });

    const uRes = uniform(new Vector2(1, 1));      // render-target size (art pixels, margin included)
    const uPx = uniform(2);                         // art-pixel size (device pixels)
    const uOff = uniform(new Vector2(0, 0));        // sub-pixel slide (device pixels; x right, y down)
    const uGrid = uniform(new Vector2(0, 0));       // dither phase: snapped camera on the art grid, mod 4
    const uNear = uniform(0.1), uFar = uniform(200), uOrtho = uniform(1);
    const uBg = uniform(new Vector3(0.98, 0.98, 0.97)); // sRGB
    const uSkyOn = uniform(0);
    const uInvProj = sky.invProj, uCamWorld = sky.camWorld;

    const tColor = texture(rt.texture);
    const tDepth = texture(depthTex);

    const viewZAt = (d: Node<'float'>) =>
      select(uOrtho.greaterThan(0.5), orthographicDepthToViewZ(d, uNear, uFar), perspectiveDepthToViewZ(d, uNear, uFar));

    // stylise: runs once per art pixel, into `styled` (same size as the scene target)
    const styleNode = Fn(() => {
      const px = floor(screenCoordinate.xy);
      const uv = px.add(0.5).div(uRes);
      const texel = vec2(1).div(uRes);
      const d = tDepth.sample(uv).r;
      const b = bayer4(px.add(uGrid)).sub(0.5);
      const out = vec3(0).toVar();

      If(d.greaterThanEqual(0.99999), () => {
        // background: paper (iso) or sky gradient + stars (chase)
        const skyCol = sky.colorAt(uv, uInvProj, uCamWorld, px);
        out.assign(mix(uBg, skyCol, uSkyOn));
        out.assign(floor(out.mul(post.levels).add(0.5).add(b.mul(post.dither))).div(post.levels));
      }).Else(() => {
        const c = vec3(sRGBTransferOETF(tColor.sample(uv).rgb.max(0)) as Node<'vec3'>).toVar();

        // depth edges: a pixel on the near side of a depth jump darkens
        const z = viewZAt(d);
        const zl = viewZAt(tDepth.sample(uv.add(vec2(texel.x.negate(), 0))).r);
        const zr = viewZAt(tDepth.sample(uv.add(vec2(texel.x, 0))).r);
        const zu = viewZAt(tDepth.sample(uv.add(vec2(0, texel.y))).r);
        const zd = viewZAt(tDepth.sample(uv.add(vec2(0, texel.y.negate()))).r);
        // viewZ is negative in front of the camera: farther = more negative
        const far = min(min(zl, zr), min(zu, zd));
        const jump = step(post.edgeThresh.mul(max(float(1), abs(z).mul(0.04))), z.sub(far));
        c.mulAssign(float(1).sub(post.edge.mul(jump)));

        // banded value: snap luma to bands, dithering each band edge (toon ramp look)
        const L = max(dot(c, vec3(0.299, 0.587, 0.114)), 1e-4);
        const Lq = max(floor(L.mul(post.bands).add(0.5).add(b.mul(post.bandDither))).div(post.bands), float(0.5).div(post.bands));
        c.mulAssign(mix(float(1), Lq.div(L), post.bandMix));

        // hue shift: darks go cool, highlights warm
        const Ls = dot(c, vec3(0.299, 0.587, 0.114));
        const cool = float(1).sub(smoothstep(0.08, 0.5, Ls)).mul(post.cool);
        c.assign(mix(c, c.mul(vec3(0.8, 0.92, 1.16)), cool));
        const warm = smoothstep(0.62, 0.95, Ls).mul(post.warm);
        c.mulAssign(mix(vec3(1), vec3(1.05, 1.0, 0.9), warm));

        // ordered-dither posterise per channel
        out.assign(floor(c.mul(post.levels).add(0.5).add(b.mul(post.dither))).div(post.levels));
      });
      return vec4(clamp(out, 0, 1), 1);
    })();
    // the stylised picture is already posterised to 1/24 steps, so 8 bits per channel hold it exactly
    const styled = new RenderTarget(1, 1, { type: UnsignedByteType, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, samples: 0 });
    const styleMat = new NodeMaterial();
    styleMat.fragmentNode = styleNode;
    styleMat.depthTest = false; styleMat.depthWrite = false;
    const styleQuad = new QuadMesh(styleMat);

    // upscale: device pixel -> art pixel (texel): whole art pixels of uPx device pixels, slid by the camera's
    // sub-pixel remainder, past the margin. screenCoordinate and the targets' rows both run top-down.
    const tStyled = texture(styled.texture);
    const outputNode = Fn(() => {
      const px = floor(screenCoordinate.xy.sub(uOff).div(uPx)).add(MARGIN);
      return vec4(tStyled.sample(px.add(0.5).div(uRes)).rgb, 1);
    })();

    const pipeline = new RenderPipeline(gl as never, outputNode);
    pipeline.outputColorTransform = false;
    return { rt, depthTex, styled, styleMat, styleQuad, pipeline, uRes, uPx, uOff, uGrid, uNear, uFar, uOrtho, uBg, uSkyOn };
  }, [gl]);

  useEffect(() => () => {
    ctx.rt.dispose(); ctx.depthTex.dispose(); ctx.styled.dispose(); ctx.styleMat.dispose(); ctx.pipeline.dispose();
  }, [ctx]);
  // dev hook for perf probes: window.__renderer (pipelines / programs / info) and window.__render (timings)
  useEffect(() => {
    if (!(import.meta.env.DEV || debug.stats)) return;
    Object.assign(window, { __renderer: gl, __render: renderStats });
    // GPU cost of the two post passes (ms per run): await window.__render.benchPost(200)
    renderStats.benchPost = async (n = 100) => {
      const dev = (gl as unknown as { backend: { device: GPUDevice } }).backend.device;
      const run = async (f: () => void) => {
        await dev.queue.onSubmittedWorkDone();
        const t0 = performance.now();
        for (let i = 0; i < n; i++) f();
        await dev.queue.onSubmittedWorkDone();
        return +((performance.now() - t0) / n).toFixed(3);
      };
      const style = await run(() => { gl.setRenderTarget(ctx.styled); ctx.styleQuad.render(gl); gl.setRenderTarget(null); });
      const upscale = await run(() => ctx.pipeline.render());
      // the same stylise work once per device pixel: what the old single-pass upscale cost
      const full = new RenderTarget(view.w, view.h, { type: UnsignedByteType, depthBuffer: false });
      const perDevicePixel = await run(() => { gl.setRenderTarget(full); ctx.styleQuad.render(gl); gl.setRenderTarget(null); });
      full.dispose();
      return { style, upscale, perDevicePixel };
    };
  }, [gl, ctx]);

  useEffect(() => {
    computeView(size.width, size.height, dpr);
    ctx.rt.setSize(view.rtW, view.rtH);
    ctx.styled.setSize(view.rtW, view.rtH);
    ctx.uRes.value.set(view.rtW, view.rtH);
    ctx.uPx.value = view.px;
  }, [size.width, size.height, dpr, ctx]);

  // paper colours in sRGB (tagged linear so Color does no conversion)
  const warm = useMemo(() => ({ done: false }), []);
  const bg = useMemo(() => ({
    out: new Color(), day: new Color().setHex(0xf6f3ea, LinearSRGBColorSpace), night: new Color().setHex(0x0e1220, LinearSRGBColorSpace),
  }), []);
  useFrame(({ scene, camera }) => {
    const cam = camera as Camera & Partial<OrthographicCamera & PerspectiveCamera>;
    ctx.uNear.value = cam.near ?? 0.1;
    ctx.uFar.value = cam.far ?? 200;
    const ortho = (cam as OrthographicCamera).isOrthographicCamera === true;
    ctx.uOrtho.value = ortho ? 1 : 0;
    ctx.uSkyOn.value = ortho ? 0 : 1;
    sky.update(cam);
    // paper colour, day → night (sRGB)
    bg.out.copy(bg.day).lerp(bg.night, U.night.value);
    ctx.uBg.value.set(bg.out.r, bg.out.g, bg.out.b);
    // slide by what the iso snap removed (whole device pixels), and lock the dither to the world grid
    ctx.uOff.value.set(Math.round(view.subX * view.px), -Math.round(view.subY * view.px));
    ctx.uGrid.value.set(view.gridX, (4 - view.gridY) % 4);

    const t0 = performance.now();
    gl.setRenderTarget(ctx.rt);
    if (!warm.done) { warm.done = true; if (!NO_WARM) warmUp(gl, scene); }
    gl.render(scene, camera);
    gl.setRenderTarget(ctx.styled);
    ctx.styleQuad.render(gl);
    gl.setRenderTarget(null);
    ctx.pipeline.render();
    const ms = performance.now() - t0;
    renderStats.cpuMs = renderStats.cpuMs * 0.9 + ms * 0.1;
    if (renderStats.frames++ < 60) renderStats.first.push(Math.round(ms));
  }, 1);

  return null;
}

/** Render the whole town once — every mesh visible (hidden ones too), from a camera that sees the whole map,
 *  with the sun's shadow frustum opened over it — so all main-pass and shadow-pass pipelines compile now,
 *  behind the loading screen, rather than the first time the boy walks into each street. The caller has
 *  already bound the low-res target (pipelines are per render target). */
function warmUp(gl: WebGPURenderer, scene: Scene) {
  const t0 = performance.now();
  const B = WORLD_BOUNDS;
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  const half = Math.max(B.x1 - B.x0, B.z1 - B.z0) / 2 + 60;
  const cam = new OrthographicCamera(-half, half, half, -half, 1, 6000);
  cam.position.set(cx, 2000, cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(cx, 0, cz);
  cam.updateMatrixWorld();

  const hidden: Object3D[] = [];
  scene.traverse((o) => {
    if (o.visible) return;
    const l = o as Object3D & { isLight?: boolean; isCamera?: boolean };
    if (l.isLight || l.isCamera) return; // the light count is part of every shader: never change it
    hidden.push(o); o.visible = true;
  });

  const sun = lightRig.sun;
  const sc = sun?.shadow.camera;
  const saved = sc && sun ? {
    l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, n: sc.near, f: sc.far,
    pos: sun.position.clone(), tgt: sun.target.position.clone(),
  } : null;
  if (sun && sc) {
    const d = new Vector3().subVectors(sun.position, sun.target.position).normalize();
    sc.left = -half * 1.5; sc.right = half * 1.5; sc.top = half * 1.5; sc.bottom = -half * 1.5;
    sc.near = 1; sc.far = 6000;
    sc.updateProjectionMatrix();
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx, 0, cz).addScaledVector(d, 3000);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  }
  try {
    gl.render(scene, cam);
  } catch (e) {
    console.warn('[render] pipeline warm-up failed (harmless: pipelines then compile on first use)', e);
  } finally {
    for (const o of hidden) o.visible = false;
    if (sun && sc && saved) {
      sc.left = saved.l; sc.right = saved.r; sc.top = saved.t; sc.bottom = saved.b; sc.near = saved.n; sc.far = saved.f;
      sc.updateProjectionMatrix();
      sun.position.copy(saved.pos); sun.target.position.copy(saved.tgt);
      sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    }
  }
  renderStats.warmMs = Math.round(performance.now() - t0);
}
