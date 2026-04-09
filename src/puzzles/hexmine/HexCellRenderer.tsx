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
  readonly isScopeHighlight?: boolean;
  readonly isPathTarget?: boolean;
  readonly scopeColors?: string[];
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
  isScopeHighlight,
  isPathTarget,
  scopeColors,
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
    // Render line clue: number + direction arrow
    if (clueInfo) {
      const text = formatClueText(clueInfo.mineCount, clueInfo.special, clueInfo.type);
      // Compute pixel direction from axial direction vectors
      // AXIAL_DIRECTIONS: 0=E(1,0), 1=NE(1,-1), 2=NW(0,-1), 3=W(-1,0), 4=SW(-1,1), 5=SE(0,1)
      const axialDirs: Array<[number, number]> = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
      const [dq, dr] = clueInfo.direction !== undefined ? (axialDirs[clueInfo.direction] ?? [1, 0]) : [1, 0];
      // Axial to pixel: dx = sqrt(3)*dq + sqrt(3)/2*dr, dy = 1.5*dr
      const dx = Math.sqrt(3) * dq + (Math.sqrt(3) / 2) * dr;
      const dy = 1.5 * dr;
      const dirRad = Math.atan2(dy, dx);
      const arrowLen = size * 0.9;
      const ax = cx + Math.cos(dirRad) * arrowLen;
      const ay = cy + Math.sin(dirRad) * arrowLen;
      // Arrow head
      const headLen = size * 0.25;
      const headAngle1 = dirRad + 2.5;
      const headAngle2 = dirRad - 2.5;
      const hx1 = ax + Math.cos(headAngle1) * headLen;
      const hy1 = ay + Math.sin(headAngle1) * headLen;
      const hx2 = ax + Math.cos(headAngle2) * headLen;
      const hy2 = ay + Math.sin(headAngle2) * headLen;
      // Offset text away from the arrow
      const textOffsetX = cx - Math.cos(dirRad) * size * 0.3;
      const textOffsetY = cy - Math.sin(dirRad) * size * 0.3;
      content = (
        <>
          {/* Direction arrow — solid, visible */}
          <line
            x1={cx + Math.cos(dirRad) * size * 0.2} y1={cy + Math.sin(dirRad) * size * 0.2}
            x2={ax} y2={ay}
            stroke="var(--color-hex-clue-line)"
            strokeWidth={2}
            opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
          {/* Arrowhead */}
          <polygon
            points={`${ax},${ay} ${hx1},${hy1} ${hx2},${hy2}`}
            fill="var(--color-hex-clue-line)"
            opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
          {/* Number */}
          <text
            x={textOffsetX}
            y={textOffsetY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize * 0.65}
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="var(--color-hex-clue-line)"
            style={{ pointerEvents: 'none' }}
          >
            {text}
          </text>
        </>
      );
    }
  } else if (cell === 0) {
    fill = 'var(--color-hex-revealed-0)';
    // Check if this 0-cell has a range or special clue to display
    if (clueInfo?.type === 'range') {
      const text = formatClueText(clueInfo.mineCount, 'none', 'range');
      fill = 'var(--color-bg-tertiary)';
      stroke = 'var(--color-hex-clue-range)';
      strokeWidth = 2;
      content = (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize * 0.8} fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill="var(--color-hex-clue-range)"
          style={{ pointerEvents: 'none' }}>
          {text}
        </text>
      );
    } else if (clueInfo && clueInfo.special !== 'none') {
      const text = formatClueText(0, clueInfo.special, clueInfo.type);
      const color = getClueColor(clueInfo.type, clueInfo.special);
      stroke = color;
      strokeWidth = 2;
      content = (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize * 0.8} fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={color} style={{ pointerEvents: 'none' }}>
          {text}
        </text>
      );
    }
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
    // Special adjacent clues: {N} or -N- with distinct colored ring
    } else if (clueInfo && clueInfo.special !== 'none') {
      const text = formatClueText(numCell, clueInfo.special, clueInfo.type);
      const color = getClueColor(clueInfo.type, clueInfo.special, NUM_COLORS[numCell]);
      // Colored inner ring to distinguish from plain numbers
      stroke = color;
      strokeWidth = 2;
      content = (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 0.8}
          fontWeight="bold"
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={color}
          style={{ pointerEvents: 'none' }}
        >
          {text}
        </text>
      );
    // Range clue: (N) with cyan ring and distinct background
    } else if (clueInfo?.type === 'range') {
      const text = formatClueText(clueInfo.mineCount, 'none', 'range');
      fill = 'var(--color-bg-tertiary)'; // slightly different background
      stroke = 'var(--color-hex-clue-range)';
      strokeWidth = 2;
      content = (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 0.8}
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

  // Persistent scope indicators: small colored dots showing which clue scopes include this cell
  const scopeIndicators = scopeColors && scopeColors.length > 0 && cell !== 'disabled';

  if (isScopeHighlight) {
    stroke = 'var(--color-accent)';
    strokeWidth = 2;
  }

  if (isPathTarget) {
    stroke = 'var(--color-warning)';
    strokeWidth = 3;
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
      {/* Persistent scope color indicators */}
      {scopeIndicators && scopeColors!.map((color, i) => {
        const angle = (-90 + i * (360 / Math.max(scopeColors!.length, 2))) * (Math.PI / 180);
        const dotR = size * 0.65;
        const dx = cx + Math.cos(angle) * dotR;
        const dy = cy + Math.sin(angle) * dotR;
        return (
          <circle key={`scope-${i}`}
            cx={dx} cy={dy} r={size * 0.12}
            fill={color} opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
      {/* Cells in multiple scopes get a double-ring to show intersection */}
      {scopeColors && scopeColors.length >= 2 && cell !== 'disabled' && (
        <polygon points={points} fill="none"
          stroke="var(--color-warning)" strokeWidth={2.5}
          strokeDasharray="4,3" opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      )}
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
