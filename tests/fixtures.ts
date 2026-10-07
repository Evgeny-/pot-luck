import { BASE_RULES, tokenOf, type LevelDef, type Rules } from '../src/core/types';

export const T = 0; // tomato
export const O = 1; // onion
export const C = 2; // carrot
export const G = 3; // garlic

/**
 * The brief's worked example on a 3×3 board:
 *   soup (top): onion → tomato; stew (right): carrot. Tomato at (1,0)^, onion at (0,1)^, carrot (2,1)>.
 */
export function workedExample(rules: Partial<Rules> = {}): LevelDef {
  return {
    n: 0,
    w: 3,
    h: 3,
    rules: { ...BASE_RULES, ...rules },
    pots: [
      { side: 0, from: 0, to: 3, dishes: [{ kind: 'soup', items: [tokenOf(O), tokenOf(T)], order: 'strict' }] },
      { side: 1, from: 0, to: 3, dishes: [{ kind: 'stew', items: [tokenOf(C)], order: 'strict' }] },
    ],
    tiles: [
      { id: 0, x: 1, y: 0, dir: 0, ing: T },
      { id: 1, x: 0, y: 1, dir: 0, ing: O },
      { id: 2, x: 2, y: 1, dir: 1, ing: C },
    ],
  };
}
