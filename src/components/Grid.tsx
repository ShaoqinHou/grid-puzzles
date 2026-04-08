import { useCallback, useMemo, type ComponentType } from 'react';
import type { CellCoord, CellInteraction } from '@/types';
import type { CellRendererProps, PuzzleDefinition } from '@/engine/puzzleTypes';
import { useGameState } from '@/engine/GameStateProvider';
import { useGameEvaluation } from '@/engine/GameEvaluatorProvider';
import { usePreferences } from '@/engine/PreferencesProvider';
import { useSolverVisualization, type BlockPosition } from './SolverContext';
import { computeTechniqueDecorations, computeContradictionLineCells } from './TechniqueOverlay';
import { GridCell } from './GridCell';

interface GridProps {
  definition: PuzzleDefinition<unknown, unknown, unknown>;
}

/**
 * Build a Map from "row,col" to overlay type for block position visualization.
 * Phase-aware: filters which block overlays to show based on the current animation phase.
 *
 * Phase 0 "Leftmost": Only leftmost blocks shown (blue)
 * Phase 1 "Rightmost": Only rightmost blocks shown (orange), leftmost at reduced opacity
 * Phase 2 "Overlap": Both placements + overlap zone in purple
 */
function buildBlockOverlayMap(
  leftmostBlocks: readonly BlockPosition[] | null,
  rightmostBlocks: readonly BlockPosition[] | null,
  overlapCells: ReadonlySet<string>,
  lineType: 'row' | 'col',
  lineIndex: number,
  animationPhase: number,
  isOverlapTechnique: boolean,
): Map<string, 'leftmost' | 'rightmost' | 'overlap' | 'leftmost-faded'> {
  const map = new Map<string, 'leftmost' | 'rightmost' | 'overlap' | 'leftmost-faded'>();

  // For non-overlap techniques (or techniques without phases), show everything
  const showLeftmost = !isOverlapTechnique || animationPhase === 0 || animationPhase === 2;
  const showRightmost = !isOverlapTechnique || animationPhase === 1 || animationPhase === 2;
  const showLeftmostFaded = isOverlapTechnique && animationPhase === 1;

  if (leftmostBlocks && (showLeftmost || showLeftmostFaded)) {
    for (const block of leftmostBlocks) {
      for (let i = 0; i < block.length; i++) {
        const pos = block.start + i;
        const key = lineType === 'row'
          ? `${lineIndex},${pos}`
          : `${pos},${lineIndex}`;
        map.set(key, showLeftmostFaded ? 'leftmost-faded' : 'leftmost');
      }
    }
  }

  if (rightmostBlocks && showRightmost) {
    for (const block of rightmostBlocks) {
      for (let i = 0; i < block.length; i++) {
        const pos = block.start + i;
        const key = lineType === 'row'
          ? `${lineIndex},${pos}`
          : `${pos},${lineIndex}`;
        // If already leftmost, the cell is in the overlap zone (only in phase 2)
        if (map.has(key) && animationPhase === 2) {
          map.set(key, 'overlap');
        } else if (!map.has(key)) {
          map.set(key, 'rightmost');
        }
      }
    }
  }

  // Apply explicit overlap cells from the context (only in phase 2 or non-overlap)
  if (!isOverlapTechnique || animationPhase === 2) {
    for (const key of overlapCells) {
      map.set(key, 'overlap');
    }
  }

  return map;
}

