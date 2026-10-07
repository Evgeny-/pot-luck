import { makeGeometry, tracePath, type Path } from './board';
import { DISH_KINDS } from './ingredients';
import { Rng } from './rng';
import { Sim, bowlMove } from './sim';
import {
  FORM_CHOPPED, FORM_COOKED, WILD, WILD_ING, ingOf, tokenOf,
  type BarDef, type Dir, type DishDef, type DishOrder, type LevelDef, type PadDef, type PotDef, type Rules, type TileDef, type Token,
} from './types';

export interface DishSpec {
  len: number;
  order?: DishOrder;
  base?: number;
  kind?: string;
  /** Share of items that must arrive chopped / cooked (needs a matching bar on the board). */
  formRate?: number;
}

export interface PotSpec {
  side: Dir;
  from?: number;
  to?: number;
  dishes: DishSpec[];
  lid?: number;
}

export interface GenParams {
  w: number;
  h: number;
  pots: PotSpec[];
  rules: Rules;
  /** Ingredient ids recipes are drawn from. */
  palette: number[];
  /** 0..1: chance that a recipe item reuses an ingredient the level already has (copies, twins). */
  repeat: number;
  /** 0..1: chance that the reference line parks an ingredient early when the bowl has room. */
  detour: number;
  /** 0..1: how far ahead parked ingredients may be needed (0 = soon, 1 = any time). */
  horizon: number;
  /** 0..1: how strongly tiles are placed in the lanes of tiles that leave soon after them. */
  tight: number;
  stacks?: number;
  frozen?: number;
  wild?: number;
  pads?: number;
  bars?: BarDef[];
  /** Cells kept empty (decorations / board shape). */
  holes?: number[];
}

/** A tile of the reference line: what it delivers and which pot's edge it leaves through. */
interface TileEvent {
  token: Token;
  pot: number;
  park: boolean;
  /** Pots the tile may slide into: its pot for a delivery; any pot that doesn't want it yet for a park. */
  exits: number[];
}

type Step = { tile: number } | { slot: number; pot: number };

const DEFAULT_KIND = ['soup', 'stew', 'curry', 'salad'];

export function edgeLength(side: Dir, w: number, h: number): number {
  return side === 0 || side === 2 ? w : h;
}

/** Recipes for every pot. Items are distinct where possible; `repeat` asks for copies. */
function makeDishes(p: GenParams, rng: Rng): DishDef[][] {
  const pal = rng.shuffle(p.palette.slice());
  const used: number[] = [];
  let fresh = 0;
  const pick = (avoid: number): number => {
    const reuse = used.filter((i) => i !== avoid);
    if (reuse.length && (fresh >= pal.length || rng.chance(p.repeat))) return rng.pick(reuse);
    while (fresh < pal.length) {
      const i = pal[fresh++];
      if (i !== avoid) {
        used.push(i);
        return i;
      }
    }
    return rng.pick(reuse.length ? reuse : pal);
  };
  const kinds = rng.shuffle(DISH_KINDS.filter((k) => !DEFAULT_KIND.includes(k)));
  let extra = 0;
  return p.pots.map((spec, pi) =>
    spec.dishes.map((d, di) => {
      // A bar across the pot's lanes can chop (or cook) items on their way in.
      const bar = (p.bars ?? []).find((b) => (b.axis === 'h') === (spec.side === 0 || spec.side === 2));
      const form = bar ? (bar.kind === 'knife' ? FORM_CHOPPED : FORM_COOKED) : 0;
      const items: Token[] = [];
      let prev = -1;
      for (let k = 0; k < d.len; k++) {
        const ing = pick(d.order === 'any' ? -1 : prev);
        prev = ing;
        items.push(tokenOf(ing, form && rng.chance(d.formRate ?? 0.5) ? form : 0));
      }
      const kind = d.kind ?? (di === 0 && pi < DEFAULT_KIND.length ? DEFAULT_KIND[spec.side] : kinds[extra++ % kinds.length]);
      return { kind, items, order: d.order ?? 'strict', base: d.base };
    }),
  );
}

