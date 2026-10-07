import type { DishSpec, GenParams, PotSpec } from './generator';
import { FAMILY_ORDER, INGREDIENTS } from './ingredients';
import { Rng } from './rng';
import { BASE_RULES, type Dir, type Rules, type Tier } from './types';

/**
 * The campaign's shape: difficulty is a sawtooth over a slowly rising base. In every block of ten,
 * the 5th level is hard and the 10th super hard; the level after a peak is a breather (or brings a
 * new mechanic on a small board). Board size, pots, bowl and mechanics vary from level to level so
 * that neighbouring levels feel different even at the same difficulty.
 */

export type MechanicId = 'bowl' | 'salad' | 'stacks' | 'lids' | 'queue' | 'skewer' | 'pads' | 'knife' | 'frozen';

/** First level of each mechanic (its intro level). */
export const MECHANIC_LEVEL: Record<MechanicId, number> = {
  bowl: 3, salad: 6, stacks: 11, lids: 21, queue: 26, skewer: 31, pads: 36, knife: 41, frozen: 46,
};

export function mechanicsIntroducedAt(n: number): MechanicId[] {
  return (Object.keys(MECHANIC_LEVEL) as MechanicId[]).filter((m) => MECHANIC_LEVEL[m] === n);
}

export function tierFor(n: number): Tier {
  if (n <= 3 || mechanicsIntroducedAt(n).length) return 'intro';
  if (n % 10 === 0) return 'superhard';
  if (n % 5 === 0) return 'hard';
  if (n % 5 === 1) return 'relax';
  return 'normal';
}

/**
 * What a level should measure: a difficulty `d` (0..1, see tune.ts) on the campaign curve, plus
 * guard bands that keep each tier honest (intro and relax levels stay gentle, normal ones fair).
 */
export interface Target {
  d: number;
  tol: number;
  greedy: [number, number];
  planner: [number, number];
  /** Decisions on the solution where another move loses: every level should ask for some. */
  minCritical: number;
}

/**
 * The difficulty curve: a slowly rising base with a sawtooth on top. Inside a block of ten the
 * normal levels wiggle up, the 5th is a hard peak, the 6th a breather, the 10th the big peak.
 */
export function targetD(n: number, tier: Tier): number {
  const base = 0.2 + 0.18 * Math.min(1, (n - 1) / 60);
  const pos = (n - 1) % 10;
  switch (tier) {
    case 'intro':
      return Math.min(0.1, base * 0.5);
    case 'relax':
      return Math.max(0.06, base - 0.12);
    case 'hard':
      return base + 0.22;
    case 'superhard':
      return Math.min(0.85, base + 0.34);
    default:
      return base + [0, 0, -0.04, 0, 0.04, 0, 0, -0.02, 0.02, 0.05][pos];
  }
}

export function targetFor(tier: Tier, n: number): Target {
  const d = targetD(n, tier);
  switch (tier) {
    case 'intro':
      return { d, tol: 0.1, greedy: [0.8, 1], planner: [0.95, 1], minCritical: 0 };
    case 'relax':
      return { d, tol: 0.07, greedy: [0.75, 1], planner: [0.9, 1], minCritical: 0 };
    case 'hard':
      return { d, tol: 0.06, greedy: [0, 0.65], planner: [0.3, 0.92], minCritical: 3 + (n > 30 ? 1 : 0) };
    case 'superhard':
      return { d, tol: 0.07, greedy: [0, 0.4], planner: [0.1, 0.8], minCritical: 5 + (n > 30 ? 1 : 0) };
    default:
      return { d, tol: 0.04, greedy: [0.3, 1], planner: [0.6, 1], minCritical: n > 6 ? 1 : 0 };
  }
}

/** Everything the generator needs for level n, before tuning the hardness knob. */
export interface LevelPlan {
  n: number;
  tier: Tier;
  mechanics: MechanicId[];
  /** Short note on the level's character, e.g. "rush", "gridlock". */
  shape: string;
  params: GenParams;
  target: Target;
}

const ALL: Dir[] = [0, 1, 2, 3];

function palette(rng: Rng, count: number): number[] {
  // One ingredient per colour family, the most distinct families first on early levels.
  const fams = count <= 5 ? FAMILY_ORDER.slice(0, Math.max(count + 1, 5)) : FAMILY_ORDER.slice();
  const picked = rng.shuffle(fams.slice()).slice(0, count);
  return picked.map((f) => rng.pick(INGREDIENTS.filter((i) => i.family === f)).id);
}

/** Splits `total` items over the pots as evenly as possible. */
function lengths(total: number, pots: number, rng: Rng): number[] {
  const out = new Array(pots).fill(Math.floor(total / pots));
  for (let k = 0; k < total % pots; k++) out[k]++;
  return rng.shuffle(out);
}

