import type { Difficulty, GridShape } from '@/types';
import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { HexMineCell, HexMineGrid, HexMineClues, HexMineExplicitClue, ClueSpecial } from './types';
import { getOffsetNeighbors, getNeighborsClockwise, getLineCells, getCellsInRange, coordKey, offsetToAxial, axialToPixel } from './hex';
import { solveFromRevealed } from './solve';
import { validatePuzzleIntegrity } from './validate';
import { createSeededRandom } from './seededRandom';

/** Current random function — replaced with seeded version during generation */
let rng: () => number = Math.random;

interface DifficultyConfig {
  readonly width: number;
  readonly height: number;
  readonly mineDensity: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { width: 8, height: 8, mineDensity: 0.14 },
  medium: { width: 10, height: 10, mineDensity: 0.17 },
  hard: { width: 12, height: 12, mineDensity: 0.20 },
  expert: { width: 14, height: 14, mineDensity: 0.20 },
};

const MAX_ATTEMPTS = 80;

/**
 * Configurable settings (mutable, updated by UI before generation).
 *
 * Generation uses Hexcells-style iterative pruning:
 * 1. Place mines, compute all possible clues
 * 2. Add ALL eligible clues to the puzzle
 * 3. Iteratively remove clues one by one, checking solvability after each
 * 4. Stop when minimum counts are reached or puzzle becomes unsolvable
 *
 * `min*` fields control how many of each type to KEEP (minimum).
 * Set to 0 to disable a clue type entirely.
 */
export const hexmineClueConfig = {
  // ── Clue type minimums (0 = disabled) ──
  /** Min contiguous/nonContiguous adjacent annotations to keep */
  minAdjacentClues: 4,
  /** Min directional line clues to keep */
  minLineClues: 2,
  /** Min radius-2 range clues to keep */
  minRangeClues: 1,
  /** Min question mark tiles to keep */
  minQuestionMarks: 2,
  /** Min edge headers (row/col totals) to keep */
  minEdgeHeaders: 3,
  // ── Gameplay rules ──
  /** Auto-reveal neighbors of 0-cells */
  cascadeReveal: true,
  /** Click revealed number to auto-reveal when flag count matches */
  chordReveal: true,
  /** Flagging a safe cell = instant loss (off by default) */
  loseOnWrongFlag: false,
  // ── Seed ──
  /** Seed for reproducible generation (null = random) */
  seed: null as number | null,
};

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createSolution(
  width: number,
  height: number,
  mineCount: number,
  safeZone: Set<string>,
): HexMineGrid {
  const candidates: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!safeZone.has(coordKey(r, c))) {
        candidates.push({ row: r, col: c });
      }
    }
  }

  shuffle(candidates);

  const mineSet = new Set<string>();
  const actualMines = Math.min(mineCount, candidates.length);
  for (let i = 0; i < actualMines; i++) {
    mineSet.add(coordKey(candidates[i].row, candidates[i].col));
  }

  const solution: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill(0),
  );

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (mineSet.has(coordKey(r, c))) {
        solution[r][c] = 'mine';
      } else {
        const neighbors = getOffsetNeighbors(r, c, width, height);
        let count = 0;
        for (const n of neighbors) {
          if (mineSet.has(coordKey(n.row, n.col))) count++;
        }
        solution[r][c] = count as HexMineCell;
      }
    }
  }

  return solution;
}

function findZeroCell(solution: HexMineGrid, width: number, height: number): { row: number; col: number } | null {
  const candidates: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 0) {
        candidates.push({ row: r, col: c });
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function simulateCascade(
  solution: HexMineGrid,
  start: { row: number; col: number },
  width: number,
  height: number,
): HexMineGrid {
  const grid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('hidden'),
  );

  const stack: Array<{ row: number; col: number }> = [start];
  const visited = new Set<string>();
  visited.add(coordKey(start.row, start.col));

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;
    const sol = solution[row][col];

    if (sol === 'mine' || sol === 'disabled') continue;

    grid[row][col] = sol;

    if (sol === 0) {
      const neighbors = getOffsetNeighbors(row, col, width, height);
      for (const n of neighbors) {
        const key = coordKey(n.row, n.col);
        if (!visited.has(key)) {
          visited.add(key);
          stack.push(n);
        }
      }
    }
  }

  return grid;
}

