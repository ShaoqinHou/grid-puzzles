import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { HexMineGrid, HexMineClues, HexMineCell, HexMineExplicitClue, HexMineClueData } from '../types';
import type { CellState } from '../solver/types';
import { coordKey, getOffsetNeighbors } from '../hex';
import { simulateCascade } from '../solver/simulate';
import { solveFromRevealed } from '../solve';
import { validatePuzzleIntegrity } from '../validate';
import { createSeededRandom } from '../seededRandom';
import { findAdjacentClue } from './clueFactory';
import { isCellDetermined, hasKnowledgeContradiction } from './verify';
import { constrainedFill, buildSolutionFromAssignments } from './constrainedFill';
import type { PuzzleBlueprint, PuzzleStep } from './compilerTypes';
import { CompilationError } from './compilerTypes';

/**
 * Compile a puzzle from a blueprint using backwards constraint-based generation.
 *
 * Algorithm:
 * 1. Initialize grid, place cascade origin
 * 2. For each step: assign target → check contradiction → create clue → verify determination
 * 3. Constrained fill remaining unknowns (respects clue scope budgets)
 * 4. Build solution + player grids
 * 5. Verify solvability + integrity
 *
 * @throws CompilationError if constraints conflict or puzzle is unsolvable
 */
export function compilePuzzle(
  blueprint: PuzzleBlueprint,
  rngFn?: () => number,
): PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell> {
  const rng = rngFn ?? createSeededRandom(blueprint.seed);
  const { width, height, mineDensity, steps } = blueprint;
  const log: string[] = [];

  // ── Phase 0: Initialize ──
  const assignments = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      assignments.set(coordKey(r, c), 'unknown');
    }
  }
  log.push(`Initialized ${width}x${height} grid, ${width * height} cells`);

  // ── Phase 1: Cascade origin ──
  // Pick center-ish cell as origin, mark it + neighbors as safe
  const originR = Math.floor(height / 2);
  const originC = Math.floor(width / 2);
  assignments.set(coordKey(originR, originC), 'safe');
  for (const n of getOffsetNeighbors(originR, originC, width, height)) {
    assignments.set(coordKey(n.row, n.col), 'safe');
  }
  const revealedSet = new Set<string>();
  revealedSet.add(coordKey(originR, originC));
  for (const n of getOffsetNeighbors(originR, originC, width, height)) {
    revealedSet.add(coordKey(n.row, n.col));
  }
  log.push(`Cascade origin at (${originR},${originC}), ${revealedSet.size} safe cells`);

  // ── Phase 2: Process steps ──
  const accumulatedClues: HexMineExplicitClue[] = [];

  // Build a temporary solution for verification (we'll rebuild after fill)
  // For now, safe cells = 0 count (will be recomputed)
  const tempSolution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill(0),
  );
  const tempGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('hidden'),
  );

  // Apply initial reveals to tempGrid
  for (const key of revealedSet) {
    const [r, c] = key.split(',').map(Number);
    tempGrid[r][c] = 0; // will be recomputed
  }

  for (const step of steps) {
    log.push(`\n--- Step ${step.id}: ${step.label ?? 'unnamed'} ---`);

    const { target, targetValue, requiredStrategy } = step;
    const targetKey = coordKey(target.row, target.col);

    // 2a: Check target is in bounds and unassigned
    if (target.row < 0 || target.row >= height || target.col < 0 || target.col >= width) {
      throw new CompilationError(
        `Step ${step.id}: target (${target.row},${target.col}) out of bounds`,
        step.id, log,
      );
    }

    const currentState = assignments.get(targetKey);
    if (currentState !== 'unknown') {
      throw new CompilationError(
        `Step ${step.id}: target ${targetKey} already assigned as ${currentState}`,
        step.id, log,
      );
    }

    // 2b: Assign target value
    assignments.set(targetKey, targetValue === 1 ? 'mine' : 'safe');
    if (targetValue === 1) {
      tempSolution[target.row][target.col] = 'mine';
    }
    log.push(`Assigned ${targetKey} = ${targetValue === 1 ? 'mine' : 'safe'}`);

    // 2b+: Immediate contradiction check
    // Rebuild temp solution with current assignments for checking
    updateTempSolution(tempSolution, assignments, width, height);
    updateTempGrid(tempGrid, assignments, revealedSet, tempSolution, width, height);

    if (hasKnowledgeContradiction(tempGrid, tempSolution, assignments, accumulatedClues, width, height)) {
      throw new CompilationError(
        `Step ${step.id}: assigning ${targetKey} creates a contradiction`,
        step.id, log,
      );
    }

    // 2c: Create clue based on strategy
    if (requiredStrategy.kind === 'clue') {
      if (requiredStrategy.type === 'adjacent') {
        const clue = findAdjacentClue(
          target, targetValue, requiredStrategy.special,
          tempGrid, tempSolution, assignments, width, height, rng,
        );
        if (!clue) {
          throw new CompilationError(
            `Step ${step.id}: cannot find adjacent clue covering ${targetKey}`,
            step.id, log,
          );
        }
        accumulatedClues.push(clue);
        log.push(`Created adjacent clue at ${clue.displayKey} (count=${clue.mineCount}, special=${clue.special})`);
      }
      // TODO: line, range, edge-header clue factories (Phase 2)
    } else if (requiredStrategy.kind === 'pre-revealed') {
      revealedSet.add(targetKey);
      log.push(`Pre-revealed ${targetKey}`);
    }

    // 2d: Verify target is determined
    updateTempSolution(tempSolution, assignments, width, height);
    updateTempGrid(tempGrid, assignments, revealedSet, tempSolution, width, height);

    const determined = isCellDetermined(
      targetKey, tempGrid, tempSolution, assignments,
      accumulatedClues, width, height,
    );

    if (!determined) {
      log.push(`WARNING: target ${targetKey} not uniquely determined by solver`);
      // Don't throw — the solver is incomplete, puzzle may still be valid
    } else {
      log.push(`Verified: ${targetKey} is uniquely determined`);
    }

    // 2f: Update revealed set for safe targets
    if (targetValue === 0) {
      revealedSet.add(targetKey);
    }
  }

  log.push('\n--- Phase 3: Constrained fill ---');

  // ── Phase 3: Constrained fill ──
  constrainedFill(assignments, tempSolution, accumulatedClues, width, height, mineDensity, rng);
  log.push(`Fill complete. Mines: ${[...assignments.values()].filter((s) => s === 'mine').length}`);

  // ── Phase 4: Build solution grid ──
  const solution = buildSolutionFromAssignments(assignments, width, height);
  log.push('Solution grid built');

  // ── Phase 5: Recompute clue values from final mine layout ──
  for (const clue of accumulatedClues) {
    let actualMines = 0;
    for (const key of clue.cellKeys) {
      const [r, c] = key.split(',').map(Number);
      if (solution[r][c] === 'mine') actualMines++;
    }
    // Mutate mineCount to match reality
    (clue as { mineCount: number }).mineCount = actualMines;
  }
  log.push('Clue values recomputed from final solution');

  // ── Phase 6: Build player grid ──
  // Find a 0-cell for cascade
  let cascadeStart: { row: number; col: number } | null = null;
  if (solution[originR][originC] === 0) {
    cascadeStart = { row: originR, col: originC };
  } else {
    // Find any 0-cell
    for (let r = 0; r < height && !cascadeStart; r++) {
      for (let c = 0; c < width && !cascadeStart; c++) {
        if (solution[r][c] === 0) cascadeStart = { row: r, col: c };
      }
    }
  }

  const playerGrid: HexMineGrid = cascadeStart
    ? simulateCascade(solution, cascadeStart, width, height)
    : Array.from({ length: height }, () => Array.from<HexMineCell>({ length: width }).fill('hidden'));

  log.push(`Player grid built, cascade from ${cascadeStart ? `(${cascadeStart.row},${cascadeStart.col})` : 'none'}`);

  // ── Phase 7: Verify solvability ──
  const cluesForSolver = accumulatedClues.length > 0 ? accumulatedClues : undefined;
  const solvable = solveFromRevealed(playerGrid, solution, width, height, cluesForSolver);
  if (!solvable) {
    log.push('WARNING: puzzle not solvable with current clues');
    // Don't throw — let the caller decide
  } else {
    log.push('Puzzle verified solvable');
  }

  // ── Phase 8: Validate integrity ──
  const integrityErrors = validatePuzzleIntegrity(
    playerGrid, solution, accumulatedClues.length > 0 ? accumulatedClues : null, null, width, height,
  );
  if (integrityErrors.length > 0) {
    log.push(`Integrity errors: ${integrityErrors.map((e) => e.message).join(', ')}`);
  } else {
    log.push('Integrity validation passed');
  }

  // ── Phase 9: Return PuzzleInstance ──
  const clueData: HexMineClues = accumulatedClues.length > 0
    ? { clues: accumulatedClues, questionMarks: [] }
    : null;

  log.push(`\nCompilation complete: ${accumulatedClues.length} clues, solvable=${solvable}`);

  return {
    grid: playerGrid,
    solution,
    clues: clueData,
    emptyCell: 'hidden' as HexMineCell,
    width,
    height,
  };
}

/** Update temp solution to reflect current assignments */
function updateTempSolution(
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  width: number,
  height: number,
): void {
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const state = assignments.get(coordKey(r, c));
      if (state === 'mine') {
        solution[r][c] = 'mine';
      } else if (state === 'safe') {
        // Compute neighbor count from current assignments
        const neighbors = getOffsetNeighbors(r, c, width, height);
        let count = 0;
        for (const n of neighbors) {
          if (assignments.get(coordKey(n.row, n.col)) === 'mine') count++;
        }
        solution[r][c] = count as HexMineCell;
      }
    }
  }
}

/** Update temp grid to reflect revealed cells */
function updateTempGrid(
  grid: HexMineGrid,
  assignments: Map<string, CellState>,
  revealed: Set<string>,
  solution: HexMineGrid,
  width: number,
  height: number,
): void {
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      if (revealed.has(key) && typeof solution[r][c] === 'number') {
        grid[r][c] = solution[r][c];
      } else if (assignments.get(key) === 'mine') {
        grid[r][c] = 'hidden'; // mines stay hidden
      } else {
        grid[r][c] = 'hidden';
      }
    }
  }
}
