import type { HexMineGrid, OffsetCoord, HexMineExplicitClue, HexMineClues } from './types';
import { getOffsetNeighbors, coordKey } from './hex';
import {
  type CellState,
  buildConstraints,
  buildExplicitConstraints,
  propagate,
  backtrackDeductions,
  simulateReveals,
} from './solver';

/** Helper: extract explicit clues from HexMineClues (handles both formats) */
function extractClues(clues?: HexMineClues | readonly HexMineExplicitClue[]): readonly HexMineExplicitClue[] {
  if (!clues) return [];
  if (Array.isArray(clues)) return clues;
  return (clues as { clues: readonly HexMineExplicitClue[] }).clues;
}

/**
 * Check if a puzzle can be solved from the given grid state without guessing.
 */
export function solveFromRevealed(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
  clues?: HexMineClues | readonly HexMineExplicitClue[],
): boolean {
  const knowledge = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      const cell = grid[r][c];
      if (typeof cell === 'number') {
        knowledge.set(key, 'safe');
      } else if (cell === 'flagged') {
        knowledge.set(key, 'mine');
      } else if (cell === 'disabled') {
        continue;
      } else {
        knowledge.set(key, 'unknown');
      }
    }
  }

  const explicitClues = extractClues(clues);
  const MAX_ROUNDS = 20;
  const MAX_PROBES = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const simGrid = simulateReveals(grid, solution, knowledge, width, height);
    const constraints = buildConstraints(simGrid, width, height, knowledge);

    if (explicitClues.length > 0) {
      constraints.push(...buildExplicitConstraints(explicitClues, knowledge));
    }

    if (constraints.length === 0) break;

    const propProgress = propagate(constraints, knowledge);

    let allKnown = true;
    for (const [, state] of knowledge) {
      if (state === 'unknown') { allKnown = false; break; }
    }
    if (allKnown) return true;

    if (!propProgress) {
      const btProgress = backtrackDeductions(constraints, knowledge, MAX_PROBES, explicitClues.length > 0 ? explicitClues : undefined);
      if (!btProgress) return false;
    }
  }

  for (const [, state] of knowledge) {
    if (state === 'unknown') return false;
  }
  return true;
}

/**
 * Find a hint: return the coordinate of a hidden cell that can be logically
 * deduced as safe, or fall back to any hidden non-mine cell.
 */
export function getHexMineHint(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
  clues?: HexMineClues | readonly HexMineExplicitClue[],
): OffsetCoord | null {
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'exploded') return null;
    }
  }

  const knowledge = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      const cell = grid[r][c];
      if (typeof cell === 'number') {
        knowledge.set(key, 'safe');
      } else if (cell === 'flagged') {
        knowledge.set(key, 'mine');
      } else if (cell === 'disabled') {
        continue;
      } else {
        knowledge.set(key, 'unknown');
      }
    }
  }

  const explicitClues = extractClues(clues);
  const constraints = buildConstraints(grid, width, height, knowledge);
  if (explicitClues.length > 0) {
    constraints.push(...buildExplicitConstraints(explicitClues, knowledge));
  }
  propagate(constraints, knowledge);
  backtrackDeductions(
    constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount })),
    knowledge,
    100,
    explicitClues.length > 0 ? explicitClues : undefined,
  );

  for (const [key, state] of knowledge) {
    if (state === 'safe') {
      const [r, c] = key.split(',').map(Number);
      if (grid[r][c] === 'hidden') {
        return { row: r, col: c };
      }
    }
  }

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'hidden' && solution[r][c] !== 'mine') {
        return { row: r, col: c };
      }
    }
  }

  return null;
}