// ── Clue generation ──

/** Check if mines among clockwise neighbors form a contiguous arc */
function checkCircularContiguity(
  neighbors: ({ row: number; col: number } | null)[],
  solution: HexMineGrid,
): 'contiguous' | 'nonContiguous' | 'none' {
  const ring = neighbors.map((n) =>
    n !== null && solution[n.row][n.col] === 'mine',
  );
  const mineCount = ring.filter((v) => v).length;
  if (mineCount <= 1) return 'none'; // trivial — no useful info

  // Check contiguity
  const firstFalse = ring.indexOf(false);
  if (firstFalse === -1) return 'none'; // all mines — trivial
  let groups = 0;
  let inGroup = false;
  for (let i = 0; i < ring.length; i++) {
    const idx = (firstFalse + i) % ring.length;
    if (ring[idx] && !inGroup) { groups++; inGroup = true; }
    if (!ring[idx]) inGroup = false;
  }

  return groups <= 1 ? 'contiguous' : 'nonContiguous';
}

/** Generate adjacent clues with contiguous/nonContiguous annotations */
function generateAdjacentClues(
  solution: HexMineGrid,
  width: number,
  height: number,
  ratio: number,
): HexMineExplicitClue[] {
  const candidates: HexMineExplicitClue[] = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell = solution[r][c];
      if (typeof cell !== 'number' || cell < 2) continue; // need 2+ mines for contiguity to matter

      const cwNeighbors = getNeighborsClockwise(r, c, width, height);
      // Only use cells with all 6 neighbors for correct circular contiguity
      if (cwNeighbors.some((n) => n === null)) continue;

      const special = checkCircularContiguity(cwNeighbors, solution);
      if (special === 'none') continue;

      const cellKeys = (cwNeighbors as { row: number; col: number }[])
        .map((n) => coordKey(n.row, n.col));

      candidates.push({
        id: `adj-${r},${c}`,
        type: 'adjacent',
        cellKeys,
        mineCount: cell,
        special,
        displayKey: coordKey(r, c),
      });
    }
  }

  shuffle(candidates);
  return candidates.slice(0, Math.max(1, Math.floor(candidates.length * ratio)));
}

/** Generate line clues on edge cells */
function generateLineClues(
  solution: HexMineGrid,
  width: number,
  height: number,
  count: number,
  shape: boolean[][],
): HexMineExplicitClue[] {
  const candidates: Array<{
    row: number;
    col: number;
    dir: number;
    cells: Array<{ row: number; col: number }>;
    mineCount: number;
    special: ClueSpecial;
  }> = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 'mine') continue;
      if (!shape[r][c]) continue;

      // Check if this is an edge cell (fewer than 6 neighbors)
      const neighbors = getOffsetNeighbors(r, c, width, height);
      if (neighbors.length >= 6) continue; // not an edge cell

      for (let dir = 0; dir < 6; dir++) {
        const lineCells = getLineCells(r, c, dir, width, height);
        if (lineCells.length < 2) continue; // need meaningful line

        // Count mines along the line (excluding origin)
        let mines = 0;
        const mineFlags: boolean[] = [];
        for (const lc of lineCells) {
          const isMine = solution[lc.row][lc.col] === 'mine';
          if (isMine) mines++;
          mineFlags.push(isMine);
        }

        if (mines === 0) continue; // boring clue

        // Determine contiguity
        let special: ClueSpecial = 'none';
        if (mines >= 2 && mines < lineCells.length) {
          let inGroup = false;
          let groups = 0;
          for (const f of mineFlags) {
            if (f && !inGroup) { groups++; inGroup = true; }
            if (!f) inGroup = false;
          }
          special = groups <= 1 ? 'contiguous' : 'nonContiguous';
        }

        candidates.push({ row: r, col: c, dir, cells: lineCells, mineCount: mines, special });
      }
    }
  }

  shuffle(candidates);

  // Pick non-conflicting line clues (different origin cells)
  const usedOrigins = new Set<string>();
  const result: HexMineExplicitClue[] = [];

  for (const cand of candidates) {
    if (result.length >= count) break;
    const key = coordKey(cand.row, cand.col);
    if (usedOrigins.has(key)) continue;
    usedOrigins.add(key);

    // Disable origin in shape and solution
    shape[cand.row][cand.col] = false;
    solution[cand.row][cand.col] = 'disabled';

    result.push({
      id: `line-${cand.row},${cand.col}-d${cand.dir}`,
      type: 'line',
      cellKeys: cand.cells.map((lc) => coordKey(lc.row, lc.col)),
      mineCount: cand.mineCount,
      special: cand.special,
      displayKey: key,
      direction: cand.dir,
    });
  }

  return result;
}

