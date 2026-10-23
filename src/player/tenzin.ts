// Tenzin: a Tibetan boy of about eleven in a maroon chuba with gold brocade trim, right arm out of the robe in
// a white silk shirt, red sash, traditional red boots with a green band, a mala on his left wrist.
import type { CharSpec } from '../characters/rig';
import { PAL } from '../core/palette';

export const TENZIN: CharSpec = {
  outfit: 'chuba',
  height: 1.3,
  child: true,
  skin: PAL.skin,
  cheeks: true,
  hair: PAL.hair,
  hairStyle: 'messy',
  robe: 0x6a2430,
  trim: PAL.sashGold,
  shirt: PAL.blouseWhite,
  sash: PAL.sashRed,
  pants: PAL.chubaBlack,
  shoes: PAL.bootRed,
  shoeBand: PAL.bootGreen,
  wristMala: true,
  seed: 11,
};
