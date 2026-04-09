import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { GridShape } from '@/types';
import type { HexMineGrid, HexMineClues, HexMineCell, HexMineExplicitClue } from '../types';
import type { CellState } from '../solver/types';
import { coordKey, getOffsetNeighbors, getNeighborsClockwise } from '../hex';
import { solveFromRevealed } from '../solve';
import { validatePuzzleIntegrity } from '../validate';
import { createSeededRandom } from '../seededRandom';
import { findAdjacentClue, findLineClue, findRangeClue, findEdgeHeaderClue, findFrontierCell } from './clueFactory';
import { hasKnowledgeContradiction } from './verify';
import { explainStep, type SolutionStep } from './explainer';
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
      requiredStrategies: [strategy],
    });
  }

  return steps;
}

/**
 * Resolve a CellTarget to a concrete coordinate.
 * In fog mode, uses the local assignments map (not the full grid).
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
      return findAdjacentClue(target, undefined, solution, assignments, width, height, rng);
  }
}

/**
 * Compute neighbor mine counts for all safe cells in assignments,
 * writing into the solution grid. Only touches cells that exist in assignments.
 */
function recomputeNeighborCounts(
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  width: number,
  height: number,
): void {
  for (const [key, state] of assignments) {
    if (state !== 'safe') continue;
    const [r, c] = key.split(',').map(Number);
    const neighbors = getOffsetNeighbors(r, c, width, height);
    let count = 0;
    for (const n of neighbors) {
      const nKey = coordKey(n.row, n.col);
      if (assignments.get(nKey) === 'mine' || solution[n.row]?.[n.col] === 'mine') {
        count++;
      }
    }
    solution[r][c] = count as HexMineCell;
  }
}

/**
 * Approach B: Grow + Fog compiler.
 *
 * Instead of filling a full rectangular grid then trimming, this compiler
 * grows the grid incrementally from zero cells:
 *
 * 1. Start with ZERO cells
 * 2. Place cascade origin + neighbors (small foothold)
 * 3. For each step:
 *    a. Place the target cell
 *    b. Create clue(s) for the step
 *    c. Add ONLY cells in each clue's scope
 *    d. Place mines to satisfy clue equations
 * 4. After all steps: add a 1-cell "fog ring" around every placed cell
 *    - Fog cells are ALWAYS hidden (never revealed)
 *    - Fog cells may contain random mines (doesn't matter — never visible)
 *    - Fog prevents the player from knowing exactly which cells are meaningful
 * 5. Compute neighbor counts for all cells (including fog ring)
 * 6. Build grid + solution. Fog cells stay 'hidden' permanently.
 * 7. Everything beyond the fog ring = disabled/hole
 *
 * @throws CompilationError on failure
 */
