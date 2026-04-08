import type { HexMineGrid, OffsetCoord, HexMineExplicitClue, HexMineClues } from './types';
import { getOffsetNeighbors, coordKey } from './hex';

type CellState = 'unknown' | 'safe' | 'mine';

interface Constraint {
  cells: string[];    // coordKeys of unknown neighbors
  mineCount: number;  // remaining mines among them
}

// ── Contiguity checks (ported from HexMine prototype) ──

/** Linear contiguity: all true values form one unbroken run */
function checkContiguous(assignments: boolean[]): boolean {
  let inGroup = false;
  let groups = 0;
  for (const v of assignments) {
    if (v && !inGroup) { groups++; inGroup = true; }
    if (!v) inGroup = false;
  }
  return groups <= 1;
}

/**
 * Circular contiguity: all true values form one contiguous arc on a ring.
 * null entries (out-of-bounds neighbors) are treated as false.
 * Used for adjacent clues where neighbors wrap around.
 */
function checkContiguousCircular(assignments: (boolean | null)[]): boolean {
  const ring = assignments.map((v) => v === true);
  const n = ring.length;
  const mineCount = ring.filter((v) => v).length;
  if (mineCount <= 1 || mineCount === n) return true;

  // Find first false, then scan ring for group count
  const firstFalse = ring.indexOf(false);
  if (firstFalse === -1) return true; // all true
  let groups = 0;
  let inGroup = false;
  for (let i = 0; i < n; i++) {
    const idx = (firstFalse + i) % n;
    if (ring[idx] && !inGroup) { groups++; inGroup = true; }
    if (!ring[idx]) inGroup = false;
  }
  return groups <= 1;
}

/** Linear non-contiguity: mines are NOT all in one contiguous run */
function checkNonContiguous(assignments: boolean[]): boolean {
  const count = assignments.filter((v) => v).length;
  if (count <= 1 || count === assignments.length) return true;
  return !checkContiguous(assignments);
}

/** Circular non-contiguity: mines are NOT all in one contiguous arc */
function checkNonContiguousCircular(assignments: (boolean | null)[]): boolean {
  const mineCount = assignments.filter((v) => v === true).length;
  if (mineCount <= 1 || mineCount === assignments.length) return true;
  return !checkContiguousCircular(assignments);
}

// ── Constraint building ──

/**
 * Build constraints from revealed cells in the grid.
 * Each revealed number creates a constraint: "N mines among my hidden neighbors".
 */
function buildConstraints(
  grid: HexMineGrid,
  width: number,
  height: number,
  knowledge: Map<string, CellState>,
): Constraint[] {
  const constraints: Constraint[] = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cell = grid[r][c];
      if (typeof cell !== 'number' || cell === 0) continue;

      const neighbors = getOffsetNeighbors(r, c, width, height);
      const unknowns: string[] = [];
      let knownMines = 0;

      for (const n of neighbors) {
        const key = coordKey(n.row, n.col);
        const state = knowledge.get(key);
        if (state === 'mine') {
          knownMines++;
        } else if (state === 'unknown') {
          unknowns.push(key);
        }
      }

      const remaining = cell - knownMines;
      if (unknowns.length > 0 && remaining >= 0 && remaining <= unknowns.length) {
        constraints.push({ cells: unknowns, mineCount: remaining });
      }
    }
  }

  return constraints;
}

/**
 * Build constraints from explicit clues (medium+ difficulty).
 * Each clue creates a constraint from its scope cells.
 */
function buildExplicitConstraints(
  clues: readonly HexMineExplicitClue[],
  knowledge: Map<string, CellState>,
): Constraint[] {
  const constraints: Constraint[] = [];

  for (const clue of clues) {
    const unknowns: string[] = [];
    let knownMines = 0;
    for (const key of clue.cellKeys) {
      const state = knowledge.get(key);
      if (state === 'mine') knownMines++;
      else if (state === 'unknown') unknowns.push(key);
    }
    const remaining = clue.mineCount - knownMines;
    if (unknowns.length > 0 && remaining >= 0 && remaining <= unknowns.length) {
      constraints.push({ cells: unknowns, mineCount: remaining });
    }
  }

  return constraints;
}

