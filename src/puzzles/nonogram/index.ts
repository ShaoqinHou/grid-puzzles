import type { CellCoord, CellInteraction } from '@/types';
import type { PuzzleDefinition, ValidationResult, CellValidation } from '@/engine/puzzleTypes';
import type { NonogramGrid, NonogramClues, NonogramCell } from './types';
import { generateNonogram } from './generate';
import { computeNonogramClues, validateNonogramGrid, validateNonogramCell } from './validate';
import { solveNonogram } from './solve';
import { NonogramCellRenderer } from './NonogramCellRenderer';
import { NonogramClueRenderer } from './NonogramClueRenderer';

export const nonogramDefinition: PuzzleDefinition<NonogramGrid, NonogramClues, NonogramCell> = {
  typeId: 'nonogram',
  label: 'Nonogram',
  icon: '◼',
  description: 'Fill cells to match the row and column clues',

  cellValues: ['empty', 'filled', 'marked'] as const,
  emptyCell: 'empty',
  clueLayout: 'top-left',

  generate(width, height, difficulty) {
    return generateNonogram(width, height, difficulty);
  },

  computeClues(solution: NonogramGrid): NonogramClues {
    return computeNonogramClues(solution);
  },

  validateGrid(grid: NonogramGrid, solution: NonogramGrid): ValidationResult {
    return validateNonogramGrid(grid, solution);
  },

  validateCell(coord: CellCoord, grid: NonogramGrid, solution: NonogramGrid): CellValidation {
    return validateNonogramCell(coord, grid, solution);
  },

  nextCellValue(current: NonogramCell, interaction: CellInteraction): NonogramCell {
    switch (interaction) {
      case 'primary':
        // empty → filled → empty
        return current === 'filled' ? 'empty' : 'filled';
      case 'secondary':
        // empty → marked → empty
        return current === 'marked' ? 'empty' : 'marked';
      case 'clear':
        return 'empty';
    }
  },

  CellRenderer: NonogramCellRenderer,
  ClueRenderer: NonogramClueRenderer,

  solve(clues: NonogramClues, width: number, height: number): NonogramGrid | null {
    return solveNonogram(clues, width, height);
  },

  getHint(grid: NonogramGrid, solution: NonogramGrid): CellCoord | null {
    const height = grid.length;
    const width = height > 0 ? grid[0].length : 0;

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const playerFilled = grid[r][c] === 'filled';
        const solutionFilled = solution[r][c] === 'filled';
        if (playerFilled !== solutionFilled) {
          return { row: r, col: c };
        }
      }
    }
    return null;
  },
};
