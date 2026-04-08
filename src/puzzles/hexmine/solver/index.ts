export type { CellState, Constraint } from './types';
export { buildConstraints, buildExplicitConstraints } from './constraints';
export { propagate, hasContradiction, backtrackDeductions } from './propagate';
export { simulateReveals, simulateCascade } from './simulate';
export {
  checkContiguous,
  checkContiguousCircular,
  checkNonContiguous,
  checkNonContiguousCircular,
  checkSpecialConditions,
} from './contiguity';
export { solveWithRecording, type SolveRecord, type RecordedSolveResult } from './recorder';
