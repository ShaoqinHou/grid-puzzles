import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { GridShape } from '@/types';
import type { HexMineGrid, HexMineClues, HexMineCell, HexMineExplicitClue, HexMineClueData } from '../types';
import type { CellState } from '../solver/types';
import { coordKey, getOffsetNeighbors, getNeighborsClockwise } from '../hex';
import { simulateCascade } from '../solver/simulate';
import { solveFromRevealed } from '../solve';
import { validatePuzzleIntegrity } from '../validate';
import { createSeededRandom } from '../seededRandom';
import { findAdjacentClue, findLineClue, findRangeClue, findEdgeHeaderClue, findFrontierCell } from './clueFactory';
import { isCellDetermined, hasKnowledgeContradiction } from './verify';
import { constrainedFill, buildSolutionFromAssignments } from './constrainedFill';
import { trimShape } from './shapeTrimmer';
import type { PuzzleBlueprint, PuzzleStep, StepStrategy, CellTarget } from './compilerTypes';
import { CompilationError } from './compilerTypes';

const STRATEGY_POOL: readonly StepStrategy[] = [
  { kind: 'clue', type: 'adjacent' },
  { kind: 'clue', type: 'adjacent', special: 'contiguous' },
  { kind: 'clue', type: 'adjacent', special: 'nonContiguous' },
  { kind: 'clue', type: 'line' },
  { kind: 'clue', type: 'range' },
  { kind: 'clue', type: 'edge-header' },
];

/**
 * Auto-generate steps for a blueprint with no explicit steps.
 */
function autoGenerateSteps(
  count: number,
  difficulty: string | undefined,
  allowedStrategies: readonly StepStrategy[] | undefined,
  rng: () => number,
): PuzzleStep[] {
  const pool = allowedStrategies ?? STRATEGY_POOL;
  const steps: PuzzleStep[] = [];

  for (let i = 0; i < count; i++) {
    const strategy = pool[Math.floor(rng() * pool.length)];
    const targetValue = rng() < 0.5 ? 1 : 0;

    steps.push({
      id: i,
      label: `Auto step ${i}`,
      target: { kind: 'auto' },
      targetValue: targetValue as 0 | 1,
      requiredStrategy: strategy,
    });
  }

  return steps;
}

/**
 * Resolve a CellTarget to a concrete coordinate.
 */
function resolveTarget(
  target: CellTarget,
  assignments: Map<string, CellState>,
  width: number,
  height: number,
  rng: () => number,
): { row: number; col: number } | null {
  if (target.kind === 'coord') {
    return { row: target.row, col: target.col };
  }
  // Auto: pick from frontier
  return findFrontierCell(assignments, width, height, rng);
}

/**
 * Try to create a clue for a strategy, with fallback to adjacent if the specific type fails.
 */
function createClueForStrategy(
  strategy: StepStrategy,
  target: { row: number; col: number },
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  shape: boolean[][],
  width: number,
  height: number,
  rng: () => number,
): HexMineExplicitClue | null {
  if (strategy.kind !== 'clue') return null;

  const { type, special } = strategy;

  switch (type) {
    case 'adjacent':
      return findAdjacentClue(target, special, solution, assignments, width, height, rng);
    case 'line':
      return findLineClue(target, special, solution, assignments, shape, width, height, rng);
    case 'range':
      return findRangeClue(target, solution, assignments, width, height, rng);
    case 'edge-header':
      return findEdgeHeaderClue(target, solution, assignments, width, height, rng);
    default:
      // Fallback to adjacent
      return findAdjacentClue(target, undefined, solution, assignments, width, height, rng);
  }
}

/**
 * Compile a puzzle from a blueprint.
 * @throws CompilationError on failure
 */
