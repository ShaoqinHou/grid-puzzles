import type { HexMineGrid, HexMineExplicitClue } from '../types';
import type { SolveRecord } from './recorder';
import type { SolutionStep } from '../compiler/explainer';
import { getOffsetNeighbors, coordKey } from '../hex';

/**
 * Convert solver records into SolutionSteps with human-readable explanations.
 * Used for random puzzles (not compiled ones — those get steps from the compiler).
 */
export function recordsToSolutionSteps(
  records: SolveRecord[],
  solution: HexMineGrid,
  clues: readonly HexMineExplicitClue[] | null,
  width: number,
  height: number,
): SolutionStep[] {
  const steps: SolutionStep[] = [];
  const clueMap = new Map<string, HexMineExplicitClue>();

  // Build display-key lookup for clues
  if (clues) {
    for (const clue of clues) {
      clueMap.set(clue.displayKey, clue);
    }
  }

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const [row, col] = rec.cellKey.split(',').map(Number);
    const isMine = rec.value === 'mine';

    // Find which clue/neighbor constraint determined this cell
    let provingClue: HexMineExplicitClue | null = null;
    let scopeKeys: string[] = [];
    let explanation: string;

    // Check if any explicit clue's scope includes this cell
    if (clues) {
      for (const clue of clues) {
        if (clue.cellKeys.includes(rec.cellKey)) {
          provingClue = clue;
          scopeKeys = [...clue.cellKeys];
          break;
        }
      }
    }

    // If no explicit clue, find the adjacent number that proved it
    if (!provingClue) {
      const neighbors = getOffsetNeighbors(row, col, width, height);
      for (const n of neighbors) {
        const nVal = solution[n.row][n.col];
        if (typeof nVal === 'number' && nVal > 0) {
          const nNeighbors = getOffsetNeighbors(n.row, n.col, width, height);
          scopeKeys = nNeighbors.map((nn) => coordKey(nn.row, nn.col));
          explanation = isMine
            ? `Cell (${row},${col}) is a mine. The number ${nVal} at (${n.row},${n.col}) requires ${nVal} mines among its neighbors — this cell must be one of them.`
            : `Cell (${row},${col}) is safe. The number ${nVal} at (${n.row},${n.col}) already has all its mines accounted for, so this cell must be safe.`;

          steps.push({
            stepId: i,
            label: `${rec.technique} (round ${rec.round})`,
            targetRow: row,
            targetCol: col,
            targetValue: isMine ? 'mine' : 'safe',
            clue: null,
            scopeKeys,
            explanation,
            summary: `(${row},${col}) is ${isMine ? 'a mine' : 'safe'} — ${rec.technique}`,
          });
          break;
        }
      }
      if (scopeKeys.length === 0) {
        // Fallback: no specific proof found
        steps.push({
          stepId: i,
          label: `${rec.technique} (round ${rec.round})`,
          targetRow: row,
          targetCol: col,
          targetValue: isMine ? 'mine' : 'safe',
          clue: null,
          scopeKeys: [],
          explanation: `Cell (${row},${col}) is ${isMine ? 'a mine' : 'safe'} (deduced by ${rec.technique}).`,
          summary: `(${row},${col}) = ${isMine ? 'mine' : 'safe'}`,
        });
      }
      continue;
    }

    // Explain based on clue type
    const clueDesc = describeClue(provingClue);
    explanation = isMine
      ? `Cell (${row},${col}) must be a mine. ${clueDesc}`
      : `Cell (${row},${col}) must be safe. ${clueDesc}`;

    steps.push({
      stepId: i,
      label: `${rec.technique} (round ${rec.round})`,
      targetRow: row,
      targetCol: col,
      targetValue: isMine ? 'mine' : 'safe',
      clue: provingClue,
      scopeKeys,
      explanation,
      summary: `(${row},${col}) is ${isMine ? 'a mine' : 'safe'} — ${provingClue.type} clue at ${provingClue.displayKey}`,
    });
  }

  return steps;
}

function describeClue(clue: HexMineExplicitClue): string {
  switch (clue.type) {
    case 'adjacent': {
      const s = clue.special === 'contiguous' ? ' (mines are contiguous)'
        : clue.special === 'nonContiguous' ? ' (mines have gaps)' : '';
      return `The number at ${clue.displayKey} shows ${clue.mineCount}${s}.`;
    }
    case 'line':
      return `The line clue at ${clue.displayKey} shows ${clue.mineCount} mines along this direction.`;
    case 'range':
      return `The range clue at ${clue.displayKey} shows (${clue.mineCount}) mines within 2 steps.`;
    case 'edge-header':
      return `The edge header shows ${clue.mineCount} mines in this row/column.`;
    default:
      return `Clue at ${clue.displayKey} shows ${clue.mineCount}.`;
  }
}
