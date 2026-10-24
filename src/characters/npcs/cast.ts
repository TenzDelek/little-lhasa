// The people of McLeod Ganj: who they are, what they wear, where they walk or stand, and what they do there.
// Looks are seeded so the town is the same on every load. ~54 people in all.
import type { Action, CharSpec } from '../rig';
import { PAL, PANGDEN } from '../../core/palette';
import { pick, range, rng } from '../../core/math';
import { SPOTS, NPC_IDS } from '../../world/layout';
import { groundY } from '../../world/terrain';
import { AMALA, VENDORS, SQUARE, TEA_VENDOR } from './places';

export type Mode = 'walk' | 'stand' | 'sit' | 'debateStand' | 'debateSit' | 'pray';

export interface Spot { x: number; z: number; yaw: number }

export interface NpcDef {
  id: string;
  name: string;
  bod?: string;
  label: string;
  /** Archetype: key into lines.TALK / lines.GREET. */
  kind: string;
  spec: CharSpec;
  mode: Mode;
  /** What happens at night: stay out, or go home (hidden). */
  night: 'stay' | 'home';
  // walkers
  route?: string;
  s?: number;
  speed?: number;
  /** Lateral offset (m) to the right of the route (pairs walk side by side). */
  lateral?: number;
  /** Walk with this leader (same pace / pauses), `ds` metres along the route from it. */
  leader?: string;
  ds?: number;
  /** Upper-body action while walking (wheelWalk, mala, stick…). */
  walkAct?: Action | null;
  /** Reach out to spin the wall wheels while walking (Mani Lhakhang). */
  reach?: boolean;
  /** Mean seconds between pauses (0 = never pause). */
  pauseEvery?: number;
  pauseKind?: 'look' | 'photo' | 'chat';
  // standers / sitters
  at?: Spot | (() => Spot);
  seatY?: number;
  /** Idle action loop for standers: 'talk' (vendor patter), 'phone' (photo), 'pray', 'mala'… */
  idleAct?: Action | null;
  /** Standing chat group id: members face the group centre and take turns talking. */
  group?: string;
  /** Debate pair id (stander + sitter). */
  pair?: string;
  /** How likely (0..1) they greet Tenzin with a bubble when he walks close. */
  greet?: number;
  /** Seconds of offset for looping actions (so pairs are not in sync). */
  phase?: number;
}

// ---- looks ---------------------------------------------------------------------------------------------
const SKIN_T = [PAL.skin, PAL.skinLight, PAL.skinDeep, 0xa87050];
const SKIN_IN = [0xa86f4a, 0x9a6440, 0xb88058, 0x8a5838];
const SKIN_W = [0xe8c4a8, 0xdcae90, 0xf0d0b8, 0xc89878, 0x7a5038];
const HAIR_W = [0x6a4a30, 0xc8a060, 0x9a4a2a, 0x3a2a20, 0xd8c090];
const CHUBA_F = [PAL.chubaBlack, PAL.chubaNavy, PAL.chubaBrown, PAL.chubaGrey, 0x3a4a3a, 0x4a2f48];
const BLOUSE = [PAL.blousePink, PAL.blouseSky, PAL.blouseYellow, PAL.blouseWhite, PAL.blouseLilac];
const CHUBA_M = [PAL.chubaMaroon, PAL.chubaBrown, PAL.chubaGrey, PAL.chubaNavy, 0x4a3a30];
const JACKET = [PAL.fleece, 0x2f4a6a, 0x3f5a3a, 0x2a2a30, 0x8a6a3a, 0x6a2f3a, 0x4a4f58];
const BEANIE = [0x8a2f3a, 0x2f4a6a, 0xd9a23a, 0x3a3a3a, 0x2f8a4a];
const TEE = [0x6f8f6a, 0xd8d0b8, 0x4a6a8a, 0xc85a3a, 0xe8e0d0, 0x8a5a8a, 0x3a3a40];
const KURTA_F = [0xd04a6a, 0x3a8a8a, 0xe0a030, 0x7a4ab0, 0xc85030];
const PACK = [0x3d5f86, 0xa33a2f, 0x3f7a4c, 0xd98a2a, 0x4a4a52];

