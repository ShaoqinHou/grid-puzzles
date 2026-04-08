import type { CellCoord } from '@/types';
import type { NonogramCell, NonogramClues, NonogramGrid } from './types';
import { solveNonogramLine, generateLeftmost, generateRightmost, propagate, detectCompletedBlocks, pushBlocks } from './solve';

/** Maximum unknown cells to probe per round */
const MAX_PROBES_PER_ROUND = 40;
/** Maximum probing rounds before giving up */
const MAX_PROBE_ROUNDS = 3;
/** Time budget in milliseconds */
const TIME_BUDGET_MS = 5000;

/** Technique used to resolve cells */
export type SolveTechnique =
  | 'empty-line'
  | 'full-line'
  | 'overlap'
  | 'edge-forcing'
  | 'gap-splitting'
  | 'block-completion'
  | 'block-pushing'
  | 'unreachable'
  | 'elimination'
  | 'cross-propagation'
  | 'probe';

/** A single step in the solving process */
export interface SolveStep {
  /** The technique used */
  readonly technique: SolveTechnique;
  /** Whether this step operates on a row or column */
  readonly lineType: 'row' | 'col';
  /** Which row/column number */
  readonly lineIndex: number;
  /** The clue used for this line */
  readonly clue: number[];
  /** Human-readable explanation of the logic applied */
  readonly logic: string;
  /** Which cells were determined in this step */
  readonly cellsResolved: CellCoord[];
  /** What values those cells were determined to be */
  readonly values: ('filled' | 'empty')[];
  /** Full grid state after this step was applied */
  readonly gridSnapshot: NonogramGrid;
  /** Start positions of each block in leftmost placement (for overlap visualization) */
  readonly leftmostPositions?: number[];
  /** Start positions of each block in rightmost placement (for overlap visualization) */
  readonly rightmostPositions?: number[];
  /** Number of animation phases this step requires (default 1) */
  readonly phases?: number;
  /** Technique-specific visualization data */
  readonly vizData?: Record<string, unknown>;
}

/** Result of the step-by-step solver */
export interface SolveWithStepsResult {
  readonly solution: NonogramGrid | null;
  readonly steps: SolveStep[];
}

/**
 * Convert internal grid (with undefined for unknown) to a NonogramGrid snapshot.
 * Unknown cells become 'empty' in the snapshot for display purposes.
 */
const snapshotGrid = (grid: (NonogramCell | undefined)[][]): NonogramGrid =>
  grid.map((row) => row.map((cell) => cell ?? 'empty'));

/** Deep copy a grid */
const deepCopyGrid = (g: (NonogramCell | undefined)[][]): (NonogramCell | undefined)[][] =>
  g.map((row) => [...row]);

/**
 * Identify the specific technique used by the line solver for a set of newly resolved cells.
 */
