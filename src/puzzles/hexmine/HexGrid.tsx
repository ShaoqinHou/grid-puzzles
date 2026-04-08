import { useCallback, useMemo, useState } from 'react';
import type { PuzzleDefinition } from '@/engine/puzzleTypes';
import type { CellCoord } from '@/types';
import { useGameState } from '@/engine/GameStateProvider';
import { useGameEvaluation } from '@/engine/GameEvaluatorProvider';
import { usePreferences } from '@/engine/PreferencesProvider';
import type { HexMineGrid, HexMineCell } from './types';
import {
  offsetToAxial,
  axialToPixel,
  getHexVertices,
  verticesToPointsString,
  getOffsetNeighbors,
  coordKey,
} from './hex';
import { HexCellRenderer } from './HexCellRenderer';

interface HexGridProps {
  definition: PuzzleDefinition;
}

/** Check if any cell in the grid is exploded (game lost) */
function isGameLost(grid: HexMineGrid): boolean {
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 'exploded') return true;
    }
  }
  return false;
}

/** Check if all non-mine cells are revealed (game won) */
function isGameWon(grid: HexMineGrid, solution: HexMineGrid): boolean {
  const height = grid.length;
  const width = height > 0 ? grid[0].length : 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (solution[r][c] !== 'mine' && grid[r][c] !== solution[r][c]) {
        return false;
      }
    }
  }
  return true;
}

