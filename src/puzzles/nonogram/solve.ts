import type { NonogramCell, NonogramClues, NonogramGrid } from './types';

/**
 * Generate the leftmost valid placement of blocks in a line.
 *
 * Uses a forward-scanning algorithm: for each block, find the earliest valid
 * start position. If placing a block leaves uncoverable filled cells behind,
 * the placement fails (contradiction). Known filled cells force blocks to be
 * placed to cover them.
 *
 * @returns Array of start positions for each block, or null if no valid placement exists
 */
export const generateLeftmost = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
): number[] | null => {
  const numBlocks = clue.length;
  if (numBlocks === 0) return [];

  // Use a stack-based iterative approach to handle backtracking
  // when a greedy placement fails due to downstream constraints
  const positions = new Array<number>(numBlocks);
  const minStartForBlock = new Array<number>(numBlocks);

  // Calculate minimum start for each block based on space needed for previous blocks
  minStartForBlock[0] = 0;
  for (let b = 1; b < numBlocks; b++) {
    minStartForBlock[b] = minStartForBlock[b - 1] + clue[b - 1] + 1;
  }

  // Calculate maximum start for each block based on space needed for subsequent blocks
  const maxStartForBlock = new Array<number>(numBlocks);
  maxStartForBlock[numBlocks - 1] = lineLength - clue[numBlocks - 1];
  for (let b = numBlocks - 2; b >= 0; b--) {
    maxStartForBlock[b] = maxStartForBlock[b + 1] - clue[b] - 1;
  }

  // For leftmost, we want the earliest valid assignment
  // Use iterative deepening: try to place each block in order
  let b = 0;
  const tryStart = new Array<number>(numBlocks).fill(-1);
  tryStart[0] = minStartForBlock[0];

  while (b >= 0 && b < numBlocks) {
    const blockSize = clue[b];
    const minPos = b === 0 ? tryStart[b] : Math.max(tryStart[b], positions[b - 1] + clue[b - 1] + 1);
    const maxPos = maxStartForBlock[b];

    let placed = false;

    for (let start = minPos; start <= maxPos; start++) {
      // Check: no empty/marked cells within the block
      let blockValid = true;
      let skipTo = -1;
      for (let i = start; i < start + blockSize; i++) {
        if (known[i] === 'empty' || known[i] === 'marked') {
          blockValid = false;
          skipTo = i + 1; // Skip past the empty cell
          break;
        }
      }

      if (!blockValid) {
        // Check if we skipped a filled cell (which means no valid placement exists at or before skipTo)
        for (let i = start; i < skipTo; i++) {
          if (known[i] === 'filled') {
            // This filled cell can't be covered by this block at any start >= skipTo
            // And we can't go before start. Need to backtrack.
            // But first check: can the previous block cover it?
            // No -- we need to backtrack to the previous block and try a later position.
            placed = false;
            start = maxPos + 1; // Force exit
            break;
          }
        }
        if (start <= maxPos) {
          start = skipTo - 1; // -1 because the for loop will increment
        }
        continue;
      }

      // Check: separator after block must not be filled
      const afterBlock = start + blockSize;
      if (afterBlock < lineLength && known[afterBlock] === 'filled') {
        // Check if we can skip: if the cell at `start` is filled, we can't skip past it
        if (known[start] === 'filled') {
          // Can't move start forward without leaving this filled cell uncovered
          // Need to backtrack
          break;
        }
        continue;
      }

      // Check: no filled cells in the gap before this block that are uncovered
      const gapStart = b === 0 ? 0 : positions[b - 1] + clue[b - 1] + 1;
      let gapOk = true;
      for (let i = gapStart; i < start; i++) {
        if (known[i] === 'filled') {
          gapOk = false;
          break;
        }
      }

      if (!gapOk) {
        // There's a filled cell in the gap that we skipped over
        // We need to place THIS block earlier to cover it, but we already passed it
        // This means the current start is too far right; need to backtrack
        break;
      }

      // Valid placement found
      positions[b] = start;
      placed = true;
      break;
    }

    if (placed) {
      // Move to next block
      b++;
      if (b < numBlocks) {
        tryStart[b] = positions[b - 1] + clue[b - 1] + 1;
      }
    } else {
      // Backtrack: go back to previous block and try a later position
      if (b === 0) return null; // No valid placement at all
      b--;
      tryStart[b] = positions[b] + 1;
    }
  }

  if (b < 0) return null;

  // Check: no filled cells remain after the last block.
  // If there are, backtrack the last block to a later position.
  while (true) {
    const lastEnd = positions[numBlocks - 1] + clue[numBlocks - 1];
    let trailingFilled = false;
    for (let i = lastEnd; i < lineLength; i++) {
      if (known[i] === 'filled') {
        trailingFilled = true;
        break;
      }
    }

    if (!trailingFilled) break;

    // Need to backtrack: try later positions for the last block (or earlier blocks)
    b = numBlocks - 1;
    tryStart[b] = positions[b] + 1;

    while (b >= 0 && b < numBlocks) {
      const blockSize = clue[b];
      const minPos = b === 0 ? tryStart[b] : Math.max(tryStart[b], positions[b - 1] + clue[b - 1] + 1);
      const maxPos = maxStartForBlock[b];

      let placed = false;
      for (let start = minPos; start <= maxPos; start++) {
        let blockValid = true;
        for (let i = start; i < start + blockSize; i++) {
          if (known[i] === 'empty' || known[i] === 'marked') {
            blockValid = false;
            start = i; // Will be incremented by for loop
            break;
          }
        }
        if (!blockValid) continue;

        const afterBlock = start + blockSize;
        if (afterBlock < lineLength && known[afterBlock] === 'filled') {
          if (known[start] === 'filled') break;
          continue;
        }

        const gapStart = b === 0 ? 0 : positions[b - 1] + clue[b - 1] + 1;
        let gapOk = true;
        for (let i = gapStart; i < start; i++) {
          if (known[i] === 'filled') { gapOk = false; break; }
        }
        if (!gapOk) break;

        positions[b] = start;
        placed = true;
        break;
      }

      if (placed) {
        b++;
        if (b < numBlocks) {
          tryStart[b] = positions[b - 1] + clue[b - 1] + 1;
        }
      } else {
        if (b === 0) return null;
        b--;
        tryStart[b] = positions[b] + 1;
      }
    }

    if (b < 0) return null;
    if (b === numBlocks) continue; // Re-check trailing
    break;
  }

  return positions;
};

