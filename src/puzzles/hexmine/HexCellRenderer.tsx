import type { HexMineCell } from './types';

/** Classic minesweeper number colors (dark-theme adapted) */
const NUM_COLORS: Record<number, string> = {
  1: 'var(--color-hex-num-1)',
  2: 'var(--color-hex-num-2)',
  3: 'var(--color-hex-num-3)',
  4: 'var(--color-hex-num-4)',
  5: 'var(--color-hex-num-5)',
  6: 'var(--color-hex-num-6)',
};

export interface HexCellProps {
  readonly cell: HexMineCell;
  readonly points: string;
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  readonly isHover: boolean;
  readonly isHinted: boolean;
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly onContextMenu: (e: React.MouseEvent) => void;
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
}

export function HexCellRenderer({
  cell,
  points,
  cx,
  cy,
  size,
  isHover,
  isHinted,
  onMouseDown,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: HexCellProps) {
  const fontSize = size * 0.7;
  const iconSize = size * 0.55;

  let fill: string;
  let stroke = 'var(--color-grid-line)';
  let strokeWidth = 1;
  let content: React.ReactNode = null;

  if (cell === 'hidden') {
    fill = isHover ? 'var(--color-hex-hidden-hover)' : 'var(--color-hex-hidden)';
  } else if (cell === 'flagged') {
    fill = isHover ? 'var(--color-hex-hidden-hover)' : 'var(--color-hex-hidden)';
    content = (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={iconSize}
        fill="var(--color-hex-flagged)"
        style={{ pointerEvents: 'none' }}
      >
        ⚑
      </text>
    );
  } else if (cell === 'mine') {
    fill = 'var(--color-hex-mine)';
    content = (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={iconSize}
        fill="var(--color-text-primary)"
        style={{ pointerEvents: 'none' }}
      >
        ✦
      </text>
    );
  } else if (cell === 'exploded') {
    fill = 'var(--color-hex-mine-exploded)';
    content = (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={iconSize}
        fill="var(--color-text-primary)"
        style={{ pointerEvents: 'none' }}
      >
        ✦
      </text>
    );
  } else if (cell === 0) {
    fill = 'var(--color-hex-revealed-0)';
  } else {
    // Number 1-6
    fill = 'var(--color-hex-revealed)';
    content = (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill={NUM_COLORS[cell] ?? 'var(--color-text-primary)'}
        style={{ pointerEvents: 'none' }}
      >
        {cell}
      </text>
    );
  }

  if (isHinted) {
    stroke = 'var(--color-warning)';
    strokeWidth = 2.5;
  }

  return (
    <g
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: cell === 'hidden' || cell === 'flagged' ? 'pointer' : 'default' }}
    >
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {content}
    </g>
  );
}
