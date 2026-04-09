import { useState, useCallback } from 'react';
import { useGameState } from '@/engine/GameStateProvider';
import { usePanelManager } from '@/engine/PanelManager';
import { compilePuzzle, type PuzzleStep, type PuzzleBlueprint, CompilationError } from './compiler';
import type { ClueSpecial } from './types';

const CLUE_TYPES = [
  { value: 'adjacent', label: 'Adjacent count' },
  { value: 'adjacent-contiguous', label: 'Adjacent {N} contiguous' },
  { value: 'adjacent-nonContiguous', label: 'Adjacent -N- nonContiguous' },
  { value: 'line', label: 'Line clue (directional)' },
  { value: 'range', label: 'Range clue (radius-2)' },
  { value: 'edge-header', label: 'Edge header (row/col)' },
  { value: 'pre-revealed', label: 'Pre-revealed cell' },
] as const;

interface StepDraft {
  targetKind: 'auto' | 'coord';
  targetRow: number;
  targetCol: number;
  targetValue: 0 | 1;
  clueType: string;
}

function defaultStep(): StepDraft {
  return { targetKind: 'auto', targetRow: 0, targetCol: 0, targetValue: 1, clueType: 'adjacent' };
}

function parseClueType(s: string): { type: string; special?: ClueSpecial } {
  if (s === 'adjacent-contiguous') return { type: 'adjacent', special: 'contiguous' };
  if (s === 'adjacent-nonContiguous') return { type: 'adjacent', special: 'nonContiguous' };
  return { type: s };
}

interface BlueprintEditorProps {
  readonly onClose: () => void;
  /** Called when user clicks on grid in edit mode to pick a coord */
  readonly onPickCell?: (callback: (row: number, col: number) => void) => void;
  /** Currently picked cell from grid click */
  readonly pickedCell?: { row: number; col: number } | null;
  /** Set of step target coordKeys for grid markers */
  readonly onStepsChanged?: (steps: StepDraft[]) => void;
}

