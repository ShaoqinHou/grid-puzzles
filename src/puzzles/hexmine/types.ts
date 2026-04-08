/**
 * Cell value union for both player grid and solution grid.
 * - Player grid starts all 'hidden', transitions to solution values or 'flagged'
 * - Solution grid contains numbers (0-6) or 'mine'
 * - 'exploded' marks the mine the player clicked (loss state in grid data)
 */
export type HexMineCell = 'hidden' | 'flagged' | 'mine' | 'exploded' | 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 2D array using offset coordinates (even-r) */
export type HexMineGrid = HexMineCell[][];

/** No external clue panel — numbers are inside revealed cells */
export type HexMineClues = null;

/** Axial hex coordinate */
export interface AxialCoord {
  readonly q: number;
  readonly r: number;
}

/** Offset coordinate matching 2D array indices (even-r offset) */
export interface OffsetCoord {
  readonly row: number;
  readonly col: number;
}
