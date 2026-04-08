import type { CellCoord, GridShape } from '@/types';
import type { PuzzleDefinition } from '@/engine/puzzleTypes';

/** Result of evaluating the current grid against the solution */
export interface EvaluationResult {
  /** Number of cells filled (active cells only for shaped grids) */
  readonly filledCount: number;
  /** Total active cells to fill */
  readonly totalCount: number;
  /** Progress as a fraction 0..1 */
  readonly progress: number;
  /** Per-line satisfaction status: row/col index -> satisfied */
  readonly lineStatus: ReadonlyMap<string, boolean>;
  /** Cells that are incorrect (only populated when checkMode is true) */
  readonly errors: readonly CellCoord[];
  /** Whether the puzzle is fully and correctly solved */
  readonly solved: boolean;
}

/**
 * Pure evaluation function — no side effects, no mutations, no async.
 * For shaped grids, only active cells count in progress calculation.
 */
export const evaluateGrid = (
  grid: unknown[][],
  solution: unknown[][],
  clues: unknown,
  definition: PuzzleDefinition,
  checkMode: boolean,
  shape: GridShape | null,
): EvaluationResult => {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;

  let filledCount = 0;
  let totalCount = 0;
  const errors: CellCoord[] = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      // Skip inactive cells in shaped grids
      if (shape !== null && !shape[row][col]) continue;

      totalCount++;
      const cellValue = grid[row][col];
      const isEmpty = cellValue === definition.emptyCell;

      if (!isEmpty) {
        filledCount++;
      }

      if (checkMode && !isEmpty) {
        const validation = definition.validateCell({ row, col }, grid, solution);
        if (!validation.correct) {
          errors.push({ row, col });
        }
      }
    }
  }

  // Check full grid validity
  const validationResult = definition.validateGrid(grid, solution);

  // Build line status map
  const lineStatus = new Map<string, boolean>();

  // Row status
  for (let row = 0; row < height; row++) {
    let rowComplete = true;
    for (let col = 0; col < width; col++) {
      if (shape !== null && !shape[row][col]) continue;
      const validation = definition.validateCell({ row, col }, grid, solution);
      if (!validation.correct) {
        rowComplete = false;
        break;
      }
    }
    lineStatus.set(`row-${row}`, rowComplete);
  }

  // Column status
  for (let col = 0; col < width; col++) {
    let colComplete = true;
    for (let row = 0; row < height; row++) {
      if (shape !== null && !shape[row][col]) continue;
      const validation = definition.validateCell({ row, col }, grid, solution);
      if (!validation.correct) {
        colComplete = false;
        break;
      }
    }
    lineStatus.set(`col-${col}`, colComplete);
  }

  const progress = totalCount > 0 ? filledCount / totalCount : 0;

  return {
    filledCount,
    totalCount,
    progress,
    lineStatus,
    errors,
    solved: validationResult.solved,
  };
};
