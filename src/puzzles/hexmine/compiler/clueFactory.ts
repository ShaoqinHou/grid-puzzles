import type { HexMineGrid, HexMineExplicitClue, ClueSpecial } from '../types';
import type { CellState } from '../solver/types';
import {
  getOffsetNeighbors, getNeighborsClockwise, getLineCells,
  getCellsInRange, coordKey, offsetToAxial, axialToPixel,
} from '../hex';

/**
 * Find a cell on the frontier (unknown cells adjacent to revealed/safe cells).
 * Returns null if no frontier cell exists.
 */
export function findFrontierCell(
  assignments: Map<string, CellState>,
  width: number,
  height: number,
  rng: () => number,
  preferMine?: boolean,
): { row: number; col: number } | null {
  const frontier: Array<{ row: number; col: number }> = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (assignments.get(coordKey(r, c)) !== 'unknown') continue;
      // Check if any neighbor is safe (revealed)
      const neighbors = getOffsetNeighbors(r, c, width, height);
      const hasRevealedNeighbor = neighbors.some(
        (n) => assignments.get(coordKey(n.row, n.col)) === 'safe',
      );
      if (hasRevealedNeighbor) frontier.push({ row: r, col: c });
    }
  }

  if (frontier.length === 0) return null;

  // Shuffle and return random frontier cell
  const idx = Math.floor(rng() * frontier.length);
  return frontier[idx];
}

/**
 * Find or create an adjacent clue covering the target.
 */
export function findAdjacentClue(
  target: { row: number; col: number },
  special: ClueSpecial | undefined,
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  width: number,
  height: number,
  rng: () => number,
): HexMineExplicitClue | null {
  const targetKey = coordKey(target.row, target.col);
  const neighbors = getOffsetNeighbors(target.row, target.col, width, height);

  // Find safe cells that neighbor the target
  const candidates: Array<{ row: number; col: number }> = [];
  for (const n of neighbors) {
    if (assignments.get(coordKey(n.row, n.col)) === 'safe') {
      candidates.push(n);
    }
  }

  if (candidates.length === 0) return null;

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const chosen of candidates) {
    const cwNeighbors = getNeighborsClockwise(chosen.row, chosen.col, width, height);

    // For special conditions, need all 6 neighbors (interior cell)
    if (special && special !== 'none' && cwNeighbors.some((n) => n === null)) continue;

    const cellKeys = cwNeighbors
      .filter((n): n is { row: number; col: number } => n !== null)
      .map((n) => coordKey(n.row, n.col));

    const mineCount = cellKeys.reduce((count, key) => {
      const [r, c] = key.split(',').map(Number);
      return count + (solution[r]?.[c] === 'mine' ? 1 : 0);
    }, 0);

    return {
      id: `comp-adj-${chosen.row},${chosen.col}`,
      type: 'adjacent',
      cellKeys,
      mineCount,
      special: special ?? 'none',
      displayKey: coordKey(chosen.row, chosen.col),
    };
  }

  return null;
}

/**
 * Find or create a line clue whose ray passes through the target.
 */
export function findLineClue(
  target: { row: number; col: number },
  special: ClueSpecial | undefined,
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  shape: boolean[][],
  width: number,
  height: number,
  rng: () => number,
): HexMineExplicitClue | null {
  const targetKey = coordKey(target.row, target.col);

  // Try each edge cell × direction combination
  const candidates: Array<{
    origin: { row: number; col: number };
    dir: number;
    cells: Array<{ row: number; col: number }>;
    mineCount: number;
  }> = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      // Must be an edge cell (fewer than 6 neighbors)
      const nbrs = getOffsetNeighbors(r, c, width, height);
      if (nbrs.length >= 6) continue;
      // Must not be a mine or already disabled
      if (solution[r][c] === 'mine' || !shape[r][c]) continue;
      if (assignments.get(coordKey(r, c)) === 'mine') continue;

      for (let dir = 0; dir < 6; dir++) {
        const lineCells = getLineCells(r, c, dir, width, height);
        if (lineCells.length < 2) continue;

        // Check if target is on this ray
        const targetOnRay = lineCells.some((lc) => lc.row === target.row && lc.col === target.col);
        if (!targetOnRay) continue;

        let mines = 0;
        for (const lc of lineCells) {
          if (solution[lc.row]?.[lc.col] === 'mine' || assignments.get(coordKey(lc.row, lc.col)) === 'mine') {
            mines++;
          }
        }

        candidates.push({ origin: { row: r, col: c }, dir, cells: lineCells, mineCount: mines });
      }
    }
  }

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(rng() * candidates.length)];

  // Disable origin cell
  shape[chosen.origin.row][chosen.origin.col] = false;
  solution[chosen.origin.row][chosen.origin.col] = 'disabled';
  assignments.set(coordKey(chosen.origin.row, chosen.origin.col), 'safe'); // known, not a mine

  return {
    id: `comp-line-${chosen.origin.row},${chosen.origin.col}-d${chosen.dir}`,
    type: 'line',
    cellKeys: chosen.cells.map((lc) => coordKey(lc.row, lc.col)),
    mineCount: chosen.mineCount,
    special: special ?? 'none',
    displayKey: coordKey(chosen.origin.row, chosen.origin.col),
    direction: chosen.dir,
  };
}

