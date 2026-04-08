import type { HexMineExplicitClue } from '../types';
import type { CellState } from './types';

/** Linear contiguity: all true values form one unbroken run */
export function checkContiguous(assignments: boolean[]): boolean {
  let inGroup = false;
  let groups = 0;
  for (const v of assignments) {
    if (v && !inGroup) { groups++; inGroup = true; }
    if (!v) inGroup = false;
  }
  return groups <= 1;
}

/** Circular contiguity: all true values form one contiguous arc on a ring */
export function checkContiguousCircular(assignments: (boolean | null)[]): boolean {
  const ring = assignments.map((v) => v === true);
  const n = ring.length;
  const mineCount = ring.filter((v) => v).length;
  if (mineCount <= 1 || mineCount === n) return true;

  const firstFalse = ring.indexOf(false);
  if (firstFalse === -1) return true;
  let groups = 0;
  let inGroup = false;
  for (let i = 0; i < n; i++) {
    const idx = (firstFalse + i) % n;
    if (ring[idx] && !inGroup) { groups++; inGroup = true; }
    if (!ring[idx]) inGroup = false;
  }
  return groups <= 1;
}

/** Linear non-contiguity */
export function checkNonContiguous(assignments: boolean[]): boolean {
  const count = assignments.filter((v) => v).length;
  if (count <= 1 || count === assignments.length) return true;
  return !checkContiguous(assignments);
}

/** Circular non-contiguity */
export function checkNonContiguousCircular(assignments: (boolean | null)[]): boolean {
  const mineCount = assignments.filter((v) => v === true).length;
  if (mineCount <= 1 || mineCount === assignments.length) return true;
  return !checkContiguousCircular(assignments);
}

/** Check special conditions on explicit clues. Returns true if contradiction found. */
export function checkSpecialConditions(
  clues: readonly HexMineExplicitClue[],
  knowledge: Map<string, CellState>,
): boolean {
  for (const clue of clues) {
    if (clue.special === 'none') continue;

    const allAssigned = clue.cellKeys.every((k) => knowledge.get(k) !== 'unknown');
    if (!allAssigned) continue;

    if (clue.type === 'adjacent') {
      const assignments = clue.cellKeys.map((k) => {
        const s = knowledge.get(k);
        return s === 'mine' ? true : s === 'safe' ? false : null;
      });
      if (clue.special === 'contiguous' && !checkContiguousCircular(assignments)) return true;
      if (clue.special === 'nonContiguous' && !checkNonContiguousCircular(assignments)) return true;
    } else {
      const assignments = clue.cellKeys.map((k) => knowledge.get(k) === 'mine');
      if (clue.special === 'contiguous' && !checkContiguous(assignments)) return true;
      if (clue.special === 'nonContiguous' && !checkNonContiguous(assignments)) return true;
    }
  }
  return false;
}
