import type { Geometry } from '../core/board';
import { DX, DY, type Dir } from '../core/types';

export type Point = [number, number];
export interface Rect { left: number; top: number; right: number; bottom: number }

export const distance = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Keep the ingredient on its grid lane until its centre reaches the board edge. */
export function lanePoints(g: Geometry, start: number, cells: number[], direction: Dir, at: (cell: number) => Point, board: Rect): { points: Point[]; direction: Dir } {
  const points = [at(start)];
  let dir = direction;
  for (const cell of cells) {
    points.push(at(cell));
    if (g.pad[cell] >= 0) dir = g.pad[cell] as Dir;
  }
  const last = points[points.length - 1];
  const exit: Point = dir === 0 ? [last[0], board.top] : dir === 1 ? [board.right, last[1]] : dir === 2 ? [last[0], board.bottom] : [board.left, last[1]];
  points.push(exit);
  return { points, direction: dir };
}

/** A delivery bends toward its recipe icon while retaining the arrow's outward direction. */
export function recipientCurve(from: Point, to: Point, dir: Dir, cell: number): Point[] {
  const outward = (to[0] - from[0]) * DX[dir] + (to[1] - from[1]) * DY[dir];
  const lead = Math.max(0, Math.min(cell * 0.35, distance(from, to) * 0.32, outward * 0.45));
  return cubic(from, [from[0] + DX[dir] * lead, from[1] + DY[dir] * lead], [to[0] - DX[dir] * lead, to[1] - DY[dir] * lead], to);
}

function cubic(a: Point, b: Point, c: Point, d: Point, steps = 16): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0], u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]];
  });
}

/** Does a segment enter the board's interior? Touching its edge is allowed. */
export function crossesBoard(a: Point, b: Point, rect: Rect): boolean {
  const epsilon = 0.01;
  const ranges: [number, number][] = [];
  for (const [axis, low, high] of [[0, rect.left + epsilon, rect.right - epsilon], [1, rect.top + epsilon, rect.bottom - epsilon]] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < epsilon) {
      if (a[axis] <= low || a[axis] >= high) return false;
      ranges.push([0, 1]);
    } else {
      const t0 = (low - a[axis]) / delta;
      const t1 = (high - a[axis]) / delta;
      ranges.push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
  }
  return Math.max(0, ranges[0][0], ranges[1][0]) < Math.min(1, ranges[0][1], ranges[1][1]);
}

/** Shortest visible route around the board. This also works when the bowl moves to its left. */
export function routeOutsideBoard(from: Point, to: Point, board: Rect, clearance: number): Point[] {
  const safe: Rect = { left: board.left - clearance, top: board.top - clearance, right: board.right + clearance, bottom: board.bottom + clearance };
  // Recipe icons can sit inside the food-sized margin. Approach that final short distance from the
  // same edge while the ingredient shrinks, rather than allowing its full-size route to skim it.
  const exterior = (point: Point): Point => {
    if (point[0] <= safe.left || point[0] >= safe.right || point[1] <= safe.top || point[1] >= safe.bottom) return point;
    if (point[0] <= board.left) return [safe.left, point[1] <= board.top ? safe.top : point[1] >= board.bottom ? safe.bottom : point[1]];
    if (point[0] >= board.right) return [safe.right, point[1] <= board.top ? safe.top : point[1] >= board.bottom ? safe.bottom : point[1]];
    if (point[1] <= board.top) return [point[0], safe.top];
    if (point[1] >= board.bottom) return [point[0], safe.bottom];
    return point;
  };
  const start = exterior(from); const finish = exterior(to);
  const distinct = (path: Point[]) => path.filter((point, i) => !i || distance(path[i - 1], point) > 0.001);
  if (!crossesBoard(start, finish, safe)) return distinct([from, start, finish, to]);
  const corner = clearance * 1.6;
  const points: Point[] = [start, finish, [board.left - corner, board.top - corner], [board.right + corner, board.top - corner], [board.right + corner, board.bottom + corner], [board.left - corner, board.bottom + corner]];
  const costs = points.map(() => Infinity);
  const previous = points.map(() => -1);
  const visited = new Set<number>();
  costs[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited.add(current);
    for (let next = 0; next < points.length; next++) {
      if (visited.has(next) || crossesBoard(points[current], points[next], safe)) continue;
      const cost = costs[current] + distance(points[current], points[next]);
      if (cost < costs[next]) { costs[next] = cost; previous[next] = current; }
    }
  }
  if (!Number.isFinite(costs[1])) return [from, to];
  const path: Point[] = [];
  for (let i = 1; i >= 0; i = previous[i]) path.unshift(points[i]);
  return distinct([from, ...path, to]);
}

/** Round only off-board corners; grid turns remain exactly on their floor pads. */
export function roundedPath(points: Point[], radius: number): Point[] {
  if (points.length < 3) return points;
  const path: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]; const b = points[i]; const c = points[i + 1];
    const ab = distance(a, b); const bc = distance(b, c);
    if (!ab || !bc) continue;
    const r = Math.min(radius, ab * 0.3, bc * 0.3);
    const entry: Point = [b[0] + (a[0] - b[0]) * r / ab, b[1] + (a[1] - b[1]) * r / ab];
    const exit: Point = [b[0] + (c[0] - b[0]) * r / bc, b[1] + (c[1] - b[1]) * r / bc];
    path.push(entry);
    for (let k = 1; k <= 8; k++) {
      const t = k / 8; const u = 1 - t;
      path.push([u * u * entry[0] + 2 * u * t * b[0] + t * t * exit[0], u * u * entry[1] + 2 * u * t * b[1] + t * t * exit[1]]);
    }
  }
  path.push(points[points.length - 1]);
  return path;
}

/** Distance offsets give all grid segments the same speed, regardless of viewport size. */
export function pathMetrics(points: Point[]): { lengths: number[]; total: number } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  return { lengths, total: lengths[lengths.length - 1] ?? 0 };
}
