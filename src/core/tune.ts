import { geometryOf, tracePath } from './board';
import { buildLevel, replay, type GenParams } from './generator';
import type { LevelPlan, Target } from './progression';
import { Rng } from './rng';
import { Sim } from './sim';
import { effort, minParks, solve, trapReport, winRates } from './solver';
import { cloneLevel, type Dir, type LevelDef, type LevelStats } from './types';

/**
 * Generate → measure → tune, as in Pixel Picnic: a hardness knob is bisected until the level's
 * difficulty `d` lands on the campaign curve, the closest candidates are re-measured precisely,
 * and a solver-checked local search nudges the best one the rest of the way.
 */

/**
 * Difficulty 0..1 from four simulated players and the reference line: how often random tapping,
 * a casual player, a quick greedy player and a player who thinks five moves ahead fail, and how
 * many of the decisions along the solution are critical (another move loses). Using every player
 * keeps the tuner from just exploiting one heuristic's blind spot.
 */
export function difficulty(m: { random: number; casual: number; greedy: number; planner: number; critical: number; decisions: number }): number {
  const critShare = m.decisions ? Math.min(1, (2 * m.critical) / m.decisions) : 0;
  const d = 0.1 * (1 - m.random) + 0.15 * (1 - m.casual) + 0.3 * (1 - m.greedy) + 0.3 * (1 - m.planner) + 0.15 * critShare;
  return Math.round(Math.max(0, Math.min(1, d)) * 1000) / 1000;
}

export interface Measure {
  random: number;
  casual: number;
  greedy: number;
  planner: number;
  critical: number;
  decisions: number;
  d: number;
}

function band(v: number, b: [number, number]): number {
  return v < b[0] ? b[0] - v : v > b[1] ? v - b[1] : 0;
}

export function objective(m: Measure, t: Target): number {
  // Stronger players should win at least as often as weaker ones; when they don't, the level only
  // exploits a particular heuristic and isn't hard in general.
  const odd = Math.max(0, m.casual - m.greedy - 0.15) + Math.max(0, m.random - m.greedy - 0.1) + Math.max(0, m.greedy - m.planner - 0.1);
  return Math.max(0, Math.abs(m.d - t.d) - t.tol) * 2 + band(m.greedy, t.greedy) + band(m.planner, t.planner) + odd +
    Math.max(0, t.minCritical - m.critical) * 0.04;
}

/** Easier than the target. */
export function tooEasy(m: Measure, t: Target): boolean {
  return m.d < t.d - t.tol || m.greedy > t.greedy[1] || m.planner > t.planner[1];
}

/**
 * Measures a level. The trap walk (critical decisions) is the slow part: when the players alone
 * put the level far from the target it is skipped and estimated as typical for that difficulty.
 */
export function measure(level: LevelDef, t: Target, seed: number, runs = 100, plannerRuns = 16, force = false): Measure {
  const r = winRates(level, runs, seed, plannerRuns);
  const planner = r.planner ?? 0;
  const base = { random: r.random, casual: r.casual, greedy: r.greedy, planner, critical: 0, decisions: 1 };
  const cheap = difficulty(base);
  if (force || Math.abs(cheap + 0.06 - t.d) < 0.15) {
    const tr = trapReport(level, level.solution!, 1500, 250);
    base.critical = tr.critical;
    base.decisions = tr.decisions;
  } else {
    // Far from the target anyway: assume a typical share of critical decisions.
    base.critical = cheap * 0.4;
  }
  return { ...base, d: difficulty(base) };
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
  m: Measure;
  dist: number;
}

/** Bisection on the hardness knob; returns the candidates, closest first. */
export function search(plan: LevelPlan, seed: number, attempts = 24): Cand[] {
  const rng = new Rng(seed);
  const t = plan.target;
  let hard = t.d < 0.2 ? 0.3 : t.d < 0.4 ? 0.8 : 1.3;
  let easyAt = -1;
  let hardAt = 3;
  const pool: Cand[] = [];
  for (let a = 0; a < attempts; a++) {
    const b = buildLevel(knob(plan.params, hard), seed * 31 + a * 7919);
    if (!b) {
      hard = Math.max(0, hard - 0.15);
      continue;
    }
    if (!acceptable(b.level, plan)) continue;
    const m = measure(b.level, t, seed + a);
    const dist = objective(m, t);
    pool.push({ level: b.level, m, dist });
    if (dist === 0 && pool.filter((c) => c.dist === 0).length >= 2) break;
    const easy = tooEasy(m, t);
    if (easy) easyAt = Math.max(easyAt, hard);
    else hardAt = Math.min(hardAt, hard);
    if (easyAt >= 0 && hardAt <= 2) hard = (easyAt + hardAt) / 2 + (rng.next() - 0.5) * 0.1;
    else hard = Math.max(0, Math.min(2, hard + (easy ? 1 : -1) * (0.15 + Math.min(0.35, Math.abs(m.d - t.d))) * (0.7 + rng.next() * 0.6)));
    if (hardAt - easyAt < 0.05) {
      easyAt = Math.max(-1, easyAt - 0.2);
      hardAt = Math.min(3, hardAt + 0.2);
    }
  }
  return pool.sort((x, y) => x.dist - y.dist);
}

