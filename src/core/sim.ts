import { geometryOf, tracePath, type Geometry } from './board';
import { WILD, tokenOf, type LevelDef, type Rules, type Token } from './types';

/**
 * Deterministic rules, shared by the game, the solver and the level generator.
 *
 * - Tapping a tile on top of its cell: if every cell of its lane is empty it slides off the board
 *   into the pot on that stretch of edge. The pot takes it if it is the next item of its dish
 *   (any remaining item for 'any' dishes); otherwise it drops into the bowl. A full bowl, a wall at
 *   the end of the lane, or a frozen tile (no neighbour has left yet) means the tap does nothing.
 * - Bowl items go to pots that want them: automatically, or on a tap ('router' + 'tap'). In 'hold'
 *   mode an item only ever goes to the pot it slid into. A 'lifo' bowl only releases its last item.
 * - A pot with a lid takes nothing until the pot named by the lid has served all its dishes.
 * - Ice and cloches hold a tile (a cloche also hides it) until a tile in a neighbouring cell has
 *   left; a timer holds it until that many ingredients have gone into pots.
 * - Tied tiles leave together: the tapped one first, then its partner, and only if both can go.
 * - Won when every pot has served everything. Stuck when no move is legal.
 */

/** Moves are numbers: a tile id, or BOWL_MOVE + slot * 16 + pot for sending a bowl item. */
export const BOWL_MOVE = 1024;
export const bowlMove = (slot: number, pot: number): number => BOWL_MOVE + slot * 16 + pot;
export const isBowlMove = (m: number): boolean => m >= BOWL_MOVE;
export const bowlMoveSlot = (m: number): number => (m - BOWL_MOVE) >> 4;
export const bowlMovePot = (m: number): number => (m - BOWL_MOVE) & 15;

export type SimEvent =
  | { t: 'slide'; tile: number; cells: number[]; pot: number; into: 'pot' | 'bowl'; token: Token; item: number; slot: number; partner?: boolean }
  | { t: 'bowlOut'; slot: number; pot: number; token: Token; item: number }
  | { t: 'dish'; pot: number; dish: number; last: boolean }
  | { t: 'lid'; pot: number }
  | { t: 'reveal'; tile: number }
  | { t: 'thaw'; tile: number }
  | { t: 'uncover'; tile: number }
  | { t: 'unlock'; tile: number }
  | { t: 'won' }
  | { t: 'stuck' };

export type SimStatus = 'playing' | 'won' | 'stuck';
export type TapCheck = 'ok' | 'gone' | 'under' | 'frozen' | 'covered' | 'timer' | 'blocked' | 'wall' | 'full' | 'partner';

const ORDER_STRICT = 0;
const ORDER_ANY = 1;
const ORDER_BASE = 2;

function popcount(v: number): number {
  let n = 0;
  for (; v; v &= v - 1) n++;
  return n;
}

interface DishShared {
  kind: string;
  items: Int16Array;
  order: number;
  /** Mask of the items that must come first (base dishes). */
  baseMask: number;
  full: number;
}

interface PotShared {
  side: number;
  lid: number;
  dishes: DishShared[];
}

interface Shared {
  level: LevelDef;
  g: Geometry;
  rules: Rules;
  w: number;
  h: number;
  T: number;
  cell: Int16Array;
  z: Uint8Array;
  /** 1: frozen (ice), 2: under a cloche — both wait for a neighbouring tile to leave. */
  wait: Uint8Array;
  /** Deliveries needed before the tile unlocks (0: none). */
  timer: Int16Array;
  /** Tied partner tile, or -1. */
  partner: Int16Array;
  /** Tiles with a timer, for unlock events. */
  timed: number[];
  ing: Uint8Array;
  /** What each tile becomes on its way (form from bars), and where it lands (-1: wall). */
  token: Int16Array;
  pot: Int8Array;
  path: Int16Array[];
  /** Tiles stacked above each tile. */
  above: Int16Array[];
  /** Tile directly below each tile (-1: none). */
  below: Int16Array;
  /** Tiles in the four neighbouring cells (thaw a frozen tile). */
  nbr: Int16Array[];
  zobA: Int32Array;
  zobB: Int32Array;
  pots: PotShared[];
  /** Pots each pot's lid waits for, inverted: pots that open when pot p is done. */
  opens: number[][];
  totalItems: number;
}

