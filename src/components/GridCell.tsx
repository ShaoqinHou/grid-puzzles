import { useCallback, type ComponentType } from 'react';
import type { CellCoord, CellInteraction } from '@/types';
import type { CellRendererProps } from '@/engine/puzzleTypes';
import { useGameEvaluation } from '@/engine/GameEvaluatorProvider';
import { useGameState } from '@/engine/GameStateProvider';
import { coordToKey } from '@/utils/grid';

interface GridCellProps {
  coord: CellCoord;
  value: unknown;
  size: number;
  isActive: boolean;
  CellRenderer: ComponentType<CellRendererProps<unknown>>;
  onInteract: (coord: CellCoord, interaction: CellInteraction) => void;
  /** Whether this cell is highlighted as part of the current solver step */
  isStepHighlight?: boolean;
  /** Whether the solver visualizer is currently active (disables interaction) */
  isSolverActive?: boolean;
  /** Whether this cell is a probe target (shows ? indicator) */
  isProbeTarget?: boolean;
  /** Technique-specific text overlay (e.g. checkmark, "?", pin icon) */
  techniqueTextOverlay?: string;
  /** CSS class for the technique text overlay */
  techniqueTextClass?: string;
}

export function GridCell({ coord, value, size, isActive, CellRenderer, onInteract, isStepHighlight = false, isSolverActive = false, isProbeTarget = false, techniqueTextOverlay, techniqueTextClass }: GridCellProps) {
  const evaluation = useGameEvaluation();
  const { state } = useGameState();
  const key = coordToKey(coord);
  const isError = !isSolverActive && evaluation.errorKeys.has(key);
  const isHinted = !isSolverActive && state.hintCell?.row === coord.row && state.hintCell?.col === coord.col;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!isActive || isSolverActive) return;
    if (e.button === 0) onInteract(coord, 'primary');
  }, [coord, isActive, onInteract, isSolverActive]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!isActive || isSolverActive) return;
    onInteract(coord, 'secondary');
  }, [coord, isActive, onInteract, isSolverActive]);

  const cursorClass = isSolverActive ? 'cursor-default' : (isActive ? 'cursor-pointer' : 'cursor-default');

  return (
    <div
      role="gridcell"
      tabIndex={isActive && !isSolverActive ? 0 : -1}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      className={`border border-grid-line select-none relative ${!isActive ? 'bg-cell-blocked' : ''} ${cursorClass} ${isError ? 'ring-1 ring-error' : ''} ${isHinted ? 'ring-1 ring-warning' : ''} ${isStepHighlight ? 'ring-2 ring-accent animate-pulse' : ''}`}
      style={{ width: size, height: size }}
    >
      <CellRenderer
        value={value}
        coord={coord}
        size={size}
        isError={isError}
        isHinted={isHinted}
        isActive={isActive}
      />
      {isProbeTarget && !techniqueTextOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-error font-bold text-xs leading-none">?</span>
        </div>
      )}
      {techniqueTextOverlay && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className={`leading-none ${techniqueTextClass ?? ''}`}>{techniqueTextOverlay}</span>
        </div>
      )}
    </div>
  );
}
