// Courtyard dressing: the peepal tree platform and the debate yard, the white incense burner (sang-khang),
// stupas, darchor poles, potted marigolds, benches and lamp posts.
import { PAL } from '../../core/palette';
import { bench, pottedPlant, streetLamp } from '../../kit/street';
import type { DarchorPole } from '../../kit/flags';
import type { Acc } from './acc';
import { CY, DEBATE, GALLERY } from './site';
import { INK, WHITEWASH, chorten, shade } from './util';

/**
 * Darchor: two big poles flanking the main steps, one by the tree, one in the north-east corner, one SW.
 * They are drawn without the kit's radiating ground strings (those fell at random across the main steps and
 * the debate yard at knee height); their lungta are strung from the pole tops to roofs in flags.ts instead.
 */
export const DARCHOR: DarchorPole[] = [
  { x: 5.2, z: 103.9, y: CY, h: 9.5, seed: 11, color: PAL.lungta[3] },
  { x: 14.8, z: 103.9, y: CY, h: 9.5, seed: 12, color: PAL.lungta[2] },
  { x: -7.6, z: 96.2, y: CY, h: 7.5, seed: 13, color: PAL.lungta[4] },
  { x: 26.3, z: 95.6, y: CY, h: 7, seed: 14, color: PAL.lungta[0] },
  { x: -1.2, z: 124.6, y: CY, h: 7, seed: 15, color: PAL.lungta[1] },
];

export function buildDressing(acc: Acc) {
  treePlatform(acc);
  debatePlatform(acc);
  sangKhang(acc, 14.8, 98.4);
  // the bigger chorten on the south-west plaza, a row of small ones along the east wall beyond the wheel lane
  bigChorten(acc, -4.6, 119.6);
  // (a gap is left where the east stairway arrives from the kora, z ≈ 112.5–114.7)
  const cz = [99.8, 104.0, 108.2, 118.6, 122.8];
  cz.forEach((z, i) => {
    chorten(acc.small, [27.75, CY, z], 1.5, 0);
    acc.box({ x: 27.75, z, w: 0.95, d: 0.95, y0: CY, y1: CY + 1.5, tag: 'chorten' });
    const next = cz[i + 1];
    if (next !== undefined && next - z < 5) for (let k = 0; k < 2; k++) acc.box(pottedPlant(acc.small, 27.75 + (k ? 0.5 : -0.5), CY, (z + next) / 2, 300 + i * 2 + k));
  });
  acc.poles.push(...DARCHOR);

  // prostration boards on the court in front of the main hall, a shoe rack by the steps
  for (const [x, z] of [[1.8, 105.6], [1.8, 108.2], [18.4, 106.2], [18.4, 108.8]] as const) {
    acc.small.box(0.72, 0.1, 2.0, [x, CY + 0.05, z], PAL.woodTrim);
    acc.small.box(0.66, 0.02, 1.9, [x, CY + 0.11, z], shade(PAL.woodTrim, 0.12));
    acc.small.box(0.6, 0.06, 0.45, [x, CY + 0.14, z - 0.72], PAL.templeRed);
    acc.small.box(0.5, 0.03, 0.16, [x, CY + 0.13, z + 0.8], 0x6a6a72); // hand pads
  }
  shoeRack(acc, 5.4, 102.4);
  shoeRack(acc, 14.6, 102.4);

  // potted plants: along the temple plinth front, inside the gate, on the deck by the parapets
  let seed = 400;
  for (const x of [3.4, 4.2, 15.8, 16.6]) acc.box(pottedPlant(acc.small, x, CY, 104.75, seed++, 'marigold'));
  for (const x of [5.6, 12.4]) acc.box(pottedPlant(acc.small, x, CY, 93.6, seed++, 'marigold', 'planter'));
  for (const [x, z] of [[-12.9, 106.2], [-12.9, 108.6], [-12.9, 113.4], [28.9, 96.2], [28.9, 125.5], [6.6, 130.4], [9.2, 130.4], [14.8, 130.4], [16.4, 130.4]] as const) {
    acc.box(pottedPlant(acc.small, x, CY, z, seed++));
  }
  for (const x of [1.5, 3.5, 16.5, 18.5]) acc.box(pottedPlant(acc.small, x, CY, 124.0, seed++, 'geranium'));

  // benches: facing the debate yard, and on the south-west plaza
  acc.box(bench(acc.small, -1.8, CY, 104.0, Math.PI * 0.85, PAL.templeWhite));
  acc.box(bench(acc.small, 1.0, CY, 94.0, 0, PAL.templeWhite));
  acc.box(bench(acc.small, -8.7, CY, 117.0, Math.PI / 2, PAL.woodTrim));
  acc.box(bench(acc.small, -8.7, CY, 122.0, Math.PI / 2, PAL.woodTrim));

  // lamp posts in the court
  for (const [x, z, yaw] of [[0.3, 95.6, Math.PI * 0.75], [18.6, 104.2, -Math.PI / 2], [-8.4, 113.4, Math.PI / 2], [12.4, 126.6, Math.PI], [GALLERY.xBack - 0.8, 124.2, 0]] as const) {
    const L = streetLamp(acc.small, x, CY, z, yaw, 'old');
    acc.lamps.push(L.lamp);
    acc.box(L.collider);
  }
}

