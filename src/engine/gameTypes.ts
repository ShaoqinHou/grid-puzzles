import type {
  PuzzleTypeId,
  Difficulty,
  CellCoord,
  CellInteraction,
  GridShape,
} from '@/types';

/** Serialisable game state managed by GameStateProvider */
export interface GameState {
  /** Unique game id */
  readonly id: string;
  /** Which puzzle type is being played */
  readonly puzzleType: PuzzleTypeId;
  /** Current difficulty */
  readonly difficulty: Difficulty;
  /** Grid dimensions */
  readonly width: number;
  readonly height: number;
  /** Current player grid (mutable via reducer) */
  readonly grid: unknown[][];
  /** The correct solution */
  readonly solution: unknown[][];
  /** Clue data (puzzle-type-specific) */
  readonly clues: unknown;
  /** Empty cell value for this puzzle type */
  readonly emptyCell: unknown;
  /** Custom grid shape, or null for rectangular */
  readonly shape: GridShape | null;
  /** Undo stack (previous grid states) */
  readonly undoStack: readonly unknown[][][];
  /** Redo stack */
  readonly redoStack: readonly unknown[][][];
  /** Whether the game is paused */
  readonly paused: boolean;
  /** Whether the player has requested a correctness check */
  readonly checkMode: boolean;
  /** Elapsed time in milliseconds */
  readonly elapsedMs: number;
  /** Whether the puzzle has been solved */
  readonly solved: boolean;
  /** Hint cell coordinate, if any */
  readonly hintCell: CellCoord | null;
}

/** All actions the game reducer can handle */
export type GameAction =
  | { readonly type: 'NEW_GAME'; readonly payload: NewGamePayload }
  | { readonly type: 'CELL_INTERACT'; readonly payload: CellInteractPayload }
  | { readonly type: 'UNDO' }
  | { readonly type: 'REDO' }
  | { readonly type: 'CHECK' }
  | { readonly type: 'HINT'; readonly payload: HintPayload }
  | { readonly type: 'RESET' }
  | { readonly type: 'PAUSE' }
  | { readonly type: 'RESUME' }
  | { readonly type: 'TICK' }
  | { readonly type: 'LOAD_GAME'; readonly payload: GameState }
  | { readonly type: 'MARK_SOLVED' };

export interface NewGamePayload {
  readonly id: string;
  readonly puzzleType: PuzzleTypeId;
  readonly difficulty: Difficulty;
  readonly width: number;
  readonly height: number;
  readonly grid: unknown[][];
  readonly solution: unknown[][];
  readonly clues: unknown;
  readonly emptyCell: unknown;
  readonly shape: GridShape | null;
}

export interface CellInteractPayload {
  readonly coord: CellCoord;
  readonly interaction: CellInteraction;
  /** The resolved next cell value (computed by the puzzle definition) */
  readonly nextValue: unknown;
  /** Whether this move completes the puzzle (pre-computed by the component) */
  readonly solved?: boolean;
  /** Additional cells to update atomically (e.g. cascade reveal, chord) */
  readonly additionalCells?: ReadonlyArray<{ readonly coord: CellCoord; readonly value: unknown }>;
}

export interface HintPayload {
  readonly coord: CellCoord;
  readonly value: unknown;
}
