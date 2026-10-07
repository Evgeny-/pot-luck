/** Arrow directions; a tile leaves the board through the side it points at. 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const DIR_CHAR = ['^', '>', 'v', '<'] as const;
export const SIDE_NAME = ['top', 'right', 'bottom', 'left'] as const;

/**
 * What a pot receives: an ingredient in a form. token = ing * 4 + form, form bits: 1 chopped
 * (crossed a knife bar), 2 cooked (crossed a hot bar).
 */
export type Token = number;
export const FORM_CHOPPED = 1;
export const FORM_COOKED = 2;
/** Ingredient id of the wild spice: it counts as whatever its pot needs next. */
export const WILD_ING = 63;
export const WILD: Token = WILD_ING * 4;
export const tokenOf = (ing: number, form = 0): Token => ing * 4 + form;
export const ingOf = (t: Token): number => t >> 2;
export const formOf = (t: Token): number => t & 3;

export interface TileDef {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  /** Ingredient id (WILD_ING for the wild spice). */
  ing: number;
  /** Stack height: a tile with a larger z sits on top of the tiles below it in the same cell. */
  z?: number;
  /** Frozen until a tile in a neighbouring cell has left. */
  frozen?: boolean;
}

/** strict: in recipe order. any: in any order. base: the first `base` items in order, then any. */
export type DishOrder = 'strict' | 'any' | 'base';

export interface DishDef {
  /** Dish icon / name key (soup, stew, salad...). */
  kind: string;
  items: Token[];
  order: DishOrder;
  base?: number;
}

export interface PotDef {
  /** Edge the pot sits on (= the direction a tile leaves in to get there). */
  side: Dir;
  /** Part of the edge feeding this pot: [from, to) along the edge (left→right, top→bottom). */
  from: number;
  to: number;
  /** Dishes cooked in this pot, one after another. */
  dishes: DishDef[];
  /** Index of a pot that must be fully served before this one opens. */
  lid?: number;
}

/** A floor arrow: a tile sliding over it turns to face its direction. Never occupied. */
export interface PadDef {
  x: number;
  y: number;
  dir: Dir;
}

/**
 * A bar along a grid line. 'h' bars lie on the line above row `at` and are crossed by tiles moving
 * up or down through columns [from, to); 'v' bars lie left of column `at`, crossed horizontally.
 */
export interface BarDef {
  kind: 'knife' | 'heat';
  axis: 'h' | 'v';
  at: number;
  from: number;
  to: number;
}

export interface Rules {
  /** Bowl spots; 0 = no bowl (a wrong slide is never allowed). */
  bowl: number;
  /** router: a bowl item may go to any pot that wants it. hold: it waits for the pot it slid to. */
  bowlMode: 'router' | 'hold';
  /** free: any bowl item can leave. lifo: a skewer, only the last item in can leave. */
  bowlOrder: 'free' | 'lifo';
  /** tap: the player sends bowl items (router only). auto: pots take what they need at once. */
  bowlDelivery: 'tap' | 'auto';
}

export const BASE_RULES: Rules = { bowl: 3, bowlMode: 'router', bowlOrder: 'free', bowlDelivery: 'auto' };

export type Tier = 'intro' | 'easy' | 'normal' | 'hard' | 'superhard' | 'relax';

export interface LevelStats {
  /** Win rates of simulated players (0..1). */
  random: number;
  casual: number;
  greedy: number;
  planner: number;
  /** Decisions on the reference line where another legal move loses. */
  critical: number;
  decisions: number;
  /** Share of legal moves that lose, averaged over the reference line. */
  traps: number;
  /** Share of losing moves at the start. */
  firstTraps: number;
  /** Planning effort 0..1 (log2 of positions explored per solution move, / 6). */
  effort: number;
  /** Fewest bowl uses found (3 stars). */
  par: number;
  /** Solver nodes needed to prove solvability. */
  nodes: number;
  /** Combined difficulty 0..1 used for the campaign curve. */
  d: number;
}

export interface LevelDef {
  n: number;
  w: number;
  h: number;
  tiles: TileDef[];
  pots: PotDef[];
  pads?: PadDef[];
  bars?: BarDef[];
  rules: Rules;
  tier?: Tier;
  /** Mechanics this level uses (for intro dialogs and the debug list). */
  mechanics?: string[];
  /** Level archetype / notes. */
  tags?: string[];
  /** A known solution: moves as encoded by Sim (tile id, or bowl move). */
  solution?: number[];
  stats?: LevelStats;
}

export function cloneLevel(l: LevelDef): LevelDef {
  return JSON.parse(JSON.stringify(l)) as LevelDef;
}
