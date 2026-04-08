import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CellCoord } from '@/types';

/** Position of a single block within a line placement */
export interface BlockPosition {
  readonly blockIndex: number;
  readonly start: number;
  readonly length: number;
}

/** Technique identifier for step classification and color-coding */
export type SolveTechnique =
  | 'empty-line'
  | 'full-line'
  | 'overlap'
  | 'edge-forcing'
  | 'gap-splitting'
  | 'block-completion'
  | 'block-pushing'
  | 'unreachable'
  | 'elimination'
  | 'cross-propagation'
  | 'probe';

/** Discriminated union for technique-specific visualization data */
export type TechniqueVisualizationData =
  | { type: 'overlap'; leftmostBlocks: BlockPosition[]; rightmostBlocks: BlockPosition[]; overlapCells: ReadonlySet<string> }
  | { type: 'edge-forcing'; anchorCell: CellCoord; blockExtent: { start: number; end: number }; blockSize: number; lineType: 'row' | 'col'; lineIndex: number }
  | { type: 'completed-block'; blockRun: { start: number; end: number }; blockIndex: number; forcedEmptyPositions: number[]; lineType: 'row' | 'col'; lineIndex: number }
  | { type: 'block-pushing'; pinnedCell: CellCoord; blockIndex: number; constrainedRange: { start: number; end: number }; lineType: 'row' | 'col'; lineIndex: number }
  | { type: 'probe'; targetCell: CellCoord; hypothesisValue: 'filled' | 'empty'; contradictionLine?: { lineType: 'row' | 'col'; lineIndex: number }; resolvedValue: 'filled' | 'empty' }
  | { type: 'full-line'; blockPlacements: { start: number; length: number }[] }
  | { type: 'gap-splitting'; segments: { start: number; end: number; color: string }[]; dividerPositions: number[] }
  | { type: 'cross-propagation'; flowDirection: 'from-row' | 'from-col'; sourceLineIndex: number }
  | { type: 'unreachable'; blockRanges: { start: number; end: number }[]; unreachablePositions: number[] };

/** State exposed to Grid and other components during solver visualization */
export interface SolverVisualization {
  /** Whether the solver visualizer is actively controlling the grid */
  readonly active: boolean;
  /** Current step index (0-based) */
  readonly currentStep: number;
  /** Total number of steps */
  readonly totalSteps: number;
  /** Grid to overlay on the main grid while solver is active */
  readonly solverGrid: unknown[][] | null;
  /** Row index to highlight, or null */
  readonly highlightRow: number | null;
  /** Column index to highlight, or null */
  readonly highlightCol: number | null;
  /** "row,col" keys of cells resolved in the CURRENT step (pulse ring effect) */
  readonly stepCells: ReadonlySet<string>;
  /** Block positions for leftmost placement (overlap technique) */
  readonly leftmostBlocks: readonly BlockPosition[] | null;
  /** Block positions for rightmost placement (overlap technique) */
  readonly rightmostBlocks: readonly BlockPosition[] | null;
  /** "row,col" keys of cells in the overlap zone */
  readonly overlapCells: ReadonlySet<string>;
  /** The technique used in the current step */
  readonly technique: SolveTechnique | null;
  /** Current sub-phase within a step (0-based) */
  readonly animationPhase: number;
  /** Total phases for the current step */
  readonly totalPhases: number;
  /** Technique-specific visualization data */
  readonly techniqueData: TechniqueVisualizationData | null;
}

interface SolverContextValue {
  readonly visualization: SolverVisualization;
  readonly setVisualization: (v: SolverVisualization) => void;
  readonly clearVisualization: () => void;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

const INITIAL: SolverVisualization = {
  active: false,
  currentStep: 0,
  totalSteps: 0,
  solverGrid: null,
  highlightRow: null,
  highlightCol: null,
  stepCells: EMPTY_SET,
  leftmostBlocks: null,
  rightmostBlocks: null,
  overlapCells: EMPTY_SET,
  technique: null,
  animationPhase: 0,
  totalPhases: 1,
  techniqueData: null,
};

const SolverContext = createContext<SolverContextValue | null>(null);

export interface SolverProviderProps {
  readonly children: ReactNode;
}

export function SolverProvider({ children }: SolverProviderProps) {
  const [visualization, setVisualizationRaw] = useState<SolverVisualization>(INITIAL);

  const setVisualization = useCallback((v: SolverVisualization) => {
    setVisualizationRaw(v);
  }, []);

  const clearVisualization = useCallback(() => {
    setVisualizationRaw(INITIAL);
  }, []);

  const value = useMemo<SolverContextValue>(
    () => ({ visualization, setVisualization, clearVisualization }),
    [visualization, setVisualization, clearVisualization],
  );

  return (
    <SolverContext.Provider value={value}>
      {children}
    </SolverContext.Provider>
  );
}

export function useSolverVisualization(): SolverContextValue {
  const ctx = useContext(SolverContext);
  if (ctx === null) {
    throw new Error('useSolverVisualization must be used within SolverProvider');
  }
  return ctx;
}
