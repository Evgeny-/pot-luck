import { DX, DY, FORM_CHOPPED, FORM_COOKED, type BarDef, type Dir, type LevelDef, type PadDef, type PotDef } from './types';

/** Static board geometry: size, floor pads, bars and which pot each stretch of edge feeds. */
export interface Geometry {
  w: number;
  h: number;
  /** Pad direction per cell, -1 where there is no pad. */
  pad: Int8Array;
  bars: BarDef[];
  /** Per side, per position along it: pot index or -1 for a wall. */
  edge: Int8Array[];
}

export function makeGeometry(w: number, h: number, pots: PotDef[], pads: PadDef[] = [], bars: BarDef[] = []): Geometry {
  const pad = new Int8Array(w * h).fill(-1);
  for (const p of pads) pad[p.y * w + p.x] = p.dir;
  const edge = [0, 1, 2, 3].map((side) => {
    const len = side === 0 || side === 2 ? w : h;
    const row = new Int8Array(len).fill(-1);
    pots.forEach((p, i) => {
      if (p.side !== side) return;
      for (let k = Math.max(0, p.from); k < Math.min(len, p.to); k++) row[k] = i;
    });
    return row;
  });
  return { w, h, pad, bars, edge };
}

export function geometryOf(level: LevelDef): Geometry {
  return makeGeometry(level.w, level.h, level.pots, level.pads, level.bars);
}

export interface Path {
  /** Cells the tile passes through after leaving its own cell, in order. */
  cells: number[];
  /** Pot it lands in, or -1 (wall, or a pad loop). */
  pot: number;
  /** Side and position where it leaves the board. */
  side: Dir;
  at: number;
  /** Form bits picked up on the way (chopped, cooked). */
  form: number;
  /** Pads used on the way. */
  turns: number;
}

function crossedBar(g: Geometry, x: number, y: number, dir: Dir): number {
  let form = 0;
  for (const b of g.bars) {
    if (b.axis === 'h') {
      if (dir !== 0 && dir !== 2) continue;
      if (x < b.from || x >= b.to) continue;
      // Moving up from row y crosses the line above it (at = y); moving down crosses at = y + 1.
      const line = dir === 0 ? y : y + 1;
      if (line === b.at) form |= b.kind === 'knife' ? FORM_CHOPPED : FORM_COOKED;
    } else {
      if (dir !== 1 && dir !== 3) continue;
      if (y < b.from || y >= b.to) continue;
      const line = dir === 3 ? x : x + 1;
      if (line === b.at) form |= b.kind === 'knife' ? FORM_CHOPPED : FORM_COOKED;
    }
  }
  return form;
}

/** Where a tile at (x, y) pointing `dir` goes when nothing is in its way. */
export function tracePath(g: Geometry, x: number, y: number, dir: Dir): Path {
  const cells: number[] = [];
  let form = 0;
  let turns = 0;
  let d = dir;
  const limit = g.w * g.h * 4;
  for (let step = 0; step < limit; step++) {
    if (g.bars.length) form |= crossedBar(g, x, y, d);
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) {
      const at = d === 0 || d === 2 ? x : y;
      return { cells, pot: g.edge[d][at], side: d, at, form, turns };
    }
    x = nx;
    y = ny;
    const c = y * g.w + x;
    cells.push(c);
    const p = g.pad[c];
    if (p >= 0 && p !== d) {
      d = p as Dir;
      turns++;
    }
  }
  return { cells, pot: -1, side: d, at: -1, form, turns };
}
