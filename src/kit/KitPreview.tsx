// ?kit=1 — a showroom of kit pieces near the spawn, for the kit builders' screenshots. Not part of the game.
// Two rows of buildings face a little paved street on the empty north-west hillside (x −62..−30, z −34..−8);
// shoot it with `node scripts/shot.mjs --kit --x -46 --z -20`. Triangle counts land on window.__kitStats.
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute, Mesh, type Object3D } from 'three';
import { Parts } from '../core/geom';
import { mat, partsMaterial } from '../core/materials';
import { PAL } from '../core/palette';
import { collision, type BoxInit } from '../core/collision';
import { lamps, type Lamp } from '../core/lamps';
import { groundY } from '../world/terrain';
import { vnoise2 } from '../core/math';
import { buildBuilding, streetRow, KIT_DEBUG, type BuildingSpec, type Placement } from './building';
import { roadById } from '../world/layout';
import { makeSign, mergeSigns, signSize } from './sign';

const STREET_Z = -21;   // centre line of the showroom street (runs along x)
const STREET_W = 8;
const X0 = -64, X1 = -28, Z0 = -36, Z1 = -6;


interface Lot { spec: BuildingSpec; x: number; side: 1 | -1 }

const LOTS: Lot[] = [
  // north row (fronts face south, +z)
  { x: -58.9, side: 1, spec: { w: 5.8, d: 7, floors: 3, ground: 'shop', shop: 'goods', roof: 'flat', tanks: 2, dish: true, awning: PAL.roofBlue, sign: { text: 'TASHI STORE', bod: 'བཀྲ་ཤིས་ཚོང་ཁང་', bg: PAL.templeRed, fg: PAL.templeYellow }, seed: 11 } },
  { x: -52.7, side: 1, spec: { w: 6.0, d: 7.5, floors: 2, ground: 'cafe', roof: 'terrace', sign: { text: 'PEACE CAFE', bod: 'ཞི་བདེ།', bg: PAL.deodarDark, fg: PAL.wallCream }, wall: PAL.wallMint, seed: 22 } },
  { x: -45.9, side: 1, spec: { w: 7.0, d: 8, floors: 5, ground: 'hotel', roof: 'flat', balconies: true, mumty: true, sign: { text: 'SNOW VIEW', bod: 'གངས་ལྗོངས།', bg: PAL.roofBlue, fg: PAL.wallWhite }, wall: PAL.wallSky, seed: 33 } },
  { x: -39.4, side: 1, spec: { w: 5.4, d: 7, floors: 4, ground: 'shop', shop: 'shawls', roof: 'tin', ridge: 'z', roofColor: PAL.roofGreen, tibetan: true, sign: { text: 'SHAWLS', bg: PAL.wallYellow, fg: PAL.templeRed }, seed: 44 } },
  { x: -33.8, side: 1, spec: { w: 5.2, d: 6.5, floors: 3, ground: 'blank', roof: 'flat', unfinished: true, rebar: true, seed: 55 } },
  // south row (fronts face north, −z)
  { x: -60.2, side: -1, spec: { w: 3.6, d: 4.2, floors: 1, ground: 'shop', shop: 'crafts', roof: 'tin', ridge: 'x', roofColor: PAL.roofGreen, awning: null, bays: 1, sign: { text: 'THANGKA', bod: 'ཐང་ཀ', bg: PAL.templeMaroon, fg: PAL.gold }, seed: 131 } },
  { x: -55.3, side: -1, spec: { w: 5.6, d: 6.5, floors: 2, ground: 'house', roof: 'tinHip', roofColor: PAL.roofRed, tibetan: true, wall: PAL.wallCream, seed: 66 } },
  { x: -49.7, side: -1, spec: { w: 5.0, d: 6, floors: 1, ground: 'garage', roof: 'flat', sideStairs: 'left', rebar: true, tanks: 1, seed: 77 } },
  { x: -44.1, side: -1, spec: { w: 5.6, d: 7, floors: 4, ground: 'hotel', roof: 'tinHip', roofColor: PAL.roofMaroon, balconies: true, seed: 88 } },
  { x: -38.4, side: -1, spec: { w: 5.2, d: 7.5, floors: 3, ground: 'house', roof: 'flat', mumty: true, sideStairs: 'right', solar: true, seed: 99 } },
  // a grocery on stilts at the east end, where the hillside drops away behind the street
  { x: -32.8, side: -1, spec: { w: 5.4, d: 6.5, floors: 2, ground: 'shop', shop: 'grocery', roof: 'tin', ridge: 'x', roofColor: PAL.roofRust, stilts: true, awning: PAL.roofRed, sign: { text: 'FRUIT & VEG', bg: PAL.roofGreen, fg: PAL.wallWhite }, seed: 123 } },
];

function placeOf(l: Lot): Placement {
  const d = l.spec.d;
  const zc = STREET_Z - l.side * (STREET_W / 2 + 0.6 + d / 2);
  const yaw = l.side > 0 ? 0 : Math.PI;
  return { x: l.x, z: zc, yaw }; // y omitted: the kit takes groundY at the front-centre
}

