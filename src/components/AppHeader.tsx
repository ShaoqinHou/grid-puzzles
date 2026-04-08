import { usePanelManager } from '@/engine/PanelManager';
import { useGameState } from '@/engine/GameStateProvider';
import { useTimer } from '@/engine/TimerProvider';
import { formatElapsed } from '@/utils/formatters';
import { usePreferences } from '@/engine/PreferencesProvider';

export function AppHeader() {
  const { togglePanel } = usePanelManager();
  const { state } = useGameState();
  const { elapsedMs } = useTimer();
  const { preferences } = usePreferences();

  return (
    <header className="relative z-60 flex items-center justify-between px-4 py-3 border-b border-grid-line bg-bg-secondary">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-text-primary">Grid Puzzles</h1>
        {state.id && (
          <span className="text-xs text-text-tertiary uppercase tracking-wider">
            {state.puzzleType} · {state.width}×{state.height}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {preferences.showTimer && state.id && !state.solved && (
          <span className="text-sm font-mono text-text-secondary" data-testid="timer">{formatElapsed(elapsedMs)}</span>
        )}
        <button
          type="button"
          onClick={() => togglePanel('puzzle-select')}
          className="text-sm px-3 py-1 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          New Game
        </button>
        <button
          type="button"
          onClick={() => togglePanel('settings')}
          className="text-text-secondary hover:text-text-primary text-lg"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