type R = ReturnType<typeof rng>;

function tibetanWoman(r: R, o: Partial<CharSpec> = {}): CharSpec {
  return {
    outfit: 'chubaF', female: true, height: range(r, 1.5, 1.62), build: range(r, 0.95, 1.1),
    skin: pick(r, SKIN_T), hair: PAL.hair, hairStyle: pick(r, ['bun', 'braids', 'long'] as const),
    robe: pick(r, CHUBA_F), shirt: pick(r, BLOUSE), apron: pick(r, PANGDEN), seed: Math.floor(r() * 1e6), ...o,
  };
}
function elderWoman(r: R, o: Partial<CharSpec> = {}): CharSpec {
  return tibetanWoman(r, { height: range(r, 1.44, 1.54), build: range(r, 1.0, 1.15), hair: PAL.hairGrey, hairStyle: 'bun', robe: pick(r, [PAL.chubaBlack, PAL.chubaGrey, PAL.chubaBrown, 0x2a2628]), ...o });
}
function elderMan(r: R, o: Partial<CharSpec> = {}): CharSpec {
  return {
    outfit: 'chuba', height: range(r, 1.55, 1.66), build: range(r, 0.95, 1.08), skin: pick(r, SKIN_T),
    hair: PAL.hairGrey, hairStyle: 'short', robe: pick(r, CHUBA_M), shirt: pick(r, [PAL.blouseWhite, PAL.blouseYellow, 0xd8d0c0]),
    hat: r() < 0.5 ? 'fur' : r() < 0.5 ? 'cap' : null, hatColor: pick(r, [PAL.sashGold, 0x5c5a60, 0x3a3634]), seed: Math.floor(r() * 1e6), ...o,
  };
}
function monk(r: R, o: Partial<CharSpec> = {}): CharSpec {
  return { outfit: 'monk', height: range(r, 1.62, 1.78), build: range(r, 0.92, 1.12), skin: pick(r, SKIN_T), hair: PAL.hair, glasses: r() < 0.25, seed: Math.floor(r() * 1e6), ...o };
}
function nun(r: R, o: Partial<CharSpec> = {}): CharSpec {
  return { outfit: 'nun', female: true, height: range(r, 1.5, 1.62), build: range(r, 0.92, 1.05), skin: pick(r, SKIN_T), hair: PAL.hair, seed: Math.floor(r() * 1e6), ...o };
}
function youth(r: R, female: boolean, o: Partial<CharSpec> = {}): CharSpec {
  return {
    outfit: 'jacket', female, height: female ? range(r, 1.54, 1.64) : range(r, 1.64, 1.76), skin: pick(r, SKIN_T), hair: PAL.hair,
    hairStyle: female ? pick(r, ['long', 'bob'] as const) : pick(r, ['short', 'messy'] as const),
    robe: pick(r, JACKET), pants: pick(r, [PAL.denim, 0x2a2a30, 0x3a4658]), hat: r() < 0.6 ? 'beanie' : null, hatColor: pick(r, BEANIE),
    seed: Math.floor(r() * 1e6), ...o,
  };
}
function indian(r: R, female: boolean, o: Partial<CharSpec> = {}): CharSpec {
  const kurta = female ? r() < 0.75 : r() < 0.35;
  return kurta
    ? { outfit: 'kurta', female, height: female ? range(r, 1.52, 1.62) : range(r, 1.64, 1.78), skin: pick(r, SKIN_IN), hair: PAL.hair,
        hairStyle: female ? 'long' : 'short', robe: female ? pick(r, KURTA_F) : pick(r, [0xe8e0cc, 0xd8c8a0, 0xa8b8c8]),
        pants: female ? 0xeeeae0 : pick(r, [0xeeeae0, PAL.denim]), trim: pick(r, [PAL.blouseLilac, 0xe0b040, 0xd85a7a]), seed: Math.floor(r() * 1e6), ...o }
    : { outfit: 'western', female, longSleeves: true, height: female ? range(r, 1.52, 1.62) : range(r, 1.64, 1.78), skin: pick(r, SKIN_IN),
        hair: PAL.hair, hairStyle: female ? 'long' : 'short', shirt: pick(r, TEE), pants: pick(r, [PAL.denim, 0x2a2a30, PAL.khaki]),
        robe: r() < 0.4 ? pick(r, JACKET) : undefined, seed: Math.floor(r() * 1e6), ...o };
}
function western(r: R, female: boolean, o: Partial<CharSpec> = {}): CharSpec {
  return {
    outfit: 'western', female, height: female ? range(r, 1.6, 1.72) : range(r, 1.72, 1.88), build: range(r, 0.92, 1.1),
    skin: pick(r, SKIN_W), cheeks: false, hair: pick(r, HAIR_W), hairStyle: female ? pick(r, ['long', 'bob', 'bun'] as const) : pick(r, ['short', 'messy'] as const),
    shirt: pick(r, TEE), pants: pick(r, [PAL.khaki, 0x5a6a4a, PAL.denim]), shorts: r() < 0.6, shoes: pick(r, [0x8a6a4a, 0x5a5a5a, 0xd8d4cc]),
    bag: 'backpack', bagColor: pick(r, PACK), hat: r() < 0.55 ? 'sunhat' : null, hatColor: pick(r, [0xd8c8a0, 0xa89a74, 0x6a7a5a]),
    seed: Math.floor(r() * 1e6), ...o,
  };
}
function schoolkid(r: R, female: boolean, o: Partial<CharSpec> = {}): CharSpec {
  return {
    outfit: 'uniform', female, child: true, height: range(r, 1.12, 1.32), skin: pick(r, SKIN_T), hair: PAL.hair,
    hairStyle: female ? 'braids' : pick(r, ['short', 'messy'] as const), skirt: female, bag: 'backpack', bagColor: pick(r, PACK),
    seed: Math.floor(r() * 1e6), ...o,
  };
}

