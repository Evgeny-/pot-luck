import { INGREDIENTS, WILD_INFO } from './ingredients';
import { Sim } from './sim';
import { DIR_CHAR, SIDE_NAME, WILD, formOf, ingOf, type LevelDef, type Token } from './types';

export function tokenName(t: Token): string {
  if (t === WILD) return WILD_INFO.abbr;
  const ing = INGREDIENTS[ingOf(t)];
  const f = formOf(t);
  return (ing ? ing.abbr : '?') + (f & 1 ? '/' : '') + (f & 2 ? '~' : '');
}

function dishLine(sim: Sim, p: number): string {
  const pot = sim.level.pots[p];
  const parts: string[] = [];
  pot.dishes.forEach((d, di) => {
    const cur = di === sim.potDish[p];
    const done = di < sim.potDish[p];
    const want = cur ? sim.wants(p) : [];
    const items = d.items.map((t, i) => {
      const got = done || (cur && (sim.potGot[p] >> i) & 1);
      const n = tokenName(t);
      if (got) return n.toLowerCase() + '✓';
      if (cur && want.includes(t) && sim.acceptIndex(p, t) === i) return `[${n}]`;
      return n;
    });
    const order = d.order === 'any' ? ' (any)' : d.order === 'base' ? ` (first ${d.base ?? 1})` : '';
    parts.push(`${d.kind}${order}: ${items.join(' ')}`);
  });
  const lid = pot.lid !== undefined ? ` 🔒 after pot ${pot.lid}${sim.potOpen(p) ? ' (open)' : ''}` : '';
  const span = `${SIDE_NAME[pot.side]}[${pot.from},${pot.to})`;
  return `  pot ${p} ${span}${lid}: ${parts.join(' → ')}${sim.potDone(p) ? '  SERVED' : ''}`;
}

/** Board, pots and bowl as text. Cells: ingredient letter, arrow, and '+' when a tile is underneath. */
export function show(simOrLevel: Sim | LevelDef): string {
  const sim = simOrLevel instanceof Sim ? simOrLevel : Sim.fromLevel(simOrLevel);
  const lv = sim.level;
  const { w, h } = lv;
  const grid: string[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ' . '));
  for (const p of lv.pads ?? []) grid[p.y][p.x] = ' ' + '⇧⇨⇩⇦'[p.dir] + ' ';
  const top = new Map<number, number>();
  for (const t of lv.tiles) {
    if (!sim.present[t.id]) continue;
    const c = t.y * w + t.x;
    const cur = top.get(c);
    if (cur === undefined || (lv.tiles[cur].z ?? 0) < (t.z ?? 0)) top.set(c, t.id);
  }
  for (const [c, id] of top) {
    const t = lv.tiles[id];
    const under = sim.occ[c] > 1 ? '+' : sim.isFrozen(id) ? '*' : ' ';
    const name = t.ing * 4 === WILD ? WILD_INFO.abbr : INGREDIENTS[t.ing]?.abbr ?? '?';
    grid[t.y][t.x] = name + DIR_CHAR[t.dir] + under;
  }
  const hbar = new Set<string>();
  const vbar = new Set<string>();
  for (const b of lv.bars ?? []) {
    for (let k = b.from; k < b.to; k++) (b.axis === 'h' ? hbar : vbar).add(`${b.at},${k}`);
  }
  const lines: string[] = [];
  const border = '+' + '-'.repeat(w * 3) + '+';
  lines.push('   ' + Array.from({ length: w }, (_, x) => ` ${x} `).join(''));
  lines.push('  ' + border);
  for (let y = 0; y < h; y++) {
    if (y > 0 && [...Array(w).keys()].some((x) => hbar.has(`${y},${x}`))) {
      lines.push('  |' + Array.from({ length: w }, (_, x) => (hbar.has(`${y},${x}`) ? '===' : '   ')).join('') + '|');
    }
    let row = '';
    for (let x = 0; x < w; x++) row += (x > 0 && vbar.has(`${x},${y}`) ? '‖' : '') + grid[y][x];
    lines.push(`${y} |${row}|`);
  }
  lines.push('  ' + border);
  for (let p = 0; p < lv.pots.length; p++) lines.push(dishLine(sim, p));
  const bowl: string[] = [];
  for (let k = 0; k < sim.bowlCap; k++) bowl.push(sim.bowlTok[k] >= 0 ? tokenName(sim.bowlTok[k]) : '_');
  const r = lv.rules;
  lines.push(`  bowl (${r.bowlMode}${r.bowlOrder === 'lifo' ? ', skewer' : ''}${r.bowlDelivery === 'tap' ? ', tap' : ''}): [${bowl.join(' ')}]  status: ${sim.status}`);
  return lines.join('\n');
}

export function moveName(sim: Sim, m: number): string {
  if (m >= 1024) {
    const slot = (m - 1024) >> 4;
    const pot = (m - 1024) & 15;
    return `bowl[${slot}]→pot ${pot}`;
  }
  const t = sim.level.tiles[m];
  return `${tokenName(sim.tileToken(m))}@${t.x},${t.y}${DIR_CHAR[t.dir]}`;
}
