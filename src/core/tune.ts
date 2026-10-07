import { geometryOf, tracePath } from './board';
import { buildLevel, replay, type GenParams } from './generator';
import type { LevelPlan, Target } from './progression';
import { Rng } from './rng';
import { Sim } from './sim';
import { effort, minParks, solve, trapReport, winRates, type WinRates } from './solver';
import { WILD, cloneLevel, ingOf, tokenOf, type Dir, type LevelDef, type LevelStats } from './types';

/**
 * Generate → measure → tune, like Pixel Picnic: a hardness knob is bisected against the target
 * bands of the simulated players, then a solver-checked local search nudges the level the rest of
 * the way, and the result has to ask for enough real decisions.
 */

function band(v: number, b?: [number, number]): number {
  if (!b) return 0;
  return v < b[0] ? b[0] - v : v > b[1] ? v - b[1] : 0;
}

export function objective(r: WinRates, t: Target): number {
  return band(r.greedy, t.greedy) + (r.planner === undefined ? 0.1 : band(r.planner, t.planner)) + band(r.casual, t.casual) * 0.5 + band(r.random, t.random) * 0.5;
}

/** Easier than the target in some respect. */
export function tooEasy(r: WinRates, t: Target): boolean {
  return r.greedy > t.greedy[1] || (r.planner ?? 0) > t.planner[1] || r.casual > (t.casual?.[1] ?? 1) || r.random > (t.random?.[1] ?? 1);
}

/** Player win rates; the slow planner only runs when the cheap players are close to the target. */
export function rates(level: LevelDef, t: Target, seed: number, runs = 100): WinRates {
  const r = winRates(level, runs, seed);
  const quick = band(r.greedy, t.greedy) + band(r.casual, t.casual) * 0.5;
  if (quick < 0.2) r.planner = winRates(level, 0, seed + 1, 10).planner;
  return r;
}

/** Knob 0..2 → generator settings (beyond 1 the reference line parks more, and needs later items). */
export function knob(base: GenParams, hard: number): GenParams {
  const h1 = Math.min(1, hard);
  const h2 = Math.max(0, hard - 1);
  return {
    ...base,
    detour: Math.min(0.95, 0.1 + 0.6 * h1 + 0.25 * h2),
    tight: Math.min(1, 0.15 + 0.8 * h1 + 0.05 * h2),
    horizon: Math.min(1, 0.2 + 0.5 * h1 + 0.3 * h2),
    repeat: base.repeat * (1 - 0.5 * h2),
  };
}

interface Cand {
  level: LevelDef;
  r: WinRates;
  dist: number;
}

/** Bisection on the hardness knob; keeps the candidate closest to the target. */
export function search(plan: LevelPlan, seed: number, attempts = 22): Cand | null {
  const rng = new Rng(seed);
  const t = plan.target;
  let hard = plan.tier === 'intro' || plan.tier === 'relax' ? 0.3 : plan.tier === 'normal' ? 0.8 : 1.2;
  let easyAt = -1;
  let hardAt = 3;
  let best: Cand | null = null;
  for (let a = 0; a < attempts; a++) {
    const b = buildLevel(knob(plan.params, hard), seed * 31 + a * 7919);
    if (!b) {
      hard = Math.max(0, hard - 0.15);
      continue;
    }
    if (!acceptable(b.level, plan)) continue;
    const r = rates(b.level, t, seed + a);
    const dist = objective(r, t);
    if (!best || dist < best.dist) best = { level: b.level, r, dist };
    if (dist === 0) break;
    const easy = tooEasy(r, t);
    if (easy) easyAt = Math.max(easyAt, hard);
    else hardAt = Math.min(hardAt, hard);
    if (easyAt >= 0 && hardAt <= 2) hard = (easyAt + hardAt) / 2 + (rng.next() - 0.5) * 0.08;
    else hard = Math.max(0, Math.min(2, hard + (easy ? 1 : -1) * (0.15 + Math.min(0.35, dist)) * (0.7 + rng.next() * 0.6)));
    if (hardAt - easyAt < 0.04) {
      easyAt = Math.max(-1, easyAt - 0.2);
      hardAt = Math.min(3, hardAt + 0.2);
    }
  }
  return best;
}