// ---- the cast ------------------------------------------------------------------------------------------
const r = rng(4242);
const D: NpcDef[] = [];
const add = (d: NpcDef) => { D.push(d); return d; };

// -- quest people and vendors ----------------------------------------------------------------------------
add({
  id: NPC_IDS.amala, name: 'Amala', bod: 'ཨ་མ་ལགས།', label: 'Talk to Amala', kind: 'amala', mode: 'sit', night: 'stay',
  at: () => ({ x: AMALA.x, z: AMALA.z, yaw: AMALA.yaw }), seatY: Math.max(0.3, AMALA.y - groundY(AMALA.x, AMALA.z)),
  spec: {
    outfit: 'chubaF', female: true, height: 1.46, build: 1.08, skin: PAL.skinDeep, hair: PAL.hairGrey, hairStyle: 'bun',
    robe: 0x2b2729, shirt: PAL.blouseWhite, apron: PANGDEN[0], shoes: PAL.bootBlack, shoeBand: PAL.bootRed,
    holdR: 'prayerWheel', holdL: 'mala', seed: 1959,
  },
  greet: 0.9,
});
add({
  id: NPC_IDS.pema, name: 'Pema', bod: 'པདྨ།', label: 'Talk to Pema', kind: 'pema', mode: 'stand', night: 'stay',
  // a step to the north-east of her spot, so Tenzin (spawned on the spot in tests) stands beside her
  at: { x: SPOTS.pemaKid.x + 0.65, z: SPOTS.pemaKid.z - 0.65, yaw: SPOTS.pemaKid.ry },
  spec: {
    outfit: 'jacket', female: true, child: true, height: 1.05, skin: PAL.skinLight, cheeks: true, hair: PAL.hair, hairStyle: 'braids',
    robe: 0xd9768f, pants: PAL.denim, shoes: 0xe8e2d6, shoeBand: 0xd9768f, hat: null, seed: 77,
  },
});
add({
  id: NPC_IDS.tashi, name: 'Tashi', bod: 'བཀྲ་ཤིས།', label: 'Talk to Tashi', kind: 'tashi', mode: 'stand', night: 'stay',
  at: () => VENDORS.tashi, idleAct: 'talk', greet: 0.8,
  spec: { outfit: 'jacket', height: 1.7, build: 1.12, skin: PAL.skin, hair: PAL.hair, hairStyle: 'short', robe: 0x3f5a3a, pants: 0x2a2a30, hat: 'cap', hatColor: 0xa33a2f, seed: 28 },
});
add({
  id: NPC_IDS.dolma, name: 'Dolma', bod: 'སྒྲོལ་མ།', label: 'Talk to Dolma', kind: 'dolma', mode: 'stand', night: 'stay',
  at: () => VENDORS.dolma, idleAct: 'talk', greet: 0.8, phase: 1.3,
  spec: tibetanWoman(r, { height: 1.58, robe: PAL.chubaNavy, shirt: PAL.blouseYellow, hairStyle: 'braids', apron: PANGDEN[1] }),
});
add({
  id: 'pasang', name: 'Pasang', bod: 'པ་སངས།', label: 'Talk to Pasang', kind: 'balep', mode: 'stand', night: 'stay',
  at: () => VENDORS.balep, idleAct: 'talk', greet: 0.7, phase: 2.6,
  spec: elderMan(r, { height: 1.64, hair: 0x4a4440, robe: PAL.chubaBrown, hat: 'cap', hatColor: 0x5c5a60 }),
});

