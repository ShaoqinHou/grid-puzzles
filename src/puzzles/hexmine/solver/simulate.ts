import type { HexMineGrid, HexMineCell } from '../types';
import type { CellState } from './types';
import { getOffsetNeighbors, coordKey } from '../hex';

/**
 * Simulate what the grid would look like if all known-safe cells were revealed.
 * Includes cascade reveals from 0-cells.
 */
export function simulateReveals(
  baseGrid: HexMineGrid,
  solution: HexMineGrid,
  knowledge: Map<string, CellState>,
  width: number,
  height: number,
): HexMineGrid {
  const grid: HexMineGrid = baseGrid.map((row) => [...row]);

  for (const [key, state] of knowledge) {
    if (state === 'safe') {
      const [rs, cs] = key.split(',').map(Number);
      const sol = solution[rs][cs];
      if (typeof sol === 'number' && grid[rs][cs] === 'hidden') {
        grid[rs][cs] = sol;
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (grid[r][c] !== 0) continue;
        const neighbors = getOffsetNeighbors(r, c, width, height);
        for (const n of neighbors) {
          if (grid[n.row][n.col] === 'hidden') {
            const sol = solution[n.row][n.col];
            if (typeof sol === 'number') {
              grid[n.row][n.col] = sol;
              knowledge.set(coordKey(n.row, n.col), 'safe');
              changed = true;
            }
          }
        }
      }
    }
  }

  return grid;
}

/**
 * Simulate cascade reveal from a starting cell.
 */
export function simulateCascade(
  solution: HexMineGrid,
  start: { row: number; col: number },
  width: number,
  height: number,
): HexMineGrid {
  const grid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('hidden'),
  );

  const stack: Array<{ row: number; col: number }> = [start];
  const visited = new Set<string>();
  visited.add(coordKey(start.row, start.col));

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;
    const sol = solution[row][col];

    if (sol === 'mine' || sol === 'disabled') continue;

    grid[row][col] = sol;

    if (sol === 0) {
      const neighbors = getOffsetNeighbors(row, col, width, height);
      for (const n of neighbors) {
        const key = coordKey(n.row, n.col);
        if (!visited.has(key)) {
          visited.add(key);
          stack.push(n);
        }
      }
    }
  }

  return grid;
}