/**
 * Check special conditions (contiguous/nonContiguous) on explicit clues.
 * Returns true if any constraint is violated (contradiction found).
 * Only checks when all variables in a clue are assigned.
 */
function checkSpecialConditions(
  clues: readonly HexMineExplicitClue[],
  knowledge: Map<string, CellState>,
): boolean {
  for (const clue of clues) {
    if (clue.special === 'none') continue;

    // Only check when all variables are assigned
    const allAssigned = clue.cellKeys.every((k) => knowledge.get(k) !== 'unknown');
    if (!allAssigned) continue;

    if (clue.type === 'adjacent') {
      // Circular check for adjacent clues (ring of 6 neighbors)
      const assignments = clue.cellKeys.map((k) => {
        const s = knowledge.get(k);
        return s === 'mine' ? true : s === 'safe' ? false : null;
      });
      if (clue.special === 'contiguous' && !checkContiguousCircular(assignments)) return true;
      if (clue.special === 'nonContiguous' && !checkNonContiguousCircular(assignments)) return true;
    } else {
      // Linear check for line/range clues
      const assignments = clue.cellKeys.map((k) => knowledge.get(k) === 'mine');
      if (clue.special === 'contiguous' && !checkContiguous(assignments)) return true;
      if (clue.special === 'nonContiguous' && !checkNonContiguous(assignments)) return true;
    }
  }
  return false;
}

// ── Propagation ──

/**
 * Constraint propagation: deduce forced safe/mine cells.
 * Returns true if any new deductions were made.
 */
function propagate(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
): boolean {
  let progress = true;
  let anyChange = false;

  while (progress) {
    progress = false;

    for (let i = constraints.length - 1; i >= 0; i--) {
      const c = constraints[i];

      // Remove known cells from constraint
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

      // All unknowns are mines
      if (remaining === unknowns.length && unknowns.length > 0) {
        for (const key of unknowns) {
          knowledge.set(key, 'mine');
        }
        constraints.splice(i, 1);
        progress = true;
        anyChange = true;
        continue;
      }

      // All unknowns are safe
      if (remaining === 0 && unknowns.length > 0) {
        for (const key of unknowns) {
          knowledge.set(key, 'safe');
        }
        constraints.splice(i, 1);
        progress = true;
        anyChange = true;
        continue;
      }

      // Constraint fully resolved
      if (unknowns.length === 0) {
        constraints.splice(i, 1);
        continue;
      }

      // Contradiction
      if (remaining < 0 || remaining > unknowns.length) {
        return anyChange;
      }
    }

    // Subset elimination between constraint pairs
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
              const newConstraint: Constraint = { cells: diff, mineCount: diffMines };
              const exists = constraints.some(
                (c) => c.cells.length === diff.length &&
                  c.mineCount === diffMines &&
                  c.cells.every((k) => diff.includes(k)),
              );
              if (!exists) {
                constraints.push(newConstraint);
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

// ── Backtracking ──

/** Check if any constraint is contradicted */
function hasContradiction(
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
  // Also check special conditions on explicit clues
  if (clues && checkSpecialConditions(clues, knowledge)) return true;
  return false;
}

/**
 * Limited backtracking to find forced deductions.
 */
function backtrackDeductions(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
  maxProbes: number,
  clues?: readonly HexMineExplicitClue[],
): boolean {
  const frontier = new Set<string>();
  for (const c of constraints) {
    for (const key of c.cells) {
      if (knowledge.get(key) === 'unknown') {
        frontier.add(key);
      }
    }
  }

  let anyChange = false;
  let probes = 0;

  for (const cellKey of frontier) {
    if (probes >= maxProbes) break;
    if (knowledge.get(cellKey) !== 'unknown') continue;

    probes++;

    // Try assuming mine
    const kMine = new Map(knowledge);
    kMine.set(cellKey, 'mine');
    const cMine = constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount }));
    propagate(cMine, kMine);
    const mineOk = !hasContradiction(cMine, kMine, clues);

    // Try assuming safe
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

// ── Simulation ──

/**
 * Simulate what the grid would look like if all known-safe cells were revealed.
 */
function simulateReveals(
  baseGrid: HexMineGrid,
  solution: HexMineGrid,
  knowledge: Map<string, CellState>,
  width: number,
  height: number,
): HexMineGrid {
  const grid: HexMineGrid = baseGrid.map((row) => [...row]);

  for (const [key, state] of knowledge) {
    if (state === 'safe') {
      const [rs, cs] = key.split(',').map(Number);
      const sol = solution[rs][cs];
      if (typeof sol === 'number' && grid[rs][cs] === 'hidden') {
        grid[rs][cs] = sol;
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (grid[r][c] !== 0) continue;
        const neighbors = getOffsetNeighbors(r, c, width, height);
        for (const n of neighbors) {
          if (grid[n.row][n.col] === 'hidden') {
            const sol = solution[n.row][n.col];
            if (typeof sol === 'number') {
              grid[n.row][n.col] = sol;
              knowledge.set(coordKey(n.row, n.col), 'safe');
              changed = true;
            }
          }
        }
      }
    }
  }

  return grid;
}

// ── Public API ──

/**
 * Check if a puzzle can be solved from the given grid state without guessing.
 * Accepts optional explicit clues for medium+ difficulty.
 */
export function solveFromRevealed(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
  clues?: HexMineClues | readonly HexMineExplicitClue[],
): boolean {
  const knowledge = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      const cell = grid[r][c];
      if (typeof cell === 'number') {
        knowledge.set(key, 'safe');
      } else if (cell === 'flagged') {
        knowledge.set(key, 'mine');
      } else if (cell === 'disabled') {
        // Line-origin cells are known (not unknown)
        continue;
      } else {
        knowledge.set(key, 'unknown');
      }
    }
  }

  const explicitClues: readonly HexMineExplicitClue[] = clues
    ? (Array.isArray(clues) ? clues : (clues as { clues: readonly HexMineExplicitClue[] }).clues)
    : [];
  const MAX_ROUNDS = 20;
  const MAX_PROBES = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const simGrid = simulateReveals(grid, solution, knowledge, width, height);
    const constraints = buildConstraints(simGrid, width, height, knowledge);

    // Add explicit clue constraints
    if (explicitClues.length > 0) {
      constraints.push(...buildExplicitConstraints(explicitClues, knowledge));
    }

    if (constraints.length === 0) break;

    const propProgress = propagate(constraints, knowledge);

    let allKnown = true;
    for (const [, state] of knowledge) {
      if (state === 'unknown') { allKnown = false; break; }
    }
    if (allKnown) return true;

    if (!propProgress) {
      const btProgress = backtrackDeductions(constraints, knowledge, MAX_PROBES, explicitClues.length > 0 ? explicitClues : undefined);
      if (!btProgress) return false;
    }
  }

  for (const [, state] of knowledge) {
    if (state === 'unknown') return false;
  }
  return true;
}

