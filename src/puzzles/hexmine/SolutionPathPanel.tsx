import { useState, useMemo } from 'react';
import { useGameState } from '@/engine/GameStateProvider';
import type { HexMineClueData } from './types';
import type { SolutionStep } from './compiler/explainer';

interface SolutionPathPanelProps {
  readonly onClose: () => void;
  readonly onHighlightStep: (step: SolutionStep | null) => void;
}

export function SolutionPathPanel({ onClose, onHighlightStep }: SolutionPathPanelProps) {
  const { state } = useGameState();
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const solutionPath = useMemo(() => {
    const clueData = state.clues as HexMineClueData | null;
    return clueData?.solutionPath ?? [];
  }, [state.clues]);

  if (solutionPath.length === 0) {
    return (
      <div className="bg-bg-secondary rounded-lg border border-grid-line overflow-hidden max-w-sm">
        <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary">
          <h3 className="text-sm font-bold text-text-primary">Solution Path</h3>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xs">✕</button>
        </div>
        <div className="px-3 py-4 text-xs text-text-tertiary text-center">
          No solution path available.<br />
          Only compiled puzzles (from Crafted Puzzles pack) have designed solving paths.
        </div>
      </div>
    );
  }

  const handleStepClick = (idx: number) => {
    if (activeStep === idx) {
      setActiveStep(null);
      onHighlightStep(null);
    } else {
      setActiveStep(idx);
      onHighlightStep(solutionPath[idx]);
    }
  };

  const handlePrev = () => {
    const next = activeStep === null ? 0 : Math.max(0, activeStep - 1);
    setActiveStep(next);
    onHighlightStep(solutionPath[next]);
  };

  const handleNext = () => {
    const next = activeStep === null ? 0 : Math.min(solutionPath.length - 1, activeStep + 1);
    setActiveStep(next);
    onHighlightStep(solutionPath[next]);
  };

  return (
    <div className="bg-bg-secondary rounded-lg border border-grid-line overflow-hidden max-w-sm max-h-[70vh] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary">
        <h3 className="text-sm font-bold text-text-primary">Solution Path</h3>
        <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xs">✕</button>
      </div>

      {/* Step navigation */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-grid-line">
        <button
          type="button"
          onClick={handlePrev}
          disabled={activeStep === 0 || activeStep === null}
          className="text-xs px-2 py-0.5 rounded bg-bg-primary text-text-secondary hover:text-white disabled:opacity-30"
        >
          ◀ Prev
        </button>
        <span className="text-xs text-text-tertiary">
          {activeStep !== null ? `Step ${activeStep + 1} / ${solutionPath.length}` : `${solutionPath.length} steps`}
        </span>
        <button
          type="button"
          onClick={handleNext}
          disabled={activeStep === solutionPath.length - 1}
          className="text-xs px-2 py-0.5 rounded bg-bg-primary text-text-secondary hover:text-white disabled:opacity-30"
        >
          Next ▶
        </button>
      </div>

      {/* Step list */}
      <div className="overflow-y-auto flex-1">
        {solutionPath.map((step, idx) => (
          <button
            key={step.stepId}
            type="button"
            onClick={() => handleStepClick(idx)}
            className={`w-full text-left px-3 py-2 border-b border-grid-line last:border-b-0 transition-colors ${
              activeStep === idx ? 'bg-accent/20' : 'hover:bg-bg-tertiary'
            }`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold px-1 rounded ${
                step.targetValue === 'mine' ? 'bg-error/20 text-error' : 'bg-success/20 text-success'
              }`}>
                {step.targetValue === 'mine' ? '💣' : '✓'}
              </span>
              <span className="text-xs font-medium text-text-primary">{step.summary}</span>
            </div>
            {activeStep === idx && (
              <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                {step.explanation}
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 py-1.5 bg-bg-tertiary text-[10px] text-text-tertiary">
        Click a step to highlight on the grid. The clue's scope cells will glow.
      </div>
    </div>
  );
}