/** Generate range clues on interior cells */
function generateRangeClues(
  solution: HexMineGrid,
  width: number,
  height: number,
  count: number,
  existingClueKeys: Set<string>,
): HexMineExplicitClue[] {
  const candidates: Array<{ row: number; col: number; mineCount: number; cellKeys: string[] }> = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 'mine' || solution[r][c] === 'disabled') continue;
      if (existingClueKeys.has(coordKey(r, c))) continue;

      // Prefer interior cells (full 6 neighbors)
      const neighbors = getOffsetNeighbors(r, c, width, height);
      if (neighbors.length < 6) continue;

      const rangeCells = getCellsInRange(r, c, 2, width, height);
      let mines = 0;
      for (const rc of rangeCells) {
        if (solution[rc.row][rc.col] === 'mine') mines++;
      }

      if (mines === 0) continue;

      candidates.push({
        row: r,
        col: c,
        mineCount: mines,
        cellKeys: rangeCells.map((rc) => coordKey(rc.row, rc.col)),
      });
    }
  }

  shuffle(candidates);

  return candidates.slice(0, count).map((cand) => ({
    id: `range-${cand.row},${cand.col}`,
    type: 'range' as const,
    cellKeys: cand.cellKeys,
    mineCount: cand.mineCount,
    special: 'none' as const,
    displayKey: coordKey(cand.row, cand.col),
  }));
}

/** Generate question mark cells (cells that show ? instead of their number) */
function generateQuestionMarks(
  solution: HexMineGrid,
  width: number,
  height: number,
  count: number,
  existingClueKeys: Set<string>,
): Set<string> {
  const candidates: string[] = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sol = solution[r][c];
      // Only non-mine, non-disabled cells with count > 0 can become ?
      if (typeof sol !== 'number' || sol === 0) continue;
      const key = coordKey(r, c);
      if (existingClueKeys.has(key)) continue;
      candidates.push(key);
    }
  }

  shuffle(candidates);
  return new Set(candidates.slice(0, Math.min(count, candidates.length)));
}

/** Generate edge header clues (mine counts along rows/diagonals at grid border) */
function generateEdgeHeaders(
  solution: HexMineGrid,
  width: number,
  height: number,
  count: number,
): HexMineExplicitClue[] {
  const candidates: HexMineExplicitClue[] = [];

  // Row headers (left edge) — count mines in each row
  for (let r = 0; r < height; r++) {
    const cellKeys: string[] = [];
    let mines = 0;
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 'disabled') continue;
      cellKeys.push(coordKey(r, c));
      if (solution[r][c] === 'mine') mines++;
    }
    if (mines > 0 && cellKeys.length > 0) {
      // Store row index — pixel position computed at render time
      candidates.push({
        id: `edge-row-${r}`,
        type: 'edge-header',
        cellKeys,
        mineCount: mines,
        special: 'none',
        displayKey: `edge-row-${r}`,
        edgePosition: { x: -1, y: r }, // x=-1 means "left edge", y=row index
      });
    }
  }

  // Diagonal headers (top edge) — count mines along NW-SE diagonals (constant q in axial)
  for (let c = 0; c < width; c++) {
    const cellKeys: string[] = [];
    let mines = 0;
    // Follow the column down through all rows
    for (let r = 0; r < height; r++) {
      if (solution[r][c] === 'disabled') continue;
      cellKeys.push(coordKey(r, c));
      if (solution[r][c] === 'mine') mines++;
    }
    if (mines > 0 && cellKeys.length > 0) {
      // Store col index — pixel position computed at render time
      candidates.push({
        id: `edge-col-${c}`,
        type: 'edge-header',
        cellKeys,
        mineCount: mines,
        special: 'none',
        displayKey: `edge-col-${c}`,
        edgePosition: { x: c, y: -1 }, // y=-1 means "top edge", x=col index
      });
    }
  }

  shuffle(candidates);
  return candidates.slice(0, Math.min(count, candidates.length));
}