// -- monks and nuns on Temple Road (pairs, keep left) ----------------------------------------------------
const monkPair = (a: string, ab: string, b: string, bb: string, s: number, nuns = false) => {
  const make = nuns ? nun : monk;
  const lead = add({
    id: `m-${a.toLowerCase()}`, name: nuns ? `Ani ${a}` : a, bod: ab, label: nuns ? `Talk to Ani ${a}` : `Talk to ${a}`, kind: nuns ? 'nun' : 'monk',
    mode: 'walk', night: 'stay', route: 'monks', s, speed: range(r, 0.95, 1.12), lateral: -0.32, walkAct: 'mala',
    spec: make(r, { holdL: 'mala' }), pauseEvery: 45, pauseKind: 'chat', greet: 0.6,
  });
  add({
    id: `m-${b.toLowerCase()}`, name: nuns ? `Ani ${b}` : b, bod: bb, label: nuns ? `Talk to Ani ${b}` : `Talk to ${b}`, kind: nuns ? 'nun' : 'monk',
    mode: 'walk', night: nuns ? 'home' : 'stay', leader: lead.id, ds: 0.15, lateral: 0.32, spec: make(r), greet: 0.5,
  });
};
monkPair('Lobsang', 'བློ་བཟང་།', 'Thupten', 'ཐུབ་བསྟན།', 12);
monkPair('Jampa', 'བྱམས་པ།', 'Ngawang', 'ངག་དབང་།', 110);
monkPair('Choedon', 'ཆོས་སྒྲོན།', 'Tsering', 'ཚེ་རིང་།', 170, true);

