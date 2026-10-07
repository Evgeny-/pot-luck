import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sim, type SimEvent } from '../src/core/sim';
import { BoardView } from '../src/view/BoardView';
import { geometryOf } from '../src/core/board';
import { O, T, workedExample } from './fixtures';
import { tokenOf } from '../src/core/types';

vi.mock('../src/audio/audio', () => ({ audio: { play: vi.fn() } }));

interface PlaybackHarness {
  play: BoardView['play'];
  shown: Sim;
  sim: Sim;
  epoch: number;
  disposed: boolean;
  playQueue: Promise<void>;
  animations: Set<Animation>;
  timers: Map<number, (() => void) | undefined>;
  slide: (event: SimEvent) => Promise<boolean>;
  fly: (slot: number, pot: number, token: number, item: number) => Promise<boolean>;
  cancelPlayback(): void;
}

/** Exercise the real playback scheduler while controlling only the physical flight completions. */
function harness(sim: Sim) {
  const finishes: (() => void)[] = [];
  const view = Object.assign(Object.create(BoardView.prototype), {
    sim, shown: sim.clone(), epoch: 0, disposed: false, playQueue: Promise.resolve(),
    animations: new Set<Animation>(), timers: new Map(), fresh: new Set(), laneEls: [], potEls: [],
    bowlEl: { querySelector: () => null, classList: { remove: vi.fn() } }, potParts: [{ plate: { querySelector: () => null } }, { plate: { querySelector: () => null } }],
    root: { querySelectorAll: () => [] },
    renderTwine: vi.fn(), renderPots: vi.fn(), renderBowl: vi.fn(), refreshTiles: vi.fn(), serve: vi.fn(), confetti: vi.fn(), land: vi.fn(), targetOf: vi.fn(), centerOf: () => [0, 0],
  }) as PlaybackHarness;
  const flight = () => new Promise<boolean>((resolve) => {
    const animation = { cancel: () => resolve(false) } as Animation;
    view.animations.add(animation);
    finishes.push(() => { view.animations.delete(animation); resolve(true); });
  });
  view.slide = vi.fn(flight);
  view.fly = vi.fn((slot) => {
    view.shown.bowlTok[slot] = -1;
    view.shown.bowlLen--;
    return flight();
  });
  return { view, finishes };
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('board deliveries follow the visible food', () => {
  it('adds a parked ingredient only once it lands', async () => {
    const sim = Sim.fromLevel(workedExample());
    const { view, finishes } = harness(sim);
    const events: SimEvent[] = [];
    sim.apply(0, events);
    const done = view.play(events, sim);
    await vi.advanceTimersByTimeAsync(0);
    expect(sim.bowlLen).toBe(1);
    expect(view.shown.bowlLen).toBe(0);
    finishes[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.shown.bowlTok[0]).toBe(tokenOf(T));
    await vi.advanceTimersByTimeAsync(120);
    await done;
  });

  it('keeps a jar item visible until its automatic departure and ticks it after landing', async () => {
    const sim = Sim.fromLevel(workedExample({ bowlOrder: 'lifo' }));
    sim.apply(0);
    const { view, finishes } = harness(sim);
    const events: SimEvent[] = [];
    sim.apply(1, events);
    const done = view.play(events, sim);
    await vi.advanceTimersByTimeAsync(0);
    expect(sim.bowlLen).toBe(0);
    expect(view.shown.bowlTok[0]).toBe(tokenOf(T));
    expect(view.shown.potGot[0]).toBe(0);
    finishes[0]();
    await vi.advanceTimersByTimeAsync(89);
    expect(view.shown.potGot[0]).toBe(1);
    expect(view.shown.bowlLen).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(view.fly).toHaveBeenCalledWith(0, 0, tokenOf(T), 1);
    expect(view.shown.bowlLen).toBe(0);
    expect(view.shown.potGot[0]).toBe(1);
    finishes[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.shown.potGot[0]).toBe(3);
    await vi.advanceTimersByTimeAsync(230);
    await done;
    expect(view.shown.potDone(0)).toBe(true);
  });

  it('queues rapid taps without reading the later move as the earlier landing state', async () => {
    const sim = Sim.fromLevel(workedExample());
    const { view, finishes } = harness(sim);
    const first: SimEvent[] = []; const second: SimEvent[] = [];
    sim.apply(0, first);
    const done1 = view.play(first, sim);
    sim.apply(1, second);
    const done2 = view.play(second, sim);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.slide).toHaveBeenCalledOnce();
    finishes[0]();
    await vi.advanceTimersByTimeAsync(120);
    await done1;
    expect(view.slide).toHaveBeenCalledTimes(2);
    expect(view.shown.bowlTok[0]).toBe(tokenOf(T));
    expect(view.shown.potGot[0]).toBe(0);
    finishes[1]();
    await vi.advanceTimersByTimeAsync(90);
    finishes[2]();
    await vi.advanceTimersByTimeAsync(230);
    await done2;
    expect(view.shown.bowlLen).toBe(0);
    expect(view.shown.potDone(0)).toBe(true);
  });

  it('cancels both the current flight and queued move when undo or resize replaces the board', async () => {
    const sim = Sim.fromLevel(workedExample());
    const before = sim.clone();
    const { view, finishes } = harness(sim);
    const first: SimEvent[] = []; const second: SimEvent[] = [];
    sim.apply(0, first); const done1 = view.play(first, sim);
    sim.apply(1, second); const done2 = view.play(second, sim);
    await vi.advanceTimersByTimeAsync(0);
    view.cancelPlayback();
    view.shown = before;
    finishes[0]();
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([done1, done2]);
    expect(view.slide).toHaveBeenCalledOnce();
    expect(view.fly).not.toHaveBeenCalled();
    expect(view.shown.bowlLen).toBe(0);
    expect(view.shown.present).toEqual(before.present);
    expect(view.shown.wants(0)).toEqual([tokenOf(O)]);
  });
});

