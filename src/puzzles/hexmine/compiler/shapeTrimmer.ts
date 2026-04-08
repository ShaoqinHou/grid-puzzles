import type { HexMineGrid, HexMineExplicitClue } from '../types';
import type { GridShape } from '@/types';
import type { CellState } from '../solver/types';
import { getOffsetNeighbors, coordKey } from '../hex';

/**
 * Trim the grid shape by marking unused peripheral cells as disabled.
 * "Used" = involved in any clue's scope, on the solving path, or adjacent to used cells.
 * This creates irregular grid shapes with holes.
 */
export function trimShape(
  solution: HexMineGrid,
  playerGrid: HexMineGrid,
  clues: HexMineExplicitClue[],
  shape: GridShape,
  width: number,
  height: number,
): void {
  // Mark all cells involved in clue scopes or solving path
  const essential = new Set<string>();

  // All cells in any clue's scope or display
  for (const clue of clues) {
    essential.add(clue.displayKey);
    for (const key of clue.cellKeys) {
      essential.add(key);
    }
  }

  // All revealed cells (part of the cascade opening or solve path)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (typeof playerGrid[r][c] === 'number') {
        essential.add(coordKey(r, c));
      }
    }
  }

  // All mine cells (needed for the puzzle)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 'mine') {
        essential.add(coordKey(r, c));
      }
    }
  }

  // Expand: neighbors of essential cells are also essential (padding)
  const padded = new Set(essential);
  for (const key of essential) {
    const [r, c] = key.split(',').map(Number);
    const neighbors = getOffsetNeighbors(r, c, width, height);
    for (const n of neighbors) {
      padded.add(coordKey(n.row, n.col));
    }
  }

  // Mark non-essential peripheral cells as disabled
  let trimmed = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      if (!padded.has(key) && shape[r][c]) {
        shape[r][c] = false;
        trimmed++;
      }
    }
  }
}
