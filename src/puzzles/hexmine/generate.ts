import type { Difficulty } from '@/types';
import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { HexMineCell, HexMineGrid, HexMineClues } from './types';
import { getOffsetNeighbors, coordKey } from './hex';
import { solveFromRevealed } from './solve';

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

/** Randomly shuffle an array in-place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Create the solution grid with mines placed and neighbor counts computed */
function createSolution(
  width: number,
  height: number,
  mineCount: number,
  safeZone: Set<string>,
): HexMineGrid {
  // Collect all valid positions for mines (exclude safe zone)
  const candidates: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!safeZone.has(coordKey(r, c))) {
        candidates.push({ row: r, col: c });
      }
    }
  }

  shuffle(candidates);

  // Place mines
  const mineSet = new Set<string>();
  const actualMines = Math.min(mineCount, candidates.length);
  for (let i = 0; i < actualMines; i++) {
    mineSet.add(coordKey(candidates[i].row, candidates[i].col));
  }

  // Build solution grid with mine counts
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

/** Find a 0-cell (no adjacent mines) to use as the starting cascade point */
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

/**
 * Simulate cascade reveal from a starting cell.
 * Returns a grid with revealed cells showing their numbers.
 */
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

    if (sol === 'mine') continue;

    grid[row][col] = sol;

    // Cascade through 0-cells
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

/** Generate a hex minesweeper puzzle */
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

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Pick a random starting cell
    const startRow = Math.floor(Math.random() * height);
    const startCol = Math.floor(Math.random() * width);

    // Build safe zone: starting cell + its neighbors
    const safeZone = new Set<string>();
    safeZone.add(coordKey(startRow, startCol));
    for (const n of getOffsetNeighbors(startRow, startCol, width, height)) {
      safeZone.add(coordKey(n.row, n.col));
    }

    const solution = createSolution(width, height, mineCount, safeZone);
    lastSolution = solution;

    // The start cell is guaranteed safe and has 0 neighbors (all neighbors safe too)
    // Find a 0-cell for cascade — our start should be one thanks to the safe zone
    const zeroCell = solution[startRow][startCol] === 0
      ? { row: startRow, col: startCol }
      : findZeroCell(solution, width, height);

    if (!zeroCell) continue;

    // Simulate cascade reveal
    const cascadedGrid = simulateCascade(solution, zeroCell, width, height);

    // Check how many cells were revealed by cascade
    let revealedCount = 0;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (cascadedGrid[r][c] !== 'hidden') revealedCount++;
      }
    }

    // Skip if cascade revealed too few cells (puzzle would be boring)
    if (revealedCount < totalCells * 0.15) continue;

    // Check solvability
    if (solveFromRevealed(cascadedGrid, solution, width, height)) {
      return {
        grid: Array.from({ length: height }, () =>
          Array.from<HexMineCell>({ length: width }).fill('hidden'),
        ),
        solution,
        clues: null,
        emptyCell: 'hidden' as HexMineCell,
        width,
        height,
      };
    }
  }

  // Fallback: use last generated solution (may require some guessing)
  const solution = lastSolution ?? createSolution(width, height, mineCount, new Set());

  return {
    grid: Array.from({ length: height }, () =>
      Array.from<HexMineCell>({ length: width }).fill('hidden'),
    ),
    solution,
    clues: null,
    emptyCell: 'hidden' as HexMineCell,
    width,
    height,
  };
}