export function compilePuzzleFog(
  blueprint: PuzzleBlueprint,
  rngFn?: () => number,
): PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell> {
  const rng = rngFn ?? createSeededRandom(blueprint.seed);
  const { width, height, mineDensity } = blueprint;
  const log: string[] = [];

  // Resolve steps
  const steps: PuzzleStep[] = blueprint.steps.length > 0
    ? [...blueprint.steps]
    : autoGenerateSteps(
        blueprint.autoStepCount ?? 10,
        blueprint.defaultDifficulty,
        blueprint.allowedStrategies,
        rng,
      );

  // ── Phase 0: Initialize with ZERO cells ──
  // Unlike compile.ts which fills the entire grid, we start empty.
  // Only add cells as needed by the solving path.
  const assignments = new Map<string, CellState>();
  // Track which cells are "used" (part of the designed solving area)
  const usedCells = new Set<string>();

  // Shape starts all-false (nothing enabled yet)
  const shape: GridShape = Array.from({ length: height }, () => Array(width).fill(false));

  // Working solution + grid (full size, but mostly unused)
  const tempSolution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('disabled'),
  );
  const tempGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('disabled'),
  );

  /**
   * Mark a cell as "used" — add it to the working area.
   * If it doesn't have an assignment yet, set it to 'unknown'.
   */
  function useCell(r: number, c: number): void {
    if (r < 0 || r >= height || c < 0 || c >= width) return;
    const key = coordKey(r, c);
    usedCells.add(key);
    shape[r][c] = true;
    if (!assignments.has(key)) {
      assignments.set(key, 'unknown');
    }
    // Un-disable in temp grids
    if (tempSolution[r][c] === 'disabled') {
      tempSolution[r][c] = 0;
    }
    if (tempGrid[r][c] === 'disabled') {
      tempGrid[r][c] = 'hidden';
    }
  }

  // ── Phase 1: Cascade origin (small foothold) ──
  const originR = Math.floor(height / 2);
  const originC = Math.floor(width / 2);

  // Add origin + its neighbors as safe cells
  useCell(originR, originC);
  assignments.set(coordKey(originR, originC), 'safe');
  const revealedSet = new Set<string>();
  revealedSet.add(coordKey(originR, originC));

  for (const n of getOffsetNeighbors(originR, originC, width, height)) {
    useCell(n.row, n.col);
    assignments.set(coordKey(n.row, n.col), 'safe');
    revealedSet.add(coordKey(n.row, n.col));
  }

  // Seed the frontier: add neighbors-of-neighbors as unknown cells
  // so findFrontierCell can pick targets from them.
  for (const n of getOffsetNeighbors(originR, originC, width, height)) {
    for (const nn of getOffsetNeighbors(n.row, n.col, width, height)) {
      const nnKey = coordKey(nn.row, nn.col);
      if (!assignments.has(nnKey)) {
        useCell(nn.row, nn.col);
        // useCell already sets it to 'unknown'
      }
    }
  }

  log.push(`Origin at (${originR},${originC}), ${revealedSet.size} safe cells`);

  // ── Phase 2: Process steps (grow the grid) ──
  const accumulatedClues: HexMineExplicitClue[] = [];
  const solutionSteps: SolutionStep[] = [];
  let stepsProcessed = 0;

  for (const step of steps) {
    // Resolve target
    const resolvedTarget = resolveTarget(step.target, assignments, width, height, rng);
    if (!resolvedTarget) {
      log.push(`Step ${step.id}: no frontier cell available, skipping`);
      continue;
    }

    const targetKey = coordKey(resolvedTarget.row, resolvedTarget.col);

    // Ensure target cell is in the working area
    useCell(resolvedTarget.row, resolvedTarget.col);

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

    // Update temp solution for safe cells (neighbor counts)
    recomputeNeighborCounts(tempSolution, assignments, width, height);
    updateTempGrid(tempGrid, assignments, revealedSet, tempSolution, width, height);

    // Contradiction check
    if (hasKnowledgeContradiction(tempGrid, tempSolution, assignments, accumulatedClues, width, height)) {
      if (step.target.kind === 'auto') {
        assignments.set(targetKey, 'unknown');
        if (targetValue === 1) tempSolution[resolvedTarget.row][resolvedTarget.col] = 0;
        recomputeNeighborCounts(tempSolution, assignments, width, height);
        log.push(`Step ${step.id}: contradiction, skipping`);
        continue;
      }
      throw new CompilationError(
        `Step ${step.id}: assignment creates contradiction`,
        step.id, log,
      );
    }

    // Create clues for this step
    const strategies = step.requiredStrategies ?? [{ kind: 'clue', type: 'adjacent' }];
    const stepClues: typeof accumulatedClues = [];
    let hasPreRevealed = false;

    for (const strategy of strategies) {
      if (strategy.kind === 'clue') {
        const clue = createClueForStrategy(
          strategy, resolvedTarget, tempSolution, assignments, shape, width, height, rng,
        );

        if (clue) {
          // KEY DIFFERENCE: Add all cells in the clue's scope to the working area
          for (const cellKey of clue.cellKeys) {
            const [cr, cc] = cellKey.split(',').map(Number);
            useCell(cr, cc);
          }
          // Also add the display cell
          if (!clue.displayKey.startsWith('edge-')) {
            const [dr, dc] = clue.displayKey.split(',').map(Number);
            useCell(dr, dc);
          }

          if (!accumulatedClues.some((c) => c.displayKey === clue.displayKey) &&
              !stepClues.some((c) => c.displayKey === clue.displayKey)) {
            stepClues.push(clue);
            log.push(`Step ${step.id}: created ${clue.type} clue at ${clue.displayKey}`);
          }
        } else {
          log.push(`Step ${step.id}: ${strategy.type} clue failed`);
          const fallback = findAdjacentClue(
            resolvedTarget, undefined, tempSolution, assignments, width, height, rng,
          );
          if (fallback && !accumulatedClues.some((c) => c.displayKey === fallback.displayKey)) {
            // Add fallback clue scope cells
            for (const cellKey of fallback.cellKeys) {
              const [cr, cc] = cellKey.split(',').map(Number);
              useCell(cr, cc);
            }
            if (!fallback.displayKey.startsWith('edge-')) {
              const [dr, dc] = fallback.displayKey.split(',').map(Number);
              useCell(dr, dc);
            }
            stepClues.push(fallback);
            log.push(`Step ${step.id}: used adjacent fallback`);
          }
        }
      } else if (strategy.kind === 'pre-revealed') {
        hasPreRevealed = true;
        revealedSet.add(targetKey);
        log.push(`Step ${step.id}: pre-revealed ${targetKey}`);
      }
    }

    accumulatedClues.push(...stepClues);

    if (targetValue === 0 || hasPreRevealed) {
      revealedSet.add(targetKey);
    }

    // Recompute after clue scope expansion
    recomputeNeighborCounts(tempSolution, assignments, width, height);
    updateTempGrid(tempGrid, assignments, revealedSet, tempSolution, width, height);

    // Emit solution step with ALL clues
    solutionSteps.push(explainStep(
      step.id,
      step.label ?? `Step ${step.id}`,
      resolvedTarget.row,
      resolvedTarget.col,
      targetValue as 0 | 1,
      stepClues,
      strategies[0]?.kind ?? 'clue',
    ));

    stepsProcessed++;
  }

  log.push(`Processed ${stepsProcessed}/${steps.length} steps, ${accumulatedClues.length} clues`);

  // ── Phase 3: Constrained fill of used unknowns ──
  // Fill remaining unknown USED cells (not the whole grid)
  constrainedFillUsed(assignments, usedCells, accumulatedClues, mineDensity, width, height, rng);
  recomputeNeighborCounts(tempSolution, assignments, width, height);

  // Sync tempSolution from assignments for used cells
  for (const key of usedCells) {
    const [r, c] = key.split(',').map(Number);
    const state = assignments.get(key);
    if (state === 'mine') {
      tempSolution[r][c] = 'mine';
    }
  }
  // Recompute counts after mine placement
  recomputeNeighborCounts(tempSolution, assignments, width, height);

  const mineCount = [...assignments.values()].filter((s) => s === 'mine').length;
  log.push(`Fill: ${mineCount} mines in ${usedCells.size} used cells`);

  // ── Phase 4: Recompute clue values ──
  for (const clue of accumulatedClues) {
    let actual = 0;
    for (const key of clue.cellKeys) {
      const [r, c] = key.split(',').map(Number);
      if (tempSolution[r]?.[c] === 'mine') actual++;
    }
    (clue as { mineCount: number }).mineCount = actual;
  }

  // ── Phase 5: Add fog ring ──
  // For every used cell, its neighbors that are NOT already used become fog cells.
  const fogCells = new Set<string>();
  for (const key of usedCells) {
    const [r, c] = key.split(',').map(Number);
    for (const n of getOffsetNeighbors(r, c, width, height)) {
      const nKey = coordKey(n.row, n.col);
      if (!usedCells.has(nKey)) {
        fogCells.add(nKey);
      }
    }
  }

  // Assign fog cells: random mine/safe (doesn't matter, they're never revealed)
  for (const key of fogCells) {
    const [r, c] = key.split(',').map(Number);
    shape[r][c] = true; // fog cells are part of the shape (not disabled)
    const isMine = rng() < mineDensity;
    assignments.set(key, isMine ? 'mine' : 'safe');
    if (isMine) {
      tempSolution[r][c] = 'mine';
    } else {
      tempSolution[r][c] = 0; // placeholder, will be recomputed
    }
  }

  log.push(`Fog ring: ${fogCells.size} cells`);

  // ── Phase 6: Recompute ALL neighbor counts (used + fog) ──
  // Fog cells with mines affect neighbor counts of used cells
  const allActiveCells = new Set([...usedCells, ...fogCells]);
  for (const key of allActiveCells) {
    const state = assignments.get(key);
    if (state === 'mine') continue;
    const [r, c] = key.split(',').map(Number);
    const neighbors = getOffsetNeighbors(r, c, width, height);
    let count = 0;
    for (const n of neighbors) {
      const nKey = coordKey(n.row, n.col);
      if (assignments.get(nKey) === 'mine') count++;
    }
    tempSolution[r][c] = count as HexMineCell;
  }

  // ── Phase 7: Build solution grid ──
  const solution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('disabled'),
  );
  for (const key of allActiveCells) {
    const [r, c] = key.split(',').map(Number);
    solution[r][c] = tempSolution[r][c];
  }

  // Mark line clue origins as disabled in solution
  for (const clue of accumulatedClues) {
    if (clue.type === 'line') {
      const [dr, dc] = clue.displayKey.split(',').map(Number);
      solution[dr][dc] = 'disabled';
      shape[dr][dc] = false;
    }
  }

  // ── Phase 8: Build player grid ──
  const playerGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('disabled'),
  );

  // Fog cells: always hidden (never disabled — they exist but are not revealed)
  for (const key of fogCells) {
    const [r, c] = key.split(',').map(Number);
    playerGrid[r][c] = 'hidden';
  }

  // Used cells: start hidden unless they're revealed
  for (const key of usedCells) {
    const [r, c] = key.split(',').map(Number);
    playerGrid[r][c] = 'hidden';
  }

  // Reveal cascade origin
  if (typeof solution[originR][originC] === 'number') {
    playerGrid[originR][originC] = solution[originR][originC];
  }
  // Reveal a few neighbors of the origin
  const originNbrs = getOffsetNeighbors(originR, originC, width, height);
  for (let i = 0; i < Math.min(3, originNbrs.length); i++) {
    const n = originNbrs[i];
    if (typeof solution[n.row][n.col] === 'number') {
      playerGrid[n.row][n.col] = solution[n.row][n.col];
    }
  }

  // Reveal adjacent/range clue display cells
  for (const clue of accumulatedClues) {
    if (clue.type === 'adjacent' || clue.type === 'range') {
      const [r, c] = clue.displayKey.split(',').map(Number);
      if (typeof solution[r]?.[c] === 'number') {
        playerGrid[r][c] = solution[r][c];
      }
    }
  }

  // Reveal cells from pre-revealed steps
  for (const key of revealedSet) {
    const [r, c] = key.split(',').map(Number);
    if (typeof solution[r]?.[c] === 'number' && playerGrid[r][c] === 'hidden') {
      playerGrid[r][c] = solution[r][c];
    }
  }

  // Apply line clue origins as disabled
  for (const clue of accumulatedClues) {
    if (clue.type === 'line') {
      const [dr, dc] = clue.displayKey.split(',').map(Number);
      playerGrid[dr][dc] = 'disabled';
    }
  }

  // Everything not in usedCells or fogCells stays disabled (holes)
  // Shape is already set correctly: true for used+fog, false for everything else

  log.push(`Active cells: ${usedCells.size} used + ${fogCells.size} fog = ${allActiveCells.size} total`);
  log.push(`Disabled: ${width * height - allActiveCells.size} holes`);

  // ── Phase 9: Verify solvability ──
  let solvable = solveFromRevealed(
    playerGrid, solution, width, height,
    accumulatedClues.length > 0 ? accumulatedClues : undefined,
  );

  if (!solvable) {
    log.push('Not solvable — expanding reveals and adding clues...');

    for (let pass = 0; pass < 10 && !solvable; pass++) {
      const toReveal: Array<{ row: number; col: number }> = [];
      for (const key of usedCells) {
        const [r, c] = key.split(',').map(Number);
        if (typeof playerGrid[r][c] !== 'number') continue;
        for (const n of getOffsetNeighbors(r, c, width, height)) {
          const nKey = coordKey(n.row, n.col);
          // Only reveal used cells, never fog
          if (usedCells.has(nKey) && playerGrid[n.row][n.col] === 'hidden' &&
              typeof solution[n.row][n.col] === 'number') {
            toReveal.push(n);
          }
        }
      }
      for (const cell of toReveal) {
        playerGrid[cell.row][cell.col] = solution[cell.row][cell.col];
      }

      // Add adjacent clues on newly revealed number cells
      for (const key of usedCells) {
        if (solvable) break;
        const [r, c] = key.split(',').map(Number);
        if (typeof playerGrid[r][c] !== 'number' || playerGrid[r][c] === 0) continue;
        const ck = coordKey(r, c);
        if (accumulatedClues.some((cl) => cl.displayKey === ck)) continue;

        const cwNeighbors = getNeighborsClockwise(r, c, width, height);
        if (cwNeighbors.some((n) => n === null)) continue;

        const cellKeys = (cwNeighbors as Array<{ row: number; col: number }>)
          .map((n) => coordKey(n.row, n.col));
        const mc = cellKeys.reduce((cnt, cKey) => {
          const [nr, nc] = cKey.split(',').map(Number);
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

  // ── Phase 10: Validate integrity ──
  const errors = validatePuzzleIntegrity(
    playerGrid, solution,
    accumulatedClues.length > 0 ? accumulatedClues : null,
    shape,
    width, height,
  );
  if (errors.length > 0) {
    log.push(`Integrity: ${errors.length} errors`);
  }

  // ── Phase 11: Return ──
  const clueData: HexMineClues = accumulatedClues.length > 0 || solutionSteps.length > 0
    ? {
        clues: accumulatedClues,
        questionMarks: [],
        solutionPath: solutionSteps.length > 0 ? solutionSteps : undefined,
      }
    : null;

  log.push(`Done: ${accumulatedClues.length} clues, ${mineCount} mines, solvable=${solvable}`);

  return {
    grid: playerGrid,
    solution,
    clues: clueData,
    emptyCell: 'hidden' as HexMineCell,
    width,
    height,
    shape,
  };
}

// ── Helper functions ──

function updateTempGrid(
  grid: HexMineGrid,
  assignments: Map<string, CellState>,
  revealed: Set<string>,
  solution: HexMineGrid,
  width: number,
  height: number,
): void {
  for (const [key, state] of assignments) {
    const [r, c] = key.split(',').map(Number);
    if (r < 0 || r >= height || c < 0 || c >= width) continue;
    if (revealed.has(key) && typeof solution[r][c] === 'number') {
      grid[r][c] = solution[r][c];
    } else if (state === 'mine' || state === 'safe' || state === 'unknown') {
      if (grid[r][c] === 'disabled') {
        grid[r][c] = 'hidden';
      }
    }
  }
}

/**
 * Constrained fill for only the USED cells (not the full grid).
 * Fills unknown used cells while respecting clue scope budgets.
 */
function constrainedFillUsed(
  assignments: Map<string, CellState>,
  usedCells: Set<string>,
  clues: HexMineExplicitClue[],
  targetDensity: number,
  width: number,
  height: number,
  rng: () => number,
): void {
  // Build scope lookup
  const cellToClues = new Map<string, number[]>();
  const clueRemaining: number[] = [];

  for (let i = 0; i < clues.length; i++) {
    const clue = clues[i];
    let assignedMines = 0;
    for (const key of clue.cellKeys) {
      if (assignments.get(key) === 'mine') assignedMines++;
      const existing = cellToClues.get(key) ?? [];
      existing.push(i);
      cellToClues.set(key, existing);
    }
    clueRemaining.push(clue.mineCount - assignedMines);
  }

  // Collect unknown USED cells only
  const unknowns: string[] = [];
  for (const key of usedCells) {
    if (assignments.get(key) === 'unknown') unknowns.push(key);
  }

  // Shuffle
  for (let i = unknowns.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unknowns[i], unknowns[j]] = [unknowns[j], unknowns[i]];
  }

  // Mine budget for used cells only
  const currentMines = [...assignments.entries()]
    .filter(([k]) => usedCells.has(k))
    .filter(([, s]) => s === 'mine').length;
  const targetMines = Math.round(usedCells.size * targetDensity);
  let minesRemaining = Math.max(0, targetMines - currentMines);

  for (const key of unknowns) {
    const clueIndices = cellToClues.get(key) ?? [];

    if (minesRemaining > 0) {
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

    assignments.set(key, 'safe');

    for (const ci of clueIndices) {
      const clue = clues[ci];
      let unknownsInScope = 0;
      for (const ck of clue.cellKeys) {
        if (assignments.get(ck) === 'unknown') unknownsInScope++;
      }
      if (unknownsInScope < clueRemaining[ci]) {
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