export function BlueprintEditor({ onClose, pickedCell, onStepsChanged }: BlueprintEditorProps) {
  const { dispatch } = useGameState();
  const { closePanel } = usePanelManager();

  const [gridWidth, setGridWidth] = useState(10);
  const [gridHeight, setGridHeight] = useState(10);
  const [density, setDensity] = useState(0.15);
  const [seed, setSeed] = useState(Math.floor(Math.random() * 10000));
  const [steps, setSteps] = useState<StepDraft[]>([defaultStep()]);
  const [error, setError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [pickingForStep, setPickingForStep] = useState<number | null>(null);

  // If a cell was picked from grid, apply it to the step waiting for it
  if (pickedCell && pickingForStep !== null) {
    const updated = [...steps];
    updated[pickingForStep] = {
      ...updated[pickingForStep],
      targetKind: 'coord',
      targetRow: pickedCell.row,
      targetCol: pickedCell.col,
    };
    setSteps(updated);
    setPickingForStep(null);
    onStepsChanged?.(updated);
  }

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    const updated = [...steps];
    updated[idx] = { ...updated[idx], ...patch };
    setSteps(updated);
    onStepsChanged?.(updated);
  };

  const addStep = () => {
    const updated = [...steps, defaultStep()];
    setSteps(updated);
    onStepsChanged?.(updated);
  };

  const removeStep = (idx: number) => {
    const updated = steps.filter((_, i) => i !== idx);
    setSteps(updated);
    onStepsChanged?.(updated);
  };

  const handleCompile = useCallback(() => {
    setError(null);
    setCompiling(true);

    try {
      const blueprintSteps: PuzzleStep[] = steps.map((s, i) => {
        const { type, special } = parseClueType(s.clueType);
        const strategy = type === 'pre-revealed'
          ? { kind: 'pre-revealed' as const }
          : { kind: 'clue' as const, type: type as 'adjacent', special };
        return {
          id: i,
          label: `Step ${i + 1}`,
          target: s.targetKind === 'coord'
            ? { kind: 'coord' as const, row: s.targetRow, col: s.targetCol }
            : { kind: 'auto' as const },
          targetValue: s.targetValue,
          requiredStrategy: strategy,
        };
      });

      const blueprint: PuzzleBlueprint = {
        id: `editor-${Date.now()}`,
        name: 'Custom Blueprint',
        width: gridWidth,
        height: gridHeight,
        mineDensity: density,
        seed,
        steps: blueprintSteps,
      };

      const puzzle = compilePuzzle(blueprint);

      dispatch({
        type: 'NEW_GAME',
        payload: {
          id: `compiled:${Date.now()}`,
          puzzleType: 'hexmine',
          difficulty: 'medium',
          width: puzzle.width,
          height: puzzle.height,
          grid: puzzle.grid as unknown[][],
          solution: puzzle.solution as unknown[][],
          clues: puzzle.clues,
          emptyCell: puzzle.emptyCell,
          shape: puzzle.shape ?? null,
        },
      });

      onClose();
      closePanel();
    } catch (e) {
      if (e instanceof CompilationError) {
        setError(`Step ${(e.failedStepId ?? -1) + 1}: ${e.message}`);
      } else {
        setError(String(e));
      }
    } finally {
      setCompiling(false);
    }
  }, [steps, gridWidth, gridHeight, density, seed, dispatch, onClose, closePanel]);

  return (
    <div className="bg-bg-secondary rounded-lg border border-grid-line overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary">
        <h3 className="text-sm font-bold text-text-primary">Blueprint Editor</h3>
        <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xs">✕</button>
      </div>

      {/* Grid settings */}
      <div className="px-3 py-2 border-b border-grid-line space-y-1">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Grid Settings</p>
        <div className="flex gap-2 text-xs">
          <label className="flex items-center gap-1">
            W <input type="number" value={gridWidth} onChange={(e) => setGridWidth(Number(e.target.value))}
              min={4} max={20} className="w-10 bg-bg-primary border border-grid-line rounded px-1 py-0.5 text-text-primary text-center" />
          </label>
          <label className="flex items-center gap-1">
            H <input type="number" value={gridHeight} onChange={(e) => setGridHeight(Number(e.target.value))}
              min={4} max={20} className="w-10 bg-bg-primary border border-grid-line rounded px-1 py-0.5 text-text-primary text-center" />
          </label>
          <label className="flex items-center gap-1">
            Mines <input type="number" value={Math.round(density * 100)} onChange={(e) => setDensity(Number(e.target.value) / 100)}
              min={5} max={30} className="w-10 bg-bg-primary border border-grid-line rounded px-1 py-0.5 text-text-primary text-center" />%
          </label>
          <label className="flex items-center gap-1">
            Seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))}
              className="w-16 bg-bg-primary border border-grid-line rounded px-1 py-0.5 text-text-primary text-center" />
          </label>
        </div>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Solving Steps</p>
        {steps.map((step, idx) => (
          <div key={idx} className="bg-bg-primary rounded p-2 space-y-1.5 border border-grid-line">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-primary">Step {idx + 1}</span>
              <button type="button" onClick={() => removeStep(idx)}
                className="text-[10px] text-error hover:text-text-primary">✕</button>
            </div>

            <div className="flex gap-2 text-[11px]">
              <select value={step.targetKind} onChange={(e) => updateStep(idx, { targetKind: e.target.value as 'auto' | 'coord' })}
                className="bg-bg-secondary border border-grid-line rounded px-1 py-0.5 text-text-primary">
                <option value="auto">Auto pick</option>
                <option value="coord">Specific cell</option>
              </select>

              {step.targetKind === 'coord' && (
                <span className="text-text-secondary">
                  ({step.targetRow},{step.targetCol})
                  <button type="button" onClick={() => setPickingForStep(idx)}
                    className="ml-1 text-accent hover:text-accent-hover">📍</button>
                </span>
              )}
            </div>

            <div className="flex gap-2 text-[11px]">
              <select value={step.targetValue} onChange={(e) => updateStep(idx, { targetValue: Number(e.target.value) as 0 | 1 })}
                className="bg-bg-secondary border border-grid-line rounded px-1 py-0.5 text-text-primary">
                <option value={1}>Mine 💣</option>
                <option value={0}>Safe ✓</option>
              </select>

              <select value={step.clueType} onChange={(e) => updateStep(idx, { clueType: e.target.value })}
                className="bg-bg-secondary border border-grid-line rounded px-1 py-0.5 text-text-primary flex-1">
                {CLUE_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}

        <button type="button" onClick={addStep}
          className="w-full py-1.5 text-xs rounded border border-dashed border-grid-line text-text-secondary hover:text-accent hover:border-accent transition-colors">
          + Add Step
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 bg-error/10 border-t border-error/30 text-xs text-error">
          {error}
        </div>
      )}

      {/* Compile button */}
      <div className="px-3 py-2 border-t border-grid-line">
        <button
          type="button"
          onClick={handleCompile}
          disabled={compiling || steps.length === 0}
          className="w-full py-2 rounded bg-accent hover:bg-accent-hover text-white font-bold text-sm transition-colors disabled:opacity-50"
        >
          {compiling ? 'Compiling...' : `Compile & Play (${steps.length} steps)`}
        </button>
        <p className="text-[10px] text-text-tertiary mt-1">
          {pickingForStep !== null
            ? '📍 Click a cell on the grid to set target...'
            : 'Define steps, then compile to generate and play the puzzle.'}
        </p>
      </div>
    </div>
  );
}
