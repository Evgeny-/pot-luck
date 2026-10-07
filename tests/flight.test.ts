import { describe, expect, it } from 'vitest';
import { makeGeometry, tracePath } from '../src/core/board';
import { DX, DY, type Dir } from '../src/core/types';
import { crossesBoard, lanePoints, pathMetrics, recipientCurve, roundedPath, routeOutsideBoard, type Point, type Rect } from '../src/view/flight';

const board: Rect = { left: 100, top: 100, right: 500, bottom: 400 };
const at = (cell: number): Point => [150 + cell % 4 * 100, 150 + Math.floor(cell / 4) * 100];

describe('ingredient flight geometry', () => {
  it('follows floor turns and reaches the edge in the simulation exit direction', () => {
    const g = makeGeometry(4, 3, [{ side: 2, from: 0, to: 4, dishes: [] }], [{ x: 1, y: 0, dir: 2 }, { x: 1, y: 2, dir: 1 }, { x: 3, y: 2, dir: 2 }]);
    const traced = tracePath(g, 0, 0, 1);
    const lane = lanePoints(g, 0, traced.cells, 1, at, board);
    expect(lane.points).toEqual([[150, 150], [250, 150], [250, 250], [250, 350], [350, 350], [450, 350], [450, 400]]);
    expect(lane.direction).toBe(traced.side);
    for (let i = 1; i < lane.points.length; i++) {
      const previous = lane.points[i - 1]; const next = lane.points[i];
      expect(next[0] === previous[0] || next[1] === previous[1]).toBe(true);
    }
  });

  it.each([0, 1, 2, 3] as Dir[])('never overshoots or reverses when entering a recipe ingredient on side %i', (dir) => {
    const from: Point = dir === 0 ? [350, 100] : dir === 1 ? [500, 250] : dir === 2 ? [250, 400] : [100, 350];
    const to: Point = [from[0] + DX[dir] * 22 + DY[dir] * 130, from[1] + DY[dir] * 22 + DX[dir] * 130];
    const curve = recipientCurve(from, to, dir, 118);
    expect(curve[0]).toEqual(from);
    expect(curve.at(-1)).toEqual(to);
    let previous = 0;
    for (const point of curve) {
      const outward = (point[0] - from[0]) * DX[dir] + (point[1] - from[1]) * DY[dir];
      expect(outward).toBeGreaterThanOrEqual(previous - 0.0001);
      expect(outward).toBeLessThanOrEqual(22.0001);
      previous = outward;
    }
  });

  it.each([
    ['desktop jar on the left', [530, 250], [45, 170]],
    ['phone bowl below the board', [250, 70], [300, 490]],
    ['jar to a recipe on the opposite side', [45, 150], [535, 290]],
    ['bowl to a top recipe', [280, 490], [230, 65]],
  ] as [string, Point, Point][])('routes %s around the ingredient board', (_, from, to) => {
    expect(crossesBoard(from, to, board)).toBe(true);
    const route = roundedPath(routeOutsideBoard(from, to, board, 35), 18);
    expect(route[0]).toEqual(from);
    expect(route.at(-1)).toEqual(to);
    for (let i = 1; i < route.length; i++) expect(crossesBoard(route[i - 1], route[i], board)).toBe(false);
  });

  it('keeps direct bowl transfers outside the board when the lane is already clear', () => {
    const from: Point = [60, 210]; const to: Point = [45, 170];
    expect(routeOutsideBoard(from, to, board, 30)).toEqual([from, to]);
  });

  it('leaves room for the food picture when a direct line only touches a board corner', () => {
    const from: Point = [550, 150]; const to: Point = [450, 50];
    expect(crossesBoard(from, to, board)).toBe(false);
    const route = roundedPath(routeOutsideBoard(from, to, board, 35), 18);
    expect(route.length).toBeGreaterThan(2);
    const footprint: Rect = { left: 70, top: 70, right: 530, bottom: 430 };
    for (let i = 1; i < route.length; i++) expect(crossesBoard(route[i - 1], route[i], footprint)).toBe(false);
  });

  it('times uneven lane segments by actual distance instead of equal keyframe intervals', () => {
    const metrics = pathMetrics([[0, 0], [20, 0], [20, 100], [50, 140]]);
    expect(metrics).toEqual({ lengths: [0, 20, 120, 170], total: 170 });
  });
});
