import type { HexMineGrid, HexMineExplicitClue, HexMineClues } from '../types';
import type { CellState, Constraint } from './types';
import { getOffsetNeighbors, coordKey } from '../hex';
import { buildConstraints, buildExplicitConstraints } from './constraints';
import { propagate, backtrackDeductions } from './propagate';
import { simulateReveals } from './simulate';

/** A single deduction event in the solving path */
export interface SolveRecord {
  /** Which cell was determined */
  readonly cellKey: string;
  /** What value it was determined to be */
  readonly value: CellState;
  /** Which solving round this happened in */
  readonly round: number;
  /** Which technique determined it */
  readonly technique: 'propagation' | 'subset-elimination' | 'backtrack-probe';
  /** Number of constraints that were active when this was determined */
  readonly activeConstraints: number;
}

/** Result of solving with recording */
export interface RecordedSolveResult {
  readonly solvable: boolean;
  readonly records: SolveRecord[];
  readonly totalRounds: number;
  readonly cellsRemaining: number;
}

/**
 * Solve a puzzle while recording every deduction step.
 * This instruments the same algorithm as solveFromRevealed but captures
 * which cell was determined at each point and by what technique.
 */
export function solveWithRecording(
  grid: HexMineGrid,
  solution: HexMineGrid,
  width: number,
  height: number,
  clues?: HexMineClues | readonly HexMineExplicitClue[],
): RecordedSolveResult {
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

  const explicitClues: readonly HexMineExplicitClue[] = !clues ? []
    : Array.isArray(clues) ? clues
    : (clues as { clues: readonly HexMineExplicitClue[] }).clues;

  const records: SolveRecord[] = [];
  const MAX_ROUNDS = 20;
  const MAX_PROBES = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const simGrid = simulateReveals(grid, solution, knowledge, width, height);
    const constraints = buildConstraints(simGrid, width, height, knowledge);
    if (explicitClues.length > 0) {
      constraints.push(...buildExplicitConstraints(explicitClues, knowledge));
    }

    if (constraints.length === 0) break;

    // Snapshot before propagation
    const beforeProp = new Map(knowledge);

    const propProgress = propagate(constraints, knowledge);

    // Record propagation deductions
    for (const [key, state] of knowledge) {
      if (state !== 'unknown' && beforeProp.get(key) === 'unknown') {
        records.push({
          cellKey: key,
          value: state,
          round,
          technique: 'propagation',
          activeConstraints: constraints.length,
        });
      }
    }

    let allKnown = true;
    for (const [, state] of knowledge) {
      if (state === 'unknown') { allKnown = false; break; }
    }
    if (allKnown) {
      return { solvable: true, records, totalRounds: round + 1, cellsRemaining: 0 };
    }

    if (!propProgress) {
      const beforeBT = new Map(knowledge);
      const btProgress = backtrackDeductions(constraints, knowledge, MAX_PROBES, explicitClues.length > 0 ? explicitClues : undefined);

      // Record backtracking deductions
      for (const [key, state] of knowledge) {
        if (state !== 'unknown' && beforeBT.get(key) === 'unknown') {
          records.push({
            cellKey: key,
            value: state,
            round,
            technique: 'backtrack-probe',
            activeConstraints: constraints.length,
          });
        }
      }

      if (!btProgress) {
        const remaining = [...knowledge.values()].filter((s) => s === 'unknown').length;
        return { solvable: false, records, totalRounds: round + 1, cellsRemaining: remaining };
      }
    }
  }

  const remaining = [...knowledge.values()].filter((s) => s === 'unknown').length;
  return { solvable: remaining === 0, records, totalRounds: MAX_ROUNDS, cellsRemaining: remaining };
}