export function planLevel(n: number): LevelPlan {
  const rng = new Rng(n * 2654435761 + 7);
  const tier = tierFor(n);
  const target = targetFor(tier, n);
  const mech = mechanicsIntroducedAt(n);
  const intro = mech[0];
  const has = (m: MechanicId) => n >= MECHANIC_LEVEL[m];
  const rules: Rules = { ...BASE_RULES };
  let w = 6;
  let h = 6;
  let sides: Dir[] = ALL;
  let tiles = 26;
  let ingredients = 6;
  let shape = 'classic';
  const p: Partial<GenParams> = {};
  const used: MechanicId[] = [];

  // ---- the opening: one pot, then two, then the bowl, then all four edges.
  if (n === 1) {
    [w, h, sides, tiles, ingredients, shape] = [3, 4, [0], 6, 4, 'first steps'];
    rules.bowl = 0;
  } else if (n === 2) {
    [w, h, sides, tiles, ingredients, shape] = [4, 4, [0, 2], 9, 4, 'two pots'];
    rules.bowl = 0;
  } else if (n === 3) {
    [w, h, sides, tiles, ingredients, shape] = [4, 4, [0, 2], 11, 5, 'the bowl'];
    used.push('bowl');
  } else if (n <= 10) {
    w = h = 5;
    tiles = tier === 'superhard' ? 22 : tier === 'hard' ? 21 : tier === 'relax' ? 16 : 17 + (n % 5);
    ingredients = 5;
    sides = n === 4 ? [0, 1, 2] : ALL;
    shape = n === 4 ? 'three pots' : 'four pots';
  } else {
    // Sizes alternate so that neighbouring levels look different.
    const late = n > 30;
    const sizes: [number, number][] = late ? [[6, 6], [6, 7], [6, 6], [7, 7], [5, 6]] : [[5, 6], [6, 6], [5, 5], [6, 6], [6, 7]];
    [w, h] = sizes[n % sizes.length];
    if (tier === 'hard' || tier === 'superhard') [w, h] = late ? [7, 7] : [6, 6];
    if (tier === 'relax') [w, h] = rng.pick([[6, 7], [7, 7], [6, 6]] as [number, number][]);
    const cells = w * h;
    const fill = tier === 'relax' ? 0.62 : tier === 'superhard' ? 0.8 : tier === 'hard' ? 0.78 : 0.7 + rng.next() * 0.06;
    tiles = Math.round(cells * fill);
    ingredients = n < 20 ? 6 : 7;
    // Some levels use fewer pots (walls on the other edges): a different kind of board.
    const roll = rng.next();
    if (tier === 'normal' && roll < 0.2 && n % 3 !== 0) {
      sides = [0, 2];
      shape = 'up and down';
    } else if (tier === 'normal' && roll < 0.35) {
      sides = rng.pick([[0, 1, 2], [0, 2, 3], [0, 1, 3]] as Dir[][]);
      shape = 'three pots';
    } else shape = tier === 'relax' ? 'rush' : tier === 'normal' ? 'four pots' : 'gridlock';
  }

  // ---- bowl size: the main difficulty lever.
  if (n > 3) {
    if (tier === 'superhard') rules.bowl = 2;
    else if (tier === 'hard') rules.bowl = n < 20 ? 3 : 2;
    else if (tier === 'relax') rules.bowl = 4;
    else rules.bowl = 3;
  }

  const pots: PotSpec[] = [];
  const lens = lengths(tiles, sides.length, rng);
  sides.forEach((side, i) => pots.push({ side, dishes: [{ len: lens[i] }] }));

  // ---- mechanics: the intro level shows one on a small board, later levels mix them in.
  const introBoard = () => {
    w = h = 5;
    tiles = 16;
    ingredients = 5;
    rules.bowl = 3;
    shape = 'new: ' + intro;
  };
  // Which twists this level mixes in: the newest one gets practised right after its intro, and
  // harder tiers may combine more of them.
  const TWISTS: MechanicId[] = ['stacks', 'lids', 'queue', 'skewer', 'pads', 'knife', 'frozen'];
  const CHANCE: Record<string, number> = { stacks: 0.4, lids: 0.35, queue: 0.25, skewer: 0.35, pads: 0.3, knife: 0.2, frozen: 0.3 };
  const cap = tier === 'superhard' ? 3 : tier === 'hard' || tier === 'normal' ? 2 : tier === 'relax' ? 1 : 0;
  const pick = new Set<MechanicId>();
  if (intro) pick.add(intro);
  else {
    const avail = TWISTS.filter((m) => n > MECHANIC_LEVEL[m]);
    const recent = avail.filter((m) => n - MECHANIC_LEVEL[m] <= 4);
    for (const m of recent) if (pick.size < cap && rng.chance(0.8)) pick.add(m);
    for (const m of rng.shuffle(avail.filter((x) => !recent.includes(x)))) {
      // Skewers and lids are the hard twists: no lids or skewers on relax levels.
      if (tier === 'relax' && (m === 'lids' || m === 'skewer')) continue;
      if (pick.size < cap && rng.chance(CHANCE[m] * (tier === 'hard' || tier === 'superhard' ? 1.5 : 1))) pick.add(m);
    }
    if (pick.has('knife')) for (const m of ['stacks', 'lids', 'queue'] as MechanicId[]) pick.delete(m);
  }
  const want = (m: MechanicId) => pick.has(m);

  if (intro && intro !== 'bowl' && intro !== 'salad') introBoard();

  // Rebuild pots after an intro board resize.
  if (intro && intro !== 'bowl' && intro !== 'salad') {
    pots.length = 0;
    const l2 = lengths(tiles, 4, rng);
    ALL.forEach((side, i) => pots.push({ side, dishes: [{ len: l2[i] }] }));
    sides = ALL;
  }

  // Any-order salad: relief levels, and a different kind of pot here and there.
  if (intro === 'salad' || (!intro && has('salad') && pots.length >= 3 && pick.size < 2 && rng.chance(tier === 'relax' ? 0.8 : tier === 'normal' ? 0.2 : 0))) {
    const left = pots.find((q) => q.side === 3) ?? pots[pots.length - 1];
    left.dishes = left.dishes.map((d) => ({ ...d, order: 'any', kind: 'salad' } as DishSpec));
    used.push('salad');
  }
  if (want('stacks')) {
    p.stacks = intro === 'stacks' ? 4 : rng.int(3, 6);
    // Stacks put more ingredients on the same cells.
    const extra = p.stacks;
    pots[0].dishes[0].len += Math.ceil(extra / 2);
    pots[pots.length - 1].dishes[0].len += Math.floor(extra / 2);
    used.push('stacks');
  }
  if (want('lids') && pots.length >= 2) {
    const k = rng.int(0, pots.length - 1);
    pots[k].lid = (k + 1 + rng.int(0, pots.length - 2)) % pots.length;
    used.push('lids');
  }
  if (want('queue')) {
    // Two dishes per pot (or per a couple of pots): same ingredients, new meaning after a serve.
    for (const q of pots) {
      const len = q.dishes[0].len;
      if (len < 5 || (intro !== 'queue' && rng.chance(0.4))) continue;
      const a = Math.ceil(len / 2);
      q.dishes = [{ ...q.dishes[0], len: a }, { ...q.dishes[0], len: len - a, kind: undefined }];
    }
    used.push('queue');
  }
  if (want('skewer')) {
    rules.bowlOrder = 'lifo';
    rules.bowl = Math.max(rules.bowl, 3);
    used.push('skewer');
  }
  if (want('pads') && w >= 5) {
    p.pads = intro === 'pads' ? 2 : rng.int(1, 3);
    used.push('pads');
  }
  if (want('knife')) {
    // The knife bar works on up/down lanes: two pots, walls on the sides.
    const mid = Math.floor(h / 2);
    p.bars = [{ kind: 'knife', axis: 'h', at: mid, from: 0, to: w }];
    const total = Math.min(Math.round(w * h * 0.62), pots.reduce((a, q) => a + q.dishes.reduce((b, d) => b + d.len, 0), 0));
    const l2 = lengths(total, 2, rng);
    pots.length = 0;
    pots.push({ side: 0, dishes: [{ len: l2[0], formRate: 0.5 }] }, { side: 2, dishes: [{ len: l2[1], formRate: 0.5 }] });
    p.stacks = 0;
    used.splice(0, used.length, ...used.filter((m) => m !== 'stacks' && m !== 'lids' && m !== 'queue' && m !== 'salad'), 'knife');
  }
  if (want('frozen')) {
    p.frozen = intro === 'frozen' ? 3 : rng.int(2, 4);
    used.push('frozen');
  }

  // Recipes must stay readable on a phone: at most 9 items per pot, or two dishes of up to 7 once
  // pots cook two dishes.
  const split = has('queue') && !intro;
  for (const q of pots) {
    const total = q.dishes.reduce((a, d) => a + d.len, 0);
    const max = split ? 14 : 9;
    if (total <= max && (q.dishes.length > 1 || total <= 9)) continue;
    const t2 = Math.min(total, max);
    if (t2 > 9) {
      const a = Math.ceil(t2 / 2);
      q.dishes = [{ ...q.dishes[0], len: a }, { ...q.dishes[0], len: t2 - a, kind: undefined }];
      if (!used.includes('queue')) used.push('queue');
    } else if (q.dishes.length > 1) {
      const a = Math.ceil(t2 / 2);
      q.dishes = [{ ...q.dishes[0], len: a }, { ...q.dishes[1], len: t2 - a }];
    } else q.dishes = [{ ...q.dishes[0], len: t2 }];
  }
  if (p.bars) shape = 'knife';

  const params: GenParams = {
    w, h, pots, rules,
    palette: palette(rng, ingredients),
    repeat: n <= 3 ? 0 : 0.3,
    detour: 0.5,
    horizon: 0.5,
    tight: 0.7,
    ...p,
  };
  return { n, tier, mechanics: [...new Set(used)], shape, params, target };
}
