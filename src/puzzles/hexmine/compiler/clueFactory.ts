import type { HexMineGrid, HexMineExplicitClue, HexMineCell, ClueSpecial } from '../types';
import type { CellState } from '../solver/types';
import { getOffsetNeighbors, getNeighborsClockwise, coordKey } from '../hex';

/**
 * Find or create an adjacent clue that covers the target cell.
 * Looks for a revealed safe cell whose neighbors include the target.
 * Returns the clue, or null if no suitable position exists.
 */
export function findAdjacentClue(
  target: { row: number; col: number },
  targetValue: 0 | 1,
  special: ClueSpecial | undefined,
  grid: HexMineGrid,
  solution: HexMineGrid,
  knowledge: Map<string, CellState>,
  width: number,
  height: number,
  rng: () => number,
): HexMineExplicitClue | null {
  const targetKey = coordKey(target.row, target.col);

  // Find revealed safe cells that neighbor the target
  const candidates: Array<{ row: number; col: number }> = [];
  const neighbors = getOffsetNeighbors(target.row, target.col, width, height);

  for (const n of neighbors) {
    const nKey = coordKey(n.row, n.col);
    const nState = knowledge.get(nKey);
    // The cell must be safe (revealed or known-safe) and not a mine
    if (nState === 'safe' && typeof solution[n.row][n.col] === 'number') {
      candidates.push(n);
    }
  }

  if (candidates.length === 0) return null;

  // Pick a random candidate
  const chosen = candidates[Math.floor(rng() * candidates.length)];

  // Build clockwise neighbor keys for the chosen cell
  const cwNeighbors = getNeighborsClockwise(chosen.row, chosen.col, width, height);

  // Only use interior cells (all 6 neighbors exist) for correct circular contiguity
  if (special && special !== 'none' && cwNeighbors.some((n) => n === null)) {
    // Try other candidates
    for (const alt of candidates) {
      const altCw = getNeighborsClockwise(alt.row, alt.col, width, height);
      if (altCw.every((n) => n !== null)) {
        // Use this one instead
        const cellKeys = (altCw as Array<{ row: number; col: number }>).map((n) => coordKey(n.row, n.col));
        // Compute mine count from known assignments + solution
        const mineCount = cellKeys.reduce((count, key) => {
          const [r, c] = key.split(',').map(Number);
          return count + (solution[r][c] === 'mine' ? 1 : 0);
        }, 0);

        return {
          id: `comp-adj-${alt.row},${alt.col}`,
          type: 'adjacent',
          cellKeys,
          mineCount,
          special: special ?? 'none',
          displayKey: coordKey(alt.row, alt.col),
        };
      }
    }
    return null; // no interior candidate found
  }

  const cellKeys = cwNeighbors
    .filter((n): n is { row: number; col: number } => n !== null)
    .map((n) => coordKey(n.row, n.col));

  const mineCount = cellKeys.reduce((count, key) => {
    const [r, c] = key.split(',').map(Number);
    return count + (solution[r][c] === 'mine' ? 1 : 0);
  }, 0);

  return {
    id: `comp-adj-${chosen.row},${chosen.col}`,
    type: 'adjacent',
    cellKeys,
    mineCount,
    special: special ?? 'none',
    displayKey: coordKey(chosen.row, chosen.col),
  };
}
