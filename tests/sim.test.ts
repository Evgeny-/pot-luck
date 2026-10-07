import { describe, expect, it } from 'vitest';
import { Sim, bowlMove } from '../src/core/sim';
import { tracePath, makeGeometry } from '../src/core/board';
import { BASE_RULES, FORM_CHOPPED, WILD_ING, tokenOf, type LevelDef } from '../src/core/types';
import { C, G, O, T, workedExample } from './fixtures';

function play(level: LevelDef, moves: number[]): Sim {
  const sim = Sim.fromLevel(level);
  for (const m of moves) expect(sim.apply(m), `move ${m}`).toBe(true);
  return sim;
}

describe('baseline rules', () => {
  it('serves the worked example in the right order', () => {
    const sim = play(workedExample(), [1, 0, 2]);
    expect(sim.status).toBe('won');
    expect(sim.parks).toBe(0);
  });

  it('parks an early tomato in the bowl and serves it when the soup is ready', () => {
    const sim = Sim.fromLevel(workedExample());
    expect(sim.wouldDeliver(0)).toBe(false);
    sim.apply(0);
    expect(sim.bowlLen).toBe(1);
    expect(sim.parks).toBe(1);
    sim.apply(1); // onion → soup, then the bowl tomato follows automatically
    expect(sim.bowlLen).toBe(0);
    expect(sim.potDone(0)).toBe(true);
    sim.apply(2);
    expect(sim.status).toBe('won');
  });

  it('a tile with something in its lane does not move', () => {
    const lv = workedExample();
    lv.tiles[1] = { id: 1, x: 1, y: 1, dir: 0, ing: O }; // onion right below the tomato
    const sim = Sim.fromLevel(lv);
    expect(sim.check(1)).toBe('blocked');
    expect(sim.apply(1)).toBe(false);
    expect(sim.legalMoves()).toEqual([0, 2]);
  });

  it('a full bowl refuses a wrong slide', () => {
    const sim = Sim.fromLevel(workedExample({ bowl: 1 }));
    sim.apply(2); // carrot: the stew wants it
    expect(sim.potDone(1)).toBe(true);
    sim.apply(0); // tomato → bowl (1/1)
    expect(sim.bowlLen).toBe(1);
    // Nothing else is wrong now; onion goes in, tomato follows.
    sim.apply(1);
    expect(sim.status).toBe('won');
  });

  it('without a bowl a wrong slide is never allowed', () => {
    const sim = Sim.fromLevel(workedExample({ bowl: 0 }));
    expect(sim.check(0)).toBe('full');
    expect(sim.legalMoves()).toEqual([1, 2]);
  });

  it('a skewer only releases its last item', () => {
    // Soup wants O then T; both tiles slide up early into a 2-spot skewer: T first, then O... O
    // is wanted, so build a case where two wrong items are parked.
    const lv: LevelDef = {
      n: 0, w: 3, h: 1, rules: { ...BASE_RULES, bowl: 2, bowlOrder: 'lifo' },
      pots: [{ side: 0, from: 0, to: 3, dishes: [{ kind: 'soup', items: [tokenOf(O), tokenOf(T), tokenOf(C)], order: 'strict' }] }],
      tiles: [
        { id: 0, x: 0, y: 0, dir: 0, ing: C },
        { id: 1, x: 1, y: 0, dir: 0, ing: T },
        { id: 2, x: 2, y: 0, dir: 0, ing: O },
      ],
    };
    // Park carrot, then tomato: tomato is on top, so it leaves first after the onion: fine.
    let sim = play(lv, [0, 1, 2]);
    expect(sim.status).toBe('won');
    // Park tomato, then carrot: after the onion the soup wants tomato, but carrot sits on top.
    sim = play(lv, [1, 0, 2]);
    expect(sim.status).toBe('playing');
    expect(sim.bowlLen).toBe(2);
    expect(sim.checkStuck()).toBe(true);
  });

  it('router + tap: the player sends bowl items', () => {
    const sim = Sim.fromLevel(workedExample({ bowlDelivery: 'tap' }));
    sim.apply(0); // tomato → bowl
    sim.apply(1); // onion → soup
    expect(sim.bowlLen).toBe(1);
    expect(sim.legalMoves()).toContain(bowlMove(0, 0));
    expect(sim.apply(bowlMove(0, 1))).toBe(false); // the stew doesn't want tomato
    expect(sim.apply(bowlMove(0, 0))).toBe(true);
    expect(sim.potDone(0)).toBe(true);
  });

  it('hold mode: a bowl item waits for the pot it slid into', () => {
    // Tomato slides right into the stew early; the soup also wants tomato but may not take it.
    const lv: LevelDef = {
      n: 0, w: 2, h: 2, rules: { ...BASE_RULES, bowlMode: 'hold' },
      pots: [
        { side: 0, from: 0, to: 2, dishes: [{ kind: 'soup', items: [tokenOf(T)], order: 'strict' }] },
        { side: 1, from: 0, to: 2, dishes: [{ kind: 'stew', items: [tokenOf(C), tokenOf(T)], order: 'strict' }] },
      ],
      tiles: [
        { id: 0, x: 1, y: 1, dir: 1, ing: T },
        { id: 1, x: 0, y: 0, dir: 0, ing: T },
        { id: 2, x: 1, y: 0, dir: 1, ing: C },
      ],
    };
    const sim = Sim.fromLevel(lv);
    sim.apply(0); // tomato → stew is early → bowl, bound to the stew
    expect(sim.bowlLen).toBe(1);
    sim.apply(1); // the soup gets the other tomato from the board
    expect(sim.potDone(0)).toBe(true);
    expect(sim.bowlLen).toBe(1); // still waiting for the stew
    sim.apply(2); // carrot → stew, then the stew takes its tomato
    expect(sim.status).toBe('won');
  });
});

