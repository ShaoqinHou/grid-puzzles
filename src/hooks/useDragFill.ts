import { useRef, useCallback, useEffect } from 'react';
import type { CellCoord, CellInteraction } from '@/types';

interface DragFillState {
  active: boolean;
  interaction: CellInteraction;
  startCoord: CellCoord | null;
  filledCoords: Set<string>;
}

export function useDragFill(
  onInteract: (coord: CellCoord, interaction: CellInteraction) => void,
) {
  const stateRef = useRef<DragFillState>({
    active: false,
    interaction: 'primary',
    startCoord: null,
    filledCoords: new Set(),
  });

  const startDrag = useCallback((coord: CellCoord, interaction: CellInteraction) => {
    stateRef.current = {
      active: true,
      interaction,
      startCoord: coord,
      filledCoords: new Set([`${coord.row},${coord.col}`]),
    };
    onInteract(coord, interaction);
  }, [onInteract]);

  const continueDrag = useCallback((coord: CellCoord) => {
    const state = stateRef.current;
    if (!state.active) return;
    const key = `${coord.row},${coord.col}`;
    if (state.filledCoords.has(key)) return;
    state.filledCoords.add(key);
    onInteract(coord, state.interaction);
  }, [onInteract]);

  const endDrag = useCallback(() => {
    stateRef.current.active = false;
  }, []);

  useEffect(() => {
    const handleMouseUp = () => endDrag();
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [endDrag]);

  return { startDrag, continueDrag, endDrag, isDragging: () => stateRef.current.active };
}
