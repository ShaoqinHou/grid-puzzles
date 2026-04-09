import type { HexMineExplicitClue, ClueSpecial } from '../types';

/** How a step specifies which clue mechanism to use */
export type StepStrategy =
  | { readonly kind: 'clue'; readonly type: HexMineExplicitClue['type']; readonly special?: ClueSpecial }
  | { readonly kind: 'cascade' }
  | { readonly kind: 'pre-revealed' };

/** How a step references its target cell */
export type CellTarget =
  | { readonly kind: 'coord'; readonly row: number; readonly col: number }
  | { readonly kind: 'auto' };

/** A single deduction step in the compiled puzzle's solving path */
export interface PuzzleStep {
  /** Step index (0-based) */
  readonly id: number;
  /** Debug label */
  readonly label?: string;
  /** Target cell — specific coord or auto-picked from frontier */
  readonly target: CellTarget;
  /** What the target cell should be (0=safe, 1=mine). undefined = compiler picks */
  readonly targetValue?: 0 | 1;
  /** Which clue mechanisms prove this target — ALL are created for this step.
   *  Multiple clues = player must combine all to deduce the target.
   *  undefined = compiler picks one appropriate clue. */
  readonly requiredStrategies?: readonly StepStrategy[];
}

/** Blueprint for compiling a puzzle */
export interface PuzzleBlueprint {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly mineDensity: number;
  readonly seed: number;
  /** Explicit steps. If empty, use autoStepCount. */
  readonly steps: readonly PuzzleStep[];
  /** Auto-generate this many steps if steps is empty */
  readonly autoStepCount?: number;
  /** Default difficulty for auto-generated steps */
  readonly defaultDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  /** Allowed clue types for auto mode */
  readonly allowedStrategies?: readonly StepStrategy[];
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