function treePlatform(acc: Acc) {
  const [tx, tz] = DEBATE.tree;
  const S = acc.small;
  const R = 2.1, H = 0.46;
  // octagonal stone platform: rotated boxes, whitewashed rim with a maroon band
  for (let i = 0; i < 4; i++) {
    S.group([tx, CY, tz], (i * Math.PI) / 4, () => {
      S.box(R * 2 * 0.83, H, R * 2 * 0.83, [0, H / 2, 0], i % 2 ? PAL.stoneStep : shade(PAL.stoneStep, 0.05));
    });
  }
  S.group([tx, CY, tz], Math.PI / 8, () => {
    S.box(R * 2 * 0.85, 0.08, R * 2 * 0.85, [0, H + 0.04, 0], WHITEWASH);
    S.box(R * 2 * 0.86, 0.06, R * 2 * 0.86, [0, H - 0.08, 0], PAL.templeMaroon);
  });
  // trunk: a fat gnarled bole that splits into branches (canopy is Tree.tsx). It goes in the occluding bucket
  // with the khatas wrapped round it, so it dissolves like the canopy when it hides the boy or fills the
  // chase camera's lens
  const T = acc.big;
  const bark = PAL.bark, barkL = PAL.barkLight;
  T.cyl(0.55, 0.75, 1.6, [tx, CY + H, tz], bark, 8);
  T.cyl(0.62, 0.62, 0.5, [tx + 0.1, CY + H + 0.3, tz - 0.1], barkL, 7);
  const branches: [number, number, number, number][] = [[0.6, 0.4, 0.5, 3.4], [-0.7, 0.2, -0.45, 3.0], [0.1, -0.7, 0.55, 3.2], [-0.2, 0.75, -0.5, 2.8]];
  for (const [dx, dz, lean, len] of branches) {
    const yaw = Math.atan2(dx, dz);
    T.groupEuler([tx + dx * 0.4, CY + H + 1.4, tz + dz * 0.4], [0, yaw, 0], () => {
      T.groupEuler([0, 0, 0], [Math.abs(lean), 0, 0], () => T.cyl(0.18, 0.32, len, [0, 0, 0], bark, 6));
    });
  }
  // roots spreading over the platform (cut with the trunk, so no bare spokes are left when it dissolves)
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3;
    T.groupEuler([tx + Math.sin(a) * 0.7, CY + H + 0.05, tz + Math.cos(a) * 0.7], [0, a, 0], () => T.box(0.22, 0.14, 0.9, [0, 0, 0.2], barkL));
  }
  // khatas tied round the trunk, and a few hanging from the low branches
  T.cyl(0.78, 0.8, 0.12, [tx, CY + H + 1.0, tz], 0xf4f1e8, 10);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    T.groupEuler([tx + Math.sin(a) * 0.8, CY + H + 0.7, tz + Math.cos(a) * 0.8], [0.15, a, 0.1], () => T.box(0.14, 0.6, 0.02, [0, 0, 0], i % 3 ? 0xf4f1e8 : 0xe9e2c8));
  }
  for (const [dx, dz] of [[1.6, 1.0], [-1.7, 0.4], [0.4, -1.8]]) T.box(0.12, 0.7, 0.02, [tx + dx, CY + H + 2.4, tz + dz], 0xf4f1e8);
  // small offerings on the platform: butter-lamp cups, a water bowl row, incense sticks
  const F = acc.fine;
  for (let i = 0; i < 5; i++) {
    F.cyl(0.05, 0.04, 0.05, [tx - 0.5 + i * 0.25, CY + H + 0.08, tz + 1.3], PAL.khorloCopper, 6);
  }
  F.box(0.02, 0.3, 0.02, [tx + 0.9, CY + H + 0.23, tz + 1.0], 0x8a2a20);
  F.box(0.02, 0.28, 0.02, [tx + 0.95, CY + H + 0.22, tz + 1.05], 0x8a2a20);
  acc.circles.push({ x: tx, z: tz, r: R * 0.92, y0: CY - 0.3, y1: CY + H });
  acc.circles.push({ x: tx, z: tz, r: 0.75, y0: CY + H, y1: CY + H + 3.2 });
}

