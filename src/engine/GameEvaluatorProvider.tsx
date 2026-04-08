import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useGameState } from '@/engine/GameStateProvider';
import { usePuzzleRegistry } from '@/engine/PuzzleRegistry';
import { evaluateGrid, type EvaluationResult } from '@/engine/evaluateGrid';
import { coordToKey } from '@/utils/grid';

export interface EvaluationContextValue extends EvaluationResult {
  readonly errorKeys: ReadonlySet<string>;
}

const EMPTY_EVALUATION: EvaluationContextValue = {
  filledCount: 0,
  totalCount: 0,
  progress: 0,
  lineStatus: new Map(),
  errors: [],
  solved: false,
  errorKeys: new Set(),
};

const GameEvaluatorContext = createContext<EvaluationContextValue | null>(null);

export interface GameEvaluatorProviderProps {
  readonly children: ReactNode;
}

export const GameEvaluatorProvider = ({ children }: GameEvaluatorProviderProps) => {
  const { state } = useGameState();
  const { getDefinition } = usePuzzleRegistry();

  const { grid, solution, clues, checkMode, puzzleType, shape } = state;
  const definition = getDefinition(puzzleType);

  const { dispatch } = useGameState();

  const evaluation = useMemo<EvaluationContextValue>(() => {
    if (!definition || grid.length === 0) return EMPTY_EVALUATION;

    const result = evaluateGrid(grid, solution, clues, definition, checkMode, shape);
    const errorKeys: ReadonlySet<string> = new Set(result.errors.map(coordToKey));
    return { ...result, errorKeys };
  }, [grid, solution, clues, definition, checkMode, shape]);

  useEffect(() => {
    if (evaluation.solved && !state.solved) {
      dispatch({ type: 'MARK_SOLVED' });
    }
  }, [evaluation.solved, state.solved, dispatch]);

  return (
    <GameEvaluatorContext.Provider value={evaluation}>
      {children}
    </GameEvaluatorContext.Provider>
  );
};

export const useGameEvaluation = (): EvaluationContextValue => {
  const ctx = useContext(GameEvaluatorContext);
  if (ctx === null) {
    throw new Error('useGameEvaluation must be used within GameEvaluatorProvider');
  }
  return ctx;
};
