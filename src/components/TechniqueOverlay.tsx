import type { TechniqueVisualizationData } from './SolverContext';

/** Per-cell decoration produced by technique visualization logic */
export interface TechniqueCellDecoration {
  /** CSS class to apply to the wrapping div */
  readonly className: string;
  /** Optional text overlay rendered inside the cell (e.g. "?" or checkmark) */
  readonly textOverlay?: string;
  /** Extra CSS class for the text overlay span */
  readonly textClass?: string;
}

/**
 * Compute per-cell decorations based on technique data and current animation phase.
 * Returns a Map from "row,col" keys to decoration info.
 */
export function computeTechniqueDecorations(
  data: TechniqueVisualizationData,
  phase: number,
  highlightRow: number | null,
  highlightCol: number | null,
): Map<string, TechniqueCellDecoration> {
  const map = new Map<string, TechniqueCellDecoration>();
  const lineType = highlightRow !== null ? 'row' as const : 'col' as const;
  const lineIndex = highlightRow ?? highlightCol ?? 0;

  switch (data.type) {
    case 'completed-block': {
      if (phase === 0) {
        // Highlight the completed filled run with a checkmark ring
        for (let pos = data.blockRun.start; pos <= data.blockRun.end; pos++) {
          const key = lineType === 'row'
            ? `${lineIndex},${pos}`
            : `${pos},${lineIndex}`;
          const isMiddle = pos === Math.floor((data.blockRun.start + data.blockRun.end) / 2);
          map.set(key, {
            className: 'ring-2 ring-success bg-solver-completed',
            ...(isMiddle ? { textOverlay: '\u2713', textClass: 'text-success font-bold text-xs' } : {}),
          });
        }
      } else if (phase === 1) {
        // Show completed block at reduced emphasis
        for (let pos = data.blockRun.start; pos <= data.blockRun.end; pos++) {
          const key = lineType === 'row'
            ? `${lineIndex},${pos}`
            : `${pos},${lineIndex}`;
          map.set(key, {
            className: 'ring-1 ring-success/50 bg-solver-completed',
          });
        }
        // Show forced empty positions
        for (const pos of data.forcedEmptyPositions) {
          const key = lineType === 'row'
            ? `${lineIndex},${pos}`
            : `${pos},${lineIndex}`;
          map.set(key, {
            className: 'bg-solver-completed ring-2 ring-success animate-pulse',
            textOverlay: '\u00D7',
            textClass: 'text-success font-bold text-xs',
          });
        }
      }
      break;
    }

    case 'block-pushing': {
      if (phase === 0) {
        // Highlight the pinned cell
        const key = `${data.pinnedCell.row},${data.pinnedCell.col}`;
        map.set(key, {
          className: 'ring-2 ring-solver-pinned bg-solver-pinned',
          textOverlay: '\u{1F4CC}',
          textClass: 'text-[8px] leading-none',
        });
      } else if (phase === 1) {
        // Show the pinned cell (reduced)
        const pinnedKey = `${data.pinnedCell.row},${data.pinnedCell.col}`;
        map.set(pinnedKey, {
          className: 'ring-1 ring-solver-pinned/50 bg-solver-pinned',
        });
        // Show the constrained range as colored bar
        for (let pos = data.constrainedRange.start; pos <= data.constrainedRange.end; pos++) {
          const key = lineType === 'row'
            ? `${data.lineIndex},${pos}`
            : `${pos},${data.lineIndex}`;
          if (!map.has(key)) {
            map.set(key, {
              className: 'bg-solver-leftmost',
            });
          }
        }
      } else if (phase === 2) {
        // Show the pinned cell (reduced)
        const pinnedKey = `${data.pinnedCell.row},${data.pinnedCell.col}`;
        map.set(pinnedKey, {
          className: 'ring-1 ring-solver-pinned/50',
        });
        // Show the constrained range at reduced opacity
        for (let pos = data.constrainedRange.start; pos <= data.constrainedRange.end; pos++) {
          const key = lineType === 'row'
            ? `${data.lineIndex},${pos}`
            : `${pos},${data.lineIndex}`;
          if (key !== pinnedKey) {
            map.set(key, {
              className: 'bg-solver-leftmost/50',
            });
          }
        }
        // stepCells (resolved cells) will get pulse ring from existing logic
      }
      break;
    }

    case 'probe': {
      const targetKey = `${data.targetCell.row},${data.targetCell.col}`;
      if (phase === 0) {
        // Show hypothesis cell
        map.set(targetKey, {
          className: 'bg-solver-hypothesis ring-2 ring-warning',
          textOverlay: '?',
          textClass: 'text-warning font-bold text-xs',
        });
      } else if (phase === 1) {
        // Propagating — show target cell in a pulsing state
        map.set(targetKey, {
          className: 'bg-solver-hypothesis ring-2 ring-warning animate-pulse',
          textOverlay: '?',
          textClass: 'text-warning font-bold text-xs',
        });
      } else if (phase === 2) {
        // Contradiction — highlight the contradicting line
        map.set(targetKey, {
          className: 'bg-solver-hypothesis ring-2 ring-warning',
          textOverlay: '?',
          textClass: 'text-warning font-bold text-xs',
        });
        if (data.contradictionLine) {
          // We'll use a special decoration for contradiction line cells
          // Actual line highlighting is done via highlightRow/highlightCol
          // but we mark a special cell in the line for emphasis
          const contradictKey = data.contradictionLine.lineType === 'row'
            ? `${data.contradictionLine.lineIndex},0`
            : `0,${data.contradictionLine.lineIndex}`;
          if (contradictKey !== targetKey) {
            map.set(contradictKey, {
              className: 'bg-solver-contradiction',
              textOverlay: '\u2717',
              textClass: 'text-error font-bold text-xs',
            });
          }
        }
      } else if (phase === 3) {
        // Conclusion — resolved cell
        map.set(targetKey, {
          className: 'ring-2 ring-success bg-success/20',
          textOverlay: data.resolvedValue === 'filled' ? '\u25A0' : '\u25A1',
          textClass: 'text-success font-bold text-xs',
        });
      }
      break;
    }

    default:
      break;
  }

  return map;
}

/**
 * For probe technique phase 2, compute the set of "row,col" keys in the
 * contradiction line, so they can be given a background highlight.
 */
export function computeContradictionLineCells(
  data: TechniqueVisualizationData,
  phase: number,
  gridWidth: number,
  gridHeight: number,
): ReadonlySet<string> {
  const set = new Set<string>();
  if (data.type !== 'probe' || phase !== 2 || !data.contradictionLine) return set;

  const { lineType, lineIndex } = data.contradictionLine;
  const length = lineType === 'row' ? gridWidth : gridHeight;
  for (let i = 0; i < length; i++) {
    const key = lineType === 'row'
      ? `${lineIndex},${i}`
      : `${i},${lineIndex}`;
    set.add(key);
  }
  return set;
}
