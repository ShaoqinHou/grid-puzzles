/** State of a cell during solving */
export type CellState = 'unknown' | 'safe' | 'mine';

/** A constraint: "mineCount mines among cells" */
export interface Constraint {
  cells: string[];
  mineCount: number;
}