export class Sim {
  readonly s: Shared;
  present: Uint8Array;
  occ: Uint8Array;
  left: number;
  potDish: Int8Array;
  potGot: Int32Array;
  /** Bowl spots: token or -1. A lifo bowl is filled from spot 0 without gaps. */
  bowlTok: Int16Array;
  /** 'hold' mode: pot a bowl item waits for. */
  bowlPot: Int8Array;
  bowlLen: number;
  status: SimStatus;
  hashA: number;
  hashB: number;
  taps: number;
  /** Bowl uses so far (fewer = more stars). */
  parks: number;
  delivered: number;

  private constructor(s: Shared) {
    this.s = s;
    this.present = new Uint8Array(0);
    this.occ = new Uint8Array(0);
    this.left = 0;
    this.potDish = new Int8Array(0);
    this.potGot = new Int32Array(0);
    this.bowlTok = new Int16Array(0);
    this.bowlPot = new Int8Array(0);
    this.bowlLen = 0;
    this.status = 'playing';
    this.hashA = 0;
    this.hashB = 0;
    this.taps = 0;
    this.parks = 0;
    this.delivered = 0;
  }

  static fromLevel(level: LevelDef): Sim {
    const g = geometryOf(level);
    const { w, h } = level;
    const T = level.tiles.length;
    const cell = new Int16Array(T);
    const z = new Uint8Array(T);
    const wait = new Uint8Array(T);
    const timer = new Int16Array(T);
    const partner = new Int16Array(T).fill(-1);
    const ing = new Uint8Array(T);
    const token = new Int16Array(T);
    const pot = new Int8Array(T);
    const path: Int16Array[] = [];
    level.tiles.forEach((t, i) => {
      if (t.id !== i) throw new Error(`tile ids must be 0..n-1 in order (tile ${i} has id ${t.id})`);
      cell[i] = t.y * w + t.x;
      z[i] = t.z ?? 0;
      wait[i] = t.hidden ? 2 : t.frozen ? 1 : 0;
      timer[i] = t.timer ?? 0;
      ing[i] = t.ing;
      const p = tracePath(g, t.x, t.y, t.dir);
      path.push(Int16Array.from(p.cells));
      pot[i] = p.pot;
      token[i] = tokenOf(t.ing, p.form);
      if (t.ing * 4 === WILD) token[i] = WILD;
    });
    const byCell = new Map<number, number[]>();
    for (let i = 0; i < T; i++) byCell.set(cell[i], [...(byCell.get(cell[i]) ?? []), i]);
    const links = new Map<number, number[]>();
    level.tiles.forEach((t, i) => { if (t.link !== undefined) links.set(t.link, [...(links.get(t.link) ?? []), i]); });
    for (const pair of links.values()) {
      if (pair.length !== 2) throw new Error('a link ties exactly two tiles');
      partner[pair[0]] = pair[1];
      partner[pair[1]] = pair[0];
    }
    const timed: number[] = [];
    for (let i = 0; i < T; i++) if (timer[i] > 0) timed.push(i);
    const above: Int16Array[] = [];
    const below = new Int16Array(T).fill(-1);
    const nbr: Int16Array[] = [];
    for (let i = 0; i < T; i++) {
      const same = byCell.get(cell[i])!;
      above.push(Int16Array.from(same.filter((j) => z[j] > z[i])));
      let best = -1;
      for (const j of same) if (z[j] < z[i] && (best < 0 || z[j] > z[best])) best = j;
      below[i] = best;
      const x = cell[i] % w;
      const y = (cell[i] - x) / w;
      const around: number[] = [];
      for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        around.push(...(byCell.get(ny * w + nx) ?? []));
      }
      nbr.push(Int16Array.from(around));
    }
    const zobA = new Int32Array(T);
    const zobB = new Int32Array(T);
    let seed = 0x2545f491;
    for (let i = 0; i < T; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      zobA[i] = seed;
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      zobB[i] = seed;
    }
    let totalItems = 0;
    const pots: PotShared[] = level.pots.map((p) => ({
      side: p.side,
      lid: p.lid ?? -1,
      dishes: p.dishes.map((d) => {
        totalItems += d.items.length;
        const n = d.items.length;
        const base = d.order === 'base' ? Math.min(n, d.base ?? 1) : 0;
        return {
          kind: d.kind,
          items: Int16Array.from(d.items),
          order: d.order === 'any' ? ORDER_ANY : d.order === 'base' ? ORDER_BASE : ORDER_STRICT,
          baseMask: (1 << base) - 1,
          full: n >= 31 ? -1 : (1 << n) - 1,
        };
      }),
    }));
    const opens = pots.map(() => [] as number[]);
    pots.forEach((p, i) => { if (p.lid >= 0) opens[p.lid].push(i); });