/**
 * Find or create a range clue whose radius-2 area includes the target.
 */
export function findRangeClue(
  target: { row: number; col: number },
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  width: number,
  height: number,
  rng: () => number,
): HexMineExplicitClue | null {
  // Find interior cells whose radius-2 covers the target
  const candidates: Array<{ row: number; col: number }> = [];

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] === 'mine' || solution[r][c] === 'disabled') continue;
      const cellState = assignments.get(coordKey(r, c));
      if (cellState === 'mine') continue;
      // Allow safe or unknown cells as range clue displays
      const nbrs = getOffsetNeighbors(r, c, width, height);
      if (nbrs.length < 5) continue; // need most neighbors for meaningful range

      const rangeCells = getCellsInRange(r, c, 2, width, height);
      const coversTarget = rangeCells.some((rc) => rc.row === target.row && rc.col === target.col);
      if (!coversTarget) continue;

      candidates.push({ row: r, col: c });
    }
  }

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(rng() * candidates.length)];
  const rangeCells = getCellsInRange(chosen.row, chosen.col, 2, width, height);

  let mines = 0;
  for (const rc of rangeCells) {
    if (solution[rc.row]?.[rc.col] === 'mine' || assignments.get(coordKey(rc.row, rc.col)) === 'mine') {
      mines++;
    }
  }

  return {
    id: `comp-range-${chosen.row},${chosen.col}`,
    type: 'range',
    cellKeys: rangeCells.map((rc) => coordKey(rc.row, rc.col)),
    mineCount: mines,
    special: 'none',
    displayKey: coordKey(chosen.row, chosen.col),
  };
}

/**
 * Find or create an edge header clue for a row/col containing the target.
 */
export function findEdgeHeaderClue(
  target: { row: number; col: number },
  solution: HexMineGrid,
  assignments: Map<string, CellState>,
  width: number,
  height: number,
  rng: () => number,
): HexMineExplicitClue | null {
  // Try row header or column header
  const options: HexMineExplicitClue[] = [];

  // Row header
  const rowKeys: string[] = [];
  let rowMines = 0;
  for (let c = 0; c < width; c++) {
    if (solution[target.row][c] === 'disabled') continue;
    rowKeys.push(coordKey(target.row, c));
    if (solution[target.row][c] === 'mine' || assignments.get(coordKey(target.row, c)) === 'mine') {
      rowMines++;
    }
  }
  if (rowMines > 0) {
    options.push({
      id: `comp-edge-row-${target.row}`,
      type: 'edge-header',
      cellKeys: rowKeys,
      mineCount: rowMines,
      special: 'none',
      displayKey: `edge-row-${target.row}`,
      edgePosition: { x: -1, y: target.row },
    });
  }

  // Column header
  const colKeys: string[] = [];
  let colMines = 0;
  for (let r = 0; r < height; r++) {
    if (solution[r][target.col] === 'disabled') continue;
    colKeys.push(coordKey(r, target.col));
    if (solution[r][target.col] === 'mine' || assignments.get(coordKey(r, target.col)) === 'mine') {
      colMines++;
    }
  }
  if (colMines > 0) {
    options.push({
      id: `comp-edge-col-${target.col}`,
      type: 'edge-header',
      cellKeys: colKeys,
      mineCount: colMines,
      special: 'none',
      displayKey: `edge-col-${target.col}`,
      edgePosition: { x: target.col, y: -1 },
    });
  }

  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)];
}
