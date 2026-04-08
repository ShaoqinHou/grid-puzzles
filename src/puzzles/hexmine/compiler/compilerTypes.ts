import type { Difficulty } from '@/types';
import type { HexMineExplicitClue, ClueSpecial } from '../types';

/** How a step specifies which clue mechanism to use */
export type StepStrategy =
  | { readonly kind: 'clue'; readonly type: HexMineExplicitClue['type']; readonly special?: ClueSpecial }
  | { readonly kind: 'cascade' }
  | { readonly kind: 'pre-revealed' };

/** A single deduction step in the compiled puzzle's solving path */
export interface PuzzleStep {
  /** Step index (0-based) */
  readonly id: number;
  /** Debug label */
  readonly label?: string;
  /** Target cell coordinate */
  readonly target: { readonly row: number; readonly col: number };
  /** What the target cell should be (0=safe, 1=mine) */
  readonly targetValue: 0 | 1;
  /** Which clue mechanism proves this target */
  readonly requiredStrategy: StepStrategy;
}

/** Blueprint for compiling a puzzle */
export interface PuzzleBlueprint {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly mineDensity: number;
  readonly seed: number;
  readonly steps: readonly PuzzleStep[];
}

/** Error thrown when compilation fails */
export class CompilationError extends Error {
  constructor(
    message: string,
    readonly failedStepId: number | null,
    readonly log: readonly string[],
  ) {
    super(message);
    this.name = 'CompilationError';
  }
}