// -- Tsuglagkhang courtyard ------------------------------------------------------------------------------
add({
  id: 'gen-tsewang', name: 'Gen Tsewang', bod: 'རྒན་ཚེ་དབང་།', label: 'Talk to Gen Tsewang', kind: 'monk', mode: 'walk', night: 'stay',
  route: 'court', s: 6, speed: 0.72, walkAct: 'mala', spec: monk(r, { height: 1.64, glasses: true, holdL: 'mala', hair: PAL.hairGrey }), greet: 0.6,
});
add({
  id: 'mola-yangchen', name: 'Mo-la Yangchen', bod: 'མོ་ལགས།', label: 'Talk to Mo-la', kind: 'elderF', mode: 'walk', night: 'home',
  route: 'court', s: 30, speed: 0.62, walkAct: 'wheelWalk', spec: elderWoman(r, { holdR: 'prayerWheel', holdL: 'mala' }), greet: 0.6,
});
add({
  id: 'pola-norbu', name: 'Po-la Norbu', bod: 'པོ་ལགས།', label: 'Talk to Po-la', kind: 'elderM', mode: 'walk', night: 'stay',
  route: 'court', s: 55, speed: 0.66, walkAct: 'wheelWalk', spec: elderMan(r, { holdR: 'prayerWheel', hat: 'fur' }), greet: 0.6,
});
add({
  id: 'c-kunga', name: 'Kunga', bod: 'ཀུན་དགའ།', label: 'Talk to Kunga', kind: 'monk', mode: 'stand', night: 'home',
  at: { x: 12.7, z: 96.4, yaw: Math.PI / 2 }, group: 'court', spec: monk(r), greet: 0.4,
});
add({
  id: 'c-sonam', name: 'Sonam', bod: 'བསོད་ནམས།', label: 'Talk to Sonam', kind: 'monk', mode: 'stand', night: 'home',
  at: { x: 13.8, z: 96.1, yaw: -Math.PI / 2 }, group: 'court', spec: monk(r, { holdL: 'mala' }), greet: 0.4,
});
add({
  id: 'c-lhamo', name: 'Lhamo', bod: 'ལྷ་མོ།', label: 'Talk to Lhamo', kind: 'womanShop', mode: 'pray', night: 'home',
  at: { x: 10.2, z: 102.55, yaw: 0 }, spec: tibetanWoman(r, { holdL: 'mala' }),
});

// -- debate: standing questioner claps toward a seated defender --------------------------------------------
const debate = (k: number, sx: number, sz: number, a: number, nightStay: boolean, gap = 1.15) => {
  const sitter: Spot = { x: sx, z: sz, yaw: a };
  const stander: Spot = { x: sx + Math.sin(a) * gap, z: sz + Math.cos(a) * gap, yaw: a + Math.PI };
  const names = [['Dawa', 'ཟླ་བ།'], ['Nyima', 'ཉི་མ།'], ['Karma', 'ཀརྨ།'], ['Tenpa', 'བསྟན་པ།'], ['Gyatso', 'རྒྱ་མཚོ།'], ['Phuntsok', 'ཕུན་ཚོགས།']];
  const [n1, b1] = names[k * 2], [n2, b2] = names[k * 2 + 1];
  add({ id: `d-${n1.toLowerCase()}`, name: n1, bod: b1, label: `Talk to ${n1}`, kind: 'debater', mode: 'debateStand', night: nightStay ? 'stay' : 'home',
    at: stander, pair: `d${k}`, spec: monk(r, { height: range(r, 1.62, 1.74) }), greet: 0.7, phase: k * 0.55 });
  add({ id: `d-${n2.toLowerCase()}`, name: n2, bod: b2, label: `Talk to ${n2}`, kind: 'debater', mode: 'debateSit', night: nightStay ? 'stay' : 'home',
    at: sitter, pair: `d${k}`, seatY: 0.13, spec: monk(r, { holdL: r() < 0.5 ? 'mala' : null }), greet: 0.3, phase: k * 0.55 });
};
// Defenders sit in a row on the temple's debate platform (cushions at x = 0, 0.95 … 3.8, z = 102), facing
// north; each questioner stands in front of his defender and claps down toward him.
debate(0, 0.0, 102.0, Math.PI - 0.12, true, 1.45);
debate(1, 1.9, 102.0, Math.PI + 0.1, false, 1.45);
debate(2, 3.8, 102.0, Math.PI - 0.05, false, 1.45);