describe('recipes', () => {
  const twoTiles = (order: 'strict' | 'any' | 'base', base?: number): LevelDef => ({
    n: 0, w: 3, h: 1, rules: { ...BASE_RULES, bowl: 0 },
    pots: [{ side: 0, from: 0, to: 3, dishes: [{ kind: 'salad', items: [tokenOf(O), tokenOf(T), tokenOf(C)], order, base }] }],
    tiles: [
      { id: 0, x: 0, y: 0, dir: 0, ing: C },
      { id: 1, x: 1, y: 0, dir: 0, ing: T },
      { id: 2, x: 2, y: 0, dir: 0, ing: O },
    ],
  });

  it('strict dishes take items in order', () => {
    expect(Sim.fromLevel(twoTiles('strict')).legalMoves()).toEqual([2]);
  });

  it('any-order dishes take anything they still need', () => {
    expect(Sim.fromLevel(twoTiles('any')).legalMoves()).toEqual([0, 1, 2]);
  });

  it('base dishes want their base first, then anything', () => {
    const sim = Sim.fromLevel(twoTiles('base', 1));
    expect(sim.legalMoves()).toEqual([2]);
    sim.apply(2);
    expect(sim.legalMoves()).toEqual([0, 1]);
  });

  it('a served dish makes room for the next one in the same pot', () => {
    const lv: LevelDef = {
      n: 0, w: 2, h: 1, rules: { ...BASE_RULES, bowl: 0 },
      pots: [{ side: 0, from: 0, to: 2, dishes: [
        { kind: 'soup', items: [tokenOf(T)], order: 'strict' },
        { kind: 'stew', items: [tokenOf(C)], order: 'strict' },
      ] }],
      tiles: [{ id: 0, x: 0, y: 0, dir: 0, ing: C }, { id: 1, x: 1, y: 0, dir: 0, ing: T }],
    };
    const sim = Sim.fromLevel(lv);
    expect(sim.legalMoves()).toEqual([1]);
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(1, ev);
    expect(ev.some((e) => e.t === 'dish' && !e.last)).toBe(true);
    expect(sim.legalMoves()).toEqual([0]);
    sim.apply(0);
    expect(sim.status).toBe('won');
  });

  it('a lid keeps a pot closed until the other pot is served', () => {
    const lv = workedExample();
    lv.pots[1].lid = 0; // the stew opens after the soup
    const sim = Sim.fromLevel(lv);
    expect(sim.wouldDeliver(2)).toBe(false);
    sim.apply(2); // the carrot has to wait in the bowl
    expect(sim.bowlLen).toBe(1);
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(1);
    sim.apply(0, ev);
    expect(ev.some((e) => e.t === 'lid' && e.pot === 1)).toBe(true);
    expect(sim.status).toBe('won');
  });

  it('wild spice counts as whatever the pot needs next', () => {
    const lv = workedExample();
    lv.tiles[1] = { id: 1, x: 0, y: 1, dir: 0, ing: WILD_ING };
    const sim = play(lv, [1, 0, 2]);
    expect(sim.status).toBe('won');
  });
});

