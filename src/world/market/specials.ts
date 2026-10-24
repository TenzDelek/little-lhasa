// Special fronts: the book shop on Temple Road (racks of books spilling onto a deep forecourt) and the
// thangka shop on Jogiwara Road (painted scrolls hanging on the façade and on a display frame), plus the
// buildings standing behind the three food stalls.
import { PAL } from '../../core/palette';
import { rng } from '../../core/math';
import { SPOTS } from '../layout';
import { G } from '../../game/store';
import { sfx } from '../../audio/sfx';
import { type Ctx, inFrame, wpos } from './ctx';
import { JOG, TEMPLE, localBox, roadDist } from './util';
import { STALLS } from './spots';
import { placeBuilding, type Placed } from './buildings';
import { bookcase, bookTable, cardSpinner, thangka, plant } from './items';

/** Book shop at SPOTS.bookShop (east side of Temple Road). */
export function bookShop(c: Ctx): Placed | null {
  const d0 = roadDist(TEMPLE, SPOTS.bookShop.x, SPOTS.bookShop.z);
  const pl = placeBuilding(c, {
    road: TEMPLE, side: -1, s: d0.s, w: 6.6, kind: 'books', seed: 9101, setback: 2.45, noDress: true,
    floors: 2, roof: 'flat', minDepth: 3.6,
  });
  if (!pl) return null;
  const { f, y, w, d } = pl;
  const r = rng(9102);
  const z0 = d / 2, fd = pl.dress.fd - 0.28;
  inFrame(c, f, y, () => {
    // two tall bookcases against the façade either side of the door, a slanted table, a card spinner
    bookcase(c.props, -w / 2 + 0.75, z0 + 0.22, 1.2, 1.9, 0.38, r);
    bookcase(c.props, w / 2 - 0.75, z0 + 0.22, 1.2, 1.9, 0.38, r);
    bookTable(c.props, -w / 2 + 0.85, z0 + fd - 0.38, 1.3, 0.6, r);
    cardSpinner(c.props, w / 2 - 0.6, z0 + fd - 0.3, r);
    // a small chalk board: NEW ARRIVALS
    c.props.box(0.5, 0.4, 0.03, [w / 2 - 1.5, 1.2, z0 + 0.03], 0x2a3a34);
    for (let k = 0; k < 3; k++) c.props.box(0.36 - k * 0.06, 0.025, 0.01, [w / 2 - 1.5, 1.3 - k * 0.08, z0 + 0.05], 0xe6e3dc);
    plant(c.props, 1.1, 0, z0 + 0.3, r);
    // a reading bench
    c.props.box(1.1, 0.06, 0.34, [0.2, 0.44, z0 + fd - 0.2], PAL.woodTrim);
    for (const sx of [-0.45, 0.45]) c.props.box(0.06, 0.44, 0.3, [0.2 + sx, 0.22, z0 + fd - 0.2], PAL.woodDoor);
  });
  c.colliders.push(
    localBox(f, -w / 2 + 0.75, z0 + 0.22, 1.2, 0.4, y - 0.3, y + 1.9, 'shelf'),
    localBox(f, w / 2 - 0.75, z0 + 0.22, 1.2, 0.4, y - 0.3, y + 1.9, 'shelf'),
    localBox(f, -w / 2 + 0.85, z0 + fd - 0.38, 1.3, 0.62, y - 0.3, y + 0.8, 'table'),
    localBox(f, w / 2 - 0.6, z0 + fd - 0.3, 0.4, 0.4, y - 0.3, y + 1.5, 'rack'),
    localBox(f, 0.2, z0 + fd - 0.2, 1.1, 0.34, y - 0.3, y + 0.47, 'bench'),
  );
  const ip = wpos(f, y, [-0.4, 0.9, z0 + fd + 0.1]);
  c.interact.push({
    id: 'market-books', pos: ip, radius: 2.0, label: 'Browse books',
    onInteract: () => {
      sfx('talk');
      G().say([
        { who: 'Lhakpa', bod: 'དཔེ་ཚོང་ཁང་།', text: 'Tashi delek! Dharma books on the left, Tibetan–English dictionaries in the middle, trekking maps by the door.' },
        { who: 'Lhakpa', text: 'That thin one is the songs of Milarepa. My grandfather knew all of them by heart.' },
      ]);
    },
  });
  return pl;
}