/** Mechanics an intro level must actually exercise. */
function acceptable(level: LevelDef, plan: LevelPlan): boolean {
  if (plan.tier !== 'intro') return true;
  const sim = Sim.fromLevel(level);
  const sol = level.solution ?? [];
  if (plan.mechanics.includes('bowl') || plan.mechanics.includes('skewer')) {
    // The bowl must be needed: no solution without parking.
    const mp = minParks(sim, 20000);
    if (mp.parks < (plan.mechanics.includes('skewer') ? 2 : 1)) return false;
  }
  if (plan.mechanics.includes('pads')) {
    const g = geometryOf(level);
    const turning = level.tiles.filter((t) => tracePath(g, t.x, t.y, t.dir).turns > 0).length;
    if (turning < 3) return false;
  }
  if (plan.mechanics.includes('knife')) {
    const g = geometryOf(level);
    if (level.tiles.filter((t) => tracePath(g, t.x, t.y, t.dir).form).length < 3) return false;
  }
  return sol.length > 0;
}

// ---------------------------------------------------------------- local search

/** One random edit that keeps the level zero-waste (and pot membership in 'hold' mode). */
function mutate(src: LevelDef, rng: Rng): LevelDef | null {
  const l = cloneLevel(src);
  const g = geometryOf(l);
  const { w, h } = l;
  const occupied = new Set(l.tiles.map((t) => t.y * w + t.x));
  for (const p of l.pads ?? []) occupied.add(p.y * w + p.x);
  const kind = rng.next();
  const hold = l.rules.bowlMode === 'hold';
  const free = (t: LevelDef['tiles'][0]) => !l.tiles.some((o) => o !== t && o.x === t.x && o.y === t.y);
  if (kind < 0.35) {
    // Move a tile to an empty cell, keeping what it delivers and where.
    const t = rng.pick(l.tiles.filter(free));
    if (!t) return null;
    const before = tracePath(g, t.x, t.y, t.dir);
    const cells = [...Array(w * h).keys()].filter((c) => !occupied.has(c));
    if (!cells.length) return null;
    const c = rng.pick(cells);
    const dirs = rng.shuffle([0, 1, 2, 3] as Dir[]);
    for (const d of dirs) {
      const p = tracePath(g, c % w, Math.floor(c / w), d);
      if (p.pot !== before.pot || p.form !== before.form) continue;
      t.x = c % w;
      t.y = Math.floor(c / w);
      t.dir = d;
      return l;
    }
    return null;
  }
  if (kind < 0.65) {
    // Two tiles trade ingredients (same form; same pot in hold mode).
    const a = rng.pick(l.tiles);
    const b = rng.pick(l.tiles);
    if (a === b || a.ing === b.ing) return null;
    const pa = tracePath(g, a.x, a.y, a.dir);
    const pb = tracePath(g, b.x, b.y, b.dir);
    if (pa.form !== pb.form) return null;
    if (hold && pa.pot !== pb.pot) return null;
    [a.ing, b.ing] = [b.ing, a.ing];
    return l;
  }
  if (kind < 0.8 && !hold) {
    // Aim a tile at another pot.
    const t = rng.pick(l.tiles);
    const before = tracePath(g, t.x, t.y, t.dir);
    for (const d of rng.shuffle([0, 1, 2, 3] as Dir[])) {
      if (d === t.dir) continue;
      const p = tracePath(g, t.x, t.y, d);
      if (p.pot < 0 || p.form !== before.form) continue;
      t.dir = d;
      return l;
    }
    return null;
  }
  // Swap two neighbouring items of a strict dish.
  const pot = rng.pick(l.pots);
  const dish = rng.pick(pot.dishes);
  if (dish.order === 'any' || dish.items.length < 2) return null;
  const i = rng.int(0, dish.items.length - 2);
  if (dish.items[i] === dish.items[i + 1]) return null;
  [dish.items[i], dish.items[i + 1]] = [dish.items[i + 1], dish.items[i]];
  return l;
}