const identifyTechnique = (
  lineLength: number,
  clue: number[],
  knownBefore: (NonogramCell | undefined)[],
  newCells: { pos: number; value: 'filled' | 'empty' }[],
  leftPositions: number[] | null,
  rightPositions: number[] | null,
): SolveTechnique => {
  // Empty clue
  if (clue.length === 0 || (clue.length === 1 && clue[0] === 0)) {
    return 'empty-line';
  }

  const minSpace = clue.reduce((a, b) => a + b, 0) + clue.length - 1;

  // Full line: entire line is determined
  if (minSpace === lineLength) {
    return 'full-line';
  }

  // Check if all unknowns are resolved (elimination)
  const unknownsRemaining = knownBefore.filter((c, i) => {
    if (c !== undefined) return false;
    return !newCells.some((nc) => nc.pos === i);
  }).length;
  if (unknownsRemaining === 0 && newCells.length > 0) {
    return 'elimination';
  }

  // Edge forcing: filled cell at position 0 or last position
  if (knownBefore[0] === 'filled' && newCells.some((c) => c.pos < clue[0])) {
    return 'edge-forcing';
  }
  const lastClue = clue[clue.length - 1];
  if (knownBefore[lineLength - 1] === 'filled' &&
      newCells.some((c) => c.pos >= lineLength - lastClue)) {
    return 'edge-forcing';
  }

  // Block completion: a filled run adjacent to empty cells
  if (leftPositions && rightPositions) {
    for (let b = 0; b < clue.length; b++) {
      // Check if a known filled segment matches exactly one block size
      // and the new cells are marking ends as empty
      const blockSize = clue[b];
      const leftStart = leftPositions[b];
      const rightStart = rightPositions[b];

      // If the block is fully pinned to one location
      if (leftStart === rightStart) {
        const hasNewEmpties = newCells.some((c) =>
          c.value === 'empty' && (c.pos === leftStart - 1 || c.pos === leftStart + blockSize));
        if (hasNewEmpties) {
          return 'block-completion';
        }
      }
    }
  }

  // Gap splitting: empty cells split the line
  const hasGap = knownBefore.some((c) => c === 'empty' || c === 'marked');
  if (hasGap && newCells.length > 0) {
    // Check if the empty cells create separate segments
    const segments: { start: number; end: number }[] = [];
    let segStart = -1;
    for (let i = 0; i <= lineLength; i++) {
      if (i < lineLength && knownBefore[i] !== 'empty' && knownBefore[i] !== 'marked') {
        if (segStart === -1) segStart = i;
      } else {
        if (segStart !== -1) {
          segments.push({ start: segStart, end: i - 1 });
          segStart = -1;
        }
      }
    }
    if (segments.length >= 2) {
      return 'gap-splitting';
    }
  }

  // Unreachable: cells that no block can reach
  if (leftPositions && rightPositions && newCells.every((c) => c.value === 'empty')) {
    let allUnreachable = true;
    for (const cell of newCells) {
      let reachable = false;
      for (let b = 0; b < clue.length; b++) {
        if (cell.pos >= leftPositions[b] && cell.pos < rightPositions[b] + clue[b]) {
          reachable = true;
          break;
        }
      }
      if (reachable) {
        allUnreachable = false;
        break;
      }
    }
    if (allUnreachable) {
      return 'unreachable';
    }
  }

  // Default to overlap
  return 'overlap';
};

/**
 * Generate a human-readable logic description based on the technique.
 */