/** Ground patch for the showroom (the town terrain stops at the rim), with the paved street. */
function groundPatch(): Mesh {
  const pos: number[] = [], col: number[] = [];
  const step = 1;
  const c = (hex: number) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  const hAt = (x: number, z: number) => groundY(x, z) + 0.01;
  const colAt = (x: number, z: number) => {
    const dzs = Math.abs(z - STREET_Z);
    if (dzs <= STREET_W / 2) return c(vnoise2(x * 0.7, z * 0.7) > 0.5 ? PAL.paving : PAL.pavingDark);
    if (dzs <= STREET_W / 2 + 0.7) return c(PAL.curb);
    const n = vnoise2(x * 0.35, z * 0.35);
    return c(n > 0.62 ? PAL.grassLight : n > 0.35 ? PAL.grass : PAL.grassDeep);
  };
  for (let x = X0; x < X1; x += step) for (let z = Z0; z < Z1; z += step) {
    const q = [[x, z], [x + step, z], [x, z + step], [x + step, z + step]] as const;
    const h = q.map(([qx, qz]) => hAt(qx, qz));
    const k = colAt(x + 0.5, z + 0.5);
    const v = (i: number) => { pos.push(q[i][0], h[i], q[i][1]); col.push(...k); };
    v(0); v(2); v(1); v(1); v(2); v(3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new Mesh(g, mat({ key: 'kit-ground', vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

interface Built { meshes: Object3D[]; colliders: BoxInit[]; lamps: Lamp[] }

export function KitPreview() {
  const built = useMemo<Built>(() => {
    const parts = new Parts();
    const colliders: BoxInit[] = [];
    const lampList: Lamp[] = [];
    let extra: Object3D[] = [];
    const stats: { name: string; tris: number }[] = [];
    const bySection: Record<string, number> = {};
    // ?kitonly=3,5 shows only those lots (index into LOTS), for close-up review
    const only = new URLSearchParams(location.search).get('kitonly')?.split(',').map(Number);
    const lots = LOTS.filter((_, i) => !only || only.includes(i));
    for (const l of lots) {
      const at = placeOf(l);
      // triangle count of this building alone
      const probe = new Parts();
      const add = probe.add.bind(probe);
      probe.add = (geo, ...rest) => {
        const t = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        bySection[KIT_DEBUG.section] = (bySection[KIT_DEBUG.section] ?? 0) + t;
        return add(geo, ...rest);
      };
      buildBuilding(probe, l.spec, at);
      const g = probe.merge();
      stats.push({ name: `${l.spec.ground}/${l.spec.roof}/${l.spec.floors}f`, tris: (g.index?.count ?? 0) / 3 });
      g.dispose();
      const b = buildBuilding(parts, l.spec, at);
      colliders.push(...b.colliders);
      lampList.push(...b.lamps);
      extra.push(...b.meshes);
      // door marker (1-px yellow post) so the door points can be checked in screenshots
      parts.box(0.06, 0.25, 0.06, [b.door.x, b.door.y + 0.125, b.door.z], PAL.railingYellow);
    }
    // free-standing signs on posts along the street
    const signs = [
      { x: -49.0, text: 'TASHI DELEK', bod: 'བཀྲ་ཤིས་བདེ་ལེགས།', bg: PAL.templeRed, fg: PAL.templeYellow },
      { x: -41.5, text: 'KORA 200M', bod: 'སྐོར་ར།', bg: PAL.roofBlue, fg: PAL.wallWhite },
      { x: -56.0, text: 'MOMO 60', bg: PAL.wallWhite, fg: PAL.templeRed },
    ];
    for (const s of signs) {
      const m = makeSign({ text: s.text, bod: s.bod, bg: s.bg, fg: s.fg });
      const zP = STREET_Z + 0.06; // on the street's centre line, facing south
      const yb = groundY(s.x, STREET_Z);
      const h = signSize({ text: s.text, bod: s.bod }).h;
      m.position.set(s.x, yb + 1.45 + h / 2, zP);
      for (const sx of [-0.45, 0.45]) parts.box(0.06, 1.45 + h, 0.06, [s.x + sx, yb + (1.45 + h) / 2, zP - 0.06], PAL.concreteDark);
      colliders.push({ x: s.x, z: zP - 0.06, w: 1.0, d: 0.12, y0: yb, y1: yb + 1.45 + h, tag: 'sign' });
      extra.push(m);
    }
    extra = mergeSigns(extra);
    const meshes: Object3D[] = [groundPatch(), ...parts.toMeshes(partsMaterial({ occlude: true }), 24), ...extra];
    const total = stats.reduce((a, s) => a + s.tris, 0);
    // a realistic street row (party walls) for the budget: Temple Road frontage, both sides (not rendered)
    const rowProbe = new Parts();
    const rowN = streetRow(rowProbe, roadById('temple-road'), 9, 76, 1, { seed: 5 }).length
      + streetRow(rowProbe, roadById('temple-road'), 9, 76, -1, { seed: 6, ground: ['shop', 'cafe', 'house', 'hotel'] }).length;
    const rowGeo = rowProbe.merge();
    const rowAvg = Math.round((rowGeo.index?.count ?? 0) / 3 / Math.max(1, rowN));
    rowGeo.dispose();
    (window as unknown as { __kitStats?: unknown }).__kitStats = {
      buildings: stats, bySection, rowAvg, rowN, avg: Math.round(total / stats.length), max: Math.max(...stats.map((s) => s.tris)),
      drawCalls: meshes.length, colliders: colliders.length, lamps: lampList.length,
    };
    return { meshes, colliders, lamps: lampList };
  }, []);

  useEffect(() => {
    const offs = [...built.colliders.map((c) => collision.addBox(c)), ...built.lamps.map((l) => lamps.add(l))];
    return () => { for (const off of offs) off(); };
  }, [built]);

  return (
    <group>
      {built.meshes.map((m, i) => <primitive key={i} object={m} />)}
    </group>
  );
}