// ── Iterative clue pruning (Hexcells-style) ──

/** Count clues by type */
function countByType(clues: HexMineExplicitClue[]): Record<string, number> {
  const counts: Record<string, number> = { adjacent: 0, line: 0, range: 0, 'edge-header': 0 };
  for (const c of clues) counts[c.type] = (counts[c.type] ?? 0) + 1;
  return counts;
}

/**
 * Iteratively remove clues one by one, testing solvability after each removal.
 * Respects minimum counts per type from config.
 * Returns the pruned clue set — every remaining clue is necessary.
 */
function pruneClues(
  allClues: HexMineExplicitClue[],
  cascadedGrid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
  cfg: typeof hexmineClueConfig,
): HexMineExplicitClue[] {
  const kept = [...allClues];
  const minCounts: Record<string, number> = {
    adjacent: cfg.minAdjacentClues,
    line: cfg.minLineClues,
    range: cfg.minRangeClues,
    'edge-header': cfg.minEdgeHeaders,
  };

  // Shuffle removal order for variety
  const indices = Array.from({ length: kept.length }, (_, i) => i);
  shuffle(indices);

  for (const idx of indices) {
    const clue = kept[idx];
    if (!clue) continue; // already removed

    // Check if removing this clue would go below minimum for its type
    const currentCount = countByType(kept.filter(Boolean));
    if ((currentCount[clue.type] ?? 0) <= (minCounts[clue.type] ?? 0)) {
      continue; // can't remove — at minimum
    }

    // Try removing
    const without = kept.filter((_, i) => i !== idx && _ !== null);
    const withoutForSolver = without.length > 0 ? without : undefined;

    if (solveFromRevealed(cascadedGrid, solution, width, height, withoutForSolver)) {
      // Still solvable without this clue — remove it permanently
      kept[idx] = null as unknown as HexMineExplicitClue;
    }
    // Otherwise: clue is necessary, keep it
  }

  return kept.filter(Boolean);
}

// ── Main generation ──

