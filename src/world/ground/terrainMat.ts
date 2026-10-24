// The ground painter: one TSL material for the whole terrain. Every surface is drawn procedurally from the
// baked distance fields (fields.ts) and world-space noise, at art-pixel resolution:
//   asphalt roads (worn centre, repair patches, cracks, oil drips, potholes + puddles, crumbling edges),
//   concrete kerb band + open drains, gravel shoulders, Main Square stone tiles, temple flagstones,
//   Market Lane setts, the kora's packed earth, viewpoint slabs, hillside grass / dry grass / bare earth,
//   forest floor (needles, moss), goat paths, rock on steep bits, and packed earth in built-up frontage.
// The diorama rim dissolves through a Bayer dither (iso camera); in the chase camera the land continues
// and fades into the horizon haze.
import type { Node } from 'three/webgpu';
import {
  Fn, abs, float, floor, fract, max, min, mix, normalWorld, positionWorld, smoothstep, step, texture, vec2, vec4,
} from 'three/tsl';
import { mat } from '../../core/materials';
import { hash12, vnoise12 } from '../../core/tsl';
import { U } from '../../core/uniforms';
import { PAL } from '../../core/palette';
import { C, fieldUV, fields, haze, horizon, pixCell, rimKeep } from './shade';
import { fieldTextures } from './fields';
import { ROADS, roadFrame } from '../layout';
import { plazaQuery } from '../terrain';

/** Zebra crossings where each asphalt road leaves the Main Square (centre, unit tangent). */
const CROSSINGS = ROADS.filter((r) => r.kind === 'road').map((r) => {
  let s = 0;
  while (s < 20 && plazaQuery(roadFrame(r, s).x, roadFrame(r, s).z).edge < 1.5) s += 0.25;
  const f = roadFrame(r, s + 1.5);
  return { x: f.x, z: f.z, tx: f.tx, tz: f.tz };
});

// ---- palette (sRGB) ---------------------------------------------------------------------------------
const K = {
  asph: C(PAL.asphalt), asphL: C(PAL.asphaltLight), asphW: C(PAL.asphaltWorn), asphPatch: C(0x3e3e41),
  asphNew: C(0x38383b), crack: C(0x2b2b2e), oil: C(0x302c2a), pot: C(0x3b3129), potRim: C(0x6a6458),
  puddle: C(0x4b5862), puddleHi: C(0x7d8d99), wet: C(0x3d3f44),
  curb: C(PAL.curb), curbD: C(0x9d978b), drain: C(PAL.drain), drainDeep: C(0x272524), water: C(0x4a5862),
  gravel: C(0x8a8476), gravelD: C(0x6f6a60), earth: C(PAL.earth), earthD: C(PAL.earthDark), mud: C(PAL.mud),
  packed: C(0x7f6b52), concrete: C(PAL.concrete), concreteD: C(PAL.concreteDark),
  grass: C(0x55782b), grassDeep: C(PAL.grassDeep), grassLight: C(0x76933a), dry: C(0x9d955a), grassMid: C(0x4a6b26),
  moss: C(PAL.moss), needle: C(PAL.needle), needleD: C(PAL.needleDark), bark: C(PAL.barkLight),
  rock: C(PAL.rock), rockD: C(PAL.rockDark),
  pave: C(PAL.paving), paveD: C(0x8e897e), paveL: C(0xa29d92), paveJ: C(0x6e6a61),
  flag: C(0xb3aea3), flagL: C(0xbdb8ad), flagD: C(0xa6a196), flagJ: C(0x77726a),
  sett: C(0x958a7b), settD: C(0x82786b), settL: C(0xa39a8c), settJ: C(0x625a50),
  kora: C(0x8d6f4e), koraD: C(0x765a3e), koraL: C(0x9c7e5b),
  stone: C(PAL.stoneStep), stoneD: C(0x857f73), stoneL: C(0x938d80), stoneJ: C(0x666157),
  junkBlue: C(0x5f7d9c), junkRed: C(0x9a5a4e), junkWhite: C(0xcfcac0),
  iron: C(0x343436), ironL: C(0x4a4a4d), paint: C(0xd9d6cc), paintW: C(0xbdbab0),
};

