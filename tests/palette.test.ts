import { describe, expect, it } from 'vitest';
import { CUISINES } from '../src/core/cuisines';
import { INGREDIENTS } from '../src/core/ingredients';
import { pairReadability } from '../src/core/palette';

describe('ingredient colours', () => {
  it.each(CUISINES.map((c) => [c.id, c] as const))('%s: every pair of tile colours is easy to tell apart', (_id, c) => {
    const ings = c.ingredients.map((k) => INGREDIENTS.find((i) => i.key === k)!);
    for (let a = 0; a < ings.length; a++) {
      for (let b = a + 1; b < ings.length; b++) {
        expect(pairReadability(ings[a].color, ings[b].color), `${ings[a].key} / ${ings[b].key}`).toBeGreaterThanOrEqual(0.9);
      }
    }
  });
});
