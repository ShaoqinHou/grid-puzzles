import type { CellRendererProps } from '@/engine/puzzleTypes';
import type { NonogramCell } from './types';

export const NonogramCellRenderer = ({
  value,
  size,
  isError,
  isHinted,
  isActive,
}: CellRendererProps<NonogramCell>) => {
  if (!isActive) {
    return (
      <div
        className="bg-cell-blocked"
        style={{ width: size, height: size }}
      />
    );
  }

  const ringClass = isError
    ? 'ring-2 ring-error ring-inset'
    : isHinted
      ? 'ring-2 ring-warning ring-inset'
      : '';

  if (value === 'filled') {
    return (
      <div
        className={`bg-cell-filled ${ringClass}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (value === 'marked') {
    const pad = Math.max(size * 0.2, 2);
    return (
      <div
        className={`flex items-center justify-center ${ringClass}`}
        style={{ width: size, height: size }}
      >
        <svg
          width={size - pad * 2}
          height={size - pad * 2}
          viewBox="0 0 10 10"
          className="text-cell-marked"
        >
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // empty
  return (
    <div
      className={ringClass}
      style={{ width: size, height: size }}
    />
  );
};
