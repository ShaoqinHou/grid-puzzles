import type { HexMineGrid, HexMineExplicitClue } from '../types';
import type { CellState } from '../solver/types';
import { buildConstraints, buildExplicitConstraints } from '../solver/constraints';
import { propagate, backtrackDeductions } from '../solver/propagate';
import { simulateReveals } from '../solver/simulate';
import { coordKey } from '../hex';

const COMPILE_MAX_PROBES = 500; // Higher than gameplay (200) for better accuracy

/**
 * Check if a specific cell is uniquely determined given the current knowledge
 * and accumulated clues. Uses higher probe limits for compile-time accuracy.
 */
export function isCellDetermined(
  targetKey: string,
  grid: HexMineGrid,
  solution: HexMineGrid,
  knowledge: Map<string, CellState>,
  clues: HexMineExplicitClue[],
  width: number,
  height: number,
): boolean {
  // Clone knowledge to avoid mutation
  const k = new Map(knowledge);

  // Simulate reveals
  const simGrid = simulateReveals(grid, solution, k, width, height);

  // Build all constraints
  const constraints = buildConstraints(simGrid, width, height, k);
  if (clues.length > 0) {
    constraints.push(...buildExplicitConstraints(clues, k));
  }

  // Run propagation
  propagate(constraints, k);

  // Check if target is determined
  if (k.get(targetKey) !== 'unknown') return true;

  // Try backtracking
  backtrackDeductions(
    constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount })),
    k,
    COMPILE_MAX_PROBES,
    clues.length > 0 ? clues : undefined,
  );

  return k.get(targetKey) !== 'unknown';
}

/**
 * Check if the accumulated knowledge has any contradictions.
 */
export function hasKnowledgeContradiction(
  grid: HexMineGrid,
  solution: HexMineGrid,
  knowledge: Map<string, CellState>,
  clues: HexMineExplicitClue[],
  width: number,
  height: number,
): boolean {
  const k = new Map(knowledge);
  const simGrid = simulateReveals(grid, solution, k, width, height);
  const constraints = buildConstraints(simGrid, width, height, k);
  if (clues.length > 0) {
    constraints.push(...buildExplicitConstraints(clues, k));
  }

  // Check basic contradictions
  for (const c of constraints) {
    const unknowns: string[] = [];
    let knownMines = 0;
    for (const key of c.cells) {
      const state = k.get(key);
      if (state === 'mine') knownMines++;
      else if (state === 'unknown') unknowns.push(key);
    }
    const remaining = c.mineCount - knownMines;
    if (remaining < 0 || remaining > unknowns.length) return true;
  }

  return false;
}
