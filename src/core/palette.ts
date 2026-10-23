// The town's palette (sRGB hex). Use these instead of ad-hoc colours so every module reads as one picture.
// Costume and nature colours follow Gorshey's PAL so the two scenes feel like siblings.

export const PAL = {
  // nature
  grassDeep: 0x3f5f1f, grass: 0x5f8a2a, grassLight: 0x93b33e, grassDry: 0xb7a95a,
  moss: 0x4f6a2c, needle: 0x5a4a32, needleDark: 0x3b3122,
  deodar: 0x2f4a2e, deodarLight: 0x4a6b3c, deodarDark: 0x1f3322, bark: 0x4a3326, barkLight: 0x6b4a33,
  rhodo: 0xc23a3a, // rhododendron blossom
  earth: 0x8a6a46, earthDark: 0x5e4630, mud: 0x6e5a40,
  rock: 0x8e8a80, rockDark: 0x5f5b55, slate: 0x55606a, slateLight: 0x7c8790,
  snow: 0xf4f6fa, snowShade: 0xb9c6dc, mountain: 0x6f7c8c, mountainDark: 0x4a5566,
  water: 0x4f86a8, waterLight: 0xa9d2e4,

  // street
  asphalt: 0x4a4a4c, asphaltLight: 0x626264, asphaltWorn: 0x6f6a62,
  paving: 0x9a958a, pavingDark: 0x7c776d, curb: 0xb8b2a6, drain: 0x3a3836,
  stoneStep: 0x8c8678, concrete: 0xa7a197, concreteDark: 0x7e786f, concreteStain: 0x6b665c,
  railing: 0x2f5f8a, railingYellow: 0xd9b23a,

  // McLeod Ganj walls: pastel and faded paints on concrete
  wallCream: 0xe9dfc4, wallWhite: 0xeeeae0, wallYellow: 0xe8c66a, wallOchre: 0xd09a48,
  wallPink: 0xe0a3a0, wallSalmon: 0xd9826a, wallBlue: 0x8fb4cf, wallSky: 0xb3d1e0,
  wallMint: 0xa8cfb4, wallGreen: 0x7fa77f, wallLilac: 0xb7a6c9, wallMaroon: 0x7a2a2e,
  wallTerracotta: 0xb4603c, wallGrey: 0xb9b5ad,
  // tin roofs (painted corrugated sheet)
  roofGreen: 0x3f7a4c, roofRed: 0xa33a2f, roofBlue: 0x355f8f, roofMaroon: 0x6a2630, roofRust: 0x8a4a2a, roofGrey: 0x7d8288,
  waterTank: 0x1f1f22, dish: 0xe6e3dc,
  shutter: 0x6f767c, shutterBlue: 0x3d5f86, shutterGreen: 0x3f6f55,
  windowFrame: 0x2f3a46, glass: 0x2b3946, glassDay: 0x5b7286, windowLit: 0xffc970,
  woodDoor: 0x6a3f24, woodTrim: 0x8b5a33,

  // Tibetan architecture
  templeRed: 0x8b1e2d, templeMaroon: 0x6e1f2a, templeYellow: 0xe0b23a, templeOchre: 0xc98a2c,
  gold: 0xd4a640, goldDeep: 0xa87a22, templeWhite: 0xf3efe6, templeBlue: 0x2f63b8,
  templeGreen: 0x2f8a4a, pema: 0x5a2228, // pema-kara (dark red twig) frieze under temple roofs
  khorloBody: 0xb83a2a, khorloGold: 0xd9a23a, khorloCopper: 0xb87333,
  butter: 0xffd27a, butterFlame: 0xffb43a,

  // prayer flags: lungta order blue, white, red, green, yellow
  lungta: [0x2f63b8, 0xf2f2ec, 0xc8322b, 0x2f8a4a, 0xf1c232] as const,

  // people
  skin: 0xb07a55, skinLight: 0xc48a62, skinDeep: 0x8f5e40, cheek: 0xc0584a, hair: 0x1b1716, hairGrey: 0x8a8580,
  chubaBlack: 0x23202a, chubaMaroon: 0x6e1f2a, chubaNavy: 0x213252, chubaBrown: 0x5b3a26, chubaGrey: 0x5c5a60,
  blousePink: 0xe59ab0, blouseSky: 0x9cc6e8, blouseYellow: 0xf0cf62, blouseWhite: 0xf1ede4, blouseLilac: 0xb8a2d8,
  sashRed: 0xb52a2a, sashGold: 0xd9a23a, coral: 0xd2523c, turquoise: 0x2fb2a6,
  monkMaroon: 0x7a1f2b, monkMaroonDark: 0x5a1520, monkYellow: 0xe6a92e,
  bootRed: 0x9c2a22, bootGreen: 0x2f5e4a, bootBlack: 0x1d1a1a,
  denim: 0x3d5675, khaki: 0xa89a74, fleece: 0x8a3a3a,

  // animals
  monkey: 0x8c7356, monkeyFace: 0xc98f7a, dogTan: 0xb58a5a, dogBlack: 0x2a2624, dogWhite: 0xe8e2d6,
  cowWhite: 0xe8e2d6, cowBrown: 0x7a5a3e, crow: 0x1e1e24, pigeon: 0x7f8796,

  // light
  lampWarm: 0xffc070, lampSodium: 0xffa040, lampCool: 0xdfe8ff, stringLight: 0xffd890,
} as const;

/** Pangden apron stripe sets (top to bottom), as in Gorshey. Married / adult women only, never men. */
export const PANGDEN = [
  [0xc8322b, 0x2f63b8, 0xf1c232, 0x2f8a4a, 0xe07a2e, 0x6d3a8f, 0xf2f2ec],
  [0x2f8a4a, 0xc8322b, 0x2fb2a6, 0xf1c232, 0x23202a, 0xe07a2e],
  [0x6d3a8f, 0xf1c232, 0xc8322b, 0x2f63b8, 0x2f8a4a, 0xd2523c],
] as const;

export const WALLS = [
  PAL.wallCream, PAL.wallWhite, PAL.wallYellow, PAL.wallOchre, PAL.wallPink, PAL.wallSalmon,
  PAL.wallBlue, PAL.wallSky, PAL.wallMint, PAL.wallGreen, PAL.wallLilac, PAL.wallGrey,
] as const;
export const ROOFS = [PAL.roofGreen, PAL.roofRed, PAL.roofBlue, PAL.roofMaroon, PAL.roofRust, PAL.roofGrey] as const;