export function terrainMaterial() {
  const m = mat({ flat: false, grain: 0, vertexColors: false, key: 'ground:terrain' });
  const xz = positionWorld.xz;
  const F = fields(xz);

  const color = Fn(() => {
    const aE = F.A.r, lE = F.A.g, pE = F.A.b;
    const cen = F.B.r, drain = F.B.g, path = F.B.b, built = F.B.a;
    const px = pixCell(xz);
    const h1 = hash12(px).toVar(), h2 = hash12(px.add(vec2(31.7, 11.3))).toVar();
    const j = h1.sub(0.5).toVar(); // per-art-pixel jitter for dithered thresholds
    /** dithered threshold: 1 where n (+ jitter·w) passes t */
    const th = (n: Node<'float'>, t: number, w: number) => step(t, n.add(j.mul(w)));
    const n1 = vnoise12(xz.mul(0.075).add(vec2(3.1, 8.7))).toVar();
    const n2 = vnoise12(xz.mul(0.31).add(vec2(5.2, 1.9))).toVar();
    const n3 = vnoise12(xz.mul(1.25).add(vec2(9.1, 4.4))).toVar();
    const n4 = vnoise12(xz.mul(4.1).add(vec2(2.3, 7.7))).toVar();
    const ap = U.artPx;
    const dS = min(min(aE, lE), pE);

    // ---- land ----------------------------------------------------------------------------------------
    const g = K.grass.toVar();
    g.assign(mix(g, K.grassMid, th(float(1).sub(n3).mul(0.6).add(n2.mul(0.4)), 0.55, 0.12)));
    g.assign(mix(g, K.grassDeep, th(float(1).sub(n4).mul(0.5).add(float(1).sub(n2).mul(0.5)), 0.66, 0.1)));
    g.assign(mix(g, K.grassLight, th(n4.mul(0.55).add(n2.mul(0.45)), 0.7, 0.1)));
    const dry = th(n1.mul(0.8).add(n3.mul(0.2)), 0.62, 0.08);
    g.assign(mix(g, mix(K.dry, K.grass, th(n4, 0.62, 0.2)), dry));
    // lush meadow patches (twin of grass.ts lushAt): deeper, mottled green under the tall tufts
    const lush = th(vnoise12(xz.mul(0.11).add(vec2(40, -13))), 0.64, 0.06);
    g.assign(mix(g, mix(K.grassMid, K.grassDeep, th(n4.mul(0.6).add(n3.mul(0.4)), 0.55, 0.15)), lush));
    const bare = th(float(1).sub(n2).mul(0.8).add(n4.mul(0.2)), 0.76, 0.08).mul(float(1).sub(lush));
    g.assign(mix(g, mix(K.earth, K.earthD, th(n4, 0.55, 0.3)), bare));

    const f = K.needle.toVar();
    f.assign(mix(f, K.needleD, th(n3.mul(0.7).add(n4.mul(0.3)), 0.55, 0.15)));
    f.assign(mix(f, K.moss, th(n2.mul(0.7).add(n4.mul(0.3)), 0.6, 0.1)));
    f.assign(mix(f, K.grassDeep, th(n4, 0.74, 0.1).mul(0.85)));
    f.assign(mix(f, K.bark, step(0.985, h2)));
    const forestness = smoothstep(6, 16, dS.add(n1.sub(0.5).mul(10)));
    const land = mix(g, f, th(forestness, 0.5, 0.25)).toVar();

    // rock on steep ground
    const slope = float(1).sub(normalWorld.y);
    const rk = th(slope.mul(5).add(n2.mul(0.4)), 0.95, 0.2);
    land.assign(mix(land, mix(K.rock, K.rockD, th(n4, 0.55, 0.3)), rk));

    // built-up frontage: packed earth with gravel clusters, the odd concrete scrap, weeds at the edges
    const b = K.packed.toVar();
    b.assign(mix(b, K.gravel, th(n4.mul(0.6).add(n3.mul(0.4)), 0.62, 0.15)));
    // broken concrete slabs (old doorsteps, plinths of long-gone sheds)
    const sc = xz.div(vec2(1.4, 1.1));
    const ccell = floor(sc), sf = fract(sc);
    const slab = step(0.86, hash12(ccell.add(vec2(3.3, 8.1))))
      .mul(step(0.1, sf.x)).mul(step(sf.x, 0.92)).mul(step(0.12, sf.y)).mul(step(sf.y, 0.9));
    b.assign(mix(b, mix(K.concreteD, K.concrete, step(0.5, hash12(ccell))), slab));
    b.assign(mix(b, K.grassMid, th(n4.mul(0.6).add(n1.mul(0.4)), 0.76, 0.1)));
    b.assign(mix(b, K.gravelD, step(0.95, h2)));
    land.assign(mix(land, b, th(built, 0.5, 0.3)));

    // goat paths
    const pc = mix(K.earth, K.mud, th(n4, 0.5, 0.7)).toVar();
    pc.assign(mix(pc, K.rock, step(0.955, h2)));
    land.assign(mix(land, pc, th(path.add(n3.sub(0.5).mul(0.3)), 0.5, 0.3)));

    // ---- asphalt verge: kerb band, open drain, gravel shoulder ---------------------------------------
    const sh = mix(K.gravel, K.earth, th(n3, 0.5, 0.6)).toVar();
    sh.assign(mix(sh, K.gravelD, step(0.86, h2)));
    sh.assign(mix(sh, K.grassDeep, th(n4, 0.7, 0.3).mul(step(0.5, aE))));
    sh.assign(mix(sh, mix(K.concrete, K.concreteD, th(n3, 0.6, 0.4)), th(built, 0.5, 0.2).mul(step(aE, 0.9))));
    const shoulderW = float(0.95).add(n3.sub(0.5).mul(0.7)).add(built.mul(0.3));
    const col = land.toVar();
    const offLane = step(0.05, lE).mul(step(0.05, pE));
    col.assign(mix(col, sh, step(0, aE).mul(step(aE, shoulderW)).mul(offLane)));

    const dIn = aE.sub(0.2);
    const dr = K.drain.toVar();
    dr.assign(mix(dr, K.drainDeep, step(0.09, dIn).mul(step(dIn, 0.27))));
    dr.assign(mix(dr, K.water, step(abs(dIn.sub(0.18)), ap.mul(0.8)).mul(th(n2, 0.45, 0.2))));
    dr.assign(mix(dr, mix(K.junkBlue, mix(K.junkRed, K.junkWhite, step(0.5, h1)), step(0.33, h1)), step(0.988, h2)));
    dr.assign(mix(dr, K.curbD, step(dIn, ap.mul(1.1))));            // near lip (under the kerb's shadow)
    dr.assign(mix(dr, K.curb, step(float(0.36).sub(ap.mul(1.2)), dIn))); // far lip highlight, 1 px
    const drainBand = step(0.5, drain).mul(step(0.2, aE)).mul(step(aE, 0.56)).mul(offLane);
    col.assign(mix(col, dr, drainBand));
    const rural = step(0.18, drain).mul(step(drain, 0.42));
    col.assign(mix(col, mix(K.curb, K.curbD, step(0.85, h2)), step(0, aE).mul(step(aE, 0.2)).mul(offLane).mul(float(1).sub(rural))));

    // ---- asphalt -------------------------------------------------------------------------------------
    const a = K.asph.toVar();
    a.assign(mix(a, K.asphL, th(cen.mul(0.9).add(n2.sub(0.5).mul(0.4)), 0.64, 0.2).mul(0.8)));
    // oil drip line down the middle of each lane
    const lanes = smoothstep(0.3, 0.42, cen).mul(float(1).sub(smoothstep(0.58, 0.7, cen)));
    a.assign(mix(a, K.oil, lanes.mul(th(vnoise12(xz.mul(1.7).add(vec2(21, 4))), 0.62, 0.3)).mul(0.7)));
    // repair patches: new dark asphalt with a 1-px seam, and old ones worn to gravel
    const pn = vnoise12(xz.mul(0.36).add(vec2(13.1, 7.7)));
    a.assign(mix(a, mix(K.asphNew, K.asphPatch, step(0.5, h2)), step(0.735, pn)));
    a.assign(mix(a, K.crack, step(abs(pn.sub(0.735)), 0.0075)));
    const pn2 = vnoise12(xz.mul(0.52).add(vec2(40, 3)));
    a.assign(mix(a, mix(K.asphW, K.gravel, step(0.6, h2)), th(pn2, 0.79, 0.06)));
    // cracks: thin meandering lines in some stretches
    const cg = step(0.5, vnoise12(xz.mul(0.11).add(vec2(3, 9))));
    const cn = vnoise12(xz.mul(0.85).add(vec2(77, 5)));
    const cn2 = vnoise12(xz.mul(2.3).add(vec2(17, 41)));
    const crack = step(abs(cn.sub(0.5)), 0.012).add(step(abs(cn2.sub(0.5)), 0.016).mul(step(abs(cn.sub(0.5)), 0.08)));
    a.assign(mix(a, K.crack, max(crack.mul(cg), float(0)).min(1)));
    // crumbling edges
    const ed = aE.add(0.32).add(n3.sub(0.5).mul(0.35));
    a.assign(mix(a, mix(K.asphW, mix(K.gravel, K.earth, step(0.6, h2)), step(0.5, h1)), step(0, ed).mul(step(0.4, h1.add(n4.mul(0.3))))));
    // grain + speckles
    a.mulAssign(float(1).add(j.mul(0.15)));
    a.assign(mix(a, K.asphL.mul(1.1), step(0.94, h2)));
    a.assign(mix(a, K.crack, step(h2, 0.035)));
    // potholes, some with a puddle (sky-grey with streaks of reflection)
    const ph = vnoise12(xz.mul(0.8).add(vec2(51, 23)));
    const pg = step(0.58, vnoise12(xz.mul(0.065).add(vec2(17, 2)))).mul(step(0.12, cen));
    const hole = step(0.855, ph).mul(pg);
    const pud = step(0.875, ph).mul(pg);
    const wetRing = step(0.83, ph).mul(pg);
    a.assign(mix(a, K.wet, wetRing.mul(0.6)));
    a.assign(mix(a, mix(K.pot, K.potRim, step(ph, 0.862)), hole));
    const streak = step(fract(xz.x.sub(xz.y).mul(1.3).add(n3.mul(0.4))), ap.mul(1.3));
    a.assign(mix(a, mix(K.puddle, K.puddleHi, streak), pud));
    // manholes: round iron covers on the crown of the road, one per ~19 m cell at most
    const mcell = floor(xz.div(19));
    const mh = hash12(mcell.add(vec2(7.7, 1.3)));
    const mc = mcell.add(vec2(0.5)).add(vec2(hash12(mcell.add(2.1)), hash12(mcell.add(5.3))).sub(0.5).mul(0.8)).mul(19);
    const mcen = texture(fieldTextures().b, fieldUV(mc)).r;
    const md = xz.sub(mc).length();
    const mOn = step(0.55, mh).mul(step(0.62, mcen)).mul(step(md, 0.34));
    const iron = mix(K.iron, K.ironL, step(fract(xz.x.add(xz.y).mul(9)), 0.35).mul(step(md, 0.26)));
    a.assign(mix(a, mix(iron, K.crack, step(0.27, md).mul(step(md, 0.3))), mOn));
    // zebra crossings where the roads leave the square: faded, scuffed white paint
    for (const c of CROSSINGS) {
      const d = xz.sub(vec2(c.x, c.z));
      const u = d.x.mul(c.tx).add(d.y.mul(c.tz));
      const v = d.x.mul(-c.tz).add(d.y.mul(c.tx));
      const zebra = step(abs(u), 1.15).mul(step(fract(v.div(0.75).add(0.25)), 0.5)).mul(step(aE, -0.3));
      a.assign(mix(a, mix(K.paint, K.paintW, step(0.5, h2)), zebra.mul(th(n4.mul(0.6).add(n3.mul(0.4)), 0.3, 0.3))));
    }
    col.assign(mix(col, a, step(aE, 0)));

    // ---- lanes: Market Lane setts, the kora's packed earth ------------------------------------------
    const isKora = step(70, xz.y);
    // setts: 0.42 x 0.21 running bond
    const sp = xz.div(vec2(0.42, 0.21)).toVar();
    const srow = floor(sp.y);
    const su = sp.x.add(fract(srow.mul(0.5)));
    const scell = vec2(floor(su), srow);
    const st = hash12(scell);
    const sett = mix(mix(K.sett, K.settD, step(0.62, st)), K.settL, step(st, 0.18)).toVar();
    sett.mulAssign(float(1).add(j.mul(0.08)));
    const sj = max(step(fract(su), ap.mul(1.1).div(0.42)), step(fract(sp.y), ap.mul(1.1).div(0.21)));
    sett.assign(mix(sett, K.settJ, sj));
    sett.assign(mix(sett, K.settJ, th(n2, 0.75, 0.15).mul(0.35))); // grime
    // kora: packed brown earth, a paler worn track, pebbles and stones
    const kc = mix(K.kora, K.koraD, th(n3, 0.58, 0.4)).toVar();
    kc.assign(mix(kc, K.koraL, th(float(-0.45).sub(lE).add(n2.sub(0.5).mul(0.4)), 0.05, 0.3)));
    kc.assign(mix(kc, K.rockD, th(n4, 0.83, 0.1)));
    kc.assign(mix(kc, K.rock, step(0.962, h2)));
    kc.assign(mix(kc, K.grassDeep, step(float(-0.3).add(n3.mul(0.35)), lE).mul(step(0.5, h1))));
    const laneCol = mix(sett, kc, isKora);
    // lane verges: stone edging on the market lane, trodden grass along the kora
    const lv = mix(K.curbD, mix(land, K.earth, step(0.55, h1)), isKora);
    const onA = step(aE, 0);
    col.assign(mix(col, lv, step(0, lE).mul(step(lE, mix(float(0.16), float(0.45), isKora))).mul(float(1).sub(onA)).mul(step(0.05, pE))));
    col.assign(mix(col, laneCol, step(lE, 0).mul(float(1).sub(onA))));

    // ---- plazas: Main Square tiles, temple flagstones, viewpoint slabs -------------------------------
    const isCourt = step(60, xz.y), isView = step(xz.y, -50);
    // square: 0.62 m tiles, half-bond
    const tp = xz.div(0.62).toVar();
    const trow = floor(tp.y);
    const tu = tp.x.add(fract(trow.mul(0.5)));
    const tcell = vec2(floor(tu), trow);
    const tt = hash12(tcell);
    const tile = mix(mix(K.pave, K.paveD, step(0.78, tt)), K.paveL, step(tt, 0.12)).toVar();
    tile.mulAssign(float(1).add(j.mul(0.05)));
    tile.assign(mix(tile, tile.mul(0.92), th(n2, 0.66, 0.1)));
    const tj = max(step(fract(tu), ap.mul(1.1).div(0.62)), step(fract(tp.y), ap.mul(1.1).div(0.62)));
    tile.assign(mix(tile, K.paveJ, tj));
    // court: big pale flagstones in rows of varying length, the odd split slab
    const fRow = floor(xz.y.div(1.15));
    const fLen = float(1.4).add(hash12(vec2(fRow, 3.7)).mul(0.8));
    const fu = xz.x.div(fLen).add(hash12(vec2(fRow, 9.1)));
    const fcell = vec2(floor(fu), fRow);
    const ft = hash12(fcell);
    const flag = mix(mix(K.flag, K.flagD, step(0.7, ft)), K.flagL, step(ft, 0.18)).toVar();
    flag.mulAssign(float(1).add(j.mul(0.05)));
    flag.assign(mix(flag, flag.mul(0.94), th(n3, 0.68, 0.1)));
    const fy = fract(xz.y.div(1.15));
    const split = step(0.8, hash12(fcell.add(5.5))).mul(step(abs(fract(fu).sub(0.5)), ap.mul(0.8).div(fLen)));
    const fj = max(max(step(fract(fu), ap.mul(1.6).div(fLen)), step(fy, ap.mul(1.6).div(1.15))), split);
    flag.assign(mix(flag, K.flagJ, fj));
    // viewpoint: smaller grey slabs
    const vp = xz.div(vec2(0.8, 0.6)).toVar();
    const vrow = floor(vp.y);
    const vu = vp.x.add(hash12(vec2(vrow, 1.3)));
    const vt = hash12(vec2(floor(vu), vrow));
    const vs = mix(mix(K.stone, K.stoneD, step(0.7, vt)), K.stoneL, step(vt, 0.14)).toVar();
    vs.mulAssign(float(1).add(j.mul(0.06)));
    vs.assign(mix(vs, vs.mul(0.93), th(n3, 0.66, 0.1)));
    const vj = max(step(fract(vu), ap.mul(1.2).div(0.8)), step(fract(vp.y), ap.mul(1.2).div(0.6)));
    vs.assign(mix(vs, K.stoneJ, vj));
    const plazaCol = mix(mix(tile, flag, isCourt), vs, isView);
    // square border: a band of darker kerb stones (not across the road mouths)
    const bj = max(step(fract(xz.x.mul(1.1)), ap.mul(1.2)), step(fract(xz.y.mul(1.1)), ap.mul(1.2)));
    const border = mix(K.curbD, K.paveJ, bj);
    const isSquare = float(1).sub(isCourt);
    col.assign(mix(col, plazaCol, step(pE, 0)));
    col.assign(mix(col, border, step(float(-0.42), pE).mul(step(pE, 0)).mul(isSquare).mul(step(0.25, aE))));

    // puddles mirror the sky a little (alpha carries the reflection mask)
    const refl = pud.mul(step(aE, 0)).mul(step(0, pE)).mul(float(0.6).add(streak.mul(0.4)));
    return vec4(col, refl);
  })();

  const hz = haze(70, 420, 0.8);
  m.colorNode = vec4(color.xyz.mul(float(1).sub(hz)), 1);
  (m as unknown as { emissiveNode: Node }).emissiveNode = horizon().mul(hz.add(color.w.mul(0.22)));
  m.maskNode = rimKeep(F.A.a, xz);
  return m;
}
