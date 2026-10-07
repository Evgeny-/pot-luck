/**
 * Rule experiments: generates levels for every rule variant and measures how much thinking they
 * take (simulated players, traps along the solution, planning effort).
 *
 *   bun scripts/experiment.ts                    all variants, 24 levels each
 *   N=40 ONLY=base,skewer3 bun scripts/experiment.ts
 *   PART=0/4 bun scripts/experiment.ts           a quarter of the variants (run four in parallel)
 *   bun scripts/experiment.ts table              print the table of everything measured so far
 *
 * Results go to .cache/experiments/<variant>.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildLevel } from '../src/core/generator';
import { VARIANTS, type Variant } from './lib/variants';
import { minParks, trapReport, winRates, effort } from '../src/core/solver';
import { Sim } from '../src/core/sim';

const DIR = '.cache/experiments';
const N = Number(process.env.N ?? 24);

interface Row {
  seed: number;
  tiles: number;
  random: number;
  casual: number;
  greedy: number;
  planner: number;
  critical: number;
  decisions: number;
  traps: number;
  first: number;
  effort: number;
  refParks: number;
  par: number;
  parExact: boolean;
  genMs: number;
}

function measure(variant: Variant): { rows: Row[]; fails: number } {
  const rows: Row[] = [];
  let fails = 0;
  for (let s = 1; s <= N; s++) {
    const seed = s * 7919 + 13;
    const t0 = performance.now();
    const b = buildLevel(variant.params, seed);
    const genMs = performance.now() - t0;
    if (!b) {
      fails++;
      continue;
    }
    const lv = b.level;
    const wr = winRates(lv, 120, seed, 12);
    const tr = trapReport(lv, lv.solution!, 1500, 300);
    const ef = effort(lv, 3, seed);
    const mp = minParks(Sim.fromLevel(lv), 20000, b.parks + 1);
    rows.push({
      seed, tiles: lv.tiles.length, random: wr.random, casual: wr.casual, greedy: wr.greedy, planner: wr.planner ?? 0,
      critical: tr.critical, decisions: tr.decisions, traps: tr.traps, first: tr.firstTraps, effort: ef.d,
      refParks: b.parks, par: Math.min(mp.parks, b.parks), parExact: mp.exact, genMs,
    });
  }
  return { rows, fails };
}

const mean = (rows: Row[], k: keyof Row) => (rows.length ? rows.reduce((a, r) => a + Number(r[k]), 0) / rows.length : NaN);

function table(): void {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : [];
  const data = new Map(files.map((f) => {
    const d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
    return [d.key, d];
  }));
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  console.log('| Variant | Learn | Yield | Tiles | Random | Casual | Greedy | Planner | Critical | Trap density | 1st-move traps | Effort | Par |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const vr of VARIANTS) {
    const d = data.get(vr.key);
    if (!d) continue;
    const rows: Row[] = d.rows;
    const y = rows.length / (rows.length + d.fails);
    console.log(`| ${vr.label} | ${vr.cost} | ${pct(y)} | ${mean(rows, 'tiles').toFixed(0)} | ${pct(mean(rows, 'random'))} | ${pct(mean(rows, 'casual'))} | ${pct(mean(rows, 'greedy'))} | ${pct(mean(rows, 'planner'))} | ${mean(rows, 'critical').toFixed(1)} | ${mean(rows, 'traps').toFixed(3)} | ${pct(mean(rows, 'first'))} | ${mean(rows, 'effort').toFixed(2)} | ${mean(rows, 'par').toFixed(1)} |`);
  }
}

if (process.argv[2] === 'table') {
  table();
} else {
  mkdirSync(DIR, { recursive: true });
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  let list = VARIANTS.filter((x) => !only || only.has(x.key));
  if (process.env.PART) {
    const [k, n] = process.env.PART.split('/').map(Number);
    list = list.filter((_, i) => i % n === k);
  }
  for (const vr of list) {
    const t0 = performance.now();
    const { rows, fails } = measure(vr);
    writeFileSync(`${DIR}/${vr.key}.json`, JSON.stringify({ key: vr.key, label: vr.label, cost: vr.cost, n: N, fails, rows }));
    console.log(
      `${vr.key.padEnd(10)} n=${rows.length}/${N} tiles=${mean(rows, 'tiles').toFixed(0)} rnd=${mean(rows, 'random').toFixed(2)} ` +
      `cas=${mean(rows, 'casual').toFixed(2)} gr=${mean(rows, 'greedy').toFixed(2)} plan=${mean(rows, 'planner').toFixed(2)} ` +
      `crit=${mean(rows, 'critical').toFixed(1)}/${mean(rows, 'decisions').toFixed(0)} traps=${mean(rows, 'traps').toFixed(3)} ` +
      `first=${mean(rows, 'first').toFixed(2)} eff=${mean(rows, 'effort').toFixed(2)} par=${mean(rows, 'par').toFixed(1)} ` +
      `(${((performance.now() - t0) / 1000).toFixed(0)}s)`,
    );
  }
}