/**
 * Generate the rightmost valid placement of blocks in a line.
 * Implemented by mirroring the line and clue, computing leftmost, then mirroring back.
 *
 * @returns Array of start positions for each block, or null if no valid placement exists
 */
export const generateRightmost = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
): number[] | null => {
  const mirroredKnown = new Array<NonogramCell | undefined>(lineLength);
  for (let i = 0; i < lineLength; i++) {
    mirroredKnown[i] = known[lineLength - 1 - i];
  }
  const mirroredClue = [...clue].reverse();

  const leftPositions = generateLeftmost(lineLength, mirroredClue, mirroredKnown);
  if (leftPositions === null) return null;

  const positions = new Array<number>(clue.length);
  for (let b = 0; b < clue.length; b++) {
    const mirroredIdx = clue.length - 1 - b;
    const mirroredStart = leftPositions[mirroredIdx];
    const mirroredBlockSize = mirroredClue[mirroredIdx];
    positions[b] = lineLength - mirroredStart - mirroredBlockSize;
  }

  return positions;
};

/**
 * Solve a single nonogram line using the leftmost/rightmost overlap algorithm.
 *
 * 1. Generate LEFTMOST placement: push all blocks as far left as possible
 * 2. Generate RIGHTMOST placement: push all blocks as far right as possible
 * 3. If either fails -> contradiction (return null)
 * 4. Per-block overlap determines filled cells; unreachable cells are empty
 *
 * O(n*k) per line where k = number of blocks (with backtracking, worst case O(n^k)
 * but in practice very fast for valid nonogram puzzles).
 *
 * @param lineLength - length of the line
 * @param clue - array of block sizes for this line
 * @param known - current known state of the line (undefined = unknown)
 * @returns resolved line, or null if no valid arrangement exists
 */
