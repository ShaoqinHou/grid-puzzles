import type { HexMineExplicitClue, HexMineCell, HexMineGrid } from '../types';
import type { CellState } from '../solver/types';
import { getOffsetNeighbors, coordKey } from '../hex';

/**
 * Fill remaining unknown cells with mine/safe values while respecting
 * all accumulated clue scope budgets. Uses greedy assignment with backtracking.
 *
 * For each clue, tracks: remainingMines = mineCount - mines already assigned in scope.
 * When placing a mine in a cell that belongs to clue scopes, decrements their budgets.
 * If any budget goes negative, backtracks.
 */
export function constrainedFill(
  assignments: Map<string, CellState>,
  solution: HexMineGrid,
  clues: HexMineExplicitClue[],
  width: number,
  height: number,
  targetDensity: number,
  rng: () => number,
): void {
  // Build scope lookup: cellKey → clue indices that include this cell
  const cellToClues = new Map<string, number[]>();
  const clueRemaining: number[] = [];

  for (let i = 0; i < clues.length; i++) {
    const clue = clues[i];
    let assignedMines = 0;
    for (const key of clue.cellKeys) {
      if (assignments.get(key) === 'mine') assignedMines++;
      // Build reverse lookup
      const existing = cellToClues.get(key) ?? [];
      existing.push(i);
      cellToClues.set(key, existing);
    }
    clueRemaining.push(clue.mineCount - assignedMines);
  }

  // Collect unknown cells
  const unknowns: string[] = [];
  for (const [key, state] of assignments) {
    if (state === 'unknown') unknowns.push(key);
  }

  // Shuffle for variety
  for (let i = unknowns.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unknowns[i], unknowns[j]] = [unknowns[j], unknowns[i]];
  }

  // Calculate mine budget
  const currentMines = [...assignments.values()].filter((s) => s === 'mine').length;
  const totalCells = width * height;
  const targetMines = Math.round(totalCells * targetDensity);
  let minesRemaining = Math.max(0, targetMines - currentMines);

  // Greedy fill with scope budget checking
  for (const key of unknowns) {
    const clueIndices = cellToClues.get(key) ?? [];

    // Try placing a mine if we still need mines
    if (minesRemaining > 0) {
      // Check: would this violate any clue scope budget?
      let canPlaceMine = true;
      for (const ci of clueIndices) {
        if (clueRemaining[ci] <= 0) {
          canPlaceMine = false;
          break;
        }
      }

      if (canPlaceMine && rng() < 0.5) {
        assignments.set(key, 'mine');
        for (const ci of clueIndices) clueRemaining[ci]--;
        minesRemaining--;
        continue;
      }
    }

    // Place as safe
    assignments.set(key, 'safe');

    // Check: does this make any scope impossible (too few unknowns left for remaining mines)?
    for (const ci of clueIndices) {
      const clue = clues[ci];
      let unknownsInScope = 0;
      for (const ck of clue.cellKeys) {
        if (assignments.get(ck) === 'unknown') unknownsInScope++;
      }
      if (unknownsInScope < clueRemaining[ci]) {
        // Not enough room — must place mine here instead
        assignments.set(key, 'mine');
        for (const ci2 of clueIndices) clueRemaining[ci2]--;
        minesRemaining--;
        break;
      }
    }
  }

  // Second pass: force remaining mines into scope-needy areas
  for (let ci = 0; ci < clues.length; ci++) {
    if (clueRemaining[ci] <= 0) continue;
    const clue = clues[ci];
    for (const key of clue.cellKeys) {
      if (clueRemaining[ci] <= 0) break;
      if (assignments.get(key) === 'safe') {
        // Check if flipping to mine is safe for all scopes
        const indices = cellToClues.get(key) ?? [];
        let canFlip = true;
        for (const ci2 of indices) {
          if (ci2 !== ci && clueRemaining[ci2] <= 0) {
            canFlip = false;
            break;
          }
        }
        if (canFlip) {
          assignments.set(key, 'mine');
          for (const ci2 of indices) clueRemaining[ci2]--;
        }
      }
    }
  }
}

/**
 * Build a solution grid from cell assignments.
 * Computes neighbor mine counts for safe cells.
 */
export function buildSolutionFromAssignments(
  assignments: Map<string, CellState>,
  width: number,
  height: number,
): HexMineGrid {
  const solution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill(0),
  );

  // First pass: mark mines
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const state = assignments.get(coordKey(r, c));
      if (state === 'mine') {
        solution[r][c] = 'mine';
      }
    }
  }

  // Second pass: compute neighbor counts
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 'mine') continue;
      const state = assignments.get(coordKey(r, c));
      if (state === undefined) continue; // skip cells not in grid
      const neighbors = getOffsetNeighbors(r, c, width, height);
      let count = 0;
      for (const n of neighbors) {
        if (solution[n.row][n.col] === 'mine') count++;
      }
      solution[r][c] = count as HexMineCell;
    }
  }

  return solution;
}