/** Solver-checked local search toward the target bands. */
export function tune(start: Cand, plan: LevelPlan, seed: number, iters = 60): Cand {
  const rng = new Rng(seed ^ 0x5bd1e995);
  let best = start;
  for (let it = 0; it < iters && best.dist > 0; it++) {
    const cand = mutate(best.level, rng);
    if (!cand) continue;
    const res = solve(Sim.fromLevel(cand), 8000);
    if (res.status !== 'solved') continue;
    cand.solution = res.moves;
    if (!acceptable(cand, plan)) continue;
    const r = rates(cand, plan.target, seed + it * 13);
    const dist = objective(r, plan.target);
    if (dist < best.dist) best = { level: cand, r, dist };
  }
  return best;
}

/** Combined difficulty 0..1 for ordering and plotting the campaign. */
export function difficulty(s: Pick<LevelStats, 'greedy' | 'planner' | 'critical' | 'traps' | 'casual'>): number {
  const d = 0.3 * (1 - s.greedy) + 0.3 * (1 - s.planner) + 0.15 * (1 - s.casual) + 0.15 * Math.min(1, s.critical / 10) + 0.1 * Math.min(1, s.traps / 0.08);
  return Math.round(Math.max(0, Math.min(1, d)) * 1000) / 1000;
}

/** Full measurement for a finished level (slow: more runs, traps, effort, par). */
export function finalStats(level: LevelDef, seed: number): LevelStats {
  const r = winRates(level, 200, seed, 24);
  const sol = level.solution ?? solve(Sim.fromLevel(level), 100000).moves;
  const tr = trapReport(level, sol, 2000, 500);
  const ef = effort(level, 5, seed);
  const mp = minParks(Sim.fromLevel(level), 60000);
  const nodes = solve(Sim.fromLevel(level), 100000).nodes;
  const stats: LevelStats = {
    random: r.random, casual: r.casual, greedy: r.greedy, planner: r.planner ?? 0,
    critical: tr.critical, decisions: tr.decisions, traps: +tr.traps.toFixed(4), firstTraps: +tr.firstTraps.toFixed(3),
    effort: +ef.d.toFixed(3), par: mp.parks, nodes, d: 0,
  };
  stats.d = difficulty(stats);
  return stats;
}

/** A level for the plan: search, tune, then make sure it asks for enough decisions. */
export function generateFor(plan: LevelPlan, seed: number): { level: LevelDef; dist: number; r: WinRates; critical: number } | null {
  let best = search(plan, seed);
  if (!best) return null;
  if (best.dist > 0) best = tune(best, plan, seed, plan.tier === 'superhard' ? 120 : 70);
  let crit = trapReport(best.level, best.level.solution!, 1500, 250).critical;
  for (let round = 1; round <= 2 && crit < plan.target.minCritical; round++) {
    // Not enough real decisions: search again with a stricter greedy band, keep the better one.
    const strict: LevelPlan = { ...plan, target: { ...plan.target, greedy: [plan.target.greedy[0] * 0.7, Math.max(plan.target.greedy[0], plan.target.greedy[1] - 0.12 * round)] } };
    const again = search(strict, seed + round * 101);
    if (!again) continue;
    const c2 = trapReport(again.level, again.level.solution!, 1500, 250).critical;
    const d2 = objective(again.r, plan.target);
    if (c2 > crit && d2 <= best.dist + 0.15) {
      best = { ...again, dist: d2 };
      crit = c2;
    }
  }
  const level = best.level;
  if (!replay(level, level.solution!)) {
    const res = solve(Sim.fromLevel(level), 100000);
    if (res.status !== 'solved') return null;
    level.solution = res.moves;
  }
  return { level, dist: best.dist + Math.max(0, plan.target.minCritical - crit) * 0.03, r: best.r, critical: crit };
}

export { WILD, ingOf, tokenOf };
