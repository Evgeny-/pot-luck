import { cuisineFor, cuisineIngredients, LEVELS_PER_CUISINE } from './cuisines';
import type { DishSpec, GenParams, PotSpec } from './generator';
import { Rng } from './rng';
import { BASE_RULES, type Dir, type Rules, type Tier } from './types';

/**
 * The campaign's shape. Chapters of ten levels are cuisines. Difficulty is a sawtooth over a slowly
 * rising base: in every chapter the 5th level is hard and the 10th super hard, and the level after
 * a peak brings a new mechanic on a small board (a breather). The bowl starts with a single spot
 * and grows to two; hard levels often take a spot away again.
 */

export type MechanicId =
  | 'bowl' | 'salad' | 'bowl2' | 'stacks' | 'links' | 'lids' | 'cloche' | 'jar' | 'timer' | 'queue' | 'pads' | 'knife';

/** Level where each mechanic is introduced (with a one-screen explanation). */
export const MECHANIC_LEVEL: Record<MechanicId, number> = {
  bowl: 3, salad: 6, bowl2: 8, stacks: 11, links: 16, lids: 21, cloche: 26, jar: 31, timer: 36, queue: 41, pads: 46, knife: 51,
};

/** Introductions that don't make the level an easy intro level (the bowl simply grows). */
const NOTICE_ONLY: MechanicId[] = ['bowl2'];

export function mechanicsIntroducedAt(n: number): MechanicId[] {
  return (Object.keys(MECHANIC_LEVEL) as MechanicId[]).filter((m) => MECHANIC_LEVEL[m] === n);
}

export function tierFor(n: number): Tier {
  if (n <= 3 || mechanicsIntroducedAt(n).some((m) => !NOTICE_ONLY.includes(m))) return 'intro';
  if (n % 10 === 0) return 'superhard';
  if (n % 5 === 0) return 'hard';
  return 'normal';
}

/**
 * What a level should measure: a difficulty `d` (0..1, see tune.ts) on the campaign curve, plus
 * guard bands that keep each tier honest (intro levels gentle, normal ones fair, peaks deep).
 */
export interface Target {
  d: number;
  tol: number;
  greedy: [number, number];
  planner: [number, number];
  /** Decisions on the solution where another move loses: every level should ask for some. */
  minCritical: number;
}

/** The difficulty curve: a rising base with a sawtooth on top. */
export function targetD(n: number, tier: Tier): number {
  const base = 0.27 + 0.18 * Math.min(1, (n - 1) / 60);
  const pos = (n - 1) % 10;
  switch (tier) {
    case 'intro':
      return Math.min(0.12, base * 0.4);
    case 'relax':
      return Math.max(0.06, base - 0.14);
    case 'hard':
      return base + 0.2;
    case 'superhard':
      return Math.min(0.85, base + 0.32);
    default:
      return base + [0, -0.04, -0.02, 0, 0, 0, 0.02, -0.02, 0.03, 0][pos];
  }
}

export function targetFor(tier: Tier, n: number): Target {
  const d = targetD(n, tier);
  const late = n > 30 ? 1 : 0;
  switch (tier) {
    case 'intro':
      return { d, tol: 0.1, greedy: [0.75, 1], planner: [0.95, 1], minCritical: 0 };
    case 'relax':
      return { d, tol: 0.07, greedy: [0.7, 1], planner: [0.9, 1], minCritical: 0 };
    case 'hard':
      return { d, tol: 0.06, greedy: [0, 0.6], planner: [0.3, 0.92], minCritical: 3 + late };
    case 'superhard':
      return { d, tol: 0.07, greedy: [0, 0.35], planner: [0.1, 0.8], minCritical: 5 + late };
    default:
      return { d, tol: 0.045, greedy: [0.3, 0.92], planner: [0.6, 1], minCritical: n > 6 ? 1 + late : 0 };
  }
}

/** Everything the generator needs for level n, before tuning the hardness knob. */
export interface LevelPlan {
  n: number;
  tier: Tier;
  cuisine: string;
  mechanics: MechanicId[];
  /** Short note on the level's character, e.g. "four pots", "gridlock". */
  shape: string;
  params: GenParams;
  target: Target;
}

const ALL: Dir[] = [0, 1, 2, 3];

/** Splits `total` items over the pots as evenly as possible. */
function lengths(total: number, pots: number, rng: Rng): number[] {
  const out = new Array(pots).fill(Math.floor(total / pots));
  for (let k = 0; k < total % pots; k++) out[k]++;
  return rng.shuffle(out);
}