describe('board mechanics', () => {
  it('a stacked tile waits under the top one and keeps its cell blocked', () => {
    const lv: LevelDef = {
      n: 0, w: 2, h: 2, rules: { ...BASE_RULES },
      pots: [
        { side: 0, from: 0, to: 2, dishes: [{ kind: 'soup', items: [tokenOf(O), tokenOf(G)], order: 'strict' }] },
        { side: 1, from: 0, to: 2, dishes: [{ kind: 'stew', items: [tokenOf(C)], order: 'strict' }] },
      ],
      tiles: [
        { id: 0, x: 1, y: 0, dir: 1, ing: C, z: 0 },
        { id: 1, x: 1, y: 0, dir: 0, ing: O, z: 1 },
        { id: 2, x: 1, y: 1, dir: 0, ing: G },
      ],
    };
    const sim = Sim.fromLevel(lv);
    expect(sim.check(0)).toBe('under');
    expect(sim.check(2)).toBe('blocked');
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(1, ev);
    expect(ev.some((e) => e.t === 'reveal' && e.tile === 0)).toBe(true);
    expect(sim.check(2)).toBe('blocked'); // the carrot still sits there
    sim.apply(0);
    sim.apply(2);
    expect(sim.status).toBe('won');
  });

  it('a frozen tile thaws when a neighbour leaves', () => {
    const lv = workedExample();
    lv.tiles[2].frozen = true; // carrot at (2,1); its neighbour is the onion? No: (1,1) is empty.
    lv.tiles[0] = { id: 0, x: 2, y: 0, dir: 0, ing: T }; // tomato above the carrot
    const sim = Sim.fromLevel(lv);
    expect(sim.check(2)).toBe('frozen');
    sim.apply(1);
    expect(sim.check(2)).toBe('frozen');
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(0, ev);
    expect(ev.some((e) => e.t === 'thaw' && e.tile === 2)).toBe(true);
    expect(sim.check(2)).toBe('ok');
  });

  it('a pad turns the lane', () => {
    const g = makeGeometry(3, 3, [
      { side: 0, from: 0, to: 3, dishes: [] },
      { side: 1, from: 0, to: 3, dishes: [] },
    ], [{ x: 1, y: 1, dir: 1 }]);
    const p = tracePath(g, 0, 1, 1); // right from (0,1): over the pad, keeps going right
    expect(p.pot).toBe(1);
    const q = tracePath(g, 1, 2, 0); // up from (1,2) onto the pad at (1,1): turns right
    expect(q.cells).toEqual([4, 5]);
    expect(q.pot).toBe(1);
    expect(q.turns).toBe(1);
  });

  it('crossing a knife bar chops the ingredient', () => {
    const lv = workedExample();
    lv.bars = [{ kind: 'knife', axis: 'h', at: 1, from: 0, to: 3 }]; // between rows 0 and 1
    lv.pots[0].dishes[0].items = [tokenOf(O, FORM_CHOPPED), tokenOf(T)];
    const sim = Sim.fromLevel(lv);
    expect(sim.tileToken(1)).toBe(tokenOf(O, FORM_CHOPPED));
    expect(sim.tileToken(0)).toBe(tokenOf(T)); // starts above the bar
    sim.apply(1);
    sim.apply(0);
    sim.apply(2);
    expect(sim.status).toBe('won');
  });
});