export const solveNonogramLine = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
): (NonogramCell | undefined)[] | null => {
  // Empty clue means the entire line must be empty
  if (clue.length === 0 || (clue.length === 1 && clue[0] === 0)) {
    for (let i = 0; i < lineLength; i++) {
      if (known[i] === 'filled') return null;
    }
    return Array.from({ length: lineLength }, () => 'empty' as NonogramCell);
  }

  // Filter out zero-sized blocks (shouldn't appear, but handle gracefully)
  const effectiveClue = clue.filter((c) => c > 0);
  if (effectiveClue.length === 0) {
    for (let i = 0; i < lineLength; i++) {
      if (known[i] === 'filled') return null;
    }
    return Array.from({ length: lineLength }, () => 'empty' as NonogramCell);
  }

  const leftPositions = generateLeftmost(lineLength, effectiveClue, known);
  if (leftPositions === null) return null;

  const rightPositions = generateRightmost(lineLength, effectiveClue, known);
  if (rightPositions === null) return null;

  const numBlocks = effectiveClue.length;
  const result = new Array<NonogramCell | undefined>(lineLength);

  // Start with known cells
  for (let i = 0; i < lineLength; i++) {
    result[i] = known[i] ?? undefined;
  }

  // 1. Per-block overlap: cells in the intersection of leftmost and rightmost
  //    positions of the SAME block must be filled
  for (let b = 0; b < numBlocks; b++) {
    const leftStart = leftPositions[b];
    const rightStart = rightPositions[b];
    const blockSize = effectiveClue[b];

    const overlapStart = Math.max(leftStart, rightStart);
    const overlapEnd = Math.min(leftStart + blockSize, rightStart + blockSize);

    for (let i = overlapStart; i < overlapEnd; i++) {
      result[i] = 'filled';
    }
  }

  // 2. Cells not reachable by ANY block must be empty
  for (let i = 0; i < lineLength; i++) {
    if (result[i] !== undefined) continue;

    let reachable = false;
    for (let b = 0; b < numBlocks; b++) {
      const earliest = leftPositions[b];
      const latest = rightPositions[b] + effectiveClue[b] - 1;
      if (i >= earliest && i <= latest) {
        reachable = true;
        break;
      }
    }
    if (!reachable) {
      result[i] = 'empty';
    }
  }

  // 3. Guaranteed gaps between consecutive blocks
  for (let b = 0; b < numBlocks - 1; b++) {
    const rightEndOfB = rightPositions[b] + effectiveClue[b];
    const leftStartOfNext = leftPositions[b + 1];

    for (let i = rightEndOfB; i < leftStartOfNext; i++) {
      if (result[i] === undefined) {
        result[i] = 'empty';
      }
    }
  }

  // 4. Cells before the leftmost start of the first block must be empty
  for (let i = 0; i < leftPositions[0]; i++) {
    if (result[i] === undefined) {
      result[i] = 'empty';
    }
  }

  // 5. Cells after the rightmost end of the last block must be empty
  const lastBlockEnd = rightPositions[numBlocks - 1] + effectiveClue[numBlocks - 1];
  for (let i = lastBlockEnd; i < lineLength; i++) {
    if (result[i] === undefined) {
      result[i] = 'empty';
    }
  }

  return result;
};

/**
 * Completed Block Detection.
 *
 * After overlap, scan the line for contiguous filled runs. For each run, determine
 * which clue block(s) could contain it. If exactly one block B matches and the
 * run length equals clue[B], the block is complete — cells immediately before and
 * after the run must be empty.
 *
 * @returns List of deductions from completed blocks
 */