// -- the Lingkhor: elders walking clockwise with hand prayer wheels -------------------------------------------
const koraElder = (id: string, name: string, female: boolean, s: number, o: Partial<NpcDef> = {}) => add({
  id, name, bod: female ? 'མོ་ལགས།' : 'པོ་ལགས།', label: `Talk to ${name.split(' ')[0]}`, kind: female ? 'elderF' : 'elderM',
  mode: 'walk', night: 'home', route: 'kora', s, speed: range(r, 0.58, 0.8), lateral: range(r, -0.35, 0.35), walkAct: 'wheelWalk',
  spec: female ? elderWoman(r, { holdR: 'prayerWheel', holdL: r() < 0.6 ? 'mala' : null }) : elderMan(r, { holdR: 'prayerWheel' }),
  greet: 0.5, pauseEvery: 70, pauseKind: 'look', ...o,
});
koraElder('k-dolkar', 'Mo-la Dolkar', true, 19, { night: 'stay' });
koraElder('k-phurbu', 'Po-la Phurbu', false, 24.5);
koraElder('k-yeshi', 'Mo-la Yeshi', true, 25.6, { leader: 'k-phurbu', ds: 0.1, lateral: 0.45 });
koraElder('k-tsamchoe', 'Mo-la Tsamchoe', true, 34, { night: 'stay' });
koraElder('k-wangdu', 'Po-la Wangdu', false, 72, { walkAct: 'stick', spec: elderMan(r, { holdR: 'stick', holdL: 'mala', hat: 'fur' }) });
koraElder('k-pema', 'Mo-la Pema', true, 104);
koraElder('k-dhondup', 'Po-la Dhondup', false, 138, { night: 'stay' });
koraElder('k-kalsang', 'Mo-la Kalsang', true, 139.1, { leader: 'k-dhondup', ds: 0.1, lateral: 0.45 });

// -- round the Mani Lhakhang (clockwise, right hand turning the wall wheels) -------------------------------
const maniWalker = (id: string, name: string, female: boolean, s: number, night: 'stay' | 'home') => add({
  id, name, bod: female ? 'མོ་ལགས།' : 'པོ་ལགས།', label: `Talk to ${name.split(' ')[0]}`, kind: female ? 'elderF' : 'elderM',
  mode: 'walk', night, route: 'mani', s, speed: range(r, 0.55, 0.7), reach: true,
  spec: female ? elderWoman(r, { holdL: 'mala' }) : elderMan(r, { holdL: 'mala' }), greet: 0.5,
});
maniWalker('mani-sangmo', 'Mo-la Sangmo', true, 0, 'stay');
maniWalker('mani-gyaltsen', 'Po-la Gyaltsen', false, 8.5, 'home');
maniWalker('mani-lhakpa', 'Mo-la Lhakpa', true, 16.5, 'home');

// -- townsfolk on the town loop (Temple Road ↔ square ↔ Jogiwara Road) -------------------------------------
add({ id: 't-yangzom', name: 'Yangzom', bod: 'དབྱངས་འཛོམས།', label: 'Talk to Yangzom', kind: 'womanShop', mode: 'walk', night: 'home',
  route: 'town', s: 8, speed: 1.0, lateral: -0.3, spec: tibetanWoman(r, { holdR: 'bag' }), pauseEvery: 30, pauseKind: 'look', greet: 0.6 });
add({ id: 't-dekyi', name: 'Dekyi', bod: 'བདེ་སྐྱིད།', label: 'Talk to Dekyi', kind: 'womanShop', mode: 'walk', night: 'home',
  // Yangzom's younger sister, not married: a chuba without the pangden apron
  leader: 't-yangzom', ds: 0.1, lateral: 0.3, spec: tibetanWoman(r, { bag: 'shoulder', bagColor: PAL.khaki, apron: null, height: 1.6 }), greet: 0.4 });
add({ id: 't-tenzin', name: 'Tenzin', bod: 'བསྟན་འཛིན།', label: 'Talk to the other Tenzin', kind: 'youth', mode: 'walk', night: 'home',
  route: 'town', s: 70, speed: 1.35, spec: youth(r, false), pauseEvery: 50, pauseKind: 'look', greet: 0.6 });
