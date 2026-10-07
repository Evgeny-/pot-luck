import { describe, expect, it } from 'vitest';
import levels from '../src/data/levels.json';
import { geometryOf, tracePath } from '../src/core/board';
import { Sim } from '../src/core/sim';
import { WILD, tokenOf, type LevelDef } from '../src/core/types';

const LEVELS = levels as unknown as LevelDef[];

describe('campaign', () => {
  it('has levels numbered 1..n', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(40);
    LEVELS.forEach((lv, i) => expect(lv.n).toBe(i + 1));
  });

  it.each(LEVELS.map((lv) => [lv.n, lv] as const))('level %i: the stored solution wins', (_n, lv) => {
    const sim = Sim.fromLevel(lv);
    for (const m of lv.solution!) expect(sim.apply(m)).toBe(true);
    expect(sim.status).toBe('won');
  });

  it.each(LEVELS.map((lv) => [lv.n, lv] as const))('level %i: tiles fit, lanes end in pots, nothing is wasted', (_n, lv) => {
    const g = geometryOf(lv);
    const cells = new Map<number, number[]>();
    const tokens: number[] = [];
    for (const t of lv.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(lv.w);
      expect(t.y).toBeLessThan(lv.h);
      const p = tracePath(g, t.x, t.y, t.dir);
      expect(p.pot, `tile ${t.id} lane`).toBeGreaterThanOrEqual(0);
      cells.set(t.y * lv.w + t.x, [...(cells.get(t.y * lv.w + t.x) ?? []), t.z ?? 0]);
      tokens.push(t.ing * 4 === WILD ? WILD : tokenOf(t.ing, p.form));
    }
    // Stacks have distinct heights; pads are never covered.
    for (const zs of cells.values()) expect(new Set(zs).size).toBe(zs.length);
    for (const p of lv.pads ?? []) expect(cells.has(p.y * lv.w + p.x)).toBe(false);
    // Zero-waste: tiles deliver exactly what the recipes ask for.
    const items = lv.pots.flatMap((p) => p.dishes.flatMap((d) => d.items));
    expect(tokens.filter((t) => t !== WILD).length + tokens.filter((t) => t === WILD).length).toBe(items.length);
    expect([...tokens].sort()).toEqual([...items].sort());
  });

  it('follows the sawtooth: every hard level is harder than the normal levels around it', () => {
    for (const lv of LEVELS) {
      if (lv.tier !== 'hard' && lv.tier !== 'superhard') continue;
      const around = LEVELS.filter((o) => Math.abs(o.n - lv.n) <= 3 && o.tier === 'normal');
      for (const o of around) expect(lv.stats!.d, `level ${lv.n} vs ${o.n}`).toBeGreaterThan(o.stats!.d);
    }
  });
});
