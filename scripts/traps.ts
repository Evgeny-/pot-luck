/**
 * Finds a "greedy trap" per rule variant: a position on the solution where the move that looks best
 * (highest moveScore, what a quick player would do) loses. Prints the board, both moves and how the
 * tempting line ends.
 *
 *   bun scripts/traps.ts base,skewer3,lids > .cache/traps.md
 */
import { buildLevel } from '../src/core/generator';
import { moveName, show } from '../src/core/ascii';
import { Sim } from '../src/core/sim';
import { moveScore, solve } from '../src/core/solver';
import { VARIANTS } from './lib/variants';

const keys = (process.argv[2] ?? 'base,bowl2,skewer3,lids,stacks-bowl2,nobowl').split(',');
const W = Number(process.env.W ?? 5);

for (const key of keys) {
  const vr = VARIANTS.find((v) => v.key === key);
  if (!vr) continue;
  // Smaller boards make examples readable.
  const params = { ...vr.params };
  if (params.w > W) {
    const scale = (W * W) / (params.w * params.h);
    params.w = W;
    params.h = W;
    params.pots = params.pots.map((p) => ({ ...p, to: p.to === undefined ? undefined : Math.min(W, p.to), from: p.from === undefined ? undefined : Math.min(W - 1, p.from), dishes: p.dishes.map((d) => ({ ...d, len: Math.max(2, Math.round(d.len * scale)) })) }));
    if (params.stacks) params.stacks = Math.max(2, Math.round(params.stacks * scale));
    if (params.bars) params.bars = params.bars.map((b) => ({ ...b, at: Math.floor(W / 2), to: W }));
  }
  let found = false;
  for (let s = 1; s <= 300 && !found; s++) {
    const b = buildLevel(params, s * 104729 + 3);
    if (!b) continue;
    const lv = b.level;
    const sim = Sim.fromLevel(lv);
    for (let i = 0; i < Math.min(8, lv.solution!.length) && !found; i++) {
      const legal = sim.legalMoves().slice();
      const right = lv.solution![i];
      if (legal.length > 2) {
        const tempting = legal.reduce((a, m) => (moveScore(sim, m) > moveScore(sim, a) ? m : a), legal[0]);
        if (tempting !== right) {
          const probe = sim.clone();
          probe.apply(tempting);
          const res = solve(probe, 200000);
          if (res.status === 'unsolvable') {
            // How the tempting line typically ends: keep playing the best-looking moves.
            const end = probe.clone();
            for (let k = 0; k < 200 && end.status === 'playing'; k++) {
              const ms = end.legalMoves();
              if (!ms.length) break;
              end.apply(ms.reduce((a, m) => (moveScore(end, m) > moveScore(end, a) ? m : a), ms[0]));
            }
            console.log(`### ${vr.label}\n`);
            console.log('```');
            console.log(show(sim));
            console.log('```\n');
            console.log(`Move ${i + 1}. Tempting: **${moveName(sim, tempting)}** (it looks best: ${sim.wouldDeliver(tempting) ? 'a delivery' : 'a park'}). Right: **${moveName(sim, right)}**.`);
            console.log(`After the tempting move the position is lost (proved by the solver, ${res.nodes} positions). Playing on with the best-looking moves ends like this:\n`);
            console.log('```');
            console.log(show(end));
            console.log('```\n');
            found = true;
          }
        }
      }
      sim.apply(right);
    }
  }
  if (!found) console.log(`### ${vr.label}\n\n(no early greedy trap found)\n`);
}
