import { useRef, useCallback } from 'react';
import type { HexMineCell, ClueSpecial } from './types';

/** Classic minesweeper number colors (dark-theme adapted) */
const NUM_COLORS: Record<number, string> = {
  1: 'var(--color-hex-num-1)',
  2: 'var(--color-hex-num-2)',
  3: 'var(--color-hex-num-3)',
  4: 'var(--color-hex-num-4)',
  5: 'var(--color-hex-num-5)',
  6: 'var(--color-hex-num-6)',
};

/** Direction-to-rotation mapping for line clue text (degrees) */
const LINE_ROTATIONS: Record<number, number> = {
  0: 0,     // E
  1: -60,   // NE
  2: -90,   // NW (vertical)
  3: 180,   // W
  4: 120,   // SW
  5: 90,    // SE (vertical)
};

/** Format clue text with special condition markers */
function formatClueText(count: number, special: ClueSpecial, type: string): string {
  if (type === 'range') return `(${count})`;
  if (special === 'contiguous') return `{${count}}`;
  if (special === 'nonContiguous') return `-${count}-`;
  return `${count}`;
}

/** Get text color for clue based on type and special */
function getClueColor(type: string, special: ClueSpecial, numColor?: string): string {
  if (type === 'line') return 'var(--color-hex-clue-line)';
  if (type === 'range') return 'var(--color-hex-clue-range)';
  if (special === 'contiguous') return 'var(--color-hex-bracket-contiguous)';
  if (special === 'nonContiguous') return 'var(--color-hex-bracket-noncontiguous)';
  return numColor ?? 'var(--color-text-primary)';
}

export interface ClueDisplayInfo {
  readonly type: 'adjacent' | 'line' | 'range' | 'edge-header';
  readonly special: ClueSpecial;
  readonly mineCount: number;
  readonly direction?: number;
}

export interface HexCellProps {
  readonly cell: HexMineCell;
  readonly points: string;
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  readonly isHover: boolean;
  readonly isHinted: boolean;
  readonly clueInfo?: ClueDisplayInfo;
  readonly isQuestionMark?: boolean;
  readonly onMouseDown: (e: React.MouseEvent) => void;
  readonly onContextMenu: (e: React.MouseEvent) => void;
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
  readonly onTap?: () => void;
  readonly onLongPress?: () => void;
}

export function HexCellRenderer({
  cell,
  points,
  cx,
  cy,
  size,
  isHover,
  isHinted,
  clueInfo,
  isQuestionMark,
  onMouseDown,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  onTap,
  onLongPress,
}: HexCellProps) {
  const fontSize = size * 0.7;

  // Touch: long-press detection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback(() => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      onLongPress?.();
    }, 500);
  }, [onLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      if (!touchMoved.current) onTap?.();
    }
  }, [onTap]);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);
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
        style={{ pointerEvents: 'none', animation: 'hexFlagBounce 0.25s ease-out' }}
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
  } else if (cell === 'disabled') {
    fill = 'var(--color-hex-disabled)';
    stroke = 'var(--color-hex-disabled-stroke)';
    // Render line clue text if clue info exists
    if (clueInfo) {
      const text = formatClueText(clueInfo.mineCount, clueInfo.special, clueInfo.type);
      const rotation = clueInfo.direction !== undefined
        ? LINE_ROTATIONS[clueInfo.direction] ?? 0
        : 0;
      content = (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 0.75}
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="var(--color-hex-clue-line)"
          transform={`rotate(${rotation}, ${cx}, ${cy})`}
          style={{ pointerEvents: 'none' }}
        >
          {text}
        </text>
      );
    }
  } else if (cell === 0) {
    fill = 'var(--color-hex-revealed-0)';
  } else {
    // Number 1-6
    fill = 'var(--color-hex-revealed)';
    const numCell = cell as number;

    // Question mark — show ? instead of number
    if (isQuestionMark) {
      content = (
        <text
          x={cx} y={cy}
          textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fontWeight="bold"
          fill="var(--color-text-tertiary)"
          style={{ pointerEvents: 'none' }}
        >
          ?
        </text>
      );
    // Check if this cell has a clue annotation (adjacent with special, or range)
    } else if (clueInfo && clueInfo.special !== 'none') {
      const text = formatClueText(numCell, clueInfo.special, clueInfo.type);
      const color = getClueColor(clueInfo.type, clueInfo.special, NUM_COLORS[numCell]);
      content = (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 0.65}
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={color}
          style={{ pointerEvents: 'none' }}
        >
          {text}
        </text>
      );
    } else if (clueInfo?.type === 'range') {
      const text = formatClueText(clueInfo.mineCount, 'none', 'range');
      content = (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 0.65}
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="var(--color-hex-clue-range)"
          style={{ pointerEvents: 'none' }}
        >
          {text}
        </text>
      );
    } else {
      content = (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={NUM_COLORS[numCell] ?? 'var(--color-text-primary)'}
          style={{ pointerEvents: 'none' }}
        >
          {numCell}
        </text>
      );
    }
  }

  if (isHinted) {
    stroke = 'var(--color-warning)';
    strokeWidth = 2.5;
  }

  // Determine if this cell was recently revealed (for animation)
  const isRevealed = typeof cell === 'number' || cell === 'mine' || cell === 'exploded';
  const isInteractive = cell === 'hidden' || cell === 'flagged';

  return (
    <g
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      style={{
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'opacity 0.15s ease-out',
      }}
    >
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{
          transition: 'fill 0.2s ease-out, stroke 0.15s ease-out, stroke-width 0.15s ease-out',
          filter: isHover && isInteractive ? 'brightness(1.15)' : undefined,
        }}
      />
      {isRevealed && content && (
        <g style={{ animation: 'hexReveal 0.25s ease-out' }}>
          {content}
        </g>
      )}
      {!isRevealed && content}
      {cell === 'exploded' && (
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.8}
          fill="none"
          stroke="var(--color-hex-mine-exploded)"
          strokeWidth={1.5}
          opacity={0.6}
          style={{ animation: 'hexShockwave 0.4s ease-out forwards' }}
        />
      )}
    </g>
  );
}
