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
import type { PuzzleBlueprint, PuzzleStep, StepStrategy, CellTarget } from './compilerTypes';
import { CompilationError } from './compilerTypes';
import { explainStep, type SolutionStep } from './explainer';

/**
 * Approach A: Pure Grow From Steps.
 *
 * Instead of filling a rectangular grid then trimming, this compiler grows
 * the grid from nothing. Only cells that appear in clue scopes, the cascade
 * origin neighborhood, or are directly placed by steps ever exist.
 * Everything else is a hole (disabled).
 *
 * Algorithm:
 * 1. Start with an empty set of placed cells (no grid).
 * 2. Place cascade origin + its immediate neighbors (safe foothold).
 * 3. For each step:
 *    a. Place the target cell.
 *    b. Create the clue(s) for that step.
 *    c. Add ONLY cells that are in each clue's scope (cellKeys).
 *    d. Place mines in scope cells to satisfy the clue equation.
 *    e. Cells NOT in any scope = don't exist (holes).
 * 4. After all steps: compute neighbor counts for all placed safe cells.
 * 5. Build the grid + solution from ONLY the placed cells.
 * 6. Everything else = disabled/hole.
 * 7. NO random fill phase.
 */

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
 * For grow mode, we use a restricted frontier based on placedCells instead
 * of scanning the full grid.
 */
function resolveTarget(
  target: CellTarget,
  assignments: Map<string, CellState>,
  placedCells: Set<string>,
  width: number,
  height: number,
  rng: () => number,
): { row: number; col: number } | null {
  if (target.kind === 'coord') {
    return { row: target.row, col: target.col };
  }
  // Auto: pick from frontier of placed cells.
  // Frontier = unknown cells adjacent to safe placed cells.
  return findGrowFrontierCell(assignments, placedCells, width, height, rng);
}

/**
 * Find a frontier cell for grow mode: an unknown cell that neighbors a
 * safe placed cell, OR a cell just outside the placed region (which we
 * can add to the grid).
 */
function findGrowFrontierCell(
  assignments: Map<string, CellState>,
  placedCells: Set<string>,
  width: number,
  height: number,
  rng: () => number,
): { row: number; col: number } | null {
  const frontier: Array<{ row: number; col: number }> = [];

  for (const key of placedCells) {
    const [r, c] = key.split(',').map(Number);
    if (assignments.get(key) !== 'safe') continue;
    const neighbors = getOffsetNeighbors(r, c, width, height);
    for (const n of neighbors) {
      const nk = coordKey(n.row, n.col);
      // Either unknown in placed, or not placed at all (we'll add it)
      if (!placedCells.has(nk) || assignments.get(nk) === 'unknown') {
        frontier.push({ row: n.row, col: n.col });
      }
    }
  }

  if (frontier.length === 0) return null;

  // Deduplicate
  const seen = new Set<string>();
  const unique: Array<{ row: number; col: number }> = [];
  for (const f of frontier) {
    const fk = coordKey(f.row, f.col);
    if (!seen.has(fk)) {
      seen.add(fk);
      unique.push(f);
    }
  }

  const idx = Math.floor(rng() * unique.length);
  return unique[idx];
}

/**
 * Place a cell into the grow-set. Marks it in assignments and placedCells.
 */
function placeCell(
  key: string,
  state: CellState,
  assignments: Map<string, CellState>,
  placedCells: Set<string>,
): void {
  placedCells.add(key);
  assignments.set(key, state);
}

/**
 * Ensure a cell exists in the placed set. If not placed yet, place as unknown.
 */
function ensurePlaced(
  key: string,
  assignments: Map<string, CellState>,
  placedCells: Set<string>,
): void {
  if (!placedCells.has(key)) {
    placedCells.add(key);
    if (!assignments.has(key)) {
      assignments.set(key, 'unknown');
    }
  }
}

/**
 * Try to create a clue for a strategy, with fallback to adjacent if the specific type fails.
 * For grow mode, we use a temporary full solution/shape to let clueFactory work,
 * then extract only the cells the clue references.
 */
function createClueForStrategy(
  strategy: StepStrategy,
  target: { row: number; col: number },
  tempSolution: HexMineGrid,
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
      return findAdjacentClue(target, special, tempSolution, assignments, width, height, rng);
    case 'line':
      return findLineClue(target, special, tempSolution, assignments, shape, width, height, rng);
    case 'range':
      return findRangeClue(target, tempSolution, assignments, width, height, rng);
    case 'edge-header':
      return findEdgeHeaderClue(target, tempSolution, assignments, width, height, rng);
    default:
      return findAdjacentClue(target, undefined, tempSolution, assignments, width, height, rng);
  }
}

