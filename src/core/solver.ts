import { Rng } from './rng';
import { Sim, isBowlMove } from './sim';
import { WILD, type LevelDef } from './types';

export interface SolveResult {
  status: 'solved' | 'unsolvable' | 'unknown';
  moves: number[];
  nodes: number;
}

// ---------------------------------------------------------------- heuristics

interface Static {
  /** For each tile: tiles whose lane runs through its cell (it blocks them). */
  blocks: Int16Array[];
}

const statics = new WeakMap<object, Static>();

function staticsOf(sim: Sim): Static {
  let st = statics.get(sim.s);
  if (!st) {
    const T = sim.tileCount;
    const lists: number[][] = Array.from({ length: T }, () => []);
    for (let j = 0; j < T; j++) {
      const path = sim.tilePath(j);
      for (let k = 0; k < path.length; k++) {
        const c = path[k];
        for (let i = 0; i < T; i++) if (i !== j && sim.tileCell(i) === c && !lists[i].includes(j)) lists[i].push(j);
      }
    }
    st = { blocks: lists.map((l) => Int16Array.from(l)) };
    statics.set(sim.s, st);
  }
  return st;
}

/** Deliveries a pot is away from wanting token t; for router bowls, the closest pot counts. */
export function needDistance(sim: Sim, tile: number): number {
  const tok = sim.tileToken(tile);
  if (sim.s.rules.bowlMode === 'hold') return sim.distanceTo(sim.tilePot(tile), tok);
  if (tok === WILD) return 0;
  let best = Infinity;
  for (let p = 0; p < sim.potCount; p++) best = Math.min(best, sim.distanceTo(p, tok));
  return best;
}

/** Would tile j's lane be clear if tile i were gone? */
function freedBy(sim: Sim, i: number, j: number): boolean {
  if (!sim.present[j] || !sim.isTop(j) || sim.isFrozen(j)) return false;
  const ci = sim.tileCell(i);
  if (sim.occ[ci] > 1) return false; // something stays underneath
  const path = sim.tilePath(j);
  const own = sim.tileCell(j);
  for (let k = 0; k < path.length; k++) {
    const c = path[k];
    if (c === ci) continue;
    if (sim.occ[c] > (c === own ? 1 : 0)) return false;
  }
  return true;
}

/**
 * How promising a legal move looks: deliveries first (more so when they free a tile that is wanted
 * right now), then parking moves whose ingredient is needed soon and that free something useful.
 */
export function moveScore(sim: Sim, m: number): number {
  if (isBowlMove(m)) return 6000;
  const st = staticsOf(sim);
  let freeWanted = 0;
  let freeAny = 0;
  let soon = 0;
  for (const j of st.blocks[m]) {
    if (!freedBy(sim, m, j)) continue;
    freeAny++;
    if (sim.wouldDeliver(j)) freeWanted++;
    else soon = Math.max(soon, 4 - Math.min(4, needDistance(sim, j)));
  }
  // A stacked tile reveals the one below.
  const below = sim.s.below[m];
  if (below >= 0 && sim.present[below]) {
    freeAny++;
    if (sim.blockedAt(below) < 0 && sim.wouldDeliver(below)) freeWanted++;
  }
  if (sim.wouldDeliver(m)) return 3000 + freeWanted * 60 + freeAny * 12 + soon * 4;
  const need = needDistance(sim, m);
  const room = sim.bowlCap - sim.bowlLen;
  return 1000 - Math.min(need, 12) * 60 + freeWanted * 150 + freeAny * 25 + soon * 20 - (room <= 1 ? 200 : 0);
}

// ---------------------------------------------------------------- exact search

/**
 * Depth-first search over moves with a memo of failed positions, trying promising moves first.
 * Returns 'unknown' when the node budget runs out.
 */
export function solve(start: Sim, maxNodes = 60000): SolveResult {
  const failed = new Set<string>();
  const path: number[] = [];
  let nodes = 0;
  let aborted = false;
  const buf: number[][] = [];

  const dfs = (sim: Sim, depth: number): boolean => {
    if (sim.status === 'won') return true;
    const key = sim.key();
    if (failed.has(key)) return false;
    if (++nodes > maxNodes) {
      aborted = true;
      return false;
    }
    const moves = sim.legalMoves(buf[depth] ?? (buf[depth] = []));
    if (!moves.length) {
      failed.add(key);
      return false;
    }
    const scored = moves.map((m) => [m, moveScore(sim, m)] as const).sort((a, b) => b[1] - a[1]);
    for (const [m] of scored) {
      const next = sim.clone();
      next.apply(m);
      path.push(m);
      if (dfs(next, depth + 1)) return true;
      path.pop();
      if (aborted) return false;
    }
    failed.add(key);
    return false;
  };

  const root = start.clone();
  root.unstick();
  const ok = dfs(root, 0);
  return { status: ok ? 'solved' : aborted ? 'unknown' : 'unsolvable', moves: ok ? path.slice() : [], nodes };
}

/**
 * Fewest bowl uses of any solution (branch and bound), and a solution that achieves it.
 * `exact` is false when the budget ran out (the result is then only an upper bound).
 */