describe('the recipe ingredient is the physical flight destination', () => {
  it.each(['slide', 'bowl'] as const)('%s lands on the matching ingredient rather than the dish picture', async (source) => {
    const level = workedExample();
    level.pots[0].dishes.push({ kind: 'pasta', items: [tokenOf(T)], order: 'strict' });
    const sim = Sim.fromLevel(level);
    const records: { name: string; frames: Keyframe[] }[] = [];
    function element(name: string, left: number, top: number, width: number, height = width) {
      return {
        clientWidth: width, clientHeight: height, style: {} as Record<string, string>,
        classList: { add: vi.fn(), remove: vi.fn() }, append: vi.fn(), remove: vi.fn(), setAttribute: vi.fn(), querySelector: (_selector: string): unknown => null,
        getBoundingClientRect: () => ({ left, top, width, height }), getAnimations: (): { cancel(): void }[] => [],
        animate: (frames: Keyframe[]) => { records.push({ name, frames }); return { finished: Promise.resolve(), cancel: vi.fn() }; },
      };
    }
    const root = element('root', 0, 0, 800);
    const plate = element('dish', 100, 20, 50);
    const current = element('current ingredient', 450, 50, 36);
    const promoted = element('next dish ingredient', 600, 50, 36);
    const slot = element('slot', 40, 440, 80);
    const bouncingPicture = element('stored food', 45.04, 439.04, 69.92);
    slot.querySelector = (selector) => selector === '.s-icon' ? bouncingPicture : null;
    const body = element('tile body', 0, 0, 88);
    const icon = element('tile icon', 0, 0, 53);
    const tile = element('tile', 0, 0, 100);
    const entryAnimation = { cancel: vi.fn() };
    tile.getAnimations = () => [entryAnimation];
    tile.querySelector = (selector) => selector === '.tile-body' ? body : selector === '.tile-icon' ? icon : null;
    const bowl = element('bowl', 20, 420, 100);
    bowl.querySelector = () => slot;
    const strip = {
      querySelector: (selector: string) => selector.includes('data-dish="0"') && selector.includes('data-item="1"') ? current : selector.includes('data-dish="1"') && selector.includes('data-item="0"') ? promoted : null,
    };
    vi.stubGlobal('document', { createElement: () => element('food', 0, 0, 61) });
    const view = Object.assign(Object.create(BoardView.prototype), {
      level, g: geometryOf(level), shown: sim.clone(), sim, root, bowlEl: bowl, cell: 100, spot: 80, ox: 100, oy: 100,
      tiles: new Map([[0, tile]]), potParts: [{ plate, strip }], animations: new Set(), timers: new Map(), renderBowl: vi.fn(),
    }) as PlaybackHarness;
    view.shown.potGot[0] = 1;
    if (source === 'slide') {
      await view.slide({ t: 'slide', tile: 0, cells: [], pot: 0, into: 'pot', token: tokenOf(T), item: 1, slot: -1 });
      expect(entryAnimation.cancel).toHaveBeenCalledOnce();
    } else {
      // After a dish changes, item zero must resolve in the promoted recipe, not the old one.
      view.shown.potDish[0] = 1;
      view.shown.bowlTok[0] = tokenOf(T);
      view.shown.bowlLen = 1;
      await view.fly(0, 0, tokenOf(T), 0);
    }
    const motion = records.find((record) => record.name === (source === 'slide' ? 'tile' : 'food'))!;
    const final = motion.frames.at(-1)!;
    const translated = /translate\(([^p]+)px, ([^p]+)px\)/.exec(String(final.transform))!;
    const foodAnchor = source === 'slide' ? [50, 48.24] : [34.96, 34.96];
    const expected = source === 'slide' ? [468, 68] : [618, 68];
    expect(Number(translated[1]) + foodAnchor[0]).toBeCloseTo(expected[0]);
    expect(Number(translated[2]) + foodAnchor[1]).toBeCloseTo(expected[1]);
    if (source === 'bowl') {
      const start = /translate\(([^p]+)px, ([^p]+)px\)/.exec(String(motion.frames[0].transform))!;
      expect(Number(start[1]) + foodAnchor[0]).toBeCloseTo(80);
      expect(Number(start[2]) + foodAnchor[1]).toBeCloseTo(474);
    }
    expect(final.opacity).toBeCloseTo(0);
    expect(records.some((record) => record.name === 'dish')).toBe(false);
  });
});
