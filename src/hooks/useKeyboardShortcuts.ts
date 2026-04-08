import { useEffect } from 'react';
import { useGameState } from '@/engine/GameStateProvider';
import { usePanelManager } from '@/engine/PanelManager';

export function useKeyboardShortcuts() {
  const { state, dispatch } = useGameState();
  const { closePanel } = usePanelManager();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!state.id || state.solved) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          dispatch({ type: 'UNDO' });
        } else if (e.key === 'y') {
          e.preventDefault();
          dispatch({ type: 'REDO' });
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'c':
          dispatch({ type: 'CHECK' });
          break;
        case 'escape':
          closePanel();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.id, state.solved, dispatch, closePanel]);
}