    const sim = new Sim({
      level, g, rules: level.rules, w, h, T, cell, z, wait, timer, partner, timed, ing, token, pot, path, above, below, nbr,
      zobA, zobB, pots, opens, totalItems,
    });
    sim.present = new Uint8Array(T).fill(1);
    sim.occ = new Uint8Array(w * h);
    for (let i = 0; i < T; i++) sim.occ[cell[i]]++;
    sim.left = T;
    sim.potDish = new Int8Array(pots.length);
    sim.potGot = new Int32Array(pots.length);
    const cap = Math.max(0, level.rules.bowl);
    sim.bowlTok = new Int16Array(cap).fill(-1);
    sim.bowlPot = new Int8Array(cap).fill(-1);
    return sim;
  }

  clone(): Sim {
    const c = new Sim(this.s);
    c.present = this.present.slice();
    c.occ = this.occ.slice();
    c.left = this.left;
    c.potDish = this.potDish.slice();
    c.potGot = this.potGot.slice();
    c.bowlTok = this.bowlTok.slice();
    c.bowlPot = this.bowlPot.slice();
    c.bowlLen = this.bowlLen;
    c.status = this.status;
    c.hashA = this.hashA;
    c.hashB = this.hashB;
    c.taps = this.taps;
    c.parks = this.parks;
    c.delivered = this.delivered;
    return c;
  }

  get level(): LevelDef { return this.s.level; }
  get tileCount(): number { return this.s.T; }
  get potCount(): number { return this.s.pots.length; }
  get bowlCap(): number { return this.bowlTok.length; }
  get totalItems(): number { return this.s.totalItems; }

  // ------------------------------------------------------------------ pots

  potDone(p: number): boolean {
    return this.potDish[p] >= this.s.pots[p].dishes.length;
  }

  potOpen(p: number): boolean {
    const lid = this.s.pots[p].lid;
    return lid < 0 || this.potDone(lid);
  }

  /** Index of the dish item `token` would fill in pot p right now, or -1. */
  acceptIndex(p: number, token: Token): number {
    const pot = this.s.pots[p];
    const d = this.potDish[p];
    if (d >= pot.dishes.length) return -1;
    if (pot.lid >= 0 && !this.potDone(pot.lid)) return -1;
    const dish = pot.dishes[d];
    const got = this.potGot[p];
    const items = dish.items;
    if (dish.order === ORDER_STRICT || (dish.order === ORDER_BASE && (got & dish.baseMask) !== dish.baseMask)) {
      let i = 0;
      while ((got >> i) & 1) i++;
      return token === WILD || items[i] === token ? i : -1;
    }
    for (let i = 0; i < items.length; i++) {
      if ((got >> i) & 1) continue;
      if (token === WILD || items[i] === token) return i;
    }
    return -1;
  }

  /** Tokens pot p would accept right now (one entry per acceptable item). */
  wants(p: number, out: number[] = []): number[] {
    out.length = 0;
    const pot = this.s.pots[p];
    const d = this.potDish[p];
    if (d >= pot.dishes.length || !this.potOpen(p)) return out;
    const dish = pot.dishes[d];
    const got = this.potGot[p];
    if (dish.order === ORDER_STRICT || (dish.order === ORDER_BASE && (got & dish.baseMask) !== dish.baseMask)) {
      let i = 0;
      while ((got >> i) & 1) i++;
      out.push(dish.items[i]);
      return out;
    }
    for (let i = 0; i < dish.items.length; i++) if (!((got >> i) & 1)) out.push(dish.items[i]);
    return out;
  }

  /**
   * How many deliveries pot p is away from wanting `token` (0 = wants it now), counting its whole
   * remaining dish queue; Infinity if it never will. 'any' dishes count as 0 for all their items.
   */
  distanceTo(p: number, token: Token): number {
    const pot = this.s.pots[p];
    let steps = 0;
    for (let d = this.potDish[p]; d < pot.dishes.length; d++) {
      const dish = pot.dishes[d];
      const got = d === this.potDish[p] ? this.potGot[p] : 0;
      const n = dish.items.length;
      const match = (i: number) => !((got >> i) & 1) && (dish.items[i] === token || token === WILD);
      // Items that must come in order: all of a strict dish, the prefix of a base dish.
      const ordered = dish.order === ORDER_STRICT ? n : dish.order === ORDER_BASE ? popcount(dish.baseMask) : 0;
      let k = 0;
      for (let i = 0; i < ordered; i++) {
        if ((got >> i) & 1) continue;
        if (match(i)) return steps + k;
        k++;
      }
      for (let i = ordered; i < n; i++) if (match(i)) return steps + k;
      for (let i = 0; i < n; i++) if (!((got >> i) & 1)) steps++;
    }
    return Infinity;
  }

  private deliver(p: number, item: number, ev?: SimEvent[]): void {
    const pot = this.s.pots[p];
    const d = this.potDish[p];
    const dish = pot.dishes[d];
    const got = this.potGot[p] | (1 << item);
    this.delivered++;
    if (ev) for (const t of this.s.timed) if (this.s.timer[t] === this.delivered && this.present[t]) ev.push({ t: 'unlock', tile: t });
    if (got === dish.full) {
      this.potDish[p] = d + 1;
      this.potGot[p] = 0;
      const last = d + 1 >= pot.dishes.length;
      ev?.push({ t: 'dish', pot: p, dish: d, last });
      if (last) for (const q of this.s.opens[p]) ev?.push({ t: 'lid', pot: q });
    } else this.potGot[p] = got;
  }

  // ------------------------------------------------------------------ tiles

  /** Tile is still on the board and nothing sits on top of it. */
  isTop(i: number): boolean {
    if (!this.present[i]) return false;
    const up = this.s.above[i];
    for (let k = 0; k < up.length; k++) if (this.present[up[k]]) return false;
    return true;
  }

  /** Still waiting for a neighbour to leave (ice or cloche). */
  private waiting(i: number): boolean {
    if (!this.s.wait[i]) return false;
    const nb = this.s.nbr[i];
    for (let k = 0; k < nb.length; k++) if (!this.present[nb[k]]) return false;
    return true;
  }

  isFrozen(i: number): boolean {
    return this.s.wait[i] === 1 && this.waiting(i);
  }

  /** Under a cloche: hidden, and can't be tapped yet. */
  isCovered(i: number): boolean {
    return this.s.wait[i] === 2 && this.waiting(i);
  }

  /** Deliveries still needed before a timer tile unlocks (0 when free). */
  timerLeft(i: number): number {
    return Math.max(0, this.s.timer[i] - this.delivered);
  }

  /** Can't be tapped for now: ice, cloche or timer. */
  isLocked(i: number): boolean {
    return this.waiting(i) || this.s.timer[i] > this.delivered;
  }

  partnerOf(i: number): number {
    return this.s.partner[i];
  }

  /** First cell of tile i's lane that is occupied, or -1 if the lane is clear. */
  blockedAt(i: number): number {
    const path = this.s.path[i];
    const own = this.s.cell[i];
    for (let k = 0; k < path.length; k++) {
      const c = path[k];
      if (this.occ[c] > (c === own ? 1 : 0)) return c;
    }
    return -1;
  }

  /** The tile on top of a cell, or -1. */
  topAt(cell: number): number {
    let best = -1;
    for (let i = 0; i < this.s.T; i++) {
      if (!this.present[i] || this.s.cell[i] !== cell) continue;
      if (best < 0 || this.s.z[i] > this.s.z[best]) best = i;
    }
    return best;
  }

  tileToken(i: number): Token { return this.s.token[i]; }
  tilePot(i: number): number { return this.s.pot[i]; }
  tileCell(i: number): number { return this.s.cell[i]; }
  tilePath(i: number): Int16Array { return this.s.path[i]; }

  /** What happens if tile i is tapped now (ignoring its tied partner). */
  private checkOne(i: number): TapCheck {
    if (this.status !== 'playing') return 'gone';
    if (!this.present[i]) return 'gone';
    if (!this.isTop(i)) return 'under';
    if (this.isCovered(i)) return 'covered';
    if (this.isFrozen(i)) return 'frozen';
    if (this.s.timer[i] > this.delivered) return 'timer';
    if (this.blockedAt(i) >= 0) return 'blocked';
    const p = this.s.pot[i];
    if (p < 0) return 'wall';
    if (this.acceptIndex(p, this.s.token[i]) >= 0) return 'ok';
    return this.bowlLen < this.bowlTok.length ? 'ok' : 'full';
  }

  /** What happens if tile i is tapped now; a tied tile also needs its partner to be able to follow. */
  check(i: number): TapCheck {
    const c = this.checkOne(i);
    if (c !== 'ok') return c;
    const j = this.s.partner[i];
    if (j < 0 || !this.present[j]) return 'ok';
    const trial = this.clone();
    trial.tapOne(i);
    return trial.checkOne(j) === 'ok' ? 'ok' : 'partner';
  }

  /** Would tile i (with a clear lane) land in its pot (true) or in the bowl (false)? */
  wouldDeliver(i: number): boolean {
    const p = this.s.pot[i];
    return p >= 0 && this.acceptIndex(p, this.s.token[i]) >= 0;
  }

  // ------------------------------------------------------------------ moves

  legalMoves(out: number[] = []): number[] {
    out.length = 0;
    if (this.status !== 'playing') return out;
    const s = this.s;
    const room = this.bowlLen < this.bowlTok.length;
    for (let i = 0; i < s.T; i++) {
      if (!this.present[i]) continue;
      if (!this.isTop(i) || this.isLocked(i)) continue;
      const p = s.pot[i];
      if (p < 0) continue;
      if (this.blockedAt(i) >= 0) continue;
      if (!room && this.acceptIndex(p, s.token[i]) < 0) continue;
      if (s.partner[i] >= 0 && this.present[s.partner[i]] && this.check(i) !== 'ok') continue;
      out.push(i);
    }
    if (s.rules.bowlDelivery === 'tap' && s.rules.bowlMode === 'router' && this.bowlLen) {
      const lifo = s.rules.bowlOrder === 'lifo';
      const seen: number[] = [];
      for (let k = 0; k < this.bowlTok.length; k++) {
        const tok = this.bowlTok[k];
        if (tok < 0) continue;
        if (lifo && k !== this.bowlLen - 1) continue;
        if (seen.includes(tok)) continue;
        seen.push(tok);
        for (let p = 0; p < s.pots.length; p++) if (this.acceptIndex(p, tok) >= 0) out.push(bowlMove(k, p));
      }
    }
    return out;
  }

  apply(m: number, ev?: SimEvent[]): boolean {
    if (this.status !== 'playing') return false;
    if (isBowlMove(m)) return this.sendFromBowl(bowlMoveSlot(m), bowlMovePot(m), ev);
    return this.tap(m, ev);
  }

  private tap(i: number, ev?: SimEvent[]): boolean {
    const s = this.s;
    if (i < 0 || i >= s.T || this.check(i) !== 'ok') return false;
    this.tapOne(i, ev);
    const j = s.partner[i];
    if (j >= 0 && this.present[j]) this.tapOne(j, ev, true);
    this.checkWon(ev);
    return true;
  }

  /** One tile leaves (its checks already passed). */
  private tapOne(i: number, ev?: SimEvent[], partner = false): void {
    const s = this.s;
    const p = s.pot[i];
    const tok = s.token[i];
    const item = this.acceptIndex(p, tok);
    // Leave the board.
    this.present[i] = 0;
    this.occ[s.cell[i]]--;
    this.left--;
    this.hashA ^= s.zobA[i];
    this.hashB ^= s.zobB[i];
    this.taps++;
    let slot = -1;
    const mark = partner || undefined;
    if (item >= 0) {
      ev?.push({ t: 'slide', tile: i, cells: Array.from(s.path[i]), pot: p, into: 'pot', token: tok, item, slot: -1, partner: mark });
      this.deliver(p, item, ev);
    } else {
      slot = this.bowlPut(tok, p);
      this.parks++;
      ev?.push({ t: 'slide', tile: i, cells: Array.from(s.path[i]), pot: p, into: 'bowl', token: tok, item: -1, slot, partner: mark });
    }
    if (ev) {
      const b = s.below[i];
      if (b >= 0 && this.present[b]) ev.push({ t: 'reveal', tile: b });
      // Neighbours that were frozen or under a cloche until now.
      for (const j of s.nbr[i]) {
        if (!s.wait[j] || !this.present[j]) continue;
        let others = false;
        for (const k of s.nbr[j]) if (k !== i && !this.present[k]) others = true;
        if (!others) ev.push(s.wait[j] === 2 ? { t: 'uncover', tile: j } : { t: 'thaw', tile: j });
      }
    }
    this.autoBowl(ev);
  }

  private bowlPut(tok: Token, pot: number): number {
    const lifo = this.s.rules.bowlOrder === 'lifo';
    let k = lifo ? this.bowlLen : this.bowlTok.indexOf(-1);
    if (k < 0) k = this.bowlLen;
    this.bowlTok[k] = tok;
    this.bowlPot[k] = this.s.rules.bowlMode === 'hold' ? pot : -1;
    this.bowlLen++;
    return k;
  }

  private bowlTake(k: number): void {
    this.bowlTok[k] = -1;
    this.bowlPot[k] = -1;
    this.bowlLen--;
  }

  /** Can bowl spot k leave now (a lifo bowl only lets its last item go)? */
  bowlFree(k: number): boolean {
    if (this.bowlTok[k] < 0) return false;
    return this.s.rules.bowlOrder !== 'lifo' || k === this.bowlLen - 1;
  }

  private sendFromBowl(k: number, p: number, ev?: SimEvent[]): boolean {
    const s = this.s;
    if (s.rules.bowlDelivery !== 'tap' || s.rules.bowlMode !== 'router') return false;
    if (k < 0 || k >= this.bowlTok.length || !this.bowlFree(k)) return false;
    if (p < 0 || p >= s.pots.length) return false;
    const tok = this.bowlTok[k];
    const item = this.acceptIndex(p, tok);
    if (item < 0) return false;
    this.bowlTake(k);
    this.taps++;
    ev?.push({ t: 'bowlOut', slot: k, pot: p, token: tok, item });
    this.deliver(p, item, ev);
    this.checkWon(ev);
    return true;
  }

  /** Pots take what they need from the bowl ('hold' mode, or 'auto' delivery). */
  private autoBowl(ev?: SimEvent[]): void {
    const r = this.s.rules;
    if (!this.bowlLen || (r.bowlMode === 'router' && r.bowlDelivery === 'tap')) return;
    const lifo = r.bowlOrder === 'lifo';
    for (let guard = 0; guard < 64 && this.bowlLen; guard++) {
      let moved = false;
      for (let k = lifo ? this.bowlLen - 1 : 0; k < this.bowlTok.length; k++) {
        const tok = this.bowlTok[k];
        if (tok < 0) continue;
        let target = -1;
        let item = -1;
        if (r.bowlMode === 'hold') {
          target = this.bowlPot[k];
          item = this.acceptIndex(target, tok);
        } else {
          for (let p = 0; p < this.s.pots.length && item < 0; p++) {
            item = this.acceptIndex(p, tok);
            target = p;
          }
        }
        if (item >= 0) {
          this.bowlTake(k);
          ev?.push({ t: 'bowlOut', slot: k, pot: target, token: tok, item });
          this.deliver(target, item, ev);
          moved = true;
          break;
        }
        if (lifo) break;
      }
      if (!moved) break;
    }
  }

  private checkWon(ev?: SimEvent[]): void {
    if (this.status !== 'playing') return;
    for (let p = 0; p < this.s.pots.length; p++) if (!this.potDone(p)) return;
    if (this.left > 0 || this.bowlLen > 0) return;
    this.status = 'won';
    ev?.push({ t: 'won' });
  }

  /** Marks the position stuck when nothing can be played. */
  checkStuck(ev?: SimEvent[]): boolean {
    if (this.status !== 'playing') return this.status === 'stuck';
    if (this.legalMoves().length === 0) {
      this.status = 'stuck';
      ev?.push({ t: 'stuck' });
      return true;
    }
    return false;
  }

  unstick(): void {
    if (this.status === 'stuck') this.status = 'playing';
  }

  // ------------------------------------------------------------------ level generator helpers

  /** A tile that isn't on the board lands in pot p (true) or in the bowl (false); null if neither. */
  virtualSlide(p: number, token: Token, ev?: SimEvent[]): boolean | null {
    const item = this.acceptIndex(p, token);
    if (item >= 0) {
      this.deliver(p, item, ev);
    } else {
      if (this.bowlLen >= this.bowlTok.length) return null;
      this.bowlPut(token, p);
      this.parks++;
    }
    this.autoBowl(ev);
    this.checkWon(ev);
    return item >= 0;
  }

  /** Sends bowl spot k to pot p ('router' + 'tap' rules). */
  virtualSend(k: number, p: number): boolean {
    return this.sendFromBowl(k, p);
  }

  /** Booster: one more bowl spot. */
  addBowlSpot(): void {
    const tok = new Int16Array(this.bowlTok.length + 1).fill(-1);
    tok.set(this.bowlTok);
    const pot = new Int8Array(this.bowlPot.length + 1).fill(-1);
    pot.set(this.bowlPot);
    this.bowlTok = tok;
    this.bowlPot = pot;
    this.unstick();
  }

  key(): string {
    let k = this.hashA + ',' + this.hashB + '|';
    for (let p = 0; p < this.potDish.length; p++) k += this.potDish[p] + '.' + this.potGot[p] + ',';
    if (this.bowlLen) {
      k += '|';
      if (this.s.rules.bowlOrder === 'lifo') {
        for (let j = 0; j < this.bowlLen; j++) k += this.bowlTok[j] + ':' + this.bowlPot[j] + ',';
      } else {
        const items: number[] = [];
        for (let j = 0; j < this.bowlTok.length; j++) if (this.bowlTok[j] >= 0) items.push(this.bowlTok[j] * 16 + this.bowlPot[j] + 1);
        items.sort((a, b) => a - b);
        k += items.join(',');
      }
    }
    return k;
  }

  /** Delivered items / all items, for the progress bar. */
  progress(): number {
    return this.s.totalItems ? this.delivered / this.s.totalItems : 1;
  }
}
