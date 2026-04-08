import type {
  PuzzleTypeId,
  Difficulty,
  CellCoord,
  CellInteraction,
  ClueLayout,
  GridShape,
} from '@/types';

/** Result of validating the entire grid against the solution */
export interface ValidationResult {
  readonly solved: boolean;
  readonly errors: readonly CellCoord[];
}

/** Result of validating a single cell */
export interface CellValidation {
  readonly correct: boolean;
}

/** A generated puzzle instance ready for play */
export interface PuzzleInstance<TGrid, TClues, TCell> {
  readonly grid: TGrid;
  readonly solution: TGrid;
  readonly clues: TClues;
  readonly emptyCell: TCell;
  readonly width: number;
  readonly height: number;
  /** Optional custom grid shape for non-rectangular puzzles */
  readonly shape?: GridShape;
}

/** Props passed to a puzzle-specific cell renderer */
export interface CellRendererProps<TCell> {
  readonly value: TCell;
  readonly coord: CellCoord;
  readonly size: number;
  readonly isError: boolean;
  readonly isHinted: boolean;
  /** Whether this cell is active (true) or blocked/gap (false) in a shaped grid */
  readonly isActive: boolean;
}

/** Props passed to a puzzle-specific clue renderer */
export interface ClueRendererProps<TClues> {
  readonly clues: TClues;
  readonly orientation: 'row' | 'col';
  readonly index: number;
  readonly satisfied: boolean;
}

/** Full definition for a puzzle type — the core extensibility contract */
export interface PuzzleDefinition<TGrid = unknown, TClues = unknown, TCell = unknown> {
  readonly typeId: PuzzleTypeId;
  readonly label: string;
  readonly icon: string;
  readonly description: string;

  /** All possible cell values (for cycling) */
  readonly cellValues: readonly TCell[];
  /** The default/empty value for a cell */
  readonly emptyCell: TCell;
  /** How clues are positioned relative to the grid */
  readonly clueLayout: ClueLayout;

  /** Generate a new puzzle instance */
  generate(width: number, height: number, difficulty: Difficulty): PuzzleInstance<TGrid, TClues, TCell>;
  /** Derive clues from a solved grid */
  computeClues(solution: TGrid): TClues;
  /** Validate the entire grid against the solution */
  validateGrid(grid: TGrid, solution: TGrid): ValidationResult;
  /** Validate a single cell */
  validateCell(coord: CellCoord, grid: TGrid, solution: TGrid): CellValidation;
  /** Determine the next cell value given current value and interaction type */
  nextCellValue(current: TCell, interaction: CellInteraction): TCell;

  /** Optional custom cell renderer component */
  CellRenderer?: React.ComponentType<CellRendererProps<TCell>>;
  /** Optional custom clue renderer component */
  ClueRenderer?: React.ComponentType<ClueRendererProps<TClues>>;
  /** Optional custom grid renderer — replaces the default Grid component entirely */
  GridRenderer?: React.ComponentType<{ definition: PuzzleDefinition }>;
  /** Optional solver (for hint generation or validation) */
  solve?(clues: TClues, width: number, height: number): TGrid | null;
  /** Optional hint: return the coord of a cell the player should fill next */
  getHint?(grid: TGrid, solution: TGrid): CellCoord | null;
}
