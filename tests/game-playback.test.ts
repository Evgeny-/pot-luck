import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game, type GameCallbacks } from '../src/game/Game';
import { BASE_RULES, tokenOf, type LevelDef } from '../src/core/types';
import { C, O, T, workedExample } from './fixtures';

// Finishing a flight is under the test's control, independently of the game clock.
const playback = vi.hoisted(() => ({ finishes: [] as (() => void)[] }));
vi.mock('../src/audio/audio', () => ({ audio: { play: vi.fn() } }));
vi.mock('../src/view/BoardView', () => ({
  BoardView: class {
    play = vi.fn(() => new Promise<void>((resolve) => playback.finishes.push(resolve)));
    sync = vi.fn();
    dispose = vi.fn();
    hideLane = vi.fn();
    showLane = vi.fn();
    hint = vi.fn();
    nudge = vi.fn();
    flashBowl = vi.fn();
  },
}));

function kitchen(level = workedExample()): { game: Game; cb: GameCallbacks } {
  const cb = { won: vi.fn(), stuck: vi.fn(), changed: vi.fn(), say: vi.fn() };
  return { game: new Game({} as HTMLElement, level, cb), cb };
}

function jarTrap(): LevelDef {
  return {
    n: 0, w: 3, h: 1, rules: { ...BASE_RULES, bowl: 2, bowlOrder: 'lifo' },
    pots: [{ side: 0, from: 0, to: 3, dishes: [{ kind: 'soup', items: [tokenOf(O), tokenOf(T), tokenOf(C)], order: 'strict' }] }],
    tiles: [
      { id: 0, x: 0, y: 0, dir: 0, ing: C },
      { id: 1, x: 1, y: 0, dir: 0, ing: T },
      { id: 2, x: 2, y: 0, dir: 0, ing: O },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  playback.finishes.length = 0;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('game outcomes wait for visible delivery', () => {
  it.each(['won', 'stuck'] as const)('%s opens only after the last flight and its pause', async (outcome) => {
    const { game, cb } = kitchen(outcome === 'won' ? workedExample() : jarTrap());
    [1, 0, 2].forEach((id) => game.tap(id));
    expect(game.sim.status).toBe(outcome);
    await vi.advanceTimersByTimeAsync(5000);
    expect(cb.won).not.toHaveBeenCalled();
    expect(cb.stuck).not.toHaveBeenCalled();
    playback.finishes.forEach((finish) => finish());
    const pause = outcome === 'won' ? 500 : 300;
    await vi.advanceTimersByTimeAsync(pause - 1);
    expect(cb[outcome]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(cb[outcome]).toHaveBeenCalledOnce();
    if (outcome === 'won') expect(cb.won).toHaveBeenCalledWith(3, 0);
  });

  for (const action of ['undo', 'restart', 'dispose'] as const) {
    it.each([
      ['won', 'flight'], ['won', 'pause'], ['stuck', 'flight'], ['stuck', 'pause'],
    ] as const)(`${action} cancels a stale %s outcome during its %s`, async (outcome, phase) => {
      const { game, cb } = kitchen(outcome === 'won' ? workedExample() : jarTrap());
      [1, 0, 2].forEach((id) => game.tap(id));
      expect(game.sim.status).toBe(outcome);
      if (phase === 'pause') {
        playback.finishes.forEach((finish) => finish());
        await vi.advanceTimersByTimeAsync(0);
      }
      game[action]();
      playback.finishes.forEach((finish) => finish());
      await vi.advanceTimersByTimeAsync(5000);
      expect(cb.won).not.toHaveBeenCalled();
      expect(cb.stuck).not.toHaveBeenCalled();
    });
  }

  it('undo allows a new winning move without reopening the old win', async () => {
    const { game, cb } = kitchen();
    [1, 0, 2].forEach((id) => game.tap(id));
    game.undo();
    game.tap(2);
    playback.finishes[3]();
    await vi.advanceTimersByTimeAsync(500);
    expect(cb.won).toHaveBeenCalledOnce();
    playback.finishes.slice(0, 3).forEach((finish) => finish());
    await vi.advanceTimersByTimeAsync(5000);
    expect(cb.won).toHaveBeenCalledOnce();
  });
});

describe('auto solving follows completed flights', () => {
  it('waits for each flight before starting the next move', async () => {
    const { game, cb } = kitchen();
    game.autoSolve();
    expect(game.view.play).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(game.view.play).toHaveBeenCalledTimes(1);
    for (let move = 0; move < 2; move++) {
      playback.finishes[move]();
      await vi.advanceTimersByTimeAsync(99);
      expect(game.view.play).toHaveBeenCalledTimes(move + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(game.view.play).toHaveBeenCalledTimes(move + 2);
    }
    expect(game.sim.status).toBe('won');
    expect(cb.won).not.toHaveBeenCalled();
    playback.finishes[2]();
    await vi.advanceTimersByTimeAsync(500);
    expect(cb.won).toHaveBeenCalledOnce();
  });

  it.each(['undo', 'restart', 'dispose'] as const)('%s stops an auto run with an unfinished flight', async (action) => {
    const { game, cb } = kitchen();
    game.autoSolve();
    game[action]();
    playback.finishes[0]();
    await vi.advanceTimersByTimeAsync(5000);
    expect(game.view.play).toHaveBeenCalledTimes(1);
    expect(cb.won).not.toHaveBeenCalled();
  });

  it('a manual tap stops the old auto run after its flight', async () => {
    const { game } = kitchen();
    game.autoSolve();
    game.tap(game.sim.legalMoves()[0]);
    expect(game.view.play).toHaveBeenCalledTimes(2);
    playback.finishes.forEach((finish) => finish());
    await vi.advanceTimersByTimeAsync(5000);
    expect(game.view.play).toHaveBeenCalledTimes(2);
  });

  it('starting auto solve again replaces the previous run', async () => {
    const { game } = kitchen();
    game.autoSolve();
    game.autoSolve();
    expect(game.view.play).toHaveBeenCalledTimes(2);
    playback.finishes[0]();
    await vi.advanceTimersByTimeAsync(5000);
    expect(game.view.play).toHaveBeenCalledTimes(2);
    playback.finishes[1]();
    await vi.advanceTimersByTimeAsync(100);
    expect(game.view.play).toHaveBeenCalledTimes(3);
  });
});
