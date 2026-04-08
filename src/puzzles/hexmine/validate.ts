import type { CellCoord, GridShape } from '@/types';
import type { ValidationResult, CellValidation } from '@/engine/puzzleTypes';
import type { HexMineGrid, HexMineClues, HexMineExplicitClue } from './types';
import { getOffsetNeighbors, coordKey } from './hex';

/** Clues are generated during puzzle creation, not derived from solution */
export function computeHexMineClues(_solution: HexMineGrid): HexMineClues {
  return null;
}

/** Solved when all non-mine cells are revealed with correct numbers */
export function validateHexMineGrid(grid: HexMineGrid, solution: HexMineGrid): ValidationResult {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sol = solution[r][c];
      const cell = grid[r][c];

      // Skip disabled cells (line clue origins)
      if (cell === 'disabled' || sol === 'disabled') continue;

      // If any cell exploded, the game is lost (not solved)
      if (cell === 'exploded') {
        return { solved: false, errors: [{ row: r, col: c }] };
      }

      // Non-mine cells must be revealed (matching solution number)
      if (sol !== 'mine' && cell !== sol) {
        return { solved: false, errors: [] };
      }
    }
  }

  return { solved: true, errors: [] };
}

/** Single cell validation */
export function validateHexMineCell(
  coord: CellCoord,
  grid: HexMineGrid,
  solution: HexMineGrid,
): CellValidation {
  const cell = grid[coord.row][coord.col];
  const sol = solution[coord.row][coord.col];

  // Disabled cells are always correct
  if (cell === 'disabled' || sol === 'disabled') return { correct: true };
  // Revealed number matches solution
  if (typeof cell === 'number') {
    return { correct: cell === sol };
  }
  // Hidden/flagged — not checked yet
  return { correct: true };
}

// ── Post-generation integrity validator ──

interface IntegrityError {
  readonly clueId: string;
  readonly message: string;
}

/**
 * Validate a fully generated puzzle for internal consistency.
 * Checks that all clues, mines, disabled cells, and neighbor counts are correct.
 * Returns an empty array if valid, or a list of errors if not.
 */
export function validatePuzzleIntegrity(
  grid: HexMineGrid,
  solution: HexMineGrid,
  clues: readonly HexMineExplicitClue[] | null,
  shape: GridShape | null,
  width: number,
  height: number,
): IntegrityError[] {
  const errors: IntegrityError[] = [];

  // 1. Validate neighbor counts in solution
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sol = solution[r][c];
      if (typeof sol !== 'number') continue;
      const neighbors = getOffsetNeighbors(r, c, width, height);
      let mineCount = 0;
      for (const n of neighbors) {
        if (solution[n.row][n.col] === 'mine') mineCount++;
      }
      if (mineCount !== sol) {
        errors.push({
          clueId: `cell-${r},${c}`,
          message: `Neighbor count ${sol} but actual mines = ${mineCount}`,
        });
      }
    }
  }

  // 2. Validate explicit clues
  if (clues) {
    for (const clue of clues) {
      // Check cellKeys are in bounds
      for (const key of clue.cellKeys) {
        const [cr, cc] = key.split(',').map(Number);
        if (cr < 0 || cr >= height || cc < 0 || cc >= width) {
          errors.push({ clueId: clue.id, message: `cellKey ${key} out of bounds` });
        }
      }

      // Check mine count matches actual
      let actualMines = 0;
      const mineFlags: boolean[] = [];
      for (const key of clue.cellKeys) {
        const [cr, cc] = key.split(',').map(Number);
        const isMine = solution[cr]?.[cc] === 'mine';
        if (isMine) actualMines++;
        mineFlags.push(isMine);
      }
      if (actualMines !== clue.mineCount) {
        errors.push({
          clueId: clue.id,
          message: `mineCount=${clue.mineCount} but actual=${actualMines}`,
        });
      }

      // Check contiguity label matches actual arrangement
      if (clue.special !== 'none' && mineFlags.filter(Boolean).length >= 2) {
        const isContiguous = checkLinearContiguity(mineFlags);
        // For adjacent clues use circular check, for line/range use linear
        const isCircularContiguous = clue.type === 'adjacent'
          ? checkCircularContiguityBool(mineFlags)
          : isContiguous;
        const actualContiguity = clue.type === 'adjacent' ? isCircularContiguous : isContiguous;

        if (clue.special === 'contiguous' && !actualContiguity) {
          errors.push({ clueId: clue.id, message: 'labeled contiguous but mines are NOT contiguous' });
        }
        if (clue.special === 'nonContiguous' && actualContiguity) {
          errors.push({ clueId: clue.id, message: 'labeled nonContiguous but mines ARE contiguous' });
        }
      }

      // Check line clue origin is disabled
      if (clue.type === 'line') {
        const [dr, dc] = clue.displayKey.split(',').map(Number);
        if (solution[dr]?.[dc] !== 'disabled') {
          errors.push({ clueId: clue.id, message: 'line origin not disabled in solution' });
        }
        if (grid[dr]?.[dc] !== 'disabled') {
          errors.push({ clueId: clue.id, message: 'line origin not disabled in grid' });
        }
        if (shape && shape[dr]?.[dc] !== false) {
          errors.push({ clueId: clue.id, message: 'line origin not marked false in shape' });
        }
      }

      // Range clues must have special=none
      if (clue.type === 'range' && clue.special !== 'none') {
        errors.push({ clueId: clue.id, message: `range clue has special=${clue.special}` });
      }
    }
  }

  // 3. Validate disabled cells in grid match shape
  if (shape) {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (!shape[r][c] && grid[r][c] !== 'disabled') {
          errors.push({
            clueId: `shape-${r},${c}`,
            message: `shape[${r}][${c}]=false but grid is '${grid[r][c]}', not 'disabled'`,
          });
        }
      }
    }
  }

  return errors;
}

/** Linear contiguity: all true values in one unbroken run */
function checkLinearContiguity(flags: boolean[]): boolean {
  let inGroup = false;
  let groups = 0;
  for (const v of flags) {
    if (v && !inGroup) { groups++; inGroup = true; }
    if (!v) inGroup = false;
  }
  return groups <= 1;
}

/** Circular contiguity: all true values form one arc on a ring */
function checkCircularContiguityBool(flags: boolean[]): boolean {
  const n = flags.length;
  const mineCount = flags.filter((v) => v).length;
  if (mineCount <= 1 || mineCount === n) return true;
  const firstFalse = flags.indexOf(false);
  if (firstFalse === -1) return true;
  let groups = 0;
  let inGroup = false;
  for (let i = 0; i < n; i++) {
    const idx = (firstFalse + i) % n;
    if (flags[idx] && !inGroup) { groups++; inGroup = true; }
    if (!flags[idx]) inGroup = false;
  }
  return groups <= 1;
}
