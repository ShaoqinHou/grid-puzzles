import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePanelManager } from '@/engine/PanelManager';
import { useGameState } from '@/engine/GameStateProvider';
import { SlidePanel } from './ui/SlidePanel';
import { IconButton } from './ui/IconButton';
import { useSolverVisualization, type SolveTechnique, type BlockPosition, type TechniqueVisualizationData } from './SolverContext';
import { solveNonogramWithSteps, type SolveStep } from '@/puzzles/nonogram/solveWithSteps';
import type { NonogramClues } from '@/puzzles/nonogram/types';

/**
 * Convert leftmostPositions/rightmostPositions from the solver step
 * into BlockPosition arrays for the visualization context.
 */
function buildBlockPositions(
  positions: number[] | undefined,
  clue: number[],
): BlockPosition[] | null {
  if (!positions || positions.length === 0) return null;
  return positions.map((start, i) => ({
    blockIndex: i,
    start,
    length: clue[i],
  }));
}

/**
 * Compute the set of cells that fall in the overlap zone between
 * leftmost and rightmost placements.
 */
function computeOverlapCells(step: SolveStep): ReadonlySet<string> {
  const set = new Set<string>();
  if (!step.leftmostPositions || !step.rightmostPositions) return set;

  const clue = step.clue;
  for (let blockIdx = 0; blockIdx < clue.length; blockIdx++) {
    const leftStart = step.leftmostPositions[blockIdx];
    const rightStart = step.rightmostPositions[blockIdx];
    const blockLen = clue[blockIdx];

    // Overlap: cells from rightStart to (leftStart + blockLen - 1)
    const overlapStart = rightStart;
    const overlapEnd = leftStart + blockLen - 1;

    for (let pos = overlapStart; pos <= overlapEnd; pos++) {
      if (step.lineType === 'row') {
        set.add(`${step.lineIndex},${pos}`);
      } else {
        set.add(`${pos},${step.lineIndex}`);
      }
    }
  }

  return set;
}

/**
 * Build technique-specific visualization data from a step and the current animation phase.
 */
function buildTechniqueData(
  step: SolveStep,
  _animationPhase: number,
): TechniqueVisualizationData | null {
  switch (step.technique) {
    case 'overlap': {
      if (!step.leftmostPositions || !step.rightmostPositions) return null;
      const leftmostBlocks = buildBlockPositions(step.leftmostPositions, step.clue);
      const rightmostBlocks = buildBlockPositions(step.rightmostPositions, step.clue);
      if (leftmostBlocks && rightmostBlocks) {
        return {
          type: 'overlap',
          leftmostBlocks,
          rightmostBlocks,
          overlapCells: computeOverlapCells(step),
        };
      }
      return null;
    }

    case 'block-completion': {
      const vd = step.vizData;
      if (!vd) return null;
      const blockRun = vd.blockRun as { start: number; end: number } | undefined;
      const blockIndex = vd.blockIndex as number | undefined;
      const forcedEmptyPositions = vd.forcedEmptyPositions as number[] | undefined;
      if (blockRun === undefined || blockIndex === undefined || forcedEmptyPositions === undefined) return null;
      return {
        type: 'completed-block',
        blockRun,
        blockIndex,
        forcedEmptyPositions,
        lineType: step.lineType,
        lineIndex: step.lineIndex,
      };
    }

    case 'block-pushing': {
      const vd = step.vizData;
      if (!vd) return null;
      const pinnedCellPos = vd.pinnedCell as number | undefined;
      const blockIndex = vd.blockIndex as number | undefined;
      const constrainedRange = vd.constrainedRange as { start: number; end: number } | undefined;
      if (pinnedCellPos === undefined || blockIndex === undefined || constrainedRange === undefined) return null;
      const pinnedCell: { row: number; col: number } = step.lineType === 'row'
        ? { row: step.lineIndex, col: pinnedCellPos }
        : { row: pinnedCellPos, col: step.lineIndex };
      return {
        type: 'block-pushing',
        pinnedCell,
        blockIndex,
        constrainedRange,
        lineType: step.lineType,
        lineIndex: step.lineIndex,
      };
    }

    case 'probe': {
      const vd = step.vizData;
      if (!vd) return null;
      const targetCell = vd.targetCell as { row: number; col: number } | undefined;
      const hypothesisValue = vd.hypothesisValue as 'filled' | 'empty' | undefined;
      const resolvedValue = vd.resolvedValue as 'filled' | 'empty' | undefined;
      if (!targetCell || !hypothesisValue || !resolvedValue) return null;
      const contradictionLine = vd.contradictionLine as { lineType: 'row' | 'col'; lineIndex: number } | undefined;
      return {
        type: 'probe',
        targetCell,
        hypothesisValue,
        resolvedValue,
        ...(contradictionLine ? { contradictionLine } : {}),
      };
    }

    case 'full-line': {
      if (!step.leftmostPositions) return null;
      const blockPlacements = step.leftmostPositions.map((start, i) => ({
        start,
        length: step.clue[i],
      }));
      return { type: 'full-line', blockPlacements };
    }

    default:
      return null;
  }
}

