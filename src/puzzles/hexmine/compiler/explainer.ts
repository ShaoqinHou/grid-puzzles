import type { HexMineExplicitClue } from '../types';

/** A single step in the solution path with human-readable explanation */
export interface SolutionStep {
  /** Step index */
  readonly stepId: number;
  /** Debug label from blueprint */
  readonly label: string;
  /** Target cell coordinate */
  readonly targetRow: number;
  readonly targetCol: number;
  /** What the target is (mine or safe) */
  readonly targetValue: 'mine' | 'safe';
  /** The clue that proves this step (if any) */
  readonly clue: HexMineExplicitClue | null;
  /** All cell keys in the clue's scope (for highlighting) */
  readonly scopeKeys: readonly string[];
  /** Human-readable explanation of WHY this cell has this value */
  readonly explanation: string;
  /** Short summary for the step list */
  readonly summary: string;
}

/**
 * Generate a human-readable explanation for why a cell is mine or safe,
 * given the clue that proves it.
 */
export function explainStep(
  stepId: number,
  label: string,
  targetRow: number,
  targetCol: number,
  targetValue: 0 | 1,
  clue: HexMineExplicitClue | null,
  strategyKind: string,
): SolutionStep {
  const cellName = `(${targetRow},${targetCol})`;
  const valueStr = targetValue === 1 ? 'mine' : 'safe';

  let explanation: string;
  let summary: string;

  if (!clue) {
    if (strategyKind === 'pre-revealed') {
      explanation = `Cell ${cellName} is pre-revealed as ${valueStr}. This gives you information without showing the number.`;
      summary = `${cellName} pre-revealed as ${valueStr}`;
    } else {
      explanation = `Cell ${cellName} is ${valueStr}.`;
      summary = `${cellName} = ${valueStr}`;
    }
  } else {
    const clueDesc = describeClue(clue);
    const scopeSize = clue.cellKeys.length;

    if (targetValue === 1) {
      explanation = `Cell ${cellName} must be a mine. ${clueDesc} This clue covers ${scopeSize} cells — given what you already know about the other cells, this one must be a mine to satisfy the count.`;
      summary = `${cellName} is a mine (${clue.type} clue at ${clue.displayKey})`;
    } else {
      explanation = `Cell ${cellName} must be safe. ${clueDesc} All mines required by this clue are already accounted for, so this cell cannot be a mine.`;
      summary = `${cellName} is safe (${clue.type} clue at ${clue.displayKey})`;
    }
  }

  return {
    stepId,
    label,
    targetRow,
    targetCol,
    targetValue: targetValue === 1 ? 'mine' : 'safe',
    clue,
    scopeKeys: clue?.cellKeys ?? [],
    explanation,
    summary,
  };
}

function describeClue(clue: HexMineExplicitClue): string {
  switch (clue.type) {
    case 'adjacent': {
      const specialDesc = clue.special === 'contiguous'
        ? ' (the mines must be adjacent to each other)'
        : clue.special === 'nonContiguous'
          ? ' (the mines must have gaps between them)'
          : '';
      return `The number at ${clue.displayKey} shows ${clue.mineCount} — meaning ${clue.mineCount} of its 6 neighbors are mines${specialDesc}.`;
    }
    case 'line':
      return `The line clue at ${clue.displayKey} shows ${clue.mineCount} — there are ${clue.mineCount} mines along this direction.`;
    case 'range':
      return `The range clue at ${clue.displayKey} shows (${clue.mineCount}) — there are ${clue.mineCount} mines within 2 hex steps.`;
    case 'edge-header':
      return `The edge header shows ${clue.mineCount} — there are ${clue.mineCount} mines in this row/column.`;
    default:
      return `Clue at ${clue.displayKey} indicates ${clue.mineCount} mines.`;
  }
}
