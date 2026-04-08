import { useGameEvaluation } from '@/engine/GameEvaluatorProvider';
import { useGameState } from '@/engine/GameStateProvider';
import { useTimer } from '@/engine/TimerProvider';
import { formatElapsed } from '@/utils/formatters';

export function CompletionOverlay() {
  const evaluation = useGameEvaluation();
  const { state } = useGameState();
  const { elapsedMs } = useTimer();

  if (!evaluation.solved || !state.id) return null;

  return (
    <div className="fixed inset-0 top-[49px] z-30 flex items-center justify-center bg-black/40" data-testid="completion-overlay">
      <div className="bg-bg-secondary rounded-lg border border-grid-line p-8 text-center max-w-sm mx-4">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Puzzle Complete!</h2>
        <p className="text-text-secondary mb-1">
          {state.width}×{state.height} {state.puzzleType}
        </p>
        <p className="text-2xl font-mono text-accent mb-6">{formatElapsed(elapsedMs)}</p>
      </div>
    </div>
  );
}