/** Phase-specific description text for multi-phase techniques */
function phaseDescription(
  data: TechniqueVisualizationData | null,
  phase: number,
  step: SolveStep,
): string | null {
  if (!data) return null;

  switch (data.type) {
    case 'overlap':
      switch (phase) {
        case 0: return 'Push blocks as far LEFT as possible.';
        case 1: return 'Push blocks as far RIGHT as possible.';
        case 2: return 'Cells in BOTH placements must be filled.';
        default: return null;
      }

    case 'completed-block': {
      const runLen = data.blockRun.end - data.blockRun.start + 1;
      switch (phase) {
        case 0: return `Filled run matches block size ${runLen}. Block is complete!`;
        case 1: return 'Cells adjacent to complete block must be empty.';
        default: return null;
      }
    }

    case 'block-pushing': {
      const blockSize = step.clue.filter((c) => c > 0)[data.blockIndex] ?? 0;
      switch (phase) {
        case 0: return 'This cell is filled. Which block covers it?';
        case 1: return `Block ${data.blockIndex + 1} (size ${blockSize}) must cover this cell. It can only be at positions ${data.constrainedRange.start}..${data.constrainedRange.end}.`;
        case 2: return `Overlap from constrained range determines ${step.cellsResolved.length} cell(s).`;
        default: return null;
      }
    }

    case 'probe': {
      switch (phase) {
        case 0: return `What if cell (${data.targetCell.row},${data.targetCell.col}) is ${data.hypothesisValue?.toUpperCase()}?`;
        case 1: return 'Propagating assumption...';
        case 2: return data.contradictionLine
          ? `CONTRADICTION! ${data.contradictionLine.lineType === 'row' ? 'Row' : 'Col'} ${data.contradictionLine.lineIndex} can't satisfy its clue.`
          : 'CONTRADICTION found during propagation!';
        case 3: return `Therefore cell (${data.targetCell.row},${data.targetCell.col}) must be ${data.resolvedValue?.toUpperCase()}.`;
        default: return null;
      }
    }

    default:
      return null;
  }
}

/** Color classes for technique badges */
function techniqueBadgeClasses(technique: SolveTechnique): string {
  switch (technique) {
    case 'full-line':
    case 'empty-line':
      return 'bg-success/20 text-success';
    case 'overlap':
      return 'bg-accent/20 text-accent';
    case 'edge-forcing':
    case 'block-completion':
    case 'block-pushing':
    case 'gap-splitting':
      return 'bg-warning/20 text-warning';
    case 'probe':
      return 'bg-error/20 text-error';
    case 'unreachable':
    case 'elimination':
    case 'cross-propagation':
    default:
      return 'bg-bg-tertiary text-text-secondary';
  }
}

/** Human-readable label for technique */
function techniqueLabel(technique: SolveTechnique): string {
  switch (technique) {
    case 'empty-line': return 'EMPTY LINE';
    case 'full-line': return 'FULL LINE';
    case 'overlap': return 'OVERLAP';
    case 'edge-forcing': return 'EDGE FORCING';
    case 'gap-splitting': return 'GAP SPLIT';
    case 'block-completion': return 'BLOCK COMPLETE';
    case 'block-pushing': return 'BLOCK PUSH';
    case 'unreachable': return 'UNREACHABLE';
    case 'elimination': return 'ELIMINATION';
    case 'cross-propagation': return 'PROPAGATION';
    case 'probe': return 'PROBE';
  }
}