add({ id: 't-kunsang', name: 'Kunsang', bod: 'ཀུན་བཟང་།', label: 'Talk to Kunsang', kind: 'youth', mode: 'walk', night: 'stay',
  route: 'town', s: 150, speed: 1.2, spec: youth(r, true, { holdR: 'phone' }), walkAct: 'phone', pauseEvery: 40, pauseKind: 'look', greet: 0.6 });
add({ id: 't-rahul', name: 'Rahul', label: 'Talk to the tourist', kind: 'touristIn', mode: 'walk', night: 'home',
  route: 'town', s: 205, speed: 1.05, lateral: -0.3, spec: indian(r, false), pauseEvery: 35, pauseKind: 'photo', greet: 0.7 });
add({ id: 't-priya', name: 'Priya', label: 'Talk to the tourist', kind: 'touristIn', mode: 'walk', night: 'home',
  leader: 't-rahul', ds: 0.1, lateral: 0.3, spec: indian(r, true, { holdR: 'phone' }), greet: 0.6 });
add({ id: 't-anna', name: 'Anna', label: 'Talk to the backpacker', kind: 'touristW', mode: 'walk', night: 'home',
  route: 'town', s: 262, speed: 1.15, spec: western(r, true), pauseEvery: 30, pauseKind: 'photo', greet: 0.7 });

// -- Market Lane -------------------------------------------------------------------------------------------
add({ id: 'l-choezom', name: 'Choezom', bod: 'ཆོས་འཛོམས།', label: 'Talk to Choezom', kind: 'womanShop', mode: 'walk', night: 'home',
  route: 'market', s: 4, speed: 0.95, spec: tibetanWoman(r, { holdR: 'bag' }), pauseEvery: 20, pauseKind: 'look', greet: 0.6 });
add({ id: 'l-lukas', name: 'Lukas', label: 'Talk to the backpacker', kind: 'touristW', mode: 'walk', night: 'home',
  route: 'market', s: 32, speed: 1.0, spec: western(r, false), pauseEvery: 22, pauseKind: 'photo', greet: 0.7 });

// -- Bhagsu Road (toward the waterfall) ---------------------------------------------------------------------
add({ id: 'b-mia', name: 'Mia', label: 'Talk to the backpacker', kind: 'touristW', mode: 'walk', night: 'home',
  route: 'bhagsu', s: 6, speed: 1.15, lateral: -0.3, spec: western(r, true, { hat: 'sunhat' }), pauseEvery: 40, pauseKind: 'photo', greet: 0.7 });
add({ id: 'b-tom', name: 'Tom', label: 'Talk to the backpacker', kind: 'touristW', mode: 'walk', night: 'home',
  leader: 'b-mia', ds: 0.1, lateral: 0.3, spec: western(r, false), greet: 0.6 });

// -- Dharamkot Road: kids walking home from school -----------------------------------------------------------
add({ id: 'k-dawa', name: 'Dawa', bod: 'ཟླ་བ།', label: 'Talk to Dawa', kind: 'kid', mode: 'walk', night: 'home',
  route: 'dharamkot', s: 20, speed: 1.15, lateral: 0, spec: schoolkid(r, false), pauseEvery: 45, pauseKind: 'chat', greet: 0.8 });
add({ id: 'k-norzin', name: 'Norzin', bod: 'ནོར་འཛིན།', label: 'Talk to Norzin', kind: 'kid', mode: 'walk', night: 'home',
  leader: 'k-dawa', ds: -0.75, lateral: -0.42, spec: schoolkid(r, true), greet: 0.6 });
add({ id: 'k-tashi', name: 'Little Tashi', bod: 'བཀྲ་ཤིས།', label: 'Talk to little Tashi', kind: 'kid', mode: 'walk', night: 'home',
  leader: 'k-dawa', ds: -0.7, lateral: 0.42, spec: schoolkid(r, false, { height: 1.12 }), greet: 0.6 });