export const detectCompletedBlocks = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
  leftPositions: number[],
  rightPositions: number[],
): { blockIndex: number; runStart: number; runEnd: number; forcedEmptyBefore: number | null; forcedEmptyAfter: number | null }[] => {
  const numBlocks = clue.length;
  if (numBlocks === 0) return [];

  const results: { blockIndex: number; runStart: number; runEnd: number; forcedEmptyBefore: number | null; forcedEmptyAfter: number | null }[] = [];

  // Find all contiguous filled runs in the known line
  let runStart = -1;
  for (let i = 0; i <= lineLength; i++) {
    if (i < lineLength && known[i] === 'filled') {
      if (runStart === -1) runStart = i;
    } else {
      if (runStart !== -1) {
        const runEnd = i - 1;
        const runLen = runEnd - runStart + 1;

        // Which blocks could contain this entire run?
        const candidateBlocks: number[] = [];
        for (let b = 0; b < numBlocks; b++) {
          const blockSize = clue[b];
          if (blockSize < runLen) continue; // Block too small to contain this run

          // Block b can be placed between leftPositions[b] and rightPositions[b]
          // The run occupies [runStart, runEnd]. Check if the block can cover it.
          const earliestStart = leftPositions[b];
          const latestStart = rightPositions[b];
          const latestEnd = latestStart + blockSize - 1;
          const earliestEnd = earliestStart + blockSize - 1;

          // Block can cover run if: block can start early enough and end late enough
          // Block start <= runStart AND block end >= runEnd
          // start <= runStart AND start + blockSize - 1 >= runEnd
          // start <= runStart AND start >= runEnd - blockSize + 1
          const needStart = Math.max(earliestStart, runEnd - blockSize + 1);
          const needEnd = Math.min(latestStart, runStart);

          if (needStart <= needEnd) {
            candidateBlocks.push(b);
          }
        }

        // If exactly one block can contain this run and its size matches
        if (candidateBlocks.length === 1) {
          const b = candidateBlocks[0];
          if (clue[b] === runLen) {
            const forcedEmptyBefore = runStart > 0 && known[runStart - 1] === undefined ? runStart - 1 : null;
            const forcedEmptyAfter = runEnd < lineLength - 1 && known[runEnd + 1] === undefined ? runEnd + 1 : null;

            if (forcedEmptyBefore !== null || forcedEmptyAfter !== null) {
              results.push({ blockIndex: b, runStart, runEnd, forcedEmptyBefore, forcedEmptyAfter });
            }
          }
        }

        runStart = -1;
      }
    }
  }

  return results;
};

/**
 * Block Pushing.
 *
 * For each filled cell, determine which block(s) could cover it. If only one
 * block B can, tightly constrain B's position range, then mark any cell that
 * must be filled in ALL valid positions as filled, and cells outside all ranges
 * as empty.
 *
 * @returns List of cell deductions from block pushing
 */