export function potsFor(p: GenParams, dishes: DishDef[][]): PotDef[] {
  return p.pots.map((s, i) => ({
    side: s.side,
    from: s.from ?? 0,
    to: s.to ?? edgeLength(s.side, p.w, p.h),
    dishes: dishes[i],
    ...(s.lid !== undefined ? { lid: s.lid } : {}),
  }));
}

/**
 * A virtual cook plays the recipes without a board and decides, step by step, which tile leaves
 * next: one that some pot wants now, or (a detour) one that is needed later and parks in the bowl.
 * The resulting order is a solution of the finished level by construction.
 */
function cook(p: GenParams, pots: PotDef[], rng: Rng): { events: TileEvent[]; steps: Step[] } | null {
  const sim = Sim.fromLevel({ n: 0, w: p.w, h: p.h, tiles: [], pots, rules: p.rules });
  const hold = p.rules.bowlMode === 'hold';
  const tap = p.rules.bowlMode === 'router' && p.rules.bowlDelivery === 'tap';
  // Tiles still to create: per token (router), or per pot and token (hold: a tile belongs to its pot).
  const un = new Map<number, number>();
  const unKey = (pot: number, t: Token) => (hold ? pot * 4096 + t : t);
  pots.forEach((pd, pi) => pd.dishes.forEach((d) => d.items.forEach((t) => un.set(unKey(pi, t), (un.get(unKey(pi, t)) ?? 0) + 1))));
  const events: TileEvent[] = [];
  const steps: Step[] = [];
  const want: number[] = [];
  for (let guard = 0; guard < 2000; guard++) {
    if (sim.status === 'won') return { events, steps };
    if (tap) {
      let sent = false;
      for (let k = 0; k < sim.bowlCap && !sent; k++) {
        if (!sim.bowlFree(k)) continue;
        for (let q = 0; q < pots.length && !sent; q++) {
          if (sim.acceptIndex(q, sim.bowlTok[k]) < 0) continue;
          sim.virtualSend(k, q);
          steps.push({ slot: k, pot: q });
          sent = true;
        }
      }
      if (sent) continue;
    }
    const direct: [number, Token][] = [];
    for (let q = 0; q < pots.length; q++) {
      for (const t of sim.wants(q, want)) if ((un.get(unKey(q, t)) ?? 0) > 0) direct.push([q, t]);
    }
    const room = sim.bowlCap - sim.bowlLen;
    const parks: [number, Token, number, number[]][] = [];
    if (room > 0) {
      for (const [key, count] of un) {
        if (count <= 0) continue;
        const t = hold ? key % 4096 : key;
        if (hold) {
          const q = Math.floor(key / 4096);
          const need = sim.distanceTo(q, t);
          if (need > 0 && need < Infinity) parks.push([q, t, need, [q]]);
          continue;
        }
        let need = Infinity;
        let home = -1;
        for (let q = 0; q < pots.length; q++) {
          const d = sim.distanceTo(q, t);
          if (d < need) {
            need = d;
            home = q;
          }
        }
        if (need === 0 || need === Infinity) continue;
        // The tile slides toward a pot that doesn't want it yet; its own pot looks most natural.
        const wrong = pots.map((_, q) => q).filter((q) => sim.acceptIndex(q, t) < 0);
        if (!wrong.length) continue;
        const exit = wrong.includes(home) ? home : rng.pick(wrong);
        parks.push([exit, t, need, wrong]);
      }
    }
    const parkNow = parks.length > 0 && rng.chance(p.detour * (room === 1 ? 0.45 : 1));
    let pot: number;
    let tok: Token;
    let exits: number[];
    if (parkNow || !direct.length) {
      if (!parks.length) return null;
      const weights = parks.map(([, , need]) => Math.exp(-(need - 1) * (1 - p.horizon) * 0.9));
      [pot, tok, , exits] = parks[rng.weighted(weights)];
    } else {
      [pot, tok] = rng.pick(direct);
      exits = [pot];
    }
    const owner = hold ? pot : 0;
    const delivered = sim.virtualSlide(pot, tok);
    if (delivered === null) return null;
    un.set(unKey(owner, tok), (un.get(unKey(owner, tok)) ?? 0) - 1);
    events.push({ token: tok, pot, park: !delivered, exits: delivered ? [pot] : exits });
    steps.push({ tile: events.length - 1 });
  }
  return null;
}

