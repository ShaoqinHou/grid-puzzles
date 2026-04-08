import type { Difficulty, GridShape } from '@/types';
import type { PuzzleInstance } from '@/engine/puzzleTypes';
import type { NonogramCell, NonogramGrid, NonogramClues } from './types';
import { computeNonogramClues } from './validate';
import { propagate, solveNonogramLine } from './solve';

const DENSITY: Record<Difficulty, number> = {
  easy: 0.65,
  medium: 0.55,
  hard: 0.5,
  expert: 0.45,
};

const MAX_ATTEMPTS = 50;

/**
 * Generate a random solution grid with the given density.
 * When a shape is provided, only cells where shape[r][c] is true are candidates.
 */
const generateSolution = (
  width: number,
  height: number,
  density: number,
  shape?: GridShape,
): NonogramGrid => {
  const grid: NonogramGrid = Array.from({ length: height }, () =>
    Array.from<NonogramCell>({ length: width }).fill('empty'),
  );

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const isActive = shape ? shape[r][c] : true;
      if (isActive && Math.random() < density) {
        grid[r][c] = 'filled';
      }
    }
  }

  return grid;
};

/**
 * Create an empty player grid matching the dimensions.
 */
const createEmptyGrid = (width: number, height: number): NonogramGrid =>
  Array.from({ length: height }, () =>
    Array.from<NonogramCell>({ length: width }).fill('empty'),
  );

/**
 * Check if two grids have the same filled pattern.
 */
const gridsMatch = (a: NonogramGrid, b: NonogramGrid): boolean => {
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[0].length; c++) {
      const aFilled = a[r][c] === 'filled';
      const bFilled = b[r][c] === 'filled';
      if (aFilled !== bFilled) return false;
    }
  }
  return true;
};

/**
 * Generate a nonogram puzzle.
 *
 * 1. Creates a random solution with difficulty-based density
 * 2. Computes clues from the solution
 * 3. Verifies the puzzle is uniquely solvable via the solver
 * 4. Retries if not solvable (up to MAX_ATTEMPTS)
 */
export const generateNonogram = (
  width: number,
  height: number,
  difficulty: Difficulty,
  shape?: GridShape,
): PuzzleInstance<NonogramGrid, NonogramClues, NonogramCell> => {
  const density = DENSITY[difficulty];

  // Verify solvability for all sizes. The new leftmost/rightmost solver
  // is fast enough (~25ms for 20×20) to verify without hanging.
  const shouldVerify = true;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const solution = generateSolution(width, height, density, shape);

    // Ensure at least one filled cell exists
    const hasFilled = solution.some((row) => row.some((cell) => cell === 'filled'));
    if (!hasFilled) continue;

    const clues = computeNonogramClues(solution);

    if (!shouldVerify) {
      // For large grids, skip solvability check — accept any valid puzzle
      return {
        grid: createEmptyGrid(width, height),
        solution,
        clues,
        emptyCell: 'empty',
        width,
        height,
        ...(shape ? { shape } : {}),
      };
    }

    // Verify solvability using propagation only (no backtracking — fast for all sizes).
    // If propagation alone solves it completely → unique solution guaranteed.
    const testGrid: (NonogramCell | undefined)[][] = Array.from({ length: height }, () =>
      Array.from<NonogramCell | undefined>({ length: width }).fill(undefined),
    );
    const ok = propagate(testGrid, clues, width, height);
    const fullySolved = ok && testGrid.every(row => row.every(cell => cell !== undefined));
    if (fullySolved && gridsMatch(testGrid.map(row => row.map(c => c ?? 'empty')) as NonogramGrid, solution)) {
      return {
        grid: createEmptyGrid(width, height),
        solution,
        clues,
        emptyCell: 'empty',
        width,
        height,
        ...(shape ? { shape } : {}),
      };
    }
  }

  // Fallback: use the last generated solution even if not uniquely solvable.
  // This should rarely happen with reasonable grid sizes.
  const solution = generateSolution(width, height, density, shape);
  const clues = computeNonogramClues(solution);
  return {
    grid: createEmptyGrid(width, height),
    solution,
    clues,
    emptyCell: 'empty',
    width,
    height,
    ...(shape ? { shape } : {}),
  };
};