/** Thangka shop at SPOTS.thangkaShop (west side of Jogiwara Road). */
export function thangkaShop(c: Ctx): Placed | null {
  const d0 = roadDist(JOG, SPOTS.thangkaShop.x, SPOTS.thangkaShop.z);
  const pl = placeBuilding(c, {
    road: JOG, side: 1, s: d0.s, w: 6.0, kind: 'thangka', seed: 9201, setback: 1.55, noDress: true,
    floors: 3, minDepth: 3.6, spec: { awning: 0x6a2630, balconies: true },
  });
  if (!pl) return null;
  const { f, y, w, d } = pl;
  const r = rng(9202);
  const z0 = d / 2, fd = pl.dress.fd - 0.28;
  inFrame(c, f, y, () => {
    // scrolls on the façade either side of the door, in two tiers
    for (const sx of [-1, 1]) {
      thangka(c.props, [sx * (w / 2 - 0.55), 1.55, z0 + 0.01], 0.55, 0.85, sx < 0 ? 0 : 1, r);
      thangka(c.props, [sx * (w / 2 - 1.3), 1.45, z0 + 0.01], 0.45, 0.7, sx < 0 ? 2 : 0, r);
    }
    thangka(c.props, [-w / 2 + 0.9, 3.9, z0 + 0.01], 0.6, 0.9, 0, r);
    thangka(c.props, [w / 2 - 0.9, 3.9, z0 + 0.01], 0.6, 0.9, 1, r);
    // free-standing display frame on the forecourt with three more
    const dx = frameX(w), fz = z0 + fd - 0.2;
    for (const sx of [-0.85, 0.85]) c.props.box(0.06, 2.0, 0.06, [dx + sx, 1.0, fz], PAL.woodDoor);
    c.props.box(1.8, 0.06, 0.06, [dx, 2.0, fz], PAL.woodDoor);
    c.props.box(1.76, 0.04, 0.3, [dx, 0.05, fz], PAL.woodDoor);
    for (let i = 0; i < 3; i++) thangka(c.props, [dx - 0.55 + i * 0.55, 1.35, fz + 0.03], 0.4, 0.62, i % 3, r);
    // a painter's easel with a half-painted scroll and a stool
    const ex = w / 2 - 0.9, ez = z0 + fd - 0.25;
    c.props.box(0.05, 1.3, 0.05, [ex - 0.25, 0.65, ez], PAL.woodTrim, { rot: [0.12, 0, 0] });
    c.props.box(0.05, 1.3, 0.05, [ex + 0.25, 0.65, ez], PAL.woodTrim, { rot: [0.12, 0, 0] });
    c.props.box(0.6, 0.04, 0.08, [ex, 0.62, ez + 0.07], PAL.woodTrim);
    c.props.box(0.46, 0.62, 0.02, [ex, 0.97, ez + 0.07], 0xe8dcc0, { rot: [0.12, 0, 0] });
    c.props.box(0.3, 0.2, 0.012, [ex, 1.05, ez + 0.085], 0x3f9a5a, { rot: [0.12, 0, 0] });
    c.props.box(0.12, 0.12, 0.014, [ex, 1.18, ez + 0.07], 0xe0902a, { rot: [0.12, 0, 0] });
  });
  c.colliders.push(
    localBox(f, frameX(w), z0 + fd - 0.2, 1.84, 0.34, y - 0.3, y + 2.05, 'frame'),
    localBox(f, w / 2 - 0.9, z0 + fd - 0.25, 0.7, 0.35, y - 0.3, y + 1.3, 'easel'),
  );
  const ip = wpos(f, y, [0, 1.0, z0 + fd + 0.25]);
  c.interact.push({
    id: 'market-thangka', pos: ip, radius: 2.0, label: 'Look at the thangkas',
    onInteract: () => {
      sfx('talk');
      G().say([
        { who: 'Painter', bod: 'ཐང་ཀ།', text: 'This one is Green Tara — she comes quickly when you call her. It took me four months.' },
        { who: 'Painter', text: 'The colours are ground from stones: lapis for blue, malachite for green, real gold for the halo.' },
      ]);
    },
  });
  return pl;
}
const frameX = (w: number) => -w / 2 + 1.3;

/** Buildings set back behind the three food stalls (the stall stands on their forecourt). */
export function stallBackdrops(c: Ctx) {
  const momo = placeBuilding(c, {
    road: TEMPLE, side: STALLS.momo.side, s: STALLS.momo.s + 0.2, w: 6.4, kind: 'general', seed: 9301, setback: 3.3,
    floors: 2, roof: 'flat', minDepth: 3.2, noDress: true, fd: 0.45, spec: { awning: 0x8a3a36 },
  });
  const balep = placeBuilding(c, {
    road: TEMPLE, side: STALLS.balep.side, s: STALLS.balep.s, w: 5.6, kind: 'bakery', seed: 9302, setback: 2.75,
    floors: 4, minDepth: 3.2, noDress: true, fd: 0.45,
  });
  const laph = placeBuilding(c, {
    road: JOG, side: STALLS.laphing.side, s: STALLS.laphing.s, w: 5.8, kind: 'tailor', seed: 9303, setback: 3.15,
    floors: 2, roof: 'flat', minDepth: 3.0, noDress: true, fd: 0.45,
  });
  return { momo, balep, laph };
}