export function compilePuzzle(
  blueprint: PuzzleBlueprint,
  rngFn?: () => number,
): PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell> {
  const rng = rngFn ?? createSeededRandom(blueprint.seed);
  const { width, height, mineDensity } = blueprint;
  const log: string[] = [];

  // Resolve steps (explicit or auto-generated)
  const steps: PuzzleStep[] = blueprint.steps.length > 0
    ? [...blueprint.steps]
    : autoGenerateSteps(
        blueprint.autoStepCount ?? 10,
        blueprint.defaultDifficulty,
        blueprint.allowedStrategies,
        rng,
      );

  // ── Phase 0: Initialize ──
  const assignments = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      assignments.set(coordKey(r, c), 'unknown');
    }
  }

  const shape: GridShape = Array.from({ length: height }, () => Array(width).fill(true));

  // ── Phase 1: Cascade origin ──
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
  log.push(`Origin at (${originR},${originC}), ${revealedSet.size} safe`);

  // ── Phase 2: Process steps ──
  const accumulatedClues: HexMineExplicitClue[] = [];

  // Temp solution for verification
  const tempSolution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill(0),
  );
  const tempGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('hidden'),
  );

  for (const key of revealedSet) {
    const [r, c] = key.split(',').map(Number);
    tempGrid[r][c] = 0;
  }

  let stepsProcessed = 0;

  for (const step of steps) {
    // Resolve target
    const resolvedTarget = resolveTarget(step.target, assignments, width, height, rng);
    if (!resolvedTarget) {
      log.push(`Step ${step.id}: no frontier cell available, skipping`);
      continue;
    }

    const targetKey = coordKey(resolvedTarget.row, resolvedTarget.col);

    // Check target is unassigned
    if (assignments.get(targetKey) !== 'unknown') {
      if (step.target.kind === 'auto') {
        log.push(`Step ${step.id}: auto-picked ${targetKey} already assigned, skipping`);
        continue;
      }
      throw new CompilationError(
        `Step ${step.id}: target ${targetKey} already assigned`,
        step.id, log,
      );
    }

    // Assign target value
    const targetValue = step.targetValue ?? (rng() < 0.5 ? 1 : 0);
    assignments.set(targetKey, targetValue === 1 ? 'mine' : 'safe');
    if (targetValue === 1) {
      tempSolution[resolvedTarget.row][resolvedTarget.col] = 'mine';
    }
    log.push(`Step ${step.id}: ${targetKey} = ${targetValue === 1 ? 'mine' : 'safe'}`);

    // Update temp grids
    updateTempSolution(tempSolution, assignments, width, height);
    updateTempGrid(tempGrid, assignments, revealedSet, tempSolution, width, height);

    // Contradiction check
    if (hasKnowledgeContradiction(tempGrid, tempSolution, assignments, accumulatedClues, width, height)) {
      if (step.target.kind === 'auto') {
        // Undo and skip
        assignments.set(targetKey, 'unknown');
        if (targetValue === 1) tempSolution[resolvedTarget.row][resolvedTarget.col] = 0;
        log.push(`Step ${step.id}: contradiction, skipping`);
        continue;
      }
      throw new CompilationError(
        `Step ${step.id}: assignment creates contradiction`,
        step.id, log,
      );
    }

    // Create clue
    const strategy = step.requiredStrategy ?? { kind: 'clue', type: 'adjacent' };

    if (strategy.kind === 'clue') {
      const clue = createClueForStrategy(
        strategy, resolvedTarget, tempSolution, assignments, shape, width, height, rng,
      );

      if (!clue) {
        // Try fallback to adjacent
        const fallback = findAdjacentClue(
          resolvedTarget, undefined, tempSolution, assignments, width, height, rng,
        );
        if (fallback) {
          accumulatedClues.push(fallback);
          log.push(`Step ${step.id}: ${strategy.type} failed, used adjacent fallback`);
        } else if (step.target.kind === 'auto') {
          // Undo and skip
          assignments.set(targetKey, 'unknown');
          if (targetValue === 1) tempSolution[resolvedTarget.row][resolvedTarget.col] = 0;
          log.push(`Step ${step.id}: no clue possible, skipping`);
          continue;
        } else {
          throw new CompilationError(
            `Step ${step.id}: cannot create ${strategy.type} clue for ${targetKey}`,
            step.id, log,
          );
        }
      } else {
        accumulatedClues.push(clue);
        log.push(`Step ${step.id}: created ${clue.type} clue at ${clue.displayKey}`);
      }
    } else if (strategy.kind === 'pre-revealed') {
      revealedSet.add(targetKey);
      log.push(`Step ${step.id}: pre-revealed ${targetKey}`);
    }

    // Update revealed set
    if (targetValue === 0) {
      revealedSet.add(targetKey);
    }

    // Update temp grids again
    updateTempSolution(tempSolution, assignments, width, height);
    updateTempGrid(tempGrid, assignments, revealedSet, tempSolution, width, height);

    stepsProcessed++;
  }

  log.push(`\nProcessed ${stepsProcessed}/${steps.length} steps, ${accumulatedClues.length} clues`);

  // ── Phase 3: Constrained fill ──
  constrainedFill(assignments, tempSolution, accumulatedClues, width, height, mineDensity, rng);
  const mineCount = [...assignments.values()].filter((s) => s === 'mine').length;
  log.push(`Fill: ${mineCount} mines`);

  // ── Phase 4: Build solution ──
  const solution = buildSolutionFromAssignments(assignments, width, height);

  // ── Phase 5: Recompute clue values ──
  for (const clue of accumulatedClues) {
    let actual = 0;
    for (const key of clue.cellKeys) {
      const [r, c] = key.split(',').map(Number);
      if (solution[r]?.[c] === 'mine') actual++;
    }
    (clue as { mineCount: number }).mineCount = actual;
  }

  // ── Phase 6: Build player grid ──
  let cascadeStart: { row: number; col: number } | null = null;
  if (solution[originR][originC] === 0) {
    cascadeStart = { row: originR, col: originC };
  } else {
    for (let r = 0; r < height && !cascadeStart; r++) {
      for (let c = 0; c < width && !cascadeStart; c++) {
        if (solution[r][c] === 0) cascadeStart = { row: r, col: c };
      }
    }
  }

  const playerGrid: HexMineGrid = cascadeStart
    ? simulateCascade(solution, cascadeStart, width, height)
    : Array.from({ length: height }, () => Array.from<HexMineCell>({ length: width }).fill('hidden'));

  // Trim grid shape (create holes in unused areas)
  trimShape(solution, playerGrid, accumulatedClues, shape, width, height);

  // Apply disabled cells from trimming + line clue origins
  const hasDisabled = shape.some((row) => row.some((v) => !v));
  if (hasDisabled) {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!shape[r][c]) {
          playerGrid[r][c] = 'disabled';
          solution[r][c] = 'disabled';
        }
      }
    }
  }
  log.push(`Shape trimmed: ${hasDisabled ? shape.flat().filter((v) => !v).length + ' cells disabled' : 'no trimming'}`);

  // ── Phase 7: Verify solvability + supplement if needed ──
  let solvable = solveFromRevealed(
    playerGrid, solution, width, height,
    accumulatedClues.length > 0 ? accumulatedClues : undefined,
  );

  // If not solvable, add supplementary adjacent clues on revealed frontier cells
  if (!solvable) {
    log.push('Not solvable — adding supplementary clues...');
    for (let r = 0; r < height && !solvable; r++) {
      for (let c = 0; c < width && !solvable; c++) {
        if (typeof playerGrid[r][c] !== 'number' || playerGrid[r][c] === 0) continue;
        // Check if this cell already has a clue
        const ck = coordKey(r, c);
        if (accumulatedClues.some((cl) => cl.displayKey === ck)) continue;

        const cwNeighbors = getNeighborsClockwise(r, c, width, height);
        if (cwNeighbors.some((n) => n === null)) continue;

        const cellKeys = (cwNeighbors as Array<{ row: number; col: number }>)
          .map((n) => coordKey(n.row, n.col));
        const mc = cellKeys.reduce((cnt, key) => {
          const [nr, nc] = key.split(',').map(Number);
          return cnt + (solution[nr]?.[nc] === 'mine' ? 1 : 0);
        }, 0);

        if (mc === 0) continue;

        accumulatedClues.push({
          id: `supp-adj-${r},${c}`,
          type: 'adjacent',
          cellKeys,
          mineCount: mc,
          special: 'none',
          displayKey: ck,
        });

        solvable = solveFromRevealed(
          playerGrid, solution, width, height, accumulatedClues,
        );
      }
    }
    log.push(`After supplements: solvable=${solvable}, clues=${accumulatedClues.length}`);
  }

  log.push(`Solvable: ${solvable}`);

  // ── Phase 8: Validate integrity ──
  const errors = validatePuzzleIntegrity(
    playerGrid, solution,
    accumulatedClues.length > 0 ? accumulatedClues : null,
    hasDisabled ? shape : null,
    width, height,
  );
  if (errors.length > 0) {
    log.push(`Integrity: ${errors.length} errors`);
  }

  // ── Phase 9: Return ──
  const clueData: HexMineClues = accumulatedClues.length > 0
    ? { clues: accumulatedClues, questionMarks: [] }
    : null;

  log.push(`Done: ${accumulatedClues.length} clues, ${mineCount} mines, solvable=${solvable}`);

  return {
    grid: playerGrid,
    solution,
    clues: clueData,
    emptyCell: 'hidden' as HexMineCell,
    width,
    height,
    ...(hasDisabled ? { shape } : {}),
  };
}

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
      } else {
        grid[r][c] = 'hidden';
      }
    }
  }
}
