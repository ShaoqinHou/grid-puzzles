import type { Difficulty } from '@/types';

export const STORAGE_KEYS = {
  PREFS: 'grid-puzzles:prefs',
  GAME: 'grid-puzzles:game',
  STATS: 'grid-puzzles:stats',
} as const;

export const generateId = (): string => crypto.randomUUID();

export const DEFAULT_SIZES: Record<Difficulty, { width: number; height: number }> = {
  easy: { width: 5, height: 5 },
  medium: { width: 10, height: 10 },
  hard: { width: 15, height: 15 },
  expert: { width: 20, height: 20 },
};
