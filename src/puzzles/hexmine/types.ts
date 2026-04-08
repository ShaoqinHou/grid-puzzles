/**
 * Cell value union for both player grid and solution grid.
 * - Player grid starts all 'hidden', transitions to solution values or 'flagged'
 * - Solution grid contains numbers (0-6), 'mine', or 'disabled' (line clue origins)
 * - 'exploded' marks the mine the player clicked (loss state in grid data)
 * - 'disabled' marks line-clue origin cells (non-interactive, excluded from win)
 */
export type HexMineCell = 'hidden' | 'flagged' | 'mine' | 'exploded' | 'disabled' | 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 2D array using offset coordinates (even-r) */
export type HexMineGrid = HexMineCell[][];

/** Arrangement constraint on mines within a clue's scope */
export type ClueSpecial = 'none' | 'contiguous' | 'nonContiguous';

/** An explicit clue placed on the board (for medium+ difficulty) */
export interface HexMineExplicitClue {
  /** Unique clue id */
  readonly id: string;
  /** Clue type */
  readonly type: 'adjacent' | 'line' | 'range' | 'edge-header';
  /** Coordinate keys of cells in scope (clockwise-ordered for adjacent) */
  readonly cellKeys: readonly string[];
  /** Number of mines among cellKeys */
  readonly mineCount: number;
  /** Arrangement constraint */
  readonly special: ClueSpecial;
  /** Coordinate key where this clue is displayed (or edge position key like "edge-r3") */
  readonly displayKey: string;
  /** Direction index 0-5 for line clues (E, NE, NW, W, SW, SE) */
  readonly direction?: number;
  /** Edge header position for rendering outside the grid */
  readonly edgePosition?: { readonly x: number; readonly y: number };
}

/** Set of coordinate keys for cells that show ? instead of their number */
export type QuestionMarkSet = ReadonlySet<string>;

/** Clue data for a hexmine puzzle */
export interface HexMineClueData {
  /** Explicit clues (adjacent, line, range, edge-header) */
  readonly clues: readonly HexMineExplicitClue[];
  /** Coordinate keys of cells that show ? instead of their number */
  readonly questionMarks: readonly string[];
}

/** null for easy (standard minesweeper), HexMineClueData for medium+ */
export type HexMineClues = HexMineClueData | null;

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