export function planLevel(n: number): LevelPlan {
  const rng = new Rng(n * 2654435761 + 11);
  const tier = tierFor(n);
  const target = targetFor(tier, n);
  const cuisine = cuisineFor(n);
  const intro = mechanicsIntroducedAt(n).find((m) => !NOTICE_ONLY.includes(m));
  const has = (m: MechanicId) => n >= MECHANIC_LEVEL[m];
  const rules: Rules = { ...BASE_RULES };
  let w = 6;
  let h = 6;
  let sides: Dir[] = ALL;
  let tiles = 26;
  let ingredients = 6;
  let shape = 'four pots';
  const p: Partial<GenParams> = {};
  const used: MechanicId[] = [];

  // ---- the opening: one pot, then two, then a one-spot bowl, then all four edges.
  if (n === 1) {
    [w, h, sides, tiles, ingredients, shape] = [3, 4, [0], 6, 4, 'first steps'];
    rules.bowl = 0;
  } else if (n === 2) {
    [w, h, sides, tiles, ingredients, shape] = [4, 4, [0, 2], 9, 4, 'two pots'];
    rules.bowl = 0;
  } else if (n === 3) {
    [w, h, sides, tiles, ingredients, shape] = [4, 4, [0, 2], 10, 5, 'the bowl'];
    used.push('bowl');
  } else if (n <= 10) {
    w = h = 5;
    tiles = tier === 'superhard' ? 20 : tier === 'hard' ? 19 : 15 + (n % 4);
    ingredients = 5;
    sides = n === 4 ? [0, 1, 2] : ALL;
    shape = n === 4 ? 'three pots' : 'four pots';
  } else {
    const stage = Math.min(1, (n - 11) / 40);
    const sizes: [number, number][] = stage < 0.3 ? [[5, 5], [5, 6], [6, 6]] : stage < 0.7 ? [[6, 6], [5, 6], [6, 7], [6, 6]] : [[6, 6], [6, 7], [7, 7]];
    [w, h] = sizes[n % sizes.length];
    if (tier === 'hard' || tier === 'superhard') [w, h] = stage < 0.3 ? [6, 6] : rng.pick([[6, 7], [7, 7]] as [number, number][]);
    const fill = tier === 'superhard' ? 0.78 : tier === 'hard' ? 0.75 : 0.66 + rng.next() * 0.08;
    tiles = Math.round(w * h * fill);
    ingredients = Math.min(cuisine.ingredients.length, 5 + Math.round(stage * 2) + (tier === 'superhard' ? 1 : 0));
    const roll = rng.next();
    if (tier === 'normal' && roll < 0.2) {
      sides = [0, 2];
      shape = 'up and down';
    } else if (tier === 'normal' && roll < 0.38) {
      sides = rng.pick([[0, 1, 2], [0, 2, 3], [0, 1, 3]] as Dir[][]);
      shape = 'three pots';
    } else shape = tier === 'normal' ? 'four pots' : 'gridlock';
  }

  // ---- bowl spots: one until level 8, then two; peaks often take one away again.
  if (n >= 3) {
    rules.bowl = n < MECHANIC_LEVEL.bowl2 ? 1 : 2;
    if (n >= MECHANIC_LEVEL.bowl2) {
      if (tier === 'superhard') rules.bowl = 1;
      else if (tier === 'hard') rules.bowl = rng.chance(0.4) ? 1 : 2;
      else if (tier === 'normal' && w * h >= 42 && rng.chance(0.35)) rules.bowl = 3;
    }
  }

  const pots: PotSpec[] = [];
  const lens = lengths(tiles, sides.length, rng);
  sides.forEach((side, i) => pots.push({ side, dishes: [{ len: lens[i] }] }));

  // ---- mechanics: an intro shows one on a small board; later levels mix them in.
  const TWISTS: MechanicId[] = ['stacks', 'links', 'lids', 'cloche', 'jar', 'timer', 'queue', 'pads', 'knife'];
  const CHANCE: Record<string, number> = { stacks: 0.35, links: 0.35, lids: 0.3, cloche: 0.35, jar: 0.3, timer: 0.3, queue: 0.25, pads: 0.25, knife: 0.2 };
  const cap = tier === 'superhard' ? 3 : tier === 'hard' || tier === 'normal' ? 2 : 0;
  const pick = new Set<MechanicId>();
  if (intro && TWISTS.includes(intro)) pick.add(intro);
  else if (!intro) {
    const avail = TWISTS.filter((m) => n > MECHANIC_LEVEL[m]);
    const recent = avail.filter((m) => n - MECHANIC_LEVEL[m] <= 4);
    for (const m of recent) if (pick.size < cap && rng.chance(0.8)) pick.add(m);
    for (const m of rng.shuffle(avail.filter((x) => !recent.includes(x)))) {
      if (pick.size < cap && rng.chance(CHANCE[m] * (tier === 'hard' || tier === 'superhard' ? 1.5 : 1))) pick.add(m);
    }
    if (pick.has('knife')) for (const m of ['stacks', 'lids', 'queue', 'links'] as MechanicId[]) pick.delete(m);
  }
  const want = (m: MechanicId) => pick.has(m);

  if (intro && TWISTS.includes(intro)) {
    // A small board where the new mechanic is the whole point.
    w = h = 5;
    tiles = 15;
    ingredients = 5;
    rules.bowl = 2;
    shape = 'new: ' + intro;
    pots.length = 0;
    const l2 = lengths(tiles, 4, rng);
    ALL.forEach((side, i) => pots.push({ side, dishes: [{ len: l2[i] }] }));
    sides = ALL;
  }

  // Any-order salad: a different kind of pot here and there.
  if (intro === 'salad' || (!intro && has('salad') && pots.length >= 3 && pick.size < 2 && rng.chance(tier === 'normal' ? 0.25 : 0))) {
    const left = pots.find((q) => q.side === 3) ?? pots[pots.length - 1];
    left.dishes = left.dishes.map((d) => ({ ...d, order: 'any', kind: 'salad' } as DishSpec));
    used.push('salad');
  }
  if (want('stacks')) {
    p.stacks = intro === 'stacks' ? 3 : rng.int(3, 6);
    pots[0].dishes[0].len += Math.ceil(p.stacks / 2);
    pots[pots.length - 1].dishes[0].len += Math.floor(p.stacks / 2);
    used.push('stacks');
  }
  if (want('links')) {
    p.links = intro === 'links' ? 2 : rng.int(2, 3);
    used.push('links');
  }
  if (want('lids') && pots.length >= 2) {
    const k = rng.int(0, pots.length - 1);
    pots[k].lid = (k + 1 + rng.int(0, pots.length - 2)) % pots.length;
    used.push('lids');
  }
  if (want('cloche')) {
    p.hidden = intro === 'cloche' ? 3 : rng.int(3, 5);
    used.push('cloche');
  }
  if (want('jar')) {
    rules.bowlOrder = 'lifo';
    rules.bowl = intro === 'jar' ? 2 : Math.max(2, rules.bowl);
    used.push('jar');
  }
  if (want('timer')) {
    p.timers = intro === 'timer' ? 2 : rng.int(2, 4);
    used.push('timer');
  }
  if (want('queue')) {
    for (const q of pots) {
      const len = q.dishes[0].len;
      if (len < 5 || (intro !== 'queue' && rng.chance(0.4))) continue;
      const a = Math.ceil(len / 2);
      q.dishes = [{ ...q.dishes[0], len: a }, { ...q.dishes[0], len: len - a, kind: undefined }];
    }
    used.push('queue');
  }
  if (want('pads') && w >= 5) {
    p.pads = intro === 'pads' ? 2 : rng.int(1, 3);
    used.push('pads');
  }
  if (want('knife')) {
    // The knife bar works on up/down lanes: two pots, walls on the sides.
    const mid = Math.floor(h / 2);
    p.bars = [{ kind: 'knife', axis: 'h', at: mid, from: 0, to: w }];
    const total = Math.min(Math.round(w * h * 0.6), pots.reduce((a, q) => a + q.dishes.reduce((b, d) => b + d.len, 0), 0));
    const l2 = lengths(total, 2, rng);
    pots.length = 0;
    pots.push({ side: 0, dishes: [{ len: l2[0], formRate: 0.5 }] }, { side: 2, dishes: [{ len: l2[1], formRate: 0.5 }] });
    p.stacks = 0;
    shape = 'knife';
    used.push('knife');
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

  // Dishes from the cuisine, all different within a level (salads keep their name).
  const menu = rng.shuffle(cuisine.dishes.filter((d) => d !== 'salad'));
  let next = 0;
  for (const q of pots) q.dishes = q.dishes.map((d) => (d.kind === 'salad' ? d : { ...d, kind: menu[next++ % menu.length] }));

  // Ingredients: the cuisine's most characteristic ones first, a random selection later on.
  const pool = cuisineIngredients(cuisine);
  const palette = n <= 10 ? pool.slice(0, ingredients) : rng.shuffle(pool.slice()).slice(0, ingredients);

  const params: GenParams = {
    w, h, pots, rules, palette,
    repeat: n <= 3 ? 0 : 0.3,
    detour: 0.5,
    horizon: 0.5,
    tight: 0.7,
    ...p,
  };
  if (MECHANIC_LEVEL.bowl2 === n) used.push('bowl2');
  return { n, tier, cuisine: cuisine.id, mechanics: [...new Set(used)], shape, params, target };
}

export const CAMPAIGN_LEVELS = 6 * LEVELS_PER_CUISINE;
