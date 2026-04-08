import type { Difficulty, GridShape } from '@/types';
import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { HexMineCell, HexMineGrid, HexMineClues, HexMineExplicitClue, ClueSpecial } from './types';
import { getOffsetNeighbors, getNeighborsClockwise, getLineCells, getCellsInRange, coordKey, offsetToAxial, axialToPixel } from './hex';
import { solveFromRevealed } from './solve';
import { validatePuzzleIntegrity } from './validate';

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

/** Configurable settings (mutable, updated by UI before generation) */
export const hexmineClueConfig = {
  // ── Clue types ──
  /** Contiguous/nonContiguous adjacent annotations */
  adjacentClues: true,
  /** Directional line clues on edge cells */
  lineClues: true,
  /** Radius-2 range clues */
  rangeClues: true,
  /** Question mark tiles (revealed cells that show ? instead of number) */
  questionMarks: true,
  /** Edge headers (row/diagonal mine totals at grid border) */
  edgeHeaders: true,
  // ── Gameplay rules ──
  /** Auto-reveal neighbors of 0-cells */
  cascadeReveal: true,
  /** Click revealed number to auto-reveal when flag count matches */
  chordReveal: true,
  /** Flagging a safe cell = instant loss */
  loseOnWrongFlag: true,
  // ── Quantities ──
  adjacentRatio: 0.3,
  lineCountHard: 2,
  lineCountExpert: 4,
  rangeCount: 2,
  questionMarkCount: 3,
  edgeHeaderCount: 4,
};

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
  return candidates[Math.floor(Math.random() * candidates.length)];
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
      // Position: left of the row
      const { q, r: ar } = offsetToAxial(r, 0);
      const pixel = axialToPixel(q, ar, 1); // unit size, scaled later
      candidates.push({
        id: `edge-row-${r}`,
        type: 'edge-header',
        cellKeys,
        mineCount: mines,
        special: 'none',
        displayKey: `edge-row-${r}`,
        edgePosition: { x: -2.5, y: pixel.y },
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
      const { q, r: ar } = offsetToAxial(0, c);
      const pixel = axialToPixel(q, ar, 1);
      candidates.push({
        id: `edge-col-${c}`,
        type: 'edge-header',
        cellKeys,
        mineCount: mines,
        special: 'none',
        displayKey: `edge-col-${c}`,
        edgePosition: { x: pixel.x, y: -2.0 },
      });
    }
  }

  shuffle(candidates);
  return candidates.slice(0, Math.min(count, candidates.length));
}

// ── Main generation ──

