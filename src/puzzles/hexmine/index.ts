import type { CellCoord, CellInteraction } from '@/types';
import type { PuzzleDefinition } from '@/engine/puzzleTypes';
import type { HexMineGrid, HexMineClues, HexMineCell } from './types';
import { generateHexMine } from './generate';
import { computeHexMineClues, validateHexMineGrid, validateHexMineCell } from './validate';
import { getHexMineHint } from './solve';
import { HexGrid } from './HexGrid';

export const hexmineDefinition: PuzzleDefinition<HexMineGrid, HexMineClues, HexMineCell> = {
  typeId: 'hexmine',
  label: 'Hex Minesweeper',
  icon: '⬡',
  description: 'Reveal cells on a hex grid — avoid the mines',

  cellValues: ['hidden', 'flagged', 'mine', 'exploded', 'disabled', 0, 1, 2, 3, 4, 5, 6],
  emptyCell: 'hidden',
  clueLayout: 'none',

  generate: generateHexMine,
  computeClues: computeHexMineClues,
  validateGrid: validateHexMineGrid,
  validateCell: validateHexMineCell,

  nextCellValue(current: HexMineCell, interaction: CellInteraction): HexMineCell {
    // Fallback — real interaction logic is in HexGrid.tsx
    if (interaction === 'secondary') {
      if (current === 'hidden') return 'flagged';
      if (current === 'flagged') return 'hidden';
    }
    return current;
  },

  GridRenderer: HexGrid,

  getHint(grid: HexMineGrid, solution: HexMineGrid): CellCoord | null {
    const height = grid.length;
    const width = height > 0 ? grid[0].length : 0;
    const result = getHexMineHint(grid, solution, width, height);
    return result ? { row: result.row, col: result.col } : null;
  },
};