describe('state keys', () => {
  it('reaching the same position in different orders gives the same key', () => {
    const lv = workedExample();
    const a = play(lv, [1, 2]);
    const b = play(lv, [2, 1]);
    expect(a.key()).toBe(b.key());
    expect(a.key()).not.toBe(Sim.fromLevel(lv).key());
  });

  it('clones are independent', () => {
    const sim = Sim.fromLevel(workedExample());
    const c = sim.clone();
    c.apply(1);
    expect(sim.left).toBe(3);
    expect(c.left).toBe(2);
  });
});

describe('cloches, timers and tied tiles', () => {
  it('a cloche hides a tile until a neighbour leaves', () => {
    const lv = workedExample();
    lv.tiles[0] = { id: 0, x: 1, y: 1, dir: 0, ing: T, hidden: true }; // tomato between the onion and the carrot
    const sim = Sim.fromLevel(lv);
    expect(sim.isCovered(0)).toBe(true);
    expect(sim.check(0)).toBe('covered');
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(1, ev); // the onion next to it leaves
    expect(ev.some((e) => e.t === 'uncover' && e.tile === 0)).toBe(true);
    expect(sim.check(0)).toBe('ok');
  });

  it('a timer tile waits for enough deliveries', () => {
    const lv = workedExample();
    lv.tiles[2] = { ...lv.tiles[2], timer: 2 }; // the carrot opens after two deliveries
    const sim = Sim.fromLevel(lv);
    expect(sim.check(2)).toBe('timer');
    expect(sim.timerLeft(2)).toBe(2);
    sim.apply(1);
    expect(sim.check(2)).toBe('timer');
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(0, ev);
    expect(ev.some((e) => e.t === 'unlock' && e.tile === 2)).toBe(true);
    sim.apply(2);
    expect(sim.status).toBe('won');
  });

  it('tied tiles leave together, the tapped one first', () => {
    // Soup wants onion then tomato; both tiles point up and are tied.
    const lv: LevelDef = {
      n: 0, w: 2, h: 1, rules: { ...BASE_RULES, bowl: 0 },
      pots: [{ side: 0, from: 0, to: 2, dishes: [{ kind: 'soup', items: [tokenOf(O), tokenOf(T)], order: 'strict' }] }],
      tiles: [{ id: 0, x: 0, y: 0, dir: 0, ing: T, link: 1 }, { id: 1, x: 1, y: 0, dir: 0, ing: O, link: 1 }],
    };
    const sim = Sim.fromLevel(lv);
    // Tomato first would need the bowl (there is none): not allowed. Onion first works for both.
    expect(sim.check(0)).toBe('full');
    expect(sim.check(1)).toBe('ok');
    expect(sim.legalMoves()).toEqual([1]);
    const ev: Parameters<Sim['apply']>[1] = [];
    sim.apply(1, ev);
    expect(ev.filter((e) => e.t === 'slide').map((e) => (e as { tile: number }).tile)).toEqual([1, 0]);
    expect(sim.status).toBe('won');
  });

  it('a tied tile can\'t go if its partner is blocked', () => {
    const lv: LevelDef = {
      n: 0, w: 2, h: 2, rules: { ...BASE_RULES },
      pots: [{ side: 0, from: 0, to: 2, dishes: [{ kind: 'soup', items: [tokenOf(O), tokenOf(T), tokenOf(C)], order: 'strict' }] }],
      tiles: [
        { id: 0, x: 0, y: 0, dir: 0, ing: O, link: 3 },
        { id: 1, x: 1, y: 0, dir: 0, ing: C },
        { id: 2, x: 1, y: 1, dir: 0, ing: T, link: 3 },
      ],
    };
    const sim = Sim.fromLevel(lv);
    expect(sim.check(0)).toBe('partner'); // the tomato behind the carrot can't follow
    expect(sim.check(1)).toBe('ok'); // the carrot parks in the bowl
    sim.apply(1);
    sim.apply(0); // onion, then the tomato follows; the carrot comes out of the bowl last
    expect(sim.status).toBe('won');
  });
});
