// Pixel-art grids for the HUD (12×12 character grids → inline SVG via <PixelIcon/> in bits.tsx).
// Every grid is shown at whole-number scales (24 px in chips) so the pixels stay square.

export type Grid = { rows: readonly string[]; pal: Record<string, string> };

/** Horizontal runs of one colour: one <rect> each. */
export function runs(g: Grid) {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  g.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || !g.pal[ch]) { x++; continue; }
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      out.push({ x, y, w, c: g.pal[ch] });
      x += w;
    }
  });
  return out;
}

// --- the inventory ---------------------------------------------------------------------------------------

/** A steel plate of momos, still steaming. */
export const MOMO: Grid = {
  pal: { s: '#c9d3dc', w: '#f6efe0', W: '#fffaf0', a: '#d8c6a3', A: '#b9a27c', p: '#8fa3b3', P: '#c5d2dc', d: '#6d7f8e' },
  rows: [
    '...s....s...',
    '....s..s....',
    '...s....s...',
    '.....aa.....',
    '....aWWa....',
    '..aaWwwWaa..',
    '.aWWaAAaWWa.',
    'aWwwwaawwwWa',
    'AwwwwwwwwwwA',
    'PAAaaaaaaAAP',
    'pPPPPPPPPPPp',
    '.dppppppppd.',
  ],
};

/** Laphing: cold mung-bean noodle strips in a bowl, red with chilli. */
export const LAPHING: Grid = {
  pal: { y: '#f2dc8c', Y: '#d9bd62', r: '#c8432f', R: '#93261c', b: '#f3f0e8', B: '#3f6fa8', d: '#9ea8b2', g: '#5f8a2a' },
  rows: [
    '............',
    '............',
    '....g.......',
    '..yyrYyyr...',
    '.yYryyYryYy.',
    'yrYyyrYyyrYy',
    'bbbbbbbbbbbb',
    'bBBbBBbBBbBb',
    '.bbbbbbbbbb.',
    '..dbbbbbbd..',
    '...dddddd...',
    '............',
  ],
};

/** Balep korkun: a round pan-fried Tibetan flatbread with browned spots. */
export const BALEP: Grid = {
  pal: { c: '#e2b878', C: '#c99654', b: '#9a6534', l: '#f0d29e', d: '#7d5130' },
  rows: [
    '............',
    '............',
    '....cccc....',
    '..ccllcccc..',
    '.cllcccbccc.',
    '.clcbcccccC.',
    '.ccccccbccC.',
    '.cccbcccccC.',
    '..CcccccCC..',
    '...dCCCCd...',
    '............',
    '............',
  ],
};

/** Pema's puppy: small and brown, one white ear. */
export const PUPPY: Grid = {
  pal: { b: '#9a6534', B: '#6e4426', w: '#f3efe6', W: '#d8d2c4', k: '#23201d', n: '#2a1d16', p: '#e0898a', l: '#c48a52' },
  rows: [
    '............',
    '.ww.....BB..',
    '.wWw...BbB..',
    '.wWbbbbbbB..',
    '..bbbbbbbb..',
    '..bkbbbbkb..',
    '..bbbllbbb..',
    '..bbllnlbb..',
    '...blllllb..',
    '....lppl....',
    '.....pp.....',
    '............',
  ],
};

/** Pema's lucky knot: a red protection cord (srung mdud) tied in a knot. */
export const KNOT: Grid = {
  pal: { r: '#c8322f', R: '#8b1e2d', y: '#e0b23a' },
  rows: [
    '...rrrrrr...',
    '..r......r..',
    '.r........r.',
    '.r........r.',
    '..r......r..',
    '...r....r...',
    '....rRRr....',
    '....RrrR....',
    '....rRRr....',
    '.....yy.....',
    '....r..r....',
    '...R....R...',
  ],
};

/** A rupee coin. */
export const COIN: Grid = {
  pal: { g: '#d4a640', G: '#a87a22', l: '#f0d27a', k: '#7a5416' },
  rows: [
    '............',
    '....gggg....',
    '..glllgggg..',
    '..glkkkkgG..',
    '.glgggkggGG.',
    '.glkkkkggGG.',
    '.gggkkgggGG.',
    '.ggggkkggGG.',
    '..gggkkkGG..',
    '..GGGGGGGG..',
    '....GGGG....',
    '............',
  ],
};

export const SUN: Grid = {
  pal: { y: '#e0a83a', o: '#c98a2c' },
  rows: [
    '.....y......',
    '.y...y...y..',
    '..y.....y...',
    '....yyy.....',
    '...yyyyy....',
    'yy.yyyyy.yy.',
    '...yyyyy....',
    '....yyy.....',
    '..y.....y...',
    '.y...y...y..',
    '.....y......',
    '............',
  ],
};

export const MOON: Grid = {
  pal: { m: '#f3e2b0', M: '#c9b580', s: '#ece6da' },
  rows: [
    '.........s..',
    '....mmm.....',
    '..mmmm......',
    '..mmm.......',
    '.mmmm.....s.',
    '.mmmm.......',
    '.mmmmm......',
    '.Mmmmmm..mm.',
    '..Mmmmmmmmm.',
    '...MMmmmmm..',
    '.....MMM....',
    '............',
  ],
};

/** ⟳ turn the view clockwise (⟲ is its mirror). Drawn in currentColor. */
const ROT_R_ROWS = [
  '......x....',
  '...xxxxx...',
  '..xx..x....',
  '.xx........',
  '.x.......x.',
  '.x.......x.',
  '.x.......x.',
  '.xx.....xx.',
  '..xx...xx..',
  '...xxxxx...',
  '...........',
];
export const ROT_R: Grid = { pal: { x: 'currentColor' }, rows: ROT_R_ROWS };
export const ROT_L: Grid = { pal: { x: 'currentColor' }, rows: ROT_R_ROWS.map((r) => [...r].reverse().join('')) };

export interface ItemDef { id: string; name: string; bod?: string; grid: Grid; note: string }
export const ITEM_DEFS: ItemDef[] = [
  { id: 'momo', name: 'Momos', bod: 'མོག་མོག', grid: MOMO, note: 'A plate of steamed momos, still hot.' },
  { id: 'laphing', name: 'Laphing', bod: 'ལ་ཕིང་', grid: LAPHING, note: 'Cold laphing with plenty of chilli.' },
  { id: 'balep', name: 'Balep', bod: 'བག་ལེབ།', grid: BALEP, note: 'Round Tibetan bread, warm from the pan.' },
  { id: 'puppy', name: 'Khyi-gu', bod: 'ཁྱི་གུ', grid: PUPPY, note: 'Pema’s puppy is following you.' },
  { id: 'luckyKnot', name: 'Lucky knot', bod: 'སྲུང་མདུད།', grid: KNOT, note: 'A red protection cord Pema tied for you.' },
];
