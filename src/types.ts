/** Unique identifier for a puzzle type (e.g. 'nonogram', 'sudoku') */
export type PuzzleTypeId = string;

/** Puzzle difficulty levels */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** Row/column coordinate within a grid */
export interface CellCoord {
  readonly row: number;
  readonly col: number;
}

/** How the user interacts with a cell */
export type CellInteraction = 'primary' | 'secondary' | 'clear';

/** Where clues are rendered relative to the grid */
export type ClueLayout = 'top-left' | 'borders' | 'inside-cells' | 'none';

/**
 * Represents which cells are active in a non-rectangular grid.
 * `true` = active cell, `false` = blocked/gap.
 * Enables custom-shaped grids (L-shapes, crosses, random gaps).
 */
export type GridShape = boolean[][];

/** Metadata for a saved/completed puzzle */
export interface PuzzleMetadata {
  readonly id: string;
  readonly puzzleType: PuzzleTypeId;
  readonly difficulty: Difficulty;
  readonly width: number;
  readonly height: number;
  readonly createdAt: number;
  readonly bestTimeMs: number | null;
}