export function SolverPanel() {
  const { activePanel, closePanel } = usePanelManager();
  const { state } = useGameState();
  const { setVisualization, clearVisualization } = useSolverVisualization();
  const isOpen = activePanel === 'solver';

  const [steps, setSteps] = useState<SolveStep[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [animationPhase, setAnimationPhase] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);

  // Compute steps when panel opens
  useEffect(() => {
    if (!isOpen || !state.id || state.puzzleType !== 'nonogram') {
      return;
    }

    // Solver visualization is limited to grids <= 20x20
    if (state.width > 20 || state.height > 20) {
      setSteps([{
        technique: 'overlap',
        lineType: 'row',
        lineIndex: 0,
        clue: [],
        logic: `Solver visualization is available for grids up to 20x20. For ${state.width}x${state.height}, the solving process may be too large for real-time step-by-step display. Try a smaller grid to see the solving process!`,
        cellsResolved: [],
        values: [],
        gridSnapshot: Array.from({ length: state.height }, () =>
          Array.from({ length: state.width }, () => 'empty' as const)),
      }]);
      setCurrentStep(0);
      setAnimationPhase(0);
      setAutoPlaying(false);
      return;
    }

    const clues = state.clues as NonogramClues;
    const result = solveNonogramWithSteps(clues, state.width, state.height);
    setSteps(result.steps);
    setCurrentStep(result.steps.length > 0 ? 0 : -1);
    setAnimationPhase(0);
    setAutoPlaying(false);
  }, [isOpen, state.id, state.puzzleType, state.clues, state.width, state.height]);

  // Refs for latest state (used by auto-play interval)
  const stepsRef = useRef(steps);
  const currentStepRef = useRef(currentStep);
  const animationPhaseRef = useRef(animationPhase);
  stepsRef.current = steps;
  currentStepRef.current = currentStep;
  animationPhaseRef.current = animationPhase;

  // Auto-play interval — advances sub-phases, then moves to next step
  useEffect(() => {
    if (!autoPlaying || steps.length === 0) return;

    const intervalId = setInterval(() => {
      const cs = currentStepRef.current;
      const ap = animationPhaseRef.current;
      const allSteps = stepsRef.current;
      const totalPhasesForStep = allSteps[cs]?.phases ?? 1;

      if (ap < totalPhasesForStep - 1) {
        // Advance within current step
        setAnimationPhase(ap + 1);
      } else if (cs < allSteps.length - 1) {
        // Move to next step, reset phase
        setCurrentStep(cs + 1);
        setAnimationPhase(0);
      } else {
        // At the end
        setAutoPlaying(false);
      }
    }, speed);

    return () => clearInterval(intervalId);
  }, [autoPlaying, speed, steps.length]);

  const step = useMemo(() => {
    if (currentStep >= 0 && currentStep < steps.length) {
      return steps[currentStep];
    }
    return null;
  }, [steps, currentStep]);

  const technique = useMemo((): SolveTechnique | null => {
    if (!step) return null;
    return step.technique;
  }, [step]);

  // Total phases for the current step
  const totalPhases = useMemo(() => step?.phases ?? 1, [step]);

  // Build set of cells resolved in the current step (for pulse highlight)
  const currentResolved = useMemo(() => {
    const set = new Set<string>();
    if (step) {
      for (const coord of step.cellsResolved) {
        set.add(`${coord.row},${coord.col}`);
      }
    }
    return set;
  }, [step]);

  // Build block position data for overlap visualization
  const leftmostBlocks = useMemo<BlockPosition[] | null>(() => {
    if (!step || technique !== 'overlap') return null;
    return buildBlockPositions(step.leftmostPositions, step.clue);
  }, [step, technique]);

  const rightmostBlocks = useMemo<BlockPosition[] | null>(() => {
    if (!step || technique !== 'overlap') return null;
    return buildBlockPositions(step.rightmostPositions, step.clue);
  }, [step, technique]);

  const overlapCells = useMemo<ReadonlySet<string>>(() => {
    if (!step || technique !== 'overlap') return new Set<string>();
    return computeOverlapCells(step);
  }, [step, technique]);

  // Build technique-specific data for the current phase
  const techniqueData = useMemo<TechniqueVisualizationData | null>(() => {
    if (!step) return null;
    return buildTechniqueData(step, animationPhase);
  }, [step, animationPhase]);

  // Push visualization state to the SolverContext whenever the current step or phase changes
  useEffect(() => {
    if (!isOpen || !step) {
      clearVisualization();
      return;
    }

    setVisualization({
      active: true,
      currentStep,
      totalSteps: steps.length,
      solverGrid: step.gridSnapshot,
      highlightRow: step.lineType === 'row' ? step.lineIndex : null,
      highlightCol: step.lineType === 'col' ? step.lineIndex : null,
      stepCells: currentResolved,
      leftmostBlocks,
      rightmostBlocks,
      overlapCells,
      technique,
      animationPhase,
      totalPhases,
      techniqueData,
    });
  }, [isOpen, step, currentStep, steps.length, currentResolved, technique, leftmostBlocks, rightmostBlocks, overlapCells, animationPhase, totalPhases, techniqueData, setVisualization, clearVisualization]);

  // Clear visualization when panel closes
  useEffect(() => {
    if (!isOpen) {
      clearVisualization();
    }
  }, [isOpen, clearVisualization]);

  const handleFirst = useCallback(() => {
    setAutoPlaying(false);
    setCurrentStep(0);
    setAnimationPhase(0);
  }, []);

  const handlePrev = useCallback(() => {
    setAutoPlaying(false);
    if (animationPhase > 0) {
      setAnimationPhase((prev) => prev - 1);
    } else if (currentStep > 0) {
      const prevStepPhases = steps[currentStep - 1]?.phases ?? 1;
      setCurrentStep((prev) => prev - 1);
      setAnimationPhase(prevStepPhases - 1);
    }
  }, [animationPhase, currentStep, steps]);

  const handleNext = useCallback(() => {
    setAutoPlaying(false);
    const currentTotalPhases = steps[currentStep]?.phases ?? 1;
    if (animationPhase < currentTotalPhases - 1) {
      setAnimationPhase((prev) => prev + 1);
    } else if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setAnimationPhase(0);
    }
  }, [animationPhase, currentStep, steps]);

  const handleLast = useCallback(() => {
    setAutoPlaying(false);
    const lastIdx = steps.length - 1;
    setCurrentStep(lastIdx);
    const lastPhases = steps[lastIdx]?.phases ?? 1;
    setAnimationPhase(lastPhases - 1);
  }, [steps]);

  const handleAutoPlay = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      const lastPhases = steps[steps.length - 1]?.phases ?? 1;
      if (animationPhase >= lastPhases - 1) {
        // Reset to beginning if at end
        setCurrentStep(0);
        setAnimationPhase(0);
      }
    }
    setAutoPlaying((prev) => !prev);
  }, [currentStep, animationPhase, steps]);

  const handleClose = useCallback(() => {
    setAutoPlaying(false);
    clearVisualization();
    closePanel();
  }, [closePanel, clearVisualization]);

  // Determine if we're at the very start or very end of all steps+phases
  const atVeryStart = currentStep <= 0 && animationPhase <= 0;
  const atVeryEnd = currentStep >= steps.length - 1 && animationPhase >= (steps[steps.length - 1]?.phases ?? 1) - 1;

  return (
    <SlidePanel open={isOpen} onClose={handleClose} title="Solve Step-by-Step">
      <div className="space-y-4">
        {/* Header: step counter + technique badge */}
        {steps.length > 0 && step ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary tabular-nums">
              Step {currentStep + 1} / {steps.length}
              {totalPhases > 1 && (
                <span className="text-text-tertiary"> &middot; Phase {animationPhase + 1}/{totalPhases}</span>
              )}
            </span>
            {technique && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${techniqueBadgeClasses(technique)}`}>
                {techniqueLabel(technique)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-sm text-text-tertiary text-center">
            {isOpen && state.id ? 'No steps to show' : 'Open a puzzle first'}
          </div>
        )}

        {/* Transport controls */}
        {steps.length > 0 && (
          <>
            <div className="flex items-center justify-center gap-1">
              <IconButton onClick={handleFirst} title="First step" disabled={atVeryStart}>
                ⏮
              </IconButton>
              <IconButton onClick={handlePrev} title="Previous phase" disabled={atVeryStart}>
                ◀
              </IconButton>
              <IconButton onClick={handleNext} title="Next phase" disabled={atVeryEnd}>
                ▶
              </IconButton>
              <IconButton onClick={handleLast} title="Last step" disabled={atVeryEnd}>
                ⏭
              </IconButton>
              <IconButton onClick={handleAutoPlay} title={autoPlaying ? 'Pause auto-play' : 'Auto-play'}>
                {autoPlaying ? '⏸' : '▶▶'}
              </IconButton>
            </div>

            {/* Speed slider */}
            <div className="px-2">
              <label className="text-xs text-text-tertiary block mb-1">
                Speed: {speed}ms
              </label>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </>
        )}

        {/* Step detail */}
        {step && (
          <div className="space-y-3 border-t border-grid-line pt-3">
            {/* Line identifier + clue */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-accent uppercase tracking-wide">
                {step.lineType === 'row' ? `Row ${step.lineIndex}` : `Col ${step.lineIndex}`}
              </span>
              {step.clue.length > 0 && (
                <span className="text-xs font-mono font-bold text-accent">
                  [{step.clue.join(', ')}]
                </span>
              )}
            </div>

            {/* Logic explanation */}
            <p className="text-xs text-text-primary leading-relaxed bg-bg-tertiary rounded px-2 py-1.5">
              {step.logic}
            </p>

            {/* Phase-specific description for multi-phase steps */}
            {totalPhases > 1 && techniqueData && (() => {
              const desc = phaseDescription(techniqueData, animationPhase, step);
              return desc ? (
                <p className="text-xs font-medium text-accent leading-relaxed bg-accent/10 rounded px-2 py-1.5">
                  Phase {animationPhase + 1}: {desc}
                </p>
              ) : null;
            })()}

            {/* Cells resolved count */}
            <div className="text-xs text-text-tertiary">
              {step.cellsResolved.length} cell{step.cellsResolved.length !== 1 ? 's' : ''} resolved
            </div>
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