export const pushBlocks = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
  leftPositions: number[],
  rightPositions: number[],
): { cellPos: number; value: 'filled' | 'empty'; reason: string }[] => {
  const numBlocks = clue.length;
  if (numBlocks === 0) return [];

  const results: { cellPos: number; value: 'filled' | 'empty'; reason: string }[] = [];
  const alreadySet = new Set<number>();

  for (let p = 0; p < lineLength; p++) {
    if (known[p] !== 'filled') continue;

    // Which blocks could cover position p?
    const candidateBlocks: number[] = [];
    for (let b = 0; b < numBlocks; b++) {
      const blockSize = clue[b];
      const earliestStart = leftPositions[b];
      const latestStart = rightPositions[b];

      // Block b covers p if there's a valid start s where s <= p <= s + blockSize - 1
      // That means: max(earliestStart, p - blockSize + 1) <= min(latestStart, p)
      const minS = Math.max(earliestStart, p - blockSize + 1);
      const maxS = Math.min(latestStart, p);

      if (minS <= maxS) {
        candidateBlocks.push(b);
      }
    }

    if (candidateBlocks.length !== 1) continue;

    const b = candidateBlocks[0];
    const blockSize = clue[b];

    // Constrain block B's start range: must cover p
    const constrainedMinStart = Math.max(leftPositions[b], p - blockSize + 1);
    const constrainedMaxStart = Math.min(rightPositions[b], p);

    if (constrainedMinStart > constrainedMaxStart) continue;

    // Overlap: cells that are covered in ALL valid positions
    const overlapStart = constrainedMaxStart; // Latest start
    const overlapEnd = constrainedMinStart + blockSize; // Earliest start + blockSize

    for (let i = overlapStart; i < overlapEnd; i++) {
      if (i >= 0 && i < lineLength && known[i] === undefined && !alreadySet.has(i)) {
        results.push({
          cellPos: i,
          value: 'filled',
          reason: `Cell ${p} is filled and can only belong to block [${clue[b]}] (index ${b}). Block must span ${constrainedMinStart}-${constrainedMinStart + blockSize - 1}..${constrainedMaxStart}-${constrainedMaxStart + blockSize - 1}. Overlap at cell ${i}.`,
        });
        alreadySet.add(i);
      }
    }

    // Cells just outside the constrained range must be empty
    const rangeStart = constrainedMinStart;
    const rangeEnd = constrainedMaxStart + blockSize - 1;

    if (rangeStart > 0 && known[rangeStart - 1] === undefined && !alreadySet.has(rangeStart - 1)) {
      results.push({
        cellPos: rangeStart - 1,
        value: 'empty',
        reason: `Cell ${p} pins block [${clue[b]}] (index ${b}) to range ${rangeStart}-${rangeEnd}. Cell ${rangeStart - 1} is outside.`,
      });
      alreadySet.add(rangeStart - 1);
    }

    if (rangeEnd < lineLength - 1 && known[rangeEnd + 1] === undefined && !alreadySet.has(rangeEnd + 1)) {
      results.push({
        cellPos: rangeEnd + 1,
        value: 'empty',
        reason: `Cell ${p} pins block [${clue[b]}] (index ${b}) to range ${rangeStart}-${rangeEnd}. Cell ${rangeEnd + 1} is outside.`,
      });
      alreadySet.add(rangeEnd + 1);
    }
  }

  return results;
};

/** Deep copy a grid */
const deepCopyGrid = (g: (NonogramCell | undefined)[][]): (NonogramCell | undefined)[][] =>
  g.map((row) => [...row]);

/**
 * Apply completed-block detection and block-pushing to a line, writing results
 * into the `known` array. Returns true if any new cells were determined.
 */
const applyAdvancedTechniques = (
  lineLength: number,
  clue: number[],
  known: (NonogramCell | undefined)[],
): boolean => {
  const effectiveClue = clue.filter((c) => c > 0);
  if (effectiveClue.length === 0) return false;

  const left = generateLeftmost(lineLength, effectiveClue, known);
  if (left === null) return false;
  const right = generateRightmost(lineLength, effectiveClue, known);
  if (right === null) return false;

  let madeProgress = false;

  // Completed block detection
  const completions = detectCompletedBlocks(lineLength, effectiveClue, known, left, right);
  for (const comp of completions) {
    if (comp.forcedEmptyBefore !== null && known[comp.forcedEmptyBefore] === undefined) {
      known[comp.forcedEmptyBefore] = 'empty';
      madeProgress = true;
    }
    if (comp.forcedEmptyAfter !== null && known[comp.forcedEmptyAfter] === undefined) {
      known[comp.forcedEmptyAfter] = 'empty';
      madeProgress = true;
    }
  }

  // Block pushing
  const pushResults = pushBlocks(lineLength, effectiveClue, known, left, right);
  for (const pr of pushResults) {
    if (known[pr.cellPos] === undefined) {
      known[pr.cellPos] = pr.value;
      madeProgress = true;
    }
  }

  return madeProgress;
};

/**
 * Run constraint propagation on a grid, modifying it in place.
 * Returns false if a contradiction is found.
 */
