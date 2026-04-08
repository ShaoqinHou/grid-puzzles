# Puzzle Compiler: Implementation Plan

## Architecture Overview

Constructive backwards generation — NOT brute force:
1. Initialize grid, place cascade origin
2. For each step: resolve target → assign value → create clues → verify unique determination → constrain neighbors
3. Fill remaining unknowns at target density
4. Compute numbers, trim shape, validate, return PuzzleInstance

## File Structure

```
src/puzzles/hexmine/compiler/
  index.ts              — Public API: compilePuzzle()
  types.ts              — PuzzleStep, PuzzleBlueprint, CompilationResult, ClueType, CellRef
  compile.ts            — compilePuzzle() main orchestrator + processStep()
  clue-factory.ts       — findOrCreateClue() per clue type (adjacent, line, range, etc.)
  verify.ts             — verifyUniqueDetermination(), difficulty validation
```

## Core Types

### ClueType
```typescript
type ClueType =
  | 'adjacent' | 'adjacent-contiguous' | 'adjacent-nonContiguous'
  | 'line' | 'line-contiguous' | 'line-nonContiguous'
  | 'range' | 'edge-header'
  | 'question-mark' | 'cascade' | 'pre-revealed';
```

### CellRef
```typescript
type CellRef =
  | { kind: 'coord'; row: number; col: number }     // specific cell
  | { kind: 'relative'; fromStep: number; direction: number } // offset from prior step
  | { kind: 'auto' };                                 // compiler picks
```

### PuzzleStep
```typescript
interface PuzzleStep {
  id: number;
  label?: string;
  targets: CellRef[];
  targetValues?: Array<0 | 1>;
  requiredClueTypes?: ClueType[];
  difficulty?: number;            // 1=easy, 2=medium, 3+=hard
  dependsOn?: number[];           // step IDs (default: previous)
  revealNoiseCells?: number;      // Layer 2
  atHoleBoundary?: boolean;       // Layer 2
}
```

### PuzzleBlueprint
```typescript
interface PuzzleBlueprint {
  id: string;
  name: string;
  width?: number;
  height?: number;
  mineDensity?: number;
  seed?: number;
  defaultDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  allowedClueTypes?: ClueType[];
  steps: PuzzleStep[];
  autoStepCount?: number;
}
```

### CompilationResult
```typescript
interface CompilationResult {
  success: boolean;
  stepReports: StepCompilationReport[];
  puzzle?: PuzzleInstance<HexMineGrid, HexMineClues, HexMineCell>;
  failedSteps?: number[];
  log: string[];
  compilationTimeMs: number;
}

interface StepCompilationReport {
  stepId: number;
  resolvedTargets: Array<{ row: number; col: number; value: 0 | 1 }>;
  clues: HexMineExplicitClue[];
  status: 'ok' | 'conflict' | 'ambiguous';
  message?: string;
}
```

## Core Algorithm: compilePuzzle()

```
Phase 0: Initialize grid (all unknown)
Phase 1: Place cascade origin + safe zone
Phase 2: Process each step:
  2a. Resolve target cells (coord/relative/auto)
  2b. Assign target values (mine/safe)
  2c. Find/create clues proving the target (via clue-factory)
  2d. Verify unique determination (with N clues: determined; N-1: ambiguous)
  2e. Propagate constraints to surrounding cells
  2f. Update revealed set (cascade if 0-cell)
Phase 3: Fill remaining unknowns at target density
Phase 4: Build solution grid from assignments
Phase 5: Build player grid (cascade from origin + pre-reveals)
Phase 6: Recompute clue values from final mine layout
Phase 7: Verify solvability with existing solver
Phase 8: Trim grid shape (remove unused cells)
Phase 9: Validate integrity
Phase 10: Return PuzzleInstance
```

## processStep() Detail

1. **Resolve targets**: 'auto' picks unassigned cell adjacent to reveal frontier
2. **Assign values**: mine or safe per target
3. **Create clues**: for each requiredClueType, find a cell position where that clue type can exist and covers the target
4. **Verify**: run solver with all accumulated clues → target must be uniquely determined
5. **Difficulty check**: remove one clue → target must become ambiguous (validates difficulty=N)
6. **Constrain neighbors**: clue equations force some surrounding cells to specific values
7. **Update reveals**: safe targets become revealed; 0-cells cascade

## findOrCreateClue() Per Type

| Type | Strategy |
|------|----------|
| adjacent | Find revealed neighbor of target, create count clue |
| adjacent-contiguous | Same + constrain mine arrangement in 6-neighbor ring |
| adjacent-nonContiguous | Same + ensure mines have gaps in ring |
| line | Find edge cell whose ray passes through target, disable origin |
| range | Find interior cell whose radius-2 covers target |
| edge-header | Find row/col containing target |
| cascade | Ensure 0-cell adjacent to frontier |
| pre-revealed | Add target to initial reveal set |

## Existing Code Reuse

### Functions to export from solve.ts
- `buildConstraints`, `buildExplicitConstraints`, `propagate`
- `backtrackDeductions`, `hasContradiction`, `simulateReveals`
- `CellState` type, `Constraint` interface

### Functions to export from generate.ts
- `simulateCascade`, `checkCircularContiguity`, `shuffle`, `createSolution`

### Functions used directly
- All hex.ts utilities (neighbors, line, range, distance, coordKey)
- validatePuzzleIntegrity from validate.ts
- createSeededRandom from seededRandom.ts
- solveFromRevealed from solve.ts

## Testing

### Unit tests (Vitest)
```
src/puzzles/hexmine/compiler/__tests__/compile.test.ts
```

1. Single-step blueprint compiles
2. 3-step multi-clue-type blueprint
3. Conflict detection (contradictory steps)
4. Compiled puzzle solvable by existing solver
5. Same seed = identical puzzle
6. Integrity validation passes
7. Full-auto mode generates correct step count
8. Difficulty validation: N clues needed, N-1 insufficient

### E2E tests
- Load compiled puzzle via level pack
- Play through and verify win condition
- Verify all clue types render correctly

## Implementation Order

1. `compiler/types.ts` — all type definitions
2. Export internals from solve.ts + generate.ts (add `export` to ~12 functions)
3. `compiler/verify.ts` — unique determination check using existing solver
4. `compiler/clue-factory.ts` — findOrCreateClue for 6 core types
5. `compiler/compile.ts` — full compilePuzzle() with all 10 phases
6. `compiler/index.ts` — barrel export
7. Install Vitest, write unit tests
8. Integration: add compiled levels to level packs
9. E2E tests for compiled puzzles