export function Grid({ definition }: GridProps) {
  const { state, dispatch } = useGameState();
  const evaluation = useGameEvaluation();
  const { preferences } = usePreferences();
  const { visualization } = useSolverVisualization();

  const solverActive = visualization.active;

  const handleInteract = useCallback((coord: CellCoord, interaction: CellInteraction) => {
    // Block interaction when solver is active
    if (solverActive) return;

    const grid = state.grid as unknown[][];
    const currentValue = grid[coord.row][coord.col];
    const nextValue = definition.nextCellValue(currentValue, interaction);

    // Pre-compute whether this move solves the puzzle
    const newGrid = grid.map((row) => [...row]);
    newGrid[coord.row][coord.col] = nextValue;
    const validation = definition.validateGrid(newGrid, state.solution);

    dispatch({ type: 'CELL_INTERACT', payload: { coord, interaction, nextValue, solved: validation.solved } });
  }, [dispatch, state.grid, state.solution, definition, solverActive]);

  if (!state.id) return null;

  // When solver is active, show the solver's grid; otherwise show the player's grid
  const grid = solverActive && visualization.solverGrid
    ? visualization.solverGrid as unknown[][]
    : state.grid as unknown[][];

  const clues = state.clues as { rows: number[][]; cols: number[][] };
  const shape = state.shape as boolean[][] | null;
  const size = preferences.cellSize;
  const CellRenderer = (definition.CellRenderer ?? DefaultCellRenderer) as ComponentType<CellRendererProps<unknown>>;

  const highlightRow = solverActive ? visualization.highlightRow : undefined;
  const highlightCol = solverActive ? visualization.highlightCol : undefined;
  const highlightCells = solverActive ? visualization.stepCells : undefined;
  const technique = solverActive ? visualization.technique : null;

  // Build block overlay map for overlap/probe visualization
  const isOverlapTechnique = technique === 'overlap';
  const blockOverlay = useMemo(() => {
    if (!solverActive || !visualization.leftmostBlocks && !visualization.rightmostBlocks) {
      return null;
    }
    const lineType = visualization.highlightRow !== null ? 'row' as const : 'col' as const;
    const lineIndex = visualization.highlightRow ?? visualization.highlightCol ?? 0;
    return buildBlockOverlayMap(
      visualization.leftmostBlocks,
      visualization.rightmostBlocks,
      visualization.overlapCells,
      lineType,
      lineIndex,
      visualization.animationPhase,
      isOverlapTechnique,
    );
  }, [solverActive, visualization.leftmostBlocks, visualization.rightmostBlocks, visualization.overlapCells, visualization.highlightRow, visualization.highlightCol, visualization.animationPhase, isOverlapTechnique]);

  // Build technique-specific cell decorations
  const techniqueDecorations = useMemo(() => {
    if (!solverActive || !visualization.techniqueData) return null;
    return computeTechniqueDecorations(
      visualization.techniqueData,
      visualization.animationPhase,
      visualization.highlightRow,
      visualization.highlightCol,
    );
  }, [solverActive, visualization.techniqueData, visualization.animationPhase, visualization.highlightRow, visualization.highlightCol]);

  // Build contradiction line cells for probe technique
  const contradictionCells = useMemo(() => {
    if (!solverActive || !visualization.techniqueData) return null;
    return computeContradictionLineCells(
      visualization.techniqueData,
      visualization.animationPhase,
      state.width,
      state.height,
    );
  }, [solverActive, visualization.techniqueData, visualization.animationPhase, state.width, state.height]);

  const isCellActive = (r: number, c: number) => !shape || shape[r]?.[c] !== false;
  const isMajorCol = (c: number) => c > 0 && c % 5 === 0;
  const isMajorRow = (r: number) => r > 0 && r % 5 === 0;

  /** Get the block overlay background class for a cell */
  const getBlockOverlayClass = (r: number, c: number): string => {
    if (!blockOverlay) return '';
    const type = blockOverlay.get(`${r},${c}`);
    if (!type) return '';
    switch (type) {
      case 'leftmost': return 'bg-solver-leftmost';
      case 'rightmost': return 'bg-solver-rightmost';
      case 'overlap': return 'bg-solver-overlap';
      case 'leftmost-faded': return 'bg-solver-leftmost opacity-30';
    }
  };

  if (definition.clueLayout === 'top-left') {
    // Compute clue column width dynamically based on the longest row clue
    const maxRowClueLen = Math.max(1, ...clues.rows.map((r: number[]) => r.length));
    // Each clue number takes roughly 8px at text-[10px] font, plus 4px gap between numbers, plus 8px right padding
    const clueColWidth = Math.max(size * 2, maxRowClueLen * 12 + 8);
    return (
      <div className="relative inline-block">
        <div role="grid" className="inline-block select-none">
          {/* Column clues */}
          <div className="flex" style={{ marginLeft: clueColWidth }}>
            {clues.cols.map((col, c) => {
              const isColHighlighted = highlightCol === c;
              return (
                <div
                  key={c}
                  className={`flex flex-col items-center justify-end gap-0.5 px-0.5 pb-1 ${evaluation.lineStatus.get(`col-${c}`) ? 'opacity-40' : ''} ${isMajorCol(c) ? 'ml-0.5' : ''} ${isColHighlighted ? 'bg-accent/10 rounded-t' : ''}`}
                  style={{ width: size }}
                >
                  {col.map((n, i) => (
                    <span key={i} className={`text-[10px] font-mono leading-none ${isColHighlighted ? 'text-accent font-bold' : 'text-text-secondary'} ${evaluation.lineStatus.get(`col-${c}`) ? 'line-through' : ''}`}>{n}</span>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {grid.map((row, r) => {
            const isRowHighlighted = highlightRow === r;
            return (
              <div key={r} role="row" className={`flex items-center ${isMajorRow(r) ? 'mt-0.5' : ''}`}>
                <div
                  className={`flex items-center justify-end gap-1 pr-2 ${evaluation.lineStatus.get(`row-${r}`) ? 'opacity-40' : ''} ${isRowHighlighted ? 'bg-accent/10 rounded-l' : ''}`}
                  style={{ width: clueColWidth }}
                >
                  {clues.rows[r].map((n, i) => (
                    <span key={i} className={`text-[10px] font-mono leading-none ${isRowHighlighted ? 'text-accent font-bold' : 'text-text-secondary'} ${evaluation.lineStatus.get(`row-${r}`) ? 'line-through' : ''}`}>{n}</span>
                  ))}
                </div>
                {row.map((cell, c) => {
                  const isHighlightedLine = highlightRow === r || highlightCol === c;
                  const cellKey = `${r},${c}`;
                  const isHighlightedCell = highlightCells?.has(cellKey) ?? false;
                  const overlayClass = getBlockOverlayClass(r, c);
                  const decoration = techniqueDecorations?.get(cellKey) ?? null;
                  const isContradictionLine = contradictionCells?.has(cellKey) ?? false;
                  const decorationClass = decoration?.className ?? '';
                  const wrapperExtra = isContradictionLine && !decoration ? 'bg-solver-contradiction' : '';
                  return (
                    <div key={c} className={`relative ${isMajorCol(c) ? 'ml-0.5' : ''} ${isHighlightedLine && !isHighlightedCell && !overlayClass && !decorationClass && !wrapperExtra ? 'bg-accent/10' : ''} ${overlayClass} ${decorationClass} ${wrapperExtra}`}>
                      <GridCell
                        coord={{ row: r, col: c }}
                        value={cell}
                        size={size}
                        isActive={isCellActive(r, c)}
                        CellRenderer={CellRenderer}
                        onInteract={handleInteract}
                        isStepHighlight={isHighlightedCell}
                        isSolverActive={solverActive}
                        isProbeTarget={technique === 'probe' && isHighlightedCell}
                        techniqueTextOverlay={decoration?.textOverlay}
                        techniqueTextClass={decoration?.textClass}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* SVG overlay layer (will be populated in Phase 3) */}
        {solverActive && (
          <div className="absolute inset-0 pointer-events-none">
            {/* TechniqueOverlay will go here */}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <div role="grid" className="inline-grid" style={{ gridTemplateColumns: `repeat(${state.width}, ${size}px)` }}>
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const cellKey = `${r},${c}`;
            const isHighlightedCell = highlightCells?.has(cellKey) ?? false;
            const overlayClass = getBlockOverlayClass(r, c);
            const decoration = techniqueDecorations?.get(cellKey) ?? null;
            const isContradictionLine = contradictionCells?.has(cellKey) ?? false;
            const decorationClass = decoration?.className ?? '';
            const wrapperExtra = isContradictionLine && !decoration ? 'bg-solver-contradiction' : '';
            return (
              <div key={`${r}-${c}`} className={`relative ${overlayClass} ${decorationClass} ${wrapperExtra}`}>
                <GridCell
                  coord={{ row: r, col: c }}
                  value={cell}
                  size={size}
                  isActive={isCellActive(r, c)}
                  CellRenderer={CellRenderer}
                  onInteract={handleInteract}
                  isStepHighlight={isHighlightedCell}
                  isSolverActive={solverActive}
                  isProbeTarget={technique === 'probe' && isHighlightedCell}
                  techniqueTextOverlay={decoration?.textOverlay}
                  techniqueTextClass={decoration?.textClass}
                />
              </div>
            );
          })
        )}
      </div>
      {/* SVG overlay layer (will be populated in Phase 3) */}
      {solverActive && (
        <div className="absolute inset-0 pointer-events-none">
          {/* TechniqueOverlay will go here */}
        </div>
      )}
    </div>
  );
}

function DefaultCellRenderer({ value }: CellRendererProps<unknown>) {
  return <div className="w-full h-full flex items-center justify-center text-xs">{String(value)}</div>;
}
