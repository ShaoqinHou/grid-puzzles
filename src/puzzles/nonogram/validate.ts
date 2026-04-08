import type { CellCoord } from '@/types';
import type { ValidationResult, CellValidation } from '@/engine/puzzleTypes';
import type { NonogramGrid, NonogramClues } from './types';

/**
 * Compute nonogram clues (row and column run-lengths) from a grid.
 * Treats 'filled' as a filled cell; everything else as empty.
 */
export const computeNonogramClues = (grid: NonogramGrid): NonogramClues => {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;

  const computeLineClue = (cells: readonly string[]): number[] => {
    const runs: number[] = [];
    let run = 0;
    for (const cell of cells) {
      if (cell === 'filled') {
        run++;
      } else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }
    if (run > 0) runs.push(run);
    return runs.length > 0 ? runs : [0];
  };

  const rows: number[][] = [];
  for (let r = 0; r < height; r++) {
    rows.push(computeLineClue(grid[r]));
  }

  const cols: number[][] = [];
  for (let c = 0; c < width; c++) {
    const col: string[] = [];
    for (let r = 0; r < height; r++) {
      col.push(grid[r][c]);
    }
    cols.push(computeLineClue(col));
  }

  return { rows, cols };
};

/**
 * Validate the entire player grid against the solution.
 * A cell is an error if the solution says 'filled' but the player
 * hasn't filled it, or if the player filled a cell the solution says
 * should be empty.
 */
export const validateNonogramGrid = (
  grid: NonogramGrid,
  solution: NonogramGrid,
): ValidationResult => {
  const errors: CellCoord[] = [];
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const playerFilled = grid[r][c] === 'filled';
      const solutionFilled = solution[r][c] === 'filled';
      if (playerFilled !== solutionFilled) {
        errors.push({ row: r, col: c });
      }
    }
  }

  return {
    solved: errors.length === 0,
    errors,
  };
};

/**
 * Validate a single cell against the solution.
 */
export const validateNonogramCell = (
  coord: CellCoord,
  grid: NonogramGrid,
  solution: NonogramGrid,
): CellValidation => {
  const playerFilled = grid[coord.row][coord.col] === 'filled';
  const solutionFilled = solution[coord.row][coord.col] === 'filled';
  return { correct: playerFilled === solutionFilled };
};
