import { audio } from '../audio/audio';
import { Sim, isBowlMove, type SimEvent } from '../core/sim';
import { solve } from '../core/solver';
import type { LevelDef } from '../core/types';
import { BoardView } from '../view/BoardView';
import { starsFor } from './stars';
export { starsFor } from './stars';

export interface GameCallbacks {
  won(stars: number, parks: number): void;
  stuck(): void;
  changed(): void;
  say(text: string): void;
  bowlInfo?(uses: number): void;
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
  private autoTimer = 0;
  private autoRun = 0;
  private revision = 0;
  private outcomeTimer = 0;
  private hintTimer = 0;
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
      bowlInfo: (uses) => this.cb.bowlInfo?.(uses),
    });
    this.view.sync(this.sim, true);
  }

  dispose(): void {
    this.cancelCallbacks();
    this.view.dispose();
  }

  private stopAuto(): void {
    clearTimeout(this.autoTimer);
    this.autoRun++;
  }

  /** Undo, restart and leaving the kitchen invalidate callbacks from the old position. */
  private cancelCallbacks(): void {
    this.revision++;
    this.stopAuto();
    clearTimeout(this.outcomeTimer);
    clearTimeout(this.hintTimer);
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  private press(id: number): void {
    const c = this.sim.check(id);
    const partner = this.sim.partnerOf(id);
    const mate = partner >= 0 && this.sim.present[partner] ? partner : -1;
    if (c === 'ok') this.view.showLane(id, this.sim.wouldDeliver(id) ? 'ok' : 'bowl', -1, mate);
    else if (c === 'full') this.view.showLane(id, 'bowl', -1, mate);
    else if (c === 'blocked') this.view.showLane(id, 'blocked', this.sim.blockedAt(id), mate);
    else if (c === 'partner') this.view.showLane(id, 'ok', -1, -1);
    audio.play('press', { volume: 0.7 });
  }

  tap(id: number): void {
    if (this.sim.status !== 'playing') return;
    this.stopAuto();
    this.view.hint(null);
    const c = this.sim.check(id);
    if (c !== 'ok') {
      this.view.nudge(id);
      if (c === 'full') {
        this.view.flashBowl();
        audio.play('full');
        const jar = this.level.rules.bowlOrder === 'lifo';
        this.cb.say(!this.level.rules.bowl ? 'That pot doesn\'t want it yet' : jar ? 'The jar is full: that pot doesn\'t want it yet' : 'The bowl is full: that pot doesn\'t want it yet');
        return;
      }
      audio.play('blocked');
      if (c === 'frozen') this.cb.say('Frozen! Clear a tile next to it first');
      else if (c === 'covered') this.cb.say('Under the cloche: clear a tile next to it to lift it');
      else if (c === 'timer') this.cb.say(`Still marinating: ${this.sim.timerLeft(id)} more ingredient${this.sim.timerLeft(id) === 1 ? '' : 's'} into the pots`);
      else if (c === 'partner') this.cb.say('Tied together: its partner can\'t follow right now');
      else if (c === 'wall') this.cb.say('That way is a wall');
      return;
    }
    this.move(id);
  }

  private move(m: number): Promise<void> {
    this.history.push(this.sim.clone());
    const ev: SimEvent[] = [];
    this.sim.apply(m, ev);
    const revision = this.revision;
    const won = this.sim.status === 'won';
    const stuck = !won && this.sim.checkStuck();
    const parks = this.sim.parks;
    const done = this.view.play(ev, this.sim);
    this.cb.changed();
    return done.then(() => {
      if (revision !== this.revision) return;
      if (won) {
        audio.play('win');
        this.outcomeTimer = window.setTimeout(() => {
          if (revision === this.revision) this.cb.won(starsFor(parks, this.level.stats?.par ?? 0), parks);
        }, 500);
      } else if (stuck) {
        this.outcomeTimer = window.setTimeout(() => {
          if (revision === this.revision) this.cb.stuck();
        }, 300);
      }
    });
  }

  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.cancelCallbacks();
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
    this.cancelCallbacks();
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
        clearTimeout(this.hintTimer);
        this.hintTimer = window.setTimeout(() => this.view.hideLane(), 1200);
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
    this.stopAuto();
    const res = solve(this.sim, 200000);
    if (res.status !== 'solved') {
      this.cb.say('No solution from here');
      return;
    }
    const moves = res.moves.slice();
    const run = this.autoRun;
    const step = async () => {
      if (run !== this.autoRun) return;
      const m = moves.shift();
      if (m === undefined || this.sim.status !== 'playing') return;
      await this.move(m);
      if (run === this.autoRun && this.sim.status === 'playing') this.autoTimer = window.setTimeout(step, 100);
    };
    step();
  }
}