/**
 * Find a hint: return the coordinate of a hidden cell that can be logically
 * deduced as safe, or fall back to any hidden non-mine cell.
 */
export function getHexMineHint(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
  clues?: HexMineClues | readonly HexMineExplicitClue[],
): OffsetCoord | null {
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'exploded') return null;
    }
  }

  const knowledge = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      const cell = grid[r][c];
      if (typeof cell === 'number') {
        knowledge.set(key, 'safe');
      } else if (cell === 'flagged') {
        knowledge.set(key, 'mine');
      } else if (cell === 'disabled') {
        continue;
      } else {
        knowledge.set(key, 'unknown');
      }
    }
  }

  const explicitClues: readonly HexMineExplicitClue[] = clues
    ? (Array.isArray(clues) ? clues : (clues as { clues: readonly HexMineExplicitClue[] }).clues)
    : [];
  const constraints = buildConstraints(grid, width, height, knowledge);
  if (explicitClues.length > 0) {
    constraints.push(...buildExplicitConstraints(explicitClues, knowledge));
  }
  propagate(constraints, knowledge);
  backtrackDeductions(
    constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount })),
    knowledge,
    100,
    explicitClues.length > 0 ? explicitClues : undefined,
  );

  for (const [key, state] of knowledge) {
    if (state === 'safe') {
      const [r, c] = key.split(',').map(Number);
      if (grid[r][c] === 'hidden') {
        return { row: r, col: c };
      }
    }
  }

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'hidden' && solution[r][c] !== 'mine') {
        return { row: r, col: c };
      }
    }
  }

  return null;
}
