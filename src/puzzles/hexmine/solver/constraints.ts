import type { HexMineGrid } from '../types';
import type { HexMineExplicitClue } from '../types';
import type { CellState, Constraint } from './types';
import { getOffsetNeighbors, coordKey } from '../hex';

/**
 * Build constraints from revealed cells in the grid.
 * Each revealed number creates a constraint: "N mines among my hidden neighbors".
 */
export function buildConstraints(
  grid: HexMineGrid,
  width: number,
  height: number,
  knowledge: Map<string, CellState>,
): Constraint[] {
  const constraints: Constraint[] = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell = grid[r][c];
      if (typeof cell !== 'number' || cell === 0) continue;

      const neighbors = getOffsetNeighbors(r, c, width, height);
      const unknowns: string[] = [];
      let knownMines = 0;

      for (const n of neighbors) {
        const key = coordKey(n.row, n.col);
        const state = knowledge.get(key);
        if (state === 'mine') {
          knownMines++;
        } else if (state === 'unknown') {
          unknowns.push(key);
        }
      }

      const remaining = cell - knownMines;
      if (unknowns.length > 0 && remaining >= 0 && remaining <= unknowns.length) {
        constraints.push({ cells: unknowns, mineCount: remaining });
      }
    }
  }

  return constraints;
}

/**
 * Build constraints from explicit clues (medium+ difficulty).
 */
export function buildExplicitConstraints(
  clues: readonly HexMineExplicitClue[],
  knowledge: Map<string, CellState>,
): Constraint[] {
  const constraints: Constraint[] = [];

  for (const clue of clues) {
    const unknowns: string[] = [];
    let knownMines = 0;
    for (const key of clue.cellKeys) {
      const state = knowledge.get(key);
      if (state === 'mine') knownMines++;
      else if (state === 'unknown') unknowns.push(key);
    }
    const remaining = clue.mineCount - knownMines;
    if (unknowns.length > 0 && remaining >= 0 && remaining <= unknowns.length) {
      constraints.push({ cells: unknowns, mineCount: remaining });
    }
  }

  return constraints;
}
