import type { Difficulty } from '@/types';
import { loadFromStorage, saveToStorage } from '@/services/storage';
import type { PuzzleBlueprint } from './compiler/compilerTypes';

const PROGRESS_KEY = 'grid-puzzles:hexmine-progress';

export interface LevelDef {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly difficulty: Difficulty;
  /** Optional config overrides for this level */
  readonly config?: Partial<{
    minAdjacentClues: number;
    minLineClues: number;
    minRangeClues: number;
    minQuestionMarks: number;
    minEdgeHeaders: number;
    loseOnWrongFlag: boolean;
  }>;
  /** Optional compiled blueprint — overrides seed-based generation */
  readonly blueprint?: PuzzleBlueprint;
}

export interface LevelPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly levels: readonly LevelDef[];
}

export interface LevelProgress {
  readonly completed: boolean;
  readonly bestTimeMs: number | null;
}

/** All level packs */
export const LEVEL_PACKS: readonly LevelPack[] = [
  {
    id: 'intro',
    name: 'Introduction',
    description: 'Learn the basics of hex minesweeper',
    levels: [
      { id: 'intro-1', name: 'First Steps', seed: 1001, difficulty: 'easy' },
      { id: 'intro-2', name: 'Cascade', seed: 1002, difficulty: 'easy' },
      { id: 'intro-3', name: 'Flagging', seed: 1003, difficulty: 'easy' },
      { id: 'intro-4', name: 'Deduction', seed: 1004, difficulty: 'easy' },
      { id: 'intro-5', name: 'Graduation', seed: 1005, difficulty: 'easy' },
    ],
  },
  {
    id: 'clue-types',
    name: 'Clue Types',
    description: 'One new clue type per level',
    levels: [
      {
        id: 'ct-1', name: 'Contiguous {N}', seed: 2001, difficulty: 'medium',
        config: { minAdjacentClues: 4, minLineClues: 0, minRangeClues: 0, minQuestionMarks: 0, minEdgeHeaders: 0 },
      },
      {
        id: 'ct-2', name: 'Non-Contiguous -N-', seed: 2002, difficulty: 'medium',
        config: { minAdjacentClues: 4, minLineClues: 0, minRangeClues: 0, minQuestionMarks: 0, minEdgeHeaders: 0 },
      },
      {
        id: 'ct-3', name: 'Line Clues', seed: 2003, difficulty: 'hard',
        config: { minAdjacentClues: 0, minLineClues: 3, minRangeClues: 0, minQuestionMarks: 0, minEdgeHeaders: 0 },
      },
      {
        id: 'ct-4', name: 'Edge Headers', seed: 2004, difficulty: 'hard',
        config: { minAdjacentClues: 0, minLineClues: 0, minRangeClues: 0, minQuestionMarks: 0, minEdgeHeaders: 4 },
      },
      {
        id: 'ct-5', name: 'Range Clues', seed: 2005, difficulty: 'expert',
        config: { minAdjacentClues: 0, minLineClues: 0, minRangeClues: 3, minQuestionMarks: 0, minEdgeHeaders: 0 },
      },
      {
        id: 'ct-6', name: 'Question Marks', seed: 2006, difficulty: 'hard',
        config: { minAdjacentClues: 3, minLineClues: 0, minRangeClues: 0, minQuestionMarks: 3, minEdgeHeaders: 0 },
      },
    ],
  },
  {
    id: 'challenge',
    name: 'Challenge',
    description: 'All clue types, increasing difficulty',
    levels: [
      { id: 'ch-1', name: 'Warm Up', seed: 3001, difficulty: 'medium' },
      { id: 'ch-2', name: 'Getting Harder', seed: 3002, difficulty: 'medium' },
      { id: 'ch-3', name: 'Think Twice', seed: 3003, difficulty: 'hard' },
      { id: 'ch-4', name: 'No Mercy', seed: 3004, difficulty: 'hard' },
      { id: 'ch-5', name: 'Expert I', seed: 3005, difficulty: 'expert' },
      { id: 'ch-6', name: 'Expert II', seed: 3006, difficulty: 'expert' },
      { id: 'ch-7', name: 'Master', seed: 3007, difficulty: 'expert' },
      { id: 'ch-8', name: 'Grand Master', seed: 3008, difficulty: 'expert' },
    ],
  },
  {
    id: 'compiled',
    name: 'Crafted Puzzles',
    description: 'Backwards-generated with designed solving paths',
    levels: [
      {
        id: 'comp-1', name: 'Simple Path', seed: 4001, difficulty: 'easy',
        blueprint: {
          id: 'comp-1', name: 'Simple Path', width: 8, height: 8,
          mineDensity: 0.15, seed: 4001,
          steps: [
            { id: 0, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            { id: 1, target: { kind: 'auto' }, targetValue: 0,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            { id: 2, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
          ],
        },
      },
      {
        id: 'comp-2', name: 'Line Logic', seed: 4002, difficulty: 'medium',
        blueprint: {
          id: 'comp-2', name: 'Line Logic', width: 10, height: 10,
          mineDensity: 0.16, seed: 4002,
          steps: [
            { id: 0, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'line' }] },
            { id: 1, target: { kind: 'auto' }, targetValue: 0,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            { id: 2, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent', special: 'contiguous' }] },
            { id: 3, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
          ],
        },
      },
      {
        id: 'comp-3', name: 'Mixed Mastery', seed: 4003, difficulty: 'hard',
        blueprint: {
          id: 'comp-3', name: 'Mixed Mastery', width: 10, height: 10,
          mineDensity: 0.18, seed: 4003,
          steps: [
            { id: 0, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            { id: 1, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'line' }] },
            { id: 2, target: { kind: 'auto' }, targetValue: 0,
              requiredStrategies: [{ kind: 'clue', type: 'range' }] },
            { id: 3, target: { kind: 'auto' }, targetValue: 1,
              requiredStrategies: [{ kind: 'clue', type: 'edge-header' }] },
            { id: 4, target: { kind: 'auto' }, targetValue: 0,
              requiredStrategies: [{ kind: 'clue', type: 'adjacent', special: 'nonContiguous' }] },
          ],
        },
      },
      {
        id: 'comp-4', name: 'Full Auto 15', seed: 4004, difficulty: 'hard',
        blueprint: {
          id: 'comp-4', name: 'Full Auto 15', width: 12, height: 12,
          mineDensity: 0.18, seed: 4004,
          steps: [],
          autoStepCount: 15,
          defaultDifficulty: 'hard',
        },
      },
      {
        id: 'comp-5', name: 'Full Auto 20', seed: 4005, difficulty: 'expert',
        blueprint: {
          id: 'comp-5', name: 'Full Auto 20', width: 14, height: 14,
          mineDensity: 0.20, seed: 4005,
          steps: [],
          autoStepCount: 20,
          defaultDifficulty: 'expert',
        },
      },
    ],
  },
];

/** Load progress for all levels */
export function loadProgress(): Record<string, LevelProgress> {
  return loadFromStorage<Record<string, LevelProgress>>(PROGRESS_KEY) ?? {};
}

/** Save progress for a single level */
export function saveProgress(levelId: string, timeMs: number): void {
  const progress = loadProgress();
  const existing = progress[levelId];
  progress[levelId] = {
    completed: true,
    bestTimeMs: existing?.bestTimeMs !== null && existing?.bestTimeMs !== undefined
      ? Math.min(existing.bestTimeMs, timeMs)
      : timeMs,
  };
  saveToStorage(PROGRESS_KEY, progress);
}

/** Count completed levels in a pack */
export function packCompletionCount(pack: LevelPack, progress: Record<string, LevelProgress>): number {
  return pack.levels.filter((l) => progress[l.id]?.completed).length;
}
