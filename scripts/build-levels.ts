/**
 * Builds the campaign: every level is planned (progression.ts), generated toward its difficulty
 * band, tuned, measured and stored with a solver-verified solution.
 *
 *   bun scripts/build-levels.ts 1-40        build levels 1..40 (skips finished ones)
 *   REBUILD=1 bun scripts/build-levels.ts 7 rebuild level 7 (SEED=2 for different candidates)
 *   bun scripts/build-levels.ts merge       → src/data/levels.json
 *   bun scripts/build-levels.ts report      difficulty curve as text
 *
 * Levels are written to .cache/levels/<n>.json so several builders can run in parallel.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { planLevel, targetD } from '../src/core/progression';
import { finalStats, generateFor } from '../src/core/tune';
import type { LevelDef } from '../src/core/types';

const DIR = '.cache/levels';
const OUT = 'src/data/levels.json';

function merge(): void {
  const levels: LevelDef[] = [];
  for (let n = 1; ; n++) {
    const f = `${DIR}/${n}.json`;
    if (!existsSync(f)) break;
    const { dist: _d, ...lv } = JSON.parse(readFileSync(f, 'utf8'));
    levels.push(lv);
  }
  mkdirSync('src/data', { recursive: true });
  writeFileSync(OUT + '.tmp', JSON.stringify(levels));
  renameSync(OUT + '.tmp', OUT);
  console.log(`wrote ${levels.length} levels to ${OUT}`);
}

function report(): void {
  const levels: LevelDef[] = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const lv of levels) {
    const s = lv.stats!;
    const bar = '█'.repeat(Math.round(s.d * 40));
    const t = targetD(lv.n, lv.tier!);
    console.log(`${String(lv.n).padStart(3)} ${lv.tier!.padEnd(9)} ${bar.padEnd(40)} ${s.d.toFixed(2)} (target ${t.toFixed(2)})  gr ${s.greedy.toFixed(2)} pl ${s.planner.toFixed(2)} crit ${s.critical}/${s.decisions}  ${(lv.mechanics ?? []).join(',')}`);
  }
}

function build(n: number): void {
  const f = `${DIR}/${n}.json`;
  if (existsSync(f) && process.env.REBUILD !== '1') return;
  const plan = planLevel(n);
  const t0 = performance.now();
  let best: ReturnType<typeof generateFor> = null;
  const offset = Number(process.env.SEED ?? 0) * 104729;
  for (let k = 0; k < 3; k++) {
    const r = generateFor(plan, n * 1013 + k * 7 + offset);
    if (r && (!best || r.dist < best.dist)) best = r;
    if (best && best.dist === 0) break;
  }
  if (!best) {
    console.log(`#${n} FAILED (${plan.tier}, ${plan.params.w}x${plan.params.h})`);
    return;
  }
  const lv = best.level;
  lv.n = n;
  lv.cuisine = plan.cuisine;
  lv.tier = plan.tier;
  lv.mechanics = plan.mechanics;
  lv.tags = [plan.shape];
  lv.stats = finalStats(lv, n * 17 + 1);
  writeFileSync(f + '.tmp', JSON.stringify({ ...lv, dist: +best.dist.toFixed(3) }));
  renameSync(f + '.tmp', f);
  const s = lv.stats;
  const t = plan.target;
  const off = Math.abs(s.d - t.d) > t.tol;
  console.log(
    `#${String(n).padStart(3)} ${plan.tier.padEnd(9)} ${lv.w}x${lv.h} tiles=${String(lv.tiles.length).padStart(2)} pots=${lv.pots.length} bowl=${lv.rules.bowl}${lv.rules.bowlOrder === 'lifo' ? 'S' : ''} ` +
    `${(plan.mechanics.join('+') || '-').padEnd(16)} d=${s.d.toFixed(2)} target ${t.d.toFixed(2)}±${t.tol} ${off ? 'OFF' : 'ok '} ` +
    `rnd=${s.random.toFixed(2)} cas=${s.casual.toFixed(2)} gr=${s.greedy.toFixed(2)} pl=${s.planner.toFixed(2)} crit=${s.critical}/${s.decisions} par=${s.par} ` +
    `${((performance.now() - t0) / 1000).toFixed(0)}s`,
  );
}

const arg = process.argv[2] ?? '1-60';
if (arg === 'merge') merge();
else if (arg === 'report') report();
else {
  mkdirSync(DIR, { recursive: true });
  const [a, b] = arg.split('-').map(Number);
  for (let n = a; n <= (b || a); n++) build(n);
}