function debatePlatform(acc: Acc) {
  const S = acc.small;
  const x0 = -0.6, x1 = 4.4, z0 = 100.8, z1 = 102.6, h = 0.22;
  S.box(x1 - x0, h, z1 - z0, [(x0 + x1) / 2, CY + h / 2, (z0 + z1) / 2], shade(PAL.stoneStep, -0.04));
  S.box(x1 - x0 + 0.06, 0.04, z1 - z0 + 0.06, [(x0 + x1) / 2, CY + h, (z0 + z1) / 2], shade(PAL.stoneStep, 0.12));
  // cushions only where the three defenders sit (src/characters/npcs/cast.ts: x = 0, 1.9, 3.8, z = 102),
  // plus a spare pair stacked at the back between two seats
  for (const x of [0, 1.9, 3.8]) S.box(0.55, 0.1, 0.55, [x, CY + h + 0.07, 102.0], PAL.monkMaroonDark);
  S.box(0.5, 0.08, 0.34, [2.85, CY + h + 0.06, 102.36], PAL.monkMaroon);
  S.box(0.46, 0.08, 0.3, [2.87, CY + h + 0.14, 102.37], PAL.monkMaroonDark);
  acc.box({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y0: CY - 0.2, y1: CY + h, tag: 'platform' });
}

