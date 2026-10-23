// Pixel-art render pipeline in TSL (port of Gorshey's render.js post pass).
// 1. The scene renders into a small render target (one texel = one art pixel), no MSAA.
// 2. A full-screen TSL pass upscales it with nearest sampling, darkens depth edges a touch, snaps luma to
//    bands (toon ramp), shifts shadows cool / highlights warm, and posterises with a 4x4 ordered dither, so
//    gradients break into pixel patterns. Background pixels get the paper colour (iso) or a dithered sky
//    (chase camera), with stars at night.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  DepthTexture, FloatType, HalfFloatType, NearestFilter, RenderTarget, Vector2, Vector3, Color, LinearSRGBColorSpace,
  type Camera, type OrthographicCamera, type PerspectiveCamera,
} from 'three';
import { RenderPipeline, type WebGPURenderer, type Node } from 'three/webgpu';
import {
  Fn, If, texture, screenUV, uniform, vec2, vec3, vec4, float, floor, max, min, mix, smoothstep, dot, clamp,
  sRGBTransferOETF, orthographicDepthToViewZ, perspectiveDepthToViewZ, select, step, abs,
} from 'three/tsl';
import { bayer4 } from '../core/tsl';
import { U } from '../core/uniforms';
import { computeView, view } from './view';
import { sky } from './sky';

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

    const uRes = uniform(new Vector2(1, 1));
    const uNear = uniform(0.1), uFar = uniform(200), uOrtho = uniform(1);
    const uBg = uniform(new Vector3(0.98, 0.98, 0.97)); // sRGB
    const uSkyOn = uniform(0);
    const uInvProj = sky.invProj, uCamWorld = sky.camWorld;

    const tColor = texture(rt.texture);
    const tDepth = texture(depthTex);

    const viewZAt = (d: Node<'float'>) =>
      select(uOrtho.greaterThan(0.5), orthographicDepthToViewZ(d, uNear, uFar), perspectiveDepthToViewZ(d, uNear, uFar));

    const outputNode = Fn(() => {
      // flip so art-pixel rows match the target's texel rows
      const suv = vec2(screenUV.x, screenUV.y);
      const px = floor(suv.mul(uRes));
      const uv = px.add(0.5).div(uRes);
      const texel = vec2(1).div(uRes);
      const d = tDepth.sample(uv).r;
      const b = bayer4(px).sub(0.5);
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

    const pipeline = new RenderPipeline(gl as never, outputNode);
    pipeline.outputColorTransform = false;
    return { rt, depthTex, pipeline, uRes, uNear, uFar, uOrtho, uBg, uSkyOn };
  }, [gl]);

  useEffect(() => () => { ctx.rt.dispose(); ctx.depthTex.dispose(); ctx.pipeline.dispose(); }, [ctx]);

  useEffect(() => {
    computeView(size.width, size.height, dpr);
    ctx.rt.setSize(view.lowW, view.lowH);
    ctx.uRes.value.set(view.lowW, view.lowH);
  }, [size.width, size.height, dpr, ctx]);

  // paper colours in sRGB (tagged linear so Color does no conversion)
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

    gl.setRenderTarget(ctx.rt);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    ctx.pipeline.render();
  }, 1);

  return null;
}