/** Mechanics an intro level must actually exercise. */
function acceptable(level: LevelDef, plan: LevelPlan): boolean {
  if (plan.tier !== 'intro') return true;
  if (plan.mechanics.includes('bowl') || plan.mechanics.includes('skewer')) {
    // The bowl must be needed: no solution without parking.
    const mp = minParks(Sim.fromLevel(level), 20000);
    if (mp.parks < (plan.mechanics.includes('skewer') ? 2 : 1)) return false;
  }
  const g = geometryOf(level);
  if (plan.mechanics.includes('pads') && level.tiles.filter((t) => tracePath(g, t.x, t.y, t.dir).turns > 0).length < 3) return false;
  if (plan.mechanics.includes('knife') && level.tiles.filter((t) => tracePath(g, t.x, t.y, t.dir).form).length < 3) return false;
  return (level.solution ?? []).length > 0;
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
  const alone = (t: LevelDef['tiles'][0]) => !l.tiles.some((o) => o !== t && o.x === t.x && o.y === t.y);
  if (kind < 0.35) {
    // Move a tile to an empty cell, keeping what it delivers and where.
    const movable = l.tiles.filter(alone);
    if (!movable.length) return null;
    const t = rng.pick(movable);
    const before = tracePath(g, t.x, t.y, t.dir);
    const cells = [...Array(w * h).keys()].filter((c) => !occupied.has(c));
    if (!cells.length) return null;
    const c = rng.pick(cells);
    for (const d of rng.shuffle([0, 1, 2, 3] as Dir[])) {
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

/** Solver-checked local search toward the target. */
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
    const m = measure(cand, plan.target, seed + it * 13);
    const dist = objective(m, plan.target);
    if (dist < best.dist) best = { level: cand, m, dist };
  }
  return best;
}

/** Full measurement for a finished level (more games, traps, effort, par). */
export function finalStats(level: LevelDef, seed: number): LevelStats {
  const r = winRates(level, 200, seed, 40);
  const sol = level.solution ?? solve(Sim.fromLevel(level), 100000).moves;
  const tr = trapReport(level, sol, 2000, 500);
  const ef = effort(level, 5, seed);
  const mp = minParks(Sim.fromLevel(level), 60000);
  const nodes = solve(Sim.fromLevel(level), 100000).nodes;
  const planner = r.planner ?? 0;
  return {
    random: r.random, casual: r.casual, greedy: r.greedy, planner,
    critical: tr.critical, decisions: tr.decisions, traps: +tr.traps.toFixed(4), firstTraps: +tr.firstTraps.toFixed(3),
    effort: +ef.d.toFixed(3), par: mp.parks, nodes,
    d: difficulty({ random: r.random, casual: r.casual, greedy: r.greedy, planner, critical: tr.critical, decisions: tr.decisions }),
  };
}

/** A level for the plan: search, re-measure the closest candidates precisely, tune the best. */
export function generateFor(plan: LevelPlan, seed: number): { level: LevelDef; dist: number; m: Measure } | null {
  const pool = search(plan, seed);
  if (!pool.length) return null;
  // Screening is noisy: re-measure the three closest with more games and keep the closest.
  const t = plan.target;
  const finals = pool.slice(0, 3).map((c, k) => {
    const m = measure(c.level, t, seed + 900 + k, 240, 40, true);
    return { level: c.level, m, dist: objective(m, t) };
  }).sort((a, b) => a.dist - b.dist);
  let best = finals[0];
  if (best.dist > 0) {
    const tuned = tune(best, plan, seed, plan.tier === 'superhard' ? 120 : 70);
    if (tuned !== best) {
      const m = measure(tuned.level, t, seed + 977, 240, 40, true);
      const dist = objective(m, t);
      if (dist < best.dist) best = { level: tuned.level, m, dist };
    }
  }
  const level = best.level;
  if (!replay(level, level.solution!)) {
    const res = solve(Sim.fromLevel(level), 100000);
    if (res.status !== 'solved') return null;
    level.solution = res.moves;
  }
  return { level, dist: best.dist, m: best.m };
}
