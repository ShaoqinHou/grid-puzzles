import type { CellCoord } from '@/types';
import type { ValidationResult, CellValidation } from '@/engine/puzzleTypes';
import type { HexMineGrid, HexMineClues } from './types';

/** Minesweeper has no external clue panel */
export function computeHexMineClues(_solution: HexMineGrid): HexMineClues {
  return null;
}

/** Solved when all non-mine cells are revealed with correct numbers */
export function validateHexMineGrid(grid: HexMineGrid, solution: HexMineGrid): ValidationResult {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sol = solution[r][c];
      const cell = grid[r][c];

      // If any cell exploded, the game is lost (not solved)
      if (cell === 'exploded') {
        return { solved: false, errors: [{ row: r, col: c }] };
      }

      // Non-mine cells must be revealed (matching solution number)
      if (sol !== 'mine' && cell !== sol) {
        return { solved: false, errors: [] };
      }
    }
  }

  return { solved: true, errors: [] };
}

/** Single cell validation */
export function validateHexMineCell(
  coord: CellCoord,
  grid: HexMineGrid,
  solution: HexMineGrid,
): CellValidation {
  const cell = grid[coord.row][coord.col];
  const sol = solution[coord.row][coord.col];

  // Revealed number matches solution
  if (typeof cell === 'number') {
    return { correct: cell === sol };
  }
  // Hidden/flagged — not checked yet
  return { correct: true };
}