export function minParks(start: Sim, maxNodes = 40000, upper = Infinity): { parks: number; moves: number[]; exact: boolean } {
  const seen = new Map<string, number>();
  const path: number[] = [];
  let best = upper;
  let bestMoves: number[] = [];
  let nodes = 0;
  let aborted = false;
  const dfs = (sim: Sim): void => {
    if (sim.status === 'won') {
      if (sim.parks < best) {
        best = sim.parks;
        bestMoves = path.slice();
      }
      return;
    }
    if (sim.parks >= best) return;
    const key = sim.key();
    const prev = seen.get(key);
    if (prev !== undefined && prev <= sim.parks) return;
    seen.set(key, sim.parks);
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }
    const moves = sim.legalMoves().map((m) => [m, moveScore(sim, m)] as const).sort((a, b) => b[1] - a[1]);
    for (const [m] of moves) {
      const next = sim.clone();
      next.apply(m);
      // A park only pays off if the bound still allows it.
      if (next.parks >= best) continue;
      path.push(m);
      dfs(next);
      path.pop();
      if (aborted) return;
    }
  };
  const root = start.clone();
  root.unstick();
  dfs(root);
  return { parks: best, moves: bestMoves, exact: !aborted };
}

// ---------------------------------------------------------------- simulated players

export type Policy = 'random' | 'casual' | 'greedy';

/** How good a position looks to a player who plans ahead. */
export function positionScore(sim: Sim, moves: number[]): number {
  if (sim.status === 'won') return 1e7;
  if (!moves.length) return -1e6 + sim.delivered;
  let v = sim.delivered * 100 + (sim.bowlCap - sim.bowlLen) * 35 + moves.length * 2;
  for (const m of moves) if (isBowlMove(m) || sim.wouldDeliver(m)) v += 18;
  for (let k = 0; k < sim.bowlCap; k++) {
    const t = sim.bowlTok[k];
    if (t < 0) continue;
    let d = Infinity;
    if (sim.s.rules.bowlMode === 'hold') d = sim.distanceTo(sim.bowlPot[k], t);
    else for (let p = 0; p < sim.potCount; p++) d = Math.min(d, sim.distanceTo(p, t));
    v -= Math.min(d, 10) * 6;
  }
  return v;
}

function pickGreedy(sim: Sim, moves: number[], rng: Rng, noise: number): number {
  let pick = moves[0];
  let best = -Infinity;
  for (const m of moves) {
    const s = moveScore(sim, m) + rng.next() * noise;
    if (s > best) {
      best = s;
      pick = m;
    }
  }
  return pick;
}

/**
 * random: any legal move. casual: delivers when it can, otherwise parks something at random.
 * greedy: the best-looking move by `moveScore` (with a little noise and the odd slip).
 */
export function playout(start: Sim, rng: Rng, policy: Policy): boolean {
  const sim = start.clone();
  const moves: number[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    if (sim.status === 'won') return true;
    sim.legalMoves(moves);
    if (!moves.length) return false;
    let pick: number;
    if (policy === 'random') pick = rng.pick(moves);
    else if (policy === 'casual') {
      const good = moves.filter((m) => isBowlMove(m) || sim.wouldDeliver(m));
      pick = good.length && rng.chance(0.9) ? rng.pick(good) : rng.pick(moves);
    } else pick = rng.chance(0.04) ? rng.pick(moves) : pickGreedy(sim, moves, rng, 40);
    sim.apply(pick);
  }
  return false;
}

/**
 * Plays the best-looking move for up to `limit` moves; returns Infinity on a win, -1 when it jams
 * within the horizon, otherwise how many items were delivered.
 */
function naturalRollout(start: Sim, limit = 400): number {
  const sim = start.clone();
  const moves: number[] = [];
  for (let k = 0; k < limit; k++) {
    if (sim.status === 'won') return Infinity;
    sim.legalMoves(moves);
    if (!moves.length) return -1;
    let pick = moves[0];
    let best = -Infinity;
    for (const m of moves) {
      const s = moveScore(sim, m);
      if (s > best) {
        best = s;
        pick = m;
      }
    }
    sim.apply(pick);
  }
  return sim.status === 'won' ? Infinity : sim.delivered;
}

/** How far ahead the simulated thinking player looks (moves of natural play after its own). */
export const PLANNER_HORIZON = 5;

/**
 * A thoughtful player: for each of the `beam` most natural moves, imagines the next few moves of
 * natural play (`horizon`). It skips moves that jam the kitchen within that horizon and otherwise
 * takes the most natural one. Traps that only bite later still catch it, like a person who thinks
 * a few moves ahead but not to the end.
 */