function sangKhang(acc: Acc, x: number, z: number) {
  const B = acc.small;
  B.group([x, CY, z], 0, () => {
    B.box(1.5, 0.3, 1.5, [0, 0.15, 0], PAL.stoneStep);
    B.taper(1.2, 1.2, 0.95, 0.95, 1.25, [0, 0.3, 0], WHITEWASH);
    B.box(1.24, 0.1, 1.24, [0, 0.5, 0], PAL.templeMaroon);
    // fire opening (north) with embers
    B.box(0.46, 0.42, 0.06, [0, 0.82, -0.53], INK);
    B.box(0.34, 0.12, 0.06, [0, 0.68, -0.55], 0xd2522a, { emit: 0xff6a20, emitIntensity: 1.2 });
    B.box(0.6, 0.08, 0.1, [0, 1.06, -0.54], PAL.templeMaroon);
    // stepped top + chimney cap with a gold finial, soot round the vent
    B.taper(1.0, 1.0, 0.6, 0.6, 0.35, [0, 1.55, 0], WHITEWASH);
    B.box(0.62, 0.08, 0.62, [0, 1.9, 0], PAL.templeMaroon);
    B.cyl(0.18, 0.22, 0.3, [0, 1.98, 0], 0x4a4440, 8);
    B.box(0.5, 0.06, 0.5, [0, 2.32, 0], 0x3a3634);
    for (const [px, pz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) B.box(0.04, 0.12, 0.04, [px, 2.26, pz], 0x3a3634);
    B.cyl(0.04, 0.06, 0.1, [0, 2.35, 0], PAL.gold, 6);
    // juniper bundle on the ledge
    B.box(0.3, 0.1, 0.16, [0.3, 1.11, -0.5], PAL.deodarLight);
  });
  acc.box({ x, z, w: 1.5, d: 1.5, y0: CY - 0.2, y1: CY + 2.3, tag: 'burner' });
  acc.smoke.push({ x, y: CY + 2.38, z, n: 12, spread: 0.2, rise: 3.2, size: 0.22 });
  acc.lamps.push({ x, y: CY + 0.8, z: z - 0.9, color: 0xff7a30, intensity: 2.2, distance: 4, day: false, flicker: 0.5 });
}

function bigChorten(acc: Acc, x: number, z: number) {
  const S = acc.big;
  // stepped plinth first, then a big whitewashed chorten on top
  S.box(3.4, 0.35, 3.4, [x, CY + 0.175, z], PAL.stoneStep);
  S.box(3.0, 0.3, 3.0, [x, CY + 0.5, z], shade(PAL.stoneStep, 0.08));
  chorten(S, [x, CY + 0.65, z], 3.6, Math.PI / 2);
  // small lamp niche facing east with a flame glow
  S.box(0.3, 0.3, 0.06, [x + 1.03, CY + 1.55, z], 0x2a2220, { emit: PAL.butterFlame, emitNight: true, emitIntensity: 0.8 });
  acc.box({ x, z, w: 3.4, d: 3.4, y0: CY - 0.3, y1: CY + 0.65, tag: 'chorten' });
  acc.box({ x, z, w: 2.2, d: 2.2, y0: CY + 0.65, y1: CY + 4.2, tag: 'chorten' });
}

/** Shoe rack (pilgrims leave their shoes before the steps): two shelves of little coloured pairs. */
function shoeRack(acc: Acc, x: number, z: number) {
  const S = acc.small, r = acc.r;
  const cols = [PAL.bootBlack, 0x8a3a2a, PAL.chubaNavy, 0xc9c2b2, PAL.bootRed, 0x3d5675, 0x6a5a40];
  S.box(1.2, 0.7, 0.36, [x, CY + 0.35, z], shade(PAL.woodTrim, -0.2));
  for (const y of [0.04, 0.38]) {
    S.box(1.14, 0.03, 0.34, [x, CY + y + 0.015, z], PAL.woodTrim);
    for (let i = 0; i < 4; i++) {
      const c = cols[Math.floor(r() * cols.length)];
      S.box(0.1, 0.07, 0.24, [x - 0.42 + i * 0.28, CY + y + 0.065, z + 0.03], c);
      S.box(0.1, 0.07, 0.24, [x - 0.3 + i * 0.28, CY + y + 0.065, z + 0.03], c);
    }
  }
  S.box(1.24, 0.04, 0.4, [x, CY + 0.72, z], PAL.woodTrim);
  // a couple of pairs left on the ground
  S.box(0.1, 0.06, 0.24, [x + 0.5, CY + 0.03, z + 0.45], cols[Math.floor(r() * cols.length)]);
  S.box(0.1, 0.06, 0.24, [x + 0.64, CY + 0.03, z + 0.5], PAL.bootBlack);
  acc.box({ x, z, w: 1.2, d: 0.36, y0: CY, y1: CY + 0.74, tag: 'rack' });
}