interface Placed {
  cell: number;
  dir: Dir;
  z: number;
}

/**
 * Puts the tiles on the board in reverse removal order. A tile's lane must avoid every tile placed
 * before it (those leave after it); tiles placed later may sit in its lane. Cells in the lanes of
 * tiles that leave soon after are preferred (`tight`): that is what forces the order and makes
 * detours necessary.
 */
function place(p: GenParams, pots: PotDef[], pads: PadDef[], events: TileEvent[], rng: Rng): Placed[] | null {
  const { w, h } = p;
  const n = w * h;
  const g = makeGeometry(w, h, pots, pads, p.bars ?? []);
  const table: Path[] = [];
  for (let c = 0; c < n; c++) for (let d = 0; d < 4; d++) table.push(tracePath(g, c % w, Math.floor(c / w), d as Dir));
  const blocked = new Uint8Array(n);
  for (const pd of pads) blocked[pd.y * w + pd.x] = 1;
  for (const c of p.holes ?? []) blocked[c] = 1;
  const top = new Int16Array(n).fill(-1);
  const height = new Uint8Array(n);
  const out: Placed[] = new Array(events.length);
  let stacksLeft = p.stacks ?? 0;
  // Per cell: placed tiles whose lane runs through it, with their removal index.
  const lanesThrough: number[][] = Array.from({ length: n }, () => []);
  for (let e = events.length - 1; e >= 0; e--) {
    const ev = events[e];
    const cands: { c: number; d: Dir; w: number }[] = [];
    for (let c = 0; c < n; c++) {
      if (blocked[c]) continue;
      const free = top[c] < 0;
      if (!free && (stacksLeft <= 0 || height[c] >= 2)) continue;
      // Lanes through this cell belong to tiles that leave later: a tile here must be gone first.
      let soon = 0;
      for (const j of lanesThrough[c]) soon += 1 / (1 + (j - e) * 0.5);
      let around = 0;
      const x = c % w;
      const y = (c - x) / w;
      if (x > 0 && top[c - 1] >= 0) around++;
      if (x + 1 < w && top[c + 1] >= 0) around++;
      if (y > 0 && top[c - w] >= 0) around++;
      if (y + 1 < h && top[c + w] >= 0) around++;
      for (let d = 0; d < 4; d++) {
        const path = table[c * 4 + d];
        if (path.pot < 0 || !ev.exits.includes(path.pot)) continue;
        if (ev.token !== WILD && tokenOf(ingOf(ev.token), path.form) !== ev.token) continue;
        let ok = true;
        for (const x2 of path.cells) {
          if (top[x2] >= 0 || (x2 === c && !free)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        let wgt = Math.pow(1 + 3 * soon, 4 * p.tight) * (1 + 0.35 * around);
        if (!free) wgt *= 6;
        // Lanes bent by pads are the point of a pad level; a park prefers the pot it is meant for.
        if (path.turns) wgt *= 2.5;
        if (path.pot === ev.pot) wgt *= 1.5;
        cands.push({ c, d: d as Dir, w: wgt });
      }
    }
    if (!cands.length) return null;
    const pick = cands[rng.weighted(cands.map((x) => x.w))];
    const stacked = top[pick.c] >= 0;
    if (stacked) stacksLeft--;
    out[e] = { cell: pick.c, dir: pick.d, z: height[pick.c] };
    top[pick.c] = e;
    height[pick.c]++;
    for (const x2 of table[pick.c * 4 + pick.d].cells) lanesThrough[x2].push(e);
  }
  return out;
}

function randomPads(p: GenParams, pots: PotDef[], rng: Rng): PadDef[] {
  const count = p.pads ?? 0;
  if (!count) return [];
  const { w, h } = p;
  const out: PadDef[] = [];
  const sides = new Set(pots.map((q) => q.side));
  for (let tries = 0; tries < 200 && out.length < count; tries++) {
    // Pads sit inside the board so that lanes from several directions run over them.
    const x = rng.int(1, w - 2);
    const y = rng.int(1, h - 2);
    if (out.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) < 2)) continue;
    const dirs = ([0, 1, 2, 3] as Dir[]).filter((d) => sides.has(d));
    out.push({ x, y, dir: rng.pick(dirs) });
  }
  return out;
}

