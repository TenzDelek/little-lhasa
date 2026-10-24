// Positions owned by other builders, loaded OPTIONALLY (eager glob) so this module compiles and runs whether
// or not they exist yet: the market's VENDOR_SPOTS, the hillside's AMALA_SEAT, the square's plan.
import { SPOTS } from '../../world/layout';
import { groundY } from '../../world/terrain';

type Mod = Record<string, unknown>;
// only the files we read (a glob matches nothing, harmlessly, while a file does not exist yet)
const spots = import.meta.glob(['../../world/market/spots.ts', '../../world/hillside/spots.ts'], { eager: true }) as Record<string, Mod>;
const plans = import.meta.glob('../../world/square/plan.ts', { eager: true }) as Record<string, Mod>;

export interface Spot { x: number; z: number; yaw: number }
export interface Seat extends Spot { y: number }

const isSpot = (v: unknown): v is Spot =>
  !!v && typeof (v as Spot).x === 'number' && typeof (v as Spot).z === 'number';

function from<T>(mods: Record<string, Mod>, file: string, name: string): T | undefined {
  const m = mods[file];
  return m ? (m[name] as T | undefined) : undefined;
}

// ---- vendors -------------------------------------------------------------------------------------------
const VS = from<Record<string, unknown>>(spots, '../../world/market/spots.ts', 'VENDOR_SPOTS');
const vendor = (k: string, fx: number, fz: number, fyaw: number): Spot => {
  const v = VS?.[k];
  return isSpot(v) ? { x: v.x, z: v.z, yaw: typeof v.yaw === 'number' ? v.yaw : fyaw } : { x: fx, z: fz, yaw: fyaw };
};
export const VENDORS = {
  tashi: vendor('tashi', SPOTS.momoStall.x + 0.8, SPOTS.momoStall.z, -Math.PI / 2),
  dolma: vendor('dolma', SPOTS.laphingStall.x - 0.8, SPOTS.laphingStall.z, Math.PI / 2),
  balep: vendor('balep', SPOTS.breadStall.x - 0.8, SPOTS.breadStall.z, Math.PI / 2),
};

// ---- Amala's bench -------------------------------------------------------------------------------------
const AS = from<unknown>(spots, '../../world/hillside/spots.ts', 'AMALA_SEAT');
/** Where Amala sits (the hillside's AMALA_SEAT, or a fallback by her door). */
export const AMALA: Seat = (() => {
  if (isSpot(AS)) {
    const a = AS as Partial<Seat> & Spot;
    const y = typeof a.y === 'number' ? a.y : groundY(a.x, a.z) + 0.45;
    return { x: a.x, z: a.z, y, yaw: typeof a.yaw === 'number' ? a.yaw : -Math.PI / 2 };
  }
  // fallback: a bench just west of her door, between the house and Dharamkot Road, facing the road
  const x = SPOTS.amalaHouse.x - 2.6, z = SPOTS.amalaHouse.z - 1.4;
  return { x, z, y: groundY(x, z) + 0.45, yaw: -Math.PI / 2 };
})();

// ---- the tea shop on Bhagsu Road -------------------------------------------------------------------------
const TV = from<unknown>(spots, '../../world/hillside/spots.ts', 'TEA_VENDOR');
/** Behind the tea-shop counter on Bhagsu Road (null until the hillside module provides it). */
export const TEA_VENDOR: Spot | null = isSpot(TV) ? { x: TV.x, z: TV.z, yaw: typeof TV.yaw === 'number' ? TV.yaw : 0 } : null;

// ---- square plan ---------------------------------------------------------------------------------------
const SQ = '../../world/square/plan.ts';
type Pt = { x: number; z: number; yaw?: number };
export const SQUARE = {
  mani: from<{ x: number; z: number; plinth?: number; core?: number }>(plans, SQ, 'MANI') ?? { x: SPOTS.maniLhakhang.x, z: SPOTS.maniLhakhang.z, plinth: 7.2, core: 4.4 },
  chai: from<Pt>(plans, SQ, 'CHAI') ?? { x: 11.4, z: -9.55, yaw: 0 },
  chorten: from<Pt & { yard?: number }>(plans, SQ, 'CHORTEN') ?? { x: SPOTS.chorten.x, z: SPOTS.chorten.z, yard: 4.8 },
};

/** Debug: which optional sources were found. */
export const SOURCES = {
  vendors: !!VS,
  amalaSeat: isSpot(AS),
  teaVendor: isSpot(TV),
  squarePlan: !!plans[SQ],
};
