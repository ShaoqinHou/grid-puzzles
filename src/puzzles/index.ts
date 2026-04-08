import type { PuzzleDefinition } from '@/engine/puzzleTypes';
import { nonogramDefinition } from './nonogram';
import { hexmineDefinition } from './hexmine';

/**
 * Master list of all registered puzzle definitions.
 * Add new puzzle types here — they will automatically appear in the registry.
 */
export const ALL_PUZZLE_DEFINITIONS: readonly PuzzleDefinition[] = [
  nonogramDefinition as PuzzleDefinition,
  hexmineDefinition as PuzzleDefinition,
];