/**
 * After all steps are processed, decide mine/safe for any remaining unknown
 * cells in clue scopes so that clue equations are satisfied.
 * This is a constrained assignment (no random fill beyond clue scopes).
 */
function satisfyClueEquations(
  assignments: Map<string, CellState>,
  clues: HexMineExplicitClue[],
  rng: () => number,
): void {
  // Build scope lookup: cellKey -> clue indices
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

  // Collect unknown cells in scope
  const unknownsInScope: string[] = [];
  const allScopeKeys = new Set<string>();
  for (const clue of clues) {
    for (const key of clue.cellKeys) {
      allScopeKeys.add(key);
    }
  }
  for (const key of allScopeKeys) {
    if (assignments.get(key) === 'unknown') {
      unknownsInScope.push(key);
    }
  }

  // Shuffle for variety
  for (let i = unknownsInScope.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unknownsInScope[i], unknownsInScope[j]] = [unknownsInScope[j], unknownsInScope[i]];
  }

  // Greedy fill with scope budget checking
  for (const key of unknownsInScope) {
    const clueIndices = cellToClues.get(key) ?? [];

    // Check if any clue NEEDS this to be a mine
    let mustBeMine = false;
    for (const ci of clueIndices) {
      const clue = clues[ci];
      let unknownsLeft = 0;
      for (const ck of clue.cellKeys) {
        if (assignments.get(ck) === 'unknown') unknownsLeft++;
      }
      if (unknownsLeft === clueRemaining[ci] && clueRemaining[ci] > 0) {
        mustBeMine = true;
        break;
      }
    }

    if (mustBeMine) {
      assignments.set(key, 'mine');
      for (const ci of clueIndices) clueRemaining[ci]--;
      continue;
    }

    // Try placing a mine if budget allows
    let canPlaceMine = true;
    for (const ci of clueIndices) {
      if (clueRemaining[ci] <= 0) {
        canPlaceMine = false;
        break;
      }
    }

    if (canPlaceMine && rng() < 0.4) {
      assignments.set(key, 'mine');
      for (const ci of clueIndices) clueRemaining[ci]--;
    } else {
      assignments.set(key, 'safe');
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

/**
 * Compute neighbor mine counts for all safe cells in the placed set.
 * Only counts neighbors that are also in the placed set.
 */
function computeNeighborCounts(
  assignments: Map<string, CellState>,
  placedCells: Set<string>,
  width: number,
  height: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of placedCells) {
    if (assignments.get(key) === 'mine') continue;
    if (assignments.get(key) === undefined) continue;
    const [r, c] = key.split(',').map(Number);
    const neighbors = getOffsetNeighbors(r, c, width, height);
    let count = 0;
    for (const n of neighbors) {
      const nk = coordKey(n.row, n.col);
      if (placedCells.has(nk) && assignments.get(nk) === 'mine') count++;
    }
    counts.set(key, count);
  }
  return counts;
}

/**
 * Build solution and player grids from placed cells.
 * Non-placed cells become 'disabled'.
 */
function buildGrids(
  assignments: Map<string, CellState>,
  placedCells: Set<string>,
  neighborCounts: Map<string, number>,
  width: number,
  height: number,
): { solution: HexMineGrid; shape: GridShape } {
  const solution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('disabled'),
  );
  const shape: GridShape = Array.from({ length: height }, () => Array(width).fill(false));

  for (const key of placedCells) {
    const [r, c] = key.split(',').map(Number);
    if (r < 0 || r >= height || c < 0 || c >= width) continue;
    const state = assignments.get(key);
    if (state === 'mine') {
      solution[r][c] = 'mine';
      shape[r][c] = true;
    } else if (state === 'safe') {
      const count = neighborCounts.get(key) ?? 0;
      solution[r][c] = count as HexMineCell;
      shape[r][c] = true;
    }
    // 'unknown' shouldn't exist after satisfyClueEquations, but treat as safe
    if (state === 'unknown') {
      const count = neighborCounts.get(key) ?? 0;
      solution[r][c] = count as HexMineCell;
      shape[r][c] = true;
    }
  }

  return { solution, shape };
}

/**
 * Compile a puzzle using the grow-from-steps approach.
 * @throws CompilationError on failure
 */