export function generateHexMine(
  _requestedWidth: number,
  _requestedHeight: number,
  difficulty: Difficulty,
): PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell> {
  const seed = hexmineClueConfig.seed;
  rng = seed !== null ? createSeededRandom(seed) : Math.random;
  const config = DIFFICULTY_CONFIG[difficulty];
  const { width, height, mineDensity } = config;
  const totalCells = width * height;
  const mineCount = Math.round(totalCells * mineDensity);
  const cfg = hexmineClueConfig;

  let lastSolution: HexMineGrid | null = null;
  let lastClues: HexMineExplicitClue[] | null = null;
  let lastShape: GridShape | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const startRow = Math.floor(rng() * height);
    const startCol = Math.floor(rng() * width);

    const safeZone = new Set<string>();
    safeZone.add(coordKey(startRow, startCol));
    for (const n of getOffsetNeighbors(startRow, startCol, width, height)) {
      safeZone.add(coordKey(n.row, n.col));
    }

    const solution = createSolution(width, height, mineCount, safeZone);
    const shape: GridShape = Array.from({ length: height }, () => Array(width).fill(true));

    // ── Phase 1: Generate ALL possible clues ──
    const allClues: HexMineExplicitClue[] = [];

    // All eligible adjacent clues (interior cells with 2+ mine neighbors)
    if (cfg.minAdjacentClues > 0 && difficulty !== 'easy') {
      const adjClues = generateAdjacentClues(solution, width, height, 1.0); // 100% — take all
      allClues.push(...adjClues);
    }

    // All possible line clues on edge cells
    if (cfg.minLineClues > 0 && difficulty !== 'easy') {
      const maxLines = Math.max(cfg.minLineClues * 3, 8); // generate more than needed
      const lineClues = generateLineClues(solution, width, height, maxLines, shape);
      allClues.push(...lineClues);
    }

    // All possible range clues on interior cells
    if (cfg.minRangeClues > 0 && difficulty !== 'easy') {
      const existingKeys = new Set(allClues.map((c) => c.displayKey));
      const maxRange = Math.max(cfg.minRangeClues * 3, 6);
      const rangeClues = generateRangeClues(solution, width, height, maxRange, existingKeys);
      allClues.push(...rangeClues);
    }

    // All possible edge headers
    if (cfg.minEdgeHeaders > 0 && difficulty !== 'easy') {
      const maxHeaders = Math.max(cfg.minEdgeHeaders * 3, 10);
      const headers = generateEdgeHeaders(solution, width, height, maxHeaders);
      allClues.push(...headers);
    }

    // Find cascade opening
    const zeroCell = solution[startRow][startCol] === 0
      ? { row: startRow, col: startCol }
      : findZeroCell(solution, width, height);

    if (!zeroCell) continue;

    const cascadedGrid = simulateCascade(solution, zeroCell, width, height);

    // Apply disabled cells
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!shape[r][c]) cascadedGrid[r][c] = 'disabled';
      }
    }

    let revealedCount = 0;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (cascadedGrid[r][c] !== 'hidden' && cascadedGrid[r][c] !== 'disabled') revealedCount++;
      }
    }

    const activeCells = totalCells - allClues.filter((c) => c.type === 'line').length;
    if (revealedCount < activeCells * 0.1) continue;

    // ── Phase 2: Verify solvable with all clues ──
    const allCluesForSolver = allClues.length > 0 ? allClues : undefined;
    if (!solveFromRevealed(cascadedGrid, solution, width, height, allCluesForSolver)) {
      continue; // not solvable even with all clues — bad mine layout
    }

    // ── Phase 3: Iteratively prune clues (Hexcells-style) ──
    const prunedClues = difficulty === 'easy'
      ? [] // easy has no clues
      : pruneClues(allClues, cascadedGrid, solution, width, height, cfg);

    // ── Phase 4: Generate question marks ──
    let questionMarks: Set<string> = new Set();
    if (cfg.minQuestionMarks > 0 && difficulty !== 'easy') {
      const allClueKeys = new Set(prunedClues.map((c) => c.displayKey));
      questionMarks = generateQuestionMarks(solution, width, height, cfg.minQuestionMarks, allClueKeys);
    }

    // ── Phase 5: Build final puzzle ──
    const playerGrid: HexMineGrid = cascadedGrid.map((row) => [...row]);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!shape[r][c]) playerGrid[r][c] = 'disabled';
      }
    }

    const hasDisabled = shape.some((row) => row.some((v) => !v));
    const hasClueData = prunedClues.length > 0 || questionMarks.size > 0;
    const finalClues: HexMineClues = hasClueData
      ? { clues: prunedClues, questionMarks: [...questionMarks] }
      : null;
    const finalShape = hasDisabled ? shape : null;

    // Post-generation integrity check
    const integrityErrors = validatePuzzleIntegrity(
      playerGrid, solution, prunedClues.length > 0 ? prunedClues : null, finalShape, width, height,
    );
    if (integrityErrors.length > 0) {
      console.warn('[HexMine] Integrity errors — retrying:', integrityErrors);
      continue;
    }

    lastSolution = solution;
    lastClues = prunedClues;
    lastShape = shape;

    return {
      grid: playerGrid,
      solution,
      clues: finalClues,
      emptyCell: 'hidden' as HexMineCell,
      width,
      height,
      ...(finalShape ? { shape: finalShape } : {}),
    };
  }

  // Fallback — generate a basic puzzle without clues
  const fbSolution = createSolution(width, height, mineCount, new Set());
  const fbZero = findZeroCell(fbSolution, width, height);
  const fbGrid: HexMineGrid = fbZero
    ? simulateCascade(fbSolution, fbZero, width, height)
    : Array.from({ length: height }, () => Array.from<HexMineCell>({ length: width }).fill('hidden'));

  return {
    grid: fbGrid,
    solution: fbSolution,
    clues: null,
    emptyCell: 'hidden' as HexMineCell,
    width,
    height,
  };
}
