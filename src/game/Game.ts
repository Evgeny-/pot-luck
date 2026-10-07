import { audio } from '../audio/audio';
import { Sim, isBowlMove, type SimEvent } from '../core/sim';
import { solve } from '../core/solver';
import type { LevelDef } from '../core/types';
import { BoardView } from '../view/BoardView';

export interface GameCallbacks {
  won(stars: number, parks: number): void;
  stuck(): void;
  changed(): void;
  say(text: string): void;
}

/** Bowl uses → stars: a perfect cook (par or better) earns three. */
export function starsFor(parks: number, par: number): number {
  if (parks <= par) return 3;
  if (parks <= par + 2) return 2;
  return 1;
}

/**
 * Drives one level: taps go to the simulation, its events to the view. Undo restores snapshots;
 * the hint asks the solver for a winning move from the current position.
 */
export class Game {
  readonly level: LevelDef;
  sim: Sim;
  private history: Sim[] = [];
  readonly view: BoardView;
  private cb: GameCallbacks;
  private busy = 0;
  private autoTimer = 0;
  hintsUsed = 0;
  undos = 0;

  constructor(stage: HTMLElement, level: LevelDef, cb: GameCallbacks) {
    this.level = level;
    this.cb = cb;
    this.sim = Sim.fromLevel(level);
    this.view = new BoardView(stage, this.sim, {
      press: (id) => this.press(id),
      release: () => this.view.hideLane(),
      tap: (id) => this.tap(id),
    });
    this.view.sync(this.sim, true);
  }

  dispose(): void {
    clearTimeout(this.autoTimer);
    this.view.dispose();
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  private press(id: number): void {
    const c = this.sim.check(id);
    if (c === 'ok') this.view.showLane(id, this.sim.wouldDeliver(id) ? 'ok' : 'bowl');
    else if (c === 'full') this.view.showLane(id, 'bowl');
    else if (c === 'blocked') this.view.showLane(id, 'blocked', this.sim.blockedAt(id));
    audio.play('tap', { volume: 0.5 });
  }

  tap(id: number): void {
    if (this.sim.status !== 'playing') return;
    this.view.hint(null);
    const c = this.sim.check(id);
    if (c !== 'ok') {
      this.view.shake(id);
      audio.play('invalid');
      if (c === 'full') {
        this.view.flashBowl();
        this.cb.say(this.level.rules.bowl ? 'The bowl is full — that pot doesn\'t want it yet' : 'That pot doesn\'t want it yet');
      } else if (c === 'frozen') this.cb.say('Frozen! Clear a tile next to it first');
      else if (c === 'wall') this.cb.say('That way is a wall');
      return;
    }
    this.move(id);
  }

  private move(m: number): void {
    this.history.push(this.sim.clone());
    const ev: SimEvent[] = [];
    this.sim.apply(m, ev);
    this.busy++;
    const done = this.view.play(ev, this.sim);
    this.cb.changed();
    if (this.sim.status === 'won') {
      done.then(() => setTimeout(() => this.cb.won(starsFor(this.sim.parks, this.level.stats?.par ?? 0), this.sim.parks), 500));
      audio.play('win');
      return;
    }
    if (this.sim.checkStuck()) {
      done.then(() => setTimeout(() => this.cb.stuck(), 300));
    }
    done.then(() => this.busy--);
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.undos++;
    this.sim = prev;
    this.sim.unstick();
    this.view.hideLane();
    this.view.hint(null);
    this.view.sync(this.sim, true);
    audio.play('undo');
    this.cb.changed();
    return true;
  }

  restart(): void {
    clearTimeout(this.autoTimer);
    this.sim = Sim.fromLevel(this.level);
    this.history = [];
    this.view.hint(null);
    this.view.sync(this.sim, true);
    this.cb.changed();
  }

  /** Highlights a winning move, or says how far back the position went wrong. */
  hint(): void {
    this.hintsUsed++;
    audio.play('hint');
    const res = solve(this.sim, 80000);
    if (res.status === 'solved' && res.moves.length) {
      const m = res.moves[0];
      if (!isBowlMove(m)) {
        this.view.hint(m);
        this.press(m);
        setTimeout(() => this.view.hideLane(), 1200);
      }
      return;
    }
    if (res.status === 'unsolvable') {
      // How many undos until the position can be won again?
      for (let k = this.history.length - 1, back = 1; k >= 0; k--, back++) {
        if (solve(this.history[k], 20000).status === 'solved') {
          this.cb.say(`This kitchen can't be finished anymore. Undo ${back} move${back > 1 ? 's' : ''}.`);
          return;
        }
      }
      this.cb.say('This kitchen can\'t be finished anymore. Try a restart.');
    } else this.cb.say('Hmm, even the chef is thinking… try something!');
  }

  /** Debug: plays a solution from the current position. */
  autoSolve(): void {
    const res = solve(this.sim, 200000);
    if (res.status !== 'solved') {
      this.cb.say('No solution from here');
      return;
    }
    const moves = res.moves.slice();
    const step = () => {
      const m = moves.shift();
      if (m === undefined || this.sim.status !== 'playing') return;
      this.move(m);
      this.autoTimer = window.setTimeout(step, 520);
    };
    step();
  }
}