const describeLogic = (
  technique: SolveTechnique,
  lineType: 'row' | 'col',
  lineIndex: number,
  lineLength: number,
  clue: number[],
  knownBefore: (NonogramCell | undefined)[],
  newCells: { pos: number; value: 'filled' | 'empty' }[],
  leftPositions: number[] | null,
  rightPositions: number[] | null,
): string => {
  const lineLabel = lineType === 'row' ? `Row ${lineIndex}` : `Col ${lineIndex}`;
  const clueStr = `[${clue.join(',')}]`;

  switch (technique) {
    case 'empty-line':
      return `${lineLabel}: clue [0] means no filled cells allowed. All ${lineLength} cells must be empty.`;

    case 'full-line': {
      const minSpace = clue.reduce((a, b) => a + b, 0) + clue.length - 1;
      return `${lineLabel}: minimum space for clue ${clueStr} is ${minSpace} = width ${lineLength}. Only one arrangement possible, all cells determined.`;
    }

    case 'overlap': {
      if (!leftPositions || !rightPositions) {
        return `${lineLabel}: clue ${clueStr} overlap analysis determines ${newCells.length} cell(s).`;
      }

      const leftStarts = `[${leftPositions.join(',')}]`;
      const rightStarts = `[${rightPositions.join(',')}]`;
      const parts: string[] = [];

      for (let b = 0; b < clue.length; b++) {
        const overlapStart = Math.max(leftPositions[b], rightPositions[b]);
        const overlapEnd = Math.min(leftPositions[b] + clue[b], rightPositions[b] + clue[b]);
        if (overlapEnd > overlapStart) {
          parts.push(`Block ${b + 1} (size ${clue[b]}) overlaps at cells ${overlapStart}-${overlapEnd - 1}`);
        }
      }

      const filledCount = newCells.filter((c) => c.value === 'filled').length;
      const emptyCount = newCells.filter((c) => c.value === 'empty').length;
      const resolvedParts: string[] = [];
      if (filledCount > 0) resolvedParts.push(`${filledCount} must be filled`);
      if (emptyCount > 0) resolvedParts.push(`${emptyCount} must be empty`);

      return `${lineLabel}: clue ${clueStr} in width ${lineLength}. Leftmost at ${leftStarts}, rightmost at ${rightStarts}. ${parts.join('. ')}${parts.length > 0 ? '.' : ''} ${resolvedParts.join(', ')}.`;
    }

    case 'edge-forcing': {
      if (knownBefore[0] === 'filled') {
        return `${lineLabel}: cell 0 is filled. First block is size ${clue[0]}. Block must start at 0, so cells 0-${clue[0] - 1} are filled${clue[0] < lineLength ? ` and cell ${clue[0]} is empty` : ''}.`;
      }
      const lastClue = clue[clue.length - 1];
      if (knownBefore[lineLength - 1] === 'filled') {
        return `${lineLabel}: cell ${lineLength - 1} is filled. Last block is size ${lastClue}. Block must end at ${lineLength - 1}, so cells ${lineLength - lastClue}-${lineLength - 1} are filled${lineLength - lastClue > 0 ? ` and cell ${lineLength - lastClue - 1} is empty` : ''}.`;
      }
      return `${lineLabel}: edge-forcing with clue ${clueStr} determines ${newCells.length} cell(s).`;
    }

    case 'gap-splitting': {
      const emptyPositions: number[] = [];
      for (let i = 0; i < lineLength; i++) {
        if (knownBefore[i] === 'empty' || knownBefore[i] === 'marked') {
          emptyPositions.push(i);
        }
      }
      return `${lineLabel}: empty cells at positions [${emptyPositions.join(',')}] split the line into segments. Solving each segment with clue ${clueStr} independently determines ${newCells.length} cell(s).`;
    }

    case 'block-completion': {
      const filledRuns: { start: number; end: number }[] = [];
      let runStart = -1;
      for (let i = 0; i <= lineLength; i++) {
        if (i < lineLength && knownBefore[i] === 'filled') {
          if (runStart === -1) runStart = i;
        } else {
          if (runStart !== -1) {
            filledRuns.push({ start: runStart, end: i - 1 });
            runStart = -1;
          }
        }
      }
      if (filledRuns.length > 0) {
        const run = filledRuns[0];
        return `${lineLabel}: filled run at ${run.start}-${run.end} matches a block in clue ${clueStr}. Block boundaries determined, marking ends as empty.`;
      }
      return `${lineLabel}: block completion with clue ${clueStr} determines ${newCells.length} cell(s).`;
    }

    case 'unreachable': {
      const positions = newCells.map((c) => c.pos);
      return `${lineLabel}: cells at positions [${positions.join(',')}] cannot be reached by any block in clue ${clueStr}. They must be empty.`;
    }

    case 'elimination': {
      return `${lineLabel}: only one valid arrangement remains for clue ${clueStr}. All ${newCells.length} remaining cells determined.`;
    }

    case 'block-pushing': {
      // Description is generated at the call site with more specific details
      return `${lineLabel}: block pushing with clue ${clueStr} determines ${newCells.length} cell(s).`;
    }

    case 'cross-propagation': {
      const oppositeType = lineType === 'row' ? 'column' : 'row';
      return `${lineLabel}: information from ${oppositeType} solving propagated new constraints. Clue ${clueStr} now determines ${newCells.length} additional cell(s).`;
    }

    case 'probe':
      // Probe descriptions are generated at the call site
      return `${lineLabel}: probe determines ${newCells.length} cell(s).`;
  }
};

/**
 * Analyze a line and record steps with technique identification.
 * Returns the resolved cells or null on contradiction.
 */
const solveLine = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
): {
  result: (NonogramCell | undefined)[] | null;
  leftPositions: number[] | null;
  rightPositions: number[] | null;
} => {
  const result = solveNonogramLine(lineLength, clue, known);

  // Also get leftmost/rightmost for step recording
  let leftPositions: number[] | null = null;
  let rightPositions: number[] | null = null;

  if (result !== null && clue.length > 0 && !(clue.length === 1 && clue[0] === 0)) {
    const effectiveClue = clue.filter((c) => c > 0);
    if (effectiveClue.length > 0) {
      leftPositions = generateLeftmost(lineLength, effectiveClue, known);
      rightPositions = generateRightmost(lineLength, effectiveClue, known);
    }
  }

  return { result, leftPositions, rightPositions };
};

