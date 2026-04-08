import type { ClueRendererProps } from '@/engine/puzzleTypes';
import type { NonogramClues } from './types';

export const NonogramClueRenderer = ({
  clues,
  orientation,
  index,
  satisfied,
}: ClueRendererProps<NonogramClues>) => {
  const lineClues = orientation === 'row' ? clues.rows[index] : clues.cols[index];

  const baseClass = satisfied ? 'line-through opacity-40' : '';

  if (orientation === 'row') {
    // Row clues: horizontal, right-aligned
    return (
      <div className={`flex items-center justify-end gap-0.5 ${baseClass}`}>
        {lineClues.map((n, i) => {
          // Bold separator every 5 clue values
          const showSep = i > 0 && i % 5 === 0;
          return (
            <span key={i} className={`text-xs tabular-nums ${showSep ? 'font-bold ml-1' : ''}`}>
              {n}
            </span>
          );
        })}
      </div>
    );
  }

  // Column clues: vertical, bottom-aligned
  return (
    <div className={`flex flex-col items-center justify-end gap-0.5 ${baseClass}`}>
      {lineClues.map((n, i) => {
        const showSep = i > 0 && i % 5 === 0;
        return (
          <span key={i} className={`text-xs tabular-nums ${showSep ? 'font-bold mt-1' : ''}`}>
            {n}
          </span>
        );
      })}
    </div>
  );
};