export function HexGrid({ definition }: HexGridProps) {
  const { state, dispatch } = useGameState();
  const evaluation = useGameEvaluation();
  const { preferences } = usePreferences();
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  const grid = state.grid as HexMineGrid;
  const solution = state.solution as HexMineGrid;
  const { width, height } = state;

  const hexSize = Math.max(14, Math.min(28, preferences.cellSize * 0.9));

  // Pre-compute hex layout: pixel positions + SVG points for each cell
  const layout = useMemo(() => {
    const cells: Array<{
      row: number;
      col: number;
      cx: number;
      cy: number;
      points: string;
      key: string;
    }> = [];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const { q, r: ar } = offsetToAxial(r, c);
        const { x, y } = axialToPixel(q, ar, hexSize);

        const verts = getHexVertices(x, y, hexSize);
        for (const v of verts) {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }

        cells.push({
          row: r,
          col: c,
          cx: x,
          cy: y,
          points: verticesToPointsString(verts),
          key: coordKey(r, c),
        });
      }
    }

    const padding = hexSize;
    return {
      cells,
      viewBox: {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      },
    };
  }, [width, height, hexSize]);

  const gameLost = useMemo(() => isGameLost(grid), [grid]);

  // --- Interaction handlers ---

  /** Compute cascade reveal from a 0-cell using BFS */
  const computeCascade = useCallback(
    (startRow: number, startCol: number): Array<{ coord: CellCoord; value: HexMineCell }> => {
      const additional: Array<{ coord: CellCoord; value: HexMineCell }> = [];
      const visited = new Set<string>();
      visited.add(coordKey(startRow, startCol));
      const stack: Array<{ row: number; col: number }> = [{ row: startRow, col: startCol }];

      while (stack.length > 0) {
        const { row, col } = stack.pop()!;
        const sol = solution[row][col];
        if (sol === 'mine') continue;

        // Only cascade-add neighbors if this is a 0-cell
        if (sol === 0) {
          const neighbors = getOffsetNeighbors(row, col, width, height);
          for (const n of neighbors) {
            const nk = coordKey(n.row, n.col);
            if (!visited.has(nk) && grid[n.row][n.col] === 'hidden') {
              visited.add(nk);
              const nSol = solution[n.row][n.col];
              if (nSol !== 'mine') {
                additional.push({ coord: { row: n.row, col: n.col }, value: nSol });
                if (nSol === 0) {
                  stack.push(n);
                }
              }
            }
          }
        }
      }

      return additional;
    },
    [grid, solution, width, height],
  );

  /** Reveal all mines (on game loss), excluding a specific cell */
  const revealAllMines = useCallback((excludeRow?: number, excludeCol?: number): Array<{ coord: CellCoord; value: HexMineCell }> => {
    const additional: Array<{ coord: CellCoord; value: HexMineCell }> = [];
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (r === excludeRow && c === excludeCol) continue;
        if (solution[r][c] === 'mine' && grid[r][c] !== 'flagged') {
          additional.push({ coord: { row: r, col: c }, value: 'mine' });
        }
      }
    }
    return additional;
  }, [grid, solution, width, height]);

  const handleCellClick = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      if (state.solved || state.paused || gameLost) return;

      const cell = grid[row][col];

      if (e.button === 0) {
        // Left click
        if (cell === 'hidden') {
          // REVEAL
          const sol = solution[row][col];

          if (sol === 'mine') {
            // Hit a mine — game over
            const mines = revealAllMines(row, col);
            dispatch({
              type: 'CELL_INTERACT',
              payload: {
                coord: { row, col },
                interaction: 'primary',
                nextValue: 'exploded',
                additionalCells: mines,
              },
            });
            dispatch({ type: 'PAUSE' });
            return;
          }

          // Safe reveal
          let additional: Array<{ coord: CellCoord; value: unknown }> = [];
          if (sol === 0) {
            additional = computeCascade(row, col);
          }

          // Check if this move wins the game
          const tempGrid = grid.map((r) => [...r]);
          tempGrid[row][col] = sol;
          for (const ac of additional) {
            tempGrid[ac.coord.row][ac.coord.col] = ac.value as HexMineCell;
          }
          const won = isGameWon(tempGrid, solution);

          // Auto-flag remaining mines on win
          if (won) {
            for (let r2 = 0; r2 < height; r2++) {
              for (let c2 = 0; c2 < width; c2++) {
                if (solution[r2][c2] === 'mine' && tempGrid[r2][c2] === 'hidden') {
                  additional.push({ coord: { row: r2, col: c2 }, value: 'flagged' });
                }
              }
            }
          }

          dispatch({
            type: 'CELL_INTERACT',
            payload: {
              coord: { row, col },
              interaction: 'primary',
              nextValue: sol,
              solved: won,
              additionalCells: additional.length > 0 ? additional : undefined,
            },
          });
        } else if (typeof cell === 'number' && cell > 0) {
          // CHORD: click on revealed number
          const neighbors = getOffsetNeighbors(row, col, width, height);
          let flagCount = 0;
          const hiddenNeighbors: Array<{ row: number; col: number }> = [];

          for (const n of neighbors) {
            const nc = grid[n.row][n.col];
            if (nc === 'flagged') flagCount++;
            else if (nc === 'hidden') hiddenNeighbors.push(n);
          }

          if (flagCount === cell && hiddenNeighbors.length > 0) {
            // Check if any hidden neighbor is a mine (wrong flag nearby — lose)
            let hitMine = false;
            const additional: Array<{ coord: CellCoord; value: HexMineCell }> = [];

            for (const n of hiddenNeighbors) {
              const nSol = solution[n.row][n.col];
              if (nSol === 'mine') {
                hitMine = true;
                additional.push({ coord: { row: n.row, col: n.col }, value: 'exploded' });
              } else {
                additional.push({ coord: { row: n.row, col: n.col }, value: nSol });
                // Cascade from 0-cells revealed by chord
                if (nSol === 0) {
                  const cascade = computeCascade(n.row, n.col);
                  for (const cc of cascade) {
                    if (!additional.some((a) => a.coord.row === cc.coord.row && a.coord.col === cc.coord.col)) {
                      additional.push(cc);
                    }
                  }
                }
              }
            }

            if (hitMine) {
              const mines = revealAllMines(row, col);
              for (const m of mines) {
                if (!additional.some((a) => a.coord.row === m.coord.row && a.coord.col === m.coord.col)) {
                  additional.push(m);
                }
              }
              dispatch({
                type: 'CELL_INTERACT',
                payload: {
                  coord: { row, col },
                  interaction: 'primary',
                  nextValue: cell, // number stays the same
                  additionalCells: additional,
                },
              });
              dispatch({ type: 'PAUSE' });
            } else {
              // Check win
              const tempGrid = grid.map((r) => [...r]);
              for (const ac of additional) {
                tempGrid[ac.coord.row][ac.coord.col] = ac.value;
              }
              const won = isGameWon(tempGrid, solution);

              if (won) {
                for (let r2 = 0; r2 < height; r2++) {
                  for (let c2 = 0; c2 < width; c2++) {
                    if (solution[r2][c2] === 'mine' && tempGrid[r2][c2] === 'hidden') {
                      additional.push({ coord: { row: r2, col: c2 }, value: 'flagged' });
                    }
                  }
                }
              }

              dispatch({
                type: 'CELL_INTERACT',
                payload: {
                  coord: { row, col },
                  interaction: 'primary',
                  nextValue: cell,
                  solved: won,
                  additionalCells: additional,
                },
              });
            }
          }
        }
      }
    },
    [state.solved, state.paused, gameLost, grid, solution, width, height, dispatch, computeCascade, revealAllMines],
  );

  const handleContextMenu = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      e.preventDefault();
      if (state.solved || state.paused || gameLost) return;

      const cell = grid[row][col];

      if (cell === 'hidden') {
        // FLAG
        const sol = solution[row][col];

        if (sol !== 'mine') {
          // Lose on wrong flag
          const mines = revealAllMines(row, col);
          dispatch({
            type: 'CELL_INTERACT',
            payload: {
              coord: { row, col },
              interaction: 'secondary',
              nextValue: 'exploded',
              additionalCells: mines,
            },
          });
          dispatch({ type: 'PAUSE' });
          return;
        }

        dispatch({
          type: 'CELL_INTERACT',
          payload: {
            coord: { row, col },
            interaction: 'secondary',
            nextValue: 'flagged',
          },
        });
      } else if (cell === 'flagged') {
        // UNFLAG
        dispatch({
          type: 'CELL_INTERACT',
          payload: {
            coord: { row, col },
            interaction: 'secondary',
            nextValue: 'hidden',
          },
        });
      }
    },
    [state.solved, state.paused, gameLost, grid, solution, dispatch, revealAllMines],
  );

  // --- Status bar ---
  const mineCount = useMemo(() => {
    let mines = 0;
    let flags = 0;
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (solution[r][c] === 'mine') mines++;
        if (grid[r][c] === 'flagged') flags++;
      }
    }
    return { total: mines, remaining: mines - flags };
  }, [grid, solution, width, height]);

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Mine counter */}
      <div className="flex items-center gap-4 text-sm text-text-secondary">
        <span>
          <span className="text-hex-flagged">⚑</span> {mineCount.remaining} / {mineCount.total}
        </span>
        <span>{Math.round(evaluation.progress * 100)}%</span>
      </div>

      {/* SVG Hex Grid */}
      <svg
        viewBox={`${layout.viewBox.x} ${layout.viewBox.y} ${layout.viewBox.width} ${layout.viewBox.height}`}
        width="100%"
        style={{ maxWidth: Math.min(600, layout.viewBox.width * 1.2), maxHeight: '70vh' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {layout.cells.map((c) => (
          <HexCellRenderer
            key={c.key}
            cell={grid[c.row][c.col]}
            points={c.points}
            cx={c.cx}
            cy={c.cy}
            size={hexSize}
            isHover={hoverCell === c.key}
            isHinted={
              state.hintCell !== null &&
              state.hintCell.row === c.row &&
              state.hintCell.col === c.col
            }
            onMouseDown={(e) => handleCellClick(c.row, c.col, e)}
            onContextMenu={(e) => handleContextMenu(c.row, c.col, e)}
            onMouseEnter={() => setHoverCell(c.key)}
            onMouseLeave={() => setHoverCell(null)}
          />
        ))}
      </svg>

      {/* Loss overlay */}
      {gameLost && (
        <div className="text-center text-error font-bold text-lg mt-2">
          Game Over — Mine hit!
        </div>
      )}
    </div>
  );
}