export function compilePuzzleGrow(
  blueprint: PuzzleBlueprint,
  rngFn?: () => number,
): PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell> {
  const rng = rngFn ?? createSeededRandom(blueprint.seed);
  const { width, height } = blueprint;
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

  // ── Phase 0: Initialize with EMPTY sets ──
  // Unlike the old compiler which fills a full rectangle, we start empty.
  const assignments = new Map<string, CellState>();
  const placedCells = new Set<string>();

  // We need a temporary full-size shape array for line clue factory
  // (it checks edge cells and disables origins).
  // Initialize all as true; we'll derive the real shape from placedCells later.
  const tempShape: GridShape = Array.from({ length: height }, () => Array(width).fill(true));

  // ── Phase 1: Cascade origin (small foothold) ──
  const originR = Math.floor(height / 2);
  const originC = Math.floor(width / 2);

  // Place origin + immediate neighbors as safe
  const originKey = coordKey(originR, originC);
  placeCell(originKey, 'safe', assignments, placedCells);

  const originNeighbors = getOffsetNeighbors(originR, originC, width, height);
  for (const n of originNeighbors) {
    placeCell(coordKey(n.row, n.col), 'safe', assignments, placedCells);
  }

  const revealedSet = new Set<string>();
  revealedSet.add(originKey);
  for (const n of originNeighbors) {
    revealedSet.add(coordKey(n.row, n.col));
  }

  log.push(`Origin at (${originR},${originC}), ${revealedSet.size} safe placed`);

  // ── Phase 2: Process steps (grow the grid) ──
  const accumulatedClues: HexMineExplicitClue[] = [];
  const solutionSteps: SolutionStep[] = [];

  // Build a temporary solution grid for clue factory compatibility.
  // We keep it in sync with assignments as we go.
  const tempSolution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill(0),
  );
  const tempGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('hidden'),
  );

  // Sync temp grids with initial placed cells
  syncTempGrids(tempSolution, tempGrid, assignments, revealedSet, placedCells, width, height);

  let stepsProcessed = 0;

  for (const step of steps) {
    // Resolve target from grow frontier
    const resolvedTarget = resolveTarget(step.target, assignments, placedCells, width, height, rng);
    if (!resolvedTarget) {
      log.push(`Step ${step.id}: no frontier cell available, skipping`);
      continue;
    }

    const targetKey = coordKey(resolvedTarget.row, resolvedTarget.col);

    // Ensure target is placed
    ensurePlaced(targetKey, assignments, placedCells);

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
    const targetState: CellState = targetValue === 1 ? 'mine' : 'safe';
    assignments.set(targetKey, targetState);
    if (targetValue === 1) {
      tempSolution[resolvedTarget.row][resolvedTarget.col] = 'mine';
    }
    log.push(`Step ${step.id}: ${targetKey} = ${targetState}`);

    // Sync temp grids
    syncTempGrids(tempSolution, tempGrid, assignments, revealedSet, placedCells, width, height);

    // Contradiction check
    if (hasKnowledgeContradiction(tempGrid, tempSolution, assignments, accumulatedClues, width, height)) {
      if (step.target.kind === 'auto') {
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

    // Create clues for this step
    const strategies = step.requiredStrategies ?? [{ kind: 'clue', type: 'adjacent' }];
    const stepClues: HexMineExplicitClue[] = [];
    let hasPreRevealed = false;

    for (const strategy of strategies) {
      if (strategy.kind === 'clue') {
        const clue = createClueForStrategy(
          strategy, resolvedTarget, tempSolution, assignments, tempShape, width, height, rng,
        );

        if (clue) {
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

    // SHAPE CARVING: for multi-clue steps, only keep scope cells that make
    // the target uniquely deducible. The intersection of active cells across
    // all clue scopes should narrow to ONLY the target.
    if (stepClues.length >= 2) {
      // Compute intersection of all clue scopes
      const scopeSets = stepClues.map((c) => new Set(c.cellKeys));
      const intersection = new Set(
        [...scopeSets[0]].filter((k) => scopeSets.every((s) => s.has(k))),
      );

      // For each clue: keep the target + a few safe cells to make the count work.
      // Disable other scope cells to narrow down possibilities.
      for (const clue of stepClues) {
        const keptCells: string[] = [targetKey]; // always keep target
        const otherCells = clue.cellKeys.filter((k) => k !== targetKey);

        // Keep just enough safe cells so mineCount = 1 (the target)
        // and there are a few decoy cells for ambiguity management
        const safeToKeep = Math.min(2, otherCells.length); // small number of extras
        for (let i = 0; i < safeToKeep; i++) {
          keptCells.push(otherCells[i]);
          // Mark as safe (not mine)
          assignments.set(otherCells[i], 'safe');
        }

        // Add kept cells to placed
        for (const key of keptCells) {
          ensurePlaced(key, assignments, placedCells);
        }

        // Update clue's cellKeys to only kept cells
        (clue as unknown as { cellKeys: string[] }).cellKeys = keptCells;
        // Update mineCount: only the target is a mine among kept cells
        (clue as { mineCount: number }).mineCount = targetValue === 1 ? 1 : 0;
      }

      log.push(`Step ${step.id}: carved scopes to ${stepClues.map((c) => c.cellKeys.length)} cells each`);
    } else if (stepClues.length === 1) {
      // Single clue: keep minimal scope
      const clue = stepClues[0];
      const keptCells: string[] = [targetKey];
      const otherCells = clue.cellKeys.filter((k) => k !== targetKey);
      const safeToKeep = Math.min(3, otherCells.length);
      for (let i = 0; i < safeToKeep; i++) {
        keptCells.push(otherCells[i]);
        assignments.set(otherCells[i], 'safe');
      }
      for (const key of keptCells) {
        ensurePlaced(key, assignments, placedCells);
      }
      (clue as unknown as { cellKeys: string[] }).cellKeys = keptCells;
      (clue as { mineCount: number }).mineCount = targetValue === 1 ? 1 : 0;
      log.push(`Step ${step.id}: carved scope to ${keptCells.length} cells`);
    }

    // Also place the clue display cells
    for (const clue of stepClues) {
      ensurePlaced(clue.displayKey, assignments, placedCells);
      // Ensure display cell is safe (not mine)
      if (assignments.get(clue.displayKey) === 'unknown') {
        assignments.set(clue.displayKey, 'safe');
      }
    }

    accumulatedClues.push(...stepClues);

    // Update revealed set
    if (targetValue === 0 || hasPreRevealed) {
      revealedSet.add(targetKey);
    }

    // Sync temp grids
    syncTempGrids(tempSolution, tempGrid, assignments, revealedSet, placedCells, width, height);

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

  log.push(`\nProcessed ${stepsProcessed}/${steps.length} steps, ${accumulatedClues.length} clues`);

  // ── Phase 3: Satisfy clue equations (NO random fill) ──
  // Only fills unknown cells within clue scopes to match mine counts.
  satisfyClueEquations(assignments, accumulatedClues, rng);

  // Any remaining unknown placed cells become safe
  for (const key of placedCells) {
    if (assignments.get(key) === 'unknown') {
      assignments.set(key, 'safe');
    }
  }

  const mineCount = [...assignments.values()].filter((s) => s === 'mine').length;
  log.push(`Mines from clue equations: ${mineCount}`);

  // ── Phase 4: Compute neighbor counts ──
  const neighborCounts = computeNeighborCounts(assignments, placedCells, width, height);

  // ── Phase 5: Build grids from placed cells ──
  const { solution, shape } = buildGrids(assignments, placedCells, neighborCounts, width, height);

  // Handle line clue origins (disabled in tempShape by clueFactory)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!tempShape[r][c] && shape[r][c]) {
        // clueFactory disabled this cell (line clue origin)
        solution[r][c] = 'disabled';
        shape[r][c] = false;
      }
    }
  }

  // Ensure range/adjacent clue display cells are NOT disabled
  for (const clue of accumulatedClues) {
    if (clue.type === 'range' || clue.type === 'adjacent') {
      const [r, c] = clue.displayKey.split(',').map(Number);
      if (r >= 0 && r < height && c >= 0 && c < width) {
        shape[r][c] = true; // ensure active
        if (solution[r][c] === 'disabled') {
          // Recompute the number
          const neighbors = getOffsetNeighbors(r, c, width, height);
          let count = 0;
          for (const n of neighbors) {
            if (solution[n.row]?.[n.col] === 'mine') count++;
          }
          solution[r][c] = count as HexMineCell;
        }
      }
    }
  }

  // ── Phase 5b: Recompute clue values from final solution ──
  for (const clue of accumulatedClues) {
    let actual = 0;
    for (const key of clue.cellKeys) {
      const [r, c] = key.split(',').map(Number);
      if (solution[r]?.[c] === 'mine') actual++;
    }
    (clue as { mineCount: number }).mineCount = actual;
  }

  // ── Phase 6: Build player grid ──
  const playerGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('disabled'),
  );

  // Mark all placed cells as hidden (active cells)
  for (const key of placedCells) {
    const [r, c] = key.split(',').map(Number);
    if (r < 0 || r >= height || c < 0 || c >= width) continue;
    if (solution[r][c] === 'disabled') {
      playerGrid[r][c] = 'disabled';
    } else {
      playerGrid[r][c] = 'hidden';
    }
  }

  // Reveal cascade origin
  if (typeof solution[originR][originC] === 'number') {
    playerGrid[originR][originC] = solution[originR][originC];
  }

  // Reveal a few origin neighbors
  for (let i = 0; i < Math.min(3, originNeighbors.length); i++) {
    const n = originNeighbors[i];
    if (typeof solution[n.row][n.col] === 'number') {
      playerGrid[n.row][n.col] = solution[n.row][n.col];
    }
  }

  // Reveal adjacent and range clue display cells
  for (const clue of accumulatedClues) {
    if (clue.type === 'adjacent' || clue.type === 'range') {
      const [r, c] = clue.displayKey.split(',').map(Number);
      if (typeof solution[r]?.[c] === 'number') {
        playerGrid[r][c] = solution[r][c];
      }
    }
  }

  // Reveal pre-revealed cells
  for (const key of revealedSet) {
    const [r, c] = key.split(',').map(Number);
    if (typeof solution[r]?.[c] === 'number' && playerGrid[r][c] === 'hidden') {
      playerGrid[r][c] = solution[r][c];
    }
  }

  // Disabled cells in shape
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!shape[r][c]) {
        playerGrid[r][c] = 'disabled';
        solution[r][c] = 'disabled';
      }
    }
  }

  const disabledCount = shape.flat().filter((v) => !v).length;
  log.push(`Grid: ${placedCells.size} placed, ${disabledCount} disabled (holes)`);

  // ── Phase 7: Verify solvability + supplement if needed ──
  let solvable = solveFromRevealed(
    playerGrid, solution, width, height,
    accumulatedClues.length > 0 ? accumulatedClues : undefined,
  );

  if (!solvable) {
    log.push('Not solvable -- expanding reveals and adding clues...');

    for (let pass = 0; pass < 10 && !solvable; pass++) {
      const toReveal: Array<{ row: number; col: number }> = [];
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (typeof playerGrid[r][c] !== 'number') continue;
          for (const n of getOffsetNeighbors(r, c, width, height)) {
            if (playerGrid[n.row][n.col] === 'hidden' && typeof solution[n.row][n.col] === 'number') {
              toReveal.push(n);
            }
          }
        }
      }
      for (const cell of toReveal) {
        playerGrid[cell.row][cell.col] = solution[cell.row][cell.col];
      }

      // Add adjacent clues on newly revealed number cells
      for (let r = 0; r < height && !solvable; r++) {
        for (let c = 0; c < width && !solvable; c++) {
          if (typeof playerGrid[r][c] !== 'number' || playerGrid[r][c] === 0) continue;
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
    }
    log.push(`After supplements: solvable=${solvable}, clues=${accumulatedClues.length}`);
  }

  log.push(`Solvable: ${solvable}`);

  // ── Phase 8: Validate integrity ──
  const errors = validatePuzzleIntegrity(
    playerGrid, solution,
    accumulatedClues.length > 0 ? accumulatedClues : null,
    shape,
    width, height,
  );
  if (errors.length > 0) {
    log.push(`Integrity: ${errors.length} errors`);
  }

  // ── Phase 9: Return ──
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

/**
 * Sync temp solution and temp grid arrays with current assignments.
 * Only processes placed cells (not the entire rectangle).
 */
function syncTempGrids(
  solution: HexMineGrid,
  grid: HexMineGrid,
  assignments: Map<string, CellState>,
  revealed: Set<string>,
  placedCells: Set<string>,
  width: number,
  height: number,
): void {
  for (const key of placedCells) {
    const [r, c] = key.split(',').map(Number);
    if (r < 0 || r >= height || c < 0 || c >= width) continue;

    const state = assignments.get(key);
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

    if (revealed.has(key) && typeof solution[r][c] === 'number') {
      grid[r][c] = solution[r][c];
    } else {
      grid[r][c] = 'hidden';
    }
  }
}
