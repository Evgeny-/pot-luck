import { describe, expect, it } from 'vitest';
import levels from '../src/data/levels.json';
import { starBands, starsFor } from '../src/game/stars';

describe('storage allowance shown before cooking', () => {
  it('explains a level that needs no storage for three stars', () => {
    expect(starBands(0)).toEqual([
      { stars: 3, min: 0, max: 0 },
      { stars: 2, min: 1, max: 2 },
      { stars: 1, min: 3, max: Infinity },
    ]);
    expect([0, 1, 2, 3].map((uses) => starsFor(uses, 0))).toEqual([3, 2, 2, 1]);
  });

  it('every displayed campaign range matches the award at its boundaries', () => {
    for (const level of levels) {
      const par = level.stats?.par ?? 0;
      const bands = starBands(par);
      for (const band of bands) {
        expect(starsFor(band.min, par), `level ${level.n}: ${band.min}`).toBe(band.stars);
        if (Number.isFinite(band.max)) expect(starsFor(band.max, par)).toBe(band.stars);
      }
      expect(bands[1].min).toBe(bands[0].max + 1);
      expect(bands[2].min).toBe(bands[1].max + 1);
    }
  });
});
