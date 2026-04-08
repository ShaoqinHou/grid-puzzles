import { useGameState } from '@/engine/GameStateProvider';
import { useGameEvaluation } from '@/engine/GameEvaluatorProvider';
import { usePanelManager } from '@/engine/PanelManager';
import { IconButton } from './ui/IconButton';
import { ConfirmButton } from './ui/ConfirmButton';

export function GameToolbar() {
  const { state, dispatch } = useGameState();
  const evaluation = useGameEvaluation();
  const { openPanel } = usePanelManager();

  if (!state.id) return null;

  return (
    <div className="flex items-center gap-2 py-2">
      <IconButton
        onClick={() => dispatch({ type: 'UNDO' })}
        title="Undo (Ctrl+Z)"
        disabled={state.undoStack.length === 0}
      >
        ↩
      </IconButton>
      <IconButton
        onClick={() => dispatch({ type: 'REDO' })}
        title="Redo (Ctrl+Y)"
        disabled={state.redoStack.length === 0}
      >
        ↪
      </IconButton>
      <IconButton
        onClick={() => dispatch({ type: 'CHECK' })}
        title="Check (C)"
      >
        ✓
      </IconButton>
      <ConfirmButton
        onConfirm={() => dispatch({ type: 'RESET' })}
        label="Reset"
        confirmLabel="Reset?"
      />
      <button
        onClick={() => openPanel('solver')}
        title="Solve step-by-step"
        className="px-3 py-1.5 rounded text-sm bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
      >
        Solve ▶
      </button>
      {evaluation.progress > 0 && (
        <span className="text-xs text-text-tertiary ml-2">
          {Math.round(evaluation.progress * 100)}%
        </span>
      )}
    </div>
  );
}
