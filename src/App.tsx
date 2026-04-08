import { PreferencesProvider } from '@/engine/PreferencesProvider';
import { PuzzleRegistryProvider } from '@/engine/PuzzleRegistry';
import { GameStateProvider, useGameState } from '@/engine/GameStateProvider';
import { TimerProvider } from '@/engine/TimerProvider';
import { GameEvaluatorProvider } from '@/engine/GameEvaluatorProvider';
import { PanelManagerProvider, usePanelManager } from '@/engine/PanelManager';
import { usePuzzleRegistry } from '@/engine/PuzzleRegistry';
import { ALL_PUZZLE_DEFINITIONS } from '@/puzzles/index';
import { SolverProvider } from '@/components/SolverContext';

import { AppHeader } from '@/components/AppHeader';
import { Grid } from '@/components/Grid';
import { GameToolbar } from '@/components/GameToolbar';
import { PuzzleSelector } from '@/components/PuzzleSelector';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CompletionOverlay } from '@/components/CompletionOverlay';
import { SolverPanel } from '@/components/SolverPanel';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export const App = () => {
  return (
    <PreferencesProvider>
      <PuzzleRegistryProvider definitions={ALL_PUZZLE_DEFINITIONS}>
        <GameStateProvider>
          <TimerProvider>
            <GameEvaluatorProvider>
              <PanelManagerProvider>
                <SolverProvider>
                  <AppContent />
                </SolverProvider>
              </PanelManagerProvider>
            </GameEvaluatorProvider>
          </TimerProvider>
        </GameStateProvider>
      </PuzzleRegistryProvider>
    </PreferencesProvider>
  );
};

function AppContent() {
  const { state } = useGameState();
  const { getDefinition } = usePuzzleRegistry();
  const { openPanel } = usePanelManager();
  useKeyboardShortcuts();

  const definition = state.id ? getDefinition(state.puzzleType) : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <AppHeader />

      <main className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        {state.id && definition ? (
          <>
            <GameToolbar />
            {definition.GridRenderer
              ? <definition.GridRenderer definition={definition} />
              : <Grid definition={definition} />}
          </>
        ) : (
          <div className="text-center">
            <p className="text-text-secondary mb-4">No puzzle loaded</p>
            <button
              type="button"
              onClick={() => openPanel('puzzle-select')}
              className="px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded transition-colors"
            >
              Start a Puzzle
            </button>
          </div>
        )}
      </main>

      <PuzzleSelector />
      <SettingsPanel />
      <SolverPanel />
      <CompletionOverlay />
    </div>
  );
}
