// Reine Yatzy-Wertungslogik – ohne Angular/Firebase, damit sie sowohl im
// GameService als auch im Board verwendet werden kann.

export type Category =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeKind' | 'fourKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'yatzy' | 'chance';

export interface CatDef {
  key: Category;
  upper: boolean;
}

export const CATEGORIES: CatDef[] = [
  { key: 'ones', upper: true },
  { key: 'twos', upper: true },
  { key: 'threes', upper: true },
  { key: 'fours', upper: true },
  { key: 'fives', upper: true },
  { key: 'sixes', upper: true },
  { key: 'threeKind', upper: false },
  { key: 'fourKind', upper: false },
  { key: 'fullHouse', upper: false },
  { key: 'smallStraight', upper: false },
  { key: 'largeStraight', upper: false },
  { key: 'yatzy', upper: false },
  { key: 'chance', upper: false },
];

export const UPPER_KEYS = CATEGORIES.filter((c) => c.upper).map((c) => c.key);
export const BONUS_LIMIT = 63;
export const BONUS_VALUE = 35;
export const MAX_ROLLS = 3;
export const DICE_COUNT = 5;

export type ScoreMap = Partial<Record<Category, number>>;

// Pip-Belegung im 3x3-Raster (Indizes 0..8, zeilenweise) je Würfelwert.
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function pips(value: number): boolean[] {
  const set = PIPS[value] ?? [];
  return Array.from({ length: 9 }, (_, i) => set.includes(i));
}

function counts(dice: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const x of dice) c[x]++;
  return c;
}

function sum(dice: number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}

function hasStraight(c: number[], len: number): boolean {
  let run = 0;
  for (let i = 1; i <= 6; i++) {
    if (c[i] > 0) {
      run++;
      if (run >= len) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/** Punktwert einer Kategorie für einen Würfelwurf. */
export function scoreFor(cat: Category, dice: number[]): number {
  const c = counts(dice);
  const s = sum(dice);
  switch (cat) {
    case 'ones': return c[1] * 1;
    case 'twos': return c[2] * 2;
    case 'threes': return c[3] * 3;
    case 'fours': return c[4] * 4;
    case 'fives': return c[5] * 5;
    case 'sixes': return c[6] * 6;
    case 'threeKind': return c.some((n) => n >= 3) ? s : 0;
    case 'fourKind': return c.some((n) => n >= 4) ? s : 0;
    case 'fullHouse': {
      const three = c.some((n) => n === 3);
      const two = c.some((n) => n === 2);
      const five = c.some((n) => n === 5);
      return (three && two) || five ? 25 : 0;
    }
    case 'smallStraight': return hasStraight(c, 4) ? 30 : 0;
    case 'largeStraight': return hasStraight(c, 5) ? 40 : 0;
    case 'yatzy': return c.some((n) => n === 5) ? 50 : 0;
    case 'chance': return s;
    default: return 0;
  }
}

export interface Totals {
  upper: number;
  bonus: number;
  total: number;
}

export function totalsFor(scores: ScoreMap): Totals {
  let upper = 0;
  let lower = 0;
  for (const c of CATEGORIES) {
    const v = scores[c.key];
    if (v == null) continue;
    if (c.upper) upper += v;
    else lower += v;
  }
  const bonus = upper >= BONUS_LIMIT ? BONUS_VALUE : 0;
  return { upper, bonus, total: upper + bonus + lower };
}

export function filledCount(scores: ScoreMap): number {
  return CATEGORIES.filter((c) => scores[c.key] != null).length;
}

export function isComplete(scores: ScoreMap): boolean {
  return filledCount(scores) === CATEGORIES.length;
}
