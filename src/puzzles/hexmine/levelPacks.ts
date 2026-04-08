import type { Difficulty } from '@/types';
import { loadFromStorage, saveToStorage } from '@/services/storage';

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
