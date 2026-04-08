import type { HexMineExplicitClue } from '../types';
import type { CellState, Constraint } from './types';
import { checkSpecialConditions } from './contiguity';

/**
 * Constraint propagation: deduce forced safe/mine cells.
 * Returns true if any new deductions were made.
 */
export function propagate(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
): boolean {
  let progress = true;
  let anyChange = false;

  while (progress) {
    progress = false;

    for (let i = constraints.length - 1; i >= 0; i--) {
      const c = constraints[i];

      const unknowns: string[] = [];
      let knownMines = 0;
      for (const key of c.cells) {
        const state = knowledge.get(key);
        if (state === 'mine') knownMines++;
        else if (state === 'unknown') unknowns.push(key);
      }
      const remaining = c.mineCount - knownMines;
      c.cells = unknowns;
      c.mineCount = remaining;

      if (remaining === unknowns.length && unknowns.length > 0) {
        for (const key of unknowns) knowledge.set(key, 'mine');
        constraints.splice(i, 1);
        progress = true;
        anyChange = true;
        continue;
      }

      if (remaining === 0 && unknowns.length > 0) {
        for (const key of unknowns) knowledge.set(key, 'safe');
        constraints.splice(i, 1);
        progress = true;
        anyChange = true;
        continue;
      }

      if (unknowns.length === 0) {
        constraints.splice(i, 1);
        continue;
      }

      if (remaining < 0 || remaining > unknowns.length) {
        return anyChange;
      }
    }

    // Subset elimination
    if (!progress) {
      for (let i = 0; i < constraints.length; i++) {
        for (let j = 0; j < constraints.length; j++) {
          if (i === j) continue;
          const ci = constraints[i];
          const cj = constraints[j];

          if (ci.cells.length < cj.cells.length && ci.cells.every((k) => cj.cells.includes(k))) {
            const diff = cj.cells.filter((k) => !ci.cells.includes(k));
            const diffMines = cj.mineCount - ci.mineCount;

            if (diffMines >= 0 && diffMines <= diff.length) {
              const exists = constraints.some(
                (c) => c.cells.length === diff.length &&
                  c.mineCount === diffMines &&
                  c.cells.every((k) => diff.includes(k)),
              );
              if (!exists) {
                constraints.push({ cells: diff, mineCount: diffMines });
                progress = true;
                anyChange = true;
              }
            }
          }
        }
      }
    }
  }

  return anyChange;
}

/** Check if any constraint is contradicted */
export function hasContradiction(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
  clues?: readonly HexMineExplicitClue[],
): boolean {
  for (const c of constraints) {
    const unknowns: string[] = [];
    let knownMines = 0;
    for (const key of c.cells) {
      const state = knowledge.get(key);
      if (state === 'mine') knownMines++;
      else if (state === 'unknown') unknowns.push(key);
    }
    const remaining = c.mineCount - knownMines;
    if (remaining < 0 || remaining > unknowns.length) return true;
  }
  if (clues && checkSpecialConditions(clues, knowledge)) return true;
  return false;
}

/**
 * Limited backtracking to find forced deductions.
 */
export function backtrackDeductions(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
  maxProbes: number,
  clues?: readonly HexMineExplicitClue[],
): boolean {
  const frontier = new Set<string>();
  for (const c of constraints) {
    for (const key of c.cells) {
      if (knowledge.get(key) === 'unknown') frontier.add(key);
    }
  }

  let anyChange = false;
  let probes = 0;

  for (const cellKey of frontier) {
    if (probes >= maxProbes) break;
    if (knowledge.get(cellKey) !== 'unknown') continue;

    probes++;

    const kMine = new Map(knowledge);
    kMine.set(cellKey, 'mine');
    const cMine = constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount }));
    propagate(cMine, kMine);
    const mineOk = !hasContradiction(cMine, kMine, clues);

    const kSafe = new Map(knowledge);
    kSafe.set(cellKey, 'safe');
    const cSafe = constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount }));
    propagate(cSafe, kSafe);
    const safeOk = !hasContradiction(cSafe, kSafe, clues);

    if (!mineOk && safeOk) {
      knowledge.set(cellKey, 'safe');
      anyChange = true;
    } else if (mineOk && !safeOk) {
      knowledge.set(cellKey, 'mine');
      anyChange = true;
    }
  }

  return anyChange;
}