export interface Built {
  level: LevelDef;
  /** Bowl uses of the reference line. */
  parks: number;
}

/** One attempt at a level for these parameters (null if this seed doesn't work out). */
export function buildLevel(p: GenParams, seed: number): Built | null {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < 30; attempt++) {
    const dishes = makeDishes(p, rng);
    const pots = potsFor(p, dishes);
    const pads = randomPads(p, pots, rng);
    const plan = cook(p, pots, rng);
    if (!plan) continue;
    if (plan.events.length > p.w * p.h - pads.length - (p.holes?.length ?? 0) + (p.stacks ?? 0)) return null;
    // Wild spice replaces a few tiles that go straight into their pot.
    const wildable = plan.events.map((e, i) => (e.park ? -1 : i)).filter((i) => i >= 0);
    rng.shuffle(wildable);
    for (const i of wildable.slice(0, p.wild ?? 0)) plan.events[i] = { ...plan.events[i], token: WILD };
    const placed = place(p, pots, pads, plan.events, rng);
    if (!placed) continue;
    if (pads.length && !pads.every((pd) => placed.some((pl) => tracePath(makeGeometry(p.w, p.h, pots, pads, p.bars), pl.cell % p.w, Math.floor(pl.cell / p.w), pl.dir).cells.includes(pd.y * p.w + pd.x)))) continue;
    const level = assemble(p, pots, pads, plan, placed, rng);
    if (!level) continue;
    return { level, parks: plan.events.filter((e) => e.park).length };
  }
  return null;
}

function assemble(p: GenParams, pots: PotDef[], pads: PadDef[], plan: { events: TileEvent[]; steps: Step[] }, placed: Placed[], rng: Rng): LevelDef | null {
  const { w } = p;
  // Tile ids in reading order (they say nothing about the solution).
  const order = placed.map((pl, e) => ({ pl, e })).sort((a, b) => a.pl.cell - b.pl.cell || a.pl.z - b.pl.z);
  const idOf = new Int16Array(placed.length);
  const tiles: TileDef[] = order.map(({ pl, e }, id) => {
    idOf[e] = id;
    const tok = plan.events[e].token;
    const t: TileDef = { id, x: pl.cell % w, y: Math.floor(pl.cell / w), dir: pl.dir, ing: tok === WILD ? WILD_ING : ingOf(tok) };
    if (pl.z) t.z = pl.z;
    return t;
  });
  // Frozen tiles: thawed in the reference line by a neighbour that leaves shortly before them.
  if (p.frozen) {
    const time = new Int16Array(placed.length);
    plan.events.forEach((_, e) => (time[idOf[e]] = e));
    const cand: { id: number; gap: number }[] = [];
    for (const t of tiles) {
      if (t.z) continue;
      let first = Infinity;
      for (const o of tiles) {
        if (Math.abs(o.x - t.x) + Math.abs(o.y - t.y) !== 1) continue;
        first = Math.min(first, time[o.id]);
      }
      if (first < time[t.id]) cand.push({ id: t.id, gap: time[t.id] - first });
    }
    rng.shuffle(cand);
    cand.sort((a, b) => a.gap - b.gap);
    for (const c of cand.slice(0, p.frozen)) tiles[c.id].frozen = true;
  }
  const solution = plan.steps.map((s) => ('tile' in s ? idOf[s.tile] : bowlMove(s.slot, s.pot)));
  const level: LevelDef = { n: 0, w: p.w, h: p.h, tiles, pots, rules: { ...p.rules }, solution };
  if (pads.length) level.pads = pads;
  if (p.bars?.length) level.bars = p.bars.map((b) => ({ ...b }));
  if (!replay(level, solution)) return null;
  return level;
}

/** Plays moves in order; true when the level is won. */
export function replay(level: LevelDef, moves: number[]): boolean {
  const sim = Sim.fromLevel(level);
  for (const m of moves) if (!sim.apply(m)) return false;
  return sim.status === 'won';
}
