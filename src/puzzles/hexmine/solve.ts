import type { HexMineGrid, HexMineCell, OffsetCoord } from './types';
import { getOffsetNeighbors, coordKey } from './hex';

type CellState = 'unknown' | 'safe' | 'mine';

interface Constraint {
  cells: string[];    // coordKeys of unknown neighbors
  mineCount: number;  // remaining mines among them
}

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

          // Check if ci.cells is a subset of cj.cells
          if (ci.cells.length < cj.cells.length && ci.cells.every((k) => cj.cells.includes(k))) {
            const diff = cj.cells.filter((k) => !ci.cells.includes(k));
            const diffMines = cj.mineCount - ci.mineCount;

            if (diffMines >= 0 && diffMines <= diff.length) {
              const newConstraint: Constraint = { cells: diff, mineCount: diffMines };
              // Only add if not duplicate
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

/**
 * Limited backtracking to find forced deductions.
 * For each unknown cell adjacent to a constraint, try mine/safe
 * and check for contradictions.
 */
function backtrackDeductions(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
  maxProbes: number,
): boolean {
  // Collect frontier unknowns (cells appearing in constraints)
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
    const mineOk = !hasContradiction(cMine, kMine);

    // Try assuming safe
    const kSafe = new Map(knowledge);
    kSafe.set(cellKey, 'safe');
    const cSafe = constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount }));
    propagate(cSafe, kSafe);
    const safeOk = !hasContradiction(cSafe, kSafe);

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

/** Check if any constraint is contradicted */
function hasContradiction(
  constraints: Constraint[],
  knowledge: Map<string, CellState>,
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
  return false;
}

/**
 * Check if a puzzle can be solved from the given grid state without guessing.
 * The grid should have some cells already revealed (from cascade).
 */
export function solveFromRevealed(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
): boolean {
  // Initialize knowledge from current grid state
  const knowledge = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      const cell = grid[r][c];
      if (typeof cell === 'number') {
        knowledge.set(key, 'safe'); // revealed number = known safe
      } else if (cell === 'flagged') {
        knowledge.set(key, 'mine');
      } else {
        knowledge.set(key, 'unknown');
      }
    }
  }

  const MAX_ROUNDS = 20;
  const MAX_PROBES = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Simulate revealing cells we know are safe (they'd cascade-reveal in real play)
    const simGrid = simulateReveals(grid, solution, knowledge, width, height);
    const constraints = buildConstraints(simGrid, width, height, knowledge);

    if (constraints.length === 0) break;

    const propProgress = propagate(constraints, knowledge);

    // Check if done
    let allKnown = true;
    for (const [, state] of knowledge) {
      if (state === 'unknown') { allKnown = false; break; }
    }
    if (allKnown) return true;

    if (!propProgress) {
      // Try backtracking probes
      const btProgress = backtrackDeductions(constraints, knowledge, MAX_PROBES);
      if (!btProgress) return false; // stuck — puzzle requires guessing
    }
  }

  // Check if all cells are determined
  for (const [, state] of knowledge) {
    if (state === 'unknown') return false;
  }
  return true;
}

/**
 * Simulate what the grid would look like if all known-safe cells were revealed.
 * This includes cascade reveals from 0-cells.
 */
function simulateReveals(
  baseGrid: HexMineGrid,
  solution: HexMineGrid,
  knowledge: Map<string, CellState>,
  width: number,
  height: number,
): HexMineGrid {
  const grid: HexMineGrid = baseGrid.map((row) => [...row]);

  // Reveal all known-safe cells
  for (const [key, state] of knowledge) {
    if (state === 'safe') {
      const [rs, cs] = key.split(',').map(Number);
      const sol = solution[rs][cs];
      if (typeof sol === 'number' && grid[rs][cs] === 'hidden') {
        grid[rs][cs] = sol;
      }
    }
  }

  // Cascade from any newly revealed 0-cells
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

/**
 * Find a hint: return the coordinate of a hidden cell that can be logically
 * deduced as safe, or fall back to any hidden non-mine cell.
 */
export function getHexMineHint(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
): OffsetCoord | null {
  // Check if game is lost
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'exploded') return null;
    }
  }

  // Initialize knowledge from grid
  const knowledge = new Map<string, CellState>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const key = coordKey(r, c);
      const cell = grid[r][c];
      if (typeof cell === 'number') {
        knowledge.set(key, 'safe');
      } else if (cell === 'flagged') {
        knowledge.set(key, 'mine');
      } else {
        knowledge.set(key, 'unknown');
      }
    }
  }

  // Run solver
  const constraints = buildConstraints(grid, width, height, knowledge);
  propagate(constraints, knowledge);
  backtrackDeductions(
    constraints.map((c) => ({ cells: [...c.cells], mineCount: c.mineCount })),
    knowledge,
    100,
  );

  // Return first deduced-safe hidden cell
  for (const [key, state] of knowledge) {
    if (state === 'safe') {
      const [r, c] = key.split(',').map(Number);
      if (grid[r][c] === 'hidden') {
        return { row: r, col: c };
      }
    }
  }

  // Fallback: any hidden non-mine cell
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'hidden' && solution[r][c] !== 'mine') {
        return { row: r, col: c };
      }
    }
  }

  return null;
}