export const propagate = (
  g: (NonogramCell | undefined)[][],
  clues: NonogramClues,
  width: number,
  height: number,
): boolean => {
  let changed = true;
  while (changed) {
    changed = false;

    for (let r = 0; r < height; r++) {
      const row = g[r];
      const result = solveNonogramLine(width, clues.rows[r], row);
      if (result === null) return false;
      for (let c = 0; c < width; c++) {
        if (result[c] !== undefined && row[c] === undefined) {
          row[c] = result[c];
          changed = true;
        }
      }

      // Advanced techniques on this row
      if (applyAdvancedTechniques(width, clues.rows[r], row)) {
        changed = true;
      }
    }

    for (let c = 0; c < width; c++) {
      const col = Array.from({ length: height }, (_, r) => g[r][c]);
      const result = solveNonogramLine(height, clues.cols[c], col);
      if (result === null) return false;
      for (let r = 0; r < height; r++) {
        if (result[r] !== undefined && g[r][c] === undefined) {
          g[r][c] = result[r];
          changed = true;
        }
      }

      // Advanced techniques on this column
      if (applyAdvancedTechniques(height, clues.cols[c], col)) {
        changed = true;
        // Write column results back to grid
        for (let r = 0; r < height; r++) {
          if (col[r] !== undefined && g[r][c] === undefined) {
            g[r][c] = col[r];
          }
        }
      }
    }
  }
  return true;
};

/** Check if every cell in the grid is determined */
const isSolved = (g: (NonogramCell | undefined)[][]): boolean =>
  g.every((row) => row.every((cell) => cell !== undefined));

/** Probe a single cell */
const probeCell = (
  g: (NonogramCell | undefined)[][],
  row: number,
  col: number,
  clues: NonogramClues,
  width: number,
  height: number,
): 'filled' | 'empty' | null => {
  const copyFilled = deepCopyGrid(g);
  copyFilled[row][col] = 'filled';
  const filledOk = propagate(copyFilled, clues, width, height);

  const copyEmpty = deepCopyGrid(g);
  copyEmpty[row][col] = 'empty';
  const emptyOk = propagate(copyEmpty, clues, width, height);

  if (!filledOk && emptyOk) return 'empty';
  if (filledOk && !emptyOk) return 'filled';
  return null;
};

const MAX_PROBES_PER_ROUND = 200;
const MAX_PROBE_ROUNDS = 10;

/**
 * Solve a complete nonogram puzzle using iterative line solving with
 * constraint propagation and probing, falling back to backtracking when stuck.
 */
export const solveNonogram = (
  clues: NonogramClues,
  width: number,
  height: number,
): NonogramGrid | null => {
  const grid: (NonogramCell | undefined)[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => undefined),
  );

  if (!propagate(grid, clues, width, height)) return null;

  if (isSolved(grid)) {
    return grid.map((row) => row.map((cell) => cell ?? 'empty'));
  }

  for (let round = 0; round < MAX_PROBE_ROUNDS; round++) {
    let probesMade = 0;
    let progressMade = false;

    for (let r = 0; r < height && probesMade < MAX_PROBES_PER_ROUND; r++) {
      for (let c = 0; c < width && probesMade < MAX_PROBES_PER_ROUND; c++) {
        if (grid[r][c] !== undefined) continue;
        probesMade++;
        const forced = probeCell(grid, r, c, clues, width, height);
        if (forced !== null) {
          grid[r][c] = forced;
          progressMade = true;
        }
      }
    }

    if (!progressMade) break;
    if (!propagate(grid, clues, width, height)) return null;
    if (isSolved(grid)) {
      return grid.map((row) => row.map((cell) => cell ?? 'empty'));
    }
  }

  if (isSolved(grid)) {
    return grid.map((row) => row.map((cell) => cell ?? 'empty'));
  }

  const backtrack = (g: (NonogramCell | undefined)[][]): NonogramGrid | null => {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (g[r][c] === undefined) {
          for (const guess of ['filled', 'empty'] as const) {
            const copy = deepCopyGrid(g);
            copy[r][c] = guess;
            if (propagate(copy, clues, width, height)) {
              if (isSolved(copy)) {
                return copy.map((row) => row.map((cell) => cell ?? 'empty'));
              }
              const result = backtrack(copy);
              if (result !== null) return result;
            }
          }
          return null;
        }
      }
    }
    return null;
  };

  return backtrack(grid);
};
