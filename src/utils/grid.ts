import type { CellCoord, GridShape } from '@/types';

/** Convert a CellCoord to a stable string key */
export const coordToKey = (coord: CellCoord): string =>
  `${coord.row},${coord.col}`;

/** Parse a string key back into a CellCoord */
export const keyToCoord = (key: string): CellCoord => {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
};

/** Create a 2D grid filled with the given empty cell value */
export const createEmptyGrid = <TCell>(
  width: number,
  height: number,
  emptyCell: TCell,
): TCell[][] =>
  Array.from({ length: height }, () =>
    Array.from({ length: width }, () => emptyCell),
  );

/** Create an all-true shape (fully rectangular grid) */
export const createShape = (width: number, height: number): GridShape =>
  Array.from({ length: height }, () =>
    Array.from({ length: width }, () => true),
  );