export function generateHexMine(
  _requestedWidth: number,
  _requestedHeight: number,
  difficulty: Difficulty,
): PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell> {
  const config = DIFFICULTY_CONFIG[difficulty];
  const { width, height, mineDensity } = config;
  const totalCells = width * height;
  const mineCount = Math.round(totalCells * mineDensity);

  let lastSolution: HexMineGrid | null = null;
  let lastClues: HexMineExplicitClue[] | null = null;
  let lastShape: GridShape | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const startRow = Math.floor(Math.random() * height);
    const startCol = Math.floor(Math.random() * width);

    const safeZone = new Set<string>();
    safeZone.add(coordKey(startRow, startCol));
    for (const n of getOffsetNeighbors(startRow, startCol, width, height)) {
      safeZone.add(coordKey(n.row, n.col));
    }

    const solution = createSolution(width, height, mineCount, safeZone);
    const shape: GridShape = Array.from({ length: height }, () => Array(width).fill(true));

    // Generate difficulty-specific clues (respecting hexmineClueConfig)
    const clues: HexMineExplicitClue[] = [];
    const cfg = hexmineClueConfig;

    if ((difficulty === 'medium' || difficulty === 'hard' || difficulty === 'expert') && cfg.adjacentClues) {
      const adjClues = generateAdjacentClues(solution, width, height, cfg.adjacentRatio);
      clues.push(...adjClues);
    }

    if ((difficulty === 'hard' || difficulty === 'expert') && cfg.lineClues) {
      const lineCount = difficulty === 'expert' ? cfg.lineCountExpert : cfg.lineCountHard;
      const lineClues = generateLineClues(solution, width, height, lineCount, shape);
      clues.push(...lineClues);
    }

    if (difficulty === 'expert' && cfg.rangeClues) {
      const existingKeys = new Set(clues.map((c) => c.displayKey));
      const rangeClues = generateRangeClues(solution, width, height, cfg.rangeCount, existingKeys);
      clues.push(...rangeClues);
    }

    if ((difficulty === 'hard' || difficulty === 'expert') && cfg.edgeHeaders) {
      const headerCount = difficulty === 'expert' ? cfg.edgeHeaderCount : Math.ceil(cfg.edgeHeaderCount / 2);
      const headers = generateEdgeHeaders(solution, width, height, headerCount);
      clues.push(...headers);
    }

    // Generate question mark set (stored separately, not in clues array)
    let questionMarks: Set<string> = new Set();
    if ((difficulty === 'hard' || difficulty === 'expert') && cfg.questionMarks) {
      const allClueKeys = new Set(clues.map((c) => c.displayKey));
      questionMarks = generateQuestionMarks(solution, width, height, cfg.questionMarkCount, allClueKeys);
    }

    lastSolution = solution;
    lastClues = clues;
    lastShape = shape;

    const zeroCell = solution[startRow][startCol] === 0
      ? { row: startRow, col: startCol }
      : findZeroCell(solution, width, height);

    if (!zeroCell) continue;

    const cascadedGrid = simulateCascade(solution, zeroCell, width, height);

    // Apply disabled cells to cascaded grid
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!shape[r][c]) {
          cascadedGrid[r][c] = 'disabled';
        }
      }
    }

    let revealedCount = 0;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (cascadedGrid[r][c] !== 'hidden' && cascadedGrid[r][c] !== 'disabled') revealedCount++;
      }
    }

    const activeCells = totalCells - clues.filter((c) => c.type === 'line').length;
    if (revealedCount < activeCells * 0.15) continue;

    const cluesForSolver = clues.length > 0 ? clues : undefined;
    if (solveFromRevealed(cascadedGrid, solution, width, height, cluesForSolver)) {
      const playerGrid: HexMineGrid = Array.from({ length: height }, () =>
        Array.from<HexMineCell>({ length: width }).fill('hidden'),
      );

      // Mark disabled cells in player grid
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (!shape[r][c]) {
            playerGrid[r][c] = 'disabled';
          }
        }
      }

      const hasDisabled = shape.some((row) => row.some((v) => !v));

      const hasClueData = clues.length > 0 || questionMarks.size > 0;
      const finalClues: HexMineClues = hasClueData
        ? { clues, questionMarks: [...questionMarks] }
        : null;
      const finalShape = hasDisabled ? shape : null;

      // Post-generation integrity check (pass clue array, not wrapper)
      const integrityErrors = validatePuzzleIntegrity(
        playerGrid, solution, clues.length > 0 ? clues : null, finalShape, width, height,
      );
      if (integrityErrors.length > 0) {
        console.warn('[HexMine] Integrity errors — retrying:', integrityErrors);
        continue;
      }

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
  }

  // Fallback
  const solution = lastSolution ?? createSolution(width, height, mineCount, new Set());
  const playerGrid: HexMineGrid = Array.from({ length: height }, () =>
    Array.from<HexMineCell>({ length: width }).fill('hidden'),
  );

  if (lastShape) {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!lastShape[r][c]) {
          playerGrid[r][c] = 'disabled';
        }
      }
    }
  }

  const hasDisabled = lastShape?.some((row) => row.some((v) => !v)) ?? false;

  const hasClueData = (lastClues && lastClues.length > 0);
  return {
    grid: playerGrid,
    solution,
    clues: hasClueData ? { clues: lastClues!, questionMarks: [] } : null,
    emptyCell: 'hidden' as HexMineCell,
    width,
    height,
    ...(hasDisabled && lastShape ? { shape: lastShape } : {}),
  };
}
