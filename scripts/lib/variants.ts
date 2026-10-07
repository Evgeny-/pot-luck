import type { GenParams, PotSpec } from '../../src/core/generator';
import { BASE_RULES, type Dir } from '../../src/core/types';

export interface Variant {
  key: string;
  label: string;
  /** Extra rules a player has to learn on top of the baseline (0 = none). */
  cost: number;
  params: GenParams;
}

const PALETTE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const four = (len: number, extra: Partial<PotSpec['dishes'][0]> = {}): PotSpec[] =>
  ([0, 1, 2, 3] as Dir[]).map((side) => ({ side, dishes: [{ len, ...extra }] }));

export const base: GenParams = {
  w: 6, h: 6, pots: four(7), rules: { ...BASE_RULES }, palette: PALETTE,
  repeat: 0.3, detour: 0.6, horizon: 0.5, tight: 0.9,
};
const v = (key: string, label: string, cost: number, over: Partial<GenParams>): Variant => ({ key, label, cost, params: { ...base, ...over } });
const rules = (r: Partial<GenParams['rules']>) => ({ rules: { ...BASE_RULES, ...r } });

export const VARIANTS: Variant[] = [
  v('base', 'Baseline: 6×6, 4 pots, router bowl 3 (auto)', 0, {}),
  v('loose', 'Baseline, loose generator (detour .3, tight .4)', 0, { detour: 0.3, tight: 0.4 }),
  v('small', '5×5, 4 pots × 5 (20 tiles)', 0, { w: 5, h: 5, pots: four(5) }),
  v('big', '7×7, 4 pots × 10 (40 tiles)', 0, { w: 7, h: 7, pots: four(10) }),
  v('bowl4', 'Bowl 4', 0, rules({ bowl: 4 })),
  v('bowl2', 'Bowl 2', 0, rules({ bowl: 2 })),
  v('bowl1', 'Bowl 1', 0, rules({ bowl: 1 })),
  v('nobowl', 'No bowl (B2)', 0, { ...rules({ bowl: 0 }), detour: 0 }),
  v('hold', 'Hold bowl: items wait for their own pot', 0, rules({ bowlMode: 'hold' })),
  v('hold2', 'Hold bowl, 2 spots', 0, rules({ bowlMode: 'hold', bowl: 2 })),
  v('tap', 'Router bowl, player sends items (tap)', 0, rules({ bowlDelivery: 'tap' })),
  v('skewer3', 'Skewer: bowl 3, last in first out', 1, rules({ bowlOrder: 'lifo' })),
  v('skewer4', 'Skewer 4', 1, rules({ bowlOrder: 'lifo', bowl: 4 })),
  v('any', 'Any-order dishes (R2)', 1, { pots: four(7, { order: 'any' }) }),
  v('base2', 'Base-first dishes: first 2 in order (R3)', 1, { pots: four(7, { order: 'base', base: 2 }) }),
  v('queue', 'Dish queue: 2 dishes of 4 per pot (R4)', 1, { pots: ([0, 1, 2, 3] as Dir[]).map((side) => ({ side, dishes: [{ len: 4 }, { len: 4 }] })), h: 6, w: 6 }),
  v('twins', 'Many copies (repeat .8)', 0, { repeat: 0.8 }),
  v('distinct', 'No copies (repeat 0)', 0, { repeat: 0 }),
  v('twopots', 'Two pots (top/bottom), walls left/right (E2)', 0, { pots: [{ side: 0, dishes: [{ len: 14 }] }, { side: 2, dishes: [{ len: 14 }] }] }),
  v('split', 'Split edges: 6 pots × 5 (E3)', 1, {
    pots: [
      { side: 0, from: 0, to: 3, dishes: [{ len: 5 }] }, { side: 0, from: 3, to: 6, dishes: [{ len: 5 }] },
      { side: 1, dishes: [{ len: 5 }] },
      { side: 2, from: 0, to: 3, dishes: [{ len: 5 }] }, { side: 2, from: 3, to: 6, dishes: [{ len: 5 }] },
      { side: 3, dishes: [{ len: 5 }] },
    ],
  }),
  v('lids', 'Lid: the salad opens after the stew (M7)', 1, { pots: [{ side: 0, dishes: [{ len: 7 }] }, { side: 1, dishes: [{ len: 7 }] }, { side: 2, dishes: [{ len: 7 }] }, { side: 3, dishes: [{ len: 7 }], lid: 1 }] }),
  v('stacks', 'Stacked tiles: 6 stacks (M5)', 1, { pots: four(8), stacks: 6 }),
  v('pads', 'Turn pads: 2 (M3)', 2, { pots: four(7), pads: 2 }),
  v('pads3', 'Turn pads: 3 on 7×7', 2, { w: 7, h: 7, pots: four(10), pads: 3 }),
  v('knife', 'Knife bar, 2 pots top/bottom (M1)', 2, {
    pots: [{ side: 0, dishes: [{ len: 11, formRate: 0.5 }] }, { side: 2, dishes: [{ len: 11, formRate: 0.5 }] }],
    bars: [{ kind: 'knife', axis: 'h', at: 3, from: 0, to: 6 }],
  }),
  v('twopots11', 'Two pots × 11, no knife (control for the knife)', 0, { pots: [{ side: 0, dishes: [{ len: 11 }] }, { side: 2, dishes: [{ len: 11 }] }] }),
  v('frozen', 'Frozen tiles: 5 (M9)', 1, { frozen: 5 }),
  v('wild', 'Wild spice: 2 (M8)', 1, { wild: 2 }),
  // Combinations of the strongest single twists.
  v('lids-bowl2', 'Lid + bowl 2', 1, { pots: [{ side: 0, dishes: [{ len: 7 }] }, { side: 1, dishes: [{ len: 7 }] }, { side: 2, dishes: [{ len: 7 }] }, { side: 3, dishes: [{ len: 7 }], lid: 1 }], ...rules({ bowl: 2 }) }),
  v('stacks-bowl2', 'Stacks + bowl 2', 1, { pots: four(8), stacks: 6, ...rules({ bowl: 2 }) }),
  v('skewer-lids', 'Skewer 3 + lid', 2, { pots: [{ side: 0, dishes: [{ len: 7 }] }, { side: 1, dishes: [{ len: 7 }] }, { side: 2, dishes: [{ len: 7 }] }, { side: 3, dishes: [{ len: 7 }], lid: 1 }], ...rules({ bowlOrder: 'lifo' }) }),
  v('big-bowl2', '7×7 (40 tiles) + bowl 2', 0, { w: 7, h: 7, pots: four(10), ...rules({ bowl: 2 }) }),
  v('salad', 'One any-order salad among 3 strict pots', 1, { pots: [{ side: 0, dishes: [{ len: 7 }] }, { side: 1, dishes: [{ len: 7 }] }, { side: 2, dishes: [{ len: 7 }] }, { side: 3, dishes: [{ len: 7, order: 'any', kind: 'salad' }] }] }),
];