export function plannerPlayout(start: Sim, rng: Rng, beam = 4, horizon = PLANNER_HORIZON): boolean {
  const sim = start.clone();
  for (let guard = 0; guard < 1000; guard++) {
    if (sim.status === 'won') return true;
    const moves = sim.legalMoves();
    if (!moves.length) return false;
    const cand = moves.map((m) => [m, moveScore(sim, m) + rng.next() * 30] as const).sort((a, b) => b[1] - a[1]).slice(0, beam);
    let pick = cand[0][0];
    let best = -2;
    for (const [m] of cand) {
      const next = sim.clone();
      next.apply(m);
      const v = naturalRollout(next, horizon);
      if (v === Infinity) {
        pick = m;
        break;
      }
      // The first (most natural) move that doesn't jam within the horizon.
      if (v >= 0) {
        pick = m;
        break;
      }
      if (v > best) {
        best = v;
        pick = m;
      }
    }
    sim.apply(pick);
  }
  return false;
}

export interface WinRates {
  random: number;
  casual: number;
  greedy: number;
  planner?: number;
}

export function winRates(level: LevelDef | Sim, runs = 120, seed = 12345, plannerRuns = 0): WinRates {
  const sim = level instanceof Sim ? level : Sim.fromLevel(level);
  const rng = new Rng(seed);
  let random = 0;
  let casual = 0;
  let greedy = 0;
  for (let i = 0; i < runs; i++) {
    if (playout(sim, rng, 'random')) random++;
    if (playout(sim, rng, 'casual')) casual++;
    if (playout(sim, rng, 'greedy')) greedy++;
  }
  const out: WinRates = { random: random / runs, casual: casual / runs, greedy: greedy / runs };
  if (plannerRuns > 0) {
    let w = 0;
    for (let i = 0; i < plannerRuns; i++) if (plannerPlayout(sim, rng)) w++;
    out.planner = w / plannerRuns;
  }
  return out;
}

// ---------------------------------------------------------------- traps

export interface TrapReport {
  /** Steps with more than one legal move. */
  decisions: number;
  /** Steps where at least one other legal move loses. */
  critical: number;
  /** Losing moves / legal moves, averaged over the steps of the line. */
  traps: number;
  /** Same, at the first step. */
  firstTraps: number;
  /** Per step: [legal, losing]. */
  steps: [number, number][];
}

/**
 * Walks a solution and probes every alternative with a small solver budget. A move counts as
 * losing when the solver can't win from it within the budget (proved lost or too deep to see).
 */
export function trapReport(level: LevelDef, solution: number[], budget = 2000, maxProbes = 400): TrapReport {
  const sim = Sim.fromLevel(level);
  const steps: [number, number][] = [];
  let decisions = 0;
  let critical = 0;
  let probes = 0;
  const cache = new Map<string, boolean>();
  for (const m of solution) {
    const legal = sim.legalMoves().slice();
    let losing = 0;
    if (legal.length > 1) {
      decisions++;
      for (const alt of legal) {
        if (alt === m) continue;
        const probe = sim.clone();
        probe.apply(alt);
        const key = probe.key();
        let ok = cache.get(key);
        if (ok === undefined) {
          if (probes >= maxProbes) continue;
          probes++;
          ok = solve(probe, budget).status === 'solved';
          cache.set(key, ok);
        }
        if (!ok) losing++;
      }
      if (losing) critical++;
    }
    steps.push([legal.length, losing]);
    if (!sim.apply(m)) break;
  }
  const rated = steps.filter(([l]) => l > 0);
  const traps = rated.length ? rated.reduce((a, [l, x]) => a + x / l, 0) / rated.length : 0;
  const firstTraps = steps.length && steps[0][0] ? steps[0][1] / steps[0][0] : 0;
  return { decisions, critical, traps, firstTraps, steps };
}

// ---------------------------------------------------------------- effort

/**
 * Planning effort, as in the water-sort lab: a search that tries natural-looking moves first (with
 * a little noise) and backtracks out of dead ends, like a player with undo. Ratio = positions
 * visited per solution move; difficulty = log2(ratio) / 6 (1× = 0, 8× = 0.5, 64× = 1), median of
 * several runs.
 */
export function effort(level: LevelDef, runs = 5, seed = 99, cap = 6000): { d: number; ratio: number } {
  const rng = new Rng(seed);
  const ratios: number[] = [];
  for (let r = 0; r < runs; r++) {
    const seen = new Set<string>();
    let nodes = 0;
    let depthFound = 0;
    const dfs = (sim: Sim, depth: number): boolean => {
      if (sim.status === 'won') {
        depthFound = depth;
        return true;
      }
      if (nodes >= cap) return false;
      const key = sim.key();
      if (seen.has(key)) return false;
      seen.add(key);
      nodes++;
      const moves = sim.legalMoves().map((m) => [m, moveScore(sim, m) + rng.next() * 1600] as const).sort((a, b) => b[1] - a[1]);
      for (const [m] of moves) {
        const next = sim.clone();
        next.apply(m);
        if (dfs(next, depth + 1)) return true;
        if (nodes >= cap) return false;
      }
      return false;
    };
    const ok = dfs(Sim.fromLevel(level), 0);
    ratios.push(ok ? Math.max(1, nodes / Math.max(1, depthFound)) : 64);
  }
  ratios.sort((a, b) => a - b);
  const ratio = ratios[Math.floor(ratios.length / 2)];
  return { d: Math.max(0, Math.min(1, Math.log2(ratio) / 6)), ratio };
}