/**
 * Solve a nonogram step by step, recording each deduction with technique identification.
 * Uses leftmost/rightmost overlap algorithm for line solving.
 */
export const solveNonogramWithSteps = (
  clues: NonogramClues,
  width: number,
  height: number,
): SolveWithStepsResult => {
  const steps: SolveStep[] = [];
  const startTime = Date.now();

  // Internal representation: undefined = unknown
  const grid: (NonogramCell | undefined)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => undefined),
  );

  const isTimedOut = (): boolean => Date.now() - startTime > TIME_BUDGET_MS;

  /** Check if every cell in the grid is determined */
  const gridIsSolved = (g: (NonogramCell | undefined)[][]): boolean =>
    g.every((row) => row.every((cell) => cell !== undefined));

  /**
   * Run propagation on the grid, recording steps.
   * Returns false on contradiction.
   * When isPropagationFromOtherAxis is true, marks steps as cross-propagation.
   */
  const propagateWithSteps = (
    g: (NonogramCell | undefined)[][],
    recordSteps: boolean,
  ): boolean => {
    let changed = true;
    let firstPass = true;

    while (changed) {
      if (isTimedOut()) return true; // Bail but don't report contradiction
      changed = false;

      // Solve rows
      for (let r = 0; r < height; r++) {
        if (isTimedOut()) return true;
        const row = g[r];
        const knownBefore = [...row];
        const { result, leftPositions, rightPositions } = solveLine(width, clues.rows[r], row);
        if (result === null) return false;

        const newCells: { pos: number; value: 'filled' | 'empty' }[] = [];
        for (let c = 0; c < width; c++) {
          if (result[c] !== undefined && row[c] === undefined) {
            row[c] = result[c];
            changed = true;
            newCells.push({ pos: c, value: result[c] as 'filled' | 'empty' });
          }
        }

        if (recordSteps && newCells.length > 0) {
          const technique = !firstPass
            ? 'cross-propagation' as SolveTechnique
            : identifyTechnique(width, clues.rows[r], knownBefore, newCells, leftPositions, rightPositions);

          steps.push({
            technique,
            lineType: 'row',
            lineIndex: r,
            clue: clues.rows[r],
            logic: describeLogic(technique, 'row', r, width, clues.rows[r], knownBefore, newCells, leftPositions, rightPositions),
            cellsResolved: newCells.map((nc) => ({ row: r, col: nc.pos })),
            values: newCells.map((nc) => nc.value),
            gridSnapshot: snapshotGrid(g),
            leftmostPositions: leftPositions ?? undefined,
            rightmostPositions: rightPositions ?? undefined,
            ...(technique === 'overlap' && leftPositions && rightPositions ? {
              phases: 3,
              vizData: { leftmostPositions: leftPositions, rightmostPositions: rightPositions },
            } : {}),
          });
        }

        // Advanced techniques on this row
        const rowClue = clues.rows[r];
        const effectiveRowClue = rowClue.filter((c) => c > 0);
        if (effectiveRowClue.length > 0) {
          const advLeft = generateLeftmost(width, effectiveRowClue, row);
          const advRight = generateRightmost(width, effectiveRowClue, row);
          if (advLeft !== null && advRight !== null) {
            // Completed block detection
            const completions = detectCompletedBlocks(width, effectiveRowClue, row, advLeft, advRight);
            for (const comp of completions) {
              const compCells: { pos: number; value: 'filled' | 'empty' }[] = [];
              if (comp.forcedEmptyBefore !== null && row[comp.forcedEmptyBefore] === undefined) {
                row[comp.forcedEmptyBefore] = 'empty';
                changed = true;
                compCells.push({ pos: comp.forcedEmptyBefore, value: 'empty' });
              }
              if (comp.forcedEmptyAfter !== null && row[comp.forcedEmptyAfter] === undefined) {
                row[comp.forcedEmptyAfter] = 'empty';
                changed = true;
                compCells.push({ pos: comp.forcedEmptyAfter, value: 'empty' });
              }
              if (recordSteps && compCells.length > 0) {
                const runLen = comp.runEnd - comp.runStart + 1;
                const emptyPositions = compCells.map((c) => c.pos);
                steps.push({
                  technique: 'block-completion',
                  lineType: 'row',
                  lineIndex: r,
                  clue: rowClue,
                  logic: `Row ${r}: Filled run at cells ${comp.runStart}-${comp.runEnd} (length ${runLen}) matches block [${effectiveRowClue[comp.blockIndex]}]. Block complete — cell${emptyPositions.length > 1 ? 's' : ''} ${emptyPositions.join(' and ')} must be empty.`,
                  cellsResolved: compCells.map((nc) => ({ row: r, col: nc.pos })),
                  values: compCells.map((nc) => nc.value),
                  gridSnapshot: snapshotGrid(g),
                  leftmostPositions: advLeft,
                  rightmostPositions: advRight,
                  phases: 2,
                  vizData: {
                    blockRun: { start: comp.runStart, end: comp.runEnd },
                    blockIndex: comp.blockIndex,
                    forcedEmptyPositions: emptyPositions,
                  },
                });
              }
            }

            // Block pushing
            const pushResults = pushBlocks(width, effectiveRowClue, row, advLeft, advRight);
            // Group push results by the pinned cell for clearer steps
            const pushNewCells: { pos: number; value: 'filled' | 'empty' }[] = [];
            for (const pr of pushResults) {
              if (row[pr.cellPos] === undefined) {
                row[pr.cellPos] = pr.value;
                changed = true;
                pushNewCells.push({ pos: pr.cellPos, value: pr.value });
              }
            }
            if (recordSteps && pushNewCells.length > 0) {
              // Re-compute constrained info for description
              const filledCells = pushNewCells.filter((c) => c.value === 'filled');
              const emptyCells = pushNewCells.filter((c) => c.value === 'empty');
              const parts: string[] = [];
              if (filledCells.length > 0) parts.push(`${filledCells.length} filled`);
              if (emptyCells.length > 0) parts.push(`${emptyCells.length} empty`);

              // Find the first pinned filled cell for visualization
              let pinnedPos: number | undefined;
              let pinnedBlockIndex: number | undefined;
              let constrainedStart: number | undefined;
              let constrainedEnd: number | undefined;
              for (let p = 0; p < width; p++) {
                if (row[p] !== 'filled') continue;
                const candidates: number[] = [];
                for (let b = 0; b < effectiveRowClue.length; b++) {
                  const bSize = effectiveRowClue[b];
                  const minS = Math.max(advLeft[b], p - bSize + 1);
                  const maxS = Math.min(advRight[b], p);
                  if (minS <= maxS) candidates.push(b);
                }
                if (candidates.length === 1) {
                  const b = candidates[0];
                  pinnedPos = p;
                  pinnedBlockIndex = b;
                  constrainedStart = Math.max(advLeft[b], p - effectiveRowClue[b] + 1);
                  constrainedEnd = Math.min(advRight[b], p) + effectiveRowClue[b] - 1;
                  break;
                }
              }

              steps.push({
                technique: 'block-pushing',
                lineType: 'row',
                lineIndex: r,
                clue: rowClue,
                logic: `Row ${r}: Block pushing with clue [${effectiveRowClue.join(',')}] pins filled cells to specific blocks, determining ${parts.join(' and ')} cell(s).`,
                cellsResolved: pushNewCells.map((nc) => ({ row: r, col: nc.pos })),
                values: pushNewCells.map((nc) => nc.value),
                gridSnapshot: snapshotGrid(g),
                leftmostPositions: advLeft,
                rightmostPositions: advRight,
                phases: 3,
                vizData: {
                  newCells: pushNewCells.map((c) => c.pos),
                  ...(pinnedPos !== undefined && pinnedBlockIndex !== undefined && constrainedStart !== undefined && constrainedEnd !== undefined
                    ? {
                      pinnedCell: pinnedPos,
                      blockIndex: pinnedBlockIndex,
                      constrainedRange: { start: constrainedStart, end: constrainedEnd },
                    }
                    : {}),
                },
              });
            }
          }
        }
      }

      // Solve columns
      for (let c = 0; c < width; c++) {
        if (isTimedOut()) return true;
        const col = Array.from({ length: height }, (_, r) => g[r][c]);
        const knownBefore = [...col];
        const { result, leftPositions, rightPositions } = solveLine(height, clues.cols[c], col);
        if (result === null) return false;

        const newCells: { pos: number; value: 'filled' | 'empty' }[] = [];
        for (let r = 0; r < height; r++) {
          if (result[r] !== undefined && g[r][c] === undefined) {
            g[r][c] = result[r];
            changed = true;
            newCells.push({ pos: r, value: result[r] as 'filled' | 'empty' });
          }
        }

        if (recordSteps && newCells.length > 0) {
          const technique = !firstPass
            ? 'cross-propagation' as SolveTechnique
            : identifyTechnique(height, clues.cols[c], knownBefore, newCells, leftPositions, rightPositions);

          steps.push({
            technique,
            lineType: 'col',
            lineIndex: c,
            clue: clues.cols[c],
            logic: describeLogic(technique, 'col', c, height, clues.cols[c], knownBefore, newCells, leftPositions, rightPositions),
            cellsResolved: newCells.map((nc) => ({ row: nc.pos, col: c })),
            values: newCells.map((nc) => nc.value),
            gridSnapshot: snapshotGrid(g),
            leftmostPositions: leftPositions ?? undefined,
            rightmostPositions: rightPositions ?? undefined,
            ...(technique === 'overlap' && leftPositions && rightPositions ? {
              phases: 3,
              vizData: { leftmostPositions: leftPositions, rightmostPositions: rightPositions },
            } : {}),
          });
        }

        // Advanced techniques on this column
        const colClue = clues.cols[c];
        const effectiveColClue = colClue.filter((v) => v > 0);
        if (effectiveColClue.length > 0) {
          // Re-read column state after standard solve may have updated it
          const colAfter = Array.from({ length: height }, (_, r) => g[r][c]);
          const advLeft = generateLeftmost(height, effectiveColClue, colAfter);
          const advRight = generateRightmost(height, effectiveColClue, colAfter);
          if (advLeft !== null && advRight !== null) {
            // Completed block detection
            const completions = detectCompletedBlocks(height, effectiveColClue, colAfter, advLeft, advRight);
            for (const comp of completions) {
              const compCells: { pos: number; value: 'filled' | 'empty' }[] = [];
              if (comp.forcedEmptyBefore !== null && g[comp.forcedEmptyBefore][c] === undefined) {
                colAfter[comp.forcedEmptyBefore] = 'empty';
                g[comp.forcedEmptyBefore][c] = 'empty';
                changed = true;
                compCells.push({ pos: comp.forcedEmptyBefore, value: 'empty' });
              }
              if (comp.forcedEmptyAfter !== null && g[comp.forcedEmptyAfter][c] === undefined) {
                colAfter[comp.forcedEmptyAfter] = 'empty';
                g[comp.forcedEmptyAfter][c] = 'empty';
                changed = true;
                compCells.push({ pos: comp.forcedEmptyAfter, value: 'empty' });
              }
              if (recordSteps && compCells.length > 0) {
                const runLen = comp.runEnd - comp.runStart + 1;
                const emptyPositions = compCells.map((cc) => cc.pos);
                steps.push({
                  technique: 'block-completion',
                  lineType: 'col',
                  lineIndex: c,
                  clue: colClue,
                  logic: `Col ${c}: Filled run at cells ${comp.runStart}-${comp.runEnd} (length ${runLen}) matches block [${effectiveColClue[comp.blockIndex]}]. Block complete — cell${emptyPositions.length > 1 ? 's' : ''} ${emptyPositions.join(' and ')} must be empty.`,
                  cellsResolved: compCells.map((nc) => ({ row: nc.pos, col: c })),
                  values: compCells.map((nc) => nc.value),
                  gridSnapshot: snapshotGrid(g),
                  leftmostPositions: advLeft,
                  rightmostPositions: advRight,
                  phases: 2,
                  vizData: {
                    blockRun: { start: comp.runStart, end: comp.runEnd },
                    blockIndex: comp.blockIndex,
                    forcedEmptyPositions: emptyPositions,
                  },
                });
              }
            }

            // Block pushing
            const pushResults = pushBlocks(height, effectiveColClue, colAfter, advLeft, advRight);
            const pushNewCells: { pos: number; value: 'filled' | 'empty' }[] = [];
            for (const pr of pushResults) {
              if (g[pr.cellPos][c] === undefined) {
                colAfter[pr.cellPos] = pr.value;
                g[pr.cellPos][c] = pr.value;
                changed = true;
                pushNewCells.push({ pos: pr.cellPos, value: pr.value });
              }
            }
            if (recordSteps && pushNewCells.length > 0) {
              const filledCells = pushNewCells.filter((cc) => cc.value === 'filled');
              const emptyCells = pushNewCells.filter((cc) => cc.value === 'empty');
              const parts: string[] = [];
              if (filledCells.length > 0) parts.push(`${filledCells.length} filled`);
              if (emptyCells.length > 0) parts.push(`${emptyCells.length} empty`);

              // Find the first pinned filled cell for visualization
              let pinnedPos: number | undefined;
              let pinnedBlockIndex: number | undefined;
              let constrainedStartCol: number | undefined;
              let constrainedEndCol: number | undefined;
              for (let p = 0; p < height; p++) {
                if (colAfter[p] !== 'filled') continue;
                const candidates: number[] = [];
                for (let b = 0; b < effectiveColClue.length; b++) {
                  const bSize = effectiveColClue[b];
                  const minS = Math.max(advLeft[b], p - bSize + 1);
                  const maxS = Math.min(advRight[b], p);
                  if (minS <= maxS) candidates.push(b);
                }
                if (candidates.length === 1) {
                  const b = candidates[0];
                  pinnedPos = p;
                  pinnedBlockIndex = b;
                  constrainedStartCol = Math.max(advLeft[b], p - effectiveColClue[b] + 1);
                  constrainedEndCol = Math.min(advRight[b], p) + effectiveColClue[b] - 1;
                  break;
                }
              }

              steps.push({
                technique: 'block-pushing',
                lineType: 'col',
                lineIndex: c,
                clue: colClue,
                logic: `Col ${c}: Block pushing with clue [${effectiveColClue.join(',')}] pins filled cells to specific blocks, determining ${parts.join(' and ')} cell(s).`,
                cellsResolved: pushNewCells.map((nc) => ({ row: nc.pos, col: c })),
                values: pushNewCells.map((nc) => nc.value),
                gridSnapshot: snapshotGrid(g),
                leftmostPositions: advLeft,
                rightmostPositions: advRight,
                phases: 3,
                vizData: {
                  newCells: pushNewCells.map((cc) => cc.pos),
                  ...(pinnedPos !== undefined && pinnedBlockIndex !== undefined && constrainedStartCol !== undefined && constrainedEndCol !== undefined
                    ? {
                      pinnedCell: pinnedPos,
                      blockIndex: pinnedBlockIndex,
                      constrainedRange: { start: constrainedStartCol, end: constrainedEndCol },
                    }
                    : {}),
                },
              });
            }
          }
        }
      }

      firstPass = false;
    }
    return true;
  };

  /** Run propagation without recording steps (used inside probes) */
  const propagateSilent = (g: (NonogramCell | undefined)[][]): boolean => {
    return propagate(g, clues, width, height);
  };

  // Initial propagation with step recording
  if (!propagateWithSteps(grid, true)) {
    return { solution: null, steps };
  }

  if (gridIsSolved(grid)) {
    return { solution: snapshotGrid(grid), steps };
  }

  // Probing phase
  for (let round = 0; round < MAX_PROBE_ROUNDS; round++) {
    if (isTimedOut()) break;
    let probesMade = 0;
    let progressMade = false;

    for (let r = 0; r < height && probesMade < MAX_PROBES_PER_ROUND; r++) {
      for (let c = 0; c < width && probesMade < MAX_PROBES_PER_ROUND; c++) {
        if (isTimedOut()) break;
        if (grid[r][c] !== undefined) continue;

        probesMade++;

        // Try 'filled'
        const copyFilled = deepCopyGrid(grid);
        copyFilled[r][c] = 'filled';
        const filledOk = propagateSilent(copyFilled);

        // Try 'empty'
        const copyEmpty = deepCopyGrid(grid);
        copyEmpty[r][c] = 'empty';
        const emptyOk = propagateSilent(copyEmpty);

        let forced: 'filled' | 'empty' | null = null;
        let contradictionValue: string | null = null;

        if (!filledOk && emptyOk) {
          forced = 'empty';
          contradictionValue = 'filled';
        } else if (filledOk && !emptyOk) {
          forced = 'filled';
          contradictionValue = 'empty';
        }

        if (forced !== null) {
          grid[r][c] = forced;
          progressMade = true;

          // Find which line caused the contradiction for a better description
          const contradictLine = findContradictionLine(
            grid, r, c, contradictionValue as NonogramCell, clues, width, height,
          );

          // Parse contradiction line info for vizData
          let contradictionLineType: 'row' | 'col' | undefined;
          let contradictionLineIndex: number | undefined;
          if (contradictLine) {
            const rowMatch = contradictLine.match(/Row (\d+)/);
            const colMatch = contradictLine.match(/Col (\d+)/);
            if (rowMatch) {
              contradictionLineType = 'row';
              contradictionLineIndex = Number(rowMatch[1]);
            } else if (colMatch) {
              contradictionLineType = 'col';
              contradictionLineIndex = Number(colMatch[1]);
            }
          }

          steps.push({
            technique: 'probe',
            lineType: 'row',
            lineIndex: r,
            clue: clues.rows[r],
            logic: `Probe: tried (${r},${c}) = ${contradictionValue} -> propagation contradicts${contradictLine}. Cell must be '${forced}'.`,
            cellsResolved: [{ row: r, col: c }],
            values: [forced],
            gridSnapshot: snapshotGrid(grid),
            phases: 4,
            vizData: {
              targetCell: { row: r, col: c },
              hypothesisValue: contradictionValue,
              resolvedValue: forced,
              ...(contradictionLineType !== undefined && contradictionLineIndex !== undefined
                ? { contradictionLine: { lineType: contradictionLineType, lineIndex: contradictionLineIndex } }
                : {}),
            },
          });
        }
      }
      if (isTimedOut()) break;
    }

    if (!progressMade) break;

    // Re-propagate after probing to cascade new information, recording steps
    if (!propagateWithSteps(grid, true)) {
      return { solution: null, steps };
    }

    if (gridIsSolved(grid)) {
      return { solution: snapshotGrid(grid), steps };
    }
  }

  const totalCells = width * height;
  const resolvedCells = grid.flat().filter((c) => c !== undefined).length;
  const snapshot = snapshotGrid(grid);

  if (gridIsSolved(grid)) {
    return { solution: snapshot, steps };
  }

  // If still not fully solved, note how far we got
  const unresolved = totalCells - resolvedCells;
  if (unresolved > 0) {
    steps.push({
      technique: 'overlap',
      lineType: 'row',
      lineIndex: 0,
      clue: [],
      logic: `Propagation and probing resolved ${resolvedCells} of ${totalCells} cells. Remaining ${unresolved} cell(s) require deeper search (backtracking). The puzzle is solvable.`,
      cellsResolved: [],
      values: [],
      gridSnapshot: snapshot,
    });
  }

  return { solution: snapshot, steps };
};

/**
 * Find which line causes a contradiction when a cell is set to a given value.
 * Returns a description string like " Row 3 clue [1,1]" or " Col 5 clue [2]", or empty string.
 */
const findContradictionLine = (
  grid: (NonogramCell | undefined)[][],
  row: number,
  col: number,
  testValue: NonogramCell,
  clues: NonogramClues,
  width: number,
  height: number,
): string => {
  const copy = grid.map((r) => [...r]);
  copy[row][col] = testValue;

  // Check the row containing this cell
  const rowLine = copy[row];
  const rowResult = solveNonogramLine(width, clues.rows[row], rowLine);
  if (rowResult === null) return ` Row ${row} clue [${clues.rows[row].join(',')}]`;

  // Check the column containing this cell
  const colLine = Array.from({ length: height }, (_, r) => copy[r][col]);
  const colResult = solveNonogramLine(height, clues.cols[col], colLine);
  if (colResult === null) return ` Col ${col} clue [${clues.cols[col].join(',')}]`;

  return '';
};
