import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { GameState, GameAction } from '@/engine/gameTypes';
import { loadFromStorage, saveToStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';

const MAX_UNDO_STACK = 100;

/** Deep clone a 2D grid */
const cloneGrid = (grid: unknown[][]): unknown[][] =>
  grid.map((row) => [...row]);

const createInitialState = (): GameState => {
  const saved = loadFromStorage<GameState>(STORAGE_KEYS.GAME);
  if (saved !== null) return saved;
  return {
    id: '',
    puzzleType: '',
    difficulty: 'easy',
    width: 0,
    height: 0,
    grid: [],
    solution: [],
    clues: null,
    emptyCell: null,
    shape: null,
    undoStack: [],
    redoStack: [],
    paused: false,
    checkMode: false,
    elapsedMs: 0,
    solved: false,
    hintCell: null,
  };
};

const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'NEW_GAME': {
      const { id, puzzleType, difficulty, width, height, grid, solution, clues, emptyCell, shape } =
        action.payload;
      return {
        id,
        puzzleType,
        difficulty,
        width,
        height,
        grid: cloneGrid(grid),
        solution: cloneGrid(solution),
        clues,
        emptyCell,
        shape,
        undoStack: [],
        redoStack: [],
        paused: false,
        checkMode: false,
        elapsedMs: 0,
        solved: false,
        hintCell: null,
      };
    }

    case 'CELL_INTERACT': {
      if (state.solved || state.paused) return state;

      const { coord, nextValue, solved: isSolved } = action.payload;
      const { row, col } = coord;

      // Bounds check
      if (row < 0 || row >= state.height || col < 0 || col >= state.width) {
        return state;
      }

      // Check if cell is active in shaped grids
      if (state.shape !== null && !state.shape[row][col]) {
        return state;
      }

      const newGrid = cloneGrid(state.grid);
      newGrid[row][col] = nextValue;

      // Apply additional cells (for multi-cell operations like cascade reveal)
      if (action.payload.additionalCells) {
        for (const { coord: ac, value: av } of action.payload.additionalCells) {
          if (ac.row >= 0 && ac.row < state.height && ac.col >= 0 && ac.col < state.width) {
            newGrid[ac.row][ac.col] = av;
          }
        }
      }

      // Push current grid to undo stack, trim if needed
      const undoStack = [...state.undoStack, cloneGrid(state.grid)];
      if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
      }

      return {
        ...state,
        grid: newGrid,
        undoStack,
        redoStack: [],
        hintCell: null,
        // Mark solved immediately if this move completes the puzzle
        ...(isSolved ? { solved: true, paused: true } : {}),
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0 || state.solved) return state;

      const undoStack = [...state.undoStack];
      const previousGrid = undoStack.pop()!;

      return {
        ...state,
        grid: previousGrid,
        undoStack,
        redoStack: [cloneGrid(state.grid), ...state.redoStack],
        hintCell: null,
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0 || state.solved) return state;

      const redoStack = [...state.redoStack];
      const nextGrid = redoStack.shift()!;

      return {
        ...state,
        grid: nextGrid,
        undoStack: [...state.undoStack, cloneGrid(state.grid)],
        redoStack,
        hintCell: null,
      };
    }

    case 'CHECK': {
      return { ...state, checkMode: !state.checkMode };
    }

    case 'HINT': {
      if (state.solved || state.paused) return state;

      const { coord, value } = action.payload;
      const { row, col } = coord;

      const newGrid = cloneGrid(state.grid);
      newGrid[row][col] = value;

      const undoStack = [...state.undoStack, cloneGrid(state.grid)];
      if (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
      }

      return {
        ...state,
        grid: newGrid,
        undoStack,
        redoStack: [],
        hintCell: coord,
      };
    }

    case 'RESET': {
      if (state.width === 0) return state;

      const emptyGrid: unknown[][] = Array.from({ length: state.height }, () =>
        Array.from({ length: state.width }, () => state.emptyCell),
      );

      return {
        ...state,
        grid: emptyGrid,
        undoStack: [],
        redoStack: [],
        checkMode: false,
        elapsedMs: 0,
        solved: false,
        hintCell: null,
      };
    }

    case 'PAUSE': {
      return { ...state, paused: true };
    }

    case 'RESUME': {
      return { ...state, paused: false };
    }

    case 'TICK': {
      if (state.paused || state.solved) return state;
      return { ...state, elapsedMs: state.elapsedMs + 1000 };
    }

    case 'LOAD_GAME': {
      return action.payload;
    }

    case 'MARK_SOLVED': {
      if (state.solved) return state;
      return { ...state, solved: true, paused: true };
    }

    default:
      return state;
  }
};

interface GameStateContextValue {
  readonly state: GameState;
  readonly dispatch: React.Dispatch<GameAction>;
}

const GameStateContext = createContext<GameStateContextValue | null>(null);

export interface GameStateProviderProps {
  readonly children: ReactNode;
}

export const GameStateProvider = ({ children }: GameStateProviderProps) => {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  // Persist to localStorage on every state change
  useEffect(() => {
    // Only persist if a game is active
    if (state.id) {
      saveToStorage(STORAGE_KEYS.GAME, state);
    }
  }, [state]);

  const value = useMemo<GameStateContextValue>(
    () => ({ state, dispatch }),
    [state, dispatch],
  );

  return (
    <GameStateContext.Provider value={value}>
      {children}
    </GameStateContext.Provider>
  );
};

export const useGameState = (): GameStateContextValue => {
  const ctx = useContext(GameStateContext);
  if (ctx === null) {
    throw new Error('useGameState must be used within GameStateProvider');
  }
  return ctx;
};

export const useGameDispatch = (): React.Dispatch<GameAction> => {
  return useGameState().dispatch;
};