// -- standing about ---------------------------------------------------------------------------------------
if (TEA_VENDOR) add({
  id: 'tea-kamla', name: 'Kamla Auntie', label: 'Talk to Kamla Auntie', kind: 'teaAuntie', mode: 'stand', night: 'stay',
  at: TEA_VENDOR, idleAct: 'give', greet: 0.8, phase: 0.7,
  spec: indian(r, true, { outfit: 'kurta', robe: 0x7a4a6a, trim: 0xd8a040, pants: 0x3a3634, height: 1.52, build: 1.12, hair: 0x2a2220, hairStyle: 'bun' }),
});
const C = SQUARE.chai;
add({ id: 'chai-ramesh', name: 'Ramesh', label: 'Talk to the chai-wallah', kind: 'chai', mode: 'stand', night: 'stay',
  // beside his stall on the stove side (the counter and back table fill the stall itself)
  at: () => ({ x: C.x - 1.32, z: C.z + 0.15, yaw: (C.yaw ?? 0) + 0.55 }), idleAct: 'give', greet: 0.8,
  spec: indian(r, false, { outfit: 'western', longSleeves: true, robe: 0x5a4a3a, shirt: 0xd8d0c0, pants: 0x3a3634, hat: null }) });
add({ id: 'taxi-vijay', name: 'Vijay', label: 'Talk to the taxi driver', kind: 'taxi', mode: 'stand', night: 'home',
  at: { x: 6.5, z: 0.5, yaw: 1.9 }, group: 'taxi', greet: 0.8,
  spec: indian(r, false, { outfit: 'jacket', robe: 0x2a2a30, pants: 0x3a3634, hat: 'cap', hatColor: 0x6a2630 }) });
add({ id: 'taxi-sanjay', name: 'Sanjay', label: 'Talk to the taxi driver', kind: 'taxi', mode: 'stand', night: 'home',
  at: { x: 7.6, z: 0.1, yaw: -1.2 }, group: 'taxi', greet: 0.6,
  spec: indian(r, false, { outfit: 'western', longSleeves: true, shirt: 0x8fb4cf, pants: 0x2a2a30 }) });
add({ id: 'sq-meera', name: 'Meera', label: 'Talk to the tourist', kind: 'touristIn', mode: 'stand', night: 'home',
  at: () => ({ x: SQUARE.mani.x + 6.3, z: SQUARE.mani.z + 2.3, yaw: Math.atan2(-6.3, -2.3) }), idleAct: 'phone', greet: 0.7,
  spec: indian(r, true, { holdR: 'phone' }) });

// -- shopkeepers in their doorways (placed against the real building fronts at run time) -----------------------
add({ id: 's-namgyal', name: 'Namgyal', bod: 'རྣམ་རྒྱལ།', label: 'Talk to Namgyal', kind: 'shopkeeper', mode: 'stand', night: 'home',
  at: { x: 0, z: 0, yaw: 0 }, greet: 0.8, spec: elderMan(r, { hair: 0x3a3634, hat: null, robe: PAL.chubaNavy, height: 1.68 }) });
add({ id: 's-farooq', name: 'Farooq', label: 'Talk to the shopkeeper', kind: 'kashmiri', mode: 'stand', night: 'home',
  at: { x: 0, z: 0, yaw: 0 }, greet: 0.8, spec: indian(r, false, { outfit: 'kurta', robe: 0xd8d0c0, pants: 0xd8d0c0, skin: 0xc89070, hat: 'cap', hatColor: 0xeeeae0 }) });

/** Shopkeeper doorways: road, arc length and side (+1 right of the road's direction, −1 left). */
export const SHOPFRONTS: Record<string, { road: string; s: number; side: 1 | -1 }> = {
  's-namgyal': { road: 'temple-road', s: 36, side: 1 },
  's-farooq': { road: 'jogiwara-road', s: 52, side: 1 },
};

export const CAST: readonly NpcDef[] = D;
